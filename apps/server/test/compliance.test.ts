import { describe, expect, it } from "vitest";
import { decide } from "../src/compliance/policy.js";
import { makeCtx, makeTenant, T0 } from "./helpers.js";

describe("compliance gate", () => {
  const { ctx } = makeCtx();
  const tenant = makeTenant(ctx);
  const base = { status: "engaged" as const, consent: "implied_inbound", last_inbound_at: null as string | null };

  it("blocks opted-out customers", () => {
    expect(decide(tenant, { ...base, status: "opted_out" }, "reply", T0).allowed).toBe(false);
  });

  it("requires templates outside the 24h WhatsApp window", () => {
    expect(decide(tenant, base, "recovery", T0)).toMatchObject({ allowed: true, mode: "template" });
    const recent = { ...base, last_inbound_at: new Date(T0.getTime() - 3_600_000).toISOString() };
    expect(decide(tenant, recent, "reply", T0).mode).toBe("freeform");
    const stale = { ...base, last_inbound_at: new Date(T0.getTime() - 25 * 3_600_000).toISOString() };
    expect(decide(tenant, stale, "agent", T0).mode).toBe("template");
  });

  it("defers proactive follow-ups during quiet hours, but always answers the customer", () => {
    const night = new Date("2026-10-20T17:00:00.000Z"); // 22:30 IST
    const d = decide(tenant, base, "followup", night);
    expect(d.allowed).toBe(false);
    expect(d.deferUntil?.toISOString()).toBe("2026-10-21T03:30:00.000Z"); // 09:00 IST
    expect(decide(tenant, { ...base, last_inbound_at: night.toISOString() }, "reply", night).allowed).toBe(true);
  });

  it("explicit-consent mode blocks proactive outreach without opt-in", () => {
    const strict = { ...tenant, settings: { ...tenant.settings, consentMode: "explicit_only" as const } };
    expect(decide(strict, base, "followup", T0).allowed).toBe(false);
    expect(decide(strict, { ...base, consent: "explicit" }, "followup", T0).allowed).toBe(true);
  });
});
