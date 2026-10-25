import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { WhatsAppCloudAdapter, Msg91SmsAdapter, verifyTwilioSignature, verifyMetaSignature } from "../src/channels/providers.js";
import type { FetchLike } from "../src/channels/types.js";
import { smsSegments } from "../src/billing/plans.js";

function recorder(response: unknown) {
  const calls: { url: string; init: Parameters<FetchLike>[1] }[] = [];
  const http: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => response, text: async () => JSON.stringify(response) };
  };
  return { calls, http };
}

describe("WhatsApp Cloud API adapter", () => {
  it("sends approved templates with positional params", async () => {
    const { calls, http } = recorder({ messages: [{ id: "wamid.X" }] });
    const wa = new WhatsAppCloudAdapter({ token: "T", phoneNumberId: "123", graphVersion: "v21.0" }, http);
    const res = await wa.send({ to: "+919876500001", text: "…", template: { name: "vaani_missed_call", language: "gu", params: ["Hetal", "Shiksha"] } });
    expect(res).toMatchObject({ ok: true, providerId: "wamid.X" });
    expect(calls[0]!.url).toBe("https://graph.facebook.com/v21.0/123/messages");
    const body = JSON.parse(calls[0]!.init.body!);
    expect(body).toMatchObject({ to: "919876500001", type: "template", template: { name: "vaani_missed_call", language: { code: "gu" } } });
    expect(body.template.components[0].parameters).toEqual([{ type: "text", text: "Hetal" }, { type: "text", text: "Shiksha" }]);
  });

  it("sends free-form text inside the window", async () => {
    const { calls, http } = recorder({ messages: [{ id: "wamid.Y" }] });
    await new WhatsAppCloudAdapter({ token: "T", phoneNumberId: "123", graphVersion: "v21.0" }, http).send({ to: "+91999", text: "નમસ્તે" });
    expect(JSON.parse(calls[0]!.init.body!)).toMatchObject({ type: "text", text: { body: "નમસ્તે" } });
  });
});

describe("SMS", () => {
  it("refuses non-DLT SMS on MSG91", async () => {
    const { http } = recorder({});
    const res = await new Msg91SmsAdapter({ authKey: "k", senderId: "VAANII" }, http).send({ to: "+91999", text: "hi" });
    expect(res.ok).toBe(false);
  });

  it("counts UCS-2 segments for Indic text", () => {
    expect(smsSegments("a".repeat(160))).toBe(1);
    expect(smsSegments("ન".repeat(71))).toBe(2);
  });
});

describe("signatures", () => {
  it("validates Twilio and Meta signatures", () => {
    const url = "https://vaani.app/webhooks/twilio/sms/k";
    const params = { From: "+91", Body: "hi" };
    const sig = createHmac("sha1", "tok").update(url + "BodyhiFrom+91").digest("base64");
    expect(verifyTwilioSignature(url, params, sig, "tok")).toBe(true);
    expect(verifyTwilioSignature(url, params, "nope", "tok")).toBe(false);
    const raw = Buffer.from('{"a":1}');
    expect(verifyMetaSignature(raw, "sha256=" + createHmac("sha256", "s").update(raw).digest("hex"), "s")).toBe(true);
    expect(verifyMetaSignature(raw, undefined, "s")).toBe(false);
  });
});
