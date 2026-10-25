import type { Variant } from "./language.js";

type Catalogue = Record<string, Record<Variant, string>>;

/**
 * Trilingual message catalogue. Keys prefixed `wa_` mirror WhatsApp templates
 * that must be pre-approved by Meta (used outside the 24-hour service window);
 * `sms_` keys mirror DLT-registered SMS templates. Everything else is free-form
 * copy for the rules engine, used inside an open conversation.
 */
export const TEMPLATES: Catalogue = {
  wa_missed_call: {
    en: "Hi{name}! 🙏 Sorry we missed your call at {business}. How can we help you today? You can reply in English, हिन्दी or ગુજરાતી.",
    hi: "नमस्ते{name}! 🙏 {business} में आपका कॉल मिस हो गया, माफ़ी चाहते हैं। बताइए, हम आपकी क्या मदद कर सकते हैं?",
    gu: "નમસ્તે{name}! 🙏 {business} માં તમારો કૉલ મિસ થઈ ગયો, માફ કરશો. કહો, અમે તમારી શું મદદ કરી શકીએ?",
    hi_latn: "Namaste{name}! 🙏 {business} mein aapka call miss ho gaya, maafi chahte hain. Bataiye, hum aapki kya madad kar sakte hain?",
    gu_latn: "Namaste{name}! 🙏 {business} ma tamaro call miss thai gayo, maaf karsho. Kaho, ame tamari shu madad kari shakiye?",
  },
  wa_enquiry: {
    en: "Hi{name}! 🙏 Thanks for your enquiry with {business}. I can answer questions and book you in right here — in English, हिन्दी or ગુજરાતી. What are you looking for?",
    hi: "नमस्ते{name}! 🙏 {business} में पूछताछ के लिए धन्यवाद। मैं यहीं आपके सवालों के जवाब और बुकिंग कर सकता हूँ। आप क्या ढूँढ रहे हैं?",
    gu: "નમસ્તે{name}! 🙏 {business} માં પૂછપરછ બદલ આભાર. હું અહીં જ તમારા પ્રશ્નોના જવાબ અને બુકિંગ કરી શકું છું. તમે શું શોધી રહ્યા છો?",
    hi_latn: "Namaste{name}! 🙏 {business} mein enquiry ke liye dhanyavaad. Main yahin aapke sawaalon ke jawab aur booking kar sakta hoon. Aap kya dhoondh rahe hain?",
    gu_latn: "Namaste{name}! 🙏 {business} ma enquiry badal aabhar. Hu ahiya j tamara prashno na javab ane booking kari shaku chu. Tame shu shodhi rahya cho?",
  },
  sms_missed_call: {
    en: "Sorry we missed your call - {business}. Reply on WhatsApp {waLink} or call back {phone}.",
    hi: "{business}: आपका कॉल मिस हुआ। WhatsApp पर जवाब दें {waLink} या कॉल करें {phone}.",
    gu: "{business}: તમારો કૉલ મિસ થયો. WhatsApp પર જવાબ આપો {waLink} અથવા કૉલ કરો {phone}.",
    hi_latn: "{business}: aapka call miss hua. WhatsApp par reply karein {waLink} ya call karein {phone}.",
    gu_latn: "{business}: tamaro call miss thayo. WhatsApp par reply karo {waLink} athva call karo {phone}.",
  },
  wa_followup: {
    en: "Hi{name}, following up on your enquiry with {business}. Would you like to book a {bookingKind}? Reply YES and we'll set it up.",
    hi: "नमस्ते{name}, {business} के बारे में आपकी पूछताछ पर फ़ॉलो-अप। क्या आप {bookingKind} बुक करना चाहेंगे? हाँ लिखें, हम तय कर देंगे।",
    gu: "નમસ્તે{name}, {business} વિશેની તમારી પૂછપરછ માટે ફૉલો-અપ. શું તમે {bookingKind} બુક કરવા માંગો છો? હા લખો, અમે ગોઠવી દઈશું.",
    hi_latn: "Namaste{name}, {business} ke baare mein aapki enquiry par follow-up. Kya aap {bookingKind} book karna chahenge? HAAN likhiye.",
    gu_latn: "Namaste{name}, {business} vishe tamari enquiry mate follow-up. Shu tame {bookingKind} book karva mango cho? HA lakho.",
  },
  wa_final: {
    en: "Hi{name}, we won't disturb you further. Whenever you're ready, just message us here — {business} 🙏",
    hi: "नमस्ते{name}, हम आपको और परेशान नहीं करेंगे। जब भी तैयार हों, यहीं मैसेज करें — {business} 🙏",
    gu: "નમસ્તે{name}, અમે તમને વધુ હેરાન નહીં કરીએ. જ્યારે પણ તૈયાર હો, અહીં મેસેજ કરજો — {business} 🙏",
    hi_latn: "Namaste{name}, hum aapko aur pareshaan nahi karenge. Jab bhi ready hon, yahin message karein — {business} 🙏",
    gu_latn: "Namaste{name}, ame tamne vadhu heraan nahi kariye. Jyare pan taiyaar ho, ahiya message karjo — {business} 🙏",
  },
  wa_booking_reminder: {
    en: "Reminder: your {bookingKind} at {business} is on {when}. 📍 {address}. Reply 1 to confirm or 2 to reschedule.",
    hi: "याद दिलाना: {business} में आपका {bookingKind} {when} को है। 📍 {address}। कन्फ़र्म के लिए 1, बदलने के लिए 2 लिखें।",
    gu: "યાદ અપાવીએ: {business} માં તમારું {bookingKind} {when} એ છે. 📍 {address}. કન્ફર્મ માટે 1, બદલવા માટે 2 લખો.",
    hi_latn: "Reminder: {business} mein aapka {bookingKind} {when} ko hai. 📍 {address}. Confirm ke liye 1, badalne ke liye 2 likhiye.",
    gu_latn: "Reminder: {business} ma tamaru {bookingKind} {when} e che. 📍 {address}. Confirm mate 1, badalva mate 2 lakho.",
  },
  opt_out: {
    en: "You're unsubscribed and won't receive further messages from {business}. Reply START anytime to resume.",
    hi: "आपको अनसब्सक्राइब कर दिया गया है, {business} से अब कोई मैसेज नहीं आएगा। दोबारा शुरू करने के लिए START लिखें।",
    gu: "તમને અનસબ્સ્ક્રાઇબ કરી દીધા છે, {business} તરફથી હવે કોઈ મેસેજ નહીં આવે. ફરી શરૂ કરવા START લખો.",
    hi_latn: "Aapko unsubscribe kar diya gaya hai, {business} se ab koi message nahi aayega. Dobara shuru karne ke liye START likhiye.",
    gu_latn: "Tamne unsubscribe kari didha che, {business} taraf thi have koi message nahi aave. Fari sharu karva START lakho.",
  },
  opt_in: {
    en: "Welcome back! How can {business} help you?",
    hi: "वापसी पर स्वागत है! {business} आपकी क्या मदद कर सकता है?",
    gu: "ફરી સ્વાગત છે! {business} તમારી શું મદદ કરી શકે?",
    hi_latn: "Wapas swagat hai! {business} aapki kya madad kar sakta hai?",
    gu_latn: "Fari swagat che! {business} tamari shu madad kari shake?",
  },
  greeting: {
    en: "Namaste! 🙏 Thanks for reaching {business}. {question}",
    hi: "नमस्ते! 🙏 {business} से जुड़ने के लिए धन्यवाद। {question}",
    gu: "નમસ્તે! 🙏 {business} નો સંપર્ક કરવા બદલ આભાર. {question}",
    hi_latn: "Namaste! 🙏 {business} se judne ke liye dhanyavaad. {question}",
    gu_latn: "Namaste! 🙏 {business} no sampark karva badal aabhar. {question}",
  },
  ack_next: {
    en: "Got it 👍 {question}",
    hi: "समझ गए 👍 {question}",
    gu: "સમજી ગયા 👍 {question}",
    hi_latn: "Samajh gaye 👍 {question}",
    gu_latn: "Samji gaya 👍 {question}",
  },
  pricing: {
    en: "{priceNote} {question}",
    hi: "{priceNote} {question}",
    gu: "{priceNote} {question}",
    hi_latn: "{priceNote} {question}",
    gu_latn: "{priceNote} {question}",
  },
  offer_booking: {
    en: "Perfect, I have everything I need. Shall I book your {bookingKind}? We have {slotA} or {slotB} — which works?",
    hi: "बढ़िया, सारी जानकारी मिल गई। क्या मैं आपका {bookingKind} बुक कर दूँ? {slotA} या {slotB} — कौन सा ठीक रहेगा?",
    gu: "સરસ, બધી માહિતી મળી ગઈ. શું હું તમારું {bookingKind} બુક કરી દઉં? {slotA} કે {slotB} — કયું ફાવશે?",
    hi_latn: "Badhiya, saari jaankari mil gayi. Kya main aapka {bookingKind} book kar doon? {slotA} ya {slotB} — kaunsa theek rahega?",
    gu_latn: "Saras, badhi mahiti mali gai. Shu hu tamaru {bookingKind} book kari dau? {slotA} ke {slotB} — kayu faavse?",
  },
  booking_confirmed: {
    en: "Done ✅ Your {bookingKind} is booked for {when}. 📍 {address}. We'll send a reminder before.",
    hi: "हो गया ✅ आपका {bookingKind} {when} के लिए बुक है। 📍 {address}। पहले रिमाइंडर भेज देंगे।",
    gu: "થઈ ગયું ✅ તમારું {bookingKind} {when} માટે બુક છે. 📍 {address}. પહેલાં રિમાઇન્ડર મોકલીશું.",
    hi_latn: "Ho gaya ✅ Aapka {bookingKind} {when} ke liye book hai. 📍 {address}. Pehle reminder bhej denge.",
    gu_latn: "Thai gayu ✅ Tamaru {bookingKind} {when} mate book che. 📍 {address}. Pehla reminder mokalishu.",
  },
  ask_time: {
    en: "Which day and time suits you for the {bookingKind}?",
    hi: "{bookingKind} के लिए कौन सा दिन और समय ठीक रहेगा?",
    gu: "{bookingKind} માટે કયો દિવસ અને સમય ફાવશે?",
    hi_latn: "{bookingKind} ke liye kaunsa din aur samay theek rahega?",
    gu_latn: "{bookingKind} mate kayo divas ane samay faavse?",
  },
  location: {
    en: "We're at 📍 {address}. {question}",
    hi: "हमारा पता 📍 {address}। {question}",
    gu: "અમારું સરનામું 📍 {address}. {question}",
    hi_latn: "Hamara pata 📍 {address}. {question}",
    gu_latn: "Amaru sarnamu 📍 {address}. {question}",
  },
  handoff: {
    en: "Sure — I'm connecting you with {owner}. You'll get a call shortly 📞",
    hi: "ज़रूर — मैं आपको {owner} से जोड़ रहा हूँ। जल्द ही कॉल आएगा 📞",
    gu: "ચોક્કસ — હું તમને {owner} સાથે જોડું છું. થોડી વારમાં કૉલ આવશે 📞",
    hi_latn: "Zaroor — main aapko {owner} se jod raha hoon. Jaldi hi call aayega 📞",
    gu_latn: "Chokkas — hu tamne {owner} sathe jodu chu. Thodi vaar ma call aavse 📞",
  },
  not_interested: {
    en: "No problem at all 🙏 If you need anything later, just message us here.",
    hi: "कोई बात नहीं 🙏 बाद में कुछ चाहिए हो तो यहीं मैसेज कर दीजिए।",
    gu: "કોઈ વાંધો નહીં 🙏 પછી કંઈ જરૂર હોય તો અહીં મેસેજ કરજો.",
    hi_latn: "Koi baat nahi 🙏 Baad mein kuch chahiye ho to yahin message kar dijiye.",
    gu_latn: "Koi vandho nahi 🙏 Pachhi kai jarur hoy to ahiya message karjo.",
  },
  thanks: {
    en: "Happy to help! 😊 See you soon at {business}.",
    hi: "मदद करके खुशी हुई! 😊 जल्द मिलते हैं {business} में।",
    gu: "મદદ કરીને આનંદ થયો! 😊 જલ્દી મળીએ {business} માં.",
    hi_latn: "Madad karke khushi hui! 😊 Jaldi milte hain {business} mein.",
    gu_latn: "Madad kari ne aanand thayo! 😊 Jaldi maliye {business} ma.",
  },
  cancelled: {
    en: "Okay, your {bookingKind} is cancelled. Want to pick another time?",
    hi: "ठीक है, आपका {bookingKind} कैंसल कर दिया। कोई और समय चुनना चाहेंगे?",
    gu: "ઠીક છે, તમારું {bookingKind} કેન્સલ કર્યું. બીજો સમય પસંદ કરવો છે?",
    hi_latn: "Theek hai, aapka {bookingKind} cancel kar diya. Koi aur samay chunna chahenge?",
    gu_latn: "Thik che, tamaru {bookingKind} cancel karyu. Bijo samay pasand karvo che?",
  },
  complaint: {
    en: "I'm really sorry about that 🙏 I've flagged this to {owner} who will personally call you.",
    hi: "इसके लिए हमें सच में खेद है 🙏 मैंने {owner} को बता दिया है, वे खुद आपको कॉल करेंगे।",
    gu: "આ માટે અમને ખરેખર દિલગીરી છે 🙏 મેં {owner} ને જણાવ્યું છે, તેઓ જાતે તમને કૉલ કરશે.",
    hi_latn: "Iske liye humein sach mein khed hai 🙏 Maine {owner} ko bata diya hai, woh khud aapko call karenge.",
    gu_latn: "Aa mate amne kharekhar dilgiri che 🙏 Me {owner} ne janavyu che, teo jaate tamne call karshe.",
  },
  nudge: {
    en: "Just checking in{name} 🙂 {question}",
    hi: "बस हाल-चाल पूछ रहे थे{name} 🙂 {question}",
    gu: "બસ પૂછી રહ્યા હતા{name} 🙂 {question}",
    hi_latn: "Bas haal-chaal pooch rahe the{name} 🙂 {question}",
    gu_latn: "Bas puchhi rahya hata{name} 🙂 {question}",
  },
  after_hours: {
    en: "(We're closed right now, but I can help you book — our team confirms first thing in the morning.)",
    hi: "(अभी हम बंद हैं, पर मैं बुकिंग में मदद कर सकता हूँ — टीम सुबह कन्फ़र्म करेगी।)",
    gu: "(અત્યારે અમે બંધ છીએ, પણ હું બુકિંગમાં મદદ કરી શકું — ટીમ સવારે કન્ફર્મ કરશે.)",
    hi_latn: "(Abhi hum band hain, par main booking mein madad kar sakta hoon — team subah confirm karegi.)",
    gu_latn: "(Atyare ame band chhiye, pan hu booking ma madad kari shaku — team savare confirm karshe.)",
  },
};

export function render(key: keyof typeof TEMPLATES | string, variant: Variant, vars: Record<string, string | number> = {}): string {
  const entry = TEMPLATES[key];
  if (!entry) throw new Error(`Unknown template ${key}`);
  const text = entry[variant] ?? entry.en;
  return text.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] !== undefined ? String(vars[k]) : "")).replace(/\s+([.!?।])/g, "$1").trim();
}

/** Category used for WhatsApp per-message pricing of each approved template. */
export const WA_TEMPLATE_CATEGORY: Record<string, "utility" | "marketing"> = {
  wa_missed_call: "utility",
  wa_enquiry: "utility",
  wa_followup: "marketing",
  wa_final: "marketing",
  wa_booking_reminder: "utility",
};
