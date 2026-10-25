import { config } from "../config.js";
import { createCtx } from "../services/context.js";
import { seedDemo } from "../demo/seed.js";

const ctx = createCtx({ databasePath: config.databasePath });
await seedDemo(ctx);
ctx.db.close();
