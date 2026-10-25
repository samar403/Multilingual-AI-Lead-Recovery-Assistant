// Central runtime configuration. Every external integration is optional:
// when credentials are missing the matching adapter runs in sandbox mode so the
// whole product (inbox, follow-ups, billing) works end to end on a laptop.

const env = process.env;

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && value !== undefined && value !== "" ? n : fallback;
}

export const config = {
  env: env.NODE_ENV ?? "development",
  port: num(env.PORT, 8787),
  publicUrl: env.PUBLIC_URL ?? "http://localhost:8787",
  databasePath: env.DATABASE_PATH ?? "data/vaani.db",
  sessionSecret: env.SESSION_SECRET ?? "dev-only-change-me",
  seedDemo: env.SEED_DEMO !== "false",
  schedulerIntervalMs: num(env.SCHEDULER_INTERVAL_MS, 15_000),
  timezone: "Asia/Kolkata",

  ai: {
    apiKey: env.ANTHROPIC_API_KEY ?? "",
    // Opus 5.5 at low effort is the default chat route; override per deployment.
    model: env.AI_MODEL ?? "claude-opus-5-5",
    effort: (env.AI_EFFORT ?? "low") as "low" | "medium" | "high",
    timeoutMs: num(env.AI_TIMEOUT_MS, 20_000),
  },

  whatsapp: {
    token: env.WHATSAPP_TOKEN ?? "",
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID ?? "",
    appSecret: env.WHATSAPP_APP_SECRET ?? "",
    verifyToken: env.WHATSAPP_VERIFY_TOKEN ?? "vaani-verify",
    graphVersion: env.WHATSAPP_GRAPH_VERSION ?? "v21.0",
  },

  exotel: {
    sid: env.EXOTEL_SID ?? "",
    apiKey: env.EXOTEL_API_KEY ?? "",
    apiToken: env.EXOTEL_API_TOKEN ?? "",
    subdomain: env.EXOTEL_SUBDOMAIN ?? "api.exotel.com",
    callerId: env.EXOTEL_CALLER_ID ?? "",
  },

  twilio: {
    accountSid: env.TWILIO_ACCOUNT_SID ?? "",
    authToken: env.TWILIO_AUTH_TOKEN ?? "",
    from: env.TWILIO_FROM ?? "",
  },

  msg91: {
    authKey: env.MSG91_AUTH_KEY ?? "",
    senderId: env.MSG91_SENDER_ID ?? "VAANII",
  },

  razorpay: {
    keyId: env.RAZORPAY_KEY_ID ?? "",
    keySecret: env.RAZORPAY_KEY_SECRET ?? "",
  },
};

export type AppConfig = typeof config;
