import { createHmac, randomBytes } from "node:crypto";
import type { FetchLike, MessagingAdapter, OutboundMessage, SendResult, VoiceAdapter } from "./types.js";
import { safeEqual } from "../lib/util.js";

const defaultFetch: FetchLike = (url, init) => fetch(url, init);

async function errorText(res: Awaited<ReturnType<FetchLike>>): Promise<string> {
  try {
    return `${res.status} ${(await res.text()).slice(0, 300)}`;
  } catch {
    return String(res.status);
  }
}

// ------------------------------------------------------------------ WhatsApp

export interface WhatsAppCreds {
  token: string;
  phoneNumberId: string;
  graphVersion: string;
}

/** WhatsApp Business Cloud API (Meta). Template sends work outside the 24h window. */
export class WhatsAppCloudAdapter implements MessagingAdapter {
  readonly provider = "whatsapp_cloud";
  readonly channel = "whatsapp" as const;
  readonly sandbox = false;

  constructor(private readonly creds: WhatsAppCreds, private readonly http: FetchLike = defaultFetch) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    const to = msg.to.replace(/^\+/, "");
    const payload = msg.template
      ? {
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: msg.template.name,
            language: { code: msg.template.language },
            components: [{ type: "body", parameters: msg.template.params.map((text) => ({ type: "text", text })) }],
          },
        }
      : { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body: msg.text } };

    const res = await this.http(`https://graph.facebook.com/${this.creds.graphVersion}/${this.creds.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.creds.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, error: await errorText(res), sandbox: false };
    const body = (await res.json()) as { messages?: { id: string }[] };
    return { ok: true, providerId: body.messages?.[0]?.id, sandbox: false };
  }
}

/** Validates Meta's X-Hub-Signature-256 header against the raw request body. */
export function verifyMetaSignature(rawBody: Buffer, header: string | undefined, appSecret: string): boolean {
  if (!appSecret) return true; // signature checking disabled in sandbox/dev
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return safeEqual(header.slice(7), expected);
}

// ------------------------------------------------------------------ SMS (DLT)

export interface Msg91Creds {
  authKey: string;
  senderId: string;
}

/** MSG91 Flow API — DLT-registered templates, as Indian regulation (TRAI) requires. */
export class Msg91SmsAdapter implements MessagingAdapter {
  readonly provider = "msg91";
  readonly channel = "sms" as const;
  readonly sandbox = false;

  constructor(private readonly creds: Msg91Creds, private readonly http: FetchLike = defaultFetch) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    if (!msg.template) return { ok: false, error: "SMS in India requires a DLT template", sandbox: false };
    const vars = Object.fromEntries(msg.template.params.map((v, i) => [`var${i + 1}`, v]));
    const res = await this.http("https://control.msg91.com/api/v5/flow", {
      method: "POST",
      headers: { authkey: this.creds.authKey, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({ template_id: msg.template.name, sender: this.creds.senderId, short_url: "1", recipients: [{ mobiles: msg.to.replace(/^\+/, ""), ...vars }] }),
    });
    if (!res.ok) return { ok: false, error: await errorText(res), sandbox: false };
    const body = (await res.json()) as { message?: string; type?: string };
    return body.type === "error" ? { ok: false, error: body.message, sandbox: false } : { ok: true, providerId: body.message, sandbox: false };
  }
}

export interface TwilioCreds {
  accountSid: string;
  authToken: string;
  from: string;
}

export class TwilioSmsAdapter implements MessagingAdapter {
  readonly provider = "twilio";
  readonly channel = "sms" as const;
  readonly sandbox = false;

  constructor(private readonly creds: TwilioCreds, private readonly http: FetchLike = defaultFetch) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    const res = await this.http(`https://api.twilio.com/2010-04-01/Accounts/${this.creds.accountSid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: basicAuth(this.creds.accountSid, this.creds.authToken), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: msg.to, From: this.creds.from, Body: msg.text }).toString(),
    });
    if (!res.ok) return { ok: false, error: await errorText(res), sandbox: false };
    const body = (await res.json()) as { sid?: string };
    return { ok: true, providerId: body.sid, sandbox: false };
  }
}

// ------------------------------------------------------------------ Voice

export interface ExotelCreds {
  sid: string;
  apiKey: string;
  apiToken: string;
  subdomain: string;
  callerId: string;
}

/** Exotel "connect two numbers": rings the owner, then bridges to the customer via the ExoPhone. */
export class ExotelVoiceAdapter implements VoiceAdapter {
  readonly provider = "exotel";
  readonly sandbox = false;

  constructor(private readonly creds: ExotelCreds, private readonly http: FetchLike = defaultFetch) {}

  async connect(agentPhone: string, customerPhone: string, statusCallbackUrl?: string): Promise<SendResult> {
    const params = new URLSearchParams({ From: agentPhone, To: customerPhone, CallerId: this.creds.callerId, Record: "true" });
    if (statusCallbackUrl) params.set("StatusCallback", statusCallbackUrl);
    const res = await this.http(`https://${this.creds.subdomain}/v1/Accounts/${this.creds.sid}/Calls/connect.json`, {
      method: "POST",
      headers: { Authorization: basicAuth(this.creds.apiKey, this.creds.apiToken), "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!res.ok) return { ok: false, error: await errorText(res), sandbox: false };
    const body = (await res.json()) as { Call?: { Sid?: string } };
    return { ok: true, providerId: body.Call?.Sid, sandbox: false };
  }
}

export class TwilioVoiceAdapter implements VoiceAdapter {
  readonly provider = "twilio";
  readonly sandbox = false;

  constructor(private readonly creds: TwilioCreds, private readonly http: FetchLike = defaultFetch) {}

  async connect(agentPhone: string, customerPhone: string, statusCallbackUrl?: string): Promise<SendResult> {
    const twiml = `<Response><Say>Connecting you to your lead.</Say><Dial callerId="${this.creds.from}">${customerPhone}</Dial></Response>`;
    const params = new URLSearchParams({ To: agentPhone, From: this.creds.from, Twiml: twiml });
    if (statusCallbackUrl) params.set("StatusCallback", statusCallbackUrl);
    const res = await this.http(`https://api.twilio.com/2010-04-01/Accounts/${this.creds.accountSid}/Calls.json`, {
      method: "POST",
      headers: { Authorization: basicAuth(this.creds.accountSid, this.creds.authToken), "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!res.ok) return { ok: false, error: await errorText(res), sandbox: false };
    const body = (await res.json()) as { sid?: string };
    return { ok: true, providerId: body.sid, sandbox: false };
  }
}

/** Twilio request signature: HMAC-SHA1 over URL + sorted POST params, base64. */
export function verifyTwilioSignature(url: string, params: Record<string, string>, header: string | undefined, authToken: string): boolean {
  if (!authToken) return true;
  if (!header) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = createHmac("sha1", authToken).update(data).digest("base64");
  return safeEqual(header, expected);
}

// ------------------------------------------------------------------ Sandbox

/** Used when no credentials are configured: records the send and reports success. */
export class SandboxMessagingAdapter implements MessagingAdapter {
  readonly provider = "sandbox";
  readonly sandbox = true;
  readonly outbox: OutboundMessage[] = [];

  constructor(readonly channel: "whatsapp" | "sms") {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    this.outbox.push(msg);
    return { ok: true, providerId: `sbx_${randomBytes(6).toString("hex")}`, sandbox: true };
  }
}

export class SandboxVoiceAdapter implements VoiceAdapter {
  readonly provider = "sandbox";
  readonly sandbox = true;
  readonly calls: { agent: string; customer: string }[] = [];

  async connect(agentPhone: string, customerPhone: string): Promise<SendResult> {
    this.calls.push({ agent: agentPhone, customer: customerPhone });
    return { ok: true, providerId: `sbx_call_${randomBytes(6).toString("hex")}`, sandbox: true };
  }
}

function basicAuth(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}
