"use client";

import { useEffect, useRef } from "react";

const DEFAULT_PUBLIC_REFRESH_INTERVAL_MS = 60_000;

type UseAutoRefreshOptions = {
  enabled?: boolean;
  intervalMs?: number;
};

export function useAutoRefresh(
  refresh: () => void | Promise<void>,
  {
    enabled = true,
    intervalMs = DEFAULT_PUBLIC_REFRESH_INTERVAL_MS,
  }: UseAutoRefreshOptions = {},
) {
  const refreshRef = useRef(refresh);
  const runningRef = useRef(false);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!enabled || intervalMs <= 0) {
      return undefined;
    }

    const run = async () => {
      if (runningRef.current) {
        return;
      }
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      runningRef.current = true;
      try {
        await refreshRef.current();
      } finally {
        runningRef.current = false;
      }
    };

    const intervalId = window.setInterval(() => {
      void run();
    }, intervalMs);

    return () => window.clearInterval(intervalId);
  }, [enabled, intervalMs]);
}

export function formatLastUpdated(value?: Date | null): string {
  if (!value) {
    return "Última actualización: pendiente";
  }
  const diffSeconds = Math.max(0, Math.round((Date.now() - value.getTime()) / 1000));
  if (diffSeconds < 15) {
    return "Última actualización: hace unos segundos";
  }
  if (diffSeconds < 60) {
    return `Última actualización: hace ${diffSeconds} segundos`;
  }
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `Última actualización: hace ${diffMinutes} min`;
  }
  return `Última actualización: ${value.toLocaleString("es", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  })}`;
}
