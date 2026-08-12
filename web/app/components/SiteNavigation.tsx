"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useLanguage } from "../lib/i18n";
import { HarvestIcon } from "./HarvestIcon";

const navigationItems = [
  { href: "/macro", icon: "dataset" as const, key: "macro" },
  { href: "/climate", icon: "rain" as const, key: "climate" },
  { href: "/faq", icon: "info" as const, key: "faq" },
  { href: "/market", icon: "sprout" as const, key: "market" },
  { href: "/daily", icon: "calendar" as const, key: "daily" },
  { href: "/register", icon: "user" as const, key: "register" },
] as const;

export function SiteNavigation() {
  const { lang, t } = useLanguage();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const labels = {
    macro: t.dashboard.macroLink,
    climate: t.dashboard.climateLink,
    faq: t.dashboard.faqLink,
    market: lang === "my" ? "ဈေးကွက်ဈေးနှုန်း" : "Market prices",
    daily: lang === "my" ? "အပတ်စဉ်မြေပုံ" : "Weekly map",
    register: lang === "my" ? "အကောင့်ဖွင့်ရန်" : "Register",
  };

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  }, []);

  const openOnHover = () => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
    setOpen(true);
  };

  const closeAfterHover = () => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 140);
  };

  return (
    <div
      className="site-navigation"
      ref={rootRef}
      onMouseEnter={openOnHover}
      onMouseLeave={closeAfterHover}
    >
      <button
        ref={buttonRef}
        type="button"
        className="site-navigation__trigger"
        aria-label={open
          ? (lang === "my" ? "စာမျက်နှာစာရင်းကို ပိတ်ရန်" : "Close page navigation")
          : (lang === "my" ? "စာမျက်နှာများကို ဖွင့်ရန်" : "Open page navigation")}
        aria-controls="site-navigation-menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <HarvestIcon name="cells" size={20} />
        <span className="sr-only">{lang === "my" ? "စာမျက်နှာများ" : "Menu"}</span>
      </button>

      {open && (
        <nav
          id="site-navigation-menu"
          className="site-navigation__menu"
          aria-label={lang === "my" ? "အဓိကစာမျက်နှာများ" : "Main pages"}
        >
          <div className="site-navigation__links">
            {navigationItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? "is-active" : undefined}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  <i aria-hidden="true"><HarvestIcon name={item.icon} size={19} /></i>
                  <span>{labels[item.key]}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
