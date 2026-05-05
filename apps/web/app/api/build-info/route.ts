const DEFAULT_BACKEND_BASE_URL = "https://polisygnal.onrender.com";

export const dynamic = "force-dynamic";

function shortCommit(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  return value.slice(0, 7);
}

function safeHost(value: string | undefined, fallback = "unknown"): string {
  const baseUrl = value || fallback;
  try {
    return new URL(baseUrl).host;
  } catch {
    return fallback;
  }
}

export function GET(): Response {
  return Response.json(
    {
      app: "polisygnal-web",
      env: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
      commit: shortCommit(process.env.VERCEL_GIT_COMMIT_SHA),
      deployment_url_host: safeHost(
        process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
      ),
      api_host: safeHost(process.env.NEXT_PUBLIC_API_BASE_URL, new URL(DEFAULT_BACKEND_BASE_URL).host),
      proxy: "enabled",
      generated_at: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
