import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { api, displayName, fmtDateTime, fmtDay, timeAgo, useApi, type Followup } from "../api";
import { Topbar, useShell } from "../components/Shell";
import { Empty, LangChip, useToast } from "../components/ui";
import { useI18n } from "../i18n";

const KIND: Record<string, string> = { nudge: "💬 WhatsApp nudge", final: "🙏 Polite close", callback: "📞 Owner call-back", reminder: "⏰ Booking reminder" };

export default function Followups() {
  const { t } = useI18n();
  const toast = useToast();
  const { onLive, me } = useShell();
  const { data, reload } = useApi<Followup[]>("/followups");
  useEffect(() => onLive((type) => (type === "followup" || type === "booking") && void reload()), [onLive, reload]);

  const groups = useMemo(() => {
    const pending = (data ?? []).filter((f) => f.status === "pending");
    const done = (data ?? []).filter((f) => f.status !== "pending").sort((a, b) => (b.executed_at ?? "").localeCompare(a.executed_at ?? ""));
    const byDay = new Map<string, Followup[]>();
    for (const f of pending) {
      const d = fmtDay(f.due_at);
      byDay.set(d, [...(byDay.get(d) ?? []), f]);
    }
    return { byDay, done };
  }, [data]);

  const act = async (id: string, action: "run" | "cancel") => {
    try {
      await api(`/followups/${id}/${action}`, { body: {} });
      toast(action === "run" ? "Sent now" : "Cancelled");
      void reload();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const c = me.tenant.settings.cadence;
  return (
    <>
      <Topbar title={t("followups")} />
      <div className="page">
        <div className="card pad">
          <div className="eyebrow">Your recovery cadence</div>
          <div className="row wrap" style={{ marginTop: 10, gap: 8 }}>
            <span className="chip">📵 Missed call</span>→
            <span className="chip gu">⚡ WhatsApp in seconds</span>→
            {me.tenant.settings.ownerPhone && (
              <>
                <span className="chip">📞 Call-back +{c.callbackAfterMin}m</span>→
              </>
            )}
            <span className="chip">💬 Nudge +{Math.round(c.nudgeAfterMin / 60)}h</span>→
            <span className="chip">💬 Nudge +{Math.round(c.secondNudgeAfterMin / 60)}h</span>→
            <span className="chip">🙏 Close +{Math.round(c.finalNudgeAfterMin / 1440)}d</span>
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Nothing is sent during quiet hours ({me.tenant.settings.quietHours.start}–{me.tenant.settings.quietHours.end} IST) — those messages wait for the morning. Outside the 24-hour WhatsApp window, only approved templates go out. A reply from the customer cancels the rest of the plan.
          </p>
        </div>

        <div className="dash-grid">
          <div className="card pad">
            <h3>Scheduled</h3>
            {groups.byDay.size === 0 && <Empty glyph="🌤️" title="All caught up" />}
            {[...groups.byDay.entries()].map(([day, items]) => (
              <div key={day} style={{ marginTop: 14 }}>
                <div className="eyebrow" style={{ marginBottom: 6 }}>{day}</div>
                <div className="agenda">
                  {items.map((f) => (
                    <FollowRow key={f.id} f={f} onAct={act} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="card pad">
            <h3>Recently done</h3>
            <div className="agenda" style={{ marginTop: 10 }}>
              {groups.done.slice(0, 30).map((f) => (
                <FollowRow key={f.id} f={f} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function FollowRow({ f, onAct }: { f: Followup; onAct?: (id: string, a: "run" | "cancel") => void }) {
  return (
    <>
      <div className="when">{f.status === "pending" ? fmtDateTime(f.due_at).split(", ").slice(-1)[0] : timeAgo(f.executed_at)}</div>
      <div className={`what ${f.status === "sent" ? "done" : f.status === "pending" ? "" : "off"}`}>
        <div className="spread">
          <div>
            <b>{KIND[f.kind] ?? f.kind}</b> → <Link to={`/app/inbox/${f.lead_id}`}>{displayName({ name: f.name ?? "", phone: f.phone ?? "" })}</Link>{" "}
            {f.language && <LangChip lang={f.language} />}
          </div>
          {onAct ? (
            <div className="row" style={{ gap: 4 }}>
              <button className="btn sm" onClick={() => onAct(f.id, "run")}>Send now</button>
              <button className="btn ghost sm danger" onClick={() => onAct(f.id, "cancel")}>✕</button>
            </div>
          ) : (
            <span className={`chip ${f.status === "sent" ? "ok" : "cold"}`}>{f.status}</span>
          )}
        </div>
        <div className="tiny muted">{f.reason}</div>
      </div>
    </>
  );
}
