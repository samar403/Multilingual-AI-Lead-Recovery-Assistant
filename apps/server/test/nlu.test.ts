import { describe, expect, it } from "vitest";
import { detectIntent, extractBhk, extractBudget, extractDateTime, extractGrade, extractLocality, extractName } from "../src/ai/nlu.js";
import { istParts } from "../src/lib/time.js";
import { T0 } from "./helpers.js";

describe("intents", () => {
  it.each([
    ["STOP", "opt_out"],
    ["મેસેજ બંધ કરો", "opt_out"],
    ["बंद करो", "opt_out"],
    ["kitna fees hai?", "pricing"],
    ["ફી કેટલી છે?", "pricing"],
    ["please call me", "human"],
    ["already joined another institute, no need", "not_interested"],
    ["આપનું સરનામું ક્યાં છે?", "location"],
    ["kem cho", "greeting"],
    ["Hi, NEET ke liye coaching chahiye, beta 12th mein hai", "inquiry"],
    ["refund chahiye, worst service", "complaint"],
  ])("%s → %s", (text, intent) => expect(detectIntent(text)).toBe(intent));
});

describe("slot extractors", () => {
  it("parses Indian budgets in any script", () => {
    expect(extractBudget("budget 50 lakh")?.rupees).toBe(5_000_000);
    expect(extractBudget("2 BHK nu budget ૫૦ લાખ che")?.rupees).toBe(5_000_000);
    expect(extractBudget("1.2 cr tak")?.rupees).toBe(12_000_000);
    expect(extractBudget("किराया 18 हजार")?.rupees).toBe(18_000);
    expect(extractBudget("rent 25k")?.label).toBe("₹25,000");
    expect(extractBudget("call 9876543210")).toBeUndefined();
    expect(extractBudget("2 bhk")).toBeUndefined();
  });

  it("parses BHK", () => {
    expect(extractBhk("looking for 3bhk flat")).toBe("3 BHK");
    expect(extractBhk("be bhk joie che")).toBe("2 BHK");
    expect(extractBhk("2 બીએચકે")).toBe("2 BHK");
  });

  it("parses class / std", () => {
    expect(extractGrade("ધોરણ 11 માં છે")).toBe("Std 11");
    expect(extractGrade("beta 12th mein hai")).toBe("Std 12");
    expect(extractGrade("कक्षा 9")).toBe("Std 9");
    expect(extractGrade("dropper batch")).toBe("Dropper");
  });

  it("parses relative dates and times in IST", () => {
    const tomorrowEvening = extractDateTime("kal shaam 5 baje", T0)!;
    const p = istParts(tomorrowEvening);
    expect([p.day, p.hour, p.minute]).toEqual([21, 17, 0]);

    const gu = istParts(extractDateTime("કાલે સવારે 11 વાગ્યે", T0)!);
    expect([gu.day, gu.hour]).toEqual([21, 11]);

    const sat = istParts(extractDateTime("Saturday 11am", T0)!);
    expect([sat.weekday, sat.hour]).toEqual([6, 11]);

    expect(extractDateTime("JEE coaching chahiye", T0)).toBeUndefined();
  });

  it("matches localities with native-script aliases", () => {
    const locs = ["Satellite|સેટેલાઇટ|सैटेलाइट", "Bopal|બોપલ"];
    expect(extractLocality("બોપલ માં જોઈએ", locs)).toBe("Bopal");
    expect(extractLocality("near satellite", locs)).toBe("Satellite");
  });

  it("picks up names", () => {
    expect(extractName("Hi, my name is riya shah")).toBe("Riya Shah");
    expect(extractName("mera naam Amit hai")).toBe("Amit");
  });
});
