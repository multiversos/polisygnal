"use client";

export const DEFAULT_API_BASE_URL =
  process.env.NODE_ENV === "production"
    ? "https://polisygnal.onrender.com"
    : "http://127.0.0.1:8000";

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/$/, "");

export const API_HOST_LABEL = (() => {
  try {
    return new URL(API_BASE_URL).host;
  } catch {
    return API_BASE_URL;
  }
})();

export const DEFAULT_REQUEST_TIMEOUT_MS = 10000;

const SAFE_PROXY_GET_PREFIXES = [
  "/alerts",
  "/backtesting",
  "/briefing",
  "/dashboard",
  "/data-health",
  "/decisions",
  "/external-signals",
  "/health",
  "/investigation-status",
  "/manual-evidence",
  "/markets",
  "/outcomes",
  "/research",
  "/sources",
  "/tags",
  "/watchlist",
];

export class ApiRequestError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

function normalizeBackendPath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function backendPathname(path: string): string {
  try {
    return new URL(path, API_BASE_URL).pathname;
  } catch {
    return normalizeBackendPath(path).split("?")[0] || "/";
  }
}

function isSafeProxyGetPath(path: string): boolean {
  const pathname = backendPathname(path);
  return SAFE_PROXY_GET_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function shouldUseSameOriginProxy(path: string, init?: RequestInit): boolean {
  const method = (init?.method || "GET").toUpperCase();
  return (
    typeof window !== "undefined" &&
    method === "GET" &&
    isSafeProxyGetPath(path)
  );
}

export function buildBackendApiPath(path: string): string {
  return `/api/backend${normalizeBackendPath(path)}`;
}

export function buildBackendDirectUrl(path: string): string {
  return `${API_BASE_URL}${normalizeBackendPath(path)}`;
}

export async function fetchApiJson<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const requestUrl = shouldUseSameOriginProxy(path, init)
      ? buildBackendApiPath(path)
      : buildBackendDirectUrl(path);
    const response = await fetch(requestUrl, {
      cache: "no-store",
      ...init,
      signal: controller.signal,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });

    if (!response.ok) {
      throw new ApiRequestError(`${path} responded ${response.status}`, response.status);
    }
    if (response.status === 204) {
      return null as T;
    }
    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiRequestError(`${path} timed out after ${timeoutMs / 1000}s`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function isApiNotFoundError(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
}

export function friendlyApiError(error: unknown, moduleName: string): string {
  if (isApiNotFoundError(error)) {
    return `Este modulo (${moduleName}) se conectara en un sprint posterior.`;
  }
  if (error instanceof ApiRequestError) {
    return `La API no respondio correctamente desde ${API_HOST_LABEL}. Reintentar.`;
  }
  if (error instanceof Error) {
    return `La API no respondio desde ${API_HOST_LABEL}. Reintentar.`;
  }
  return `No hay datos cargados todavia para ${moduleName}.`;
}
