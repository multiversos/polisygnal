import { execFile, execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const FRONTEND_BASE_URL = (
  process.env.POLYSIGNAL_SMOKE_FRONTEND_URL || "https://polisygnal-web.vercel.app"
).replace(/\/$/, "");
const BACKEND_BASE_URL = (
  process.env.POLYSIGNAL_SMOKE_BACKEND_URL || "https://polisygnal.onrender.com"
).replace(/\/$/, "");
const PRODUCT_MODE = (process.env.POLYSIGNAL_SMOKE_PRODUCT_MODE || "copy-trading").trim().toLowerCase();
const SAMANTHA_BRIDGE_HEALTH_URL =
  process.env.POLYSIGNAL_SMOKE_SAMANTHA_HEALTH_URL ||
  "https://samantha-polysignal-bridge.onrender.com/health";
const MIN_SOCCER_MARKETS = Number(process.env.POLYSIGNAL_SMOKE_MIN_SOCCER_MARKETS || 75);
const MIN_SOCCER_MATCH_CARDS = Number(process.env.POLYSIGNAL_SMOKE_MIN_SOCCER_MATCH_CARDS || 20);
const EXPECTED_COMMIT = process.env.POLYSIGNAL_SMOKE_EXPECTED_COMMIT || "";
const PROXY_PATH = "/api/backend/markets/overview?sport_type=soccer&limit=50";
const BUILD_INFO_PATH = "/api/build-info";
const HOME_PATH = "/";
const SPORTS_PATH = "/sports";
const SPORTS_SOCCER_PATH = "/sports/soccer";
const BRIEFING_PATH = "/briefing";
const ALERTS_PATH = "/alerts";
const WATCHLIST_PATH = "/watchlist";
const HISTORY_PATH = "/history";
const PROFILES_PATH = "/profiles";
const COPY_TRADING_PATH = "/copy-trading";
const PERFORMANCE_PATH = "/performance";
const METHODOLOGY_PATH = "/methodology";
const ANALYZE_PATH = "/analyze";
const DATA_HEALTH_PATH = "/data-health";
const INTERNAL_DATA_STATUS_PATH = "/internal/data-status";
const LEGACY_SAMANTHA_ANALYSIS_PATH = "/api/samantha-polysignal-analysis";
const WORKFLOW_PATH = "/workflow";
const RENDER_ERROR_TEXT = [
  "Datos no disponibles",
  "No se pudo cargar este deporte",
  "No se pudo cargar esta vista",
  "La API no respondio",
  "La API no respondiÃ³",
  "Todavia no hay mercados",
  "TodavÃ­a no hay mercados",
];
const PUBLIC_NAV_TEXT = [
  "Inicio",
  "Analizar enlace",
  "Historial",
  "Perfiles",
  "Copiar Wallets",
  "Rendimiento",
  "Alertas",
  "Metodologia",
];
const LEGACY_NAV_TEXT = ["Mercados deportivos", "Resumen diario", "Mi lista"];
const INTERNAL_NAV_TEXT = [
  "InvestigaciÃ³n",
  "InvestigaciÃƒÂ³n",
  "Evidencia",
  "Decisiones",
  "Workflow",
  "Coincidencias Kalshi",
  "Calidad de fuentes",
  "Salud de datos",
  "Trial E2E",
  "Backtesting",
  "internal",
  "diagnostics",
  "data status",
  "Estado de datos",
  "refresh",
];
const PUBLIC_TECHNICAL_TEXT = [
  "API",
  "backend",
  "JSON",
  "proxy",
  "E2E",
  "debug",
  "pipeline",
  "fallback",
  "snapshot",
  "Snapshot",
  "market_type",
  "model_version",
  "raw data",
  "raw_data",
];
const PUBLIC_SECURITY_TEXT = [
  "DATABASE_URL",
  "SECRET",
  "TOKEN",
  "API_KEY",
  "PASSWORD",
  "password",
  "postgres://",
  "postgresql://",
  "Traceback",
  "TypeError:",
  "ReferenceError:",
  "Unhandled Runtime Error",
  "stack trace",
  "connection string",
  "localhost",
];
const PUBLIC_WALLET_FORBIDDEN_TEXT = [
  "betting advice",
  "copy this trader",
  "copy-trading",
  "guaranteed",
  "whale knows",
  "insider",
  "place a bet",
  "smart money guaranteed",
  "ROI 100%",
  "win rate 100%",
];
const UPDATE_TEXT = [
  "Última actualización",
  "Ãšltima actualizaciÃ³n",
  "ÃƒÅ¡ltima actualizaciÃƒÂ³n",
];
const SOCCER_MARKET_LIST_TEXT = [
  "Mercados disponibles",
  "Ver todos los mercados",
  "Precio SÃ",
  "Precio SÃƒÂ",
];
const UPCOMING_MATCHES_TEXT = ["Próximos partidos", "PrÃ³ximos partidos"];
const SCHEDULE_GROUP_TEXT = [
  "Hoy",
  "Mañana",
  "MaÃ±ana",
  "Esta semana",
  "Próximamente",
  "PrÃ³ximamente",
  "Sin fecha confirmada",
];
const REVIEW_NOW_TEXT = ["Qué revisar ahora", "QuÃ© revisar ahora"];
const QUICK_SUMMARY_TEXT = ["Resumen rápido", "Resumen rÃ¡pido"];
const ANALYSIS_TEXT = ["Ver análisis", "Ver anÃ¡lisis"];
const PREDICTION_TEXT = ["Con predicción", "Con predicciÃ³n"];
const SOCCER_RETURN_TEXT = [
  "Volver a fútbol",
  "Volver a fÃºtbol",
  "Volver a fÃƒÂºtbol",
];
const WHAT_THIS_MEANS_TEXT = [
  "Qué significa esto",
  "QuÃ© significa esto",
  "QuÃƒÂ© significa esto",
];
const REVIEW_REASON_TEXT = [
  "Para revisar",
  "En observación",
  "En observaciÃ³n",
  "Información parcial",
  "InformaciÃ³n parcial",
  "Seguir de cerca",
];
const WHY_VISIBLE_TEXT = [
  "Por qué aparecen aquí",
  "Por quÃ© aparecen aquÃ­",
  "Por qué aparece este mercado",
  "Por quÃ© aparece este mercado",
];
const ACTIVITY_TEXT = [
  "Actualizado recientemente",
  "Con actividad",
  "Actividad baja",
  "Datos limitados",
  "Sin cambios recientes",
  "Próximo partido",
  "PrÃ³ximo partido",
  "Mercado cerrado",
];
const GENERIC_SPORT_ICON_TEXT_PATTERN =
  /<span class="sport-selector-icon"[^>]*>\s*(?:\*|B|N|F|T|BB|H|U|C|HK)\s*<\/span>/;
const CHROME_DEBUG_START_PORT = Number(process.env.POLYSIGNAL_SMOKE_CHROME_PORT || 9347);
const CHROME_STDERR_NOISE_PATTERNS = [
  /SetupDiGetDeviceProperty/i,
  /DEPRECATED_ENDPOINT/i,
  /PHONE_REGISTRATION_ERROR/i,
  /Authentication Failed: wrong_secret/i,
  /Created TensorFlow Lite XNNPACK delegate/i,
  /Failed to log in to GCM, resetting connection/i,
];

function urlFor(path) {
  return `${FRONTEND_BASE_URL}${path}`;
}

function backendUrlFor(path) {
  return `${BACKEND_BASE_URL}${path}`;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function visibleText(dom) {
  return dom
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function assertDomIncludes(dom, expected, label) {
  assert(dom.includes(expected), `${label} did not render expected DOM content: ${expected}`);
}

function sidebarText(dom) {
  const match = dom.match(/<aside[^>]*class="[^"]*app-sidebar[^"]*"[\s\S]*?<\/aside>/);
  return visibleText(match?.[0] || "");
}

function assertTextIncludes(text, expected, label) {
  assert(text.includes(expected), `${label} did not render expected text: ${expected}`);
}

function assertTextIncludesOneOf(text, expectedValues, label) {
  const found = expectedValues.find((value) => text.includes(value));
  assert(Boolean(found), `${label} did not render any expected text: ${expectedValues.join(" | ")}`);
}

function assertTextExcludes(text, blocked, label) {
  const found = blocked.filter((value) => text.includes(value));
  assert(found.length === 0, `${label} rendered blocked text: ${found.join(", ")}`);
}

function assertNoFullWalletAddress(text, label) {
  assert(!/\b0x[a-fA-F0-9]{40}\b/.test(text), `${label} rendered a full wallet address`);
}

function assertSportIconsRendered(dom, label) {
  assert(dom.includes("sport-icon-svg"), `${label} did not render sport SVG icons`);
  assert(
    !GENERIC_SPORT_ICON_TEXT_PATTERN.test(dom),
    `${label} rendered generic letter-only sport icons`,
  );
}

function slugForAnalyzeSmoke(value) {
  const slug = String(value || "soccer market")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .filter(Boolean)
    .slice(0, 14)
    .join("-");
  return slug || "soccer-market";
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function canListen(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 50; port += 1) {
    if (await canListen(port)) {
      return port;
    }
  }
  throw new Error(`No available Chrome debugger port found starting at ${startPort}`);
}

function hasUsableDom(dom) {
  return /<html[\s>]/i.test(dom) || /<!doctype html/i.test(dom);
}

function filterChromeStderr(stderr) {
  return String(stderr || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !CHROME_STDERR_NOISE_PATTERNS.some((pattern) => pattern.test(line)))
    .join("\n");
}

class ChromeConnection {
  constructor(webSocketUrl) {
    this.id = 0;
    this.listeners = new Map();
    this.pending = new Map();
    this.socket = new WebSocket(webSocketUrl);
  }

  async open() {
    await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error("CDP connection timed out")), 15000);
      this.socket.addEventListener("open", () => {
        clearTimeout(timeoutId);
        resolve();
      });
      this.socket.addEventListener("error", (event) => {
        clearTimeout(timeoutId);
        reject(new Error(`CDP connection failed: ${event.message || "unknown error"}`));
      });
    });

    this.socket.addEventListener("message", (event) => {
      const payload = JSON.parse(String(event.data));
      if (payload.id && this.pending.has(payload.id)) {
        const { resolvePromise, rejectPromise } = this.pending.get(payload.id);
        this.pending.delete(payload.id);
        if (payload.error) {
          rejectPromise(new Error(payload.error.message || "CDP command failed"));
          return;
        }
        resolvePromise(payload.result || {});
        return;
      }
      const listeners = this.listeners.get(payload.method) || [];
      for (const listener of listeners) {
        listener(payload.params || {});
      }
    });
  }

  send(method, params = {}) {
    const id = (this.id += 1);
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolvePromise, rejectPromise) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(id);
        rejectPromise(new Error(`CDP command timed out: ${method}`));
      }, 20000);
      this.pending.set(id, {
        rejectPromise: (error) => {
          clearTimeout(timeoutId);
          rejectPromise(error);
        },
        resolvePromise: (value) => {
          clearTimeout(timeoutId);
          resolvePromise(value);
        },
      });
    });
  }

  close() {
    this.socket.close();
  }
}

async function fetchLocalJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${url} responded ${response.status}`);
  }
  return response.json();
}

function killProcessTree(childProcess) {
  if (!childProcess || childProcess.killed) {
    return;
  }
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill.exe", ["/pid", String(childProcess.pid), "/t", "/f"], { stdio: "ignore" });
      return;
    } catch {
      // Fall back to child.kill below.
    }
  }
  childProcess.kill();
}

function cleanupTempDir(path) {
  try {
    rmSync(path, { force: true, recursive: true, maxRetries: 5, retryDelay: 250 });
  } catch {
    // Ignore best-effort cleanup failures from Chrome temp profiles on Windows.
  }
}

function spawnChromeForCdp(port) {
  const chrome = findChrome();
  assert(chrome, "Chrome/Chromium was not found. Set CHROME_PATH to run the render smoke test.");
  const userDataDir = mkdtempSync(join(tmpdir(), `polisygnal-smoke-cdp-${Date.now()}`));
  const processHandle = spawn(
    chrome,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-sync",
      "--metrics-recording-only",
      "--mute-audio",
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    {
      stdio: "ignore",
      windowsHide: true,
    },
  );
  return { processHandle, userDataDir };
}

async function waitForChromeDebugger(port) {
  const versionUrl = `http://127.0.0.1:${port}/json/version`;
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < 30000) {
    try {
      return await fetchLocalJson(versionUrl);
    } catch (error) {
      lastError = error;
      await sleep(250);
    }
  }
  throw new Error(`Chrome debugger did not become available: ${lastError?.message || "timeout"}`);
}

async function createChromeTarget(port, url) {
  return fetchLocalJson(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {
    method: "PUT",
  });
}

async function evaluateInChrome(connection, expression) {
  const response = await connection.send("Runtime.evaluate", {
    awaitPromise: true,
    expression,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text || "Runtime.evaluate failed");
  }
  return response.result?.value;
}

async function waitForChromeExpression(connection, expression, label, timeoutMs = 45000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluateInChrome(connection, expression)) {
      return;
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function inspectDomWithChrome(url, options = {}) {
  const attempts = options.attempts || 2;
  const waitExpression = options.waitExpression || "document.body && document.body.innerText.length > 0";
  const waitLabel = options.waitLabel || "page content";
  const timeoutMs = options.timeoutMs || 45000;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const port = await findAvailablePort(CHROME_DEBUG_START_PORT + (attempt - 1) * 10);
    const { processHandle, userDataDir } = spawnChromeForCdp(port);
    let connection = null;
    try {
      await waitForChromeDebugger(port);
      const target = await createChromeTarget(port, "about:blank");
      connection = new ChromeConnection(target.webSocketDebuggerUrl);
      await connection.open();
      await connection.send("Page.enable");
      await connection.send("Runtime.enable");
      await connection.send("Page.navigate", { url });
      await waitForChromeExpression(connection, waitExpression, waitLabel, timeoutMs);
      const dom = await evaluateInChrome(connection, "document.documentElement.outerHTML");
      if (hasUsableDom(dom)) {
        return dom;
      }
      lastError = new Error(`${url} did not return a usable hydrated DOM on attempt ${attempt}/${attempts}`);
    } catch (error) {
      if (connection) {
        try {
          const currentText = await evaluateInChrome(
            connection,
            "(document.body?.innerText || document.body?.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 500)",
          );
          if (currentText) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            lastError = new Error(`${errorMessage}. Body snapshot: ${currentText}`);
          } else {
            lastError = error;
          }
        } catch {
          lastError = error;
        }
      } else {
        lastError = error;
      }
    } finally {
      connection?.close();
      killProcessTree(processHandle);
      cleanupTempDir(userDataDir);
    }
    if (attempt < attempts) {
      await sleep(1200 * attempt);
    }
  }

  throw lastError || new Error(`Could not inspect hydrated DOM for ${url}`);
}

function isTransientSmokeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const statusMatch = message.match(/HTTP\s+(\d{3})/);
  if (!statusMatch) {
    return true;
  }
  const status = Number(statusMatch[1]);
  return status === 502 || status === 503 || status === 504;
}

async function fetchJson(path) {
  const attempts = 5;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(urlFor(path), {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const text = await response.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = { raw: text.slice(0, 500) };
      }
      if (response.ok) {
        if (attempt > 1) {
          console.warn(`${path} passed on retry ${attempt}/${attempts}`);
        }
        return { body, contentType: response.headers.get("content-type"), status: response.status };
      }
      lastError = new Error(
        `${path} returned HTTP ${response.status} on attempt ${attempt}/${attempts}: ${JSON.stringify(body)}`,
      );
      if (response.status < 500 || attempt === attempts) {
        throw lastError;
      }
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isTransientSmokeError(error)) {
        break;
      }
    }
    console.warn(`${path} retrying after transient failure on attempt ${attempt}/${attempts}`);
    await sleep(1600 * attempt);
  }
  throw lastError;
}

async function fetchJsonFromAbsoluteUrl(url) {
  const attempts = 5;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const text = await response.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = { raw: text.slice(0, 500) };
      }
      if (response.ok) {
        if (attempt > 1) {
          console.warn(`${url} passed on retry ${attempt}/${attempts}`);
        }
        return { body, contentType: response.headers.get("content-type"), status: response.status };
      }
      lastError = new Error(
        `${url} returned HTTP ${response.status} on attempt ${attempt}/${attempts}: ${JSON.stringify(body)}`,
      );
      if (response.status < 500 || attempt === attempts) {
        throw lastError;
      }
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isTransientSmokeError(error)) {
        break;
      }
    }
    console.warn(`${url} retrying after transient failure on attempt ${attempt}/${attempts}`);
    await sleep(1600 * attempt);
  }
  throw lastError;
}

async function fetchExternalJsonWithRetry(url, label) {
  const attempts = 5;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const text = await response.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = { raw: text.slice(0, 200) };
      }
      if (response.ok) {
        if (attempt > 1) {
          console.warn(`${label} passed on retry ${attempt}/${attempts}`);
        }
        return { body, status: response.status };
      }
      lastError = new Error(`${label} returned HTTP ${response.status}: ${JSON.stringify(body)}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) {
      console.warn(`${label} retrying after transient failure on attempt ${attempt}/${attempts}`);
      await sleep(1800 * attempt);
    }
  }
  throw lastError;
}

async function fetchPage(path) {
  const response = await fetch(urlFor(path), {
    cache: "no-store",
    headers: { Accept: "text/html,application/xhtml+xml" },
  });
  return {
    headers: response.headers,
    status: response.status,
  };
}

async function fetchJsonAllowFailure(path) {
  const response = await fetch(urlFor(path), {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { text: text.slice(0, 200) };
  }
  return { body, headers: response.headers, status: response.status };
}

async function postJsonAllowFailure(path, body) {
  const response = await fetch(urlFor(path), {
    body: JSON.stringify(body),
    cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    method: "POST",
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { text: text.slice(0, 200) };
  }
  return { body: parsed, headers: response.headers, status: response.status };
}

async function postJsonAbsoluteUrl(url, body) {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    method: "POST",
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { text: text.slice(0, 200) };
  }
  return { body: parsed, headers: response.headers, status: response.status };
}

function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

async function dumpDom(url, options = {}) {
  const chrome = findChrome();
  assert(chrome, "Chrome/Chromium was not found. Set CHROME_PATH to run the render smoke test.");
  const attempts = options.attempts || 2;
  const virtualTimeBudgetMs = options.virtualTimeBudgetMs || 20000;
  const acceptDom = options.acceptDom || (() => true);
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const userDataDir = mkdtempSync(join(tmpdir(), "polisygnal-smoke-chrome-"));
    try {
      const { stdout, stderr } = await execFileAsync(
        chrome,
        [
          "--headless",
          "--disable-gpu",
          "--disable-extensions",
          "--disable-background-networking",
          "--disable-component-update",
          "--disable-default-apps",
          "--disable-sync",
          "--metrics-recording-only",
          "--mute-audio",
          "--no-default-browser-check",
          "--no-first-run",
          `--user-data-dir=${userDataDir}`,
          `--virtual-time-budget=${virtualTimeBudgetMs}`,
          "--dump-dom",
          url,
        ],
        { maxBuffer: 8 * 1024 * 1024, timeout: 45000 },
      );
      const dom = stdout || "";
      const meaningfulStderr = filterChromeStderr(stderr);
      if (hasUsableDom(dom) && acceptDom(dom)) {
        return dom;
      }
      lastError = new Error(
        meaningfulStderr
          ? `${url} produced incomplete DOM: ${meaningfulStderr}`
          : `${url} produced incomplete DOM on attempt ${attempt}/${attempts}`,
      );
    } catch (error) {
      const dom = typeof error?.stdout === "string" ? error.stdout : "";
      const meaningfulStderr = filterChromeStderr(error?.stderr);
      if (hasUsableDom(dom) && acceptDom(dom)) {
        return dom;
      }
      lastError =
        meaningfulStderr
          ? new Error(`${url} dump failed on attempt ${attempt}/${attempts}: ${meaningfulStderr}`)
          : error instanceof Error
            ? error
            : new Error(String(error));
    } finally {
      cleanupTempDir(userDataDir);
    }
    if (attempt < attempts) {
      await sleep(1200 * attempt);
    }
  }
  throw lastError || new Error(`Could not dump DOM for ${url}`);
}

function countMarketCards(dom) {
  return (dom.match(/<article\s+class="sports-market-card/g) || []).length;
}

function countMatchCards(dom) {
  return (dom.match(/<article\s+class="soccer-match-card/g) || []).length;
}

function validatePublicProductPage(dom, label, requiredText = [], allowedTechnicalText = []) {
  const text = visibleText(dom);
  const navText = sidebarText(dom);
  const blockedTechnicalText = PUBLIC_TECHNICAL_TEXT.filter(
    (value) => !allowedTechnicalText.includes(value),
  );
  for (const publicItem of PUBLIC_NAV_TEXT) {
    assertTextIncludes(navText, publicItem, `${label} public sidebar`);
  }
  for (const expected of requiredText) {
    assertTextIncludes(text, expected, label);
  }
  assertTextExcludes(navText, LEGACY_NAV_TEXT, `${label} legacy public sidebar`);
  assertTextExcludes(navText, INTERNAL_NAV_TEXT, `${label} public sidebar`);
  assertTextExcludes(text, blockedTechnicalText, `${label} public copy`);
  assertTextExcludes(text, PUBLIC_SECURITY_TEXT, `${label} secret leakage`);
  return { public_sidebar_found: true, internal_sidebar_hidden: true, technical_copy_hidden: true };
}

function validateSecurityHeaders(page, label) {
  const csp = page.headers.get("content-security-policy") || "";
  assert(page.status === 200, `${label} returned HTTP ${page.status}`);
  assert(
    page.headers.get("x-content-type-options")?.toLowerCase() === "nosniff",
    `${label} missing X-Content-Type-Options`,
  );
  assert(
    page.headers.get("referrer-policy") === "strict-origin-when-cross-origin",
    `${label} missing Referrer-Policy`,
  );
  assert(page.headers.get("x-frame-options") === "DENY", `${label} missing X-Frame-Options`);
  assert(page.headers.get("permissions-policy"), `${label} missing Permissions-Policy`);
  assert(page.headers.get("strict-transport-security"), `${label} missing Strict-Transport-Security`);
  assert(csp.includes("default-src 'self'"), `${label} CSP missing default-src`);
  assert(csp.includes("frame-ancestors 'none'"), `${label} CSP missing frame-ancestors`);
  assert(csp.includes("object-src 'none'"), `${label} CSP missing object-src`);
  return { baseline_security_headers_found: true };
}

function validateRenderedSoccerPage(dom, expectedTitles, label, expectedMarketTotal, visibleMarketCount) {
  const cardCount = countMarketCards(dom);
  const matchCardCount = countMatchCards(dom);
  const text = visibleText(dom);
  const blockedTexts = RENDER_ERROR_TEXT.filter((blockedText) => text.includes(blockedText));
  const titleFound =
    expectedTitles.some((title) => title && dom.includes(title)) || matchCardCount > 0;

  assert(
    cardCount >= MIN_SOCCER_MARKETS || matchCardCount > 0,
    `${label} rendered ${cardCount} market cards and ${matchCardCount} match cards`,
  );
  assert(
    matchCardCount >= MIN_SOCCER_MATCH_CARDS,
    `${label} rendered ${matchCardCount} soccer match cards; expected at least ${MIN_SOCCER_MATCH_CARDS}`,
  );
  assert(blockedTexts.length === 0, `${label} rendered error/empty text: ${blockedTexts.join(", ")}`);
  assert(titleFound, `${label} did not render any expected soccer market title`);
  assertTextIncludes(text, `Mercados ${expectedMarketTotal}`, label);
  assertTextIncludes(text, `Vista mercados (${visibleMarketCount})`, label);
  assertTextIncludes(text, `Mostrando ${visibleMarketCount} de ${expectedMarketTotal} mercados`, label);
  assertTextExcludes(
    text,
    ["Mercados 0", "Partidos detectados 0", "Analizados 0 En observación 0"],
    `${label} zero state`,
  );
  assertTextIncludes(text, "Partidos detectados", label);
  assertTextIncludes(text, "Actualizar", label);
  assertTextIncludes(text, "Buscar equipo o mercado", label);
  assertTextIncludes(text, "Estado", label);
  assertTextIncludes(text, "Orden", label);
  assertTextIncludesOneOf(text, ["Seguir", "Siguiendo"], `${label} watchlist button`);
  assertTextIncludesOneOf(text, REVIEW_REASON_TEXT, `${label} review reason`);
  assertTextIncludesOneOf(text, ACTIVITY_TEXT, `${label} activity label`);
  assertTextIncludesOneOf(text, UPDATE_TEXT, `${label} update timestamp`);
  assertTextIncludesOneOf(text, SOCCER_MARKET_LIST_TEXT, `${label} visible market list`);
  assertTextIncludesOneOf(text, UPCOMING_MATCHES_TEXT, label);
  assertTextIncludesOneOf(text, SCHEDULE_GROUP_TEXT, `${label} schedule grouping`);
  assert(dom.includes("team-crest"), `${label} did not render team initials`);
  assert(dom.includes("team-crest-stack"), `${label} did not render paired team avatars`);
  assertSportIconsRendered(dom, label);
  const publicProduct = validatePublicProductPage(dom, label, [
    `Mercados ${expectedMarketTotal}`,
    `Vista mercados (${visibleMarketCount})`,
    `Mostrando ${visibleMarketCount} de ${expectedMarketTotal} mercados`,
    "Partidos detectados",
  ]);

  return {
    market_card_count: cardCount,
    match_card_count: matchCardCount,
    title_found: titleFound,
    markets_summary_found: true,
    market_toggle_found: true,
    match_summary_found: true,
    team_avatars_found: true,
    ...publicProduct,
  };
}

function validateMarketDetailPage(dom, label) {
  const text = visibleText(dom);
  assertNoFullWalletAddress(text, label);
  assertTextIncludesOneOf(text, ["Analizar con enlace", "Analizar enlace"], `${label} analyzer action`);
  assertTextIncludes(text, "Ver historial", `${label} history action`);
  assertTextIncludesOneOf(text, ["Seguimiento legacy", "En seguimiento local", "Seguir en local"], `${label} legacy tracking action`);
  assertTextIncludesOneOf(text, WHAT_THIS_MEANS_TEXT, label);
  assertTextIncludesOneOf(text, WHY_VISIBLE_TEXT, `${label} visible reason`);
  assertTextIncludesOneOf(text, REVIEW_REASON_TEXT, `${label} public state`);
  assertTextIncludesOneOf(text, ACTIVITY_TEXT, `${label} activity context`);
  assertTextIncludesOneOf(
    text,
    ["Estimacion PolySignal", "Estimación PolySignal", "Estimacion propia no disponible", "Estimación propia no disponible"],
    `${label} honest polysignal estimate state`,
  );
  assertTextIncludes(text, "Contexto deportivo", `${label} soccer context`);
  assertTextIncludesOneOf(
    text,
    ["Evidencia para estimacion", "Evidencia para estimación"],
    `${label} evidence readiness`,
  );
  assertTextIncludes(text, "Billeteras relevantes", `${label} wallet intelligence readiness`);
  assertTextIncludesOneOf(
    text,
    ["no identifica personas reales", "Sin datos suficientes de billeteras", "direcciones completas", "Senal auxiliar"],
    `${label} wallet privacy copy`,
  );
  assertTextIncludes(text, "Preparacion de datos", `${label} non predictive readiness`);
  assertTextIncludes(text, "No predictivo", `${label} readiness is not prediction`);
  assertTextExcludes(text, ["Fake finding", "Demo finding", "fixture de prueba"], `${label} invented evidence`);
  assertTextExcludes(text, ["0x1234567890abcdef", ...PUBLIC_WALLET_FORBIDDEN_TEXT], `${label} fake wallet metrics`);
  assertTextExcludes(
    text,
    ["Volver a mercados deportivos", "Ver JSON", "API docs", "Endpoint", "model_version", "market_type", "raw data"],
    label,
  );
  assertTextExcludes(text, PUBLIC_SECURITY_TEXT, `${label} secret leakage`);
  return { watchlist_action_found: true, public_detail_copy_found: true };
}

function validateAnalyzeLoadingPanelSource() {
  const source = readFileSync(new URL("../app/components/AnalyzeLoadingPanel.tsx", import.meta.url), "utf8");
  const marketDetailsSource = readFileSync(new URL("../app/components/MarketDataDetails.tsx", import.meta.url), "utf8");
  const walletDetailsSource = readFileSync(new URL("../app/components/WalletIntelligenceDetails.tsx", import.meta.url), "utf8");
  const reportSource = readFileSync(new URL("../app/components/AnalyzerReport.tsx", import.meta.url), "utf8");
  const homeSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const historySource = readFileSync(new URL("../app/history/page.tsx", import.meta.url), "utf8");
  const analyzePage = readFileSync(new URL("../app/analyze/page.tsx", import.meta.url), "utf8");
  const linkSource = readFileSync(new URL("../app/lib/polymarketLink.ts", import.meta.url), "utf8");
  const analysisAgentBridgeSource = readFileSync(new URL("../app/lib/analysisAgentBridge.ts", import.meta.url), "utf8");
  const analysisAgentRegistrySource = readFileSync(new URL("../app/lib/analysisAgentRegistry.ts", import.meta.url), "utf8");
  const bridgeSource = readFileSync(new URL("../app/lib/samanthaBridge.ts", import.meta.url), "utf8");
  const envExampleSource = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  const bridgeRouteSource = readFileSync(new URL("../app/api/samantha/send-research/route.ts", import.meta.url), "utf8");
  const bridgeStatusRouteSource = readFileSync(new URL("../app/api/samantha/research-status/route.ts", import.meta.url), "utf8");
  const walletRouteSource = readFileSync(new URL("../app/api/polymarket-wallet-intelligence/route.ts", import.meta.url), "utf8");
  const expectedSteps = [
    "Leyendo enlace",
    "Detectando mercado",
    "Cargando datos de Polymarket",
    "Revisando billeteras",
    "${agentName} analizando",
    "Preparando lectura",
  ];

  assert(source.includes("export function AnalyzeProgressPanel"), "analyze progress panel component is missing");
  assert(source.includes("Analizando hace"), "analyze progress panel elapsed timer is missing");
  assert(source.includes("Esto normalmente toma unos segundos."), "analyze progress panel normal wait copy is missing");
  assert(source.includes("Esta tardando mas de lo normal"), "analyze progress panel slow wait copy is missing");
  assert(source.includes("Parece que esta busqueda se quedo esperando respuesta"), "analyze progress panel stalled copy is missing");
  assert(source.includes("${agentName} sigue analizando fuentes automaticas"), "analyze progress panel dynamic agent pending copy is missing");
  assert(source.includes("Guardar para continuar luego"), "analyze progress panel save recovery action is missing");
  assert(source.includes("Progreso del analisis"), "analyze loading panel should expose human analysis progress state");
  assert(source.includes("stepActions"), "analyze progress panel should support explicit detail buttons");
  assert(analyzePage.includes("Ver datos"), "analyze page should expose market data detail button copy");
  assert(analyzePage.includes("Ver billeteras"), "analyze page should expose wallet detail button copy");
  assert(analyzePage.includes("open={marketDetailsOpen}"), "market detail drawer should be closed by default");
  assert(analyzePage.includes("open={walletDetailsOpen}"), "wallet detail drawer should be closed by default");
  assert(marketDetailsSource.includes("Datos de Polymarket"), "market data detail drawer is missing");
  assert(marketDetailsSource.includes("getDisplayMarketPrices"), "market data drawer should use explicit display-price mapping");
  assert(marketDetailsSource.includes('displayPrices.mode === "outcome"'), "market data drawer should summarize real outcome prices");
  assert(marketDetailsSource.includes("Lider por precio de mercado"), "market data drawer should show an outcome market-price leader");
  assert(marketDetailsSource.includes("Fecha disponible"), "market data drawer should not invent event time labels");
  assert(walletDetailsSource.includes("Billeteras analizadas"), "wallet detail drawer is missing");
  assert(walletDetailsSource.includes("Billeteras notables"), "wallet detail drawer should expose notable wallets");
  assert(walletDetailsSource.includes("Hay billeteras relevantes reportadas"), "wallet detail drawer should explain relevant-wallet-only states");
  assert(walletDetailsSource.includes("wallet-technical-details"), "wallet technical fields should be collapsed");
  assert(!walletDetailsSource.includes("<pre"), "wallet details should not render raw JSON by default");
  assert(!source.includes("Deep Analysis Job"), "analyze loading panel should not expose technical job title");
  assert(!source.includes("Leyendo Polymarket"), "analyze loading panel should use human Polymarket read copy");
  assert(!source.includes("Esperando reporte de Samantha"), "analyze loading panel should not ask for manual Samantha reports");
  assert(!source.includes("Cargar reporte Samantha"), "analyze loading panel should not expose manual upload");
  assert(!source.includes('return "OK"'), "analyze loading panel should not expose OK as status copy");
  assert(!source.includes('return "Ahora"'), "analyze loading panel should not expose Ahora as status copy");
  assert(source.includes("aria-live=\"polite\""), "analyze loading panel needs polite live status");
  for (const step of expectedSteps) {
    assert(source.includes(step), `analyze loading panel missing step: ${step}`);
  }
  assert(source.includes("ANALYZE_PROGRESS_MIN_STEP_MS"), "analyze loading panel should use a short sequential reveal constant");
  assert(source.includes("visualStepIndex"), "analyze loading panel should keep visual progress separate from real data state");
  assert(source.includes("window.setTimeout"), "analyze loading panel may use a short visual timer for sequential reveal");
  assert(source.includes("Resumen encontrado hasta ahora"), "analyze loading panel should summarize sources as they are revealed");
  assert(source.includes("Mercado, datos y billeteras ya fueron consultados"), "analyze loading panel should explain long waits after source checks finish");
  assert(!source.includes("setInterval"), "analyze loading panel should not use fake progress intervals");
  assert(!source.includes("100%"), "analyze loading panel should not display invented 100% progress");
  assert(!source.includes("5000"), "analyze loading panel should not add long fake delays");
  assert(!source.includes("10000"), "analyze loading panel should not add long fake delays");
  assert(!source.includes("Buscando evidencia externa"), "analyze loading panel must not claim external research is running");
  assert(!source.includes("buscando internet"), "analyze loading panel must not claim internet search is running");
  assert(analyzePage.includes("withRequestTimeout"), "analyze page does not use frontend request timeouts");
  assert(analyzePage.includes("AbortController"), "analyze page does not make analyzer requests abortable");
  assert(analyzePage.includes("AnalyzeLoadingPanel"), "analyze page does not render AnalyzeLoadingPanel");
  assert(analyzePage.includes("MarketSelectionPanel"), "analyze page does not render market selector");
  assert(analyzePage.includes("/api/analyze-polymarket-link"), "analyze page does not use the safe Polymarket resolver route");
  assert(analyzePage.includes("resolvePolymarketLinkForAnalyze"), "analyze page does not resolve links from Polymarket first");
  assert(analyzePage.includes("getPolymarketWalletIntelligence"), "analyze page should use Polymarket-first wallet intelligence");
  assert(!analyzePage.includes("getWalletIntelligenceForMarket"), "analyze page must not use internal market IDs for wallet lookup");
  assert(analyzePage.includes("/api/analysis-agent/send-research"), "analyze page does not call the safe generic analysis agent route");
  assert(analyzePage.includes("markJobSamanthaBridgeFallback"), "analyze page does not keep safe partial state when Samantha bridge is unavailable");
  assert(analyzePage.includes("existingBridgeTaskId"), "analyze page should not duplicate Samantha sends when continuing a job");
  assert(analyzePage.includes("progressIssue"), "analyze page does not keep recovery visible after timeout/error");
  assert(!analyzePage.includes("/markets/overview"), "analyze page must not use internal overview as primary matching source");
  assert(!analyzePage.includes("rankAnalyzerMatches"), "analyze page must not use internal ranking as primary matching source");
  assert(!analyzePage.includes("fetchComparableMarkets"), "analyze page must not fetch internal comparable markets");
  assert(analyzePage.includes("analyzeSelectedMarket"), "analyze page does not gate deep analysis behind selection");
  assert(!analyzePage.includes("enrichMatchesWithWalletIntelligence(matches)"), "wallet intelligence should not load for all matches");
  assert(analyzePage.includes("buildAnalyzerResult"), "analyze page does not use unified analyzer result");
  assert(
    analyzePage.includes("Centro de analisis") || reportSource.includes("Centro de analisis"),
    "analyze report does not include product center summary",
  );
  assert(
    analyzePage.includes("Detalles avanzados del analisis") || reportSource.includes("Detalles avanzados del analisis"),
    "analyze report does not include reviewed layers",
  );
  assert(
    analyzePage.includes("Historial relacionado") || reportSource.includes("Historial relacionado"),
    "analyze report does not include related history",
  );
  assert(analyzePage.includes("AnalyzerReport"), "analyze page does not render AnalyzerReport");
  assert(reportSource.includes("Resultado del analisis"), "AnalyzerReport missing executive summary");
  assert(reportSource.includes("Detalles avanzados del analisis"), "AnalyzerReport missing human progress copy");
  assert(reportSource.includes("Estado del motor"), "AnalyzerReport missing accessible deep job state");
  assert(reportSource.includes("{analysisAgentName} automatico"), "AnalyzerReport missing dynamic automatic agent state");
  assert(reportSource.includes("Fuente automatica no disponible"), "AnalyzerReport missing automatic-source unavailable state");
  assert(reportSource.includes("Lectura parcial automatica"), "AnalyzerReport should label partial automatic readings");
  assert(reportSource.includes("Evidencia usada"), "AnalyzerReport should show verifiable evidence used");
  assert(reportSource.includes("Resumen compacto de las capas revisadas"), "AnalyzerReport should explain evidence cards");
  assert(reportSource.includes("Evidencia independiente"), "AnalyzerReport should explain independent evidence");
  assert(reportSource.includes("Que falta para generar estimacion propia"), "AnalyzerReport should explain what is missing for an estimate");
  assert(reportSource.includes("getDisplayMarketPrices"), "AnalyzerReport should use flexible outcome price summaries");
  assert(reportSource.includes("Senales visibles"), "AnalyzerReport should expose agent key signals");
  assert(reportSource.includes("Riesgos y limitaciones"), "AnalyzerReport should expose agent risks");
  assert(reportSource.includes("Que revisar primero"), "AnalyzerReport should explain what to review first");
  assert(reportSource.includes("No hay estimacion propia de PolySignal"), "AnalyzerReport should not show market price as PolySignal estimate");
  assert(reportSource.includes("Capas del motor"), "AnalyzerReport missing deep analyzer layers");
  assert(reportSource.includes("Pendiente de integracion"), "AnalyzerReport should label future layers as pending");
  assert(reportSource.includes("Lectura rapida de"), "AnalyzerReport missing public agent reading workflow");
  assert(reportSource.includes("NEXT_PUBLIC_SHOW_ANALYZER_DEBUG_TOOLS"), "AnalyzerReport should gate manual debug tools");
  assert(reportSource.includes("Guardar como seguimiento"), "AnalyzerReport missing save/follow-up action");
  assert(reportSource.includes("parseSamanthaResearchReport"), "AnalyzerReport missing Samantha report validation");
  assert(reportSource.includes("buildSamanthaTaskPacket"), "AnalyzerReport missing Samantha task packet builder");
  assert(reportSource.includes("/api/analysis-agent/research-status"), "AnalyzerReport should query agent status only through same-origin route");
  assert(!/fetch\(\s*["']https?:\/\//.test(reportSource), "AnalyzerReport must not call external services for the analysis agent");
  assert(analysisAgentRegistrySource.includes("ANALYSIS_AGENT_PROVIDER"), "analysis agent registry must use generic provider config");
  assert(analysisAgentRegistrySource.includes("SAMANTHA_BRIDGE_ENABLED"), "analysis agent registry must preserve legacy Samantha config");
  assert(analysisAgentBridgeSource.includes("buildAnalysisAgentMarketPayload"), "analysis agent bridge helper must send automatic market-analysis payloads");
  assert(analysisAgentBridgeSource.includes('"insufficient_data"'), "analysis agent bridge helper must handle insufficient automatic signals");
  assert(envExampleSource.includes("https://<samantha-bridge-host>/polysignal/analyze-market"), "env example must document public HTTPS Samantha bridge URL");
  assert(envExampleSource.includes("ANALYSIS_AGENT_PROVIDER=samantha"), "env example must document generic analysis agent config");
  assert(analysisAgentBridgeSource.includes("credentials: \"omit\""), "analysis agent bridge helper must omit credentials");
  assert(analysisAgentBridgeSource.includes("redirect: \"error\""), "analysis agent bridge helper must reject redirects");
  assert(bridgeSource.includes("sendAnalysisAgentResearchTask"), "legacy Samantha bridge helper must delegate to generic bridge");
  assert(bridgeRouteSource.includes("../../analysis-agent/send-research/route"), "legacy Samantha send route must alias generic route");
  assert(!bridgeRouteSource.includes("request.nextUrl"), "Samantha bridge route must not act as an open proxy");
  assert(bridgeStatusRouteSource.includes("../../analysis-agent/research-status/route"), "legacy Samantha status route must alias generic route");
  assert(!bridgeStatusRouteSource.includes("SAMANTHA_BRIDGE_TOKEN"), "Samantha status route must not expose bridge token");
  assert(reportSource.includes("Fuentes visibles completas"), "AnalyzerReport missing source block");
  assert(reportSource.includes("Que puedes hacer ahora"), "AnalyzerReport missing next actions");
  assert(reportSource.includes("Analizar otro enlace"), "AnalyzerReport missing analyze another link action");
  assert(reportSource.includes("Ver todas las billeteras analizadas"), "AnalyzerReport missing wallet drilldown");
  assert(walletDetailsSource.includes("Ver perfil en Polymarket"), "wallet drawer must expose profile verification when a safe URL exists");
  assert(walletDetailsSource.includes("Perfil Polymarket no disponible"), "wallet drawer must not invent wallet profile links");
  assert(walletDetailsSource.includes("Copiar direccion"), "wallet drawer must allow copying wallet addresses with safe wording");
  assert(walletDetailsSource.includes("Wallet completa no disponible"), "wallet drawer must not treat short addresses as verifiable wallets");
  assert(walletDetailsSource.includes("wallet-details-key-grid"), "wallet drawer must keep a compact key-data view");
  assert(walletDetailsSource.includes("Datos tecnicos"), "wallet technical details must stay collapsed by default");
  assert(walletDetailsSource.includes("Historial de esta wallet"), "wallet drawer must keep wallet history collapsed and explicit");
  assert(walletDetailsSource.includes("Perfil destacado"), "wallet drawer must support highlighted profile badges");
  assert(reportSource.includes("No encontramos datos publicos suficientes de billeteras"), "AnalyzerReport missing honest wallet unavailable state");
  assert(reportSource.includes("Perfil de billeteras"), "AnalyzerReport missing wallet profile summary");
  assert(reportSource.includes("Porcentaje PolySignal"), "AnalyzerReport missing conservative signal mix copy");
  assert(!reportSource.includes("wallet.walletAddress"), "AnalyzerReport should not render full wallet addresses");
  assert(walletRouteSource.includes("https://data-api.polymarket.com"), "wallet route must use Polymarket Data API allowlist");
  assert(walletRouteSource.includes("SAFE_PATHS"), "wallet route must constrain upstream paths");
  assert(walletRouteSource.includes("credentials: \"omit\""), "wallet route must omit credentials");
  assert(walletRouteSource.includes("redirect: \"error\""), "wallet route must reject redirects");
  assert(!walletRouteSource.includes("NEXT_PUBLIC_API_BASE_URL"), "wallet route must not use internal backend fallback");
  assert(homeSource.includes("Analiza enlaces de Polymarket y mide si PolySignal acierta"), "home does not position analyzer as primary entry");
  assert(homeSource.includes("Pega un enlace"), "home analyzer steps are missing");
  assert(historySource.includes("Analizar nuevo enlace"), "history page does not link back to analyzer");
  assert(historySource.includes("Continuar analisis"), "history page should reopen pending deep research jobs");
  assert(historySource.includes("Pendiente de investigacion"), "history page should label pending research");
  assert(historySource.includes("Actualizar lectura automatica"), "history page should allow safe Samantha status checks");
  assert(historySource.includes("Fuente automatica no disponible"), "history page should show unavailable automatic source state");
  assert(!historySource.includes("Cargar reporte manual"), "history page should not expose manual report upload");
  assert(historySource.includes("Ver rendimiento"), "history page does not link to performance");
  assert(analyzePage.includes("analyzer-selection-card"), "analyze page does not render compact selector cards");
  assert(!analyzePage.includes("Ver mercados deportivos"), "analyze no-match state must not offer internal market fallback");
  assert(analyzePage.includes("Polymarket devolvio"), "analyze selector should describe resolved Polymarket markets");
  assert(analyzePage.includes("No pudimos obtener este mercado desde Polymarket"), "analyze no-match copy should be Polymarket-first");
  assert(linkSource.includes("getLeaguePrefixFromSlug"), "polymarket link parser does not strip league prefixes from weak terms");
  assert(linkSource.includes("rawParts.length !== parts.length"), "polymarket link parser may infer team codes from generic slugs");
  assert(analyzePage.includes('advancePhase("matching")'), "analyze page does not drive matching phase");
  assert(analyzePage.includes('advancePhase("preparing_samantha")'), "analyze page does not prepare Samantha task phase");
  assert(analyzePage.includes('advancePhase("sending_samantha")'), "analyze page does not try Samantha bridge phase");

  return {
    exact_flow_source_checks: true,
    guided_loading_panel_found: true,
    phases: expectedSteps.length,
    recovery_actions: 4,
    timeout_guard: true,
  };
}

function validateBuildInfo(buildInfo) {
  assert(buildInfo.status === 200, `build-info returned status ${buildInfo.status}`);
  assert(buildInfo.contentType?.includes("application/json"), "build-info did not return JSON");
  assert(buildInfo.body.app === "polisygnal-web", `build-info app=${buildInfo.body.app}`);
  assert(buildInfo.body.commit, "build-info did not include commit");
  assert(buildInfo.body.proxy === "enabled", `build-info proxy=${buildInfo.body.proxy}`);
  assert(
    buildInfo.body.api_host === "polisygnal.onrender.com",
    `build-info api_host=${buildInfo.body.api_host}`,
  );
  if (EXPECTED_COMMIT) {
    const expectedShort = EXPECTED_COMMIT.slice(0, buildInfo.body.commit.length);
    assert(
      buildInfo.body.commit === expectedShort || EXPECTED_COMMIT.startsWith(buildInfo.body.commit),
      `build-info commit=${buildInfo.body.commit}, expected ${EXPECTED_COMMIT}`,
    );
  }
}

function validateDataHealthPage(dom, expectedMarketTotal) {
  const text = visibleText(dom);
  assertTextIncludes(text, `Markets visibles ${expectedMarketTotal}`, "data-health");
  assertTextIncludes(text, "Con snapshot", "data-health");
  assertTextIncludesOneOf(text, PREDICTION_TEXT, "data-health");
  assertTextExcludes(
    text,
    ["Mercados totales 0", "Por deporte 0 deportes", "Polymarket live", "Discovery read-only"],
    "data-health",
  );
  assertTextExcludes(text, ["Salud de datos no disponible", "La API no respondiÃ³"], "data-health");
  return { real_markets_found: true, old_zero_blocks_hidden: true };
}

function validateWorkflowPage(dom) {
  const text = visibleText(dom);
  assertTextIncludesOneOf(text, PREDICTION_TEXT, "workflow");
  assertTextIncludes(text, "Solo datos", "workflow");
  assertTextExcludes(text, ["Workflow no disponible", "La API no respondiÃ³"], "workflow");
  return { prediction_column_found: true, data_only_column_found: true };
}

function validateInternalDataStatusPage(dom) {
  const text = visibleText(dom);
  assertTextIncludes(text, "Estado de datos", "internal data status");
  assertTextIncludes(text, "Total fútbol", "internal data status");
  assertTextIncludes(text, "Ver fútbol", "internal data status");
  assertTextIncludes(text, "Solo lectura", "internal data status");
  assertTextIncludes(text, "Frescura de datos", "internal data status");
  assertTextIncludesOneOf(
    text,
    ["Resolucion de historial", "Resolución de historial"],
    "internal history resolution status",
  );
  assertTextIncludes(text, "Estado proxy publico", "internal data status proxy health");
  assertTextIncludesOneOf(
    text,
    ["Datos publicos disponibles", "datos publicos disponibles", "No se pudo consultar"],
    "internal data status proxy availability",
  );
  assertTextIncludesOneOf(
    text,
    ["Requiere refresh supervisado", "Frescura estable"],
    "internal data status readiness",
  );
  assertTextIncludes(text, "Sin actualización", "internal data status");
  assertTextIncludes(text, "Sin análisis", "internal data status");
  assertTextIncludes(text, "Stale 48h", "internal data status");
  assertTextIncludes(text, "Con precio visible", "internal data status");
  assertTextIncludes(text, "Con volumen visible", "internal data status");
  assertTextIncludes(text, "Datos completos", "internal data status");
  assertTextIncludes(text, "Readiness deportivo", "internal soccer readiness");
  assertTextIncludes(text, "Contexto de futbol", "internal soccer readiness");
  assertTextIncludes(text, "Equipos identificados", "internal soccer readiness");
  assertTextIncludes(text, "Investigacion externa", "internal external research readiness");
  assertTextIncludes(text, "Con evidencia externa real", "internal external research readiness");
  assertTextIncludes(text, "Sin evidencia externa", "internal external research readiness");
  assertTextIncludes(text, "Analysis Agent Bridge", "internal analysis agent diagnostics");
  assertTextIncludes(text, "Provider activo", "internal analysis agent diagnostics");
  assertTextIncludes(text, "Bridge URL configurada", "internal analysis agent diagnostics");
  assertTextIncludes(text, "Ultimo health check", "internal analysis agent diagnostics");
  assertTextIncludesOneOf(
    text,
    ["Samantha Bridge conectado", "Agente no disponible", "Agente configurado"],
    "internal analysis agent health state",
  );
  assertTextIncludes(text, "Inteligencia de billeteras", "internal wallet intelligence readiness");
  assertTextIncludesOneOf(
    text,
    ["Disponible parcial read-only", "Read-only conectado", "Pendiente de fuente estructurada"],
    "internal wallet intelligence readiness",
  );
  assertTextIncludesOneOf(
    text,
    ["Umbral planificado", "Umbral activo"],
    "internal wallet intelligence threshold",
  );
  assertTextExcludes(
    text,
    ["DATABASE_URL", "SECRET", "TOKEN", "API_KEY", "postgres://", "postgresql://"],
    "internal data status",
  );
  return { internal_data_status_found: true, secrets_hidden: true };
}

async function runCopyTradingSmoke({ buildInfo, securityHeaders }) {
  const backendHealth = await fetchJsonFromAbsoluteUrl(backendUrlFor("/health"));
  assert(backendHealth.body?.status === "ok", "backend /health did not return status ok");

  const directStatus = await fetchJsonFromAbsoluteUrl(backendUrlFor("/copy-trading/status"));
  const directWallets = await fetchJsonFromAbsoluteUrl(backendUrlFor("/copy-trading/wallets"));
  const directOpenPositions = await fetchJsonFromAbsoluteUrl(backendUrlFor("/copy-trading/demo/positions/open"));
  const directHistory = await fetchJsonFromAbsoluteUrl(backendUrlFor("/copy-trading/demo/positions/history"));
  const directPnlSummary = await fetchJsonFromAbsoluteUrl(backendUrlFor("/copy-trading/demo/pnl-summary"));
  const directSettlement = await postJsonAbsoluteUrl(
    backendUrlFor("/copy-trading/demo/settlement/run-once"),
    {},
  );

  const proxyStatus = await fetchJson("/api/backend/copy-trading/status");
  const proxyWallets = await fetchJson("/api/backend/copy-trading/wallets");
  const proxySettlement = await postJsonAllowFailure("/api/backend/copy-trading/demo/settlement/run-once", {});

  assert(directStatus.status === 200, `backend copy-trading/status returned HTTP ${directStatus.status}`);
  assert(directWallets.status === 200, `backend copy-trading/wallets returned HTTP ${directWallets.status}`);
  assert(
    directOpenPositions.status === 200,
    `backend copy-trading/demo/positions/open returned HTTP ${directOpenPositions.status}`,
  );
  assert(
    directHistory.status === 200,
    `backend copy-trading/demo/positions/history returned HTTP ${directHistory.status}`,
  );
  assert(
    directPnlSummary.status === 200,
    `backend copy-trading/demo/pnl-summary returned HTTP ${directPnlSummary.status}`,
  );
  assert(
    directSettlement.status === 200,
    `backend copy-trading/demo/settlement/run-once returned HTTP ${directSettlement.status}`,
  );
  assert(proxyStatus.status === 200, `proxy copy-trading/status returned HTTP ${proxyStatus.status}`);
  assert(proxyWallets.status === 200, `proxy copy-trading/wallets returned HTTP ${proxyWallets.status}`);
  assert(
    proxySettlement.status === 200,
    `proxy copy-trading/demo/settlement/run-once returned HTTP ${proxySettlement.status}`,
  );

  const liveCopyWallets = Array.isArray(directWallets.body?.wallets) ? directWallets.body.wallets : [];
  const liveCopyWalletLabels = liveCopyWallets
    .map((wallet) => wallet?.label)
    .filter(Boolean)
    .slice(0, 5);
  const liveCopyWalletCount = liveCopyWallets.length;
  const copyTradingWaitExpression =
    liveCopyWalletCount === 0
      ? `document.body && document.body.innerText.includes("Copiar Wallets")`
      : `(() => {
          const text = document.body?.innerText || "";
          const rowCount = document.querySelectorAll(".copy-wallet-row").length;
          const detailVisible = Boolean(document.querySelector(".copy-wallet-detail"));
          return text.includes("Wallets seguidas") && rowCount > 0 && detailVisible;
        })()`;
  const copyTradingDom = await inspectDomWithChrome(urlFor(COPY_TRADING_PATH), {
    attempts: 2,
    timeoutMs: liveCopyWalletCount > 0 ? 60000 : 45000,
    waitExpression: copyTradingWaitExpression,
    waitLabel: liveCopyWalletCount > 0 ? "copy trading hydrated data" : "copy trading page shell",
  });
  const copyTradingRender = validatePublicProductPage(copyTradingDom, "copy trading", ["Copiar Wallets"], ["API"]);
  const copyTradingText = visibleText(copyTradingDom);

  for (const expected of [
    "Resumen",
    "Wallets",
    "Copias abiertas",
    "Historial de trades",
    "Auditoria",
    "Ultima actualizacion",
    "Auto-refresh",
    "Watcher demo",
    "5 segundos",
    "Refrescar ahora",
    "Revisar resoluciones demo",
    "Agregar wallet",
  ]) {
    assertTextIncludes(copyTradingText, expected, `copy trading ${expected}`);
  }

  assertTextExcludes(
    copyTradingText,
    [
      "Neon quota exceeded",
      "Internal Server Error",
      "temporary_unavailable",
      "Backend no disponible",
      "private key",
      "seed phrase",
    ],
    "copy trading production UI",
  );
  assert(
    copyTradingStatusCompatible(directStatus.body, liveCopyWalletCount),
    `copy trading status wallets_enabled=${directStatus.body?.wallets_enabled}, wallets endpoint count=${liveCopyWalletCount}`,
  );
  assertNoFullWalletAddress(copyTradingText, "copy trading wallet privacy");
  assertTextIncludesOneOf(
    copyTradingText,
    [
      "Sin wallets. Agrega una direccion publica para iniciar el modo demo.",
      "Selecciona una wallet para ver su detalle.",
      "Lista compacta",
      "Estado actual",
    ],
    "copy trading empty or hydrated state",
  );

  if (liveCopyWalletCount > 0) {
    assert(
      liveCopyWalletLabels.some((label) => copyTradingText.includes(label)),
      "copy trading did not render any live wallet label even though the backend returned wallets",
    );
  }

  return {
    backend: {
      health: backendHealth.status,
      settlement: directSettlement.status,
      status: directStatus.status,
      wallets: directWallets.status,
      open_positions: directOpenPositions.status,
      history: directHistory.status,
      pnl_summary: directPnlSummary.status,
    },
    build_info: {
      app: buildInfo.body.app,
      commit: buildInfo.body.commit,
      env: buildInfo.body.env,
      api_host: buildInfo.body.api_host,
      proxy: buildInfo.body.proxy,
    },
    copy_trading: {
      empty_state_expected: liveCopyWalletCount === 0,
      settlement_checked_positions: directSettlement.body?.summary?.checked_positions ?? null,
      wallets_total: liveCopyWalletCount,
      wallets_enabled: directStatus.body?.wallets_enabled ?? null,
    },
    frontend: FRONTEND_BASE_URL,
    mode: PRODUCT_MODE,
    proxy: {
      settlement: proxySettlement.status,
      status: proxyStatus.status,
      wallets: proxyWallets.status,
    },
    public_pages: {
      copy_trading: copyTradingRender,
    },
    security: securityHeaders,
    status: "ok",
    warnings: [
      "legacy markets/soccer validation is not part of the default copy-trading smoke on a clean Railway database",
    ],
  };
}

function copyTradingStatusCompatible(statusBody, walletCount) {
  return statusBody?.wallets_enabled === walletCount;
}

async function main() {
  const buildInfo = await fetchJson(BUILD_INFO_PATH);
  validateBuildInfo(buildInfo);
  const securityHeaders = validateSecurityHeaders(await fetchPage(HOME_PATH), "home headers");
  if (PRODUCT_MODE === "copy-trading") {
    console.log(JSON.stringify(await runCopyTradingSmoke({ buildInfo, securityHeaders }), null, 2));
    return;
  }
  const samanthaBridgeHealth = await fetchExternalJsonWithRetry(
    SAMANTHA_BRIDGE_HEALTH_URL,
    "Samantha Bridge health",
  );
  assert(
    samanthaBridgeHealth.body?.status === "ok" &&
      samanthaBridgeHealth.body?.service === "samantha-polysignal-bridge",
    "Samantha Bridge health did not return the expected safe status",
  );
  const analysisAgentConfig = await fetchJson("/api/analysis-agent/config");
  assert(analysisAgentConfig.body?.agentName, "analysis agent config did not return an agent name");
  assert(analysisAgentConfig.body?.enabled === true, "analysis agent config is not enabled in production");
  assert(
    analysisAgentConfig.body?.endpointConfigured === true,
    "analysis agent config does not have an endpoint configured",
  );
  const analysisAgentSmoke = await postJsonAllowFailure("/api/analysis-agent/send-research", {
    marketItem: {
      evidence_summary: { evidence_count: 0, news_evidence_count: 0, odds_evidence_count: 0 },
      latest_snapshot: {
        captured_at: new Date().toISOString(),
        liquidity: 500,
        no_price: 0.99,
        volume: 1000,
        yes_price: 0.01,
      },
      market: {
        active: true,
        closed: false,
        event_slug: "smoke-analysis-agent-event",
        event_title: "Smoke analysis agent event",
        id: 987654,
        market_slug: "smoke-analysis-agent-market",
        question: "Smoke analysis agent market?",
        sport_type: "politics",
      },
    },
    normalizedUrl: "https://polymarket.com/market/smoke-analysis-agent-market",
    url: "https://polymarket.com/market/smoke-analysis-agent-market",
  });
  assert(analysisAgentSmoke.status === 200, `analysis agent smoke returned HTTP ${analysisAgentSmoke.status}`);
  assert(analysisAgentSmoke.body?.automaticAvailable === true, "analysis agent smoke was not automatic");
  assert(analysisAgentSmoke.body?.errorCode !== "bridge_disabled", "analysis agent smoke returned bridge_disabled");
  assert(
    ["agent_researching", "fallback_required", "report_received"].includes(analysisAgentSmoke.body?.status),
    `analysis agent smoke returned unexpected status ${analysisAgentSmoke.body?.status}`,
  );
  assertTextExcludes(
    JSON.stringify(analysisAgentSmoke.body),
    ["DATABASE_URL", "SECRET", "TOKEN", "API_KEY", "copy-trading", "ROI 100%", "win rate 100%"],
    "analysis agent smoke response",
  );
  const externalOddsSmoke = await postJsonAllowFailure("/api/external-odds/compare", {
    eventDate: "2026-05-15",
    eventSlug: "nba-sas-min-2026-05-15",
    league: "nba",
    marketSlug: "nba-sas-min-2026-05-15",
    marketTitle: "Spurs vs. Timberwolves",
    outcomePrices: [
      { label: "Spurs", price: 0.655, side: "UNKNOWN" },
      { label: "Timberwolves", price: 0.345, side: "UNKNOWN" },
    ],
    participants: ["Spurs", "Timberwolves"],
    sport: "nba",
  });
  assert(externalOddsSmoke.status === 200, `external odds smoke returned HTTP ${externalOddsSmoke.status}`);
  assert(
    ["available", "partial", "no_match", "disabled", "unavailable", "timeout", "error"].includes(
      externalOddsSmoke.body?.status,
    ),
    `external odds smoke returned unexpected status ${externalOddsSmoke.body?.status}`,
  );
  assertTextExcludes(
    JSON.stringify(externalOddsSmoke.body),
    ["DATABASE_URL", "SECRET", "TOKEN", "API_KEY", "key=", "copy-trading"],
    "external odds smoke response",
  );
  const analyzeLoadingPanel = validateAnalyzeLoadingPanelSource();
  const overview = await fetchJson(PROXY_PATH);
  const items = Array.isArray(overview.body.items) ? overview.body.items : [];
  const expectedTitles = items
    .map((item) => item?.market?.question || item?.question)
    .filter(Boolean)
    .slice(0, 20);
  const totalOrItems = Math.max(Number(overview.body.total_count ?? 0), items.length);
  const visibleMarketCount = totalOrItems;

  assert(
    totalOrItems >= MIN_SOCCER_MARKETS,
    `${PROXY_PATH} returned total_count=${overview.body.total_count}, items length=${items.length}`,
  );
  assert(items.length > 0, `${PROXY_PATH} returned no items`);
  assert(expectedTitles.length > 0, `${PROXY_PATH} did not return market titles`);

  const baseDom = await dumpDom(urlFor(SPORTS_SOCCER_PATH));
  const baseRender = validateRenderedSoccerPage(
    baseDom,
    expectedTitles,
    "sports/soccer",
    totalOrItems,
    visibleMarketCount,
  );
  const cacheBusterPath = `${SPORTS_SOCCER_PATH}?debug_ts=${Date.now()}`;
  const cacheBusterDom = await dumpDom(urlFor(cacheBusterPath));
  const cacheBusterRender = validateRenderedSoccerPage(
    cacheBusterDom,
    expectedTitles,
    "sports/soccer cache buster",
    totalOrItems,
    visibleMarketCount,
  );
  const homeDom = await dumpDom(urlFor(HOME_PATH));
  const homeRender = validatePublicProductPage(homeDom, "home", [
    "Inicio",
    "Analizar enlace",
    "Rendimiento",
  ]);
  const homeText = visibleText(homeDom);
  assertTextIncludesOneOf(
    homeText,
    ["Analiza enlaces de Polymarket", "mide si PolySignal acierta"],
    "home analyzer hero",
  );
  assertTextIncludes(homeText, "Pega un enlace", "home analyzer step");
  assertTextIncludes(homeText, "Confirma el mercado", "home confirmation step");
  assertTextIncludes(homeText, "Guarda la lectura", "home history save step");
  assertTextIncludes(homeText, "Verifica el resultado", "home verification step");
  assertTextIncludes(homeText, "Wallet Intelligence", "home wallet layer");
  assertTextIncludes(homeText, "no genera una prediccion propia", "home honest estimate copy");
  assertTextExcludes(homeText, ["Mercados destacados", "Explorar mercados deportivos"], "home legacy sports copy");
  const sportsDom = await dumpDom(urlFor(SPORTS_PATH));
  const sportsRender = validatePublicProductPage(sportsDom, "sports", [
    "Vista legacy",
    "Deportes principales",
  ]);
  const sportsText = visibleText(sportsDom);
  assertTextIncludes(sportsText, "Actualizar", "sports update button");
  assertTextIncludesOneOf(sportsText, UPDATE_TEXT, "sports update timestamp");
  assertSportIconsRendered(sportsDom, "sports selector");
  const briefingDom = await dumpDom(urlFor(BRIEFING_PATH));
  const briefingRender = validatePublicProductPage(briefingDom, "briefing", [
    "Resumen diario",
    "Para revisar hoy",
  ]);
  const briefingText = visibleText(briefingDom);
  assertTextIncludesOneOf(briefingText, QUICK_SUMMARY_TEXT, "briefing quick summary");
  assertTextIncludesOneOf(briefingText, WHY_VISIBLE_TEXT, "briefing priority explanation");
  assertTextIncludesOneOf(briefingText, REVIEW_REASON_TEXT, "briefing review reason");
  assertTextIncludes(briefingText, "Actualizar", "briefing update button");
  assertTextIncludesOneOf(briefingText, UPDATE_TEXT, "briefing update timestamp");
  assertSportIconsRendered(briefingDom, "briefing sports selector");
  const alertsDom = await dumpDom(urlFor(ALERTS_PATH));
  const alertsRender = validatePublicProductPage(alertsDom, "alerts", ["Alertas"]);
  const alertsText = visibleText(alertsDom);
  assertTextIncludes(alertsText, "Actualizar", "alerts update button");
  assertTextIncludesOneOf(alertsText, UPDATE_TEXT, "alerts update timestamp");
  assertTextIncludes(alertsText, "Seguimiento de analisis guardados", "alerts analyzer history focus");
  assertTextIncludes(alertsText, "Alertas de perfiles", "alerts profile section");
  assertTextIncludesOneOf(alertsText, ["Pendientes de resolucion", "Pendientes de resolución"], "alerts saved analyses");
  assertTextIncludesOneOf(
    alertsText,
    ["Alertas locales", "este navegador", "Historial"],
    "alerts local tracking copy",
  );
  assertTextIncludesOneOf(
    alertsText,
    ["No hay alertas todavia", "No hay alertas todavía", "Todas las alertas", "Perfil destacado detectado"],
    "alerts profile state",
  );
  assertTextIncludesOneOf(
    alertsText,
    ["Todavia no tienes analisis guardados", "No hay analisis pendientes", "Esperando resolucion"],
    "alerts analysis state",
  );
  const watchlistDom = await dumpDom(urlFor(WATCHLIST_PATH));
  const watchlistRender = validatePublicProductPage(watchlistDom, "watchlist", ["Mi lista"]);
  const watchlistText = visibleText(watchlistDom);
  assertTextIncludesOneOf(
    watchlistText,
    [
      "Mercados guardados",
      "Todavia no tienes mercados guardados",
      "Todavía no tienes mercados guardados",
    ],
    "watchlist useful heading",
  );
  assertTextIncludesOneOf(
    watchlistText,
    ["Vista legacy", "Analizar enlace", "Ver detalle"],
    "watchlist legacy analyzer copy",
  );
  assertTextIncludesOneOf(
    watchlistText,
    ["Historial", "Analizador de enlaces", "analisis"],
    "watchlist hidden legacy copy",
  );
  assertTextIncludes(watchlistText, "Vaciar Mi lista", "watchlist local clear control");
  const historyDom = await dumpDom(urlFor(HISTORY_PATH));
  const historyRender = validatePublicProductPage(historyDom, "history", ["Historial"]);
  const historyText = visibleText(historyDom);
  assertTextIncludesOneOf(
    historyText,
    ["Historial de analisis", "Historial de anÃ¡lisis", "Historial de análisis"],
    "history heading",
  );
  assertTextIncludesOneOf(
    historyText,
    ["Todavia no tienes analisis guardados", "Analisis guardados", "Análisis guardados"],
    "history useful state",
  );
  assertTextIncludesOneOf(
    historyText,
    ["Analizar nuevo enlace", "Analizar enlace", "Ver rendimiento"],
    "history market CTA",
  );
  assertTextIncludesOneOf(
    historyText,
    ["Comparacion mercado vs PolySignal", "Comparación mercado vs PolySignal"],
    "history probability comparison",
  );
  assertTextIncludesOneOf(
    historyText,
    ["Este historial es local", "este navegador"],
    "history local privacy copy",
  );
  assertTextIncludes(historyText, "Borrar historial local", "history local clear control");
  assertTextIncludes(historyText, "Actualizar resultados", "history automatic result refresh");
  assertTextIncludesOneOf(
    historyText,
    ["Como se mide PolySignal", "Cómo se mide PolySignal"],
    "history clear prediction measurement copy",
  );
  assertTextIncludesOneOf(
    historyText,
    ["Predicciones claras", "Sin decision fuerte", "Sin decisión fuerte"],
    "history clear prediction metrics",
  );
  assertTextIncludesOneOf(
    historyText,
    ["Solo probabilidad de mercado", "Con estimacion PolySignal real", "Con estimación PolySignal real"],
    "history estimate readiness metrics",
  );
  assertTextIncludesOneOf(
    historyText,
    ["Resolucion automatica", "Resolución automática", "Verificado con Polymarket", "Resultado verificable"],
    "history automatic resolution copy",
  );
  assertTextExcludes(
    historyText,
    ["Gano YES", "Ganó YES", "Gano NO", "Ganó NO"],
    "history manual resolution controls",
  );
  assertTextIncludesOneOf(
    historyText,
    ["Seguimiento", "Ultima revision", "Ver rendimiento"],
    "history lifecycle tracking",
  );
  const profilesDom = await dumpDom(urlFor(PROFILES_PATH));
  const profilesRender = validatePublicProductPage(profilesDom, "profiles", ["Perfiles"]);
  const profilesText = visibleText(profilesDom);
  assertTextIncludes(profilesText, "Billeteras publicas destacadas", "profiles public heading");
  assertTextIncludesOneOf(
    profilesText,
    ["Registro persistente", "Sincronizacion parcial", "Guardado local por ahora", "Cargando perfiles"],
    "profiles persistent storage state",
  );
  assertTextIncludes(profilesText, "Actualizar todos", "profiles refresh all control");
  assertTextIncludesOneOf(
    profilesText,
    ["Los perfiles destacados apareceran", "Perfil destacado", "Perfiles guardados"],
    "profiles empty or persisted state copy",
  );
  assertTextIncludesOneOf(
    profilesText,
    ["No da consejos de copy-trading", "No es recomendacion de copy-trading"],
    "profiles anti-copy-trading copy",
  );
  assertTextExcludes(profilesText, ["tokenId", "conditionId", "transactionHash", "raw JSON"], "profiles technical noise");
  const copyTradingStatus = await fetchJson("/api/backend/copy-trading/status");
  const copyTradingWallets = await fetchJson("/api/backend/copy-trading/wallets");
  const liveCopyWallets = Array.isArray(copyTradingWallets.body?.wallets) ? copyTradingWallets.body.wallets : [];
  const liveCopyWalletLabels = liveCopyWallets
    .map((wallet) => wallet?.label)
    .filter(Boolean)
    .slice(0, 5);
  const liveCopyWalletCount = liveCopyWallets.length;
  const copyTradingWaitExpression =
    liveCopyWalletCount === 0
      ? `document.body && document.body.innerText.includes("Sin wallets. Agrega una direccion publica para iniciar el modo demo.")`
      : `(() => {
          const text = document.body?.innerText || "";
          const rowCount = document.querySelectorAll(".copy-wallet-row").length;
          const detailVisible = Boolean(document.querySelector(".copy-wallet-detail"));
          return text.includes("Wallets seguidas") && rowCount > 0 && detailVisible;
        })()`;
  const copyTradingDom = await inspectDomWithChrome(urlFor(COPY_TRADING_PATH), {
    attempts: 2,
    timeoutMs: liveCopyWalletCount > 0 ? 60000 : 45000,
    waitExpression: copyTradingWaitExpression,
    waitLabel: "copy trading hydrated data",
  });
  // Copy Trading puede mencionar "API" de forma genérica en copy no sensible.
  // Lo que debe seguir bloqueado aquí son secretos, errores crudos y frases técnicas más específicas.
  const copyTradingRender = validatePublicProductPage(copyTradingDom, "copy trading", ["Copiar Wallets"], ["API"]);
  const copyTradingText = visibleText(copyTradingDom);
  for (const expected of [
    "Resumen",
    "Wallets",
    "Copias abiertas",
    "Historial de trades",
    "Auditoria",
    "Ultima actualizacion",
    "Auto-refresh",
    "Watcher demo",
    "5 segundos",
    "Iniciar watcher demo",
    "Pausar watcher",
    "Ejecutar una vez",
    "Prueba manual de un solo escaneo.",
    "No ejecuta operaciones reales",
    "No ejecuta operaciones reales",
    "Wallets seguidas",
    "Escanear wallets",
    "Agregar wallet",
    "Ordenar por",
    "Copias abiertas",
    "PnL total demo",
  ]) {
    assertTextIncludes(copyTradingText, expected, `copy trading amount/input ${expected}`);
  }
  assertDomIncludes(
    copyTradingDom,
    'placeholder="Buscar por alias o wallet"',
    "copy trading amount/input search placeholder",
  );
  assert(
    copyTradingDom.includes('data-testid="copy-refresh-now"') ||
      copyTradingDom.includes("copy-primary-button"),
    "copy trading refresh action selector did not render expected DOM content",
  );
  assertTextIncludesOneOf(
    copyTradingText,
    liveCopyWalletCount > 0
      ? ["Lista compacta", "Wallet seleccionada", "Estado actual"]
      : [
          "Cargando modulo Copiar Wallets...",
          "Lista compacta",
          "Sin wallets. Agrega una direccion publica para iniciar el modo demo.",
          "Selecciona una wallet para ver su detalle.",
        ],
    "copy trading loading/master-detail state",
  );
  if (liveCopyWalletCount > 0) {
    assert(
      liveCopyWalletLabels.some((label) => copyTradingText.includes(label)),
      "copy trading did not render any live wallet label even though the backend returned wallets",
    );
    assertTextExcludes(
      copyTradingText,
      ["Sin wallets. Agrega una direccion publica para iniciar el modo demo."],
      "copy trading live wallets",
    );
  }
  assert(
    copyTradingStatus.body?.wallets_enabled === liveCopyWalletCount,
    `copy trading status wallets_enabled=${copyTradingStatus.body?.wallets_enabled}, wallets endpoint count=${liveCopyWalletCount}`,
  );
  assert(copyTradingDom.includes("Escanea esta wallet una vez ahora."), "copy trading scan button helper missing");
  assertTextExcludes(copyTradingText, ["Editar modo"], "copy trading legacy edit label");
  assertTextIncludesOneOf(copyTradingText, ["Demo activo", "Real no conectado"], "copy trading mode badges");
  assertTextIncludesOneOf(
    copyTradingText,
    ["Bloqueado hasta configurar credenciales", "Real bloqueado"],
    "copy trading real lock",
  );
  assertTextIncludesOneOf(copyTradingText, ["Estado actual", "Sin wallets."], "copy trading current status summary");
  assertTextIncludesOneOf(copyTradingText, ["Ultimo trade", "Sin wallets."], "copy trading last trade summary");
  assertTextIncludesOneOf(copyTradingText, ["Actividad", "Sin wallets."], "copy trading activity summary");
  assertTextIncludesOneOf(
    copyTradingText,
    [
      "Wallets lentas",
      "Timeouts reales",
      "Pendientes",
      "escanea todas las wallets activas cada 5s",
      "mantener el escaneo live",
    ],
    "copy trading watcher health summary",
  );
  assertTextIncludesOneOf(
    copyTradingText,
    ["Escaneadas / pendientes", "Ciclo recortado por carga", "Timeouts reales", "Wallets lentas"],
    "copy trading watcher pending semantics",
  );
  assertTextIncludesOneOf(copyTradingText, ["Demo", "Sin wallets."], "copy trading demo summary");
  assertTextIncludesOneOf(copyTradingText, ["Copiadas", "Sin copias demo todavia", "Sin wallets."], "copy trading demo copied summary");
  assertTextIncludesOneOf(copyTradingText, ["Saltadas", "Sin copias demo todavia", "Sin wallets."], "copy trading demo skipped summary");
  assertTextIncludesOneOf(copyTradingText, ["Copias demo abiertas", "Todavia no hay copias demo abiertas."], "copy trading open demo positions");
  assertTextIncludesOneOf(copyTradingText, ["Historial de trades", "Todavia no hay copias demo cerradas."], "copy trading closed demo history");
  assertTextIncludesOneOf(copyTradingText, ["Rendimiento demo", "Todavia no hay copias demo suficientes para calcular rendimiento."], "copy trading pnl summary");
  assertTextIncludesOneOf(
    copyTradingText,
    [
      "Capital demo usado",
      "Todavia no hay copias demo suficientes para calcular rendimiento.",
      "Cargando metricas demo...",
      "Actualizando metricas...",
    ],
    "copy trading capital used",
  );
  assertTextIncludesOneOf(
    copyTradingText,
    [
      "PnL total demo",
      "Todavia no hay copias demo suficientes para calcular rendimiento.",
      "Cargando metricas demo...",
      "Actualizando metricas...",
    ],
    "copy trading total pnl",
  );
  assertTextIncludesOneOf(
    copyTradingText,
    ["ROI demo", "Todavia no hay copias demo suficientes para calcular rendimiento.", "Cargando metricas demo...", "Actualizando metricas..."],
    "copy trading roi",
  );
  assertTextIncludesOneOf(
    copyTradingText,
    ["Win rate", "Todavia no hay copias demo suficientes para calcular rendimiento.", "Cargando metricas demo...", "Actualizando metricas..."],
    "copy trading win rate",
  );
  assertTextIncludesOneOf(
    copyTradingText,
    ["PnL abierto", "Todavia no hay copias demo suficientes para calcular rendimiento.", "Cargando metricas demo...", "Actualizando metricas..."],
    "copy trading open pnl",
  );
  assertTextIncludesOneOf(
    copyTradingText,
    ["PnL realizado", "Todavia no hay copias demo suficientes para calcular rendimiento.", "Cargando metricas demo...", "Actualizando metricas..."],
    "copy trading realized pnl",
  );
  assertTextIncludesOneOf(
    copyTradingText,
    ["Precio actual pendiente", "PnL actual", "Todavia no hay copias demo abiertas."],
    "copy trading open position pricing",
  );
  assertTextExcludes(
    copyTradingText,
    [
      "Backend no disponible",
      "Conectar Phantom",
      "Conectar MetaMask",
      "private key",
      "seed phrase",
      "POLY_SECRET",
      "POLY_API_KEY",
      "authorization header",
      "stack trace",
      "trade_too_old",
      "trading real activo",
      "orden real enviada",
    ],
    "copy trading security leakage",
  );
  const invalidCopyWalletRoute = await postJsonAllowFailure("/api/backend/copy-trading/wallets", {
    copy_amount_mode: "preset",
    copy_amount_usd: 5,
    copy_buys: true,
    copy_sells: true,
    label: "qa-invalid-no-write",
    mode: "demo",
    wallet_input: "0x123",
  });
  assert(
    invalidCopyWalletRoute.status === 400 || invalidCopyWalletRoute.status === 405,
    `copy trading invalid wallet route returned status ${invalidCopyWalletRoute.status}`,
  );
  if (invalidCopyWalletRoute.status === 400) {
    assertTextIncludes(
      JSON.stringify(invalidCopyWalletRoute.body),
      "formato 0x",
      "copy trading invalid wallet route",
    );
  }
  const performanceDom = await dumpDom(urlFor(PERFORMANCE_PATH));
  const performanceRender = validatePublicProductPage(performanceDom, "performance", ["Rendimiento"]);
  const performanceText = visibleText(performanceDom);
  assertTextIncludes(performanceText, "Rendimiento de PolySignal", "performance heading");
  assertTextIncludes(performanceText, "Precision general", "performance accuracy");
  assertTextIncludesOneOf(
    performanceText,
    ["Pendientes de investigacion", "Pendientes"],
    "performance research pending bucket",
  );
  assertTextIncludesOneOf(
    performanceText,
    ["Pendientes", "Sin decision fuerte", "no cuentan"],
    "performance honest counting",
  );
  const methodologyDom = await dumpDom(urlFor(METHODOLOGY_PATH));
  const methodologyRender = validatePublicProductPage(methodologyDom, "methodology", ["Metodologia"]);
  const methodologyText = visibleText(methodologyDom);
  assertTextIncludes(methodologyText, "Que cuenta y que no cuenta", "methodology measurement copy");
  assertTextIncludes(methodologyText, "solo precio de mercado", "methodology market price rule");
  const analyzeDom = await dumpDom(urlFor(ANALYZE_PATH));
  const analyzeRender = validatePublicProductPage(analyzeDom, "analyze", ["Analizar enlace"]);
  const analyzeText = visibleText(analyzeDom);
  assertTextIncludes(analyzeText, "Polymarket", "analyze polymarket copy");
  assertTextIncludes(analyzeText, "Analizar", "analyze button");
  assert(
    analyzeDom.includes("Pega aquí el enlace del evento o mercado") ||
      analyzeDom.includes("Pega aquÃ­ el enlace del evento o mercado") ||
      analyzeDom.includes("Pega aqu"),
    "analyze link placeholder missing",
  );
  assertTextIncludesOneOf(
    analyzeText,
    ["Vista previa del análisis", "Vista previa del anÃ¡lisis", "Vista previa del anÃƒÂ¡lisis"],
    "analyze preview heading",
  );
  assertTextIncludesOneOf(
    analyzeText,
    ["Qué hace Samantha", "QuÃ© hace Samantha", "QuÃƒÂ© hace Samantha"],
    "analyze Samantha explainer",
  );
  assertTextIncludesOneOf(
    analyzeText,
    ["Samantha analiza", "Samantha har", "Pega el enlace"],
    "analyze automatic Samantha copy",
  );
  assertTextIncludes(analyzeText, "Pegar enlace", "analyze step one");
  assertTextIncludes(analyzeText, "Confirmar mercado", "analyze step two");
  assertTextIncludes(analyzeText, "Recibir lectura clara", "analyze step three");
  assertTextExcludes(
    analyzeText,
    [
      "JSON",
      "snapshot",
      "proxy",
      "OCR",
      "stack trace",
      "localhost",
      "DATABASE_URL",
      "secret",
      "Descargar tarea",
      "Copiar schema",
      "Cargar reporte",
      "Validar reporte",
      "Descargar instrucciones",
      "Descargar brief",
    ],
    "analyze initial technical noise",
  );
  assertTextIncludesOneOf(
    analyzeText,
    [
      "Pega aquí el enlace del evento o mercado",
      "Pega aquÃ­ el enlace del evento o mercado",
      "Pega aqu",
      "evento o mercado",
    ],
    "analyze input copy",
  );
  assertTextIncludesOneOf(
    analyzeText,
    ["Pegar enlace", "Confirmar mercado", "Recibir lectura clara"],
    "analyze flow explanation",
  );
  assertTextIncludesOneOf(
    analyzeText,
    ["Ver historial", "historial", "Lectura clara"],
    "analyze history connection copy",
  );
  assertTextIncludesOneOf(
    analyzeText,
    ["PolySignal no garantiza resultados", "predicciones del mercado pueden cambiar", "Metodología"],
    "analyze local privacy copy",
  );
  const invalidAnalyzeDom = await dumpDom(urlFor(`${ANALYZE_PATH}?url=not-a-link&auto=1`));
  const invalidAnalyzeText = visibleText(invalidAnalyzeDom);
  assertTextIncludesOneOf(
    invalidAnalyzeText,
    ["No pudimos analizar ese enlace", "Revisa que este completo", "solo aceptamos enlaces de Polymarket"],
    "analyze invalid url state",
  );
  assertTextExcludes(invalidAnalyzeText, PUBLIC_TECHNICAL_TEXT, "analyze invalid public copy");
  assertTextExcludes(invalidAnalyzeText, PUBLIC_SECURITY_TEXT, "analyze invalid secret leakage");
  const dangerousAnalyzeDom = await dumpDom(
    urlFor(`${ANALYZE_PATH}?url=${encodeURIComponent("http://169.254.169.254/latest/meta-data")}&auto=1`),
  );
  const dangerousAnalyzeText = visibleText(dangerousAnalyzeDom);
  assertTextIncludesOneOf(
    dangerousAnalyzeText,
    ["No pudimos analizar ese enlace", "solo aceptamos enlaces de Polymarket"],
    "analyze dangerous url state",
  );
  assertTextExcludes(dangerousAnalyzeText, PUBLIC_SECURITY_TEXT, "analyze dangerous secret leakage");
  const invalidResolutionRoute = await postJsonAllowFailure("/api/resolve-polymarket", {
    url: "https://polymarket.com.evil.com/event/test",
  });
  assert(
    invalidResolutionRoute.status === 400,
    `resolve-polymarket accepted dangerous URL with status ${invalidResolutionRoute.status}`,
  );
  assertTextExcludes(
    JSON.stringify(invalidResolutionRoute.body),
    ["DATABASE_URL", "SECRET", "TOKEN", "postgres://", "https://polisygnal.onrender.com", "markets"],
    "resolve-polymarket invalid response",
  );
  const invalidAnalyzeRoute = await postJsonAllowFailure("/api/analyze-polymarket-link", {
    url: "https://polymarket.com.evil.com/event/test",
  });
  assert(
    invalidAnalyzeRoute.status === 400,
    `analyze-polymarket-link accepted dangerous URL with status ${invalidAnalyzeRoute.status}`,
  );
  assertTextExcludes(
    JSON.stringify(invalidAnalyzeRoute.body),
    ["DATABASE_URL", "SECRET", "TOKEN", "postgres://", "https://polisygnal.onrender.com", "markets"],
    "analyze-polymarket-link invalid response",
  );
  const legacySamanthaRoute = await fetchJsonAllowFailure(LEGACY_SAMANTHA_ANALYSIS_PATH);
  assert(
    legacySamanthaRoute.status === 404 || legacySamanthaRoute.status === 405,
    `legacy samantha-polysignal-analysis route was reintroduced with status ${legacySamanthaRoute.status}`,
  );
  assertTextExcludes(
    JSON.stringify(legacySamanthaRoute.body),
    ["DATABASE_URL", "SECRET", "TOKEN", "postgres://", "markets/overview", "sports/soccer"],
    "legacy samantha route response",
  );
  const nbaAnalyzeRoute = await postJsonAllowFailure("/api/analyze-polymarket-link", {
    url: "https://polymarket.com/es/sports/nba/nba-okc-lal-2026-05-11",
  });
  assert(nbaAnalyzeRoute.status === 200, `NBA analyze route returned status ${nbaAnalyzeRoute.status}`);
  const nbaAnalyzeRouteText = JSON.stringify(nbaAnalyzeRoute.body);
  assert(
    nbaAnalyzeRoute.body.status === "ok" ||
      nbaAnalyzeRoute.body.status === "not_found" ||
      nbaAnalyzeRoute.body.status === "unsupported" ||
      nbaAnalyzeRoute.body.status === "error",
    `NBA analyze route returned unexpected status ${nbaAnalyzeRoute.body.status}`,
  );
  assertTextExcludes(nbaAnalyzeRouteText, ["Sevilla", "Espanyol", "Atletico", "Atlético"], "NBA analyze route cross-sport guard");
  if (nbaAnalyzeRoute.body.status === "ok") {
    assert(nbaAnalyzeRoute.body.eventSlug === "nba-okc-lal-2026-05-11", "NBA analyze route returned the wrong event slug");
    assert(nbaAnalyzeRouteText.includes("Thunder") || nbaAnalyzeRouteText.includes("Lakers"), "NBA analyze route did not return NBA market text");
  }
  const laligaAnalyzeRoute = await postJsonAllowFailure("/api/analyze-polymarket-link", {
    url: "https://polymarket.com/es/sports/laliga/lal-cel-lev-2026-05-12",
  });
  assert(laligaAnalyzeRoute.status === 200, `LaLiga analyze route returned status ${laligaAnalyzeRoute.status}`);
  assertTextExcludes(
    JSON.stringify(laligaAnalyzeRoute.body),
    ["Sevilla", "Espanyol", "Atletico", "Atlético"],
    "LaLiga analyze route unrelated match guard",
  );
  const exactMarketAnalyzeRoute = await postJsonAllowFailure("/api/analyze-polymarket-link", {
    url: "https://polymarket.com/market/lal-cel-lev-2026-05-12-cel",
  });
  assert(exactMarketAnalyzeRoute.status === 200, `exact market analyze route returned status ${exactMarketAnalyzeRoute.status}`);
  const exactMarketAnalyzeRouteText = JSON.stringify(exactMarketAnalyzeRoute.body);
  assertTextExcludes(
    exactMarketAnalyzeRouteText,
    ["Sevilla", "Espanyol", "Atletico", "Atlético"],
    "exact market analyze route unrelated match guard",
  );
  if (exactMarketAnalyzeRoute.body.status === "ok") {
    assert(
      exactMarketAnalyzeRoute.body.marketSlug === "lal-cel-lev-2026-05-12-cel",
      `exact market analyze route returned wrong market slug ${exactMarketAnalyzeRoute.body.marketSlug}`,
    );
    assert(
      exactMarketAnalyzeRoute.body.markets?.length === 1,
      `exact market analyze route returned ${exactMarketAnalyzeRoute.body.markets?.length} markets instead of one`,
    );
    assert(
      exactMarketAnalyzeRoute.body.markets?.[0]?.slug === "lal-cel-lev-2026-05-12-cel",
      "exact market analyze route returned a sibling market",
    );
  } else {
    assert(
      exactMarketAnalyzeRoute.body.status === "not_found" ||
        exactMarketAnalyzeRoute.body.status === "unsupported" ||
        exactMarketAnalyzeRoute.body.status === "error",
      `exact market analyze route returned unexpected status ${exactMarketAnalyzeRoute.body.status}`,
    );
  }

  const validAnalyzeUrl = "https://polymarket.com/es/sports/nba/nba-okc-lal-2026-05-11";
  const validAnalyzeDom = await dumpDom(
    urlFor(`${ANALYZE_PATH}?url=${encodeURIComponent(validAnalyzeUrl)}&auto=1`),
  );
  const validAnalyzeText = visibleText(validAnalyzeDom);
  assertNoFullWalletAddress(validAnalyzeText, "analyze valid wallet privacy");
  const validAnalyzeNoMatch =
    (validAnalyzeText.includes("No encontramos una coincidencia exacta") ||
      validAnalyzeText.includes("No pudimos obtener este mercado desde Polymarket")) &&
    validAnalyzeText.includes("Guardar como pendiente");
  const validAnalyzeSelection = validAnalyzeText.includes("Analizar este mercado");
  const validAnalyzeReport =
    validAnalyzeText.includes("Centro de analisis") ||
    validAnalyzeText.includes("Lectura del mercado");
  assert(
    validAnalyzeNoMatch || validAnalyzeSelection || validAnalyzeReport,
    "analyze valid link did not reach selector, report, or no-match state",
  );
  assertTextIncludesOneOf(
    validAnalyzeText,
    [
      "Confirma que mercado quieres analizar",
      "Mercado detectado",
      "No encontramos una coincidencia exacta",
      "No pudimos obtener este mercado desde Polymarket",
      "Coincidencia encontrada",
      "Posibles coincidencias",
    ],
    "analyze valid match state",
  );
  assertTextExcludes(validAnalyzeText, ["Sevilla", "Espanyol", "Atletico", "Atlético"], "analyze NBA cross-sport guard");
  if (validAnalyzeNoMatch) {
    assertTextIncludesOneOf(
      validAnalyzeText,
      ["Guardar como pendiente", "Revisar enlace"],
      "analyze no-match compact actions",
    );
  } else if (validAnalyzeSelection && !validAnalyzeReport) {
    assertTextIncludes(validAnalyzeText, "Analizar este mercado", "analyze selector action");
    assertTextIncludesOneOf(
      validAnalyzeText,
      ["Polymarket devolvio", "Thunder", "Lakers", "O/U", "Spread"],
      "analyze selector uses live Polymarket data",
    );
  } else {
    assertTextIncludesOneOf(validAnalyzeText, ["Analizar este mercado", "Lectura del mercado"], "analyze confirm-before-deep-analysis");
    assertTextIncludesOneOf(validAnalyzeText, ["Lectura del mercado", "Precio Si", "Precio Sí"], "analyze market reading");
    assertTextIncludesOneOf(validAnalyzeText, ["Centro de analisis", "Selecciona que mercado", "Lectura del mercado"], "analyze product center summary");
    assertTextIncludesOneOf(validAnalyzeText, ["Detalles avanzados del analisis", "Selecciona que mercado"], "analyze deep analyzer readiness");
    assertTextIncludesOneOf(validAnalyzeText, ["Pendiente de integracion", "Detalles avanzados del analisis", "Selecciona que mercado"], "analyze future layers are not presented as active");
    assertTextIncludesOneOf(validAnalyzeText, ["Resultado del analisis", "Preparacion de estimacion PolySignal", "Selecciona que mercado"], "analyze found summary");
    assertTextIncludesOneOf(
      validAnalyzeText,
      ["Detalles avanzados del analisis", "Lectura por capas", "Selecciona que mercado", "Preparacion de datos", "Preparación de datos"],
      "analyze reviewed layers",
    );
    assertTextIncludesOneOf(validAnalyzeText, ["Historial relacionado", "Guardar analisis", "Analizar este mercado"], "analyze related history layer");
    assertTextIncludesOneOf(validAnalyzeText, ["Probabilidad del mercado", "Precio Si", "Precio Sí"], "analyze market probability");
    assertTextIncludesOneOf(
      validAnalyzeText,
      ["Estimacion PolySignal", "Estimación PolySignal", "Analizar este mercado"],
      "analyze polysignal probability",
    );
    assertTextIncludesOneOf(
      validAnalyzeText,
      [
        "no una prediccion propia de PolySignal",
        "no una predicción propia de PolySignal",
        "Por ahora solo mostramos la probabilidad del mercado",
        "PolySignal preparara una sola lectura profunda",
      ],
      "analyze market price is not polysignal estimate",
    );
    assertTextIncludesOneOf(
      validAnalyzeText,
      ["Preparacion de estimacion PolySignal", "Preparación de estimación PolySignal", "Senales independientes", "Analizar este mercado"],
      "analyze estimate readiness",
    );
    assertTextIncludesOneOf(validAnalyzeText, ["Contexto del partido", "Analizar este mercado"], "analyze soccer context");
    assertTextIncludesOneOf(validAnalyzeText, ["Investigacion externa", "Analizar este mercado"], "analyze external research readiness");
    assertTextIncludesOneOf(validAnalyzeText, ["Inteligencia de billeteras", "Analizar este mercado"], "analyze wallet intelligence readiness");
    assertTextIncludesOneOf(
      validAnalyzeText,
      [
        "no intenta identificar personas reales",
        "actividad publica de wallets",
        "Senal auxiliar de billeteras",
        "movimientos relevantes de $100",
        "movimientos relevantes de 100",
        "Billeteras publicas relevantes detectadas",
        "Analizar este mercado",
      ],
      "analyze wallet privacy copy",
    );
    assertTextIncludesOneOf(
      validAnalyzeText,
      ["Fuentes verificadas: 0", "Fuentes verificadas", "Analizar este mercado"],
      "analyze no fake external sources",
    );
    assertTextIncludesOneOf(validAnalyzeText, ["Preparacion de datos", "Analizar este mercado"], "analyze non predictive readiness");
    assertTextIncludesOneOf(
      validAnalyzeText,
      ["no genera una prediccion PolySignal", "no genera una predicción PolySignal", "Analizar este mercado"],
      "analyze soccer context is not prediction",
    );
  }
  assertTextExcludes(validAnalyzeText, ["Fake finding", "Demo finding", "fixture de prueba"], "analyze invented evidence");
  assertTextExcludes(validAnalyzeText, ["0x1234567890abcdef", ...PUBLIC_WALLET_FORBIDDEN_TEXT], "analyze fake wallet data");
  if (!validAnalyzeNoMatch) {
    assertTextIncludesOneOf(validAnalyzeText, ["Decision de PolySignal", "Analizar este mercado"], "analyze clear decision panel");
    assertTextIncludesOneOf(
      validAnalyzeText,
      ["umbral de decision del 55%", "umbral de decisión del 55%", "Analizar este mercado"],
      "analyze clear decision threshold copy",
    );
    assertTextIncludesOneOf(
      validAnalyzeText,
      ["Guardar analisis", "Guardar análisis", "Guardar como seguimiento", "Guardado en historial", "Analizar este mercado"],
      "analyze save history action",
    );
  }
  assertTextExcludes(validAnalyzeText, PUBLIC_TECHNICAL_TEXT, "analyze valid public copy");
  assertTextExcludes(validAnalyzeText, PUBLIC_SECURITY_TEXT, "analyze valid secret leakage");
  const blockedProxy = await fetchJsonAllowFailure("/api/backend/https:%2F%2Fexample.com");
  assert(
    blockedProxy.status === 404 || blockedProxy.status === 400,
    `backend proxy allowed absolute target with status ${blockedProxy.status}`,
  );
  assertTextExcludes(
    JSON.stringify(blockedProxy.body),
    ["https://polisygnal.onrender.com", "DATABASE_URL", "postgres://", "postgresql://"],
    "backend proxy blocked response",
  );
  const unexpectedProxy = await fetchJsonAllowFailure("/api/backend/admin/secrets");
  assert(
    unexpectedProxy.status === 404,
    `backend proxy allowed unexpected path with status ${unexpectedProxy.status}`,
  );
  assertTextExcludes(
    JSON.stringify(unexpectedProxy.body),
    ["https://polisygnal.onrender.com", "DATABASE_URL", "postgres://", "postgresql://"],
    "backend proxy unexpected response",
  );
  const longProxyQuery = await fetchJsonAllowFailure(`/api/backend/markets/overview?${"q=x&".repeat(500)}`);
  assert(longProxyQuery.status === 414, `backend proxy allowed oversized query with status ${longProxyQuery.status}`);
  assertTextExcludes(
    JSON.stringify(longProxyQuery.body),
    ["https://polisygnal.onrender.com", "DATABASE_URL", "postgres://", "postgresql://"],
    "backend proxy long query response",
  );
  const detailMarketId = items[0]?.market?.id || items[0]?.market_id || 1;
  const marketDetailDom = await dumpDom(urlFor(`/markets/${detailMarketId}`));
  const marketDetailRender = validateMarketDetailPage(marketDetailDom, "market detail");
  const marketDetailText = visibleText(marketDetailDom);
  assertTextIncludesOneOf(
    marketDetailText,
    ["Guardar en historial", "Guardado en historial"],
    "market detail history action",
  );
  const dataHealthDom = await dumpDom(urlFor(DATA_HEALTH_PATH));
  const dataHealthRender = validateDataHealthPage(dataHealthDom, totalOrItems);
  const internalDataStatusDom = await dumpDom(urlFor(INTERNAL_DATA_STATUS_PATH));
  const internalDataStatusRender = validateInternalDataStatusPage(internalDataStatusDom);
  const workflowDom = await dumpDom(urlFor(WORKFLOW_PATH));
  const workflowRender = validateWorkflowPage(workflowDom);

  console.log(
    JSON.stringify(
      {
        status: "ok",
        frontend: FRONTEND_BASE_URL,
        build_info: {
          app: buildInfo.body.app,
          commit: buildInfo.body.commit,
          env: buildInfo.body.env,
          api_host: buildInfo.body.api_host,
          proxy: buildInfo.body.proxy,
        },
        samantha_bridge_health: {
          status: samanthaBridgeHealth.status,
          service: samanthaBridgeHealth.body.service,
        },
        analysis_agent: {
          agent: analysisAgentConfig.body.agentName,
          endpoint_configured: analysisAgentConfig.body.endpointConfigured,
          status: analysisAgentSmoke.body.status,
        },
        security: securityHeaders,
        proxy: {
          status: overview.status,
          content_type: overview.contentType,
          total_count: overview.body.total_count,
          items_length: items.length,
        },
        render: baseRender,
        cache_buster_render: cacheBusterRender,
        public_pages: {
          home: homeRender,
          sports: sportsRender,
          briefing: briefingRender,
          alerts: alertsRender,
          watchlist: watchlistRender,
          history: historyRender,
          profiles: profilesRender,
          copy_trading: copyTradingRender,
          performance: performanceRender,
          methodology: methodologyRender,
          analyze: analyzeRender,
          market_detail: marketDetailRender,
        },
        copy_trading_invalid_wallet: {
          status: invalidCopyWalletRoute.status,
        },
        analyze_loading_panel: analyzeLoadingPanel,
        data_health: dataHealthRender,
        internal_data_status: internalDataStatusRender,
        workflow: workflowRender,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "failed", error: error.message }, null, 2));
  process.exitCode = 1;
});
