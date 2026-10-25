import type { Intent, Slots } from "../types.js";
import type { SlotDef } from "./verticals.js";
import { toAsciiDigits } from "../lib/util.js";
import { fromIst, istParts } from "../lib/time.js";

// Deterministic trilingual NLU. It powers the offline engine, and also acts as a
// safety net under the LLM: anything it extracts with high precision (budgets,
// BHK, dates, opt-outs) is merged even when Claude is answering.

export function normalize(text: string): string {
  return toAsciiDigits(text).toLowerCase().replace(/[’']/g, "").replace(/\s+/g, " ").trim();
}

const isLatin = (kw: string) => /^[a-z0-9 .\-]+$/.test(kw);

/** Latin keywords match on word boundaries; Indic keywords match as substrings (they inflect). */
export function hasKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((kw) => {
    if (isLatin(kw)) return new RegExp(`(^|[^a-z0-9])${kw.replace(/[.\-]/g, "\\$&")}([^a-z0-9]|$)`).test(text);
    return text.includes(kw);
  });
}

const INTENT_KEYWORDS: [Intent, string[]][] = [
  ["opt_out", ["stop", "unsubscribe", "band karo", "bandh karo", "bandh kari do", "message mat", "msg mat", "dont message", "do not message", "spam", "बंद करो", "मैसेज मत", "બંધ કરો", "મેસેજ ના કરો", "મેસેજ બંધ"]],
  ["complaint", ["complaint", "worst", "pathetic", "refund", "fraud", "cheated", "kharab", "bekar", "shikayat", "fariyad", "शिकायत", "खराब", "बेकार", "ફરિયાદ", "ખરાબ", "બેકાર"]],
  ["human", ["call me", "talk to", "speak to", "speak with", "real person", "human", "owner", "manager", "call karo", "phone karo", "baat karni", "baat karna", "vaat karvi", "call karjo", "कॉल करो", "फ़ोन करो", "फोन करो", "बात करनी", "बात करना", "કૉલ કરો", "કોલ કરો", "ફોન કરો", "વાત કરવી"]],
  ["cancel", ["cancel", "radd", "रद्द", "कैंसल", "કેન્સલ", "રદ"]],
  ["reschedule", ["reschedule", "postpone", "change time", "another time", "time badal", "samay badal", "samay badlo", "समय बदल", "टाइम बदल", "સમય બદલ", "ટાઇમ બદલ"]],
  ["not_interested", ["not interested", "no need", "nahi chahiye", "nai chahiye", "nathi joitu", "nathi joie", "joitu nathi", "already joined", "already taken", "नहीं चाहिए", "ज़रूरत नहीं", "જોઈતું નથી", "નથી જોઈતું", "જરૂર નથી"]],
  ["booking", ["book", "booking", "appointment", "schedule", "slot", "demo", "visit", "site visit", "aavu", "aavish", "aaunga", "aaungi", "milna", "बुक", "बुकिंग", "अपॉइंटमेंट", "डेमो", "विज़िट", "विजिट", "બુક", "બુકિંગ", "અપોઇન્ટમેન્ટ", "ડેમો", "વિઝિટ", "આવીશ", "आऊंगा"]],
  ["pricing", ["price", "prices", "pricing", "fee", "fees", "cost", "charges", "charge", "rate", "rates", "kitna", "kitne", "kitni", "ketla", "ketlu", "ketli", "bhav", "kimat", "budget", "कितना", "कितने", "फ़ीस", "फीस", "कीमत", "चार्ज", "ભાવ", "કેટલા", "કેટલું", "કેટલી", "ફી", "કિંમત", "ચાર્જ"]],
  ["location", ["address", "location", "where are you", "where is", "map", "kahan", "kaha hai", "kya che", "kyan che", "pata", "sarnamu", "कहाँ", "कहां", "पता", "લોકેશન", "ક્યાં", "સરનામું"]],
  ["thanks", ["thanks", "thank you", "thx", "dhanyavad", "dhanyawad", "shukriya", "aabhar", "abhar", "धन्यवाद", "शुक्रिया", "આભાર"]],
  ["greeting", ["hi", "hello", "hey", "namaste", "namaskar", "kem cho", "jai shree krishna", "jsk", "नमस्ते", "नमस्कार", "हेलो", "નમસ્તે", "નમસ્કાર", "હેલો", "કેમ છો", "જય શ્રી કૃષ્ણ"]],
];

export function detectIntent(raw: string): Intent {
  const text = normalize(raw);
  if (/^(stop|unsubscribe)$/.test(text)) return "opt_out";
  const short = text.split(" ").length <= 4;
  for (const [intent, keywords] of INTENT_KEYWORDS) {
    if (intent === "greeting" && !short) continue; // "Hi, NEET coaching chahiye…" is an enquiry, not a greeting
    if (hasKeyword(text, keywords)) return intent;
  }
  return text.length > 0 ? "inquiry" : "other";
}

export function isOptIn(raw: string): boolean {
  return /^(start|resume|subscribe)$/.test(normalize(raw));
}

export function isAffirmative(raw: string): boolean {
  const text = normalize(raw);
  return hasKeyword(text, ["yes", "yeah", "yep", "ok", "okay", "sure", "haan", "ha", "haa", "ji", "theek", "thik", "chalse", "chalega", "done", "confirm", "हाँ", "हां", "ठीक", "હા", "ઠીક", "ચાલશે", "चलेगा"]);
}

// ---------------------------------------------------------------- slot extractors

export function extractChoice(raw: string, choices: Record<string, string[]>): string | undefined {
  const text = normalize(raw);
  for (const [canonical, keywords] of Object.entries(choices)) {
    if (hasKeyword(text, [canonical.toLowerCase(), ...keywords])) return canonical;
  }
  return undefined;
}

export function extractGrade(raw: string): string | undefined {
  const text = normalize(raw);
  const patterns = [
    /(?:std|standard|class|grade|dhoran|kaksha|ધોરણ|ધો\.?|कक्षा|क्लास|ક્લાસ)\s*[-:]?\s*(\d{1,2})/,
    /(\d{1,2})\s*(?:st|nd|rd|th)?\s*(?:std|standard|class|grade|ma|mein|में|માં|ધોરણ|कक्षा)/,
    /(\d{1,2})\s*(?:th|st|nd|rd)\b/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    const n = m ? Number(m[1]) : NaN;
    if (n >= 1 && n <= 12) return `Std ${n}`;
  }
  if (/dropper|repeater|ड्रॉपर|ડ્રોપર/.test(text)) return "Dropper";
  return undefined;
}

export function extractBhk(raw: string, choices?: Record<string, string[]>): string | undefined {
  const text = normalize(raw);
  const m = text.match(/(\d)\s*-?\s*(?:bhk|bh k|b h k|बीएचके|બીએચકે|बी एच के)/);
  if (m) return `${m[1]} BHK`;
  const word = text.match(/\b(one|two|three|four|ek|do|teen|be|tran|char)\s*bhk/);
  if (word) {
    const map: Record<string, number> = { one: 1, ek: 1, two: 2, do: 2, be: 2, three: 3, teen: 3, tran: 3, four: 4, char: 4 };
    return `${map[word[1]!]} BHK`;
  }
  return choices ? extractChoice(raw, choices) : undefined;
}

export interface Budget {
  label: string;
  rupees: number;
}

export function extractBudget(raw: string): Budget | undefined {
  const text = normalize(raw).replace(/(\d),(\d)/g, "$1$2");
  const re = /(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(crore|cr|करोड़|करोड|કરોડ|lakhs?|lacs?|l|लाख|લાખ|k|thousand|hazaar|hajar|हज़ार|हजार|હજાર)?(?![a-z])/g;
  const moneyContext = /(₹|rs|inr|budget|बजट|બજેટ|rent|kiraya|bhadu)/.test(text);
  for (const m of text.matchAll(re)) {
    const n = Number(m[1]);
    const unit = m[2] ?? "";
    let rupees = n;
    if (/^(crore|cr|करोड़|करोड|કરોડ)$/.test(unit)) rupees = n * 1e7;
    else if (/^(lakhs?|lacs?|l|लाख|લાખ)$/.test(unit)) rupees = n * 1e5;
    else if (/^(k|thousand|hazaar|hajar|हज़ार|हजार|હજાર)$/.test(unit)) rupees = n * 1e3;
    else if (!moneyContext || n < 1000 || m[1]!.length >= 10) continue; // bare small numbers / phone numbers are not budgets
    if (rupees >= 1000) return { label: formatRupees(rupees), rupees };
  }
  return undefined;
}

export function formatRupees(rupees: number): string {
  if (rupees >= 1e7) return `₹${+(rupees / 1e7).toFixed(2)} Cr`;
  if (rupees >= 1e5) return `₹${+(rupees / 1e5).toFixed(2)} lakh`;
  return `₹${rupees.toLocaleString("en-IN")}`;
}

export function extractLocality(raw: string, localities: string[]): string | undefined {
  const text = normalize(raw);
  for (const entry of localities) {
    const [canonical, ...aliases] = entry.split("|").map((s) => s.trim());
    if (!canonical) continue;
    if (hasKeyword(text, [canonical.toLowerCase(), ...aliases.map((a) => a.toLowerCase())])) return canonical;
  }
  return undefined;
}

const WEEKDAYS: string[][] = [
  ["sunday", "ravivar", "raviwar", "रविवार", "રવિવાર"],
  ["monday", "somvar", "somwar", "सोमवार", "સોમવાર"],
  ["tuesday", "mangalvar", "mangalwar", "मंगलवार", "મંગળવાર"],
  ["wednesday", "budhvar", "budhwar", "बुधवार", "બુધવાર"],
  ["thursday", "guruvar", "guruwar", "गुरुवार", "ગુરુવાર"],
  ["friday", "shukravar", "shukrawar", "शुक्रवार", "શુક્રવાર"],
  ["saturday", "shanivar", "shaniwar", "शनिवार", "શનિવાર"],
];

/** Parses "kal sanje 5 vaagye", "कल शाम 6 बजे", "saturday 11am" into an IST instant. */
export function extractDateTime(raw: string, now: Date): Date | undefined {
  const text = normalize(raw);
  let dayOffset: number | undefined;
  if (hasKeyword(text, ["day after tomorrow", "parso", "parmdivas", "parmdi", "परसों", "પરમદિવસ"])) dayOffset = 2;
  else if (hasKeyword(text, ["tomorrow", "tmrw", "kal", "kale", "kaale", "कल", "કાલે", "આવતીકાલે", "aavtikale"])) dayOffset = 1;
  else if (hasKeyword(text, ["today", "aaj", "aaje", "आज", "આજે", "tonight"])) dayOffset = 0;
  else {
    const today = istParts(now).weekday;
    WEEKDAYS.forEach((names, idx) => {
      if (dayOffset === undefined && hasKeyword(text, names)) dayOffset = (idx - today + 7) % 7 || 7;
    });
  }

  let part: "morning" | "afternoon" | "evening" | undefined;
  if (hasKeyword(text, ["morning", "subah", "savare", "savar", "सुबह", "સવારે", "સવાર"])) part = "morning";
  else if (hasKeyword(text, ["afternoon", "dopahar", "bapore", "दोपहर", "બપોરે"])) part = "afternoon";
  else if (hasKeyword(text, ["evening", "shaam", "sham", "saanje", "saanj", "saje", "शाम", "સાંજે", "સાંજ"])) part = "evening";

  const tm = text.match(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|baje|vaagye|vage|vagye|बजे|વાગ્યે|વાગે)/) ?? (dayOffset !== undefined || part ? text.match(/\b(\d{1,2})(?:[:.](\d{2}))?\b(?!\s*(?:bhk|lakh|l\b|cr|k\b|th|std|%))/) : null);

  if (dayOffset === undefined && !tm) return undefined;

  let hour = part === "morning" ? 11 : part === "afternoon" ? 14 : part === "evening" ? 17 : 11;
  let minute = 0;
  if (tm) {
    hour = Number(tm[1]);
    minute = tm[2] ? Number(tm[2]) : 0;
    const suffix = tm[3] ?? "";
    if (hour > 23 || minute > 59) return undefined;
    if (suffix.startsWith("p") && hour < 12) hour += 12;
    else if (suffix.startsWith("a") && hour === 12) hour = 0;
    else if (!suffix.startsWith("a") && !suffix.startsWith("p")) {
      if ((part === "evening" || part === "afternoon") && hour < 12) hour += 12;
      else if (!part && hour >= 1 && hour <= 7) hour += 12; // "5 baje" in a business context means 5 pm
    }
  }

  const p = istParts(now);
  let candidate = fromIst(p.year, p.month, p.day + (dayOffset ?? 0), hour, minute);
  if (candidate.getTime() <= now.getTime()) candidate = new Date(candidate.getTime() + 86_400_000);
  return candidate;
}

export function extractName(raw: string): string | undefined {
  const text = raw.trim();
  const patterns = [
    /(?:my name is|this is|i am|i'm)\s+([A-Za-z][A-Za-z]+(?:\s[A-Za-z][A-Za-z]+)?)/i,
    /(?:mera naam|maru naam|maaru naam|naam)\s+([A-Za-z]+(?:\s[A-Za-z]+)?)\s+(?:hai|che|chhe)/i,
    /(?:मेरा नाम)\s+([ऀ-ॿ]+)/,
    /(?:મારું નામ|મારુ નામ)\s+([઀-૿]+)/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) {
      const name = m[1].trim();
      if (!/^(interested|looking|from|not|here|calling)$/i.test(name)) return name.replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  return undefined;
}

/** Runs every extractor relevant to the playbook. */
export function extractSlots(raw: string, defs: SlotDef[], localities: string[], now: Date): { slots: Slots; budgetRupees?: number; when?: Date } {
  const slots: Slots = {};
  let budgetRupees: number | undefined;
  let when: Date | undefined;
  for (const def of defs) {
    let value: string | undefined;
    switch (def.type) {
      case "choice":
        value = def.choices ? extractChoice(raw, def.choices) : undefined;
        break;
      case "grade":
        value = extractGrade(raw);
        break;
      case "bhk":
        value = extractBhk(raw, def.choices);
        break;
      case "budget": {
        const b = extractBudget(raw);
        if (b) {
          value = b.label;
          budgetRupees = b.rupees;
        }
        break;
      }
      case "locality":
        value = extractLocality(raw, localities);
        break;
      case "slot": {
        const d = extractDateTime(raw, now);
        if (d) {
          when = d;
          value = d.toISOString();
        }
        break;
      }
      default:
        break;
    }
    if (value) slots[def.key] = value;
  }
  return { slots, budgetRupees, when };
}
