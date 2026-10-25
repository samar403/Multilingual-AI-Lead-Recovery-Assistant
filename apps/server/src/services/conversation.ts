import type { Ctx } from "./context.js";
import type { Channel, Intent, Lang, Lead, LeadStatus, Tenant } from "../types.js";
import { audit, getLead, insertMessage, listMessages, updateLead, upsertLead } from "./store.js";
import { sendToLead, type SendOutcome } from "./messaging.js";
import { activeBooking, book, cancelBooking } from "./bookings.js";
import { cancelPending, planEngagedCadence, planRecoveryCadence, scheduleFollowup } from "./followups.js";
import { playbookFor } from "../ai/verticals.js";
import { scoreLead } from "../ai/scoring.js";
import { detectIntent, extractName, extractSlots, isOptIn } from "../ai/nlu.js";
import { detectLanguage, variantFor } from "../i18n/language.js";
import { render } from "../i18n/templates.js";
import { id, nowIso } from "../lib/util.js";
import type { EngineOutput } from "../ai/types.js";

const CLOSED: LeadStatus[] = ["booked", "won", "lost", "opted_out"];

// ------------------------------------------------------------------ missed calls

export async function handleMissedCall(
  ctx: Ctx,
  tenant: Tenant,
  input: { phone: string; name?: string; provider?: string; providerId?: string },
): Promise<{ lead: Lead; outcome: SendOutcome | null }> {
  const { lead: upserted } = upsertLead(ctx, tenant, { phone: input.phone, name: input.name, source: "missed_call" });
  const now = nowIso(ctx.clock);
  const lead = updateLead(ctx, upserted, { missed_at: now, first_response_ms: null });

  ctx.db.insert("calls", {
    id: id("call"),
    tenant_id: tenant.id,
    lead_id: lead.id,
    direction: "inbound",
    status: "missed",
    provider: input.provider ?? "sandbox",
    provider_id: input.providerId ?? null,
    created_at: now,
  });
  insertMessage(ctx, {
    tenant_id: tenant.id,
    lead_id: lead.id,
    direction: "in",
    channel: "voice",
    author: "system",
    body: "📵 Missed call",
    gloss: "",
    language: "en",
    template: null,
    status: "received",
    provider_id: input.providerId ?? null,
    meta: { provider: input.provider ?? "sandbox" },
  });
  ctx.db.insert("consents", { id: id("con"), tenant_id: tenant.id, phone: lead.phone, status: "implied_inbound", source: "missed_call", evidence: `Customer called ${tenant.phone || "business number"} at ${now}`, created_at: now });
  ctx.bus.publish(tenant.id, "missed_call", { leadId: lead.id, phone: lead.phone });

  if (lead.status === "opted_out" || !tenant.settings.autoReply) return { lead, outcome: null };

  const firstName = lead.name ? ` ${lead.name.split(" ")[0]}` : "";
  const outcome = await sendToLead(ctx, tenant, lead, {
    kind: "recovery",
    author: "ai",
    template: { key: "wa_missed_call", vars: { name: firstName } },
    preferTemplate: true,
    smsFallback: true,
    meta: { trigger: "missed_call" },
  });
  const fresh = getLead(ctx, tenant.id, lead.id);
  if (!CLOSED.includes(fresh.status)) planRecoveryCadence(ctx, tenant, fresh);
  return { lead: getLead(ctx, tenant.id, lead.id), outcome };
}

// ------------------------------------------------------------------ form / marketplace leads

export async function handleFormLead(
  ctx: Ctx,
  tenant: Tenant,
  input: { phone: string; name?: string; source: string; message?: string; language?: Lang },
): Promise<{ lead: Lead; outcome: SendOutcome | null }> {
  const pb = playbookFor(tenant.vertical);
  const extracted = input.message ? extractSlots(input.message, pb.slots, tenant.settings.localities, ctx.clock()).slots : {};
  const guess = input.message ? detectLanguage(input.message, tenant.default_lang) : undefined;
  const language = input.language ?? guess?.lang;
  const { lead: upserted, created } = upsertLead(ctx, tenant, { phone: input.phone, name: input.name, source: input.source, language, slots: extracted });
  const lead = guess && created ? updateLead(ctx, upserted, { script: guess.script }) : upserted;
  if (input.message) {
    insertMessage(ctx, {
      tenant_id: tenant.id,
      lead_id: lead.id,
      direction: "in",
      channel: "web",
      author: "customer",
      body: input.message,
      gloss: "",
      language: lead.language,
      template: null,
      status: "received",
      provider_id: null,
      meta: { source: input.source },
    });
  }
  const now = nowIso(ctx.clock);
  ctx.db.insert("consents", { id: id("con"), tenant_id: tenant.id, phone: lead.phone, status: "explicit", source: input.source, evidence: `Submitted enquiry via ${input.source} at ${now}`, created_at: now });
  const withConsent = updateLead(ctx, lead, { consent: "explicit", missed_at: created ? now : lead.missed_at ?? now });
  rescore(ctx, tenant, withConsent, []);
  ctx.bus.publish(tenant.id, "new_lead", { leadId: lead.id, source: input.source });

  if (!tenant.settings.autoReply || lead.status === "opted_out") return { lead: withConsent, outcome: null };
  const firstName = withConsent.name ? ` ${withConsent.name.split(" ")[0]}` : "";
  const outcome = await sendToLead(ctx, tenant, withConsent, {
    kind: "recovery",
    author: "ai",
    template: { key: "wa_enquiry", vars: { name: firstName } },
    preferTemplate: true,
    smsFallback: true,
    meta: { trigger: input.source },
  });
  const fresh = getLead(ctx, tenant.id, lead.id);
  if (!CLOSED.includes(fresh.status)) planRecoveryCadence(ctx, tenant, fresh);
  return { lead: getLead(ctx, tenant.id, lead.id), outcome };
}

// ------------------------------------------------------------------ inbound messages

export interface InboundResult {
  lead: Lead;
  reply?: SendOutcome;
  engine?: EngineOutput;
  handled: "opt_out" | "opt_in" | "paused" | "ai";
}

export async function handleInbound(
  ctx: Ctx,
  tenant: Tenant,
  input: { phone: string; text: string; channel?: Channel; providerId?: string; name?: string },
): Promise<InboundResult> {
  const channel = input.channel ?? "whatsapp";
  const { lead: found } = upsertLead(ctx, tenant, { phone: input.phone, name: input.name, source: channel === "web" ? "website" : "whatsapp" });
  const history = listMessages(ctx, found.id);

  const inbound = insertMessage(ctx, {
    tenant_id: tenant.id,
    lead_id: found.id,
    direction: "in",
    channel,
    author: "customer",
    body: input.text,
    gloss: "",
    language: "",
    template: null,
    status: "received",
    provider_id: input.providerId ?? null,
    meta: {},
  });
  let lead = updateLead(ctx, found, { last_inbound_at: nowIso(ctx.clock) });
  const variant = variantFor(lead.language, lead.script);

  // 1. Opt-out is absolute and handled before any AI sees the message.
  if (detectIntent(input.text) === "opt_out") {
    const reply = await sendToLead(ctx, tenant, lead, { kind: "reply", author: "system", text: render("opt_out", variant, { business: tenant.name }), gloss: render("opt_out", "en", { business: tenant.name }) });
    lead = updateLead(ctx, getLead(ctx, tenant.id, lead.id), { status: "opted_out", consent: "revoked" });
    cancelPending(ctx, lead.id, ["nudge", "final", "callback", "reminder"]);
    ctx.db.insert("consents", { id: id("con"), tenant_id: tenant.id, phone: lead.phone, status: "revoked", source: channel, evidence: input.text, created_at: nowIso(ctx.clock) });
    ctx.db.update("messages", inbound.id, { gloss: "Asked to stop messages", meta: { intent: "opt_out" } });
    audit(ctx, tenant.id, "customer", "consent.revoked", lead.phone);
    return { lead, reply, handled: "opt_out" };
  }
  if (lead.status === "opted_out") {
    if (!isOptIn(input.text)) return { lead, handled: "paused" };
    lead = updateLead(ctx, lead, { status: "engaged", consent: "explicit" });
    ctx.db.insert("consents", { id: id("con"), tenant_id: tenant.id, phone: lead.phone, status: "explicit", source: channel, evidence: input.text, created_at: nowIso(ctx.clock) });
    const reply = await sendToLead(ctx, tenant, lead, { kind: "reply", author: "system", text: render("opt_in", variant, { business: tenant.name }), gloss: render("opt_in", "en", { business: tenant.name }) });
    return { lead: getLead(ctx, tenant.id, lead.id), reply, handled: "opt_in" };
  }

  // 2. The owner took over this chat, or auto-reply is off: just surface it.
  if (lead.ai_paused || !tenant.settings.autoReply) {
    const guess = detectLanguage(input.text, lead.language);
    if (guess.confidence >= 0.3) lead = updateLead(ctx, lead, { language: guess.lang, script: guess.script });
    ctx.bus.publish(tenant.id, "attention", { leadId: lead.id, text: input.text });
    return { lead, handled: "paused" };
  }

  // 3. AI turn.
  const pb = playbookFor(tenant.vertical);
  const lastAi = [...history].reverse().find((m) => m.direction === "out" && m.author === "ai");
  const offeredSlots = Array.isArray(lastAi?.meta.offeredSlots) ? (lastAi!.meta.offeredSlots as string[]) : [];
  const booking = activeBooking(ctx, lead.id);
  const out = await ctx.engine.respond({
    tenant,
    playbook: pb,
    lead: { name: lead.name, language: lead.language, script: lead.script, slots: lead.slots, status: lead.status },
    history: history.filter((m) => m.channel !== "note" && m.author !== "system").map((m) => ({ author: m.author, body: m.body })),
    message: input.text,
    now: ctx.clock(),
    offeredSlots,
    activeBooking: booking ? { id: booking.id, startsAt: booking.starts_at } : null,
  });

  ctx.db.update("messages", inbound.id, { gloss: out.inboundGloss, language: out.language, meta: { intent: out.intent, slots: out.slots, engine: out.engine } });
  ctx.bus.publish(tenant.id, "message", { ...inbound, gloss: out.inboundGloss, language: out.language });

  const slots = { ...lead.slots, ...out.slots };
  const patch: Record<string, unknown> = {
    language: out.language,
    script: out.script,
    slots,
    intent: out.intent,
    summary: out.summary,
  };
  const name = out.name ?? extractName(input.text);
  if (name && !lead.name) patch.name = name;
  if (out.budgetRupees && tenant.vertical === "real_estate") patch.value_estimate = Math.round(Math.min(out.budgetRupees * 0.01, 500_000)); // ~1% brokerage
  lead = updateLead(ctx, lead, patch);

  if (out.cancelBooking) cancelBooking(ctx, tenant, lead, "ai");
  if (out.bookAt) book(ctx, tenant, getLead(ctx, tenant.id, lead.id), new Date(out.bookAt), "ai");
  lead = getLead(ctx, tenant.id, lead.id);

  const reply = await sendToLead(ctx, tenant, lead, {
    kind: "reply",
    author: "ai",
    text: out.reply,
    gloss: out.replyGloss,
    meta: { engine: out.engine, intent: out.intent, offeredSlots: out.offeredSlots ?? [], tokens: out.usage },
  });

  // 4. Pipeline status, score and cadence.
  lead = getLead(ctx, tenant.id, lead.id);
  const requiredDone = pb.slots.filter((s) => s.required && s.key !== "preferred_slot").every((s) => lead.slots[s.key]);
  let status: LeadStatus = lead.status;
  if (out.intent === "not_interested") status = "lost";
  else if (status !== "booked" && status !== "won") status = requiredDone ? "qualified" : "engaged";
  if (out.handoff) {
    lead = updateLead(ctx, lead, { status, ai_paused: 1 });
    cancelPending(ctx, lead.id);
    if (tenant.settings.ownerPhone) scheduleFollowup(ctx, lead, "callback", ctx.clock(), { reason: "Customer asked for a person" });
    ctx.bus.publish(tenant.id, "handoff", { leadId: lead.id, intent: out.intent });
    audit(ctx, tenant.id, "ai", "handoff", `${lead.phone}: ${out.intent}`);
  } else {
    lead = updateLead(ctx, lead, { status });
    if (status === "lost") cancelPending(ctx, lead.id);
    else if (status !== "booked" && status !== "won") planEngagedCadence(ctx, tenant, lead);
  }
  lead = rescore(ctx, tenant, lead, [out.intent]);
  return { lead, reply, engine: out, handled: "ai" };
}

/** Recomputes the explainable score from the whole conversation. */
export function rescore(ctx: Ctx, tenant: Tenant, lead: Lead, extraIntents: Intent[]): Lead {
  const pb = playbookFor(tenant.vertical);
  const msgs = listMessages(ctx, lead.id);
  const inbound = msgs.filter((m) => m.author === "customer");
  const intents = [...inbound.map((m) => m.meta.intent as Intent).filter(Boolean), ...extraIntents];
  let latency: number | undefined;
  const lastIn = inbound[inbound.length - 1];
  if (lastIn) {
    const prevOut = [...msgs].reverse().find((m) => m.direction === "out" && m.created_at <= lastIn.created_at);
    if (prevOut) latency = (Date.parse(lastIn.created_at) - Date.parse(prevOut.created_at)) / 60_000;
  }
  const result = scoreLead({ playbook: pb, slots: lead.slots, intents, inboundCount: inbound.length, replyLatencyMin: latency, booked: lead.status === "booked" || lead.status === "won" });
  ctx.db.update("leads", lead.id, { score: result.score, temperature: result.temperature });
  const next = getLead(ctx, tenant.id, lead.id);
  ctx.bus.publish(tenant.id, "lead", next);
  return next;
}

export function scoreReasons(tenant: Tenant, lead: Lead, ctx: Ctx): string[] {
  const pb = playbookFor(tenant.vertical);
  const msgs = listMessages(ctx, lead.id);
  const inbound = msgs.filter((m) => m.author === "customer");
  const intents = inbound.map((m) => m.meta.intent as Intent).filter(Boolean);
  return scoreLead({ playbook: pb, slots: lead.slots, intents, inboundCount: inbound.length, booked: lead.status === "booked" || lead.status === "won" }).reasons;
}
