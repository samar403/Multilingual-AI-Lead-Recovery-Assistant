import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Lang } from "../api";
import { displayName } from "../api";
import { useI18n, statusLabel, LANG_LABEL } from "../i18n";

export interface RadarLead {
  id: string;
  name: string;
  phone: string;
  status: string;
  score: number;
  temperature: string;
  language: Lang;
  source: string;
  created_at: string;
}

// Outer edge = just missed; centre = booked. A lead's dot glides inward as the
// conversation progresses (positions are CSS transforms, so moves animate).
const RINGS: { status: string[]; r: number; key: string }[] = [
  { status: ["new"], r: 270, key: "new" },
  { status: ["contacted"], r: 222, key: "contacted" },
  { status: ["engaged"], r: 170, key: "engaged" },
  { status: ["qualified"], r: 116, key: "qualified" },
  { status: ["booked", "won"], r: 56, key: "booked" },
];

const COLORS: Record<Lang, string> = { gu: "var(--marigold)", hi: "var(--kumkum)", en: "var(--peacock)" };

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

export function Radar({ leads }: { leads: RadarLead[] }) {
  const { t, lang } = useI18n();
  const nav = useNavigate();
  const [tip, setTip] = useState<{ x: number; y: number; lead: RadarLead } | null>(null);

  const dots = useMemo(
    () =>
      leads.map((l) => {
        const ring = RINGS.find((r) => r.status.includes(l.status)) ?? RINGS[0]!;
        const angle = hash(l.id) * Math.PI * 2;
        const jitter = (hash(l.id + "r") - 0.5) * (ring.key === "booked" ? 60 : 30);
        const r = Math.max(10, ring.r + jitter);
        return {
          lead: l,
          x: 300 + Math.cos(angle) * r,
          y: 300 + Math.sin(angle) * r,
          size: 5 + (l.score / 100) * 7,
          fresh: Date.now() - Date.parse(l.created_at) < 15 * 60_000,
        };
      }),
    [leads],
  );

  return (
    <div className="radar-wrap" onMouseLeave={() => setTip(null)}>
      <svg viewBox="0 0 600 600" role="img" aria-label="Lead recovery radar">
        <defs>
          <radialGradient id="rg-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--marigold)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--marigold)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="rg-sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--marigold)" stopOpacity="0" />
            <stop offset="100%" stopColor="var(--marigold)" stopOpacity="0.28" />
          </linearGradient>
        </defs>

        {RINGS.map((ring, i) => (
          <g key={ring.key}>
            <circle cx="300" cy="300" r={ring.r + (i === 4 ? 30 : 26)} fill="none" stroke="var(--line-strong)" strokeDasharray={i % 2 ? "2 6" : "1 0"} strokeWidth={i === 0 ? 1.4 : 1} />
            <text x="300" y={300 - ring.r - (i === 4 ? 30 : 26) + 14} textAnchor="middle" fontSize="10.5" fill="var(--muted)" style={lang === "en" ? { fontFamily: "var(--font-mono)", letterSpacing: "0.12em", textTransform: "uppercase" } : { fontFamily: "var(--font-body)", fontSize: 12 }}>
              {ring.key === "new" ? t("missedCalls") : statusLabel(t, ring.key)}
            </text>
          </g>
        ))}
        <circle cx="300" cy="300" r="86" fill="url(#rg-core)" />
        {/* Diya at the centre: where recovered revenue lands */}
        <g transform="translate(300 300)">
          <path d="M-18 4 Q0 22 18 4 Q0 10 -18 4Z" fill="var(--marigold)" />
          <path d="M0 -16 C6 -6 6 0 0 3 C-6 0 -6 -6 0 -16Z" fill="var(--kumkum)" />
        </g>

        <g className="radar-sweep">
          <path d="M300 300 L600 300 A300 300 0 0 0 512 88 Z" fill="url(#rg-sweep)" />
          <line x1="300" y1="300" x2="600" y2="300" stroke="var(--marigold)" strokeOpacity="0.5" />
        </g>

        {dots.map(({ lead, x, y, size, fresh }) => (
          <g
            key={lead.id}
            style={{ transform: `translate(${x}px, ${y}px)`, transition: "transform 1.1s cubic-bezier(.2,.8,.2,1)" }}
            onMouseEnter={() => setTip({ x: (x / 600) * 100, y: (y / 600) * 100, lead })}
            onFocus={() => setTip({ x: (x / 600) * 100, y: (y / 600) * 100, lead })}
            onClick={() => nav(`/app/inbox/${lead.id}`)}
            onKeyDown={(e) => e.key === "Enter" && nav(`/app/inbox/${lead.id}`)}
            tabIndex={0}
            role="button"
            aria-label={`${displayName(lead)} — ${lead.status}`}
          >
            {fresh && <circle r={size + 4} fill="none" stroke={COLORS[lead.language]} strokeWidth="2" style={{ animation: "pulse 1.6s infinite", transformBox: "fill-box", transformOrigin: "center" }} />}
            <circle className="radar-dot" r={size} fill={COLORS[lead.language]} stroke="var(--card)" strokeWidth="2" opacity={lead.status === "won" ? 0.55 : 1} />
            {lead.temperature === "hot" && <circle r={2.2} fill="var(--card)" />}
          </g>
        ))}
      </svg>
      {tip && (
        <div className="radar-tip" style={{ left: `${tip.x}%`, top: `${tip.y}%` }}>
          <b>{displayName(tip.lead)}</b> · {LANG_LABEL[tip.lead.language].native}
          <div className="mono tiny" style={{ opacity: 0.75 }}>
            {statusLabel(t, tip.lead.status)} · score {tip.lead.score} · {tip.lead.source.replace("_", " ")}
          </div>
        </div>
      )}
    </div>
  );
}
