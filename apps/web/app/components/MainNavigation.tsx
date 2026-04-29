"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type ThemePreference = "light" | "dark";

const THEME_STORAGE_KEY = "polysignal-theme";

const navigationItems = [
  { label: "Dashboard", href: "/" },
  { label: "Deportes", href: "/sports" },
  { label: "Briefing diario", href: "/briefing" },
  { label: "Investigacion", href: "/research" },
  { label: "Mi seguimiento", href: "/#mi-seguimiento" },
  { label: "Workflow", href: "/workflow" },
  { label: "Alertas", href: "/alerts" },
  { label: "Coincidencias Kalshi", href: "/external-signals/matches" },
  { label: "Calidad de fuentes", href: "/sources" },
  { label: "Salud de datos", href: "/data-health" },
  { label: "Backtesting", href: "/backtesting" },
];

function applyThemePreference(theme: ThemePreference) {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function resolveThemePreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "light";
  }
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === "dark" || storedTheme === "light") {
      return storedTheme;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  const cleanHref = href.split("#")[0];
  return cleanHref !== "/" && pathname.startsWith(cleanHref);
}

export function MainNavigation() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<ThemePreference>("light");

  useEffect(() => {
    const resolvedTheme = resolveThemePreference();
    setTheme(resolvedTheme);
    applyThemePreference(resolvedTheme);
  }, []);

  const toggleTheme = () => {
    setTheme((currentTheme) => {
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      applyThemePreference(nextTheme);
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      } catch {
        // The page can still switch theme if localStorage is unavailable.
      }
      return nextTheme;
    });
  };

  return (
    <nav className="main-navigation" aria-label="Navegacion principal">
      <Link className="main-navigation-brand" href="/">
        PolySignal
      </Link>
      <div className="main-navigation-links">
        {navigationItems.map((item) => (
          <Link
            aria-current={isActivePath(pathname, item.href) ? "page" : undefined}
            className={isActivePath(pathname, item.href) ? "active" : ""}
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        ))}
      </div>
      <button
        aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
        className="theme-toggle main-navigation-theme"
        onClick={toggleTheme}
        type="button"
      >
        {theme === "dark" ? "Modo claro" : "Modo oscuro"}
      </button>
    </nav>
  );
}
