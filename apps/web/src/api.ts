import { useCallback, useEffect, useRef, useState } from "react";

export type Lang = "en" | "hi" | "gu";

export interface Lead {
  id: string;
  name: string;
  phone: string;
  language: Lang;
  script: "native" | "latin";
  source: string;
  status: string;
  score: number;
  temperature: "hot" | "warm" | "cold";
  intent: string;
  slots: Record<string, string>;
  summary: string;
  value_estimate: number;
  ai_paused: number;
  consent: string;
  notes: string;
  first_response_ms: number | null;
  missed_at: string | null;
  last_inbound_at: string | null;
  created_at: string;
  updated_at: string;
  lastMessage?: { body: string; gloss: string; author: string; created_at: string } | null;
}

export interface Message {
  id: string;
  lead_id: string;
  direction: "in" | "out";
  channel: string;
  author: "customer" | "ai" | "agent" | "system";
  body: string;
  gloss: string;
  language: string;
  template: string | null;
  status: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface Followup {
  id: string;
  lead_id: string;
  kind: string;
  channel: string;
  step: number;
  due_at: string;
  status: string;
  reason: string;
  executed_at: string | null;
  name?: string;
  phone?: string;
  language?: Lang;
}

export interface Me {
  user: { id: string; name: string; email: string; phone: string; ui_lang: Lang };
  tenant: { id: string; name: string; vertical: string; city: string; phone: string; plan: string; default_lang: Lang; settings: TenantSettings };
  playbook: { vertical: string; label: Record<Lang, string>; bookingKind: Record<string, string>; slots: { key: string; label: Record<Lang, string>; required: boolean; type: string }[] };
  ai: "claude" | "rules";
}

export interface TenantSettings {
  hours: { open: string; close: string; days: number[] };
  quietHours: { start: string; end: string };
  localities: string[];
  offerings: string[];
  priceNote: string;
  address: string;
  bookingKind: string;
  avgDealValue: number;
  consentMode: "implied_inbound" | "explicit_only";
  cadence: { nudgeAfterMin: number; secondNudgeAfterMin: number; finalNudgeAfterMin: number; callbackAfterMin: number };
  ownerPhone: string;
  aiPersona: string;
  autoReply: boolean;
}

const TOKEN_KEY = "vaani.token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable (private mode) — session lasts for this tab only */
  }
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: {
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 401 && token) {
    setToken(null);
    if (!location.pathname.startsWith("/login")) location.href = "/login";
  }
  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string })?.error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Fetch-on-mount with manual refresh; `deps` re-trigger the load. */
export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!path) return;
    const n = ++seq.current;
    setLoading(true);
    try {
      const out = await api<T>(path);
      if (n === seq.current) {
        setData(out);
        setError(null);
      }
    } catch (e) {
      if (n === seq.current) setError((e as Error).message);
    } finally {
      if (n === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, error, loading, reload: load, setData };
}

export type LiveHandler = (type: string, data: unknown) => void;

/** Subscribes to the tenant's Server-Sent Events stream; reconnects automatically. */
export function useLive(handler: LiveHandler) {
  const ref = useRef(handler);
  ref.current = handler;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const es = new EventSource(`/api/stream?token=${encodeURIComponent(token)}`);
    const types = ["ready", "message", "lead", "followup", "booking", "missed_call", "new_lead", "handoff", "attention", "message_status"];
    const listeners = types.map((t) => {
      const fn = (e: MessageEvent) => {
        if (t === "ready") setConnected(true);
        else ref.current(t, JSON.parse(e.data));
      };
      es.addEventListener(t, fn);
      return [t, fn] as const;
    });
    es.onerror = () => setConnected(false);
    es.onopen = () => setConnected(true);
    return () => {
      listeners.forEach(([t, fn]) => es.removeEventListener(t, fn));
      es.close();
    };
  }, []);

  return connected;
}

export function rupees(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function rupeesPaise(p: number): string {
  return `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function compactRupees(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}k`;
  return `₹${n}`;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 0) {
    const f = -s;
    if (f < 3600) return `in ${Math.round(f / 60)}m`;
    if (f < 86400) return `in ${Math.round(f / 3600)}h`;
    return `in ${Math.round(f / 86400)}d`;
  }
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function fmtDay(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
}

export function initials(name: string, phone: string): string {
  const n = name.trim();
  if (!n) return phone.slice(-2);
  return n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function displayName(l: { name: string; phone: string }): string {
  return l.name || `•••${l.phone.slice(-4)}`;
}

export function prettyPhone(p: string): string {
  const m = p.match(/^\+91(\d{5})(\d{5})$/);
  return m ? `+91 ${m[1]} ${m[2]}` : p;
}
