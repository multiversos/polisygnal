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
  path?: string;
  status?: number;

  constructor(message: string, status?: number, path?: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.path = path;
  }
}

function normalizeBackendPath(path: string): string {
  try {
    const url = new URL(path);
    return `${url.pathname}${url.search}`;
  } catch {
    // Keep handling relative paths below.
  }
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
  try {
    return new URL(path).toString();
  } catch {
    // Relative backend paths are joined to the configured API host.
  }
  return `${API_BASE_URL}${normalizeBackendPath(path)}`;
}

function buildRequestHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

export async function fetchApiJson<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  const requestUrl = shouldUseSameOriginProxy(path, init)
    ? buildBackendApiPath(path)
    : buildBackendDirectUrl(path);

  try {
    const response = await fetch(requestUrl, {
      cache: "no-store",
      next: { revalidate: 0 },
      ...init,
      signal: controller.signal,
      headers: buildRequestHeaders(init),
    } as RequestInit & { next: { revalidate: number } });

    if (!response.ok) {
      throw new ApiRequestError(`${path} responded ${response.status}`, response.status, path);
    }
    if (response.status === 204) {
      return null as T;
    }
    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiRequestError(`${path} timed out after ${timeoutMs / 1000}s`, undefined, path);
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export function isApiNotFoundError(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
}

export function friendlyApiError(error: unknown, moduleName: string): string {
  if (isApiNotFoundError(error)) {
    return `Este módulo (${moduleName}) se conectará en un sprint posterior.`;
  }
  if (error instanceof ApiRequestError) {
    const status = error.status ? ` (HTTP ${error.status})` : "";
    return `No pudimos actualizar los datos ahora${status}. Reintentar.`;
  }
  if (error instanceof Error) {
    return "No pudimos actualizar los datos ahora. Reintentar.";
  }
  return `No hay datos cargados todavía para ${moduleName}.`;
}
