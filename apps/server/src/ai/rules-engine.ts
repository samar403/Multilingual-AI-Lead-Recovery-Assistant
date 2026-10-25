import type { Intent, Slots, Tenant } from "../types.js";
import type { AiEngine, EngineInput, EngineOutput } from "./types.js";
import type { Playbook, SlotDef } from "./verticals.js";
import { detectLanguage, variantFor, type Variant } from "../i18n/language.js";
import { render } from "../i18n/templates.js";
import { detectIntent, extractName, extractSlots, isAffirmative, normalize } from "./nlu.js";
import { dateLang, formatIst, fromIst, hhmmToMinutes, istParts, inWindow } from "../lib/time.js";

/**
 * Deterministic engine: trilingual NLU + playbook-driven dialogue. It is the
 * offline/default brain and the fallback whenever the LLM is unavailable, so
 * a lead is never left without an answer.
 */
export class RulesEngine implements AiEngine {
  readonly name = "rules" as const;

  async respond(input: EngineInput): Promise<EngineOutput> {
    const { tenant, playbook, now } = input;
    const guess = detectLanguage(input.message, input.lead.language);
    const language = guess.confidence >= 0.3 ? guess.lang : input.lead.language;
    const script = guess.confidence >= 0.3 ? guess.script : input.lead.script;
    const variant = variantFor(language, script);

    let intent = detectIntent(input.message);
    const extracted = extractSlots(input.message, playbook.slots, tenant.settings.localities, now);
    const learned: Slots = { ...extracted.slots };
    const name = extractName(input.message);

    // "1" / "2" / "yes" in reply to slots we offered.
    const choice = normalize(input.message).match(/^\s*([12])\s*$/);
    if (input.offeredSlots.length && !learned.preferred_slot) {
      if (choice) learned.preferred_slot = input.offeredSlots[Number(choice[1]) - 1] ?? input.offeredSlots[0]!;
      else if (isAffirmative(input.message) && intent !== "not_interested") learned.preferred_slot = input.offeredSlots[0]!;
    }
    if (learned.preferred_slot && intent === "inquiry") intent = "booking";
    // Replies to a booking reminder ("1 to confirm, 2 to reschedule").
    if (input.activeBooking && !input.offeredSlots.length && !learned.preferred_slot) {
      if (choice?.[1] === "2") intent = "reschedule";
      else if (choice?.[1] === "1" || (isAffirmative(input.message) && intent === "inquiry")) intent = "thanks";
    }

    const slots: Slots = { ...input.lead.slots, ...learned };
    const requiredDone = playbook.slots.filter((s) => s.required && s.key !== "preferred_slot").every((s) => slots[s.key]);

    let handoff = false;
    let bookAt: string | undefined;
    let cancelBooking = false;
    let offeredSlots: string[] | undefined;
    let afterHours = false;

    // A plan is rendered twice: in the customer's variant and in English (the gloss).
    type Plan = { key: string; extra?: (v: Variant) => Record<string, string> };
    let plan: Plan;
    const lang = (v: Variant) => (v === "en" ? "en" : dateLang(language, script));
    const questionFor = (v: Variant) => nextQuestion(playbook.slots, slots, v) ?? render("ask_time", v, baseVars(tenant, playbook, v, input.lead.name));
    const offerFor = (v: Variant) =>
      render("offer_booking", v, {
        ...baseVars(tenant, playbook, v, input.lead.name),
        slotA: formatIst(new Date(offeredSlots![0]!), lang(v)),
        slotB: formatIst(new Date(offeredSlots![1]!), lang(v)),
      });
    const whenFor = (iso: string) => (v: Variant) => ({ when: formatIst(new Date(iso), lang(v)) });

    switch (intent) {
      case "complaint":
        plan = { key: "complaint" };
        handoff = true;
        break;
      case "human":
        plan = { key: "handoff" };
        handoff = true;
        break;
      case "not_interested":
        plan = { key: "not_interested" };
        break;
      case "cancel":
        cancelBooking = Boolean(input.activeBooking);
        plan = { key: input.activeBooking ? "cancelled" : "not_interested" };
        break;
      case "thanks":
        plan = input.activeBooking || input.lead.status === "booked" ? { key: "thanks" } : { key: "ack_next", extra: (v) => ({ question: questionFor(v) }) };
        break;
      default: {
        if (learned.preferred_slot && (requiredDone || input.activeBooking) && (!input.activeBooking || intent === "reschedule" || intent === "booking")) {
          bookAt = learned.preferred_slot;
          plan = { key: "booking_confirmed", extra: whenFor(bookAt) };
          afterHours = !isOpen(tenant, now);
          break;
        }
        if (intent === "reschedule" && input.activeBooking) {
          plan = { key: "ask_time" };
          break;
        }
        if (requiredDone && !input.activeBooking) {
          offeredSlots = suggestSlots(tenant, now);
          if (intent === "pricing" || intent === "location") plan = { key: intent, extra: (v) => ({ question: offerFor(v) }) };
          else plan = { key: "offer_booking", extra: (v) => ({ slotA: formatIst(new Date(offeredSlots![0]!), lang(v)), slotB: formatIst(new Date(offeredSlots![1]!), lang(v)) }) };
          break;
        }
        if (input.activeBooking) {
          plan = intent === "location" || intent === "pricing" ? { key: intent, extra: () => ({ question: "" }) } : { key: "thanks" };
          break;
        }
        const firstContact = input.history.filter((t) => t.author === "customer").length === 0 && Object.keys(learned).length === 0;
        const key = intent === "pricing" || intent === "location" ? intent : intent === "greeting" && firstContact ? "greeting" : "ack_next";
        plan = { key, extra: (v) => ({ question: questionFor(v) }) };
      }
    }

    const renderPlan = (v: Variant) => {
      const text = render(plan.key, v, { ...baseVars(tenant, playbook, v, input.lead.name), ...(plan.extra?.(v) ?? {}) });
      return afterHours ? `${text}\n${render("after_hours", v)}` : text;
    };
    const reply = renderPlan(variant);

    return {
      engine: "rules",
      reply,
      replyGloss: renderPlan("en"),
      inboundGloss: glossInbound(intent, learned, playbook),
      language,
      script,
      intent,
      slots: learned,
      name,
      summary: summarize(playbook, slots, intent),
      handoff,
      bookAt,
      cancelBooking,
      offeredSlots,
      budgetRupees: extracted.budgetRupees,
    };
  }
}

const OWNER_LABEL: Record<Variant, string> = { en: "our team", hi: "हमारी टीम", gu: "અમારી ટીમ", hi_latn: "hamari team", gu_latn: "amari team" };

function baseVars(tenant: Tenant, playbook: Playbook, variant: Variant, leadName: string): Record<string, string> {
  return {
    business: tenant.name,
    bookingKind: playbook.bookingKind[variant],
    // A custom price note is written in one language; use it as-is, else the localised default.
    priceNote: tenant.settings.priceNote || playbook.defaultPriceNote[variant],
    address: tenant.settings.address,
    owner: OWNER_LABEL[variant],
    name: leadName ? ` ${leadName.split(" ")[0]}` : "",
  };
}

function nextQuestion(defs: SlotDef[], slots: Slots, variant: Variant): string | undefined {
  const missing = defs.find((d) => d.required && !slots[d.key] && d.key !== "preferred_slot");
  return missing?.question[variant];
}

function glossInbound(intent: Intent, learned: Slots, playbook: Playbook): string {
  const parts = Object.entries(learned).map(([k, v]) => {
    const label = playbook.slots.find((s) => s.key === k)?.label.en ?? k;
    const value = /T\d\d:/.test(v) ? formatIst(new Date(v), "en") : v;
    return `${label}: ${value}`;
  });
  const intentLabel: Partial<Record<Intent, string>> = {
    pricing: "Asking about price",
    booking: "Wants to book",
    location: "Asking for address",
    human: "Wants to talk to a person",
    complaint: "Complaint",
    not_interested: "Not interested",
    greeting: "Greeting",
    thanks: "Says thanks",
    cancel: "Wants to cancel",
    reschedule: "Wants to reschedule",
    opt_out: "Asked to stop messages",
  };
  const head = intentLabel[intent];
  return [head, ...parts].filter(Boolean).join(" · ") || "General enquiry";
}

function summarize(playbook: Playbook, slots: Slots, intent: Intent): string {
  const bits = playbook.slots
    .filter((s) => slots[s.key])
    .map((s) => (s.type === "slot" ? `prefers ${formatIst(new Date(slots[s.key]!), "en")}` : slots[s.key]));
  const head = `${playbook.label.en} lead`;
  return bits.length ? `${head}: ${bits.join(", ")}${intent === "not_interested" ? " (not interested)" : ""}` : head;
}

export function isOpen(tenant: Tenant, now: Date): boolean {
  const { hours } = tenant.settings;
  return hours.days.includes(istParts(now).weekday) && inWindow(now, hours.open, hours.close);
}

/** Two upcoming bookable slots: next open morning and next open evening. */
export function suggestSlots(tenant: Tenant, now: Date): string[] {
  const { hours } = tenant.settings;
  const open = hhmmToMinutes(hours.open);
  const close = hhmmToMinutes(hours.close);
  const morning = Math.min(open + 90, close - 60);
  const evening = Math.max(close - 180, morning + 120);
  const out: string[] = [];
  const p = istParts(now);
  for (let d = 0; d < 10 && out.length < 2; d++) {
    for (const minutes of [morning, evening]) {
      const at = fromIst(p.year, p.month, p.day + d, Math.floor(minutes / 60), minutes % 60);
      const wd = istParts(at).weekday;
      if (at.getTime() > now.getTime() + 2 * 3_600_000 && hours.days.includes(wd) && out.length < 2) out.push(at.toISOString());
    }
  }
  return out;
}
