import type { Ctx } from "./context.js";
import type { Channel, Lead, Message, Tenant } from "../types.js";
import { decide, type SendKind } from "../compliance/policy.js";
import { render, WA_TEMPLATE_CATEGORY } from "../i18n/templates.js";
import { variantFor } from "../i18n/language.js";
import { insertMessage, getLead, updateLead } from "./store.js";
import { recordUsage } from "./billing.js";
import { smsSegments } from "../billing/plans.js";
import type { MessagingAdapter, TemplateRef } from "../channels/types.js";
import { nowIso } from "../lib/util.js";

/** Positional parameters of each approved WhatsApp template ({{1}}, {{2}}, …). */
const WA_TEMPLATE_PARAMS: Record<string, string[]> = {
  wa_missed_call: ["name", "business"],
  wa_enquiry: ["name", "business"],
  wa_followup: ["name", "business", "bookingKind"],
  wa_final: ["name", "business"],
  wa_booking_reminder: ["bookingKind", "business", "when", "address"],
  sms_missed_call: ["business", "waLink", "phone"],
};

export interface SendRequest {
  kind: SendKind;
  author: "ai" | "agent" | "system";
  /** Free-form body (used inside the 24h window). */
  text?: string;
  gloss?: string;
  /** Approved template to use when the window is closed (or always, for recovery). */
  template?: { key: string; vars: Record<string, string>; glossVars?: Record<string, string> };
  preferTemplate?: boolean;
  smsFallback?: boolean;
  meta?: Record<string, unknown>;
}

export type SendOutcome =
  | { status: "sent"; message: Message }
  | { status: "failed"; message: Message; error: string }
  | { status: "blocked"; reason: string }
  | { status: "deferred"; until: Date; reason: string };

export async function sendToLead(ctx: Ctx, tenant: Tenant, lead: Lead, req: SendRequest): Promise<SendOutcome> {
  const now = ctx.clock();
  const decision = decide(tenant, lead, req.kind, now);
  if (!decision.allowed) {
    return decision.deferUntil ? { status: "deferred", until: decision.deferUntil, reason: decision.reason } : { status: "blocked", reason: decision.reason };
  }

  const variant = variantFor(lead.language, lead.script);
  const useTemplate = Boolean(req.template) && (decision.mode === "template" || req.preferTemplate || !req.text);
  if (!useTemplate && decision.mode === "template") {
    return { status: "blocked", reason: "WhatsApp 24-hour window is closed — use an approved template" };
  }

  const channels = ctx.channels.for(tenant.id);
  const templateNames = (channels.config.whatsapp.templateNames ?? {}) as Record<string, string>;

  let body: string;
  let gloss: string;
  let templateRef: TemplateRef | undefined;
  if (useTemplate && req.template) {
    const vars = withDefaults(tenant, req.template.vars);
    body = render(req.template.key, variant, vars);
    gloss = render(req.template.key, "en", { ...vars, ...(req.template.glossVars ?? {}) });
    templateRef = {
      name: templateNames[req.template.key] ?? `vaani_${req.template.key.replace(/^wa_/, "")}`,
      language: lead.language,
      params: (WA_TEMPLATE_PARAMS[req.template.key] ?? []).map((k) => (vars[k] ?? "").trim() || "ji"),
    };
  } else {
    body = req.text!;
    gloss = req.gloss ?? "";
  }

  let result = await channels.whatsapp.send({ to: lead.phone, text: body, template: templateRef });
  let channel: Channel = "whatsapp";
  let adapter: MessagingAdapter = channels.whatsapp;

  if (!result.ok && req.smsFallback) {
    const dlt = (channels.config.sms.dltTemplates ?? {}) as Record<string, string>;
    const smsVars = withDefaults(tenant, { ...(req.template?.vars ?? {}) });
    const smsBody = render("sms_missed_call", variant, smsVars);
    const smsResult = await channels.sms.send({
      to: lead.phone,
      text: smsBody,
      template: { name: dlt.sms_missed_call ?? "sms_missed_call", language: lead.language, params: WA_TEMPLATE_PARAMS.sms_missed_call!.map((k) => smsVars[k] ?? "") },
    });
    if (smsResult.ok) {
      result = smsResult;
      channel = "sms";
      adapter = channels.sms;
      body = smsBody;
      gloss = render("sms_missed_call", "en", smsVars);
      templateRef = undefined;
    }
  }

  const message = insertMessage(ctx, {
    tenant_id: tenant.id,
    lead_id: lead.id,
    direction: "out",
    channel,
    author: req.author,
    body,
    gloss,
    language: lead.language,
    template: templateRef?.name ?? (channel === "sms" ? "sms_missed_call" : null),
    status: result.ok ? (adapter.sandbox ? "delivered" : "sent") : "failed",
    provider_id: result.providerId ?? null,
    meta: { ...(req.meta ?? {}), provider: adapter.provider, sandbox: adapter.sandbox, policy: decision.reason, error: result.error },
  });

  if (!result.ok) return { status: "failed", message, error: result.error ?? "send failed" };

  // Metering
  if (channel === "sms") recordUsage(ctx, tenant.id, "sms", smsSegments(body), message.id);
  else if (templateRef && req.template) recordUsage(ctx, tenant.id, WA_TEMPLATE_CATEGORY[req.template.key] === "marketing" ? "wa_marketing" : "wa_utility", 1, message.id);
  else recordUsage(ctx, tenant.id, "wa_service", 1, message.id);
  if (req.author === "ai") recordUsage(ctx, tenant.id, "ai_reply", 1, lead.id);

  const fresh = getLead(ctx, tenant.id, lead.id);
  const patch: Record<string, unknown> = { last_outbound_at: nowIso(ctx.clock) };
  if (fresh.first_response_ms === null) {
    const since = Date.parse(fresh.missed_at ?? fresh.created_at);
    patch.first_response_ms = Math.max(0, now.getTime() - since);
  }
  if (fresh.status === "new") patch.status = "contacted";
  updateLead(ctx, fresh, patch);
  return { status: "sent", message };
}

function withDefaults(tenant: Tenant, vars: Record<string, string>): Record<string, string> {
  const wa = tenant.phone.replace(/\D/g, "");
  return {
    business: tenant.name,
    address: tenant.settings.address,
    phone: tenant.phone,
    waLink: wa ? `wa.me/${wa}` : "",
    name: "",
    ...vars,
  };
}
