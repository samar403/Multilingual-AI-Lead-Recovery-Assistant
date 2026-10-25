import { randomBytes, createHash, scryptSync, timingSafeEqual } from "node:crypto";

export function id(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString("base64url")}`;
}

export function nowIso(clock: () => Date = () => new Date()): string {
  return clock().toISOString();
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Normalise Indian phone numbers to E.164 (+91XXXXXXXXXX). */
export function normalizePhone(input: string): string {
  const digits = toAsciiDigits(input).replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  const bare = digits.replace(/^0+/, "");
  if (bare.length === 10) return `+91${bare}`;
  if (bare.length === 12 && bare.startsWith("91")) return `+${bare}`;
  return bare ? `+${bare}` : "";
}

export function maskPhone(phone: string): string {
  return phone.length > 6 ? `${phone.slice(0, 5)}•••••${phone.slice(-3)}` : phone;
}

/** Convert Gujarati (૦-૯) and Devanagari (०-९) digits to ASCII. */
export function toAsciiDigits(text: string): string {
  return text.replace(/[૦-૯०-९]/g, (ch) => {
    const code = ch.charCodeAt(0);
    return String(code >= 0x0ae6 ? code - 0x0ae6 : code - 0x0966);
  });
}

export function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
