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

export class ApiRequestError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

export async function fetchApiJson<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
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
