import { describe, expect, it } from "vitest";
import { makeCtx, makeTenant } from "./helpers.js";
import { handleInbound, handleMissedCall, handleFormLead } from "../src/services/conversation.js";
import { runDueFollowups } from "../src/services/followups.js";
import { invoicePreview } from "../src/services/billing.js";
import { getLead, listMessages } from "../src/services/store.js";

const PHONE = "+919824011111";

describe("missed call → WhatsApp → qualified → booked", () => {
  it("recovers a Gujarati lead end to end", async () => {
    const { ctx, advance } = makeCtx();
    const tenant = makeTenant(ctx, "coaching");
    const sandbox = ctx.channels.sandboxFor(tenant.id);

    const missed = await handleMissedCall(ctx, tenant, { phone: PHONE, name: "Hetal Patel" });
    expect(missed.outcome?.status).toBe("sent");
    expect(sandbox.whatsapp.outbox[0]!.template?.name).toBe("vaani_missed_call");
    expect(sandbox.whatsapp.outbox[0]!.template?.params).toEqual(["Hetal", "Shiksha Academy"]);
    expect(missed.lead.status).toBe("contacted");
    expect(missed.lead.first_response_ms).not.toBeNull();

    advance(3);
    let r = await handleInbound(ctx, tenant, { phone: PHONE, text: "નમસ્તે, JEE માટે કોચિંગ જોઈએ છે" });
    expect(r.lead.language).toBe("gu");
    expect(r.lead.slots.course).toBe("JEE");
    expect(r.reply?.status).toBe("sent");
    expect(sandbox.whatsapp.outbox.at(-1)!.template).toBeUndefined(); // free-form inside 24h window
    expect(sandbox.whatsapp.outbox.at(-1)!.text).toMatch(/ધોરણ/);

    advance(2);
    r = await handleInbound(ctx, tenant, { phone: PHONE, text: "ધોરણ 11 માં છે" });
    expect(r.lead.status).toBe("qualified");
    expect(r.engine?.offeredSlots).toHaveLength(2);

    advance(2);
    r = await handleInbound(ctx, tenant, { phone: PHONE, text: "1" });
    expect(r.lead.status).toBe("booked");
    expect(r.lead.score).toBeGreaterThanOrEqual(85);
    const bookings = ctx.db.all<{ status: string }>("SELECT status FROM bookings WHERE lead_id = ?", r.lead.id);
    expect(bookings).toEqual([{ status: "confirmed" }]);
    const reminders = ctx.db.all("SELECT * FROM followups WHERE lead_id = ? AND kind = 'reminder' AND status = 'pending'", r.lead.id);
    expect(reminders.length).toBeGreaterThan(0);
    const nudges = ctx.db.all("SELECT * FROM followups WHERE lead_id = ? AND kind = 'nudge' AND status = 'pending'", r.lead.id);
    expect(nudges).toHaveLength(0);

    // Every AI message carries an English gloss for the owner.
    const ai = listMessages(ctx, r.lead.id).filter((m) => m.author === "ai");
    expect(ai.every((m) => m.gloss.length > 0)).toBe(true);
  });

  it("mirrors romanised Hindi in Latin script", async () => {
    const { ctx } = makeCtx();
    const tenant = makeTenant(ctx, "coaching");
    await handleMissedCall(ctx, tenant, { phone: PHONE });
    const r = await handleInbound(ctx, tenant, { phone: PHONE, text: "NEET ke liye coaching chahiye, kitna fees hai?" });
    expect(r.lead.language).toBe("hi");
    expect(r.lead.script).toBe("latin");
    const reply = r.reply?.status === "sent" ? r.reply.message.body : "";
    expect(reply).toMatch(/Fees|fees/);
    expect(reply).not.toMatch(/[ऀ-ॿ]/);
  });

  it("qualifies a real-estate lead from one code-mixed message", async () => {
    const { ctx } = makeCtx();
    const tenant = makeTenant(ctx, "real_estate");
    await handleMissedCall(ctx, tenant, { phone: PHONE });
    const r = await handleInbound(ctx, tenant, { phone: PHONE, text: "2 BHK kharidvu che, Bopal ma, budget 55 lakh" });
    expect(r.lead.slots).toMatchObject({ purpose: "Buy", property_type: "2 BHK", locality: "Bopal", budget: "₹55 lakh" });
    expect(r.lead.status).toBe("qualified");
    expect(r.lead.value_estimate).toBe(55_000);
  });
});

describe("opt-out and consent", () => {
  it("stops all messaging after STOP and resumes on START", async () => {
    const { ctx, advance } = makeCtx();
    const tenant = makeTenant(ctx);
    await handleMissedCall(ctx, tenant, { phone: PHONE });
    const r = await handleInbound(ctx, tenant, { phone: PHONE, text: "બંધ કરો" });
    expect(r.handled).toBe("opt_out");
    expect(r.lead.status).toBe("opted_out");
    const pending = ctx.db.get<{ n: number }>("SELECT COUNT(*) n FROM followups WHERE lead_id = ? AND status = 'pending'", r.lead.id);
    expect(pending?.n).toBe(0);

    // A later missed call must not trigger outreach.
    advance(60);
    const again = await handleMissedCall(ctx, tenant, { phone: PHONE });
    expect(again.outcome).toBeNull();

    const back = await handleInbound(ctx, tenant, { phone: PHONE, text: "START" });
    expect(back.handled).toBe("opt_in");
    expect(back.lead.status).toBe("engaged");
  });

  it("hands off to a human and pauses the AI", async () => {
    const { ctx } = makeCtx();
    const tenant = makeTenant(ctx);
    await handleMissedCall(ctx, tenant, { phone: PHONE });
    const r = await handleInbound(ctx, tenant, { phone: PHONE, text: "Please call me, I want to talk to the owner" });
    expect(r.lead.ai_paused).toBe(1);
    const next = await handleInbound(ctx, tenant, { phone: PHONE, text: "hello?" });
    expect(next.handled).toBe("paused");
    expect(ctx.channels.sandboxFor(tenant.id).voice.calls.length).toBe(0); // callback is queued, not instant
  });
});

describe("follow-up cadence", () => {
  it("nudges with a template once the window closes and defers during quiet hours", async () => {
    const { ctx, setNow } = makeCtx({ at: new Date("2026-10-20T12:00:00.000Z") }); // 17:30 IST
    const tenant = makeTenant(ctx);
    const { lead } = await handleMissedCall(ctx, tenant, { phone: PHONE });
    const sandbox = ctx.channels.sandboxFor(tenant.id);

    // +3h → 20:30 IST: first nudge is allowed, window never opened → approved template.
    setNow(new Date("2026-10-20T15:00:00.000Z"));
    await runDueFollowups(ctx);
    expect(sandbox.whatsapp.outbox.at(-1)!.template?.name).toBe("vaani_followup");

    // Owner call-back fired too (owner phone is set in fixtures).
    expect(sandbox.voice.calls).toHaveLength(1);

    // +24h lands at 17:30 next day — fine. Force one into quiet hours instead:
    ctx.db.run("UPDATE followups SET due_at = ? WHERE lead_id = ? AND status = 'pending' AND step = 2", "2026-10-20T17:00:00.000Z", lead.id);
    setNow(new Date("2026-10-20T17:30:00.000Z")); // 23:00 IST
    await runDueFollowups(ctx);
    const moved = ctx.db.get<{ due_at: string; status: string }>("SELECT due_at, status FROM followups WHERE lead_id = ? AND step = 2", lead.id);
    expect(moved).toEqual({ due_at: "2026-10-21T03:30:00.000Z", status: "pending" });
  });

  it("closes the loop: final message marks unresponsive leads lost", async () => {
    const { ctx, advance } = makeCtx();
    const tenant = makeTenant(ctx);
    const { lead } = await handleMissedCall(ctx, tenant, { phone: PHONE });
    advance(3 * 24 * 60 + 5);
    await runDueFollowups(ctx);
    expect(getLead(ctx, tenant.id, lead.id).status).toBe("lost");
  });
});

describe("form leads", () => {
  it("pre-fills slots from the enquiry text and records explicit consent", async () => {
    const { ctx } = makeCtx();
    const tenant = makeTenant(ctx);
    const { lead } = await handleFormLead(ctx, tenant, { phone: PHONE, name: "Kiran", source: "indiamart", message: "JEE coaching for std 12" });
    expect(lead.slots).toMatchObject({ course: "JEE", grade: "Std 12" });
    expect(lead.consent).toBe("explicit");
    expect(ctx.channels.sandboxFor(tenant.id).whatsapp.outbox[0]!.template?.name).toBe("vaani_enquiry");
  });
});

describe("billing", () => {
  it("meters template vs service messages and computes GST", async () => {
    const { ctx } = makeCtx();
    const tenant = makeTenant(ctx);
    await handleMissedCall(ctx, tenant, { phone: PHONE });
    await handleInbound(ctx, tenant, { phone: PHONE, text: "JEE coaching joie che" });
    const inv = invoicePreview(ctx, tenant.id, "growth");
    const utility = inv.lines.find((l) => l.kind === "wa_utility");
    const service = inv.lines.find((l) => l.kind === "wa_service");
    expect(utility?.quantity).toBe(1);
    expect(utility?.amountPaise).toBe(20);
    expect(service?.amountPaise).toBe(0);
    expect(inv.conversations.used).toBe(1);
    expect(inv.gstPaise).toBe(Math.round(inv.subtotalPaise * 0.18));
  });
});
