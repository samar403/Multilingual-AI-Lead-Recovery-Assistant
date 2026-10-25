import { createCtx, type Ctx } from "../src/services/context.js";
import { RulesEngine } from "../src/ai/rules-engine.js";
import { createTenant } from "../src/services/store.js";
import { DEMO_BUSINESSES } from "../src/demo/fixtures.js";
import type { Vertical } from "../src/types.js";
import type { FetchLike } from "../src/channels/types.js";

/** Tuesday 20 Oct 2026, 11:30 IST — inside business hours, outside quiet hours. */
export const T0 = new Date("2026-10-20T06:00:00.000Z");

export function makeCtx(opts: { at?: Date; http?: FetchLike } = {}) {
  let now = opts.at ?? T0;
  const ctx: Ctx = createCtx({ databasePath: ":memory:", engine: new RulesEngine(), clock: () => now, http: opts.http });
  return {
    ctx,
    setNow: (d: Date) => (now = d),
    advance: (minutes: number) => (now = new Date(now.getTime() + minutes * 60_000)),
  };
}

export function makeTenant(ctx: Ctx, vertical: Vertical = "coaching", settings = {}) {
  const b = DEMO_BUSINESSES[vertical];
  return createTenant(ctx, {
    name: b.name,
    vertical,
    city: b.city,
    phone: b.phone,
    settings: { ...b.settings, hours: { open: "09:00", close: "20:00", days: [0, 1, 2, 3, 4, 5, 6] }, ...settings },
  });
}
