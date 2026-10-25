export type Lang = "en" | "hi" | "gu";
export type Script = "native" | "latin";
export type Vertical = "coaching" | "real_estate" | "salon" | "services";
export type Channel = "whatsapp" | "sms" | "voice" | "web" | "note";
export type Author = "customer" | "ai" | "agent" | "system";

export type LeadStatus =
  | "new"
  | "contacted"
  | "engaged"
  | "qualified"
  | "booked"
  | "won"
  | "lost"
  | "opted_out";

export type Temperature = "hot" | "warm" | "cold";

export type Intent =
  | "greeting"
  | "inquiry"
  | "pricing"
  | "booking"
  | "reschedule"
  | "cancel"
  | "location"
  | "human"
  | "not_interested"
  | "opt_out"
  | "thanks"
  | "complaint"
  | "other";

export interface BusinessHours {
  open: string; // "09:30"
  close: string; // "20:00"
  days: number[]; // 0 = Sunday
}

export interface TenantSettings {
  hours: BusinessHours;
  quietHours: { start: string; end: string }; // TRAI-safe window for automated outreach
  localities: string[];
  offerings: string[];
  priceNote: string;
  address: string;
  bookingKind: string;
  avgDealValue: number; // in rupees, used for "₹ recovered"
  consentMode: "implied_inbound" | "explicit_only";
  cadence: { nudgeAfterMin: number; secondNudgeAfterMin: number; finalNudgeAfterMin: number; callbackAfterMin: number };
  ownerPhone: string;
  aiPersona: string;
  autoReply: boolean;
}

export interface Tenant {
  id: string;
  name: string;
  vertical: Vertical;
  city: string;
  phone: string;
  default_lang: Lang;
  plan: string;
  webhook_key: string;
  settings: TenantSettings;
  created_at: string;
}

export type Slots = Record<string, string>;

export interface Lead {
  id: string;
  tenant_id: string;
  name: string;
  phone: string;
  language: Lang;
  script: Script;
  source: string;
  status: LeadStatus;
  score: number;
  temperature: Temperature;
  intent: string;
  slots: Slots;
  summary: string;
  value_estimate: number;
  ai_paused: number;
  consent: string;
  notes: string;
  first_response_ms: number | null;
  missed_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  tenant_id: string;
  lead_id: string;
  direction: "in" | "out";
  channel: Channel;
  author: Author;
  body: string;
  gloss: string;
  language: string;
  template: string | null;
  status: string;
  provider_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface User {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  ui_lang: string;
  created_at: string;
}
