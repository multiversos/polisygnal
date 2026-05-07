const DEFAULT_BACKEND_BASE_URL = "https://polisygnal.onrender.com";
const REQUEST_TIMEOUT_MS = 10000;

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
  return (process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_BACKEND_BASE_URL).replace(/\/$/, "");
}

function jsonResponse(payload: object, status: number): Response {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-PolySignal-Proxy": "enabled",
    },
  });
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

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { path = [] } = await context.params;
  const backendPath = buildBackendPath(path);
  if (!backendPath || !isAllowedBackendPath(backendPath)) {
    return jsonResponse({ error: "backend_path_not_allowed" }, 404);
  }

  const incomingUrl = new URL(request.url);
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
    return new Response(body, {
      status: upstream.status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": upstream.headers.get("content-type") || "application/json",
        "X-PolySignal-Proxy": "enabled",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "backend_request_timeout"
        : "backend_request_failed";
    return jsonResponse({ error: message }, 504);
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
