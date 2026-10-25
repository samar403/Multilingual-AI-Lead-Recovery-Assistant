import express from "express";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Ctx } from "./services/context.js";
import { apiRouter } from "./http/api.js";
import { webhookRouter } from "./http/webhooks.js";
import { errorHandler } from "./http/middleware.js";

export function createApp(ctx: Ctx, opts: { webDist?: string } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    next();
  });

  // Keep the raw body: WhatsApp signatures are computed over the exact bytes.
  app.use(express.json({ limit: "1mb", verify: (req, _res, buf) => ((req as express.Request).rawBody = buf) }));
  app.use(express.urlencoded({ extended: false, limit: "256kb" }));

  // Website lead forms post cross-origin.
  app.use("/webhooks/leads", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.use("/api", apiRouter(ctx));
  app.use("/webhooks", webhookRouter(ctx));

  const dist = opts.webDist ?? join(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  if (existsSync(dist)) {
    app.use(express.static(dist, { maxAge: "1h", index: false }));
    app.get(/^\/(?!api|webhooks).*/, (_req, res) => res.sendFile(join(dist, "index.html")));
  }

  app.use(errorHandler);
  return app;
}
