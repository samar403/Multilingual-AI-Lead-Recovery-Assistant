import type { Ctx } from "./context.js";
import { parseJson } from "../db/index.js";
import type { Lang, Lead, Message, Tenant, TenantSettings, Vertical } from "../types.js";
import { playbookFor } from "../ai/verticals.js";
import { id, nowIso } from "../lib/util.js";
import { randomBytes } from "node:crypto";

// ------------------------------------------------------------------ tenants

export function defaultSettings(vertical: Vertical, city = ""): TenantSettings {
  const pb = playbookFor(vertical);
  return {
    hours: { open: vertical === "salon" ? "10:00" : "09:30", close: vertical === "salon" ? "20:30" : "19:30", days: vertical === "salon" ? [0, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6] },
    quietHours: { start: "21:00", end: "09:00" },
    localities: [],
    offerings: pb.defaultOfferings,
    priceNote: "",
    address: city,
    bookingKind: pb.bookingKind.en,
    avgDealValue: pb.avgDealValue,
    consentMode: "implied_inbound",
    cadence: { nudgeAfterMin: 180, secondNudgeAfterMin: 24 * 60, finalNudgeAfterMin: 72 * 60, callbackAfterMin: 15 },
    ownerPhone: "",
    aiPersona: "",
    autoReply: true,
  };
}

type TenantRow = Omit<Tenant, "settings"> & { settings: string };

export function hydrateTenant(row: TenantRow): Tenant {
  const settings = { ...defaultSettings(row.vertical as Vertical), ...parseJson<Partial<TenantSettings>>(row.settings, {}) };
  return { ...row, settings } as Tenant;
}

export function getTenant(ctx: Ctx, tenantId: string): Tenant {
  const row = ctx.db.get<TenantRow>("SELECT * FROM tenants WHERE id = ?", tenantId);
  if (!row) throw new HttpError(404, "Business not found");
  return hydrateTenant(row);
}

export function getTenantByKey(ctx: Ctx, key: string): Tenant | undefined {
  const row = ctx.db.get<TenantRow>("SELECT * FROM tenants WHERE webhook_key = ?", key);
  return row ? hydrateTenant(row) : undefined;
}

export function createTenant(
  ctx: Ctx,
  input: { name: string; vertical: Vertical; city: string; phone?: string; defaultLang?: Lang; plan?: string; settings?: Partial<TenantSettings> },
): Tenant {
  const tenantId = id("biz");
  const settings = { ...defaultSettings(input.vertical, input.city), ...(input.settings ?? {}) };
  ctx.db.insert("tenants", {
    id: tenantId,
    name: input.name,
    vertical: input.vertical,
    city: input.city,
    phone: input.phone ?? "",
    default_lang: input.defaultLang ?? "gu",
    plan: input.plan ?? "growth",
    webhook_key: `wk_${randomBytes(12).toString("hex")}`,
    settings,
    created_at: nowIso(ctx.clock),
  });
  return getTenant(ctx, tenantId);
}

export function audit(ctx: Ctx, tenantId: string, actor: string, action: string, detail = "") {
  ctx.db.insert("audit_log", { id: id("aud"), tenant_id: tenantId, actor, action, detail, created_at: nowIso(ctx.clock) });
}

// ------------------------------------------------------------------ leads

type LeadRow = Omit<Lead, "slots"> & { slots: string };

export function hydrateLead(row: LeadRow): Lead {
  return { ...row, slots: parseJson(row.slots, {}) } as Lead;
}

export function getLead(ctx: Ctx, tenantId: string, leadId: string): Lead {
  const row = ctx.db.get<LeadRow>("SELECT * FROM leads WHERE id = ? AND tenant_id = ?", leadId, tenantId);
  if (!row) throw new HttpError(404, "Lead not found");
  return hydrateLead(row);
}

export function findLeadByPhone(ctx: Ctx, tenantId: string, phone: string): Lead | undefined {
  const row = ctx.db.get<LeadRow>("SELECT * FROM leads WHERE tenant_id = ? AND phone = ?", tenantId, phone);
  return row ? hydrateLead(row) : undefined;
}

export function upsertLead(
  ctx: Ctx,
  tenant: Tenant,
  input: { phone: string; name?: string; source: string; language?: Lang; notes?: string; slots?: Record<string, string> },
): { lead: Lead; created: boolean } {
  const existing = findLeadByPhone(ctx, tenant.id, input.phone);
  const now = nowIso(ctx.clock);
  if (existing) {
    const patch: Record<string, unknown> = { updated_at: now };
    if (input.name && !existing.name) patch.name = input.name;
    if (input.slots) patch.slots = { ...existing.slots, ...input.slots };
    // A lost / won lead calling again is a fresh opportunity.
    if (["lost", "won"].includes(existing.status)) Object.assign(patch, { status: "new", source: input.source, ai_paused: 0 });
    ctx.db.update("leads", existing.id, patch);
    return { lead: getLead(ctx, tenant.id, existing.id), created: false };
  }
  const leadId = id("lead");
  ctx.db.insert("leads", {
    id: leadId,
    tenant_id: tenant.id,
    name: input.name ?? "",
    phone: input.phone,
    language: input.language ?? tenant.default_lang,
    script: "native",
    source: input.source,
    status: "new",
    slots: input.slots ?? {},
    notes: input.notes ?? "",
    value_estimate: tenant.settings.avgDealValue,
    created_at: now,
    updated_at: now,
  });
  return { lead: getLead(ctx, tenant.id, leadId), created: true };
}

export function updateLead(ctx: Ctx, lead: Lead, patch: Partial<Record<keyof Lead, unknown>>): Lead {
  ctx.db.update("leads", lead.id, { ...patch, updated_at: nowIso(ctx.clock) });
  const next = getLead(ctx, lead.tenant_id, lead.id);
  ctx.bus.publish(lead.tenant_id, "lead", publicLead(next));
  return next;
}

export function publicLead(lead: Lead) {
  return lead;
}

// ------------------------------------------------------------------ messages

type MessageRow = Omit<Message, "meta"> & { meta: string };

export function hydrateMessage(row: MessageRow): Message {
  return { ...row, meta: parseJson(row.meta, {}) } as Message;
}

export function listMessages(ctx: Ctx, leadId: string): Message[] {
  return ctx.db.all<MessageRow>("SELECT * FROM messages WHERE lead_id = ? ORDER BY created_at, rowid", leadId).map(hydrateMessage);
}

export function insertMessage(ctx: Ctx, msg: Omit<Message, "id" | "created_at"> & { created_at?: string }): Message {
  const messageId = id("msg");
  const created = msg.created_at ?? nowIso(ctx.clock);
  ctx.db.insert("messages", { ...msg, id: messageId, created_at: created });
  const out = hydrateMessage(ctx.db.get<MessageRow>("SELECT * FROM messages WHERE id = ?", messageId)!);
  ctx.bus.publish(msg.tenant_id, "message", out);
  return out;
}

// ------------------------------------------------------------------ errors

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
