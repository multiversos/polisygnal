import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const FRONTEND_BASE_URL = (
  process.env.POLYSIGNAL_SMOKE_FRONTEND_URL || "https://polisygnal-web.vercel.app"
).replace(/\/$/, "");
const MIN_SOCCER_MARKETS = Number(process.env.POLYSIGNAL_SMOKE_MIN_SOCCER_MARKETS || 20);
const PROXY_PATH = "/api/backend/markets/overview?sport_type=soccer&limit=20";
const BUILD_INFO_PATH = "/api/build-info";
const SPORTS_SOCCER_PATH = "/sports/soccer";
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

async function fetchJson(path) {
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
  assert(response.ok, `${path} returned HTTP ${response.status}: ${JSON.stringify(body)}`);
  return { body, contentType: response.headers.get("content-type"), status: response.status };
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
  const blockedTexts = RENDER_ERROR_TEXT.filter((text) => dom.includes(text));
  const titleFound = expectedTitles.some((title) => title && dom.includes(title));

  assert(
    cardCount >= MIN_SOCCER_MARKETS || matchCardCount > 0,
    `${label} rendered ${cardCount} market cards and ${matchCardCount} match cards`,
  );
  assert(blockedTexts.length === 0, `${label} rendered error/empty text: ${blockedTexts.join(", ")}`);
  assert(titleFound, `${label} did not render any expected soccer market title`);

  return { market_card_count: cardCount, match_card_count: matchCardCount, title_found: titleFound };
}

async function main() {
  const buildInfo = await fetchJson(BUILD_INFO_PATH);
  const overview = await fetchJson(PROXY_PATH);
  const items = Array.isArray(overview.body.items) ? overview.body.items : [];
  const expectedTitles = items
    .map((item) => item?.market?.question || item?.question)
    .filter(Boolean)
    .slice(0, 20);

  assert(overview.body.total_count >= MIN_SOCCER_MARKETS, `proxy total_count=${overview.body.total_count}`);
  assert(items.length >= MIN_SOCCER_MARKETS, `proxy items length=${items.length}`);
  assert(expectedTitles.length > 0, "proxy did not return market titles");

  const baseDom = await dumpDom(urlFor(SPORTS_SOCCER_PATH));
  const baseRender = validateRenderedSoccerPage(baseDom, expectedTitles, "sports/soccer");
  const cacheBusterPath = `${SPORTS_SOCCER_PATH}?debug_ts=${Date.now()}`;
  const cacheBusterDom = await dumpDom(urlFor(cacheBusterPath));
  const cacheBusterRender = validateRenderedSoccerPage(
    cacheBusterDom,
    expectedTitles,
    "sports/soccer cache buster",
  );

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
