// India Standard Time helpers. IST is a fixed UTC+05:30 offset (no DST), so a
// simple shift is exact and avoids pulling in a timezone library.

const IST_OFFSET_MIN = 330;

export interface IstParts {
  year: number;
  month: number; // 0-11
  day: number;
  weekday: number; // 0 = Sunday
  hour: number;
  minute: number;
}

export function istParts(date: Date): IstParts {
  const shifted = new Date(date.getTime() + IST_OFFSET_MIN * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

export function fromIst(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(year, month, day, hour, minute) - IST_OFFSET_MIN * 60_000);
}

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function minutesOfDay(date: Date): number {
  const p = istParts(date);
  return p.hour * 60 + p.minute;
}

/** True when `date` falls inside a window that may wrap midnight (e.g. 21:00–09:00). */
export function inWindow(date: Date, start: string, end: string): boolean {
  const m = minutesOfDay(date);
  const s = hhmmToMinutes(start);
  const e = hhmmToMinutes(end);
  return s <= e ? m >= s && m < e : m >= s || m < e;
}

/** Next instant at or after `date` that is outside the quiet window. */
export function nextAllowed(date: Date, quiet: { start: string; end: string }): Date {
  if (!inWindow(date, quiet.start, quiet.end)) return date;
  const p = istParts(date);
  const endMin = hhmmToMinutes(quiet.end);
  let candidate = fromIst(p.year, p.month, p.day, Math.floor(endMin / 60), endMin % 60);
  if (candidate.getTime() <= date.getTime()) candidate = new Date(candidate.getTime() + 86_400_000);
  return candidate;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function startOfIstDay(date: Date): Date {
  const p = istParts(date);
  return fromIst(p.year, p.month, p.day);
}

/** Romanised Hindi/Gujarati readers expect dates in English letters. */
export function dateLang(lang: "en" | "hi" | "gu", script: "native" | "latin"): "en" | "hi" | "gu" {
  return script === "latin" ? "en" : lang;
}

export function formatIst(date: Date, lang: "en" | "hi" | "gu" = "en"): string {
  const locale = lang === "en" ? "en-IN" : lang === "hi" ? "hi-IN" : "gu-IN";
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
