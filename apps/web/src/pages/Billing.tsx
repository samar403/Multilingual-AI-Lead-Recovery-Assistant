import { api, rupeesPaise, timeAgo, useApi } from "../api";
import { Topbar } from "../components/Shell";
import { useToast } from "../components/ui";
import { useI18n } from "../i18n";

interface Plan {
  id: string;
  name: string;
  monthlyPaise: number;
  includedConversations: number;
  seats: number;
  features: string[];
}
interface BillingResp {
  invoice: {
    plan: Plan;
    cycle: { start: string; end: string };
    conversations: { used: number; included: number };
    lines: { kind: string; label: string; quantity: number; unit: string; unitPaise: number; amountPaise: number }[];
    subtotalPaise: number;
    gstPaise: number;
    totalPaise: number;
  };
  ledger: { id: string; label: string; quantity: number; amountPaise: number; created_at: string }[];
  plans: Plan[];
  rates: Record<string, { label: string; unit: string; paise: number }>;
  razorpay: boolean;
}

export default function Billing() {
  const { t } = useI18n();
  const toast = useToast();
  const { data, reload } = useApi<BillingResp>("/billing");
  if (!data) return <Topbar title={t("billing")} />;
  const inv = data.invoice;
  const usedPct = Math.min(100, (inv.conversations.used / inv.conversations.included) * 100);
  const month = new Date(inv.cycle.start).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

  const choose = async (plan: string) => {
    await api("/billing/plan", { body: { plan } });
    toast(`Plan switched to ${plan}`);
    void reload();
  };

  return (
    <>
      <Topbar title={t("billing")} />
      <div className="page">
        <div className="dash-grid">
          <div className="khata" aria-label={`Bill for ${month}`}>
            <div className="spine" />
            <div className="pagebody">
              <div className="shubh">
                ॥ शुभ लाभ ॥
                <small>STATEMENT · {month.toUpperCase()}</small>
              </div>
              <table style={{ marginTop: 14 }}>
                <thead>
                  <tr>
                    <th className="num">#</th>
                    <th>Item</th>
                    <th className="amt">Qty</th>
                    <th className="amt">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.lines.map((l, i) => (
                    <tr key={l.kind}>
                      <td className="num">{String(i + 1).padStart(2, "0")}</td>
                      <td>
                        {l.label}
                        {l.unitPaise > 0 && l.kind !== "plan" && <span style={{ color: "#7a5a3a", fontSize: 12 }}> @ {rupeesPaise(l.unitPaise)}/{l.unit}</span>}
                      </td>
                      <td className="amt">{l.quantity}</td>
                      <td className="amt">{rupeesPaise(l.amountPaise)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="num" />
                    <td>GST @ 18%</td>
                    <td />
                    <td className="amt">{rupeesPaise(inv.gstPaise)}</td>
                  </tr>
                  <tr className="total">
                    <td className="num" />
                    <td>Total so far</td>
                    <td />
                    <td className="amt">{rupeesPaise(inv.totalPaise)}</td>
                  </tr>
                </tbody>
              </table>
              <p style={{ fontSize: 12, color: "#7a5a3a", marginBottom: 0 }}>
                WhatsApp replies inside the 24-hour window are free. You pay for approved templates, SMS fallback and call-back minutes at cost-plus — never per lead.
              </p>
            </div>
          </div>

          <div className="stack" style={{ gap: 18 }}>
            <div className="card pad stack">
              <div className="spread">
                <h3>AI conversations</h3>
                <span className="mono">{inv.conversations.used} / {inv.conversations.included}</span>
              </div>
              <div className="meter"><i style={{ width: `${usedPct}%` }} /></div>
              <div className="small muted">A conversation = one customer Vaani talked to this month, however many messages it took. Extra conversations are ₹1.50 each.</div>
            </div>
            <div className="card pad">
              <h3>Ledger</h3>
              <div className="feed" style={{ marginTop: 6, maxHeight: 340, overflowY: "auto" }}>
                {data.ledger.map((e) => (
                  <div key={e.id} className="spread small" style={{ padding: "6px 0", borderBottom: "1px dashed var(--line)" }}>
                    <span>{e.label}</span>
                    <span className="row" style={{ gap: 12 }}>
                      <span className="tiny muted">{timeAgo(e.created_at)}</span>
                      <b className="mono">{rupeesPaise(e.amountPaise)}</b>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <h2 style={{ fontSize: 26, marginTop: 10 }}>Plans</h2>
        <div className="plan-cards">
          {data.plans.map((p) => (
            <div key={p.id} className={`card plan ${p.id === inv.plan.id ? "current" : ""}`}>
              <div className="spread">
                <h3>{p.name}</h3>
                {p.id === inv.plan.id && <span className="chip warm">Current</span>}
              </div>
              <div className="price">{rupeesPaise(p.monthlyPaise).replace(".00", "")}<span className="muted small">/month</span></div>
              <div className="small muted">{p.includedConversations.toLocaleString("en-IN")} AI conversations · {p.seats} seat{p.seats > 1 ? "s" : ""}</div>
              <ul>{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
              {p.id !== inv.plan.id && <button className="btn sm" style={{ marginTop: "auto" }} onClick={() => choose(p.id)}>Switch to {p.name}</button>}
            </div>
          ))}
        </div>
        <p className="small muted">Payments via Razorpay (UPI AutoPay, cards, netbanking) {data.razorpay ? "are enabled." : "activate once RAZORPAY_KEY_ID is configured on the server."}</p>
      </div>
    </>
  );
}
