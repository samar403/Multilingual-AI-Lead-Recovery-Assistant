import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Lang } from "./api";

// The dashboard is used by shop owners, not just their staff — so the whole
// chrome switches between English, हिन्दी and ગુજરાતી (the "Lipi switch").
const DICT = {
  dashboard: { en: "Today", hi: "आज", gu: "આજ" },
  inbox: { en: "Inbox", hi: "इनबॉक्स", gu: "ઇનબોક્સ" },
  pipeline: { en: "Pipeline", hi: "पाइपलाइन", gu: "પાઇપલાઇન" },
  followups: { en: "Follow-ups", hi: "फ़ॉलो-अप", gu: "ફૉલો-અપ" },
  bookings: { en: "Bookings", hi: "बुकिंग", gu: "બુકિંગ" },
  integrations: { en: "Channels", hi: "चैनल", gu: "ચેનલ" },
  billing: { en: "Bahi-khata", hi: "बही-खाता", gu: "હિસાબ" },
  settings: { en: "Settings", hi: "सेटिंग्स", gu: "સેટિંગ્સ" },
  logout: { en: "Sign out", hi: "साइन आउट", gu: "સાઇન આઉટ" },
  live: { en: "Live", hi: "लाइव", gu: "લાઇવ" },
  offline: { en: "Reconnecting", hi: "जुड़ रहा है", gu: "જોડાઈ રહ્યું છે" },
  search: { en: "Search leads, pages…", hi: "लीड या पेज खोजें…", gu: "લીડ કે પેજ શોધો…" },
  simulateCall: { en: "Simulate missed call", hi: "मिस्ड कॉल आज़माएँ", gu: "મિસ્ડ કૉલ અજમાવો" },

  leads: { en: "Leads", hi: "लीड्स", gu: "લીડ્સ" },
  missedCalls: { en: "Missed calls", hi: "मिस्ड कॉल", gu: "મિસ્ડ કૉલ" },
  recovered: { en: "Recovered", hi: "रिकवर हुए", gu: "પાછા મળ્યા" },
  booked: { en: "Booked", hi: "बुक हुए", gu: "બુક થયા" },
  revenueRecovered: { en: "Revenue recovered", hi: "वापस मिली कमाई", gu: "પાછી મળેલી કમાણી" },
  goldenMinute: { en: "Answered in the golden minute", hi: "पहले मिनट में जवाब", gu: "પહેલી મિનિટમાં જવાબ" },
  medianReply: { en: "median first reply", hi: "पहला जवाब (मीडियन)", gu: "પહેલો જવાબ (મીડિયન)" },
  radarTitle: { en: "Recovery radar", hi: "रिकवरी रडार", gu: "રિકવરી રડાર" },
  radarSub: { en: "Every lead travels inward — from a missed call at the edge to a booking at the centre.", hi: "हर लीड बाहर (मिस्ड कॉल) से अंदर (बुकिंग) की ओर बढ़ती है।", gu: "દરેક લીડ બહાર (મિસ્ડ કૉલ) થી અંદર (બુકિંગ) તરફ આગળ વધે છે." },
  liveFeed: { en: "Live conversations", hi: "लाइव बातचीत", gu: "લાઇવ વાતચીત" },
  needsYou: { en: "Needs you", hi: "आपकी ज़रूरत है", gu: "તમારી જરૂર છે" },
  upcoming: { en: "Coming up", hi: "आने वाले", gu: "આવનારા" },
  languages: { en: "Languages your customers used", hi: "ग्राहकों की भाषाएँ", gu: "ગ્રાહકોની ભાષાઓ" },
  last14: { en: "Last 14 days", hi: "पिछले 14 दिन", gu: "છેલ્લા 14 દિવસ" },

  lens: { en: "Translation lens", hi: "अनुवाद लेंस", gu: "અનુવાદ લેન્સ" },
  takeOver: { en: "Take over", hi: "खुद संभालें", gu: "જાતે સંભાળો" },
  handBack: { en: "Hand back to AI", hi: "AI को वापस दें", gu: "AI ને પાછું આપો" },
  aiReplying: { en: "Vaani AI is replying automatically", hi: "Vaani AI अपने आप जवाब दे रहा है", gu: "Vaani AI આપમેળે જવાબ આપે છે" },
  youReplying: { en: "You're handling this chat — AI is paused", hi: "यह चैट आप संभाल रहे हैं — AI रुका है", gu: "આ ચેટ તમે સંભાળો છો — AI રોકાયેલું છે" },
  typeReply: { en: "Type a reply…", hi: "जवाब लिखें…", gu: "જવાબ લખો…" },
  send: { en: "Send", hi: "भेजें", gu: "મોકલો" },
  suggest: { en: "AI draft", hi: "AI ड्राफ़्ट", gu: "AI ડ્રાફ્ટ" },
  call: { en: "Call", hi: "कॉल", gu: "કૉલ" },
  book: { en: "Book", hi: "बुक", gu: "બુક" },
  qualification: { en: "Qualification", hi: "जानकारी", gu: "માહિતી" },
  score: { en: "Lead score", hi: "लीड स्कोर", gu: "લીડ સ્કોર" },
  cadence: { en: "Follow-up plan", hi: "फ़ॉलो-अप योजना", gu: "ફૉલો-અપ યોજના" },
  consent: { en: "Consent trail", hi: "सहमति रिकॉर्ड", gu: "સંમતિ રેકોર્ડ" },
  notes: { en: "Private notes", hi: "निजी नोट्स", gu: "ખાનગી નોંધ" },
  noLead: { en: "Pick a conversation", hi: "कोई बातचीत चुनें", gu: "કોઈ વાતચીત પસંદ કરો" },
  all: { en: "All", hi: "सभी", gu: "બધા" },

  st_new: { en: "New", hi: "नया", gu: "નવું" },
  st_contacted: { en: "Contacted", hi: "संपर्क किया", gu: "સંપર્ક કર્યો" },
  st_engaged: { en: "Talking", hi: "बातचीत", gu: "વાતચીત" },
  st_qualified: { en: "Qualified", hi: "योग्य", gu: "લાયક" },
  st_booked: { en: "Booked", hi: "बुक", gu: "બુક" },
  st_won: { en: "Won", hi: "जीता", gu: "જીત્યા" },
  st_lost: { en: "Lost", hi: "खोया", gu: "ગુમાવ્યા" },
  st_opted_out: { en: "Opted out", hi: "मना किया", gu: "ના પાડી" },
} as const;

export type DictKey = keyof typeof DICT;

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: DictKey) => string;
}

const Ctx = createContext<I18n>({ lang: "en", setLang: () => {}, t: (k) => DICT[k].en });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      return (localStorage.getItem("vaani.lipi") as Lang) || "en";
    } catch {
      return "en";
    }
  });
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang: (l) => {
        setLangState(l);
        try {
          localStorage.setItem("vaani.lipi", l);
        } catch {
          /* ignore */
        }
      },
      t: (key) => DICT[key][lang] ?? DICT[key].en,
    }),
    [lang],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);

export const LANG_LABEL: Record<Lang, { native: string; en: string }> = {
  gu: { native: "ગુજરાતી", en: "Gujarati" },
  hi: { native: "हिन्दी", en: "Hindi" },
  en: { native: "English", en: "English" },
};

export const STATUSES = ["new", "contacted", "engaged", "qualified", "booked", "won", "lost", "opted_out"] as const;

export function statusLabel(t: I18n["t"], s: string): string {
  return t(`st_${s}` as DictKey) ?? s;
}
