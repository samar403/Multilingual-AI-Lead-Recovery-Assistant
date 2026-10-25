import type { Ctx } from "./context.js";
import { CONVERSATION_OVERAGE_PAISE, GST_RATE, planById, USAGE_RATES, type UsageKind } from "../billing/plans.js";
import { id, nowIso } from "../lib/util.js";
import { fromIst, istParts } from "../lib/time.js";

export function recordUsage(ctx: Ctx, tenantId: string, kind: UsageKind, quantity: number, ref = "") {
  ctx.db.insert("usage_events", {
    id: id("use"),
    tenant_id: tenantId,
    kind,
    quantity,
    unit_price_paise: USAGE_RATES[kind].paise,
    ref,
    created_at: nowIso(ctx.clock),
  });
}

export function billingCycle(now: Date): { start: Date; end: Date } {
  const p = istParts(now);
  return { start: fromIst(p.year, p.month, 1), end: fromIst(p.year, p.month + 1, 1) };
}

export interface InvoiceLine {
  kind: string;
  label: string;
  quantity: number;
  unit: string;
  unitPaise: number;
  amountPaise: number;
}

export function invoicePreview(ctx: Ctx, tenantId: string, planId: string) {
  const now = ctx.clock();
  const { start, end } = billingCycle(now);
  const plan = planById(planId);

  const rows = ctx.db.all<{ kind: UsageKind; qty: number; amount: number }>(
    `SELECT kind, SUM(quantity) AS qty, SUM(quantity * unit_price_paise) AS amount
     FROM usage_events WHERE tenant_id = ? AND created_at >= ? AND created_at < ? GROUP BY kind`,
    tenantId, start.toISOString(), end.toISOString(),
  );
  const conversations = ctx.db.get<{ n: number }>(
    `SELECT COUNT(DISTINCT ref) AS n FROM usage_events WHERE tenant_id = ? AND kind = 'ai_reply' AND created_at >= ? AND created_at < ?`,
    tenantId, start.toISOString(), end.toISOString(),
  )?.n ?? 0;

  const lines: InvoiceLine[] = [
    { kind: "plan", label: `${plan.name} plan (monthly)`, quantity: 1, unit: "month", unitPaise: plan.monthlyPaise, amountPaise: plan.monthlyPaise },
  ];
  for (const kind of Object.keys(USAGE_RATES) as UsageKind[]) {
    const row = rows.find((r) => r.kind === kind);
    if (!row || kind === "ai_reply") continue;
    const rate = USAGE_RATES[kind];
    lines.push({ kind, label: rate.label, quantity: Math.round(row.qty * 100) / 100, unit: rate.unit, unitPaise: rate.paise, amountPaise: Math.round(row.amount) });
  }
  const overage = Math.max(0, conversations - plan.includedConversations);
  if (overage > 0) {
    lines.push({ kind: "overage", label: "AI conversations above plan", quantity: overage, unit: "conversation", unitPaise: CONVERSATION_OVERAGE_PAISE, amountPaise: overage * CONVERSATION_OVERAGE_PAISE });
  }
  const subtotal = lines.reduce((s, l) => s + l.amountPaise, 0);
  const gst = Math.round(subtotal * GST_RATE);
  return {
    plan,
    cycle: { start: start.toISOString(), end: end.toISOString() },
    conversations: { used: conversations, included: plan.includedConversations },
    lines,
    subtotalPaise: subtotal,
    gstPaise: gst,
    totalPaise: subtotal + gst,
  };
}

/** Ledger ("bahi-khata") of individual metered events for the billing page. */
export function usageLedger(ctx: Ctx, tenantId: string, limit = 60) {
  return ctx.db.all<{ id: string; kind: UsageKind; quantity: number; unit_price_paise: number; ref: string; created_at: string }>(
    "SELECT id, kind, quantity, unit_price_paise, ref, created_at FROM usage_events WHERE tenant_id = ? AND kind != 'ai_reply' ORDER BY created_at DESC LIMIT ?",
    tenantId, limit,
  ).map((r) => ({ ...r, label: USAGE_RATES[r.kind].label, amountPaise: Math.round(r.quantity * r.unit_price_paise) }));
}
