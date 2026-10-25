export interface TemplateRef {
  name: string; // approved template name at the provider (WhatsApp) or DLT template id (SMS)
  language: string; // "en" | "hi" | "gu"
  params: string[]; // positional body parameters {{1}}, {{2}}, ...
}

export interface OutboundMessage {
  to: string; // E.164
  text: string; // rendered body; used verbatim for free-form sends and as the sandbox transcript
  template?: TemplateRef;
}

export interface SendResult {
  ok: boolean;
  providerId?: string;
  error?: string;
  sandbox: boolean;
}

export interface MessagingAdapter {
  readonly provider: string;
  readonly channel: "whatsapp" | "sms";
  readonly sandbox: boolean;
  send(msg: OutboundMessage): Promise<SendResult>;
}

export interface VoiceAdapter {
  readonly provider: string;
  readonly sandbox: boolean;
  /** Rings the business owner first, then bridges them to the customer. */
  connect(agentPhone: string, customerPhone: string, statusCallbackUrl?: string): Promise<SendResult>;
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;
