import type { Ctx } from "./context.js";
import type { Lead, Tenant } from "../types.js";
import { cancelPending, scheduleFollowup } from "./followups.js";
import { audit, updateLead } from "./store.js";
import { addMinutes } from "../lib/time.js";
import { id, nowIso } from "../lib/util.js";

export interface Booking {
  id: string;
  tenant_id: string;
  lead_id: string;
  kind: string;
  starts_at: string;
  duration_min: number;
  status: string;
  notes: string;
  created_at: string;
}

export function activeBooking(ctx: Ctx, leadId: string): Booking | undefined {
  return ctx.db.get<Booking>("SELECT * FROM bookings WHERE lead_id = ? AND status = 'confirmed' AND starts_at > ? ORDER BY starts_at LIMIT 1", leadId, ctx.clock().toISOString());
}

/** Creates (or reschedules) the lead's booking and plans reminders. */
export function book(ctx: Ctx, tenant: Tenant, lead: Lead, startsAt: Date, actor: string, notes = ""): Booking {
  const existing = activeBooking(ctx, lead.id);
  if (existing) ctx.db.update("bookings", existing.id, { status: "rescheduled" });

  const booking: Booking = {
    id: id("bk"),
    tenant_id: tenant.id,
    lead_id: lead.id,
    kind: tenant.settings.bookingKind,
    starts_at: startsAt.toISOString(),
    duration_min: tenant.vertical === "salon" ? 60 : 45,
    status: "confirmed",
    notes,
    created_at: nowIso(ctx.clock),
  };
  ctx.db.insert("bookings", booking as unknown as Record<string, unknown>);

  cancelPending(ctx, lead.id, ["nudge", "final", "callback", "reminder"]);
  const now = ctx.clock();
  const hoursAway = (startsAt.getTime() - now.getTime()) / 3_600_000;
  if (hoursAway > 26) scheduleFollowup(ctx, lead, "reminder", addMinutes(startsAt, -24 * 60), { reason: "Day-before reminder" });
  if (hoursAway > 3) scheduleFollowup(ctx, lead, "reminder", addMinutes(startsAt, -120), { reason: "Two-hour reminder" });

  updateLead(ctx, lead, { status: "booked" });
  audit(ctx, tenant.id, actor, existing ? "booking.rescheduled" : "booking.created", `${lead.phone} @ ${booking.starts_at}`);
  ctx.bus.publish(tenant.id, "booking", booking);
  return booking;
}

export function cancelBooking(ctx: Ctx, tenant: Tenant, lead: Lead, actor: string) {
  const existing = activeBooking(ctx, lead.id);
  if (!existing) return;
  ctx.db.update("bookings", existing.id, { status: "cancelled" });
  cancelPending(ctx, lead.id, ["reminder"]);
  updateLead(ctx, lead, { status: "qualified" });
  audit(ctx, tenant.id, actor, "booking.cancelled", lead.phone);
  ctx.bus.publish(tenant.id, "booking", { ...existing, status: "cancelled" });
}
