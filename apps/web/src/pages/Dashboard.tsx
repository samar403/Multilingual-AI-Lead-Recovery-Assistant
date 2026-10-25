import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, compactRupees, displayName, fmtDateTime, timeAgo, useApi, type Lang } from "../api";
import { Topbar, useShell } from "../components/Shell";
import { Radar, type RadarLead } from "../components/Radar";
import { Empty, Icon, useToast } from "../components/ui";
import { LANG_LABEL, useI18n } from "../i18n";

interface Dash {
  kpis: {
    leads: number;
    missedCalls: number;
    recovered: number;
    recoveryRate: number;
    booked: number;
    bookingRate: number;
    recoveredRevenue: number;
    medianFirstResponseSec: number | null;
    goldenMinuteRate: number;
    hot: number;
  };
  byLang: Record<Lang, number>;
  bySource: Record<string, number>;
  series: { date: string; leads: number; recovered: number; booked: number }[];
  radar: RadarLead[];
  attention: { id: string; name: string; phone: string; language: Lang; intent: string; updated_at: string }[];
  upcoming: { id: string; lead_id: string; name: string; phone: string; starts_at: string; kind: string }[];
  feed: { id: string; lead_id: string; name: string; phone: string; direction: string; author: string; channel: string; body: string; gloss: string; created_at: string }[];
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Counts up to the target when it changes — small, but it makes live updates feel alive. */
function useCountUp(target: number) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / 700);
      setV(Math.round(a + (target - a) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

export default function Dashboard() {
  const { t, lang } = useI18n();
  const { me, onLive } = useShell();
  const toast = useToast();
  const { data, reload } = useApi<Dash>("/dashboard?days=30");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = onLive((type) => {
      if (["lead", "message", "booking"].includes(type)) {
        clearTimeout(timer);
        timer = setTimeout(() => void reload(), 400);
      }
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [onLive, reload]);

  const revenue = useCountUp(data?.kpis.recoveredRevenue ?? 0);
  const recovered = useCountUp(data?.kpis.recovered ?? 0);

  const simulate = async () => {
    setBusy(true);
    try {
      await api("/simulate/missed-call", { body: {} });
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const hello = { en: "Namaste", hi: "नमस्ते", gu: "નમસ્તે" }[lang];

  return (
    <>
      <Topbar title={`${hello}, ${me.user.name.split(" ")[0]} 🙏`}>
        <button className="btn marigold sm" onClick={simulate} disabled={busy}>
          <Icon name="phone" size={15} /> {t("simulateCall")}
        </button>
      </Topbar>
      <div className="page">
        {!data ? (
          <div className="muted">…</div>
        ) : (
          <>
            <div className="kpis">
              <div className="card kpi accent">
                <span className="eyebrow">{t("revenueRecovered")}</span>
                <span className="value">{compactRupees(revenue)}</span>
                <span className="sub">
                  {data.kpis.booked} {t("booked").toLowerCase()} · 30d
                </span>
              </div>
              <div className="card kpi">
                <span className="eyebrow">{t("recovered")}</span>
                <span className="value">
                  {recovered}
                  <span className="muted" style={{ fontSize: 18 }}> / {data.kpis.leads}</span>
                </span>
                <span className="sub">{pct(data.kpis.recoveryRate)} of leads replied & engaged</span>
              </div>
              <div className="card kpi">
                <span className="eyebrow">{t("missedCalls")}</span>
                <span className="value">{data.kpis.missedCalls}</span>
                <span className="sub">every one answered on WhatsApp</span>
              </div>
              <div className="card kpi" style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <div className="ring" style={{ ["--p" as string]: data.kpis.goldenMinuteRate }}>
                  <span>{pct(data.kpis.goldenMinuteRate)}</span>
                </div>
                <div>
                  <span className="eyebrow">{t("goldenMinute")}</span>
                  <div className="sub" style={{ marginTop: 4 }}>
                    <b className="mono">{data.kpis.medianFirstResponseSec ?? "–"}s</b> {t("medianReply")}
                  </div>
                </div>
              </div>
            </div>

            <div className="dash-grid">
              <div className="card radar-card">
                <div className="spread" style={{ marginBottom: 6 }}>
                  <div>
                    <h3>{t("radarTitle")}</h3>
                    <div className="small muted" style={{ maxWidth: 420 }}>{t("radarSub")}</div>
                  </div>
                  <span className="chip hot">🔥 {data.kpis.hot}</span>
                </div>
                {data.radar.length ? <Radar leads={data.radar} /> : <Empty glyph="📡" title="No leads yet">Simulate a missed call to watch it travel inward.</Empty>}
                <div className="legend" style={{ justifyContent: "center" }}>
                  {(["gu", "hi", "en"] as const).map((l) => (
                    <span key={l}>
                      <i className={`langdot ${l}`} /> {LANG_LABEL[l].native}
                    </span>
                  ))}
                  <span>● size = lead score</span>
                </div>
              </div>

              <div className="stack" style={{ gap: 18 }}>
                {data.attention.length > 0 && (
                  <div className="card pad" style={{ borderColor: "var(--kumkum)" }}>
                    <div className="spread">
                      <h3>🙋 {t("needsYou")}</h3>
                      <span className="chip hot">{data.attention.length}</span>
                    </div>
                    <div className="feed" style={{ marginTop: 8 }}>
                      {data.attention.map((a) => (
                        <Link key={a.id} to={`/app/inbox/${a.id}`} className="feed-item">
                          <span className="ico">{a.intent === "complaint" ? "😟" : "📞"}</span>
                          <span>
                            <b>{displayName(a)}</b>
                            <div className="gl">{a.intent === "complaint" ? "Raised a complaint" : "Asked to talk to a person"}</div>
                          </span>
                          <span className="tiny muted">{timeAgo(a.updated_at)}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                <div className="card pad">
                  <div className="spread">
                    <h3>{t("liveFeed")}</h3>
                    <Link to="/app/inbox" className="btn ghost sm">
                      {t("inbox")} →
                    </Link>
                  </div>
                  <div className="feed scrolling" style={{ marginTop: 6 }}>
                    {data.feed.map((m) => (
                      <Link key={m.id} to={`/app/inbox/${m.lead_id}`} className="feed-item">
                        <span className="ico">{m.channel === "voice" ? "📵" : m.author === "customer" ? "💬" : m.author === "ai" ? "✦" : m.author === "agent" ? "🧑" : "🔔"}</span>
                        <span style={{ minWidth: 0 }}>
                          <span className="tiny muted">
                            {m.author === "customer" ? displayName(m) : m.author === "ai" ? `Vaani → ${displayName(m)}` : m.author}
                          </span>
                          <div className="body">{m.body}</div>
                          {m.gloss && m.author === "customer" && <div className="gl">“{m.gloss}”</div>}
                        </span>
                        <span className="tiny muted">{timeAgo(m.created_at)}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="dash-grid" style={{ gridTemplateColumns: "1.35fr 1fr" }}>
              <div className="card pad">
                <div className="spread">
                  <h3>{t("last14")}</h3>
                  <div className="legend">
                    <span><i className="langdot" style={{ background: "var(--paper-2)", outline: "1px solid var(--line-strong)" }} /> {t("leads")}</span>
                    <span><i className="langdot" style={{ background: "var(--marigold)" }} /> {t("recovered")}</span>
                    <span><i className="langdot" style={{ background: "var(--leaf)" }} /> {t("booked")}</span>
                  </div>
                </div>
                <Bars series={data.series} />
              </div>
              <div className="card pad stack">
                <h3>{t("languages")}</h3>
                <LangSplit byLang={data.byLang} />
                <div className="divider" />
                <h3>{t("upcoming")}</h3>
                {data.upcoming.length ? (
                  data.upcoming.map((u) => (
                    <Link key={u.id} to={`/app/inbox/${u.lead_id}`} className="spread" style={{ textDecoration: "none" }}>
                      <span>
                        <b>{displayName(u)}</b> <span className="muted small">· {u.kind}</span>
                      </span>
                      <span className="mono small">{fmtDateTime(u.starts_at)}</span>
                    </Link>
                  ))
                ) : (
                  <div className="small muted">No upcoming bookings yet.</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Bars({ series }: { series: Dash["series"] }) {
  const max = Math.max(1, ...series.map((s) => s.leads));
  return (
    <div className="bars" role="img" aria-label="Leads, recovered and booked per day">
      {series.map((s) => (
        <div className="b" key={s.date} title={`${new Date(s.date).toDateString()}: ${s.leads} leads, ${s.recovered} recovered, ${s.booked} booked`}>
          <div className="seg-l" style={{ height: `${((s.leads - s.recovered) / max) * 100}px` }} />
          <div className="seg-r" style={{ height: `${((s.recovered - s.booked) / max) * 100}px` }} />
          <div className="seg-b" style={{ height: `${(s.booked / max) * 100}px` }} />
          <div className="lbl">{new Date(s.date).getDate()}</div>
        </div>
      ))}
    </div>
  );
}

function LangSplit({ byLang }: { byLang: Record<Lang, number> }) {
  const total = Math.max(1, (byLang.gu ?? 0) + (byLang.hi ?? 0) + (byLang.en ?? 0));
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="langbar">
        {(["gu", "hi", "en"] as const).map((l) => (
          <i key={l} style={{ width: `${((byLang[l] ?? 0) / total) * 100}%`, background: `var(--${l === "gu" ? "marigold" : l === "hi" ? "kumkum" : "peacock"})` }} />
        ))}
      </div>
      <div className="legend">
        {(["gu", "hi", "en"] as const).map((l) => (
          <span key={l}>
            <i className={`langdot ${l}`} /> {LANG_LABEL[l].native} <b className="mono">{Math.round(((byLang[l] ?? 0) / total) * 100)}%</b>
          </span>
        ))}
      </div>
    </div>
  );
}
