import type { NextFunction, Request, Response, RequestHandler } from "express";
import { ZodError, type ZodTypeAny, type z } from "zod";
import type { Ctx } from "../services/context.js";
import { userForToken } from "../services/auth.js";
import { getTenant, HttpError } from "../services/store.js";
import type { Tenant, User } from "../types.js";

declare module "express-serve-static-core" {
  interface Request {
    user?: User;
    tenant?: Tenant;
    rawBody?: Buffer;
  }
}

export function bearer(req: Request): string | undefined {
  const header = req.header("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return typeof req.query.token === "string" ? req.query.token : undefined;
}

export function requireAuth(ctx: Ctx): RequestHandler {
  return (req, _res, next) => {
    const user = userForToken(ctx, bearer(req));
    if (!user) return next(new HttpError(401, "Please sign in"));
    req.user = user;
    req.tenant = getTenant(ctx, user.tenant_id);
    next();
  };
}

/** Wraps async handlers so thrown errors reach the error middleware. */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export function parse<S extends ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  return schema.parse(value);
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Invalid input", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  return res.status(500).json({ error: "Something went wrong" });
}

/** Small in-memory token bucket — enough for a single node; swap for Redis when scaling out. */
export function rateLimit(opts: { windowMs: number; max: number }): RequestHandler {
  const hits = new Map<string, { count: number; reset: number }>();
  return (req, res, next) => {
    const key = req.ip ?? "anon";
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + opts.windowMs });
      return next();
    }
    entry.count++;
    if (entry.count > opts.max) {
      res.setHeader("Retry-After", Math.ceil((entry.reset - now) / 1000));
      return res.status(429).json({ error: "Too many requests — please slow down" });
    }
    next();
  };
}
