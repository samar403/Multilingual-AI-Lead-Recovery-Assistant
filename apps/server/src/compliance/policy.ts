import type { Lead, Tenant } from "../types.js";
import { inWindow, nextAllowed } from "../lib/time.js";

export const WA_SESSION_MS = 24 * 60 * 60 * 1000;

export type SendKind =
  | "reply" // direct answer to a message the customer just sent
  | "recovery" // first response to a missed call / enquiry the customer initiated
  | "followup" // proactive nudge
  | "reminder" // transactional booking reminder
  | "agent"; // a human typing from the inbox

export interface Decision {
  allowed: boolean;
  /** "freeform" inside the WhatsApp customer-service window, otherwise an approved template is required. */
  mode: "freeform" | "template";
  reason: string;
  deferUntil?: Date;
}

/**
 * Single gate every outbound message passes through. Encodes:
 *  - opt-outs (STOP / बंद करो / બંધ કરો) are absolute;
 *  - consent mode (implied from a customer-initiated call/enquiry vs explicit only);
 *  - WhatsApp's 24-hour customer-service window → free-form vs approved template;
 *  - TRAI-style quiet hours for automated, proactive outreach (default 21:00–09:00 IST).
 */
export function decide(tenant: Tenant, lead: Pick<Lead, "status" | "consent" | "last_inbound_at">, kind: SendKind, now: Date): Decision {
  if (lead.status === "opted_out" || lead.consent === "revoked") {
    return { allowed: false, mode: "template", reason: "Customer opted out" };
  }

  const windowOpen = lead.last_inbound_at ? now.getTime() - Date.parse(lead.last_inbound_at) < WA_SESSION_MS : false;
  const mode = windowOpen ? "freeform" : "template";

  if (tenant.settings.consentMode === "explicit_only" && lead.consent !== "explicit" && (kind === "followup" || kind === "recovery") && !windowOpen) {
    return { allowed: false, mode, reason: "Explicit consent required for proactive messages" };
  }

  const proactive = kind === "followup" || kind === "reminder";
  const { quietHours } = tenant.settings;
  if (proactive && inWindow(now, quietHours.start, quietHours.end)) {
    return { allowed: false, mode, reason: "Quiet hours", deferUntil: nextAllowed(now, quietHours) };
  }

  return { allowed: true, mode, reason: windowOpen ? "Inside 24h service window" : "Approved template outside service window" };
}

export function sessionWindowClosesAt(lead: Pick<Lead, "last_inbound_at">): Date | null {
  return lead.last_inbound_at ? new Date(Date.parse(lead.last_inbound_at) + WA_SESSION_MS) : null;
}
