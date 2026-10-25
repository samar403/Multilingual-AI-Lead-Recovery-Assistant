import { Router, type Request } from "express";
import type { Ctx } from "../services/context.js";
import { ah } from "./middleware.js";
import { getTenantByKey, HttpError, hydrateTenant } from "../services/store.js";
import { handleFormLead, handleInbound, handleMissedCall } from "../services/conversation.js";
import { verifyMetaSignature, verifyTwilioSignature } from "../channels/providers.js";
import { normalizePhone } from "../lib/util.js";
import { config } from "../config.js";
import type { Tenant } from "../types.js";

const MISSED_STATUSES = new Set(["no-answer", "busy", "failed", "canceled", "cancelled", "missed", "call-attempt", "incomplete"]);

export function webhookRouter(ctx: Ctx): Router {
  const r = Router();

  const tenantByKey = (key: string | undefined): Tenant => {
    const tenant = key ? getTenantByKey(ctx, key) : undefined;
    if (!tenant) throw new HttpError(404, "Unknown webhook key");
    return tenant;
  };

  /** WhatsApp is one app-level URL; route by the receiving phone_number_id. */
  const tenantForWaNumber = (phoneNumberId: string): { tenant: Tenant; appSecret: string } | undefined => {
    const rows = ctx.db.all<{ tenant_id: string; config: string }>("SELECT tenant_id, config FROM integrations WHERE provider = 'whatsapp' AND status = 'connected'");
    for (const row of rows) {
      const cfg = JSON.parse(row.config) as { phoneNumberId?: string; appSecret?: string };
      if (cfg.phoneNumberId === phoneNumberId) {
        const t = ctx.db.get<Parameters<typeof hydrateTenant>[0]>("SELECT * FROM tenants WHERE id = ?", row.tenant_id);
        if (t) return { tenant: hydrateTenant(t), appSecret: cfg.appSecret ?? config.whatsapp.appSecret };
      }
    }
    if (phoneNumberId === config.whatsapp.phoneNumberId) {
      const defaultId = process.env.DEFAULT_TENANT_ID;
      const t = defaultId
        ? ctx.db.get<Parameters<typeof hydrateTenant>[0]>("SELECT * FROM tenants WHERE id = ?", defaultId)
        : ctx.db.get<Parameters<typeof hydrateTenant>[0]>("SELECT * FROM tenants ORDER BY created_at LIMIT 1");
      if (t) return { tenant: hydrateTenant(t), appSecret: config.whatsapp.appSecret };
    }
    return undefined;
  };

  // ---------------------------------------------------------------- WhatsApp Cloud API
  r.get("/whatsapp", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = String(req.query["hub.verify_token"] ?? "");
    const tenantTokens = ctx.db
      .all<{ config: string }>("SELECT config FROM integrations WHERE provider = 'whatsapp'")
      .map((r2) => (JSON.parse(r2.config) as { verifyToken?: string }).verifyToken)
      .filter(Boolean);
    if (mode === "subscribe" && (token === config.whatsapp.verifyToken || tenantTokens.includes(token))) {
      return res.status(200).send(String(req.query["hub.challenge"] ?? ""));
    }
    res.sendStatus(403);
  });

  r.post("/whatsapp", ah(async (req, res) => {
    const body = req.body as WaWebhook;
    const jobs: (() => Promise<unknown>)[] = [];
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {};
        const route = value.metadata?.phone_number_id ? tenantForWaNumber(value.metadata.phone_number_id) : undefined;
        if (!route) continue;
        if (!verifyMetaSignature(req.rawBody ?? Buffer.from(""), req.header("x-hub-signature-256"), route.appSecret)) {
          return res.sendStatus(401);
        }
        const names = new Map((value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));
        for (const m of value.messages ?? []) {
          const text = waText(m);
          if (!text) continue;
          jobs.push(() => handleInbound(ctx, route.tenant, { phone: normalizePhone(m.from), text, channel: "whatsapp", providerId: m.id, name: names.get(m.from) ?? undefined }));
        }
        for (const s of value.statuses ?? []) {
          ctx.db.run("UPDATE messages SET status = ? WHERE provider_id = ? AND tenant_id = ?", s.status, s.id, route.tenant.id);
          ctx.bus.publish(route.tenant.id, "message_status", { providerId: s.id, status: s.status });
        }
      }
    }
    res.sendStatus(200); // acknowledge fast; Meta retries slow webhooks
    for (const job of jobs) await job().catch((e) => console.error("[whatsapp] inbound failed", e));
  }));

  // ---------------------------------------------------------------- Exotel (Passthru applet / status callback)
  const exotel = ah(async (req, res) => {
    const tenant = tenantByKey(req.params.key);
    const p = { ...req.query, ...(req.body ?? {}) } as Record<string, string>;
    const status = (p.DialCallStatus ?? p.CallStatus ?? p.Status ?? "").toLowerCase();
    const from = p.CallFrom ?? p.From;
    if (from && (MISSED_STATUSES.has(status) || p.CallType === "call-attempt")) {
      await handleMissedCall(ctx, tenant, { phone: normalizePhone(from), provider: "exotel", providerId: p.CallSid });
      return res.status(200).json({ ok: true, missed: true });
    }
    res.status(200).json({ ok: true, missed: false });
  });
  r.get("/exotel/:key", exotel);
  r.post("/exotel/:key", exotel);

  // ---------------------------------------------------------------- Twilio
  const twilioUrl = (req: Request) => `${config.publicUrl.replace(/\/$/, "")}${req.originalUrl}`;
  const twilioToken = (tenant: Tenant) => {
    const cfg = ctx.channels.integration(tenant.id, "voice");
    return (typeof cfg.authToken === "string" && cfg.authToken) || config.twilio.authToken;
  };

  r.post("/twilio/voice/:key", ah(async (req, res) => {
    const tenant = tenantByKey(req.params.key);
    const params = (req.body ?? {}) as Record<string, string>;
    if (!verifyTwilioSignature(twilioUrl(req), params, req.header("x-twilio-signature"), twilioToken(tenant))) return res.sendStatus(401);
    const status = (params.DialCallStatus ?? params.CallStatus ?? "").toLowerCase();
    if (params.From && MISSED_STATUSES.has(status)) await handleMissedCall(ctx, tenant, { phone: normalizePhone(params.From), provider: "twilio", providerId: params.CallSid });
    res.type("text/xml").send("<Response/>");
  }));

  r.post("/twilio/sms/:key", ah(async (req, res) => {
    const tenant = tenantByKey(req.params.key);
    const params = (req.body ?? {}) as Record<string, string>;
    if (!verifyTwilioSignature(twilioUrl(req), params, req.header("x-twilio-signature"), twilioToken(tenant))) return res.sendStatus(401);
    if (params.From && params.Body) await handleInbound(ctx, tenant, { phone: normalizePhone(params.From), text: params.Body, channel: "sms", providerId: params.MessageSid });
    res.type("text/xml").send("<Response/>");
  }));

  // ---------------------------------------------------------------- Lead sources (website, IndiaMART, JustDial, portals)
  r.post("/leads/:key", ah(async (req, res) => {
    const tenant = tenantByKey(req.params.key);
    const source = String(req.query.source ?? req.body?.source ?? "website");
    const lead = mapLeadPayload(source, req.body ?? {});
    if (!lead.phone) throw new HttpError(400, "Lead payload has no phone number");
    const out = await handleFormLead(ctx, tenant, { ...lead, phone: normalizePhone(lead.phone), source });
    res.status(200).json({ ok: true, leadId: out.lead.id, reply: out.outcome?.status ?? "none" });
  }));

  return r;
}

/** Normalises the payload shapes of common Indian lead sources. */
export function mapLeadPayload(source: string, body: Record<string, any>): { phone: string; name?: string; message?: string } {
  if (source === "indiamart") {
    const r = body.RESPONSE ?? body;
    return {
      phone: r.SENDER_MOBILE ?? r.SENDER_MOBILE_ALT ?? "",
      name: r.SENDER_NAME,
      message: [r.QUERY_PRODUCT_NAME, r.QUERY_MESSAGE, r.SENDER_CITY].filter(Boolean).join(" — "),
    };
  }
  if (source === "justdial") {
    return {
      phone: body.mobile ?? body.phone ?? "",
      name: body.name,
      message: [body.category, body.area, body.city].filter(Boolean).join(", "),
    };
  }
  return {
    phone: body.phone ?? body.mobile ?? body.phone_number ?? "",
    name: body.name ?? body.full_name,
    message: body.message ?? body.query ?? body.requirement,
  };
}

interface WaMessage {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
  button?: { text: string };
  interactive?: { button_reply?: { title: string }; list_reply?: { title: string } };
}

interface WaWebhook {
  entry?: {
    changes?: {
      value?: {
        metadata?: { phone_number_id: string };
        contacts?: { wa_id: string; profile?: { name?: string } }[];
        messages?: WaMessage[];
        statuses?: { id: string; status: string }[];
      };
    }[];
  }[];
}

function waText(m: WaMessage): string | undefined {
  if (m.type === "text") return m.text?.body;
  if (m.type === "button") return m.button?.text;
  if (m.type === "interactive") return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title;
  if (m.type === "audio") return "🎤 (voice note)";
  if (m.type === "image") return "🖼️ (image)";
  if (m.type === "location") return "📍 (location shared)";
  return undefined;
}
