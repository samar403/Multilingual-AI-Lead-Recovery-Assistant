import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api, setToken, useApi, useLive, type Lead, type Me, displayName, type LiveHandler } from "../api";
import { useI18n, type DictKey } from "../i18n";
import { Icon, Logo, useToast } from "./ui";

interface ShellCtx {
  me: Me;
  reloadMe: () => void;
  connected: boolean;
  onLive: (fn: LiveHandler) => () => void;
}

const Ctx = createContext<ShellCtx | null>(null);
export const useShell = () => useContext(Ctx)!;

const NAV: { to: string; key: DictKey; icon: string; end?: boolean }[] = [
  { to: "/app", key: "dashboard", icon: "radar", end: true },
  { to: "/app/inbox", key: "inbox", icon: "inbox" },
  { to: "/app/pipeline", key: "pipeline", icon: "pipeline" },
  { to: "/app/followups", key: "followups", icon: "clock" },
  { to: "/app/bookings", key: "bookings", icon: "calendar" },
  { to: "/app/integrations", key: "integrations", icon: "plug" },
  { to: "/app/billing", key: "billing", icon: "book" },
  { to: "/app/settings", key: "settings", icon: "gear" },
];

export function LipiSwitch() {
  const { lang, setLang } = useI18n();
  return (
    <div className="lipi" role="group" aria-label="Interface language">
      {(["en", "hi", "gu"] as const).map((l) => (
        <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)} lang={l}>
          {l === "en" ? "EN" : l === "hi" ? "हिं" : "ગુ"}
        </button>
      ))}
    </div>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<string>(() => {
    try {
      return localStorage.getItem("vaani.theme") ?? "";
    } catch {
      return "";
    }
  });
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
  }, [theme]);
  const dark = theme === "dark" || (!theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
  return (
    <button
      className="btn ghost icon"
      aria-label="Toggle dark mode"
      onClick={() => {
        const next = dark ? "light" : "dark";
        setTheme(next);
        try {
          localStorage.setItem("vaani.theme", next);
        } catch {
          /* ignore */
        }
      }}
    >
      <Icon name={dark ? "sun" : "moon"} />
    </button>
  );
}

export function Shell() {
  const { t } = useI18n();
  const nav = useNavigate();
  const toast = useToast();
  const { data: me, reload } = useApi<Me>("/me");
  const [listeners] = useState(() => new Set<LiveHandler>());
  const [attention, setAttention] = useState(0);
  const [palette, setPalette] = useState(false);

  const connected = useLive((type, data) => {
    listeners.forEach((fn) => fn(type, data));
    const d = data as { phone?: string; leadId?: string };
    if (type === "missed_call") toast(`📵 Missed call from •••${d.phone?.slice(-4)} — Vaani replied on WhatsApp`);
    if (type === "handoff") {
      setAttention((n) => n + 1);
      toast("🙋 A customer asked for you — check the inbox");
    }
    if (type === "new_lead") toast("✨ New enquiry received");
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ctx = useMemo<ShellCtx | null>(
    () =>
      me
        ? {
            me,
            reloadMe: reload,
            connected,
            onLive: (fn) => {
              listeners.add(fn);
              return () => listeners.delete(fn);
            },
          }
        : null,
    [me, connected, reload, listeners],
  );

  if (!ctx || !me) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>
        <div className="row muted">
          <Logo /> Loading your desk…
        </div>
      </div>
    );
  }

  const logout = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    setToken(null);
    nav("/login");
  };

  return (
    <Ctx.Provider value={ctx}>
      <div className="shell">
        <aside className="sidebar">
          <NavLink to="/app" className="brand">
            <Logo />
            <span className="word">Vaani</span>
            <span className="script">વાણી</span>
          </NavLink>
          <nav className="nav stack" style={{ gap: 2 }} aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} onClick={() => n.key === "inbox" && setAttention(0)}>
                <Icon name={n.icon} />
                {t(n.key)}
                {n.key === "inbox" && attention > 0 ? <span className="count">{attention}</span> : null}
              </NavLink>
            ))}
          </nav>
          <button className="btn sm" style={{ marginTop: 10, justifyContent: "space-between" }} onClick={() => setPalette(true)}>
            <span className="row" style={{ gap: 6 }}>
              <Icon name="search" size={15} /> {t("search").replace("…", "")}
            </span>
            <span className="kbd">⌘K</span>
          </button>
          <div className="foot">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <LipiSwitch />
              <ThemeToggle />
            </div>
            <div className="biz">
              <div className="avatar">{me.tenant.name.slice(0, 1)}</div>
              <div className="grow">
                <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{me.tenant.name}</div>
                <div className="tiny muted">
                  {me.playbook.label.en} · {me.tenant.city}
                </div>
              </div>
              <button className="btn ghost icon sm" onClick={logout} aria-label={t("logout")} title={t("logout")}>
                <Icon name="out" size={16} />
              </button>
            </div>
          </div>
        </aside>
        <div className="main">
          <Outlet />
        </div>
        <nav className="mobile-nav" aria-label="Main">
          {NAV.slice(0, 5).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              <Icon name={n.icon} size={20} />
              {t(n.key)}
            </NavLink>
          ))}
        </nav>
      </div>
      {palette && <Palette onClose={() => setPalette(false)} />}
    </Ctx.Provider>
  );
}

export function Topbar({ title, children }: { title: ReactNode; children?: ReactNode }) {
  const { connected } = useShell();
  const { t } = useI18n();
  return (
    <header className="topbar">
      <h1>{title}</h1>
      <span className={`live ${connected ? "" : "off"}`}>
        <i /> {connected ? t("live") : t("offline")}
      </span>
      <div className="grow" />
      <div className="row">{children}</div>
    </header>
  );
}

function Palette({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const { data: leads } = useApi<Lead[]>(q.length >= 2 ? `/leads?q=${encodeURIComponent(q)}&limit=8` : null, [q]);

  const items = [
    ...NAV.filter((n) => t(n.key).toLowerCase().includes(q.toLowerCase())).map((n) => ({ label: t(n.key), hint: "page", go: n.to, icon: n.icon })),
    ...(leads ?? []).map((l) => ({ label: displayName(l), hint: l.summary || l.phone, go: `/app/inbox/${l.id}`, icon: "inbox" })),
  ];

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Command palette">
        <input
          autoFocus
          placeholder={t("search")}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown") setSel((s) => Math.min(items.length - 1, s + 1));
            if (e.key === "ArrowUp") setSel((s) => Math.max(0, s - 1));
            if (e.key === "Enter" && items[sel]) {
              nav(items[sel].go);
              onClose();
            }
          }}
        />
        <div className="items">
          {items.map((it, i) => (
            <div
              key={it.go + i}
              className={`it ${i === sel ? "sel" : ""}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => {
                nav(it.go);
                onClose();
              }}
            >
              <Icon name={it.icon} />
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{it.label}</div>
                <div className="tiny muted">{it.hint}</div>
              </div>
            </div>
          ))}
          {!items.length && <div className="empty small">No matches</div>}
        </div>
      </div>
    </div>
  );
}
