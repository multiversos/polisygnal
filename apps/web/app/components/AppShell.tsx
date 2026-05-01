"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

type ThemePreference = "light" | "dark";
type NavIconName =
  | "dashboard"
  | "sports"
  | "briefing"
  | "research"
  | "evidence"
  | "watchlist"
  | "decisions"
  | "workflow"
  | "alerts"
  | "matches"
  | "sources"
  | "data"
  | "trial"
  | "backtesting";

const THEME_STORAGE_KEY = "polysignal-theme";

const navigationItems: Array<{
  label: string;
  href: string;
  icon: NavIconName;
}> = [
  { label: "Dashboard", href: "/", icon: "dashboard" },
  { label: "Deportes", href: "/sports", icon: "sports" },
  { label: "Briefing diario", href: "/briefing", icon: "briefing" },
  { label: "Investigacion", href: "/research", icon: "research" },
  { label: "Evidencia", href: "/evidence", icon: "evidence" },
  { label: "Mi seguimiento", href: "/#mi-seguimiento", icon: "watchlist" },
  { label: "Decisiones", href: "/decisions", icon: "decisions" },
  { label: "Workflow", href: "/workflow", icon: "workflow" },
  { label: "Alertas", href: "/alerts", icon: "alerts" },
  { label: "Coincidencias Kalshi", href: "/external-signals/matches", icon: "matches" },
  { label: "Calidad de fuentes", href: "/sources", icon: "sources" },
  { label: "Salud de datos", href: "/data-health", icon: "data" },
  { label: "Trial E2E", href: "/trials/e2e", icon: "trial" },
  { label: "Backtesting", href: "/backtesting", icon: "backtesting" },
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

export function AppShell({ children }: { children: ReactNode }) {
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
        // Theme still updates even when localStorage is unavailable.
      }
      return nextTheme;
    });
  };

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="Navegacion principal">
        <Link className="app-logo" href="/" aria-label="Ir al dashboard de PolySignal">
          <img src="/brand/polysignal-logo-option5.svg" alt="PolySignal" />
        </Link>
        <nav className="app-nav">
          {navigationItems.map((item) => (
            <Link
              aria-current={isActivePath(pathname, item.href) ? "page" : undefined}
              className={`app-nav-item ${isActivePath(pathname, item.href) ? "active" : ""}`}
              href={item.href}
              key={item.href}
            >
              <NavIcon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <button
          aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          className="theme-toggle app-theme-toggle"
          onClick={toggleTheme}
          type="button"
        >
          <NavIcon name={theme === "dark" ? "dashboard" : "trial"} />
          {theme === "dark" ? "Modo claro" : "Modo oscuro"}
        </button>
      </aside>

      <section className="app-workspace">
        <header className="app-header">
          <div className="app-header-title">
            <img src="/brand/polysignal-icon-option5.svg" alt="" aria-hidden="true" />
            <div>
              <span>PolySignal</span>
              <strong>Mercados proximos y datos operativos</strong>
            </div>
          </div>
        </header>
        <div className="app-main">{children}</div>
      </section>
    </div>
  );
}

function NavIcon({ name }: { name: NavIconName }) {
  const commonProps = {
    "aria-hidden": true,
    className: "app-nav-icon",
    fill: "none",
    viewBox: "0 0 24 24",
    xmlns: "http://www.w3.org/2000/svg",
  };
  switch (name) {
    case "dashboard":
      return (
        <svg {...commonProps}>
          <path d="M4 13h6V5H4v8Zm10 6h6V5h-6v14ZM4 19h6v-3H4v3Z" />
        </svg>
      );
    case "sports":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="8" />
          <path d="M5 10c4 1 8 1 14 0M8 5c2 5 2 9 0 14M16 5c-2 5-2 9 0 14" />
        </svg>
      );
    case "briefing":
      return (
        <svg {...commonProps}>
          <path d="M6 4h10l2 2v14H6V4Zm3 5h6M9 13h6M9 17h4" />
        </svg>
      );
    case "research":
      return (
        <svg {...commonProps}>
          <circle cx="10" cy="10" r="5" />
          <path d="m14 14 5 5M8 10h4" />
        </svg>
      );
    case "evidence":
      return (
        <svg {...commonProps}>
          <path d="M6 4h12v16H6V4Zm3 5h6M9 13h4M9 17h3M15 16l1 1 2-3" />
        </svg>
      );
    case "watchlist":
      return (
        <svg {...commonProps}>
          <path d="m12 4 2.4 5 5.6.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.6-.8L12 4Z" />
        </svg>
      );
    case "decisions":
      return (
        <svg {...commonProps}>
          <path d="M5 7h14M5 12h14M5 17h8M8 7l2 2 4-4M8 12l2 2 4-4" />
        </svg>
      );
    case "workflow":
      return (
        <svg {...commonProps}>
          <path d="M4 5h5v14H4V5Zm7 0h4v14h-4V5Zm6 0h3v14h-3V5Z" />
        </svg>
      );
    case "alerts":
      return (
        <svg {...commonProps}>
          <path d="M12 4 3 20h18L12 4Zm0 6v4m0 3h.01" />
        </svg>
      );
    case "matches":
      return (
        <svg {...commonProps}>
          <path d="M8 8h8M8 16h8M7 12h10M5 5l14 14M19 5 5 19" />
        </svg>
      );
    case "sources":
      return (
        <svg {...commonProps}>
          <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Zm-3 9 2 2 4-5" />
        </svg>
      );
    case "data":
      return (
        <svg {...commonProps}>
          <path d="M4 7c0-2 16-2 16 0v10c0 2-16 2-16 0V7Zm0 5c0 2 16 2 16 0M4 7c0 2 16 2 16 0" />
        </svg>
      );
    case "trial":
      return (
        <svg {...commonProps}>
          <path d="M7 4h10M10 4v5l-5 9c-.8 1.4.2 2 1.4 2h11.2c1.2 0 2.2-.6 1.4-2l-5-9V4M8 15h8" />
        </svg>
      );
    case "backtesting":
      return (
        <svg {...commonProps}>
          <path d="M4 19V5m0 14h16M7 16l3-4 3 2 5-7" />
        </svg>
      );
    default:
      return null;
  }
}
