import type { Intent, Lang, Script, Slots, Tenant } from "../types.js";
import type { Playbook } from "./verticals.js";

export interface Turn {
  author: "customer" | "ai" | "agent" | "system";
  body: string;
}

export interface EngineInput {
  tenant: Tenant;
  playbook: Playbook;
  lead: { name: string; language: Lang; script: Script; slots: Slots; status: string };
  history: Turn[]; // oldest first, excluding `message`
  message: string;
  now: Date;
  offeredSlots: string[]; // ISO instants we proposed in our last message
  activeBooking?: { id: string; startsAt: string } | null;
}

export interface EngineOutput {
  engine: "claude" | "rules";
  reply: string;
  replyGloss: string; // English rendering of `reply`, for the owner's translation lens
  inboundGloss: string; // English rendering of the customer's message
  language: Lang;
  script: Script;
  intent: Intent;
  slots: Slots; // only the slots learned from this message
  name?: string;
  summary: string;
  handoff: boolean;
  bookAt?: string; // ISO instant to book
  cancelBooking?: boolean;
  offeredSlots?: string[];
  budgetRupees?: number;
  usage?: { input: number; output: number };
}

export interface AiEngine {
  readonly name: "claude" | "rules";
  respond(input: EngineInput): Promise<EngineOutput>;
}
