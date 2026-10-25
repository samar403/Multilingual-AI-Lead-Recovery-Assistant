import type { Intent, Slots, Temperature } from "../types.js";
import type { Playbook } from "./verticals.js";

export interface ScoreInput {
  playbook: Playbook;
  slots: Slots;
  intents: Intent[]; // every intent seen in the conversation, oldest first
  inboundCount: number;
  replyLatencyMin?: number; // how fast the customer replied to our last message
  booked: boolean;
}

export interface ScoreResult {
  score: number;
  temperature: Temperature;
  reasons: string[];
}

/**
 * Explainable lead score (0-100). Owners see the reasons next to the number,
 * which matters more to them than a black-box probability.
 */
export function scoreLead(input: ScoreInput): ScoreResult {
  const reasons: string[] = [];
  let score = 10;

  const required = input.playbook.slots.filter((s) => s.required);
  const filled = required.filter((s) => input.slots[s.key]);
  const completeness = required.length ? filled.length / required.length : 0;
  score += Math.round(completeness * 40);
  if (filled.length) reasons.push(`${filled.length}/${required.length} qualifying details shared`);

  if (input.slots.preferred_slot) {
    score += 10;
    reasons.push("Gave a preferred time");
  }
  if (input.intents.includes("booking")) {
    score += 15;
    reasons.push("Asked to book / visit");
  }
  if (input.intents.includes("pricing")) {
    score += 8;
    reasons.push("Asked about price");
  }
  if (input.inboundCount >= 3) {
    score += 7;
    reasons.push("Engaged conversation");
  }
  if (input.replyLatencyMin !== undefined && input.replyLatencyMin <= 10) {
    score += 5;
    reasons.push("Replies quickly");
  }
  if (input.booked) {
    score = Math.max(score, 85);
    reasons.push("Booking confirmed");
  }
  if (input.intents.includes("not_interested")) {
    score -= 45;
    reasons.push("Said not interested");
  }
  if (input.intents.includes("complaint")) {
    score -= 10;
    reasons.push("Raised a complaint");
  }

  score = Math.max(0, Math.min(100, score));
  const temperature: Temperature = score >= 70 ? "hot" : score >= 40 ? "warm" : "cold";
  return { score, temperature, reasons };
}
