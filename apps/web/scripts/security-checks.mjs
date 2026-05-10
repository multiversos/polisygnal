import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadTsModule(relativePath) {
  const absolutePath = resolve(appRoot, relativePath);
  const source = readFileSync(absolutePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: absolutePath,
  }).outputText;
  const module = { exports: {} };
  const context = vm.createContext({
    AbortController,
    clearTimeout,
    console,
    exports: module.exports,
    fetch: (...args) => globalThis.fetch(...args),
    Headers,
    module,
    process,
    Request,
    require,
    Response,
    setTimeout,
    URL,
  });
  new vm.Script(compiled, { filename: absolutePath }).runInContext(context);
  return module.exports;
}

function validatePolymarketLinks() {
  const {
    getPolymarketUrlValidationMessage,
    isPolymarketUrl,
    normalizePolymarketUrl,
  } = loadTsModule("app/lib/polymarketLink.ts");

  const accepted = [
    "https://polymarket.com/event/test",
    "https://polymarket.com/market/test",
    "polymarket.com/event/test",
  ];
  const rejected = [
    "javascript:alert(1)",
    "data:text/html,test",
    "file:///etc/passwd",
    "ftp://polymarket.com/test",
    "http://localhost:3000",
    "http://127.0.0.1",
    "http://0.0.0.0",
    "http://[::1]",
    "http://169.254.169.254",
    "http://192.168.1.1",
    "http://10.0.0.1",
    "http://172.16.0.1",
    "https://polymarket.com.evil.com",
    "https://evil.com/polymarket.com",
    "https://user:pass@polymarket.com/event/test",
    "https://polymarket.com:444/event/test",
    `https://polymarket.com/event/${"x".repeat(2100)}`,
  ];

  for (const input of accepted) {
    const validation = getPolymarketUrlValidationMessage(input);
    assert(validation.ok, `expected Polymarket URL to be accepted: ${input}`);
    assert(isPolymarketUrl(input), `expected isPolymarketUrl to accept: ${input}`);
    assert(
      normalizePolymarketUrl(input)?.startsWith("https://polymarket.com") ||
        normalizePolymarketUrl(input)?.startsWith("https://www.polymarket.com"),
      `expected normalized HTTPS Polymarket URL for: ${input}`,
    );
  }

  for (const input of rejected) {
    const validation = getPolymarketUrlValidationMessage(input);
    assert(!validation.ok, `expected URL to be rejected: ${input}`);
    assert(!isPolymarketUrl(input), `expected isPolymarketUrl to reject: ${input}`);
    assert(normalizePolymarketUrl(input) === null, `expected normalizePolymarketUrl to reject: ${input}`);
  }

  return { accepted: accepted.length, rejected: rejected.length };
}

async function validateBackendProxy() {
  const route = loadTsModule("app/api/backend/[...path]/route.ts");
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ init, url: String(url) });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  };

  try {
    const allowed = await route.GET(
      new Request("https://example.test/api/backend/markets/overview?sport_type=soccer"),
      { params: Promise.resolve({ path: ["markets", "overview"] }) },
    );
    assert(allowed.status === 200, `expected allowed proxy request to return 200, got ${allowed.status}`);
    assert(calls.length === 1, "expected allowed proxy request to call upstream once");
    assert(
      calls[0].url === "https://polisygnal.onrender.com/markets/overview?sport_type=soccer",
      `unexpected upstream URL: ${calls[0].url}`,
    );

    const absoluteUrl = await route.GET(new Request("https://example.test/api/backend/https://evil.com"), {
      params: Promise.resolve({ path: ["https://evil.com"] }),
    });
    assert(absoluteUrl.status === 404, `expected absolute URL path to be blocked, got ${absoluteUrl.status}`);
    assert(!JSON.stringify(await absoluteUrl.json()).includes("polisygnal.onrender.com"), "blocked proxy leaked backend host");

    const unexpectedPath = await route.GET(new Request("https://example.test/api/backend/admin/secrets"), {
      params: Promise.resolve({ path: ["admin", "secrets"] }),
    });
    assert(unexpectedPath.status === 404, `expected unexpected path to be blocked, got ${unexpectedPath.status}`);

    const longQuery = await route.GET(
      new Request(`https://example.test/api/backend/markets/overview?${"q=x&".repeat(500)}`),
      { params: Promise.resolve({ path: ["markets", "overview"] }) },
    );
    assert(longQuery.status === 414, `expected long query to be blocked, got ${longQuery.status}`);

    globalThis.fetch = async () =>
      new Response("<html>unexpected</html>", {
        headers: { "Content-Type": "text/html" },
        status: 200,
      });
    const unsafeContentType = await route.GET(
      new Request("https://example.test/api/backend/markets/overview?sport_type=soccer"),
      { params: Promise.resolve({ path: ["markets", "overview"] }) },
    );
    assert(unsafeContentType.status === 502, `expected unsafe content-type to be blocked, got ${unsafeContentType.status}`);

    assert(route.POST().status === 405, "expected POST to be rejected");
    assert(route.DELETE().status === 405, "expected DELETE to be rejected");
  } finally {
    globalThis.fetch = originalFetch;
  }

  return { proxy_checks: 6 };
}

const linkChecks = validatePolymarketLinks();
const proxyChecks = await validateBackendProxy();

console.log(
  JSON.stringify(
    {
      link_validation: linkChecks,
      proxy: proxyChecks,
      status: "ok",
    },
    null,
    2,
  ),
);
