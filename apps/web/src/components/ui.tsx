import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { Lang, Lead } from "../api";
import { initials, displayName } from "../api";
import { LANG_LABEL } from "../i18n";

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="18" fill="var(--ink)" />
      <circle cx="32" cy="32" r="18" fill="none" stroke="var(--marigold)" strokeWidth="3" strokeDasharray="4 5" />
      <circle cx="32" cy="32" r="8.5" fill="var(--marigold)" />
      <circle cx="46" cy="18" r="4.5" fill="var(--kumkum)" />
    </svg>
  );
}

export function LangChip({ lang, script }: { lang: Lang; script?: string }) {
  return (
    <span className={`chip ${lang}`} title={LANG_LABEL[lang].en + (script === "latin" ? " (typed in English letters)" : "")}>
      <span className={`langdot ${lang}`} />
      {LANG_LABEL[lang].native}
      {script === "latin" && lang !== "en" ? <span className="mono tiny">Aa</span> : null}
    </span>
  );
}

export function TempChip({ t }: { t: "hot" | "warm" | "cold" }) {
  const label = { hot: "🔥 Hot", warm: "☀️ Warm", cold: "❄️ Cold" }[t];
  return <span className={`chip ${t}`}>{label}</span>;
}

export function LeadAvatar({ lead }: { lead: Pick<Lead, "name" | "phone" | "language" | "temperature"> }) {
  return (
    <div className={`lead-avatar ${lead.language}`} aria-hidden="true">
      {initials(lead.name, lead.phone)}
      <span className={`t ${lead.temperature}`} />
    </div>
  );
}

export function LeadName({ lead }: { lead: Pick<Lead, "name" | "phone"> }) {
  return <>{displayName(lead)}</>;
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="switch" title={label}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span />
    </label>
  );
}

export function Empty({ glyph, title, children }: { glyph: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="glyph">{glyph}</span>
      <b>{title}</b>
      {children ? <div className="small" style={{ marginTop: 6 }}>{children}</div> : null}
    </div>
  );
}

// ------------------------------------------------------------------ toasts

interface Toast {
  id: number;
  text: string;
  kind: "ok" | "error";
}
const ToastCtx = createContext<(text: string, kind?: "ok" | "error") => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === "error" ? "error" : ""}`}>
            {t.kind === "error" ? "⚠️" : "✓"} {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ------------------------------------------------------------------ icons (inline, stroke-based)

const paths: Record<string, string> = {
  radar: "M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0M12 12l6-6",
  inbox: "M4 13h4l2 3h4l2-3h4M4 13l2-8h12l2 8v6H4z",
  pipeline: "M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v5h-4z",
  clock: "M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M12 7v5l3 2",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  plug: "M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4",
  book: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11",
  gear: "M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M19 12h2M3 12h2M12 3v2M12 19v2M17 7l1.5-1.5M5.5 18.5L7 17M17 17l1.5 1.5M5.5 5.5L7 7",
  phone: "M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2",
  send: "M4 12l16-8-6 16-2-7z",
  spark: "M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z",
  search: "M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0M20 20l-4-4",
  out: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
  sun: "M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5",
  moon: "M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z",
  back: "M15 5l-7 7 7 7",
  download: "M12 4v12M7 11l5 5 5-5M5 20h14",
  plus: "M12 5v14M5 12h14",
};

export function Icon({ name, size = 18 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] ?? ""} />
    </svg>
  );
}
