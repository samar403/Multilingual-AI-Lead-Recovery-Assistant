import { describe, expect, it } from "vitest";
import { detectLanguage, variantFor } from "../src/i18n/language.js";

describe("detectLanguage", () => {
  it.each([
    ["નમસ્તે, JEE માટે કોચિંગ જોઈએ છે", "gu", "native"],
    ["मुझे कॉमर्स के लिए कोचिंग चाहिए", "hi", "native"],
    ["kem cho, foundation course mate puchvu hatu", "gu", "latin"],
    ["NEET ke liye coaching chahiye, kitna fees hai?", "hi", "latin"],
    ["Hello, what are the fees for JEE?", "en", "latin"],
    ["2 BHK nu budget 50 lakh che", "gu", "latin"],
  ])("%s → %s/%s", (text, lang, script) => {
    const g = detectLanguage(text);
    expect(g.lang).toBe(lang);
    expect(g.script).toBe(script);
  });

  it("falls back when there is no signal", () => {
    expect(detectLanguage("👍", "gu").lang).toBe("gu");
  });

  it("maps to template variants", () => {
    expect(variantFor("gu", "latin")).toBe("gu_latn");
    expect(variantFor("hi", "native")).toBe("hi");
    expect(variantFor("en", "latin")).toBe("en");
  });
});
