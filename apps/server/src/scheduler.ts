import type { Ctx } from "./services/context.js";
import { runDueFollowups } from "./services/followups.js";

/** Polls for due follow-ups. Single-node; for multiple nodes use a row lock or a queue. */
export function startScheduler(ctx: Ctx, intervalMs: number): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const n = await runDueFollowups(ctx);
      if (n) console.log(`[scheduler] processed ${n} follow-up(s)`);
    } catch (err) {
      console.error("[scheduler]", err);
    } finally {
      running = false;
    }
  };
  const handle = setInterval(tick, intervalMs);
  void tick();
  return () => clearInterval(handle);
}
