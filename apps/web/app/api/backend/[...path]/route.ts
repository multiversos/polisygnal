const DEFAULT_BACKEND_BASE_URL = "https://polisygnal.onrender.com";
const REQUEST_TIMEOUT_MS = 15000;
const MAX_PROXY_QUERY_LENGTH = 1800;
const SAFE_RESPONSE_CONTENT_TYPES = ["application/json", "text/plain"];

const SAFE_GET_PREFIXES = [
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

type RouteContext = {
  params: Promise<{
    path?: string[];
  }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

function backendBaseUrl(): string {
  const configured = (process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_BACKEND_BASE_URL).replace(/\/$/, "");
  try {
    const parsed = new URL(configured);
    if (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      !parsed.username &&
      !parsed.password
    ) {
      return configured;
    }
  } catch {
    // Fall through to the production backend.
  }
  return DEFAULT_BACKEND_BASE_URL;
}

function proxyErrorResponse(status: number, diagnostic: string): Response {
  const error =
    status === 414 ? "request_too_large" : status === 404 ? "not_found" : "temporary_unavailable";
  return Response.json(
    { error },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-PolySignal-Proxy": "enabled",
        "X-PolySignal-Proxy-Error": diagnostic,
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

function methodNotAllowed(): Response {
  return Response.json(
    { error: "method_not_allowed" },
    {
      status: 405,
      headers: {
        Allow: "GET",
        "Cache-Control": "no-store",
        "X-PolySignal-Proxy": "enabled",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

function buildBackendPath(pathSegments: string[]): string | null {
  if (pathSegments.length === 0) {
    return null;
  }
  if (
    pathSegments.some(
      (segment) => !segment || segment === "." || segment === ".." || /[\\/]/.test(segment),
    )
  ) {
    return null;
  }
  return `/${pathSegments.map((segment) => encodeURIComponent(segment)).join("/")}`;
}

function isAllowedBackendPath(pathname: string): boolean {
  return SAFE_GET_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isSafeResponseContentType(contentType: string | null): boolean {
  if (!contentType) {
    return true;
  }
  const normalized = contentType.toLowerCase();
  return SAFE_RESPONSE_CONTENT_TYPES.some((allowed) => normalized.includes(allowed));
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { path = [] } = await context.params;
  const backendPath = buildBackendPath(path);
  if (!backendPath || !isAllowedBackendPath(backendPath)) {
    return proxyErrorResponse(404, "route_not_allowed");
  }

  const incomingUrl = new URL(request.url);
  if (incomingUrl.search.length > MAX_PROXY_QUERY_LENGTH) {
    return proxyErrorResponse(414, "query_too_large");
  }
  const targetUrl = new URL(`${backendBaseUrl()}${backendPath}`);
  targetUrl.search = incomingUrl.search;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstream = await fetch(targetUrl, {
      cache: "no-store",
      next: { revalidate: 0 },
      headers: {
        Accept: "application/json",
        "User-Agent": "PolySignal Web API proxy",
      },
      method: "GET",
      signal: controller.signal,
    } as RequestInit & { next: { revalidate: number } });
    const body = await upstream.text();
    const contentType = upstream.headers.get("content-type");
    if (!isSafeResponseContentType(contentType)) {
      return proxyErrorResponse(502, "unexpected_content_type");
    }
    if (!upstream.ok) {
      const safeStatus =
        upstream.status === 404
          ? 404
          : upstream.status === 414
            ? 414
            : upstream.status === 504
              ? 504
              : upstream.status >= 500
                ? 502
                : upstream.status;
      return proxyErrorResponse(
        safeStatus,
        upstream.status === 504
          ? "upstream_timeout"
          : upstream.status >= 500
            ? "upstream_unavailable"
            : "upstream_rejected",
      );
    }
    return new Response(body, {
      status: upstream.status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": contentType || "application/json",
        "X-PolySignal-Proxy": "enabled",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return proxyErrorResponse(
      error instanceof Error && error.name === "AbortError" ? 504 : 502,
      error instanceof Error && error.name === "AbortError"
        ? "proxy_timeout"
        : "proxy_fetch_failed",
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export function POST(): Response {
  return methodNotAllowed();
}

export function PUT(): Response {
  return methodNotAllowed();
}

export function PATCH(): Response {
  return methodNotAllowed();
}

export function DELETE(): Response {
  return methodNotAllowed();
}
