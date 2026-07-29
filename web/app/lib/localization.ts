import type { Language } from "./dictionaries";

const MYANMAR_CHARACTER = /[\u1000-\u109f]/u;

const REGION_NAMES: Record<string, { en: string; my: string }> = {
  ayeyawaddy: { en: "Ayeyawaddy", my: "ဧရာဝတီတိုင်း" },
  sagaing: { en: "Sagaing", my: "စစ်ကိုင်းတိုင်း" },
  mandalay: { en: "Mandalay", my: "မန္တလေးတိုင်း" },
  bago: { en: "Bago", my: "ပဲခူးတိုင်း" },
  magway: { en: "Magway", my: "မကွေးတိုင်း" },
};

export function normalizeLanguage(value: string | null | undefined): Language {
  return value === "en" ? "en" : "my";
}

export function localizeRegion(value: string, lang: Language): string {
  const key = value.trim().toLowerCase().replace(/\s+/g, "_");
  return REGION_NAMES[key]?.[lang] ?? value;
}

export function localizeBilingualLabel(value: string, lang: Language): string {
  const parts = value.split(/\s*·\s*/u).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return value;
  return lang === "my" ? parts.slice(1).join(" · ") : parts[0];
}

export function localizeBilingualNarrative(value: string, lang: Language): string {
  const firstMyanmarCharacter = value.search(MYANMAR_CHARACTER);
  if (firstMyanmarCharacter < 0) return value.trim();
  if (lang === "my") return value.slice(firstMyanmarCharacter).trim();
  return value.slice(0, firstMyanmarCharacter).trim();
}

export function localizeFactor(value: string, lang: Language): string {
  const separator = value.indexOf("·");
  if (separator < 0) return localizeBilingualNarrative(value, lang);

  const colon = value.indexOf(":", separator);
  const suffix = colon >= 0 ? value.slice(colon) : "";
  const label =
    lang === "my"
      ? value.slice(separator + 1, colon >= 0 ? colon : undefined).trim()
      : value.slice(0, separator).trim();
  return `${label}${suffix}`;
}

export function localizeUnit(unit: string, lang: Language): string {
  if (lang === "en") return unit;
  const units: Record<string, string> = {
    degrees: "ဒီဂရီ",
    index: "ညွှန်းကိန်း",
    "score 0–100": "အမှတ် 0–100",
  };
  return units[unit] ?? unit;
}
