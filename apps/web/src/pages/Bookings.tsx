import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, displayName, fmtTime, useApi, type Lang } from "../api";
import { Topbar, useShell } from "../components/Shell";
import { useToast } from "../components/ui";
import { useI18n } from "../i18n";

interface Booking {
  id: string;
  lead_id: string;
  name: string;
  phone: string;
  language: Lang;
  starts_at: string;
  status: string;
  kind: string;
  slots: string;
}

const istKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);

export default function Bookings() {
  const { t } = useI18n();
  const toast = useToast();
  const { onLive } = useShell();
  const [offset, setOffset] = useState(0);
  const from = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1 + offset * 7);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [offset]);
  const { data, reload } = useApi<Booking[]>(`/bookings?from=${encodeURIComponent(from.toISOString())}`, [from.toISOString()]);
  useEffect(() => onLive((type) => type === "booking" && void reload()), [onLive, reload]);

  const days = Array.from({ length: 7 }, (_, i) => new Date(from.getTime() + i * 86_400_000));
  const today = istKey(new Date());

  const mark = async (id: string, status: "completed" | "no_show" | "cancelled") => {
    try {
      await api(`/bookings/${id}`, { method: "PATCH", body: { status } });
      toast(status === "completed" ? "Marked as won 🎉" : status === "no_show" ? "Marked no-show" : "Cancelled");
      void reload();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <>
      <Topbar title={t("bookings")}>
        <button className="btn sm" onClick={() => setOffset((o) => o - 1)}>←</button>
        <button className="btn sm" onClick={() => setOffset(0)}>This week</button>
        <button className="btn sm" onClick={() => setOffset((o) => o + 1)}>→</button>
      </Topbar>
      <div className="page">
        <div className="week">
          {days.map((d) => {
            const key = istKey(d);
            const items = (data ?? []).filter((b) => istKey(new Date(b.starts_at)) === key);
            return (
              <div key={key} className={`day ${key === today ? "today" : ""}`}>
                <div>
                  <div className="dname">{d.toLocaleDateString("en-IN", { weekday: "short" })}</div>
                  <div className="dnum">{d.getDate()}</div>
                </div>
                {items.map((b) => (
                  <div key={b.id} className={`appt ${b.status}`}>
                    <Link to={`/app/inbox/${b.lead_id}`} style={{ textDecoration: "none" }}>
                      <b className="mono">{fmtTime(b.starts_at)}</b> · {displayName(b)}
                      <div className="tiny muted">{b.kind}</div>
                    </Link>
                    {b.status === "confirmed" && Date.parse(b.starts_at) < Date.now() + 3_600_000 && (
                      <div className="row" style={{ gap: 4, marginTop: 6 }}>
                        <button className="btn sm" onClick={() => mark(b.id, "completed")} title="Customer came">✓</button>
                        <button className="btn sm" onClick={() => mark(b.id, "no_show")} title="No-show">✕</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        <p className="small muted">Bookings made by Vaani on WhatsApp land here automatically, with reminders the day before and two hours before. Mark visits as done to count them as won revenue.</p>
      </div>
    </>
  );
}
