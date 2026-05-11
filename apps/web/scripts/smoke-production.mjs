import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const FRONTEND_BASE_URL = (
  process.env.POLYSIGNAL_SMOKE_FRONTEND_URL || "https://polisygnal-web.vercel.app"
).replace(/\/$/, "");
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
const ANALYZE_PATH = "/analyze";
const DATA_HEALTH_PATH = "/data-health";
const INTERNAL_DATA_STATUS_PATH = "/internal/data-status";
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
  "Mercados deportivos",
  "Resumen diario",
  "Mi lista",
  "Alertas",
  "Historial",
  "Analizar enlace",
];
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
  "Kalshi",
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

function urlFor(path) {
  return `${FRONTEND_BASE_URL}${path}`;
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

async function dumpDom(url) {
  const chrome = findChrome();
  assert(chrome, "Chrome/Chromium was not found. Set CHROME_PATH to run the render smoke test.");

  const userDataDir = mkdtempSync(join(tmpdir(), "polisygnal-smoke-chrome-"));
  try {
    const { stdout, stderr } = await execFileAsync(
      chrome,
      [
        "--headless",
        "--disable-gpu",
        "--disable-extensions",
        "--no-first-run",
        `--user-data-dir=${userDataDir}`,
        "--virtual-time-budget=15000",
        "--dump-dom",
        url,
      ],
      { maxBuffer: 8 * 1024 * 1024, timeout: 30000 },
    );
    return `${stdout || ""}${stderr || ""}`;
  } finally {
    rmSync(userDataDir, { force: true, recursive: true });
  }
}

function countMarketCards(dom) {
  return (dom.match(/<article\s+class="sports-market-card/g) || []).length;
}

function countMatchCards(dom) {
  return (dom.match(/<article\s+class="soccer-match-card/g) || []).length;
}

function validatePublicProductPage(dom, label, requiredText = []) {
  const text = visibleText(dom);
  const navText = sidebarText(dom);
  for (const publicItem of PUBLIC_NAV_TEXT) {
    assertTextIncludes(navText, publicItem, `${label} public sidebar`);
  }
  for (const expected of requiredText) {
    assertTextIncludes(text, expected, label);
  }
  assertTextExcludes(navText, INTERNAL_NAV_TEXT, `${label} public sidebar`);
  assertTextExcludes(text, PUBLIC_TECHNICAL_TEXT, `${label} public copy`);
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
  assertTextIncludesOneOf(text, ["Seguir mercado", "Siguiendo"], `${label} watchlist action`);
  assertTextIncludes(text, "Volver a mercados deportivos", label);
  assertTextIncludesOneOf(text, SOCCER_RETURN_TEXT, `${label} sport return`);
  assertTextIncludesOneOf(text, WHAT_THIS_MEANS_TEXT, label);
  assertTextIncludesOneOf(text, WHY_VISIBLE_TEXT, `${label} visible reason`);
  assertTextIncludesOneOf(text, REVIEW_REASON_TEXT, `${label} public state`);
  assertTextIncludesOneOf(text, ACTIVITY_TEXT, `${label} activity context`);
  assertTextIncludesOneOf(
    text,
    ["Estimacion PolySignal", "Estimación PolySignal", "Estimacion propia no disponible", "Estimación propia no disponible"],
    `${label} honest polysignal estimate state`,
  );
  assertTextExcludes(
    text,
    ["Ver JSON", "API docs", "Endpoint", "model_version", "market_type", "raw data"],
    label,
  );
  assertTextExcludes(text, PUBLIC_SECURITY_TEXT, `${label} secret leakage`);
  return { watchlist_action_found: true, public_detail_copy_found: true };
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
  assertTextExcludes(
    text,
    ["DATABASE_URL", "SECRET", "TOKEN", "API_KEY", "postgres://", "postgresql://"],
    "internal data status",
  );
  return { internal_data_status_found: true, secrets_hidden: true };
}

async function main() {
  const buildInfo = await fetchJson(BUILD_INFO_PATH);
  validateBuildInfo(buildInfo);
  const securityHeaders = validateSecurityHeaders(await fetchPage(HOME_PATH), "home headers");
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
    "Ver mercados deportivos",
    "Ver resumen diario",
    "Revisar alertas",
  ]);
  const homeText = visibleText(homeDom);
  assertTextIncludesOneOf(homeText, REVIEW_NOW_TEXT, "home review block");
  assertTextIncludes(homeText, "Mercados destacados", "home live content");
  assertTextIncludes(homeText, "Movimientos recientes", "home recent activity");
  assertTextIncludesOneOf(homeText, ACTIVITY_TEXT, "home activity label");
  assertTextIncludes(homeText, "Actualizar", "home update button");
  assertTextIncludesOneOf(homeText, UPDATE_TEXT, "home update timestamp");
  assertTextIncludesOneOf(
    homeText,
    [
      "TodavÃ­a no tienes mercados guardados",
      "Todavía no tienes mercados guardados",
      "Cuando sigas un mercado",
      "Explorar mercados deportivos",
      ...ANALYSIS_TEXT,
    ],
    "home watchlist",
  );
  assertTextIncludesOneOf(
    homeText,
    ["Esta lista se guarda en este navegador", "Siguiendo", "Seguir"],
    "home local watchlist copy",
  );
  const sportsDom = await dumpDom(urlFor(SPORTS_PATH));
  const sportsRender = validatePublicProductPage(sportsDom, "sports", [
    "Mercados deportivos",
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
  assertTextIncludes(alertsText, "Mercados que sigues", "alerts local watchlist");
  assertTextIncludes(alertsText, "Cómo leer estas alertas", "alerts meaning copy");
  assertTextIncludesOneOf(
    alertsText,
    ["Mi lista se lee desde este navegador", "este navegador"],
    "alerts local privacy copy",
  );
  assertTextIncludesOneOf(alertsText, ["Mercado actualizado", "Listo para revisar", "No tienes mercados en seguimiento"], "alerts real context");
  assertTextIncludesOneOf(
    alertsText,
    ["No tienes mercados en seguimiento", "Mercado en seguimiento"],
    "alerts watchlist state",
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
    ["Esta lista se guarda en este navegador", "Ver detalle", "Explorar mercados deportivos"],
    "watchlist local storage copy",
  );
  assertTextIncludesOneOf(
    watchlistText,
    ["no se sincroniza todavia", "no se sincroniza entre dispositivos"],
    "watchlist local privacy copy",
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
    ["Ver mercados deportivos", "Explorar futbol", "Explorar fÃºtbol"],
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
  const analyzeDom = await dumpDom(urlFor(ANALYZE_PATH));
  const analyzeRender = validatePublicProductPage(analyzeDom, "analyze", ["Analizar enlace"]);
  const analyzeText = visibleText(analyzeDom);
  assertTextIncludes(analyzeText, "Polymarket", "analyze polymarket copy");
  assertTextIncludes(analyzeText, "Analizar", "analyze button");
  assertTextIncludesOneOf(
    analyzeText,
    ["Pega un enlace", "Enlace de Polymarket"],
    "analyze input copy",
  );
  assertTextIncludesOneOf(
    analyzeText,
    ["historial local de este navegador", "este navegador"],
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
  const validAnalyzeUrl = `https://polymarket.com/event/${slugForAnalyzeSmoke(expectedTitles[0])}`;
  const validAnalyzeDom = await dumpDom(
    urlFor(`${ANALYZE_PATH}?url=${encodeURIComponent(validAnalyzeUrl)}&auto=1`),
  );
  const validAnalyzeText = visibleText(validAnalyzeDom);
  assertTextIncludesOneOf(
    validAnalyzeText,
    ["Coincidencia encontrada", "Posibles coincidencias"],
    "analyze valid match state",
  );
  assertTextIncludes(validAnalyzeText, "Lectura del mercado", "analyze market reading");
  assertTextIncludes(validAnalyzeText, "Probabilidad del mercado", "analyze market probability");
  assertTextIncludesOneOf(
    validAnalyzeText,
    ["Estimacion PolySignal", "Estimación PolySignal"],
    "analyze polysignal probability",
  );
  assertTextIncludesOneOf(
    validAnalyzeText,
    [
      "no una prediccion propia de PolySignal",
      "no una predicción propia de PolySignal",
      "Por ahora solo mostramos la probabilidad del mercado",
    ],
    "analyze market price is not polysignal estimate",
  );
  assertTextIncludesOneOf(
    validAnalyzeText,
    ["Preparacion de estimacion PolySignal", "Preparación de estimación PolySignal", "Senales independientes"],
    "analyze estimate readiness",
  );
  assertTextIncludes(validAnalyzeText, "Decision de PolySignal", "analyze clear decision panel");
  assertTextIncludesOneOf(
    validAnalyzeText,
    ["umbral de decision del 55%", "umbral de decisión del 55%"],
    "analyze clear decision threshold copy",
  );
  assertTextIncludesOneOf(
    validAnalyzeText,
    ["Guardar analisis", "Guardar análisis", "Guardado en historial"],
    "analyze save history action",
  );
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
          analyze: analyzeRender,
          market_detail: marketDetailRender,
        },
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
