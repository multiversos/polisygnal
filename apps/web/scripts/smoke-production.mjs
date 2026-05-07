import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const FRONTEND_BASE_URL = (
  process.env.POLYSIGNAL_SMOKE_FRONTEND_URL || "https://polisygnal-web.vercel.app"
).replace(/\/$/, "");
const MIN_SOCCER_MARKETS = Number(process.env.POLYSIGNAL_SMOKE_MIN_SOCCER_MARKETS || 50);
const EXPECTED_COMMIT = process.env.POLYSIGNAL_SMOKE_EXPECTED_COMMIT || "";
const PROXY_PATH = "/api/backend/markets/overview?sport_type=soccer&limit=50";
const BUILD_INFO_PATH = "/api/build-info";
const SPORTS_SOCCER_PATH = "/sports/soccer";
const DATA_HEALTH_PATH = "/data-health";
const WORKFLOW_PATH = "/workflow";
const RENDER_ERROR_TEXT = [
  "Datos no disponibles",
  "La API no respondio",
  "La API no respondió",
  "Todavia no hay mercados",
  "Todavía no hay mercados",
];

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

function assertTextIncludes(text, expected, label) {
  assert(text.includes(expected), `${label} did not render expected text: ${expected}`);
}

function assertTextExcludes(text, blocked, label) {
  const found = blocked.filter((value) => text.includes(value));
  assert(found.length === 0, `${label} rendered blocked text: ${found.join(", ")}`);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchJson(path) {
  const attempts = 3;
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
      if (attempt === attempts) {
        break;
      }
    }
    await sleep(1200 * attempt);
  }
  throw lastError;
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

function validateRenderedSoccerPage(dom, expectedTitles, label) {
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
  assert(matchCardCount >= 1, `${label} rendered ${matchCardCount} soccer match cards`);
  assert(blockedTexts.length === 0, `${label} rendered error/empty text: ${blockedTexts.join(", ")}`);
  assert(titleFound, `${label} did not render any expected soccer market title`);
  assertTextIncludes(text, `Mercados ${MIN_SOCCER_MARKETS}`, label);
  assertTextIncludes(text, `Vista mercados (${MIN_SOCCER_MARKETS})`, label);
  assertTextIncludes(text, "Partidos detectados", label);
  assertTextIncludes(text, "Próximos partidos", label);

  return {
    market_card_count: cardCount,
    match_card_count: matchCardCount,
    title_found: titleFound,
    markets_summary_found: true,
    market_toggle_found: true,
    match_summary_found: true,
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

function validateDataHealthPage(dom) {
  const text = visibleText(dom);
  assertTextIncludes(text, `Markets visibles ${MIN_SOCCER_MARKETS}`, "data-health");
  assertTextIncludes(text, "Con snapshot 35", "data-health");
  assertTextIncludes(text, "Con predicción 35", "data-health");
  assertTextExcludes(
    text,
    ["Mercados totales 0", "Por deporte 0 deportes", "Polymarket live", "Discovery read-only"],
    "data-health",
  );
  assertTextExcludes(text, ["Salud de datos no disponible", "La API no respondió"], "data-health");
  return { real_markets_found: true, old_zero_blocks_hidden: true };
}

function validateWorkflowPage(dom) {
  const text = visibleText(dom);
  assertTextIncludes(text, "Con predicción", "workflow");
  assertTextIncludes(text, "Solo datos", "workflow");
  assertTextIncludes(text, "Con predicción 35", "workflow");
  assertTextIncludes(text, "Solo datos 15", "workflow");
  assertTextExcludes(text, ["Workflow no disponible", "La API no respondió"], "workflow");
  return { prediction_column_found: true, data_only_column_found: true };
}

async function main() {
  const buildInfo = await fetchJson(BUILD_INFO_PATH);
  validateBuildInfo(buildInfo);
  const overview = await fetchJson(PROXY_PATH);
  const items = Array.isArray(overview.body.items) ? overview.body.items : [];
  const expectedTitles = items
    .map((item) => item?.market?.question || item?.question)
    .filter(Boolean)
    .slice(0, 20);
  const totalOrItems = Math.max(Number(overview.body.total_count ?? 0), items.length);

  assert(
    totalOrItems >= MIN_SOCCER_MARKETS,
    `${PROXY_PATH} returned total_count=${overview.body.total_count}, items length=${items.length}`,
  );
  assert(items.length > 0, `${PROXY_PATH} returned no items`);
  assert(expectedTitles.length > 0, `${PROXY_PATH} did not return market titles`);

  const baseDom = await dumpDom(urlFor(SPORTS_SOCCER_PATH));
  const baseRender = validateRenderedSoccerPage(baseDom, expectedTitles, "sports/soccer");
  const cacheBusterPath = `${SPORTS_SOCCER_PATH}?debug_ts=${Date.now()}`;
  const cacheBusterDom = await dumpDom(urlFor(cacheBusterPath));
  const cacheBusterRender = validateRenderedSoccerPage(
    cacheBusterDom,
    expectedTitles,
    "sports/soccer cache buster",
  );
  const dataHealthDom = await dumpDom(urlFor(DATA_HEALTH_PATH));
  const dataHealthRender = validateDataHealthPage(dataHealthDom);
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
        proxy: {
          status: overview.status,
          content_type: overview.contentType,
          total_count: overview.body.total_count,
          items_length: items.length,
        },
        render: baseRender,
        cache_buster_render: cacheBusterRender,
        data_health: dataHealthRender,
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
