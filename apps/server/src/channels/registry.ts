import type { Db } from "../db/index.js";
import { parseJson } from "../db/index.js";
import { config } from "../config.js";
import type { FetchLike, MessagingAdapter, VoiceAdapter } from "./types.js";
import {
  ExotelVoiceAdapter,
  Msg91SmsAdapter,
  SandboxMessagingAdapter,
  SandboxVoiceAdapter,
  TwilioSmsAdapter,
  TwilioVoiceAdapter,
  WhatsAppCloudAdapter,
} from "./providers.js";

export type IntegrationKey = "whatsapp" | "sms" | "voice";

export interface IntegrationConfig {
  provider?: string;
  [key: string]: unknown;
}

export interface TenantChannels {
  whatsapp: MessagingAdapter;
  sms: MessagingAdapter;
  voice: VoiceAdapter;
  config: Record<IntegrationKey, IntegrationConfig>;
}

/**
 * Resolves the adapters for a tenant: tenant-level credentials (Integrations
 * page) win, then deployment-wide env credentials, then sandbox.
 */
export class ChannelRegistry {
  private sandboxes = new Map<string, { whatsapp: SandboxMessagingAdapter; sms: SandboxMessagingAdapter; voice: SandboxVoiceAdapter }>();

  constructor(private readonly db: Db, private readonly http?: FetchLike) {}

  sandboxFor(tenantId: string) {
    let s = this.sandboxes.get(tenantId);
    if (!s) {
      s = { whatsapp: new SandboxMessagingAdapter("whatsapp"), sms: new SandboxMessagingAdapter("sms"), voice: new SandboxVoiceAdapter() };
      this.sandboxes.set(tenantId, s);
    }
    return s;
  }

  integration(tenantId: string, key: IntegrationKey): IntegrationConfig {
    const row = this.db.get<{ config: string; status: string }>("SELECT config, status FROM integrations WHERE tenant_id = ? AND provider = ?", tenantId, key);
    return row && row.status === "connected" ? parseJson<IntegrationConfig>(row.config, {}) : {};
  }

  for(tenantId: string): TenantChannels {
    const sandbox = this.sandboxFor(tenantId);
    const wa = this.integration(tenantId, "whatsapp");
    const sms = this.integration(tenantId, "sms");
    const voice = this.integration(tenantId, "voice");

    const waToken = str(wa.token) || config.whatsapp.token;
    const waPhone = str(wa.phoneNumberId) || config.whatsapp.phoneNumberId;
    const whatsapp: MessagingAdapter = waToken && waPhone
      ? new WhatsAppCloudAdapter({ token: waToken, phoneNumberId: waPhone, graphVersion: config.whatsapp.graphVersion }, this.http)
      : sandbox.whatsapp;

    let smsAdapter: MessagingAdapter = sandbox.sms;
    const msg91Key = str(sms.authKey) || config.msg91.authKey;
    if ((sms.provider ?? "msg91") === "msg91" && msg91Key) {
      smsAdapter = new Msg91SmsAdapter({ authKey: msg91Key, senderId: str(sms.senderId) || config.msg91.senderId }, this.http);
    } else if (sms.provider === "twilio" || config.twilio.accountSid) {
      const creds = twilioCreds(sms);
      if (creds.accountSid && creds.authToken) smsAdapter = new TwilioSmsAdapter(creds, this.http);
    }

    let voiceAdapter: VoiceAdapter = sandbox.voice;
    const exo = {
      sid: str(voice.sid) || config.exotel.sid,
      apiKey: str(voice.apiKey) || config.exotel.apiKey,
      apiToken: str(voice.apiToken) || config.exotel.apiToken,
      subdomain: str(voice.subdomain) || config.exotel.subdomain,
      callerId: str(voice.callerId) || config.exotel.callerId,
    };
    if ((voice.provider ?? "exotel") === "exotel" && exo.sid && exo.apiKey && exo.apiToken) {
      voiceAdapter = new ExotelVoiceAdapter(exo, this.http);
    } else if (voice.provider === "twilio" || config.twilio.accountSid) {
      const creds = twilioCreds(voice);
      if (creds.accountSid && creds.authToken) voiceAdapter = new TwilioVoiceAdapter(creds, this.http);
    }

    return { whatsapp, sms: smsAdapter, voice: voiceAdapter, config: { whatsapp: wa, sms, voice } };
  }
}

function twilioCreds(c: IntegrationConfig) {
  return {
    accountSid: str(c.accountSid) || config.twilio.accountSid,
    authToken: str(c.authToken) || config.twilio.authToken,
    from: str(c.from) || config.twilio.from,
  };
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
