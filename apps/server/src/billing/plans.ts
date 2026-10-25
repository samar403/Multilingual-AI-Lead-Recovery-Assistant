// Pricing model: a flat monthly platform fee plus metered communication usage.
// Prices are in paise (₹1 = 100 paise). WhatsApp rates track Meta's India
// per-message pricing with a small margin; free-form replies inside the 24h
// window are free at Meta and stay free here.

export interface Plan {
  id: "starter" | "growth" | "pro";
  name: string;
  monthlyPaise: number;
  includedConversations: number;
  seats: number;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    monthlyPaise: 1_499_00,
    includedConversations: 300,
    seats: 1,
    features: ["WhatsApp + SMS recovery", "Gujarati, Hindi & English AI", "Shared inbox", "Missed-call auto-reply"],
  },
  {
    id: "growth",
    name: "Growth",
    monthlyPaise: 3_999_00,
    includedConversations: 1_500,
    seats: 3,
    features: ["Everything in Starter", "Owner call-back bridge", "IndiaMART / JustDial / website leads", "Smart follow-up cadences", "Booking reminders"],
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPaise: 8_999_00,
    includedConversations: 5_000,
    seats: 10,
    features: ["Everything in Growth", "Multi-branch numbers", "Custom WhatsApp templates", "API & webhooks", "Priority support in Gujarati/Hindi"],
  },
];

export type UsageKind = "wa_service" | "wa_utility" | "wa_marketing" | "sms" | "voice_min" | "ai_reply";

export const USAGE_RATES: Record<UsageKind, { label: string; unit: string; paise: number }> = {
  wa_service: { label: "WhatsApp replies (24h window)", unit: "message", paise: 0 },
  wa_utility: { label: "WhatsApp utility templates", unit: "message", paise: 20 },
  wa_marketing: { label: "WhatsApp follow-up templates", unit: "message", paise: 110 },
  sms: { label: "SMS (DLT)", unit: "segment", paise: 30 },
  voice_min: { label: "Call-back minutes", unit: "minute", paise: 90 },
  ai_reply: { label: "AI replies", unit: "reply", paise: 0 },
};

/** Overage per AI conversation beyond the plan's included conversations. */
export const CONVERSATION_OVERAGE_PAISE = 150;
export const GST_RATE = 0.18;

export function planById(id: string): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[1]!;
}

export function smsSegments(text: string): number {
  // GSM-7 fits 160 chars; any Indic character forces UCS-2 (70 chars).
  const unicode = /[^\x00-\x7F₹]/.test(text);
  const per = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return text.length <= per ? 1 : Math.ceil(text.length / multi);
}
