import type { Ctx } from "../services/context.js";
import type { Vertical } from "../types.js";
import { RulesEngine } from "../ai/rules-engine.js";
import { createTenant, getTenant, getLead, findLeadByPhone, updateLead } from "../services/store.js";
import { handleFormLead, handleInbound, handleMissedCall } from "../services/conversation.js";
import { runDueFollowups } from "../services/followups.js";
import { hashPassword, id, nowIso } from "../lib/util.js";
import { DEMO_BUSINESSES } from "./fixtures.js";

export const DEMO_LOGIN = { email: "demo@vaani.app", password: "vaani-demo" };

type Step = { at: number; kind: "missed"; name?: string } | { at: number; kind: "in"; text: string } | { at: number; kind: "form"; source: string; name: string; text: string };

// `at` is minutes before "now". Each script is a real conversation run through
// the actual pipeline (engine, compliance, cadence) on a virtual clock.
const SCRIPTS: { phone: string; steps: Step[]; after?: "won" | "complete" }[] = [
  { phone: "+919824011111", steps: [{ at: 9 * 1440 + 200, kind: "missed", name: "Hetal Patel" }, { at: 9 * 1440 + 195, kind: "in", text: "નમસ્તે, JEE માટે કોચિંગ જોઈએ છે" }, { at: 9 * 1440 + 190, kind: "in", text: "ધોરણ 11 માં છે" }, { at: 9 * 1440 + 185, kind: "in", text: "ફી કેટલી છે?" }, { at: 9 * 1440 + 180, kind: "in", text: "1" }], after: "won" },
  { phone: "+919898022222", steps: [{ at: 2 * 1440 + 400, kind: "missed", name: "Rakesh Sharma" }, { at: 2 * 1440 + 396, kind: "in", text: "Hi, NEET ke liye coaching chahiye, beta 12th mein hai" }, { at: 2 * 1440 + 390, kind: "in", text: "kitna fees hai?" }, { at: 2 * 1440 + 385, kind: "in", text: "parso shaam 5 baje theek rahega" }] },
  { phone: "+917016033333", steps: [{ at: 1440 + 600, kind: "form", source: "website", name: "Ananya Iyer", text: "Looking for Spoken English classes, I'm a working professional" }, { at: 1440 + 590, kind: "in", text: "weekend batch please, I'm in class 12 actually" }] },
  { phone: "+919727044444", steps: [{ at: 300, kind: "missed" }, { at: 290, kind: "in", text: "kem cho, foundation course mate puchvu hatu" }, { at: 285, kind: "in", text: "dhoran 9 ma che" }] },
  { phone: "+918780055555", steps: [{ at: 1440 * 3 + 100, kind: "missed", name: "Sunil Verma" }, { at: 1440 * 3 + 92, kind: "in", text: "मुझे कॉमर्स के लिए कोचिंग चाहिए" }, { at: 1440 * 3 + 88, kind: "in", text: "कक्षा 11" }, { at: 1440 * 3 + 80, kind: "in", text: "आपका पता क्या है?" }] },
  { phone: "+919909066666", steps: [{ at: 45, kind: "missed" }] },
  { phone: "+919825177777", steps: [{ at: 12, kind: "missed", name: "Bhavik Shah" }] },
  { phone: "+916353088888", steps: [{ at: 1440 * 5 + 60, kind: "missed" }, { at: 1440 * 5 + 50, kind: "in", text: "STOP" }] },
  { phone: "+919428099999", steps: [{ at: 600, kind: "missed", name: "Meena Desai" }, { at: 590, kind: "in", text: "Please call me, I want to talk to the owner about fees for twins" }] },
  { phone: "+918141010101", steps: [{ at: 1440 * 4 + 30, kind: "missed" }, { at: 1440 * 4 + 20, kind: "in", text: "already joined another institute, no need" }] },
  { phone: "+919662012121", steps: [{ at: 1440 * 6 + 300, kind: "form", source: "indiamart", name: "Kiran Joshi", text: "JEE coaching for std 12 — Ahmedabad" }, { at: 1440 * 6 + 280, kind: "in", text: "Saturday 11am demo possible?" }], after: "complete" },
  { phone: "+917698013131", steps: [{ at: 1440 * 7 + 500, kind: "missed", name: "Farhan Qureshi" }, { at: 1440 * 7 + 490, kind: "in", text: "NEET dropper batch hai kya? 2nd attempt hai" }, { at: 1440 * 7 + 485, kind: "in", text: "dropper" }, { at: 1440 * 7 + 480, kind: "in", text: "2" }], after: "won" },
  { phone: "+919374014141", steps: [{ at: 1440 * 1 + 50, kind: "form", source: "justdial", name: "Pooja Mehta", text: "Coaching Classes, Bopal, Ahmedabad" }] },
  { phone: "+918200015151", steps: [{ at: 150, kind: "missed" }, { at: 140, kind: "in", text: "Hello, what are the fees for JEE?" }] },
  { phone: "+919979016161", steps: [{ at: 1440 * 8 + 120, kind: "missed", name: "Dhruv Trivedi" }, { at: 1440 * 8 + 115, kind: "in", text: "મારે NEET નું કોચિંગ જોઈએ છે, ધોરણ 12" }, { at: 1440 * 8 + 110, kind: "in", text: "કાલે સવારે 11 વાગ્યે" }], after: "won" },
  { phone: "+917359017171", steps: [{ at: 1440 * 2 + 30, kind: "missed" }, { at: 1440 * 2 + 25, kind: "in", text: "fees bahut zyada hai, refund policy kharab hai, complaint karni hai" }] },
  { phone: "+919586018181", steps: [{ at: 1440 * 10 + 400, kind: "missed" }] },
  { phone: "+918866019191", steps: [{ at: 1440 * 11 + 200, kind: "missed", name: "Nidhi Pandya" }, { at: 1440 * 11 + 190, kind: "in", text: "spoken english mate weekend batch che?" }, { at: 1440 * 11 + 185, kind: "in", text: "college ma chu, 12 pachhi" }] },
];

export async function seedDemo(ctx: Ctx, vertical: Vertical = "coaching") {
  if (ctx.db.get("SELECT 1 FROM users WHERE email = ?", DEMO_LOGIN.email)) return;

  const realNow = ctx.clock();
  let virtual = new Date(realNow.getTime() - 14 * 86_400_000);
  // Each clock read advances ~0.4s, so replies land seconds after the message like in production.
  const sim: Ctx = { ...ctx, engine: new RulesEngine(), clock: () => (virtual = new Date(virtual.getTime() + 400)) };

  const b = DEMO_BUSINESSES[vertical];
  const created = createTenant(sim, { name: b.name, vertical, city: b.city, phone: b.phone, defaultLang: "gu", plan: "growth", settings: b.settings });
  // Business hours wide enough that the demo shows confirmed bookings.
  ctx.db.update("tenants", created.id, { settings: { ...created.settings, hours: { open: "08:00", close: "21:00", days: [0, 1, 2, 3, 4, 5, 6] } } });
  ctx.db.insert("users", {
    id: id("usr"),
    tenant_id: created.id,
    name: "Jignesh Patel",
    email: DEMO_LOGIN.email,
    phone: b.settings.ownerPhone ?? "",
    password_hash: hashPassword(DEMO_LOGIN.password),
    role: "owner",
    ui_lang: "en",
    created_at: nowIso(sim.clock),
  });
  const tenant = getTenant(ctx, created.id);

  const events = SCRIPTS.flatMap((s, si) => s.steps.map((step, i) => ({ ...step, phone: s.phone, si, last: i === s.steps.length - 1 })));
  events.sort((a, b2) => b2.at - a.at);
  for (const ev of events) {
    virtual = new Date(realNow.getTime() - ev.at * 60_000);
    await runDueFollowups(sim);
    if (ev.kind === "missed") await handleMissedCall(sim, tenant, { phone: ev.phone, name: ev.name, provider: "exotel" });
    else if (ev.kind === "form") await handleFormLead(sim, tenant, { phone: ev.phone, name: ev.name, source: ev.source, message: ev.text });
    else await handleInbound(sim, tenant, { phone: ev.phone, text: ev.text, channel: "whatsapp" });
  }
  virtual = realNow;
  await runDueFollowups(sim);

  // Past bookings: mark outcomes so the funnel shows wins.
  for (const s of SCRIPTS.filter((x) => x.after)) {
    const lead = findLeadByPhone(ctx, tenant.id, s.phone);
    if (!lead) continue;
    const bk = ctx.db.get<{ id: string }>("SELECT id FROM bookings WHERE lead_id = ? AND status = 'confirmed' ORDER BY starts_at DESC LIMIT 1", lead.id);
    if (bk && s.after === "won") {
      ctx.db.update("bookings", bk.id, { status: "completed" });
      updateLead(sim, getLead(ctx, tenant.id, lead.id), { status: "won" });
    }
  }
  console.log(`[seed] demo business "${tenant.name}" ready — login ${DEMO_LOGIN.email} / ${DEMO_LOGIN.password}`);
}
