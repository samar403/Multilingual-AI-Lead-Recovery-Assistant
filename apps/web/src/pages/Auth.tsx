import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setToken, type Lang } from "../api";
import { Logo } from "../components/ui";
import { LipiSwitch } from "../components/Shell";

const VERTS = [
  { id: "coaching", emoji: "🎓", label: "Coaching institute" },
  { id: "real_estate", emoji: "🏠", label: "Property agent" },
  { id: "salon", emoji: "💇‍♀️", label: "Salon & spa" },
  { id: "services", emoji: "🛠️", label: "Service business" },
];

export function Auth({ mode }: { mode: "login" | "signup" }) {
  const nav = useNavigate();
  const [form, setForm] = useState({ businessName: "", vertical: "coaching", city: "", name: "", email: "", phone: "", password: "", language: "gu" as Lang });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const out =
        mode === "login"
          ? await api<{ token: string }>("/auth/login", { body: { email: form.email, password: form.password } })
          : await api<{ token: string }>("/auth/signup", { body: { ...form, phone: form.phone || undefined } });
      setToken(out.token);
      nav("/app");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="art">
        <div className="bandhani" style={{ position: "absolute", inset: 0, opacity: 0.1 }} />
        <Link to="/" className="brand" style={{ position: "relative", color: "var(--paper)" }}>
          <Logo />
          <span className="word">Vaani</span>
          <span className="script">વાણી</span>
        </Link>
        <div style={{ position: "relative" }}>
          <div className="eyebrow" style={{ color: "rgba(245,239,227,.6)" }}>The problem, in one line</div>
          <h2 style={{ marginTop: 10 }}>Call miss thayo, student bija class ma gayo.</h2>
          <p style={{ opacity: 0.7 }}>Miss the call, lose the student. Vaani makes sure every caller hears back within seconds — in their own language.</p>
        </div>
        <div className="row" style={{ position: "relative", gap: 18, opacity: 0.8 }} lang="gu">
          <span>ગુજરાતી</span><span lang="hi">हिन्दी</span><span>English</span>
        </div>
      </div>
      <form className="form" onSubmit={submit}>
        <div className="spread">
          <h1 style={{ fontSize: 34 }}>{mode === "login" ? "Welcome back" : "Set up your desk"}</h1>
          <LipiSwitch />
        </div>
        <p className="muted" style={{ margin: 0 }}>
          {mode === "login" ? (
            <>New here? <Link to="/signup">Create an account</Link></>
          ) : (
            <>Takes a minute. Runs in sandbox until you connect WhatsApp. Already have an account? <Link to="/login">Sign in</Link></>
          )}
        </p>
        {mode === "signup" && (
          <>
            <div className="vpick" role="group" aria-label="Business type">
              {VERTS.map((v) => (
                <button type="button" key={v.id} aria-pressed={form.vertical === v.id} onClick={() => set("vertical", v.id)}>
                  <span style={{ fontSize: 22 }}>{v.emoji}</span> {v.label}
                </button>
              ))}
            </div>
            <div className="form-grid">
              <label className="field">Business name<input className="input" required value={form.businessName} onChange={(e) => set("businessName", e.target.value)} placeholder="Shiksha Academy" /></label>
              <label className="field">City<input className="input" required value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Ahmedabad" /></label>
              <label className="field">Your name<input className="input" required value={form.name} onChange={(e) => set("name", e.target.value)} /></label>
              <label className="field">Mobile<input className="input" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="98250 00000" inputMode="tel" /></label>
            </div>
            <label className="field">Most of your customers speak
              <select className="select" value={form.language} onChange={(e) => set("language", e.target.value)}>
                <option value="gu">ગુજરાતી — Gujarati</option>
                <option value="hi">हिन्दी — Hindi</option>
                <option value="en">English</option>
              </select>
            </label>
          </>
        )}
        <label className="field">Email<input className="input" type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" /></label>
        <label className="field">Password<input className="input" type="password" required minLength={mode === "signup" ? 8 : 1} value={form.password} onChange={(e) => set("password", e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
        {error && <div className="window-banner closed" role="alert">{error}</div>}
        <button className="btn primary lg" disabled={busy}>{busy ? "…" : mode === "login" ? "Sign in" : "Create my desk"}</button>
        {mode === "login" && (
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setForm((f) => ({ ...f, email: "demo@vaani.app", password: "vaani-demo" }));
            }}
          >
            Use demo account (demo@vaani.app)
          </button>
        )}
      </form>
    </div>
  );
}
