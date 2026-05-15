const DEFAULT_BACKEND_BASE_URL = "https://polisygnal.onrender.com";
const MAX_BODY_BYTES = 32_000;
const MAX_PROXY_QUERY_LENGTH = 1200;
const MAX_RESPONSE_BYTES = 256_000;
const REQUEST_TIMEOUT_MS = 10_000;
const WALLET_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export const dynamic = "force-dynamic";
export const revalidate = 0;

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-PolySignal-Profiles": "persistent-v2",
    },
    status,
  });
}

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
    // Fall through to production backend.
  }
  return DEFAULT_BACKEND_BASE_URL;
}

function backendUrl(path: "/profiles/highlighted" | "/profiles/highlighted/upsert", search = ""): URL {
  const url = new URL(`${backendBaseUrl()}${path}`);
  url.search = search;
  return url;
}

async function fetchBackendJson(url: URL, init: RequestInit): Promise<{ body: string; status: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: controller.signal,
    });
    const body = await response.text();
    if (body.length > MAX_RESPONSE_BYTES) {
      return {
        body: JSON.stringify({ error: "profiles_response_too_large" }),
        status: 502,
      };
    }
    return {
      body,
      status: response.status,
    };
  } catch {
    return {
      body: JSON.stringify({ error: "profiles_backend_unavailable" }),
      status: 502,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  if (incoming.search.length > MAX_PROXY_QUERY_LENGTH) {
    return jsonResponse({ error: "request_too_large" }, 414);
  }
  const upstream = await fetchBackendJson(backendUrl("/profiles/highlighted", incoming.search), {
    headers: {
      Accept: "application/json",
      "User-Agent": "PolySignal Profiles v2",
    },
    method: "GET",
  });
  return new Response(upstream.body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-PolySignal-Profiles": "persistent-v2",
    },
    status: upstream.status,
  });
}

export async function POST(request: Request): Promise<Response> {
  const payload = await readJsonBody(request);
  const walletAddress = typeof payload?.walletAddress === "string" ? payload.walletAddress.trim() : "";
  if (!payload || !WALLET_PATTERN.test(walletAddress)) {
    return jsonResponse({ error: "invalid_profile_payload" }, 400);
  }
  const upstream = await fetchBackendJson(backendUrl("/profiles/highlighted/upsert"), {
    body: JSON.stringify({
      ...payload,
      walletAddress: walletAddress.toLowerCase(),
    }),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "PolySignal Profiles v2",
    },
    method: "POST",
  });
  return new Response(upstream.body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-PolySignal-Profiles": "persistent-v2",
    },
    status: upstream.status,
  });
}

export function PUT(): Response {
  return jsonResponse({ error: "method_not_allowed" }, 405);
}

export function PATCH(): Response {
  return jsonResponse({ error: "method_not_allowed" }, 405);
}

export function DELETE(): Response {
  return jsonResponse({ error: "method_not_allowed" }, 405);
}
