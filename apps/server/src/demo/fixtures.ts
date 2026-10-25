import type { Tenant, TenantSettings, Vertical } from "../types.js";
import { defaultSettings } from "../services/store.js";

const AHMEDABAD = [
  "Satellite|સેટેલાઇટ|सैटेलाइट",
  "Bopal|બોપલ|बोपल",
  "Prahlad Nagar|prahladnagar|પ્રહલાદનગર|प्रहलादनगर",
  "Vastrapur|વસ્ત્રાપુર|वस्त्रापुर",
  "SG Highway|s g highway|એસજી હાઇવે|एसजी हाईवे",
  "Gota|ગોતા|गोता",
  "Maninagar|મણિનગર|मणिनगर",
  "Chandkheda|ચાંદખેડા|चांदखेडा",
  "Shela|શેલા|शेला",
  "Navrangpura|નવરંગપુરા|नवरंगपुरा",
];
const SURAT = ["Adajan|અડાજણ|अडाजन", "Vesu|વેસુ|वेसु", "Varachha|વરાછા|वराछा", "Pal|પાલ|पाल", "Athwa|અઠવા|अठवा", "Katargam|કતારગામ|कतारगाम", "Piplod|પીપલોદ|पिपलोद"];
const VADODARA = ["Alkapuri|અલકાપુરી|अलकापुरी", "Gotri|ગોત્રી|गोत्री", "Akota|અકોટા|अकोटा", "Manjalpur|માંજલપુર|मांजलपुर", "Karelibaug|કારેલીબાગ|कारेलीबाग", "Vasna|વાસણા|वासना"];

export const DEMO_BUSINESSES: Record<Vertical, { name: string; city: string; phone: string; settings: Partial<TenantSettings> }> = {
  coaching: {
    name: "Shiksha Academy",
    city: "Ahmedabad",
    phone: "+917940001234",
    settings: { address: "3rd floor, Shivalik Plaza, Satellite, Ahmedabad", localities: AHMEDABAD, ownerPhone: "+919825000111" },
  },
  real_estate: {
    name: "Sabarmati Realty",
    city: "Ahmedabad",
    phone: "+917940005678",
    settings: { address: "Iscon Elegance, SG Highway, Ahmedabad", localities: AHMEDABAD, ownerPhone: "+919825000222" },
  },
  salon: {
    name: "Glow Studio",
    city: "Surat",
    phone: "+912612223344",
    settings: { address: "Ground floor, Rajhans Point, Vesu, Surat", localities: SURAT, ownerPhone: "+919825000333" },
  },
  services: {
    name: "CoolCare Services",
    city: "Vadodara",
    phone: "+912652334455",
    settings: { address: "Race Course Road, Alkapuri, Vadodara", localities: VADODARA, ownerPhone: "+919825000444" },
  },
};

/** An in-memory tenant for the public playground (never persisted). */
export function playgroundTenant(vertical: Vertical): Tenant {
  const b = DEMO_BUSINESSES[vertical];
  return {
    id: `playground_${vertical}`,
    name: b.name,
    vertical,
    city: b.city,
    phone: b.phone,
    default_lang: "gu",
    plan: "growth",
    webhook_key: "",
    settings: { ...defaultSettings(vertical, b.city), ...b.settings, hours: { open: "09:00", close: "20:00", days: [0, 1, 2, 3, 4, 5, 6] } },
    created_at: new Date(0).toISOString(),
  };
}
