import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, displayName, fmtDateTime, fmtDay, fmtTime, prettyPhone, rupees, timeAgo, useApi, type Followup, type Lead, type Message } from "../api";
import { Topbar, useShell } from "../components/Shell";
import { Empty, Icon, LangChip, LeadAvatar, Switch, TempChip, useToast } from "../components/ui";
import { STATUSES, statusLabel, useI18n } from "../i18n";

interface Detail {
  lead: Lead;
  messages: Message[];
  followups: Followup[];
  bookings: { id: string; starts_at: string; status: string; kind: string }[];
  calls: { id: string; direction: string; status: string; created_at: string }[];
  consents: { status: string; source: string; evidence: string; created_at: string }[];
  scoreReasons: string[];
  windowClosesAt: string | null;
}

type Filter = "all" | "attention" | "hot" | "booked";

export default function Inbox() {
  const { leadId } = useParams();
  const { t } = useI18n();
  const { onLive } = useShell();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const { data: leads, reload } = useApi<Lead[]>(`/leads?limit=300${q ? `&q=${encodeURIComponent(q)}` : ""}`, [q]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return onLive((type) => {
      if (type === "message" || type === "lead") {
        clearTimeout(timer);
        timer = setTimeout(() => void reload(), 350);
      }
    });
  }, [onLive, reload]);

  const shown = useMemo(() => {
    const list = (leads ?? []).filter((l) => {
      if (filter === "attention") return l.ai_paused && !["lost", "won", "opted_out"].includes(l.status);
      if (filter === "hot") return l.temperature === "hot";
      if (filter === "booked") return l.status === "booked" || l.status === "won";
      return true;
    });
    return list.sort((a, b) => (b.lastMessage?.created_at ?? b.updated_at).localeCompare(a.lastMessage?.created_at ?? a.updated_at));
  }, [leads, filter]);

  const attentionCount = (leads ?? []).filter((l) => l.ai_paused && !["lost", "won", "opted_out"].includes(l.status)).length;

  return (
    <>
      <Topbar title={t("inbox")} />
      <div className={`inbox ${leadId ? "has-lead" : ""}`}>
        <div className="list">
          <div className="filters">
            <input className="input" placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search conversations" />
            <div className="seg" role="group">
              {(["all", "attention", "hot", "booked"] as Filter[]).map((f) => (
                <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {f === "all" ? t("all") : f === "attention" ? `🙋 ${attentionCount}` : f === "hot" ? "🔥" : "✅"}
                </button>
              ))}
            </div>
          </div>
          {shown.map((l) => (
            <Link key={l.id} to={`/app/inbox/${l.id}`} className={`thread-item ${l.id === leadId ? "active" : ""}`}>
              <LeadAvatar lead={l} />
              <div style={{ minWidth: 0 }}>
                <div className="spread">
                  <span className="name">{displayName(l)}</span>
                  <span className="tiny muted mono">{timeAgo(l.lastMessage?.created_at ?? l.updated_at)}</span>
                </div>
                <div className="preview">
                  {l.lastMessage?.author === "ai" ? "✦ " : l.lastMessage?.author === "agent" ? "You: " : ""}
                  {l.lastMessage?.body ?? l.summary}
                </div>
                <div className="row" style={{ gap: 6, marginTop: 4 }}>
                  <span className="chip outline tiny">{statusLabel(t, l.status)}</span>
                  {l.ai_paused ? <span className="chip hot tiny">🙋</span> : null}
                </div>
              </div>
            </Link>
          ))}
          {leads && !shown.length && <Empty glyph="🌿" title="Nothing here" />}
        </div>
        {leadId ? <Conversation key={leadId} leadId={leadId} onChanged={reload} /> : <div className="convo"><Empty glyph="💬" title={t("noLead")}>Missed calls and enquiries appear here the moment Vaani replies.</Empty></div>}
      </div>
    </>
  );
}

function Conversation({ leadId, onChanged }: { leadId: string; onChanged: () => void }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const toast = useToast();
  const { onLive, me } = useShell();
  const { data, reload } = useApi<Detail>(`/leads/${leadId}`, [leadId]);
  const [lens, setLens] = useState(() => localStorage.getItem("vaani.lens") !== "off");
  const [text, setText] = useState("");
  const [asCustomer, setAsCustomer] = useState(false);
  const [note, setNote] = useState(false);
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return onLive((type, d) => {
      const x = d as { lead_id?: string; id?: string };
      if ((type === "message" && x.lead_id === leadId) || (type === "lead" && x.id === leadId) || type === "followup" || type === "booking") {
        clearTimeout(timer);
        timer = setTimeout(() => void reload(), 250);
      }
    });
  }, [onLive, reload, leadId]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [data?.messages.length]);

  useEffect(() => {
    try {
      localStorage.setItem("vaani.lens", lens ? "on" : "off");
    } catch {
      /* ignore */
    }
  }, [lens]);

  if (!data) return <div className="convo" />;
  const { lead, messages } = data;
  const windowOpen = data.windowClosesAt ? Date.parse(data.windowClosesAt) > Date.now() : false;
  const hoursLeft = data.windowClosesAt ? Math.max(0, (Date.parse(data.windowClosesAt) - Date.now()) / 3_600_000) : 0;

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      if (asCustomer) await api("/simulate/inbound", { body: { phone: lead.phone, text } });
      else await api(`/leads/${lead.id}/messages`, { body: { text, note } });
      setText("");
      await reload();
      onChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSending(false);
    }
  };

  const patch = async (body: Record<string, unknown>, msg?: string) => {
    try {
      await api(`/leads/${lead.id}`, { method: "PATCH", body });
      if (msg) toast(msg);
      await reload();
      onChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const draft = async () => {
    try {
      const out = await api<{ reply: string }>(`/leads/${lead.id}/suggest`, { body: {} });
      setText(out.reply);
      setAsCustomer(false);
      setNote(false);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const sendTemplate = async (template: string) => {
    try {
      await api(`/leads/${lead.id}/messages`, { body: { template } });
      toast("Approved template sent");
      await reload();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const call = async () => {
    try {
      await api(`/leads/${lead.id}/call`, { body: {} });
      toast(`📞 Ringing you first, then ${displayName(lead)}`);
      await reload();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  let lastDay = "";
  return (
    <>
      <section className={`convo ${lens ? "lens-on" : ""}`} aria-label="Conversation">
        <div className="head">
          <button className="btn ghost icon sm" style={{ display: "var(--show-back, none)" }} onClick={() => nav("/app/inbox")} aria-label="Back">
            <Icon name="back" />
          </button>
          <LeadAvatar lead={lead} />
          <div className="grow who">
            <div className="row" style={{ gap: 8, minWidth: 0 }}>
              <b style={{ fontSize: 16 }}>{displayName(lead)}</b>
              <LangChip lang={lead.language} script={lead.script} />
              <span className="hide-sm"><TempChip t={lead.temperature} /></span>
            </div>
            <div className="tiny muted mono">
              {prettyPhone(lead.phone)} · via {lead.source.replace("_", " ")} · {statusLabel(t, lead.status)}
            </div>
          </div>
          <label className="row small" style={{ gap: 6 }} title="Show English translation under every message">
            <span className="hide-sm" aria-hidden="true">🔍</span>
            <Switch checked={lens} onChange={setLens} label={t("lens")} />
          </label>
          <button className="btn sm" onClick={call} disabled={lead.status === "opted_out"}>
            <Icon name="phone" size={15} /> <span className="hide-sm">{t("call")}</span>
          </button>
        </div>

        <div className="scroll" ref={scroller}>
          {messages.map((m) => {
            const day = fmtDay(m.created_at);
            const sep = day !== lastDay ? <div className="day-sep" key={`d${m.id}`}>{day}</div> : null;
            lastDay = day;
            const cls =
              m.channel === "note" ? "note" : m.author === "system" && m.channel === "voice" ? "system" : m.direction === "in" ? "in" : `out ${m.author}`;
            return (
              <FragmentBubble key={m.id} sep={sep} cls={cls} m={m} />
            );
          })}
          {!messages.length && <Empty glyph="🫙" title="No messages yet" />}
        </div>

        <div className="composer">
          {lead.status === "opted_out" ? (
            <div className="window-banner closed">🚫 This customer opted out. Messaging is blocked until they write START.</div>
          ) : windowOpen ? (
            <div className="window-banner">
              🟢 WhatsApp window open · free-form replies allowed for <b className="mono">{hoursLeft.toFixed(1)}h</b>
            </div>
          ) : (
            <div className="window-banner closed">
              🔒 24-hour window closed — only Meta-approved templates can be sent.
              <button className="btn sm" onClick={() => sendTemplate("wa_followup")}>Send follow-up template</button>
            </div>
          )}
          <div className="takeover">
            <span style={{ fontSize: 18 }}>{lead.ai_paused ? "🧑" : "✦"}</span>
            <span className="grow">{lead.ai_paused ? t("youReplying") : t("aiReplying")}</span>
            <button className="btn sm" onClick={() => patch({ ai_paused: !lead.ai_paused }, lead.ai_paused ? "Vaani AI is back on" : "You're in control")}>
              {lead.ai_paused ? t("handBack") : t("takeOver")}
            </button>
          </div>
          <div className="box">
            <textarea
              className="textarea"
              placeholder={asCustomer ? "Type as the customer (any language) — Vaani will answer…" : note ? "Private note for your team…" : t("typeReply")}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              aria-label="Message"
            />
            <button className="btn primary" onClick={send} disabled={sending || !text.trim()}>
              <Icon name="send" size={16} /> {t("send")}
            </button>
          </div>
          <div className="row wrap small" style={{ gap: 14 }}>
            <button className="btn ghost sm" onClick={draft}>
              <Icon name="spark" size={14} /> {t("suggest")}
            </button>
            <label className="row" style={{ gap: 6 }}>
              <Switch checked={note} onChange={(v) => { setNote(v); if (v) setAsCustomer(false); }} label="Private note" /> Note
            </label>
            <label className="row" style={{ gap: 6 }} title="Test the AI: your message is treated as if the customer sent it on WhatsApp">
              <Switch checked={asCustomer} onChange={(v) => { setAsCustomer(v); if (v) setNote(false); }} label="Play the customer" /> 🎭 Play the customer
            </label>
          </div>
        </div>
      </section>
      <Dossier detail={data} onPatch={patch} reload={reload} me={me} />
    </>
  );
}

function FragmentBubble({ sep, cls, m }: { sep: ReactNode; cls: string; m: Message }) {
  const engine = typeof m.meta.engine === "string" ? m.meta.engine : null;
  return (
    <>
      {sep}
      <div className={`bubble ${cls}`}>
        <div className="text" lang={m.language || undefined}>{m.body}</div>
        {m.gloss && cls !== "system" && <div className="gloss" lang="en">{m.gloss}</div>}
        {cls !== "system" && (
          <div className="meta">
            {m.template && <span className="tpl">{m.template}</span>}
            {m.channel !== "whatsapp" && m.channel !== "note" && <span>{m.channel}</span>}
            {m.author === "ai" && <span title={engine === "claude" ? "Written by Claude" : "Playbook reply"}>✦ {engine === "claude" ? "Claude" : "Vaani"}</span>}
            {m.author === "agent" && typeof m.meta.by === "string" && <span>{m.meta.by}</span>}
            <span>{fmtTime(m.created_at)}</span>
            {m.direction === "out" && m.channel !== "note" && <span>{m.status === "read" ? "✓✓" : m.status === "failed" ? "⚠" : m.status === "delivered" ? "✓✓" : "✓"}</span>}
          </div>
        )}
      </div>
    </>
  );
}

function Dossier({ detail, onPatch, reload, me }: { detail: Detail; onPatch: (b: Record<string, unknown>, msg?: string) => Promise<void>; reload: () => void; me: ReturnType<typeof useShell>["me"] }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const { lead } = detail;
  const [notes, setNotes] = useState(lead.notes);
  const [when, setWhen] = useState("");
  const active = detail.bookings.find((b) => b.status === "confirmed" && Date.parse(b.starts_at) > Date.now());

  const book = async () => {
    if (!when) return;
    try {
      await api(`/leads/${lead.id}/book`, { body: { startsAt: new Date(when).toISOString() } });
      toast("Booked — reminders scheduled");
      setWhen("");
      reload();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const runNow = async (id: string) => {
    await api(`/followups/${id}/run`, { body: {} }).catch((e) => toast((e as Error).message, "error"));
    reload();
  };

  return (
    <aside className="dossier" aria-label="Lead details">
      <div>
        <div className="spread">
          <span className="eyebrow">{t("score")}</span>
          <b className="mono">{lead.score}/100</b>
        </div>
        <div className="scorebar" style={{ margin: "8px 0" }}>
          <i style={{ width: `${lead.score}%` }} />
        </div>
        <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
          {detail.scoreReasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>

      <div>
        <span className="eyebrow">{t("qualification")}</span>
        <div className="slotlist" style={{ marginTop: 8 }}>
          {me.playbook.slots.map((s) => {
            const v = lead.slots[s.key];
            return (
              <div key={s.key} className={`slot ${v ? "" : "missing"}`}>
                <span className="k">{s.label[lang] ?? s.label.en}{s.required ? " *" : ""}</span>
                <span className="v">{v ? (s.type === "slot" ? fmtDateTime(v) : v) : "—"}</span>
              </div>
            );
          })}
        </div>
        {lead.summary && <p className="small" style={{ marginBottom: 0 }}>📝 {lead.summary}</p>}
        <div className="small muted" style={{ marginTop: 6 }}>Est. value {rupees(lead.value_estimate)}</div>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">Stage</span>
        <select className="select" value={lead.status} onChange={(e) => onPatch({ status: e.target.value }, "Stage updated")} disabled={lead.status === "opted_out"}>
          {STATUSES.filter((s) => s !== "opted_out" || lead.status === "opted_out").map((s) => (
            <option key={s} value={s}>
              {statusLabel(t, s)}
            </option>
          ))}
        </select>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">{me.tenant.settings.bookingKind}</span>
        {active ? (
          <div className="appt">✅ {fmtDateTime(active.starts_at)}</div>
        ) : (
          <div className="row">
            <input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Booking time" />
            <button className="btn sm" onClick={book} disabled={!when}>
              {t("book")}
            </button>
          </div>
        )}
      </div>

      <div>
        <span className="eyebrow">{t("cadence")}</span>
        <div className="timeline" style={{ marginTop: 10 }}>
          {detail.followups.length === 0 && <div className="small muted" style={{ paddingLeft: 16 }}>Nothing scheduled.</div>}
          {detail.followups.slice(-8).map((f) => (
            <div key={f.id} className={`t-item ${f.status}`}>
              <div className="spread">
                <b style={{ textTransform: "capitalize" }}>{f.kind === "callback" ? "📞 Call-back" : f.kind === "reminder" ? "⏰ Reminder" : f.kind === "final" ? "🙏 Polite close" : `💬 Nudge ${f.step}`}</b>
                {f.status === "pending" ? (
                  <button className="btn ghost sm" onClick={() => runNow(f.id)} title="Run this follow-up now">
                    ▶
                  </button>
                ) : (
                  <span className="tiny muted">{f.status}</span>
                )}
              </div>
              <div className="tiny muted">
                {f.status === "pending" ? timeAgo(f.due_at) : timeAgo(f.executed_at ?? f.due_at)} · {f.reason}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <span className="eyebrow">{t("notes")}</span>
        <textarea className="textarea" style={{ marginTop: 8 }} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== lead.notes && onPatch({ notes }, "Notes saved")} placeholder="Only your team sees this" />
      </div>

      <div>
        <span className="eyebrow">{t("consent")}</span>
        <div className="stack" style={{ gap: 6, marginTop: 8 }}>
          {detail.consents.map((c, i) => (
            <div key={i} className="small">
              <span className={`chip ${c.status === "revoked" ? "hot" : c.status === "explicit" ? "ok" : "cold"}`}>{c.status.replace("_", " ")}</span>{" "}
              <span className="muted tiny">{c.source} · {timeAgo(c.created_at)}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
