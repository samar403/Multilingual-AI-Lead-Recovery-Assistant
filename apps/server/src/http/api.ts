import { Router } from "express";
import { z } from "zod";
import type { Ctx } from "../services/context.js";
import { ah, bearer, parse, rateLimit, requireAuth } from "./middleware.js";
import { login, revokeSession, signup } from "../services/auth.js";
import { audit, getLead, getTenant, hydrateLead, HttpError, insertMessage, listMessages, updateLead, upsertLead } from "../services/store.js";
import { dashboard } from "../services/analytics.js";
import { handleFormLead, handleInbound, handleMissedCall, rescore, scoreReasons } from "../services/conversation.js";
import { sendToLead } from "../services/messaging.js";
import { book, cancelBooking } from "../services/bookings.js";
import { callLead, cancelPending, runDueFollowups } from "../services/followups.js";
import { invoicePreview, usageLedger } from "../services/billing.js";
import { PLANS, USAGE_RATES, CONVERSATION_OVERAGE_PAISE } from "../billing/plans.js";
import { playbookFor, PLAYBOOKS } from "../ai/verticals.js";
import { sessionWindowClosesAt } from "../compliance/policy.js";
import { normalizePhone } from "../lib/util.js";
import { config } from "../config.js";
import { variantFor } from "../i18n/language.js";
import { render } from "../i18n/templates.js";
import { playgroundRouter } from "./playground.js";
import type { IntegrationKey } from "../channels/registry.js";

const Lang = z.enum(["en", "hi", "gu"]);
const Vertical = z.enum(["coaching", "real_estate", "salon", "services"]);
const Phone = z.string().min(8).transform((p, c) => {
  const n = normalizePhone(p);
  if (n.length < 11) c.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid phone number" });
  return n;
});

export function apiRouter(ctx: Ctx): Router {
  const r = Router();
  const auth = requireAuth(ctx);
  const authLimiter = rateLimit({ windowMs: 60_000, max: 20 });

  r.get("/health", (_req, res) => res.json({ ok: true, ai: ctx.engine.name, time: ctx.clock().toISOString() }));

  // ---------------------------------------------------------------- public
  r.get("/public/plans", (_req, res) =>
    res.json({ plans: PLANS, usage: USAGE_RATES, overagePaise: CONVERSATION_OVERAGE_PAISE }),
  );
  r.get("/public/verticals", (_req, res) =>
    res.json(Object.values(PLAYBOOKS).map((p) => ({ vertical: p.vertical, label: p.label, bookingKind: p.bookingKind, avgDealValue: p.avgDealValue, slots: p.slots.map((s) => ({ key: s.key, label: s.label, required: s.required })) }))),
  );
  r.use("/playground", playgroundRouter(ctx));

  // ---------------------------------------------------------------- auth
  r.post("/auth/signup", authLimiter, ah((req, res) => {
    const body = parse(
      z.object({
        businessName: z.string().min(2).max(80),
        vertical: Vertical,
        city: z.string().min(2).max(60),
        name: z.string().min(2).max(60),
        email: z.string().email(),
        phone: Phone.optional(),
        password: z.string().min(8, "Use at least 8 characters"),
        language: Lang.default("gu"),
      }),
      req.body,
    );
    const { token } = signup(ctx, body);
    res.status(201).json({ token });
  }));

  r.post("/auth/login", authLimiter, ah((req, res) => {
    const body = parse(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body);
    res.json({ token: login(ctx, body.email, body.password) });
  }));

  r.post("/auth/logout", auth, ah((req, res) => {
    revokeSession(ctx, bearer(req)!);
    res.json({ ok: true });
  }));

  r.get("/me", auth, ah((req, res) => {
    const tenant = req.tenant!;
    res.json({
      user: req.user,
      tenant: { ...tenant, webhook_key: undefined },
      playbook: summarizePlaybook(tenant.vertical),
      ai: ctx.engine.name,
    });
  }));

  r.patch("/me", auth, ah((req, res) => {
    const body = parse(z.object({ ui_lang: Lang.optional(), name: z.string().min(2).optional() }), req.body);
    ctx.db.update("users", req.user!.id, body);
    res.json({ ok: true });
  }));

  // ---------------------------------------------------------------- dashboard + live stream
  r.get("/dashboard", auth, ah((req, res) => {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
    res.json(dashboard(ctx, req.tenant!, days));
  }));

  r.get("/stream", auth, (req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    res.write(`event: ready\ndata: {}\n\n`);
    const off = ctx.bus.subscribe(req.tenant!.id, (e) => res.write(`event: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`));
    const ping = setInterval(() => res.write(`: ping\n\n`), 25_000);
    req.on("close", () => {
      clearInterval(ping);
      off();
    });
  });

  // ---------------------------------------------------------------- leads
  r.get("/leads", auth, ah((req, res) => {
    const q = parse(
      z.object({ status: z.string().optional(), temperature: z.string().optional(), q: z.string().optional(), lang: z.string().optional(), limit: z.coerce.number().min(1).max(500).default(200) }),
      req.query,
    );
    const where = ["tenant_id = ?"];
    const params: (string | number)[] = [req.tenant!.id];
    if (q.status && q.status !== "all") {
      const list = q.status.split(",");
      where.push(`status IN (${list.map(() => "?").join(",")})`);
      params.push(...list);
    }
    if (q.temperature) {
      where.push("temperature = ?");
      params.push(q.temperature);
    }
    if (q.lang) {
      where.push("language = ?");
      params.push(q.lang);
    }
    if (q.q) {
      where.push("(name LIKE ? OR phone LIKE ? OR summary LIKE ?)");
      params.push(`%${q.q}%`, `%${q.q}%`, `%${q.q}%`);
    }
    const rows = ctx.db.all<Parameters<typeof hydrateLead>[0]>(`SELECT * FROM leads WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT ?`, ...params, q.limit);
    const leads = rows.map(hydrateLead);
    const last = new Map(
      ctx.db.all<{ lead_id: string; body: string; gloss: string; author: string; created_at: string }>(
        `SELECT m.lead_id, m.body, m.gloss, m.author, m.created_at FROM messages m
         JOIN (SELECT lead_id, MAX(rowid) AS rid FROM messages WHERE tenant_id = ? GROUP BY lead_id) x ON x.rid = m.rowid`,
        req.tenant!.id,
      ).map((m) => [m.lead_id, m]),
    );
    res.json(leads.map((l) => ({ ...l, lastMessage: last.get(l.id) ?? null })));
  }));

  r.get("/leads.csv", auth, ah((req, res) => {
    const rows = ctx.db.all<Parameters<typeof hydrateLead>[0]>("SELECT * FROM leads WHERE tenant_id = ? ORDER BY created_at DESC", req.tenant!.id).map(hydrateLead);
    const pb = playbookFor(req.tenant!.vertical);
    const cols = ["name", "phone", "language", "source", "status", "score", "temperature", ...pb.slots.map((s) => s.key), "summary", "created_at"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [cols.join(","), ...rows.map((l) => cols.map((c) => esc((l as unknown as Record<string, unknown>)[c] ?? l.slots[c])).join(","))];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="leads.csv"`);
    res.send("﻿" + lines.join("\n"));
  }));

  r.post("/leads", auth, ah(async (req, res) => {
    const body = parse(z.object({ phone: Phone, name: z.string().max(80).optional(), message: z.string().max(1000).optional(), source: z.string().default("manual"), language: Lang.optional(), sendWelcome: z.boolean().default(true) }), req.body);
    if (body.sendWelcome) {
      const { lead } = await handleFormLead(ctx, req.tenant!, body);
      return res.status(201).json(lead);
    }
    const { lead } = upsertLead(ctx, req.tenant!, body);
    res.status(201).json(lead);
  }));

  r.get("/leads/:id", auth, ah((req, res) => {
    const tenant = req.tenant!;
    const lead = getLead(ctx, tenant.id, req.params.id!);
    res.json({
      lead,
      messages: listMessages(ctx, lead.id),
      followups: ctx.db.all("SELECT * FROM followups WHERE lead_id = ? ORDER BY due_at", lead.id),
      bookings: ctx.db.all("SELECT * FROM bookings WHERE lead_id = ? ORDER BY starts_at DESC", lead.id),
      calls: ctx.db.all("SELECT * FROM calls WHERE lead_id = ? ORDER BY created_at DESC", lead.id),
      consents: ctx.db.all("SELECT status, source, evidence, created_at FROM consents WHERE tenant_id = ? AND phone = ? ORDER BY created_at DESC", tenant.id, lead.phone),
      scoreReasons: scoreReasons(tenant, lead, ctx),
      windowClosesAt: sessionWindowClosesAt(lead)?.toISOString() ?? null,
    });
  }));

  r.patch("/leads/:id", auth, ah((req, res) => {
    const body = parse(
      z.object({
        name: z.string().max(80).optional(),
        status: z.enum(["new", "contacted", "engaged", "qualified", "booked", "won", "lost"]).optional(),
        ai_paused: z.boolean().optional(),
        notes: z.string().max(4000).optional(),
        value_estimate: z.number().int().min(0).optional(),
        slots: z.record(z.string()).optional(),
      }),
      req.body,
    );
    const lead = getLead(ctx, req.tenant!.id, req.params.id!);
    const patch: Record<string, unknown> = { ...body };
    if (body.slots) patch.slots = { ...lead.slots, ...body.slots };
    if (body.ai_paused !== undefined) patch.ai_paused = body.ai_paused ? 1 : 0;
    let next = updateLead(ctx, lead, patch);
    if (body.status && ["won", "lost"].includes(body.status)) cancelPending(ctx, lead.id);
    if (body.slots || body.status) next = rescore(ctx, req.tenant!, next, []);
    audit(ctx, req.tenant!.id, req.user!.email, "lead.updated", `${lead.phone}: ${Object.keys(body).join(",")}`);
    res.json(next);
  }));

  r.post("/leads/:id/messages", auth, ah(async (req, res) => {
    const body = parse(z.object({ text: z.string().min(1).max(2000).optional(), template: z.enum(["wa_followup", "wa_booking_reminder", "wa_final"]).optional(), note: z.boolean().default(false) }), req.body);
    const tenant = req.tenant!;
    const lead = getLead(ctx, tenant.id, req.params.id!);
    if (body.note) {
      const msg = insertMessage(ctx, { tenant_id: tenant.id, lead_id: lead.id, direction: "out", channel: "note", author: "agent", body: body.text ?? "", gloss: "", language: "", template: null, status: "internal", provider_id: null, meta: { by: req.user!.name } });
      return res.status(201).json({ status: "note", message: msg });
    }
    const pb = playbookFor(tenant.vertical);
    const variant = variantFor(lead.language, lead.script);
    const firstName = lead.name ? ` ${lead.name.split(" ")[0]}` : "";
    const outcome = await sendToLead(ctx, tenant, lead, {
      kind: "agent",
      author: "agent",
      text: body.text,
      template: body.template ? { key: body.template, vars: { name: firstName, bookingKind: pb.bookingKind[variant] } } : undefined,
      preferTemplate: Boolean(body.template),
      meta: { by: req.user!.name },
    });
    if (outcome.status === "blocked") throw new HttpError(409, outcome.reason);
    if (outcome.status === "deferred") throw new HttpError(409, `${outcome.reason}; try after ${outcome.until.toISOString()}`);
    res.status(201).json(outcome);
  }));

  r.post("/leads/:id/suggest", auth, ah(async (req, res) => {
    // AI-drafted reply for the owner to edit, without sending anything.
    const tenant = req.tenant!;
    const lead = getLead(ctx, tenant.id, req.params.id!);
    const msgs = listMessages(ctx, lead.id).filter((m) => m.channel !== "note" && m.author !== "system");
    const lastCustomer = [...msgs].reverse().find((m) => m.author === "customer");
    const variant = variantFor(lead.language, lead.script);
    if (!lastCustomer) {
      return res.json({ reply: render("wa_followup", variant, { name: lead.name ? ` ${lead.name}` : "", business: tenant.name, bookingKind: playbookFor(tenant.vertical).bookingKind[variant] }), gloss: "" });
    }
    const out = await ctx.engine.respond({
      tenant,
      playbook: playbookFor(tenant.vertical),
      lead: { name: lead.name, language: lead.language, script: lead.script, slots: lead.slots, status: lead.status },
      history: msgs.slice(0, msgs.lastIndexOf(lastCustomer)).map((m) => ({ author: m.author, body: m.body })),
      message: lastCustomer.body,
      now: ctx.clock(),
      offeredSlots: [],
    });
    res.json({ reply: out.reply, gloss: out.replyGloss, engine: out.engine });
  }));

  r.post("/leads/:id/call", auth, ah(async (req, res) => {
    const tenant = req.tenant!;
    const lead = getLead(ctx, tenant.id, req.params.id!);
    const agent = req.user!.phone || tenant.settings.ownerPhone;
    if (!agent) throw new HttpError(400, "Add your phone number in Settings so we can ring you first");
    const result = await callLead(ctx, tenant, lead, agent, "manual");
    res.json(result);
  }));

  r.post("/leads/:id/book", auth, ah((req, res) => {
    const body = parse(z.object({ startsAt: z.string().datetime({ offset: true }), notes: z.string().max(500).default("") }), req.body);
    const tenant = req.tenant!;
    const lead = getLead(ctx, tenant.id, req.params.id!);
    const booking = book(ctx, tenant, lead, new Date(body.startsAt), req.user!.email, body.notes);
    rescore(ctx, tenant, getLead(ctx, tenant.id, lead.id), []);
    res.status(201).json(booking);
  }));

  // ---------------------------------------------------------------- bookings & follow-ups
  r.get("/bookings", auth, ah((req, res) => {
    const from = typeof req.query.from === "string" ? req.query.from : new Date(ctx.clock().getTime() - 7 * 86_400_000).toISOString();
    res.json(
      ctx.db.all(
        `SELECT b.*, l.name, l.phone, l.language, l.slots FROM bookings b JOIN leads l ON l.id = b.lead_id
         WHERE b.tenant_id = ? AND b.starts_at >= ? AND b.status IN ('confirmed','completed','no_show') ORDER BY b.starts_at`,
        req.tenant!.id, from,
      ),
    );
  }));

  r.patch("/bookings/:id", auth, ah((req, res) => {
    const body = parse(z.object({ status: z.enum(["completed", "no_show", "cancelled"]) }), req.body);
    const tenant = req.tenant!;
    const booking = ctx.db.get<{ id: string; lead_id: string }>("SELECT id, lead_id FROM bookings WHERE id = ? AND tenant_id = ?", req.params.id!, tenant.id);
    if (!booking) throw new HttpError(404, "Booking not found");
    const lead = getLead(ctx, tenant.id, booking.lead_id);
    if (body.status === "cancelled") cancelBooking(ctx, tenant, lead, req.user!.email);
    else {
      ctx.db.update("bookings", booking.id, { status: body.status });
      if (body.status === "completed") updateLead(ctx, lead, { status: "won" });
    }
    res.json({ ok: true });
  }));

  r.get("/followups", auth, ah((req, res) => {
    res.json(
      ctx.db.all(
        `SELECT f.*, l.name, l.phone, l.language, l.status AS lead_status FROM followups f JOIN leads l ON l.id = f.lead_id
         WHERE f.tenant_id = ? AND (f.status = 'pending' OR f.executed_at >= ?) ORDER BY CASE f.status WHEN 'pending' THEN 0 ELSE 1 END, f.due_at LIMIT 200`,
        req.tenant!.id, new Date(ctx.clock().getTime() - 3 * 86_400_000).toISOString(),
      ),
    );
  }));

  r.post("/followups/:id/cancel", auth, ah((req, res) => {
    ctx.db.run("UPDATE followups SET status = 'cancelled' WHERE id = ? AND tenant_id = ? AND status = 'pending'", req.params.id!, req.tenant!.id);
    res.json({ ok: true });
  }));

  r.post("/followups/:id/run", auth, ah(async (req, res) => {
    ctx.db.run("UPDATE followups SET due_at = ? WHERE id = ? AND tenant_id = ? AND status = 'pending'", ctx.clock().toISOString(), req.params.id!, req.tenant!.id);
    await runDueFollowups(ctx);
    res.json(ctx.db.get("SELECT * FROM followups WHERE id = ?", req.params.id!));
  }));

  // ---------------------------------------------------------------- settings
  r.get("/settings", auth, ah((req, res) => {
    const t = getTenant(ctx, req.tenant!.id);
    res.json({ tenant: t, webhooks: webhookUrls(t.webhook_key) });
  }));

  r.patch("/settings", auth, ah((req, res) => {
    const hhmm = z.string().regex(/^\d{2}:\d{2}$/);
    const body = parse(
      z.object({
        name: z.string().min(2).max(80).optional(),
        city: z.string().max(60).optional(),
        phone: z.string().max(20).optional(),
        default_lang: Lang.optional(),
        vertical: Vertical.optional(),
        settings: z
          .object({
            hours: z.object({ open: hhmm, close: hhmm, days: z.array(z.number().int().min(0).max(6)) }),
            quietHours: z.object({ start: hhmm, end: hhmm }),
            localities: z.array(z.string().max(120)).max(200),
            offerings: z.array(z.string().max(80)).max(50),
            priceNote: z.string().max(600),
            address: z.string().max(300),
            bookingKind: z.string().max(60),
            avgDealValue: z.number().int().min(0),
            consentMode: z.enum(["implied_inbound", "explicit_only"]),
            cadence: z.object({ nudgeAfterMin: z.number().int().min(15), secondNudgeAfterMin: z.number().int().min(60), finalNudgeAfterMin: z.number().int().min(120), callbackAfterMin: z.number().int().min(1) }),
            ownerPhone: z.string().max(20),
            aiPersona: z.string().max(1500),
            autoReply: z.boolean(),
          })
          .partial()
          .optional(),
      }),
      req.body,
    );
    const tenant = req.tenant!;
    const patch: Record<string, unknown> = { ...body };
    if (body.phone) patch.phone = normalizePhone(body.phone);
    if (body.settings) {
      const s = { ...tenant.settings, ...body.settings };
      if (body.settings.ownerPhone) s.ownerPhone = normalizePhone(body.settings.ownerPhone);
      patch.settings = s;
    }
    ctx.db.update("tenants", tenant.id, patch);
    audit(ctx, tenant.id, req.user!.email, "settings.updated", Object.keys(body.settings ?? body).join(","));
    res.json(getTenant(ctx, tenant.id));
  }));

  r.post("/settings/rotate-key", auth, ah((req, res) => {
    const key = `wk_${(globalThis.crypto.randomUUID() as string).replace(/-/g, "")}`;
    ctx.db.update("tenants", req.tenant!.id, { webhook_key: key });
    audit(ctx, req.tenant!.id, req.user!.email, "webhook_key.rotated");
    res.json({ webhooks: webhookUrls(key) });
  }));

  r.get("/audit", auth, ah((req, res) => {
    res.json(ctx.db.all("SELECT actor, action, detail, created_at FROM audit_log WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100", req.tenant!.id));
  }));

  // ---------------------------------------------------------------- integrations
  const SECRET_FIELDS = new Set(["token", "appSecret", "authKey", "apiKey", "apiToken", "authToken"]);
  r.get("/integrations", auth, ah((req, res) => {
    const tenant = req.tenant!;
    const resolved = ctx.channels.for(tenant.id);
    const rows = ctx.db.all<{ provider: IntegrationKey; status: string; config: string; updated_at: string }>("SELECT * FROM integrations WHERE tenant_id = ?", tenant.id);
    const out = (["whatsapp", "sms", "voice"] as IntegrationKey[]).map((key) => {
      const row = rows.find((x) => x.provider === key);
      const cfg = row ? (JSON.parse(row.config) as Record<string, unknown>) : {};
      const redacted = Object.fromEntries(Object.entries(cfg).map(([k, v]) => [k, SECRET_FIELDS.has(k) && typeof v === "string" ? `••••${v.slice(-4)}` : v]));
      const adapter = key === "voice" ? resolved.voice : resolved[key];
      return { key, status: row?.status ?? "disconnected", config: redacted, live: !adapter.sandbox, provider: adapter.provider, updated_at: row?.updated_at ?? null };
    });
    res.json({ integrations: out, webhooks: webhookUrls(getTenant(ctx, tenant.id).webhook_key) });
  }));

  r.put("/integrations/:key", auth, ah((req, res) => {
    const key = parse(z.enum(["whatsapp", "sms", "voice"]), req.params.key);
    const body = parse(z.record(z.unknown()), req.body);
    const tenant = req.tenant!;
    const existing = ctx.db.get<{ config: string }>("SELECT config FROM integrations WHERE tenant_id = ? AND provider = ?", tenant.id, key);
    const prev = existing ? (JSON.parse(existing.config) as Record<string, unknown>) : {};
    // Keep stored secrets when the client sends back the redacted placeholder.
    const merged = Object.fromEntries(Object.entries({ ...prev, ...body }).map(([k, v]) => [k, typeof v === "string" && v.startsWith("••••") ? prev[k] : v]));
    ctx.db.run(
      `INSERT INTO integrations (tenant_id, provider, status, config, updated_at) VALUES (?, ?, 'connected', ?, ?)
       ON CONFLICT(tenant_id, provider) DO UPDATE SET status = 'connected', config = excluded.config, updated_at = excluded.updated_at`,
      tenant.id, key, JSON.stringify(merged), ctx.clock().toISOString(),
    );
    audit(ctx, tenant.id, req.user!.email, "integration.connected", key);
    res.json({ ok: true });
  }));

  r.delete("/integrations/:key", auth, ah((req, res) => {
    ctx.db.run("UPDATE integrations SET status = 'disconnected' WHERE tenant_id = ? AND provider = ?", req.tenant!.id, req.params.key!);
    audit(ctx, req.tenant!.id, req.user!.email, "integration.disconnected", req.params.key!);
    res.json({ ok: true });
  }));

  // ---------------------------------------------------------------- billing
  r.get("/billing", auth, ah((req, res) => {
    const tenant = req.tenant!;
    res.json({ invoice: invoicePreview(ctx, tenant.id, tenant.plan), ledger: usageLedger(ctx, tenant.id), plans: PLANS, rates: USAGE_RATES, razorpay: Boolean(config.razorpay.keyId) });
  }));

  r.post("/billing/plan", auth, ah((req, res) => {
    const body = parse(z.object({ plan: z.enum(["starter", "growth", "pro"]) }), req.body);
    ctx.db.update("tenants", req.tenant!.id, { plan: body.plan });
    audit(ctx, req.tenant!.id, req.user!.email, "plan.changed", body.plan);
    res.json({ ok: true, plan: body.plan });
  }));

  // ---------------------------------------------------------------- simulator (try the flow without integrations)
  r.post("/simulate/missed-call", auth, ah(async (req, res) => {
    const body = parse(z.object({ phone: Phone.optional(), name: z.string().max(60).optional() }), req.body ?? {});
    const phone = body.phone ?? `+9198${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
    const out = await handleMissedCall(ctx, req.tenant!, { phone, name: body.name, provider: "simulator" });
    res.status(201).json({ lead: out.lead, outcome: out.outcome?.status });
  }));

  r.post("/simulate/inbound", auth, ah(async (req, res) => {
    const body = parse(z.object({ phone: Phone, text: z.string().min(1).max(1000) }), req.body);
    const out = await handleInbound(ctx, req.tenant!, { phone: body.phone, text: body.text, channel: "whatsapp" });
    res.status(201).json({ lead: out.lead, handled: out.handled, reply: out.reply?.status === "sent" ? out.reply.message : null });
  }));

  return r;
}

function webhookUrls(key: string) {
  const base = config.publicUrl.replace(/\/$/, "");
  return {
    whatsapp: `${base}/webhooks/whatsapp`,
    exotel: `${base}/webhooks/exotel/${key}`,
    twilioVoice: `${base}/webhooks/twilio/voice/${key}`,
    twilioSms: `${base}/webhooks/twilio/sms/${key}`,
    leads: `${base}/webhooks/leads/${key}`,
    indiamart: `${base}/webhooks/leads/${key}?source=indiamart`,
    justdial: `${base}/webhooks/leads/${key}?source=justdial`,
  };
}

function summarizePlaybook(vertical: Parameters<typeof playbookFor>[0]) {
  const pb = playbookFor(vertical);
  return { vertical: pb.vertical, label: pb.label, bookingKind: pb.bookingKind, slots: pb.slots.map((s) => ({ key: s.key, label: s.label, required: s.required, type: s.type })) };
}
