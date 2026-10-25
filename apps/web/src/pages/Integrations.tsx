import { useState } from "react";
import { api, useApi } from "../api";
import { Topbar, useShell } from "../components/Shell";
import { useToast } from "../components/ui";
import { useI18n } from "../i18n";

interface Integ {
  key: "whatsapp" | "sms" | "voice";
  status: string;
  config: Record<string, unknown>;
  live: boolean;
  provider: string;
}
interface Resp {
  integrations: Integ[];
  webhooks: Record<string, string>;
}

const META: Record<Integ["key"], { title: string; glyph: string; bg: string; blurb: string; providers: { id: string; label: string; fields: { k: string; label: string; secret?: boolean; hint?: string }[] }[] }> = {
  whatsapp: {
    title: "WhatsApp Business",
    glyph: "🟢",
    bg: "var(--leaf-soft)",
    blurb: "Official Meta Cloud API. Free-form replies inside the 24h window, approved templates outside it.",
    providers: [
      {
        id: "meta",
        label: "Meta Cloud API",
        fields: [
          { k: "phoneNumberId", label: "Phone number ID" },
          { k: "token", label: "Permanent access token", secret: true },
          { k: "appSecret", label: "App secret", secret: true, hint: "Used to verify X-Hub-Signature-256" },
          { k: "verifyToken", label: "Webhook verify token" },
        ],
      },
    ],
  },
  sms: {
    title: "SMS fallback (DLT)",
    glyph: "✉️",
    bg: "var(--marigold-soft)",
    blurb: "When a number isn't on WhatsApp, Vaani falls back to a TRAI DLT-registered SMS.",
    providers: [
      { id: "msg91", label: "MSG91", fields: [{ k: "authKey", label: "Auth key", secret: true }, { k: "senderId", label: "Sender ID (6 letters)" }] },
      { id: "twilio", label: "Twilio", fields: [{ k: "accountSid", label: "Account SID" }, { k: "authToken", label: "Auth token", secret: true }, { k: "from", label: "From number" }] },
    ],
  },
  voice: {
    title: "Calls & missed-call capture",
    glyph: "📞",
    bg: "var(--peacock-soft)",
    blurb: "Detects missed calls on your business number and bridges owner call-backs through your virtual number.",
    providers: [
      { id: "exotel", label: "Exotel", fields: [{ k: "sid", label: "Account SID" }, { k: "apiKey", label: "API key", secret: true }, { k: "apiToken", label: "API token", secret: true }, { k: "subdomain", label: "Subdomain", hint: "api.exotel.com or api.in.exotel.com" }, { k: "callerId", label: "ExoPhone (caller ID)" }] },
      { id: "twilio", label: "Twilio", fields: [{ k: "accountSid", label: "Account SID" }, { k: "authToken", label: "Auth token", secret: true }, { k: "from", label: "Twilio number" }] },
    ],
  },
};

export default function Integrations() {
  const { t } = useI18n();
  const { me } = useShell();
  const toast = useToast();
  const { data, reload } = useApi<Resp>("/integrations");

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text);
    toast("Copied");
  };

  return (
    <>
      <Topbar title={t("integrations")} />
      <div className="page">
        <div className="card pad row wrap" style={{ gap: 16 }}>
          <div style={{ fontSize: 28 }}>✦</div>
          <div className="grow">
            <b>AI brain: {me.ai === "claude" ? "Claude (Anthropic)" : "Vaani playbook engine"}</b>
            <div className="small muted">
              {me.ai === "claude"
                ? "Replies, translations and qualification are written by Claude, with the playbook engine as an instant fallback."
                : "Running the offline trilingual playbook engine. Set ANTHROPIC_API_KEY on the server to switch on Claude-written replies."}
            </div>
          </div>
          <span className={`status-pill ${me.ai === "claude" ? "live" : "sandbox"}`}>
            <i /> {me.ai === "claude" ? "Live" : "Playbook"}
          </span>
        </div>

        <div className="integ-grid">
          {data?.integrations.map((i) => (
            <IntegCard key={i.key} integ={i} onSaved={reload} />
          ))}
        </div>

        {data && (
          <div className="card pad stack">
            <h3>Webhooks & lead sources</h3>
            <p className="small muted" style={{ margin: 0 }}>
              Paste these into your providers. Every URL carries your private key — rotate it from Settings if it leaks.
            </p>
            {[
              ["WhatsApp (Meta app webhook)", data.webhooks.whatsapp],
              ["Exotel Passthru / status callback", data.webhooks.exotel],
              ["Twilio voice status callback", data.webhooks.twilioVoice],
              ["Twilio SMS webhook", data.webhooks.twilioSms],
              ["IndiaMART Push API", data.webhooks.indiamart],
              ["JustDial lead push", data.webhooks.justdial],
              ["Website / 99acres / MagicBricks (JSON: name, phone, message)", data.webhooks.leads],
            ].map(([label, url]) => (
              <div key={label}>
                <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
                <div className="code">
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{url}</span>
                  <button className="btn ghost sm" onClick={() => copy(url!)}>Copy</button>
                </div>
              </div>
            ))}
            <div>
              <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>Website enquiry form — drop-in snippet</div>
              <pre className="code" style={{ whiteSpace: "pre-wrap", display: "block" }}>{`<form onsubmit="fetch('${data.webhooks.leads}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(this)))});this.innerHTML='🙏 We\\'ll WhatsApp you in a minute';return false">
  <input name="name" placeholder="Name"> <input name="phone" placeholder="Mobile" required>
  <input name="message" placeholder="What are you looking for?"> <button>Send</button>
</form>`}</pre>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function IntegCard({ integ, onSaved }: { integ: Integ; onSaved: () => void }) {
  const meta = META[integ.key];
  const toast = useToast();
  const [provider, setProvider] = useState<string>((integ.config.provider as string) ?? meta.providers[0]!.id);
  const [form, setForm] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(integ.config).map(([k, v]) => [k, String(v ?? "")])));
  const [open, setOpen] = useState(false);
  const fields = meta.providers.find((p) => p.id === provider)?.fields ?? [];

  const save = async () => {
    try {
      await api(`/integrations/${integ.key}`, { method: "PUT", body: { ...form, provider } });
      toast(`${meta.title} connected`);
      setOpen(false);
      onSaved();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  const disconnect = async () => {
    await api(`/integrations/${integ.key}`, { method: "DELETE" });
    toast("Disconnected — sandbox mode");
    onSaved();
  };

  return (
    <div className="card integ">
      <div className="spread">
        <div className="logo" style={{ background: meta.bg }}>{meta.glyph}</div>
        <span className={`status-pill ${integ.live ? "live" : "sandbox"}`}>
          <i /> {integ.live ? `Live · ${integ.provider}` : "Sandbox"}
        </span>
      </div>
      <h3>{meta.title}</h3>
      <p className="small muted" style={{ margin: 0 }}>{meta.blurb}</p>
      {!integ.live && <p className="tiny muted" style={{ margin: 0 }}>Sandbox records every message in your inbox exactly as it would be sent — perfect for testing before going live.</p>}
      {open ? (
        <div className="stack" style={{ gap: 10 }}>
          {meta.providers.length > 1 && (
            <div className="seg">
              {meta.providers.map((p) => (
                <button key={p.id} aria-pressed={provider === p.id} onClick={() => setProvider(p.id)}>{p.label}</button>
              ))}
            </div>
          )}
          {fields.map((f) => (
            <label key={f.k} className="field">
              {f.label} {f.hint && <span className="hint">{f.hint}</span>}
              <input className="input" type={f.secret ? "password" : "text"} value={form[f.k] ?? ""} onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} autoComplete="off" />
            </label>
          ))}
          <div className="row">
            <button className="btn primary sm" onClick={save}>Save & connect</button>
            <button className="btn ghost sm" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="row" style={{ marginTop: "auto" }}>
          <button className="btn sm" onClick={() => setOpen(true)}>{integ.status === "connected" ? "Edit" : "Connect"}</button>
          {integ.status === "connected" && <button className="btn ghost sm danger" onClick={disconnect}>Disconnect</button>}
        </div>
      )}
    </div>
  );
}
