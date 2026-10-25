import type { Lang, Vertical } from "../types.js";
import type { Variant } from "../i18n/language.js";

export type SlotType = "choice" | "budget" | "grade" | "bhk" | "slot" | "locality" | "text";

export interface SlotDef {
  key: string;
  type: SlotType;
  required: boolean;
  label: Record<Lang, string>;
  question: Record<Variant, string>;
  /** canonical value → keywords in any language / script */
  choices?: Record<string, string[]>;
}

export interface Playbook {
  vertical: Vertical;
  label: Record<Lang, string>;
  bookingKind: Record<Variant, string>;
  avgDealValue: number;
  slots: SlotDef[];
  defaultOfferings: string[];
  defaultPriceNote: Record<Variant, string>;
}

const PREFERRED_SLOT: SlotDef = {
  key: "preferred_slot",
  type: "slot",
  required: false,
  label: { en: "Preferred time", hi: "पसंदीदा समय", gu: "પસંદગીનો સમય" },
  question: {
    en: "Which day and time works best for you?",
    hi: "आपके लिए कौन सा दिन और समय ठीक रहेगा?",
    gu: "તમારા માટે કયો દિવસ અને સમય ફાવશે?",
    hi_latn: "Aapke liye kaunsa din aur samay theek rahega?",
    gu_latn: "Tamara mate kayo divas ane samay faavse?",
  },
};

export const PLAYBOOKS: Record<Vertical, Playbook> = {
  coaching: {
    vertical: "coaching",
    label: { en: "Coaching institute", hi: "कोचिंग संस्थान", gu: "કોચિંગ સંસ્થા" },
    bookingKind: { en: "free demo class", hi: "फ्री डेमो क्लास", gu: "ફ્રી ડેમો ક્લાસ", hi_latn: "free demo class", gu_latn: "free demo class" },
    avgDealValue: 45000,
    defaultOfferings: ["JEE", "NEET", "Foundation (Std 8–10)", "Spoken English", "Std 11–12 Commerce"],
    defaultPriceNote: {
      en: "Fees start at ₹38,000/year with EMI options, and scholarships up to 40% via our test.",
      hi: "फ़ीस ₹38,000/साल से शुरू, EMI की सुविधा, और टेस्ट से 40% तक स्कॉलरशिप।",
      gu: "ફી ₹38,000/વર્ષથી શરૂ, EMI ની સુવિધા, અને ટેસ્ટથી 40% સુધી સ્કોલરશિપ.",
      hi_latn: "Fees ₹38,000/saal se shuru, EMI ki suvidha, aur test se 40% tak scholarship.",
      gu_latn: "Fee ₹38,000/varsh thi sharu, EMI ni suvidha, ane test thi 40% sudhi scholarship.",
    },
    slots: [
      {
        key: "course",
        type: "choice",
        required: true,
        label: { en: "Course", hi: "कोर्स", gu: "કોર્સ" },
        question: {
          en: "Which course are you looking for — JEE, NEET, Foundation, or something else?",
          hi: "आप कौन सा कोर्स देख रहे हैं — JEE, NEET, फ़ाउंडेशन या कुछ और?",
          gu: "તમે કયો કોર્સ શોધી રહ્યા છો — JEE, NEET, ફાઉન્ડેશન કે બીજું કંઈ?",
          hi_latn: "Aap kaunsa course dekh rahe hain — JEE, NEET, Foundation ya kuch aur?",
          gu_latn: "Tame kayo course shodhi rahya cho — JEE, NEET, Foundation ke biju kai?",
        },
        choices: {
          JEE: ["jee", "iit", "engineering", "ઇજનેરી", "इंजीनियरिंग", "जेईई", "જેઈઈ"],
          NEET: ["neet", "medical", "doctor", "mbbs", "નીટ", "नीट", "मेडिकल", "મેડિકલ"],
          Foundation: ["foundation", "फ़ाउंडेशन", "फाउंडेशन", "ફાઉન્ડેશન", "olympiad", "ntse"],
          "Spoken English": ["spoken", "english speaking", "इंग्लिश", "ઇંગ્લિશ", "અંગ્રેજી", "अंग्रेज़ी", "ielts"],
          Commerce: ["commerce", "accounts", "ca foundation", "कॉमर्स", "કોમર્સ", "એકાઉન્ટ"],
        },
      },
      {
        key: "grade",
        type: "grade",
        required: true,
        label: { en: "Class / Std", hi: "कक्षा", gu: "ધોરણ" },
        question: {
          en: "Which class (std) is the student in right now?",
          hi: "विद्यार्थी अभी किस कक्षा में है?",
          gu: "વિદ્યાર્થી અત્યારે કયા ધોરણમાં છે?",
          hi_latn: "Student abhi kis class mein hai?",
          gu_latn: "Student atyare kaya dhoran ma che?",
        },
      },
      {
        key: "batch",
        type: "choice",
        required: false,
        label: { en: "Batch", hi: "बैच", gu: "બેચ" },
        question: {
          en: "Do you prefer a morning, evening or weekend batch?",
          hi: "सुबह, शाम या वीकेंड — कौन सा बैच पसंद है?",
          gu: "સવાર, સાંજ કે વીકએન્ડ — કયો બેચ ગમશે?",
          hi_latn: "Subah, shaam ya weekend — kaunsa batch pasand hai?",
          gu_latn: "Savar, saanj ke weekend — kayo batch gamse?",
        },
        choices: {
          Morning: ["morning", "subah", "savare", "savar", "सुबह", "સવાર", "સવારે"],
          Evening: ["evening", "shaam", "sham", "saanje", "saanj", "शाम", "સાંજ", "સાંજે"],
          Weekend: ["weekend", "saturday", "sunday", "shanivar", "ravivar", "शनिवार", "रविवार", "શનિવાર", "રવિવાર", "वीकेंड", "વીકએન્ડ"],
          Online: ["online", "ऑनलाइन", "ઓનલાઇન"],
        },
      },
      PREFERRED_SLOT,
    ],
  },

  real_estate: {
    vertical: "real_estate",
    label: { en: "Property agent", hi: "प्रॉपर्टी एजेंट", gu: "પ્રોપર્ટી એજન્ટ" },
    bookingKind: { en: "site visit", hi: "साइट विज़िट", gu: "સાઇટ વિઝિટ", hi_latn: "site visit", gu_latn: "site visit" },
    avgDealValue: 120000,
    defaultOfferings: ["2 & 3 BHK flats", "Bungalows", "Commercial shops", "Rentals"],
    defaultPriceNote: {
      en: "2 BHK options start around ₹48 lakh and 3 BHK around ₹72 lakh; rentals from ₹16,000/month.",
      hi: "2 BHK लगभग ₹48 लाख से और 3 BHK ₹72 लाख से शुरू; किराया ₹16,000/माह से।",
      gu: "2 BHK આશરે ₹48 લાખથી અને 3 BHK ₹72 લાખથી શરૂ; ભાડું ₹16,000/મહિનાથી.",
      hi_latn: "2 BHK lagbhag ₹48 lakh se aur 3 BHK ₹72 lakh se shuru; kiraya ₹16,000/mahina se.",
      gu_latn: "2 BHK aashre ₹48 lakh thi ane 3 BHK ₹72 lakh thi sharu; bhadu ₹16,000/mahina thi.",
    },
    slots: [
      {
        key: "purpose",
        type: "choice",
        required: true,
        label: { en: "Buy / Rent", hi: "ख़रीद / किराया", gu: "ખરીદી / ભાડું" },
        question: {
          en: "Are you looking to buy or rent?",
          hi: "आप ख़रीदना चाहते हैं या किराए पर लेना?",
          gu: "તમે ખરીદવા માંગો છો કે ભાડે લેવા?",
          hi_latn: "Aap khareedna chahte hain ya kiraye par lena?",
          gu_latn: "Tame kharidva mango cho ke bhade leva?",
        },
        choices: {
          Buy: ["buy", "purchase", "kharid", "khareed", "kharidvu", "ख़रीद", "खरीद", "ખરીદ", "invest"],
          Rent: ["rent", "kiraya", "kiraye", "bhade", "bhadu", "किराय", "किराए", "ભાડ", "lease"],
        },
      },
      {
        key: "property_type",
        type: "bhk",
        required: true,
        label: { en: "Property", hi: "प्रॉपर्टी", gu: "પ્રોપર્ટી" },
        question: {
          en: "What are you looking for — 1, 2 or 3 BHK, a bungalow, or a shop/office?",
          hi: "आपको क्या चाहिए — 1, 2 या 3 BHK, बंगला, या दुकान/ऑफ़िस?",
          gu: "તમારે શું જોઈએ છે — 1, 2 કે 3 BHK, બંગલો, કે દુકાન/ઓફિસ?",
          hi_latn: "Aapko kya chahiye — 1, 2 ya 3 BHK, bungalow, ya dukaan/office?",
          gu_latn: "Tamare shu joie che — 1, 2 ke 3 BHK, bungalow, ke dukan/office?",
        },
        choices: {
          Bungalow: ["bungalow", "villa", "बंगला", "બંગલો", "bunglow", "row house", "tenament", "ટેનામેન્ટ"],
          Shop: ["shop", "dukaan", "dukan", "दुकान", "દુકાન", "showroom"],
          Office: ["office", "ऑफ़िस", "ઓફિસ"],
          Plot: ["plot", "land", "zameen", "jamin", "प्लॉट", "પ્લોટ", "જમીન"],
        },
      },
      {
        key: "budget",
        type: "budget",
        required: true,
        label: { en: "Budget", hi: "बजट", gu: "બજેટ" },
        question: {
          en: "What budget range do you have in mind?",
          hi: "आपका बजट लगभग कितना है?",
          gu: "તમારું બજેટ આશરે કેટલું છે?",
          hi_latn: "Aapka budget lagbhag kitna hai?",
          gu_latn: "Tamaru budget aashre ketlu che?",
        },
      },
      {
        key: "locality",
        type: "locality",
        required: true,
        label: { en: "Area", hi: "इलाका", gu: "વિસ્તાર" },
        question: {
          en: "Which area or locality do you prefer?",
          hi: "आप कौन सा इलाका पसंद करेंगे?",
          gu: "તમે કયો વિસ્તાર પસંદ કરશો?",
          hi_latn: "Aap kaunsa area pasand karenge?",
          gu_latn: "Tame kayo vistar pasand karsho?",
        },
      },
      PREFERRED_SLOT,
    ],
  },

  salon: {
    vertical: "salon",
    label: { en: "Salon & spa", hi: "सैलून और स्पा", gu: "સલૂન અને સ્પા" },
    bookingKind: { en: "appointment", hi: "अपॉइंटमेंट", gu: "અપોઇન્ટમેન્ટ", hi_latn: "appointment", gu_latn: "appointment" },
    avgDealValue: 2200,
    defaultOfferings: ["Haircut & styling", "Hair spa", "Keratin", "Facial", "Bridal makeup", "Mehendi"],
    defaultPriceNote: {
      en: "Haircut from ₹350, hair spa ₹1,200, facials from ₹1,500, bridal packages from ₹15,000.",
      hi: "हेयरकट ₹350 से, हेयर स्पा ₹1,200, फ़ेशियल ₹1,500 से, ब्राइडल पैकेज ₹15,000 से।",
      gu: "હેરકટ ₹350થી, હેર સ્પા ₹1,200, ફેશિયલ ₹1,500થી, બ્રાઇડલ પેકેજ ₹15,000થી.",
      hi_latn: "Haircut ₹350 se, hair spa ₹1,200, facial ₹1,500 se, bridal package ₹15,000 se.",
      gu_latn: "Haircut ₹350 thi, hair spa ₹1,200, facial ₹1,500 thi, bridal package ₹15,000 thi.",
    },
    slots: [
      {
        key: "service",
        type: "choice",
        required: true,
        label: { en: "Service", hi: "सर्विस", gu: "સર્વિસ" },
        question: {
          en: "Which service would you like — haircut, hair spa, facial, keratin or bridal?",
          hi: "आपको कौन सी सर्विस चाहिए — हेयरकट, हेयर स्पा, फ़ेशियल, केराटिन या ब्राइडल?",
          gu: "તમારે કઈ સર્વિસ જોઈએ — હેરકટ, હેર સ્પા, ફેશિયલ, કેરાટિન કે બ્રાઇડલ?",
          hi_latn: "Aapko kaunsi service chahiye — haircut, hair spa, facial, keratin ya bridal?",
          gu_latn: "Tamare kai service joie — haircut, hair spa, facial, keratin ke bridal?",
        },
        choices: {
          Haircut: ["haircut", "hair cut", "cutting", "हेयरकट", "बाल", "હેરકટ", "વાળ"],
          "Hair spa": ["spa", "स्पा", "સ્પા"],
          Keratin: ["keratin", "smoothening", "straightening", "rebonding", "केराटिन", "કેરાટિન"],
          Facial: ["facial", "cleanup", "clean up", "फ़ेशियल", "फेशियल", "ફેશિયલ"],
          Bridal: ["bridal", "wedding", "dulhan", "shaadi", "lagna", "ब्राइडल", "दुल्हन", "શાદી", "લગ્ન", "બ્રાઇડલ"],
          Mehendi: ["mehendi", "mehndi", "मेहंदी", "મહેંદી"],
          Waxing: ["wax", "वैक्स", "વેક્સ"],
        },
      },
      { ...PREFERRED_SLOT, required: true },
    ],
  },

  services: {
    vertical: "services",
    label: { en: "Home & local services", hi: "होम सर्विसेज़", gu: "હોમ સર્વિસીસ" },
    bookingKind: { en: "technician visit", hi: "टेक्नीशियन विज़िट", gu: "ટેક્નિશિયન વિઝિટ", hi_latn: "technician visit", gu_latn: "technician visit" },
    avgDealValue: 3500,
    defaultOfferings: ["AC service & repair", "RO water purifier", "Pest control", "Deep cleaning", "Appliance repair"],
    defaultPriceNote: {
      en: "Visit charge ₹299 (waived if you go ahead with the job). AC service ₹599, pest control from ₹1,199.",
      hi: "विज़िट चार्ज ₹299 (काम करवाने पर माफ़)। AC सर्विस ₹599, पेस्ट कंट्रोल ₹1,199 से।",
      gu: "વિઝિટ ચાર્જ ₹299 (કામ કરાવો તો માફ). AC સર્વિસ ₹599, પેસ્ટ કંટ્રોલ ₹1,199થી.",
      hi_latn: "Visit charge ₹299 (kaam karwane par maaf). AC service ₹599, pest control ₹1,199 se.",
      gu_latn: "Visit charge ₹299 (kaam karavo to maaf). AC service ₹599, pest control ₹1,199 thi.",
    },
    slots: [
      {
        key: "service",
        type: "choice",
        required: true,
        label: { en: "Service", hi: "सर्विस", gu: "સર્વિસ" },
        question: {
          en: "What do you need help with — AC, RO, pest control, cleaning or an appliance repair?",
          hi: "किस काम में मदद चाहिए — AC, RO, पेस्ट कंट्रोल, सफ़ाई या उपकरण रिपेयर?",
          gu: "શેમાં મદદ જોઈએ — AC, RO, પેસ્ટ કંટ્રોલ, સફાઈ કે ઉપકરણ રિપેર?",
          hi_latn: "Kis kaam mein madad chahiye — AC, RO, pest control, safai ya appliance repair?",
          gu_latn: "Shema madad joie — AC, RO, pest control, safai ke appliance repair?",
        },
        choices: {
          "AC service": ["ac", "a.c", "air condition", "cooling", "एसी", "એસી"],
          "RO purifier": ["ro", "purifier", "water filter", "आरओ", "આરઓ"],
          "Pest control": ["pest", "cockroach", "termite", "deemak", "udai", "kide", "कीड़े", "दीमक", "ઉધઈ", "વાંદા"],
          "Deep cleaning": ["clean", "cleaning", "safai", "सफ़ाई", "सफाई", "સફાઈ"],
          "Appliance repair": ["fridge", "washing", "microwave", "geyser", "repair", "रिपेयर", "રિપેર", "ફ્રિજ", "फ्रिज"],
        },
      },
      {
        key: "locality",
        type: "locality",
        required: true,
        label: { en: "Area", hi: "इलाका", gu: "વિસ્તાર" },
        question: {
          en: "Which area are you in?",
          hi: "आप किस इलाके में हैं?",
          gu: "તમે કયા વિસ્તારમાં છો?",
          hi_latn: "Aap kis area mein hain?",
          gu_latn: "Tame kaya vistar ma cho?",
        },
      },
      { ...PREFERRED_SLOT, required: true },
    ],
  },
};

export function playbookFor(vertical: Vertical): Playbook {
  return PLAYBOOKS[vertical] ?? PLAYBOOKS.services;
}
