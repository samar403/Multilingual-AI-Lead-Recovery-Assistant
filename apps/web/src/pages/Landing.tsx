import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, getToken, rupees, setToken, type Lang } from "../api";
import { Logo, useToast } from "../components/ui";
import { ThemeToggle } from "../components/Shell";
import { LANG_LABEL } from "../i18n";

type Vertical = "coaching" | "real_estate" | "salon" | "services";

const VERTICALS: { id: Vertical; emoji: string; title: string; who: string; quote: string; gloss: string }[] = [
  { id: "coaching", emoji: "🎓", title: "Coaching institutes", who: "JEE, NEET, foundation, spoken English", quote: "મારા દીકરા માટે NEET બેચ છે? ધોરણ 11 માં છે.", gloss: "Is there a NEET batch for my son? He's in Std 11." },
  { id: "real_estate", emoji: "🏠", title: "Property agents", who: "Buy, rent and site visits", quote: "2 BHK chahiye Bopal mein, budget 55 lakh tak", gloss: "Need a 2 BHK in Bopal, budget up to 55 lakh." },
  { id: "salon", emoji: "💇‍♀️", title: "Salons & spas", who: "Appointments, bridal, packages", quote: "kale saanje 6 vaagye haircut mate aavi shaku?", gloss: "Can I come for a haircut tomorrow at 6pm?" },
  { id: "services", emoji: "🛠️", title: "Service businesses", who: "AC, RO, pest control, repairs", quote: "AC से पानी टपक रहा है, आज कोई आ सकता है?", gloss: "Water is dripping from the AC — can someone come today?" },
];

const SUGGESTIONS: Record<Vertical, Record<Lang, string[]>> = {
  coaching: {
    gu: ["JEE માટે કોચિંગ જોઈએ છે", "ધોરણ 11 માં છે", "ફી કેટલી છે?", "કાલે સાંજે 5 વાગ્યે"],
    hi: ["NEET ke liye coaching chahiye", "beta 12th mein hai", "kitna fees hai?", "parso subah 11 baje"],
    en: ["Looking for spoken English classes", "I'm in class 12", "What are the fees?", "Saturday 11am works"],
  },
  real_estate: {
    gu: ["2 BHK ખરીદવું છે", "બોપલ માં", "બજેટ 55 લાખ", "રવિવારે સવારે"],
    hi: ["3 BHK chahiye kiraye par", "Satellite mein", "budget 25 hazaar", "kal shaam 5 baje"],
    en: ["Want to buy a 3 BHK", "Prahlad Nagar", "Budget around 1.2 Cr", "Sunday 11am site visit"],
  },
  salon: {
    gu: ["હેર સ્પા કરાવવું છે", "ભાવ શું છે?", "કાલે સાંજે 6 વાગ્યે"],
    hi: ["bridal makeup ke liye", "kitna charge hai?", "shanivar dopahar 2 baje"],
    en: ["Haircut and facial", "How much?", "Tomorrow 6pm"],
  },
  services: {
    gu: ["AC સર્વિસ કરાવવી છે", "અલકાપુરી માં", "આજે સાંજે"],
    hi: ["पेस्ट कंट्रोल करवाना है", "गोत्री में", "कल सुबह 10 बजे"],
    en: ["RO purifier not working", "Akota", "Tomorrow morning"],
  },
};

export function Landing() {
  const nav = useNavigate();
  const toast = useToast();
  const loggedIn = Boolean(getToken());

  const openDemo = async () => {
    try {
      const { token } = await api<{ token: string }>("/auth/login", { body: { email: "demo@vaani.app", password: "vaani-demo" } });
      setToken(token);
      nav("/app");
    } catch {
      toast("Demo desk isn't seeded on this server — create your own account instead", "error");
      nav("/signup");
    }
  };

  return (
    <div className="land">
      <header className="land-nav">
        <Link to="/" className="brand" style={{ padding: 0 }}>
          <Logo />
          <span className="word">Vaani</span>
          <span className="script">વાણી</span>
        </Link>
        <nav aria-label="Sections">
          <a href="#how">How it works</a>
          <a href="#try">Try it</a>
          <a href="#trust">Compliance</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="grow" />
        <ThemeToggle />
        {loggedIn ? (
          <Link className="btn primary" to="/app">Open my desk →</Link>
        ) : (
          <>
            <Link className="btn ghost hide-sm" to="/login">Sign in</Link>
            <Link className="btn primary" to="/signup">Start free</Link>
          </>
        )}
      </header>

      <section className="section hero">
        <div>
          <div className="eyebrow">For coaching institutes · property agents · salons · service businesses</div>
          <h1 style={{ marginTop: 16 }}>
            Every missed call, <em>answered</em> — in their language.
          </h1>
          <div className="scripts" aria-label="Gujarati, Hindi and English">
            <span className="gu" lang="gu">કેમ છો?</span>
            <span className="hi" lang="hi">नमस्ते!</span>
            <span className="en">Hello!</span>
          </div>
          <p className="lede">
            When you can't pick up, Vaani messages the caller on WhatsApp within seconds — in Gujarati, Hindi or English, exactly the way they write — learns what they need, and books the demo class, site visit or appointment. You just show up.
          </p>
          <div className="row wrap" style={{ marginTop: 22 }}>
            <a className="btn marigold lg" href="#try">Talk to it now ↓</a>
            <button className="btn lg" onClick={openDemo}>Open the demo desk</button>
          </div>
          <div className="proof">
            <div><b>&lt; 10s</b><span>missed call → WhatsApp reply</span></div>
            <div><b>3 + 2</b><span>languages + Hinglish & Gujlish</span></div>
            <div><b>₹0</b><span>per lead — flat fee + usage</span></div>
          </div>
        </div>
        <HeroPhone />
      </section>

      <div className="toran" />

      <section className="section">
        <LeakMeter />
      </section>

      <section className="section" id="how">
        <div className="eyebrow">How it works</div>
        <h2 style={{ fontSize: "clamp(30px,4vw,48px)", margin: "10px 0 26px", maxWidth: 760 }}>From a missed ring to a booked visit, without you lifting the phone.</h2>
        <div className="steps">
          <div className="card step"><span className="glyph">📵</span><h3>Catch</h3><p>Missed calls (Exotel, Twilio), WhatsApp messages, website forms, IndiaMART & JustDial leads — all land in one inbox.</p></div>
          <div className="card step"><span className="glyph">⚡</span><h3>Answer</h3><p>A Meta-approved WhatsApp template goes out in seconds. No WhatsApp? A DLT-registered SMS instead.</p></div>
          <div className="card step"><span className="glyph">🧭</span><h3>Qualify</h3><p>Claude chats in the customer's own language and script, asking one question at a time: course & class, BHK & budget, service & slot.</p></div>
          <div className="card step"><span className="glyph">📅</span><h3>Book & nudge</h3><p>Offers real slots from your hours, confirms the booking, sends reminders, and follows up politely — never during quiet hours.</p></div>
        </div>
      </section>

      <section className="section" id="try">
        <div className="spread wrap" style={{ marginBottom: 20 }}>
          <div>
            <div className="eyebrow">Live playground</div>
            <h2 style={{ fontSize: "clamp(30px,4vw,48px)", marginTop: 10 }}>Be the customer. Watch it think.</h2>
          </div>
          <p className="muted" style={{ maxWidth: 420, margin: 0 }}>Type in any language — even Gujarati in English letters. The X-ray on the right shows what Vaani understood, how hot the lead is, and when it books.</p>
        </div>
        <Playground />
      </section>

      <section className="section">
        <div className="eyebrow">Why now</div>
        <h2 style={{ fontSize: "clamp(30px,4vw,48px)", margin: "10px 0 26px", maxWidth: 820 }}>India's small businesses run on phone calls they can't always answer.</h2>
        <div className="why">
          <div className="card"><h3>WhatsApp is the inbox</h3><p>Hundreds of millions of Indians already live on WhatsApp. A reply there gets read; a call-back from an unknown number often doesn't.</p></div>
          <div className="card"><h3>AI finally speaks Gujarati</h3><p>Today's models handle Gujarati, Hindi and the way people really type them — "kitna fees hai", "kale aavi shaku?" — well enough to run a front desk.</p></div>
          <div className="card"><h3>The rails are open</h3><p>WhatsApp's Cloud API, per-message pricing and Indian telephony APIs (Exotel, DLT SMS) make it cheap for a 3-person institute to get enterprise-grade response times.</p></div>
        </div>
      </section>

      <section className="section">
        <div className="eyebrow">Built for</div>
        <div className="verticals" style={{ marginTop: 18 }}>
          {VERTICALS.map((v) => (
            <div key={v.id} className="card vert">
              <span className="em">{v.emoji}</span>
              <h3>{v.title}</h3>
              <div className="small muted">{v.who}</div>
              <blockquote>
                {v.quote}
                <div className="tiny muted" style={{ fontStyle: "italic", marginTop: 4 }}>{v.gloss}</div>
              </blockquote>
            </div>
          ))}
        </div>
      </section>

      <section className="section" id="trust">
        <div className="eyebrow">Approved channels, compliant by design</div>
        <h2 style={{ fontSize: "clamp(30px,4vw,48px)", margin: "10px 0 26px", maxWidth: 760 }}>Your number's reputation is your business. We protect it.</h2>
        <div className="compliance">
          <div className="card"><h3>🛑 STOP in any language</h3><p className="small">“STOP”, “बंद करो”, “બંધ કરો” unsubscribe instantly. Every opt-in and opt-out is kept in a consent trail (DPDP Act 2023).</p></div>
          <div className="card"><h3>🪟 24-hour window</h3><p className="small">Free-form replies only inside WhatsApp's customer-service window; outside it, only Meta-approved templates.</p></div>
          <div className="card"><h3>🌙 Quiet hours</h3><p className="small">No automated nudges or calls between 9pm and 9am — they wait for the morning. SMS goes only through DLT templates.</p></div>
          <div className="card"><h3>🧑‍💼 Human in the loop</h3><p className="small">Complaints, “call me” and anything outside your price note go straight to you, with the AI paused on that chat.</p></div>
        </div>
      </section>

      <section className="section" id="pricing">
        <div className="eyebrow">Pricing</div>
        <h2 style={{ fontSize: "clamp(30px,4vw,48px)", margin: "10px 0 8px" }}>A flat monthly fee. Messages at cost-plus.</h2>
        <p className="muted" style={{ marginTop: 0 }}>No per-lead charges, no commission on bookings. Prices exclude 18% GST.</p>
        <Pricing />
      </section>

      <section className="section faq" id="faq">
        <h2 style={{ fontSize: "clamp(30px,4vw,44px)", marginBottom: 10 }}>Questions owners ask</h2>
        {[
          ["Do I need a new phone number?", "No. Keep your number and forward unanswered calls to an Exotel or Twilio virtual number (a one-time setting with your telecom operator) — or put the virtual number on your ads. WhatsApp runs on a WhatsApp Business API number you own."],
          ["What if the customer writes Gujarati in English letters?", "That's the default for many customers. Vaani detects romanised Gujarati and Hindi (\"kem cho\", \"kitna fees hai\") and replies the same way, so it never feels like a robot."],
          ["Will it make promises I can't keep?", "No. It only quotes the price note you write, only offers slots inside your hours, and hands over to you for anything else — refunds, complaints, special deals."],
          ["What does a month really cost?", "Your plan, plus WhatsApp templates (~₹0.20 utility, ~₹1.10 follow-up), SMS fallback (~₹0.30) and call-back minutes (~₹0.90). Replies inside the 24-hour window are free. Your bill is itemised like a bahi-khata."],
          ["Can my staff use it?", "Yes — a shared inbox with take-over, private notes, AI-drafted replies and a Gujarati/Hindi/English interface."],
        ].map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </section>

      <section className="section">
        <div className="cta-band">
          <div className="bandhani" style={{ position: "absolute", inset: 0, opacity: 0.12 }} />
          <h2 style={{ position: "relative" }}>Stop paying for ads that ring when no one can answer.</h2>
          <div className="row wrap" style={{ position: "relative" }}>
            <Link className="btn marigold lg" to="/signup">Start free</Link>
            <button className="btn lg" onClick={openDemo}>See the demo desk</button>
          </div>
        </div>
      </section>

      <footer className="footer">
        <span>© {new Date().getFullYear()} Vaani · Made in Gujarat for Bharat</span>
        <span>WhatsApp Cloud API · Exotel · Twilio · MSG91 · Claude by Anthropic</span>
      </footer>
    </div>
  );
}

// ------------------------------------------------------------------ hero phone (animated story)

const STORY: { who: "c" | "a" | "sys"; text: string; t: string }[] = [
  { who: "sys", text: "📵 Missed call · 11:02", t: "" },
  { who: "a", text: "નમસ્તે! 🙏 Shiksha Academy માં તમારો કૉલ મિસ થઈ ગયો, માફ કરશો. કહો, અમે તમારી શું મદદ કરી શકીએ?", t: "11:02" },
  { who: "c", text: "dikra mate JEE coaching joie che, 11 ma che", t: "11:04" },
  { who: "a", text: "Saras! Shu hu tamaru free demo class book kari dau? Sat 10:30 AM ke Sat 6:00 PM — kayu faavse?", t: "11:04" },
  { who: "c", text: "saanje 6 chalse 👍", t: "11:05" },
  { who: "a", text: "Thai gayu ✅ Sat 6:00 PM mate book che. 📍 Satellite, Ahmedabad. Pehla reminder mokalishu.", t: "11:05" },
];

function HeroPhone() {
  const [n, setN] = useState(1);
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (n >= STORY.length) {
      const id = setTimeout(() => setN(1), 4200);
      return () => clearTimeout(id);
    }
    const next = STORY[n]!;
    setTyping(next.who === "a");
    const id = setTimeout(() => {
      setTyping(false);
      setN((x) => x + 1);
    }, next.who === "a" ? 1500 : 1900);
    return () => clearTimeout(id);
  }, [n]);
  return (
    <div className="phone" aria-label="Example WhatsApp conversation">
      <div className="screen">
        <div className="wa-head">
          <div className="av">S</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Shiksha Academy</div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>{typing ? "typing…" : "Vaani assistant · online"}</div>
          </div>
        </div>
        <div className="wa-body">
          {STORY.slice(0, n).map((m, i) => (
            <div key={i} className={`m ${m.who}`}>
              {m.text}
              {m.t && <small>{m.t} {m.who === "a" ? "✓✓" : ""}</small>}
            </div>
          ))}
          {typing && (
            <div className="m a" style={{ width: 54 }}>
              <span className="typing"><i /><i /><i /></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ leak meter

function LeakMeter() {
  const [calls, setCalls] = useState(8);
  const [conv, setConv] = useState(20);
  const [ticket, setTicket] = useState(25000);
  const lost = calls * 26 * (conv / 100) * ticket;
  const recovered = lost * 0.35;
  const drips = useMemo(() => Array.from({ length: 9 }, (_, i) => ({ left: 8 + i * 10.5, delay: (i * 0.37) % 1.6 })), []);
  return (
    <div className="leak">
      <div>
        <div className="eyebrow">The leak</div>
        <h2 style={{ fontSize: "clamp(30px,4vw,48px)", margin: "10px 0 20px" }}>How much walks away when the phone rings out?</h2>
        <div className="slider">
          <label className="spread small"><b>Missed calls & unanswered enquiries per day</b><span className="mono">{calls}</span></label>
          <input type="range" min={1} max={40} value={calls} onChange={(e) => setCalls(Number(e.target.value))} />
        </div>
        <div className="slider">
          <label className="spread small"><b>Share of those who would have bought</b><span className="mono">{conv}%</span></label>
          <input type="range" min={5} max={60} value={conv} onChange={(e) => setConv(Number(e.target.value))} />
        </div>
        <div className="slider">
          <label className="spread small"><b>Average ticket (fees, commission, bill)</b><span className="mono">{rupees(ticket)}</span></label>
          <input type="range" min={500} max={150000} step={500} value={ticket} onChange={(e) => setTicket(Number(e.target.value))} />
        </div>
        <p className="tiny muted">Assumes 26 working days. Recovery shown at a conservative 35% of lost buyers — your own number shows up live on the dashboard.</p>
      </div>
      <div className="bucket" aria-live="polite">
        {drips.map((d, i) => (
          <span key={i} className="drip" style={{ left: `${d.left}%`, top: 0, animationDelay: `${d.delay}s` }} />
        ))}
        <div className="eyebrow" style={{ color: "rgba(245,239,227,.6)" }}>Leaking every month</div>
        <div className="big">{rupees(lost)}</div>
        <div className="divider" style={{ background: "rgba(245,239,227,.15)", margin: "22px 0" }} />
        <div className="eyebrow" style={{ color: "rgba(245,239,227,.6)" }}>Vaani could bring back</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 600 }}>{rupees(recovered)}</div>
        <div className="small" style={{ opacity: 0.7, marginTop: 6 }}>≈ {Math.max(1, Math.round(recovered / 3999))}× the Growth plan</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ playground

interface ChatOut {
  reply: string;
  replyGloss: string;
  inboundGloss: string;
  language: Lang;
  script: "native" | "latin";
  intent: string;
  learned: Record<string, string>;
  slots: Record<string, string>;
  summary: string;
  handoff: boolean;
  booking: string | null;
  offeredSlots: string[];
  score: { score: number; temperature: string; reasons: string[] };
  engine: string;
  latencyMs: number;
}

interface PMsg {
  who: "c" | "a";
  text: string;
  gloss?: string;
}

function Playground() {
  const [vertical, setVertical] = useState<Vertical>("coaching");
  const [lang, setLang] = useState<Lang>("gu");
  const [msgs, setMsgs] = useState<PMsg[]>([]);
  const [slotDefs, setSlotDefs] = useState<{ key: string; label: Record<Lang, string>; required: boolean }[]>([]);
  const [state, setState] = useState<{ slots: Record<string, string>; language: Lang; script: "native" | "latin"; offered: string[]; intents: string[]; booking: string | null }>({ slots: {}, language: "gu", script: "native", offered: [], intents: [], booking: null });
  const [last, setLast] = useState<ChatOut | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ opening: string; openingGloss: string; slots: typeof slotDefs }>("/playground/start", { body: { vertical, language: lang } })
      .then((r) => {
        if (cancelled) return;
        setMsgs([{ who: "a", text: r.opening, gloss: r.openingGloss }]);
        setSlotDefs(r.slots);
        setState({ slots: {}, language: lang, script: "native", offered: [], intents: [], booking: null });
        setLast(null);
        setError(null);
      })
      .catch((e) => setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [vertical, lang]);

  useEffect(() => {
    body.current?.scrollTo({ top: body.current.scrollHeight, behavior: "smooth" });
  }, [msgs.length, busy]);

  const send = async (message: string) => {
    if (!message.trim() || busy) return;
    const history = msgs.map((m) => ({ author: m.who === "c" ? ("customer" as const) : ("ai" as const), body: m.text }));
    setMsgs((m) => [...m, { who: "c", text: message }]);
    setText("");
    setBusy(true);
    try {
      const out = await api<ChatOut>("/playground/chat", {
        body: { vertical, message, history, slots: state.slots, language: state.language, script: state.script, offeredSlots: state.offered, intents: state.intents, booking: state.booking },
      });
      setMsgs((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { ...copy[copy.length - 1]!, gloss: out.inboundGloss };
        return [...copy, { who: "a", text: out.reply, gloss: out.replyGloss }];
      });
      setState({ slots: out.slots, language: out.language, script: out.script, offered: out.offeredSlots, intents: [...state.intents, out.intent], booking: out.booking });
      setLast(out);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const tempColor = last?.score.temperature === "hot" ? "var(--kumkum)" : last?.score.temperature === "warm" ? "var(--marigold)" : "#9aa";

  return (
    <div className="play">
      <div className="chat">
        <div className="row wrap" style={{ padding: 10, gap: 8, background: "var(--paper)", borderBottom: "1px solid var(--line)" }}>
          <select className="select" style={{ width: "auto", height: 36 }} value={vertical} onChange={(e) => setVertical(e.target.value as Vertical)} aria-label="Business type">
            {VERTICALS.map((v) => (
              <option key={v.id} value={v.id}>{v.emoji} {v.title}</option>
            ))}
          </select>
          <div className="seg" role="group" aria-label="Opening language">
            {(["gu", "hi", "en"] as const).map((l) => (
              <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)} lang={l}>{LANG_LABEL[l].native}</button>
            ))}
          </div>
        </div>
        <div className="wa-body" ref={body} aria-live="polite">
          {msgs.map((m, i) => (
            <div key={i} className={`m ${m.who}`}>
              {m.text}
              {m.gloss && <span className="g">{m.gloss}</span>}
            </div>
          ))}
          {busy && <div className="m a" style={{ width: 54 }}><span className="typing"><i /><i /><i /></span></div>}
          {error && <div className="small" style={{ color: "var(--kumkum)" }}>⚠ {error}</div>}
        </div>
        <div className="suggest">
          {SUGGESTIONS[vertical][lang].map((s) => (
            <button key={s} onClick={() => send(s)} disabled={busy}>{s}</button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void send(text); }}>
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type like a customer would — any language…" aria-label="Your message" maxLength={500} />
          <button className="btn primary" disabled={busy || !text.trim()}>Send</button>
        </form>
      </div>

      <div className="xray">
        <div className="spread">
          <span className="eyebrow">X-ray · what Vaani understood</span>
          {last && <span className="mono tiny" style={{ opacity: 0.6 }}>{last.engine} · {last.latencyMs}ms</span>}
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <span className={`chip ${state.language}`}>{LANG_LABEL[state.language].native}{state.script === "latin" && state.language !== "en" ? " · typed in English letters" : ""}</span>
          {last && <span className="chip outline" style={{ color: "var(--paper)" }}>intent: {last.intent.replace("_", " ")}</span>}
          {last?.handoff && <span className="chip hot">→ handed to owner</span>}
        </div>
        <div>
          <div className="spread small" style={{ marginBottom: 6 }}>
            <b>Lead score</b>
            <span className="mono">{last?.score.score ?? 0}/100 · <span style={{ color: tempColor }}>{last?.score.temperature ?? "cold"}</span></span>
          </div>
          <div className="scorebar" style={{ background: "rgba(255,255,255,.1)" }}><i style={{ width: `${last?.score.score ?? 0}%` }} /></div>
        </div>
        <div className="slotlist">
          {slotDefs.map((s) => {
            const v = state.slots[s.key];
            const fresh = last?.learned[s.key];
            return (
              <div key={s.key + (fresh ?? "")} className={`slot ${v ? "filled" : "missing"}`}>
                <span className="k">{s.label.en}{s.required ? " *" : ""}</span>
                <span className="v">{v ? (/T\d\d:/.test(v) ? new Date(v).toLocaleString("en-IN", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : v) : "listening…"}</span>
              </div>
            );
          })}
        </div>
        {state.booking && (
          <div className="slot filled" style={{ background: "var(--leaf)", borderColor: "var(--leaf)", color: "#fff" }}>
            <span>✅ Booked</span>
            <b>{new Date(state.booking).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}</b>
          </div>
        )}
        {last && last.score.reasons.length > 0 && (
          <ul className="small" style={{ margin: 0, paddingLeft: 18, opacity: 0.8 }}>
            {last.score.reasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
        )}
        <p className="tiny" style={{ marginTop: "auto", opacity: 0.6 }}>Nothing you type here is stored. In production this runs on WhatsApp with your real hours, prices and address.</p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ pricing

function Pricing() {
  const [plans, setPlans] = useState<{ id: string; name: string; monthlyPaise: number; includedConversations: number; seats: number; features: string[] }[]>([]);
  useEffect(() => {
    api<{ plans: typeof plans }>("/public/plans").then((r) => setPlans(r.plans)).catch(() => {});
  }, []);
  return (
    <div className="price-grid" style={{ marginTop: 24 }}>
      {plans.map((p) => (
        <div key={p.id} className={`card plan ${p.id === "growth" ? "current" : ""}`}>
          <div className="spread">
            <h3>{p.name}</h3>
            {p.id === "growth" && <span className="chip warm">Most popular</span>}
          </div>
          <div className="price">₹{(p.monthlyPaise / 100).toLocaleString("en-IN")}<span className="muted small">/month</span></div>
          <div className="small muted">{p.includedConversations.toLocaleString("en-IN")} AI conversations · {p.seats} seat{p.seats > 1 ? "s" : ""}</div>
          <ul>{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
          <Link className={`btn ${p.id === "growth" ? "primary" : ""}`} to="/signup" style={{ marginTop: "auto" }}>Start with {p.name}</Link>
        </div>
      ))}
    </div>
  );
}
