import { Router } from "express";
import { z } from "zod";
import type { Ctx } from "../services/context.js";
import { ah, parse, rateLimit } from "./middleware.js";
import { playgroundTenant } from "../demo/fixtures.js";
import { playbookFor } from "../ai/verticals.js";
import { scoreLead } from "../ai/scoring.js";
import type { Intent } from "../types.js";
import { render } from "../i18n/templates.js";
import { variantFor } from "../i18n/language.js";

/**
 * Public, stateless demo used by the landing page: a visitor plays the customer
 * and watches the assistant reply and extract details live. The browser keeps
 * the conversation state; nothing is stored.
 */
export function playgroundRouter(ctx: Ctx): Router {
  const r = Router();
  const limiter = rateLimit({ windowMs: 60_000, max: 30 });

  r.post("/start", limiter, ah((req, res) => {
    const body = parse(z.object({ vertical: z.enum(["coaching", "real_estate", "salon", "services"]), language: z.enum(["en", "hi", "gu"]).default("gu") }), req.body);
    const tenant = playgroundTenant(body.vertical);
    const variant = variantFor(body.language, "native");
    res.json({
      business: { name: tenant.name, city: tenant.city, address: tenant.settings.address },
      opening: render("wa_missed_call", variant, { name: "", business: tenant.name }),
      openingGloss: render("wa_missed_call", "en", { name: "", business: tenant.name }),
      slots: playbookFor(body.vertical).slots.map((s) => ({ key: s.key, label: s.label, required: s.required })),
    });
  }));

  r.post("/chat", limiter, ah(async (req, res) => {
    const body = parse(
      z.object({
        vertical: z.enum(["coaching", "real_estate", "salon", "services"]),
        message: z.string().min(1).max(500),
        history: z.array(z.object({ author: z.enum(["customer", "ai"]), body: z.string().max(1200) })).max(30).default([]),
        slots: z.record(z.string()).default({}),
        language: z.enum(["en", "hi", "gu"]).default("gu"),
        script: z.enum(["native", "latin"]).default("native"),
        offeredSlots: z.array(z.string()).max(4).default([]),
        intents: z.array(z.string()).max(40).default([]),
        booking: z.string().nullable().default(null),
      }),
      req.body,
    );
    const tenant = playgroundTenant(body.vertical);
    const pb = playbookFor(body.vertical);
    const started = Date.now();
    const out = await ctx.engine.respond({
      tenant,
      playbook: pb,
      lead: { name: "", language: body.language, script: body.script, slots: body.slots, status: body.booking ? "booked" : "engaged" },
      history: body.history,
      message: body.message,
      now: ctx.clock(),
      offeredSlots: body.offeredSlots,
      activeBooking: body.booking ? { id: "demo", startsAt: body.booking } : null,
    });
    const slots = { ...body.slots, ...out.slots };
    const booking = out.cancelBooking ? null : out.bookAt ?? body.booking;
    const intents = [...(body.intents as Intent[]), out.intent];
    const score = scoreLead({ playbook: pb, slots, intents, inboundCount: body.history.filter((h) => h.author === "customer").length + 1, replyLatencyMin: 1, booked: Boolean(booking) });
    res.json({
      reply: out.reply,
      replyGloss: out.replyGloss,
      inboundGloss: out.inboundGloss,
      language: out.language,
      script: out.script,
      intent: out.intent,
      learned: out.slots,
      slots,
      summary: out.summary,
      handoff: out.handoff,
      booking,
      offeredSlots: out.offeredSlots ?? [],
      score,
      engine: out.engine,
      latencyMs: Date.now() - started,
    });
  }));

  return r;
}
