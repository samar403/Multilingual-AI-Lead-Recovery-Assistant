import type { Ctx } from "./context.js";
import type { Tenant } from "../types.js";
import { hydrateLead } from "./store.js";
import { istParts, fromIst } from "../lib/time.js";

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const ENGAGED = ["engaged", "qualified", "booked", "won"];

export function dashboard(ctx: Ctx, tenant: Tenant, days = 30) {
  const now = ctx.clock();
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const leads = ctx.db.all<Parameters<typeof hydrateLead>[0]>("SELECT * FROM leads WHERE tenant_id = ? AND created_at >= ? ORDER BY created_at DESC", tenant.id, since).map(hydrateLead);

  const missedCalls = ctx.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM calls WHERE tenant_id = ? AND status = 'missed' AND created_at >= ?", tenant.id, since)?.n ?? 0;
  const recovered = leads.filter((l) => ENGAGED.includes(l.status));
  const booked = leads.filter((l) => l.status === "booked" || l.status === "won");
  const responseTimes = leads.map((l) => l.first_response_ms).filter((v): v is number => v !== null);
  const golden = responseTimes.filter((ms) => ms <= 60_000).length;

  const byLang = { gu: 0, hi: 0, en: 0 } as Record<string, number>;
  const bySource: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const l of leads) {
    byLang[l.language] = (byLang[l.language] ?? 0) + 1;
    bySource[l.source] = (bySource[l.source] ?? 0) + 1;
    byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;
  }

  // Daily series (IST days)
  const p = istParts(now);
  const series = Array.from({ length: Math.min(days, 14) }, (_, i) => {
    const start = fromIst(p.year, p.month, p.day - (Math.min(days, 14) - 1 - i));
    const end = new Date(start.getTime() + 86_400_000);
    const inDay = leads.filter((l) => l.created_at >= start.toISOString() && l.created_at < end.toISOString());
    return {
      date: start.toISOString(),
      leads: inDay.length,
      recovered: inDay.filter((l) => ENGAGED.includes(l.status)).length,
      booked: inDay.filter((l) => l.status === "booked" || l.status === "won").length,
    };
  });

  const recoveredRevenue = booked.reduce((s, l) => s + l.value_estimate, 0);
  const attention = ctx.db.all<{ id: string; name: string; phone: string; language: string; intent: string; updated_at: string }>(
    "SELECT id, name, phone, language, intent, updated_at FROM leads WHERE tenant_id = ? AND ai_paused = 1 AND status NOT IN ('lost','won','opted_out') ORDER BY updated_at DESC LIMIT 8",
    tenant.id,
  );
  const upcoming = ctx.db.all<{ id: string; lead_id: string; name: string; phone: string; starts_at: string; kind: string }>(
    `SELECT b.id, b.lead_id, l.name, l.phone, b.starts_at, b.kind FROM bookings b JOIN leads l ON l.id = b.lead_id
     WHERE b.tenant_id = ? AND b.status = 'confirmed' AND b.starts_at >= ? ORDER BY b.starts_at LIMIT 6`,
    tenant.id, now.toISOString(),
  );
  const feed = ctx.db.all<{ id: string; lead_id: string; name: string; phone: string; direction: string; author: string; channel: string; body: string; gloss: string; created_at: string }>(
    `SELECT m.id, m.lead_id, l.name, l.phone, m.direction, m.author, m.channel, m.body, m.gloss, m.created_at
     FROM messages m JOIN leads l ON l.id = m.lead_id WHERE m.tenant_id = ? ORDER BY m.created_at DESC, m.rowid DESC LIMIT 12`,
    tenant.id,
  );

  return {
    period: { days, since },
    kpis: {
      leads: leads.length,
      missedCalls,
      recovered: recovered.length,
      recoveryRate: leads.length ? recovered.length / leads.length : 0,
      booked: booked.length,
      bookingRate: leads.length ? booked.length / leads.length : 0,
      recoveredRevenue,
      medianFirstResponseSec: (() => {
        const m = median(responseTimes);
        return m === null ? null : Math.round(m / 1000);
      })(),
      goldenMinuteRate: responseTimes.length ? golden / responseTimes.length : 0,
      hot: leads.filter((l) => l.temperature === "hot" && !["lost", "opted_out"].includes(l.status)).length,
    },
    byLang,
    bySource,
    byStatus,
    series,
    radar: leads
      .filter((l) => !["lost", "opted_out"].includes(l.status))
      .slice(0, 80)
      .map((l) => ({ id: l.id, name: l.name, phone: l.phone, status: l.status, score: l.score, temperature: l.temperature, language: l.language, source: l.source, created_at: l.created_at })),
    attention,
    upcoming,
    feed,
  };
}
