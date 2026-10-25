import { describe, expect, it, beforeAll } from "vitest";
import request from "supertest";
import { createHmac } from "node:crypto";
import { makeCtx } from "./helpers.js";
import { createApp } from "../src/app.js";
import { mapLeadPayload } from "../src/http/webhooks.js";

const { ctx } = makeCtx();
const app = createApp(ctx, { webDist: "/nonexistent" });
let token = "";
let key = "";

beforeAll(async () => {
  const res = await request(app).post("/api/auth/signup").send({
    businessName: "Glow Studio", vertical: "salon", city: "Surat", name: "Priya", email: "priya@glow.in", phone: "98250 00333", password: "supersecret", language: "gu",
  });
  expect(res.status).toBe(201);
  token = res.body.token;
  const settings = await request(app).get("/api/settings").set("authorization", `Bearer ${token}`);
  key = settings.body.tenant.webhook_key;
});

const auth = () => ({ authorization: `Bearer ${token}` });

describe("auth", () => {
  it("rejects unauthenticated calls and bad logins", async () => {
    expect((await request(app).get("/api/leads")).status).toBe(401);
    expect((await request(app).post("/api/auth/login").send({ email: "priya@glow.in", password: "nope" })).status).toBe(401);
    expect((await request(app).post("/api/auth/login").send({ email: "priya@glow.in", password: "supersecret" })).status).toBe(200);
  });

  it("validates input", async () => {
    const res = await request(app).post("/api/auth/signup").send({ email: "x" });
    expect(res.status).toBe(400);
    expect(res.body.issues.length).toBeGreaterThan(0);
  });
});

describe("webhooks → inbox", () => {
  it("turns an Exotel missed call into a contacted lead", async () => {
    const res = await request(app).get(`/webhooks/exotel/${key}`).query({ CallSid: "abc", CallFrom: "09876500001", DialCallStatus: "no-answer" });
    expect(res.body.missed).toBe(true);
    const leads = await request(app).get("/api/leads").set(auth());
    expect(leads.body[0]).toMatchObject({ phone: "+919876500001", status: "contacted", source: "missed_call" });
    expect(leads.body[0].lastMessage.body).toMatch(/Glow Studio/);
  });

  it("accepts IndiaMART / JustDial payloads", async () => {
    const res = await request(app).post(`/webhooks/leads/${key}?source=indiamart`).send({ RESPONSE: { SENDER_NAME: "Ritu", SENDER_MOBILE: "+91-9876500002", QUERY_MESSAGE: "bridal makeup in December" } });
    expect(res.status).toBe(200);
    const detail = await request(app).get(`/api/leads/${res.body.leadId}`).set(auth());
    expect(detail.body.lead.slots.service).toBe("Bridal");
    expect(mapLeadPayload("justdial", { name: "A", mobile: "9", category: "Salon", area: "Vesu" }).message).toBe("Salon, Vesu");
  });

  it("rejects unknown webhook keys", async () => {
    expect((await request(app).post("/webhooks/leads/wk_bad").send({ phone: "9876500003" })).status).toBe(404);
  });

  it("verifies WhatsApp signatures and replies through the AI", async () => {
    await request(app).put("/api/integrations/whatsapp").set(auth()).send({ token: "", phoneNumberId: "PNID1", appSecret: "s3cret", verifyToken: "vt" });
    const verify = await request(app).get("/webhooks/whatsapp").query({ "hub.mode": "subscribe", "hub.verify_token": "vt", "hub.challenge": "42" });
    expect(verify.text).toBe("42");

    const body = JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: "PNID1" }, contacts: [{ wa_id: "919876500004", profile: { name: "Zeel" } }], messages: [{ from: "919876500004", id: "wamid.1", type: "text", text: { body: "કાલે સાંજે 6 વાગ્યે હેરકટ માટે આવી શકું?" } }] } }] }] });
    const bad = await request(app).post("/webhooks/whatsapp").set("content-type", "application/json").set("x-hub-signature-256", "sha256=deadbeef").send(body);
    expect(bad.status).toBe(401);

    const sig = "sha256=" + createHmac("sha256", "s3cret").update(body).digest("hex");
    const ok = await request(app).post("/webhooks/whatsapp").set("content-type", "application/json").set("x-hub-signature-256", sig).send(body);
    expect(ok.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));
    const leads = await request(app).get("/api/leads?q=Zeel").set(auth());
    const lead = leads.body[0];
    expect(lead).toMatchObject({ name: "Zeel", language: "gu", status: "booked" });
    expect(lead.slots.service).toBe("Haircut");
  });
});

describe("inbox actions", () => {
  it("lets the owner take over, note and message within the window", async () => {
    const sim = await request(app).post("/api/simulate/inbound").set(auth()).send({ phone: "9876500005", text: "facial nu price shu che?" });
    const id = sim.body.lead.id;
    expect(sim.body.reply.body).toMatch(/₹/);
    await request(app).patch(`/api/leads/${id}`).set(auth()).send({ ai_paused: true }).expect(200);
    const sent = await request(app).post(`/api/leads/${id}/messages`).set(auth()).send({ text: "Hi! Priya here, Saturday 4pm free che." });
    expect(sent.status).toBe(201);
    const note = await request(app).post(`/api/leads/${id}/messages`).set(auth()).send({ text: "VIP client", note: true });
    expect(note.body.status).toBe("note");
    const detail = await request(app).get(`/api/leads/${id}`).set(auth());
    expect(detail.body.windowClosesAt).toBeTruthy();
    expect(detail.body.messages.map((m: { author: string }) => m.author)).toEqual(["customer", "ai", "agent", "agent"]);
  });

  it("blocks free-form agent messages outside the 24h window", async () => {
    const res = await request(app).post("/api/simulate/missed-call").set(auth()).send({ phone: "9876500006" });
    const blocked = await request(app).post(`/api/leads/${res.body.lead.id}/messages`).set(auth()).send({ text: "hello" });
    expect(blocked.status).toBe(409);
    const tpl = await request(app).post(`/api/leads/${res.body.lead.id}/messages`).set(auth()).send({ template: "wa_followup" });
    expect(tpl.status).toBe(201);
  });

  it("exposes dashboard, billing, integrations and CSV", async () => {
    const dash = await request(app).get("/api/dashboard").set(auth());
    expect(dash.body.kpis.leads).toBeGreaterThan(0);
    expect(dash.body.radar.length).toBeGreaterThan(0);
    const billing = await request(app).get("/api/billing").set(auth());
    expect(billing.body.invoice.plan.id).toBe("growth");
    const integ = await request(app).get("/api/integrations").set(auth());
    expect(integ.body.integrations.find((i: { key: string }) => i.key === "whatsapp").config.appSecret).toBe("••••cret");
    const csv = await request(app).get("/api/leads.csv").set(auth());
    expect(csv.text.split("\n")[0]).toContain("phone");
  });
});

describe("public playground", () => {
  it("runs a stateless conversation", async () => {
    const start = await request(app).post("/api/playground/start").send({ vertical: "real_estate", language: "hi" });
    expect(start.body.opening).toMatch(/Sabarmati Realty/);
    const res = await request(app).post("/api/playground/chat").send({ vertical: "real_estate", message: "3 BHK chahiye Satellite mein, budget 1 crore, khareedna hai", history: [] });
    expect(res.body.slots).toMatchObject({ purpose: "Buy", property_type: "3 BHK", locality: "Satellite", budget: "₹1 Cr" });
    expect(res.body.offeredSlots).toHaveLength(2);
    expect(res.body.score.temperature).toBeDefined();
  });
});
