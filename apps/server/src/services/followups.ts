import type { Ctx } from "./context.js";
import type { Lead, Tenant } from "../types.js";
import { getLead, getTenant, insertMessage, updateLead } from "./store.js";
import { sendToLead } from "./messaging.js";
import { addMinutes, dateLang, formatIst } from "../lib/time.js";
import { id, nowIso } from "../lib/util.js";
import { render } from "../i18n/templates.js";
import { variantFor } from "../i18n/language.js";
import { playbookFor } from "../ai/verticals.js";
import { WA_SESSION_MS } from "../compliance/policy.js";

export type FollowupKind = "nudge" | "final" | "callback" | "reminder";

interface FollowupRow {
  id: string;
  tenant_id: string;
  lead_id: string;
  kind: FollowupKind;
  channel: string;
  step: number;
  due_at: string;
  status: string;
  reason: string;
}

export function scheduleFollowup(ctx: Ctx, lead: Lead, kind: FollowupKind, dueAt: Date, opts: { step?: number; reason?: string; channel?: string } = {}) {
  const row = {
    id: id("fu"),
    tenant_id: lead.tenant_id,
    lead_id: lead.id,
    kind,
    channel: opts.channel ?? (kind === "callback" ? "voice" : "whatsapp"),
    step: opts.step ?? 1,
    due_at: dueAt.toISOString(),
    status: "pending",
    reason: opts.reason ?? "",
    created_at: nowIso(ctx.clock),
  };
  ctx.db.insert("followups", row);
  ctx.bus.publish(lead.tenant_id, "followup", row);
  return row;
}

export function cancelPending(ctx: Ctx, leadId: string, kinds: FollowupKind[] = ["nudge", "final", "callback"]) {
  ctx.db.run(
    `UPDATE followups SET status = 'cancelled', executed_at = ? WHERE lead_id = ? AND status = 'pending' AND kind IN (${kinds.map(() => "?").join(",")})`,
    nowIso(ctx.clock), leadId, ...kinds,
  );
}

/** Cadence after a missed call / new enquiry the customer hasn't answered yet. */
export function planRecoveryCadence(ctx: Ctx, tenant: Tenant, lead: Lead) {
  const now = ctx.clock();
  const c = tenant.settings.cadence;
  cancelPending(ctx, lead.id);
  if (tenant.settings.ownerPhone) scheduleFollowup(ctx, lead, "callback", addMinutes(now, c.callbackAfterMin), { reason: "Owner call-back if no WhatsApp reply" });
  scheduleFollowup(ctx, lead, "nudge", addMinutes(now, c.nudgeAfterMin), { step: 1, reason: "No reply to recovery message" });
  scheduleFollowup(ctx, lead, "nudge", addMinutes(now, c.secondNudgeAfterMin), { step: 2, reason: "Second follow-up" });
  scheduleFollowup(ctx, lead, "final", addMinutes(now, c.finalNudgeAfterMin), { step: 3, reason: "Polite close" });
}

/** Cadence after the customer engaged but stopped replying before booking. */
export function planEngagedCadence(ctx: Ctx, tenant: Tenant, lead: Lead) {
  const now = ctx.clock();
  const c = tenant.settings.cadence;
  cancelPending(ctx, lead.id);
  scheduleFollowup(ctx, lead, "nudge", addMinutes(now, c.nudgeAfterMin), { step: 1, reason: "Conversation went quiet" });
  scheduleFollowup(ctx, lead, "nudge", addMinutes(now, c.secondNudgeAfterMin), { step: 2, reason: "Next-day follow-up" });
  scheduleFollowup(ctx, lead, "final", addMinutes(now, c.finalNudgeAfterMin), { step: 3, reason: "Polite close" });
}

/** Executes every due follow-up. Called by the scheduler loop. */
export async function runDueFollowups(ctx: Ctx, limit = 50): Promise<number> {
  const now = ctx.clock();
  const due = ctx.db.all<FollowupRow>("SELECT * FROM followups WHERE status = 'pending' AND due_at <= ? ORDER BY due_at LIMIT ?", now.toISOString(), limit);
  for (const fu of due) {
    try {
      await executeFollowup(ctx, fu);
    } catch (err) {
      ctx.db.update("followups", fu.id, { status: "failed", reason: `${fu.reason} — ${(err as Error).message}`, executed_at: nowIso(ctx.clock) });
    }
  }
  return due.length;
}

async function executeFollowup(ctx: Ctx, fu: FollowupRow) {
  const tenant = getTenant(ctx, fu.tenant_id);
  const lead = getLead(ctx, fu.tenant_id, fu.lead_id);
  const finish = (status: string, reason?: string) => {
    ctx.db.update("followups", fu.id, { status, executed_at: nowIso(ctx.clock), ...(reason ? { reason } : {}) });
    ctx.bus.publish(tenant.id, "followup", { ...fu, status });
  };

  const closed = ["booked", "won", "lost", "opted_out"].includes(lead.status);
  if (fu.kind !== "reminder" && closed) return finish("skipped", `Lead is ${lead.status}`);
  if (lead.ai_paused && fu.kind !== "reminder" && fu.kind !== "callback") return finish("skipped", "Owner took over the chat");

  const pb = playbookFor(tenant.vertical);
  const variant = variantFor(lead.language, lead.script);
  const firstName = lead.name ? ` ${lead.name.split(" ")[0]}` : "";
  const windowOpen = lead.last_inbound_at ? ctx.clock().getTime() - Date.parse(lead.last_inbound_at) < WA_SESSION_MS : false;

  if (fu.kind === "callback") {
    if (lead.last_inbound_at && lead.missed_at && lead.last_inbound_at > lead.missed_at) return finish("skipped", "Customer replied on WhatsApp");
    await callLead(ctx, tenant, lead, tenant.settings.ownerPhone, "auto");
    return finish("sent");
  }

  let outcome;
  if (fu.kind === "reminder") {
    const booking = ctx.db.get<{ starts_at: string; status: string }>(
      "SELECT starts_at, status FROM bookings WHERE lead_id = ? AND status = 'confirmed' ORDER BY starts_at DESC LIMIT 1",
      lead.id,
    );
    if (!booking) return finish("skipped", "No active booking");
    const vars = { bookingKind: pb.bookingKind[variant], when: formatIst(new Date(booking.starts_at), dateLang(lead.language, lead.script)), address: tenant.settings.address, business: tenant.name };
    const glossVars = { bookingKind: pb.bookingKind.en, when: formatIst(new Date(booking.starts_at), "en") };
    outcome = await sendToLead(ctx, tenant, lead, {
      kind: "reminder",
      author: "system",
      text: windowOpen ? render("wa_booking_reminder", variant, vars) : undefined,
      gloss: windowOpen ? render("wa_booking_reminder", "en", { ...vars, ...glossVars }) : undefined,
      template: { key: "wa_booking_reminder", vars, glossVars },
    });
  } else if (fu.kind === "final") {
    outcome = await sendToLead(ctx, tenant, lead, {
      kind: "followup",
      author: "ai",
      text: windowOpen ? render("wa_final", variant, { name: firstName, business: tenant.name }) : undefined,
      gloss: windowOpen ? render("wa_final", "en", { name: firstName, business: tenant.name }) : undefined,
      template: { key: "wa_final", vars: { name: firstName } },
    });
    if (outcome.status === "sent") updateLead(ctx, lead, { status: lead.status === "new" || lead.status === "contacted" ? "lost" : lead.status });
  } else {
    const missing = pb.slots.find((s) => s.required && !lead.slots[s.key] && s.key !== "preferred_slot");
    const question = missing ? missing.question[variant] : render("ask_time", variant, { bookingKind: pb.bookingKind[variant] });
    const questionEn = missing ? missing.question.en : render("ask_time", "en", { bookingKind: pb.bookingKind.en });
    outcome = await sendToLead(ctx, tenant, lead, {
      kind: "followup",
      author: "ai",
      text: windowOpen ? render("nudge", variant, { name: firstName, question }) : undefined,
      gloss: windowOpen ? render("nudge", "en", { name: firstName, question: questionEn }) : undefined,
      template: { key: "wa_followup", vars: { name: firstName, bookingKind: pb.bookingKind[variant] }, glossVars: { bookingKind: pb.bookingKind.en } },
    });
  }

  if (outcome.status === "deferred") {
    ctx.db.update("followups", fu.id, { due_at: outcome.until.toISOString(), reason: `${fu.reason} (moved out of quiet hours)` });
  } else if (outcome.status === "blocked") {
    finish("skipped", outcome.reason);
  } else {
    finish(outcome.status === "sent" ? "sent" : "failed");
  }
}

export async function callLead(ctx: Ctx, tenant: Tenant, lead: Lead, agentPhone: string, trigger: "auto" | "manual") {
  if (lead.status === "opted_out") throw new Error("Customer opted out");
  const voice = ctx.channels.for(tenant.id).voice;
  const result = await voice.connect(agentPhone || tenant.settings.ownerPhone, lead.phone);
  ctx.db.insert("calls", {
    id: id("call"),
    tenant_id: tenant.id,
    lead_id: lead.id,
    direction: "outbound",
    status: result.ok ? "initiated" : "failed",
    provider: voice.provider,
    provider_id: result.providerId ?? null,
    created_at: nowIso(ctx.clock),
  });
  insertMessage(ctx, {
    tenant_id: tenant.id,
    lead_id: lead.id,
    direction: "out",
    channel: "voice",
    author: "system",
    body: result.ok
      ? `📞 ${trigger === "auto" ? "Auto call-back" : "Call"} bridging ${agentPhone || tenant.settings.ownerPhone} → ${lead.phone}`
      : `📞 Call failed: ${result.error}`,
    gloss: "",
    language: "en",
    template: null,
    status: result.ok ? "sent" : "failed",
    provider_id: result.providerId ?? null,
    meta: { provider: voice.provider, sandbox: voice.sandbox },
  });
  if (!result.ok) throw new Error(result.error ?? "call failed");
  return result;
}
