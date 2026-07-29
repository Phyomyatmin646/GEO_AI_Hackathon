"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { dictionaries, Language, Dictionary } from "./dictionaries";
import { normalizeLanguage } from "./localization";

type LanguageContextType = {
  lang: Language;
  setLang: (lang: Language) => void;
  t: Dictionary;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);
const STORAGE_KEY = "myay-language";
const listeners = new Set<() => void>();
let currentLanguage: Language = "my";

function readStoredLanguage(): Language {
  if (typeof window === "undefined") return "my";
  try {
    currentLanguage = normalizeLanguage(
      window.localStorage.getItem(STORAGE_KEY),
    );
  } catch {
    // Keep the in-memory preference when storage is unavailable.
  }
  return currentLanguage;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    currentLanguage = normalizeLanguage(event.newValue);
    listener();
  };
  window.addEventListener("storage", handleStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

function getServerLanguage(): Language {
  return "my";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(
    subscribe,
    readStoredLanguage,
    getServerLanguage,
  );
  const setPersistedLanguage = useCallback((nextLanguage: Language) => {
    currentLanguage = nextLanguage;
    try {
      window.localStorage.setItem(STORAGE_KEY, nextLanguage);
    } catch {
      // Language switching remains available when storage is unavailable.
    }
    document.documentElement.lang = nextLanguage;
    listeners.forEach((listener) => listener());
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <LanguageContext.Provider
      value={{ lang, setLang: setPersistedLanguage, t: dictionaries[lang] }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
