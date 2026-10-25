import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { AiEngine, EngineInput, EngineOutput } from "./types.js";
import type { Intent, Slots } from "../types.js";
import { buildSystemPrompt } from "./prompts.js";
import { RulesEngine, suggestSlots } from "./rules-engine.js";
import { extractSlots } from "./nlu.js";
import { formatIst } from "../lib/time.js";

const INTENTS = [
  "greeting", "inquiry", "pricing", "booking", "reschedule", "cancel", "location",
  "human", "not_interested", "thanks", "complaint", "other",
] as const;

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };

function outputSchema(slotKeys: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "reply", "reply_english", "customer_message_english", "language", "script", "intent",
      "slots", "customer_name", "summary", "handoff", "book_at", "cancel_booking",
    ],
    properties: {
      reply: { type: "string" },
      reply_english: { type: "string" },
      customer_message_english: { type: "string" },
      language: { type: "string", enum: ["en", "hi", "gu"] },
      script: { type: "string", enum: ["native", "latin"] },
      intent: { type: "string", enum: [...INTENTS] },
      slots: {
        type: "object",
        additionalProperties: false,
        required: slotKeys,
        properties: Object.fromEntries(slotKeys.map((k) => [k, nullableString])),
      },
      customer_name: nullableString,
      summary: { type: "string" },
      handoff: { type: "boolean" },
      book_at: nullableString,
      cancel_booking: { type: "boolean" },
    },
  };
}

const Output = z.object({
  reply: z.string().min(1),
  reply_english: z.string(),
  customer_message_english: z.string(),
  language: z.enum(["en", "hi", "gu"]),
  script: z.enum(["native", "latin"]),
  intent: z.enum(INTENTS),
  slots: z.record(z.string().nullable()),
  customer_name: z.string().nullable(),
  summary: z.string(),
  handoff: z.boolean(),
  book_at: z.string().nullable(),
  cancel_booking: z.boolean(),
});

export interface ClaudeEngineOptions {
  apiKey: string;
  model: string;
  effort: "low" | "medium" | "high";
  timeoutMs: number;
}

/**
 * Claude-backed engine. One structured-output call per inbound message returns
 * the reply, both translations, intent and extracted slots. Any failure (network,
 * refusal, schema mismatch) falls back to the deterministic rules engine.
 */
export class ClaudeEngine implements AiEngine {
  readonly name = "claude" as const;
  private readonly client: Anthropic;
  private readonly fallback = new RulesEngine();

  constructor(private readonly opts: ClaudeEngineOptions) {
    this.client = new Anthropic({ apiKey: opts.apiKey, timeout: opts.timeoutMs, maxRetries: 1 });
  }

  async respond(input: EngineInput): Promise<EngineOutput> {
    try {
      return await this.callClaude(input);
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) console.warn("[ai] rate limited, using rules engine");
      else if (err instanceof Anthropic.APIError) console.warn(`[ai] API error ${err.status}, using rules engine`);
      else console.warn("[ai] falling back to rules engine:", (err as Error).message);
      return this.fallback.respond(input);
    }
  }

  private async callClaude(input: EngineInput): Promise<EngineOutput> {
    const { tenant, playbook, now } = input;
    const slotKeys = playbook.slots.map((s) => s.key);
    const available = suggestSlots(tenant, now);

    const messages: Anthropic.Beta.BetaMessageParam[] = [];
    for (const turn of input.history.slice(-16)) {
      const role = turn.author === "customer" ? "user" : "assistant";
      const last = messages[messages.length - 1];
      if (last && last.role === role) last.content = `${last.content as string}\n${turn.body}`;
      else messages.push({ role, content: turn.body });
    }
    if (messages[0]?.role === "assistant") messages.unshift({ role: "user", content: "(customer gave a missed call)" });

    const context = {
      now_ist: formatIst(now, "en"),
      now_iso: now.toISOString(),
      known_customer_name: input.lead.name || null,
      known_slots: input.lead.slots,
      last_detected_language: `${input.lead.language} (${input.lead.script})`,
      available_slots: available.map((iso) => ({ iso, label: formatIst(new Date(iso), "en") })),
      slots_we_offered_last: input.offeredSlots,
      active_booking: input.activeBooking ?? null,
    };
    const userTurn = `<context>${JSON.stringify(context)}</context>\n<customer_message>${input.message}</customer_message>`;
    const last = messages[messages.length - 1];
    if (last && last.role === "user") last.content = `${last.content as string}\n${userTurn}`;
    else messages.push({ role: "user", content: userTurn });

    const response = await this.client.beta.messages.create({
      model: this.opts.model,
      max_tokens: 2048,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: buildSystemPrompt(tenant, playbook), cache_control: { type: "ephemeral" } }],
      output_config: { effort: this.opts.effort, format: { type: "json_schema", schema: outputSchema(slotKeys) } },
      messages,
    });

    if (response.stop_reason === "refusal") throw new Error("model declined");
    if (response.stop_reason === "max_tokens") throw new Error("output truncated");
    const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text;
    if (!text) throw new Error("no text block");
    const parsed = Output.parse(JSON.parse(text));

    // Merge with the deterministic extractors: they are exact for budgets,
    // BHK and dates, so they fill anything the model left empty.
    const rules = extractSlots(input.message, playbook.slots, tenant.settings.localities, now);
    const learned: Slots = {};
    for (const key of slotKeys) {
      const v = parsed.slots[key];
      if (v && v !== input.lead.slots[key]) learned[key] = v;
    }
    for (const [k, v] of Object.entries(rules.slots)) if (!learned[k]) learned[k] = v;

    let bookAt: string | undefined;
    if (parsed.book_at) {
      const at = new Date(parsed.book_at);
      if (!Number.isNaN(at.getTime()) && at.getTime() > now.getTime()) {
        bookAt = at.toISOString();
        learned.preferred_slot = bookAt;
      }
    }
    if (learned.preferred_slot && !Number.isNaN(Date.parse(learned.preferred_slot))) {
      learned.preferred_slot = new Date(learned.preferred_slot).toISOString();
    }

    const merged = { ...input.lead.slots, ...learned };
    const requiredDone = playbook.slots.filter((s) => s.required && s.key !== "preferred_slot").every((s) => merged[s.key]);
    if (bookAt && !requiredDone) bookAt = undefined;

    return {
      engine: "claude",
      reply: parsed.reply,
      replyGloss: parsed.reply_english,
      inboundGloss: parsed.customer_message_english,
      language: parsed.language,
      script: parsed.script,
      intent: parsed.intent as Intent,
      slots: learned,
      name: parsed.customer_name ?? undefined,
      summary: parsed.summary,
      handoff: parsed.handoff,
      bookAt,
      cancelBooking: parsed.cancel_booking && Boolean(input.activeBooking),
      offeredSlots: requiredDone && !bookAt && !input.activeBooking ? available : undefined,
      budgetRupees: rules.budgetRupees,
      usage: {
        input: response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0),
        output: response.usage.output_tokens,
      },
    };
  }
}
