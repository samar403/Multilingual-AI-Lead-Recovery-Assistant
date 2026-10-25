import type { Lang, Script } from "../types.js";

export interface LanguageGuess {
  lang: Lang;
  script: Script;
  confidence: number; // 0..1
}

// Function words that are distinctive for romanised Hindi ("Hinglish") and
// romanised Gujarati ("Gujlish"). Words shared by both (e.g. "bhai") are left out.
const HINGLISH = new Set([
  "hai", "hain", "kya", "kyaa", "nahi", "nahin", "mujhe", "muje", "chahiye", "chaiye", "kitna", "kitne", "hoga", "hogi",
  "kitni", "kab", "aap", "aapka", "aapke", "haan", "ji", "hoon", "karna", "karni", "karo",
  "accha", "acha", "theek", "thik", "kaise", "kahan", "kaha", "mein", "main", "batao", "bataiye", "kal",
  "abhi", "sirf", "bahut", "wala", "wali", "liye", "lekin", "aur", "toh", "hum", "humko", "baje", "sakte",
  "sakta", "sakti", "dijiye", "milega", "chalega", "ke", "ki", "ka", "se", "bhi", "pe", "par", "shaam",
  "subah", "fees", "dekhna", "chahta", "chahti",
]);

const GUJLISH = new Set([
  "che", "chhe", "shu", "su", "mane", "maare", "mare", "joie", "joiye", "joiche", "kem", "tame", "tamne",
  "tamaru", "tamari", "ketla", "ketlu", "ketli", "kyare", "kyan", "haa", "nathi", "aavjo", "kevi", "kevu",
  "saru", "saras", "avo", "aavo", "hu", "maru", "mari", "chho", "cho", "hatu", "hati", "karvu", "karvanu", "jovu",
  "jovanu", "kale", "aaje", "saanje", "saje", "savare", "bapore", "vaagye", "vage", "pan", "nu", "ni", "na",
  "ma", "thi", "ane", "pachhi", "pachi", "rite", "ketlo", "aapo", "aapjo", "kaho", "kahejo", "bolo", "jaldi",
  "bhav", "jagya", "malse", "chalse", "thase",
]);

const ENGLISH = new Set([
  "the", "is", "are", "what", "when", "how", "much", "please", "want", "need", "can", "price", "cost",
  "available", "do", "you", "i", "my", "for", "and", "with", "tomorrow", "today", "book", "appointment",
  "interested", "details", "send", "call", "me", "about", "would", "like", "thanks", "thank", "hello",
  "hi", "visit", "time", "this", "that", "there", "any", "your", "yes", "no", "okay", "ok",
]);

/**
 * Detects Gujarati, Hindi or English and whether the customer typed in the
 * native script or in Latin letters. Script detection is exact; romanised text
 * is scored against function-word lexicons.
 */
export function detectLanguage(text: string, fallback: Lang = "en"): LanguageGuess {
  let gu = 0;
  let hi = 0;
  let latin = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x0a80 && c <= 0x0aff) gu++;
    else if (c >= 0x0900 && c <= 0x097f) hi++;
    else if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) latin++;
  }

  if (gu > 0 || hi > 0) {
    const lang: Lang = gu >= hi ? "gu" : "hi";
    const native = Math.max(gu, hi);
    return { lang, script: "native", confidence: Math.min(1, native / Math.max(1, native + latin * 0.5)) };
  }

  if (latin === 0) return { lang: fallback, script: "native", confidence: 0 };

  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  let h = 0;
  let g = 0;
  let e = 0;
  for (const w of words) {
    if (HINGLISH.has(w)) h++;
    if (GUJLISH.has(w)) g++;
    if (ENGLISH.has(w)) e++;
  }
  const total = Math.max(1, words.length);
  if (g > h && g >= e * 0.6 && g > 0) return { lang: "gu", script: "latin", confidence: Math.min(1, g / total + 0.3) };
  if (h > g && h >= e * 0.6 && h > 0) return { lang: "hi", script: "latin", confidence: Math.min(1, h / total + 0.3) };
  if (e > 0) return { lang: "en", script: "latin", confidence: Math.min(1, e / total + 0.3) };
  return { lang: fallback, script: fallback === "en" ? "latin" : "latin", confidence: 0.2 };
}

/** Variant key used by the trilingual template catalogue. */
export type Variant = "en" | "hi" | "gu" | "hi_latn" | "gu_latn";

export function variantFor(lang: Lang, script: Script): Variant {
  if (lang === "en") return "en";
  return script === "latin" ? (`${lang}_latn` as Variant) : lang;
}

export const LANGUAGE_NAMES: Record<Lang, { en: string; native: string }> = {
  en: { en: "English", native: "English" },
  hi: { en: "Hindi", native: "हिन्दी" },
  gu: { en: "Gujarati", native: "ગુજરાતી" },
};
