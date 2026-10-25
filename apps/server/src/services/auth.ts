import { randomBytes } from "node:crypto";
import type { Ctx } from "./context.js";
import type { Lang, User, Vertical } from "../types.js";
import { createTenant, HttpError, audit } from "./store.js";
import { hashPassword, id, nowIso, sha256, verifyPassword } from "../lib/util.js";

const SESSION_DAYS = 30;

export function createSession(ctx: Ctx, userId: string): string {
  const token = randomBytes(32).toString("base64url");
  ctx.db.insert("sessions", {
    token_hash: sha256(token),
    user_id: userId,
    expires_at: new Date(ctx.clock().getTime() + SESSION_DAYS * 86_400_000).toISOString(),
  });
  return token;
}

export function userForToken(ctx: Ctx, token: string | undefined): User | undefined {
  if (!token) return undefined;
  return ctx.db.get<User>(
    `SELECT u.id, u.tenant_id, u.name, u.email, u.phone, u.role, u.ui_lang, u.created_at
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`,
    sha256(token), ctx.clock().toISOString(),
  );
}

export function revokeSession(ctx: Ctx, token: string) {
  ctx.db.run("DELETE FROM sessions WHERE token_hash = ?", sha256(token));
}

export interface SignupInput {
  businessName: string;
  vertical: Vertical;
  city: string;
  name: string;
  email: string;
  phone?: string;
  password: string;
  language: Lang;
}

export function signup(ctx: Ctx, input: SignupInput) {
  const email = input.email.trim().toLowerCase();
  if (ctx.db.get("SELECT 1 FROM users WHERE email = ?", email)) throw new HttpError(409, "An account with this email already exists");
  return ctx.db.tx(() => {
    const tenant = createTenant(ctx, {
      name: input.businessName,
      vertical: input.vertical,
      city: input.city,
      phone: input.phone,
      defaultLang: input.language,
      settings: { ownerPhone: input.phone ?? "", address: input.city },
    });
    const userId = id("usr");
    ctx.db.insert("users", {
      id: userId,
      tenant_id: tenant.id,
      name: input.name,
      email,
      phone: input.phone ?? "",
      password_hash: hashPassword(input.password),
      role: "owner",
      ui_lang: input.language,
      created_at: nowIso(ctx.clock),
    });
    audit(ctx, tenant.id, email, "account.created");
    return { tenant, token: createSession(ctx, userId) };
  });
}

export function login(ctx: Ctx, emailRaw: string, password: string) {
  const email = emailRaw.trim().toLowerCase();
  const row = ctx.db.get<{ id: string; password_hash: string }>("SELECT id, password_hash FROM users WHERE email = ?", email);
  if (!row || !verifyPassword(password, row.password_hash)) throw new HttpError(401, "Wrong email or password");
  return createSession(ctx, row.id);
}
