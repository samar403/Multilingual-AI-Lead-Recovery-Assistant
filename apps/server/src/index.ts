import { config } from "./config.js";
import { createCtx } from "./services/context.js";
import { createApp } from "./app.js";
import { startScheduler } from "./scheduler.js";
import { seedDemo, DEMO_LOGIN } from "./demo/seed.js";

const ctx = createCtx({ databasePath: config.databasePath });

if (config.seedDemo) await seedDemo(ctx);

const app = createApp(ctx);
const stop = startScheduler(ctx, config.schedulerIntervalMs);

const server = app.listen(config.port, () => {
  console.log(`\n  ✦ Vaani is listening on http://localhost:${config.port}`);
  console.log(`    AI engine: ${ctx.engine.name}${ctx.engine.name === "rules" ? " (set ANTHROPIC_API_KEY to enable Claude)" : ` (${config.ai.model})`}`);
  if (config.seedDemo) console.log(`    Demo login: ${DEMO_LOGIN.email} / ${DEMO_LOGIN.password}\n`);
});

const shutdown = () => {
  stop();
  server.close(() => {
    ctx.db.close();
    process.exit(0);
  });
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
