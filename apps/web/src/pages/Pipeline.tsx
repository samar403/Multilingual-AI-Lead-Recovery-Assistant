import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, compactRupees, displayName, getToken, timeAgo, useApi, type Lead } from "../api";
import { Topbar, useShell } from "../components/Shell";
import { Icon, LangChip, TempChip, useToast } from "../components/ui";
import { statusLabel, useI18n } from "../i18n";

const COLUMNS = ["new", "contacted", "engaged", "qualified", "booked", "won", "lost"] as const;

export default function Pipeline() {
  const { t } = useI18n();
  const toast = useToast();
  const { onLive } = useShell();
  const { data, reload, setData } = useApi<Lead[]>("/leads?limit=500");
  const [over, setOver] = useState<string | null>(null);

  useEffect(() => onLive((type) => type === "lead" && void reload()), [onLive, reload]);

  const move = async (id: string, status: string) => {
    setData((prev) => prev?.map((l) => (l.id === id ? { ...l, status } : l)) ?? null);
    try {
      await api(`/leads/${id}`, { method: "PATCH", body: { status } });
    } catch (e) {
      toast((e as Error).message, "error");
      void reload();
    }
  };

  const leads = data ?? [];
  return (
    <>
      <Topbar title={t("pipeline")}>
        <a className="btn sm" href="/api/leads.csv" onClick={(e) => {
          // the CSV endpoint needs the bearer token, so fetch it rather than navigating
          e.preventDefault();
          void downloadCsv().catch((err) => toast((err as Error).message, "error"));
        }}>
          <Icon name="download" size={15} /> CSV
        </a>
      </Topbar>
      <div className="page">
        <div className="board">
          {COLUMNS.map((col) => {
            const items = leads.filter((l) => l.status === col);
            const value = items.reduce((s, l) => s + l.value_estimate, 0);
            return (
              <div
                key={col}
                className={`col ${over === col ? "drop" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(col);
                }}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => {
                  setOver(null);
                  const id = e.dataTransfer.getData("text/lead");
                  if (id) void move(id, col);
                }}
              >
                <h4>
                  <span>{statusLabel(t, col)} · {items.length}</span>
                  <span className="muted">{compactRupees(value)}</span>
                </h4>
                {items.map((l) => (
                  <Link
                    key={l.id}
                    to={`/app/inbox/${l.id}`}
                    className="lead-card"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/lead", l.id)}
                  >
                    <div className="spread">
                      <b>{displayName(l)}</b>
                      <span className="mono tiny muted">{l.score}</span>
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      <LangChip lang={l.language} />
                      <TempChip t={l.temperature} />
                    </div>
                    {l.summary && <div className="sum">{l.summary}</div>}
                    <div className="tiny muted">{l.source.replace("_", " ")} · {timeAgo(l.updated_at)}</div>
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

async function downloadCsv() {
  const token = getToken();
  const res = await fetch("/api/leads.csv", { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vaani-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
