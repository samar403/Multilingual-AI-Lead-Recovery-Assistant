import { useEffect, useState } from "react";
import { api, useApi, type TenantSettings } from "../api";
import { Topbar, useShell } from "../components/Shell";
import { Switch, useToast } from "../components/ui";
import { useI18n } from "../i18n";

interface SettingsResp {
  tenant: { name: string; city: string; phone: string; default_lang: string; vertical: string; settings: TenantSettings };
  webhooks: Record<string, string>;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Settings() {
  const { t } = useI18n();
  const toast = useToast();
  const { reloadMe } = useShell();
  const { data } = useApi<SettingsResp>("/settings");
  const [form, setForm] = useState<SettingsResp["tenant"] | null>(null);
  const [saving, setSaving] = useState(false);
  const [audit, setAudit] = useState<{ actor: string; action: string; detail: string; created_at: string }[]>([]);

  useEffect(() => {
    if (data) setForm(data.tenant);
  }, [data]);
  useEffect(() => {
    api<typeof audit>("/audit").then(setAudit).catch(() => {});
  }, []);

  if (!form) return <Topbar title={t("settings")} />;
  const s = form.settings;
  const set = (patch: Partial<TenantSettings>) => setForm({ ...form, settings: { ...s, ...patch } });

  const save = async () => {
    setSaving(true);
    try {
      await api("/settings", { method: "PATCH", body: { name: form.name, city: form.city, phone: form.phone, default_lang: form.default_lang, settings: form.settings } });
      toast("Saved — Vaani will use this from the next message");
      reloadMe();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Topbar title={t("settings")}>
        <button className="btn primary sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
      </Topbar>
      <div className="page">
        <div className="dash-grid">
          <div className="stack" style={{ gap: 18 }}>
            <section className="card pad stack">
              <h3>Business</h3>
              <div className="form-grid">
                <label className="field">Business name<input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
                <label className="field">City<input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
                <label className="field">Business number<input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
                <label className="field">Owner's mobile <span className="hint">rung first for call-backs</span><input className="input" value={s.ownerPhone} onChange={(e) => set({ ownerPhone: e.target.value })} /></label>
                <label className="field full">Address (sent with bookings)<input className="input" value={s.address} onChange={(e) => set({ address: e.target.value })} /></label>
                <label className="field">First-message language <span className="hint">before we know the customer's</span>
                  <select className="select" value={form.default_lang} onChange={(e) => setForm({ ...form, default_lang: e.target.value })}>
                    <option value="gu">ગુજરાતી</option>
                    <option value="hi">हिन्दी</option>
                    <option value="en">English</option>
                  </select>
                </label>
                <label className="field">Average deal value (₹)<input className="input" type="number" value={s.avgDealValue} onChange={(e) => set({ avgDealValue: Number(e.target.value) })} /></label>
              </div>
            </section>

            <section className="card pad stack">
              <h3>What Vaani knows</h3>
              <label className="field">Price note <span className="hint">the only pricing the AI is allowed to quote</span>
                <textarea className="textarea" value={s.priceNote} onChange={(e) => set({ priceNote: e.target.value })} placeholder="e.g. Fees ₹38,000/year, EMI available, 40% scholarship via test." />
              </label>
              <TagEditor label="Offerings" values={s.offerings} onChange={(offerings) => set({ offerings })} />
              <TagEditor label="Localities served" hint="add native spellings with | e.g. Bopal|બોપલ|बोपल" values={s.localities} onChange={(localities) => set({ localities })} />
              <label className="field">Notes for the AI <span className="hint">tone, policies, things to never say</span>
                <textarea className="textarea" value={s.aiPersona} onChange={(e) => set({ aiPersona: e.target.value })} placeholder="e.g. Always mention free parking. Never promise ranks or results." />
              </label>
            </section>
          </div>

          <div className="stack" style={{ gap: 18 }}>
            <section className="card pad stack">
              <div className="spread">
                <h3>Auto-reply</h3>
                <Switch checked={s.autoReply} onChange={(autoReply) => set({ autoReply })} label="Auto-reply" />
              </div>
              <div className="small muted">When off, Vaani only logs messages and alerts you — no automatic replies.</div>
              <div className="divider" />
              <b className="small">Business hours (IST)</b>
              <div className="row">
                <input className="input" type="time" value={s.hours.open} onChange={(e) => set({ hours: { ...s.hours, open: e.target.value } })} aria-label="Opens" />
                <span>–</span>
                <input className="input" type="time" value={s.hours.close} onChange={(e) => set({ hours: { ...s.hours, close: e.target.value } })} aria-label="Closes" />
              </div>
              <div className="days">
                {DAYS.map((d, i) => (
                  <button key={d} aria-pressed={s.hours.days.includes(i)} onClick={() => set({ hours: { ...s.hours, days: s.hours.days.includes(i) ? s.hours.days.filter((x) => x !== i) : [...s.hours.days, i].sort() } })}>
                    {d}
                  </button>
                ))}
              </div>
            </section>

            <section className="card pad stack">
              <h3>Compliance</h3>
              <b className="small">Quiet hours for automated follow-ups</b>
              <div className="row">
                <input className="input" type="time" value={s.quietHours.start} onChange={(e) => set({ quietHours: { ...s.quietHours, start: e.target.value } })} aria-label="Quiet from" />
                <span>–</span>
                <input className="input" type="time" value={s.quietHours.end} onChange={(e) => set({ quietHours: { ...s.quietHours, end: e.target.value } })} aria-label="Quiet until" />
              </div>
              <label className="field">Consent mode
                <select className="select" value={s.consentMode} onChange={(e) => set({ consentMode: e.target.value as TenantSettings["consentMode"] })}>
                  <option value="implied_inbound">Customer-initiated contact counts as consent (missed call, enquiry)</option>
                  <option value="explicit_only">Only message customers who explicitly opted in</option>
                </select>
              </label>
              <div className="small muted">STOP / बंद करो / બંધ કરો always unsubscribes instantly and is logged in the consent trail (DPDP Act 2023).</div>
            </section>

            <section className="card pad stack">
              <h3>Follow-up cadence</h3>
              <div className="form-grid">
                <label className="field">Owner call-back after (min)<input className="input" type="number" value={s.cadence.callbackAfterMin} onChange={(e) => set({ cadence: { ...s.cadence, callbackAfterMin: Number(e.target.value) } })} /></label>
                <label className="field">First nudge after (min)<input className="input" type="number" value={s.cadence.nudgeAfterMin} onChange={(e) => set({ cadence: { ...s.cadence, nudgeAfterMin: Number(e.target.value) } })} /></label>
                <label className="field">Second nudge after (min)<input className="input" type="number" value={s.cadence.secondNudgeAfterMin} onChange={(e) => set({ cadence: { ...s.cadence, secondNudgeAfterMin: Number(e.target.value) } })} /></label>
                <label className="field">Polite close after (min)<input className="input" type="number" value={s.cadence.finalNudgeAfterMin} onChange={(e) => set({ cadence: { ...s.cadence, finalNudgeAfterMin: Number(e.target.value) } })} /></label>
              </div>
            </section>

            <section className="card pad stack">
              <div className="spread">
                <h3>Activity log</h3>
                <button className="btn ghost sm" onClick={async () => { await api("/settings/rotate-key", { body: {} }); toast("Webhook key rotated — update your providers"); }}>Rotate webhook key</button>
              </div>
              <div style={{ maxHeight: 220, overflowY: "auto" }}>
                {audit.map((a, i) => (
                  <div key={i} className="small" style={{ padding: "4px 0", borderBottom: "1px dashed var(--line)" }}>
                    <span className="mono tiny muted">{new Date(a.created_at).toLocaleString("en-IN")}</span> · <b>{a.action}</b> <span className="muted">{a.detail}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

function TagEditor({ label, hint, values, onChange }: { label: string; hint?: string; values: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft("");
  };
  return (
    <div className="field" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)" }}>{label} {hint && <span className="hint" style={{ fontWeight: 400, color: "var(--muted)" }}>{hint}</span>}</span>
      <div className="tags">
        {values.map((v) => (
          <span key={v} className="chip">
            {v.split("|")[0]}
            {v.includes("|") && <span className="muted tiny">+{v.split("|").length - 1}</span>}
            <button onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`}>×</button>
          </span>
        ))}
      </div>
      <div className="row">
        <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} placeholder="Type and press Enter" />
        <button className="btn sm" onClick={add}>Add</button>
      </div>
    </div>
  );
}
