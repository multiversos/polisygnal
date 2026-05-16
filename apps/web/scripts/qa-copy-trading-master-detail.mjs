import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const resultsDir = resolve(appRoot, "test-results", "copy-trading-master-detail");
let localPort = Number(process.env.POLYSIGNAL_COPY_TRADING_QA_PORT || 3217);
let localBaseUrl = `http://127.0.0.1:${localPort}`;
const chromeDebugPort = Number(process.env.POLYSIGNAL_COPY_TRADING_QA_CHROME_PORT || 9337);
const chromePath =
  process.env.CHROME_PATH ||
  [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].find((candidate) => existsSync(candidate));

const qaStart = new Date("2026-05-16T16:00:00.000Z");
const endpointsHit = new Set();
const consoleMessages = [];

if (!chromePath) {
  throw new Error("Chrome or Edge was not found. Set CHROME_PATH to run the Copy Trading visual QA.");
}

mkdirSync(resultsDir, { recursive: true });

function isoAgo(seconds) {
  return new Date(qaStart.getTime() - seconds * 1000).toISOString();
}

const walletNames = [
  "Alpha Edge",
  "North Star",
  "Quiet Whale",
  "Paused Value",
  "Momentum Desk",
  "Hedge Scout",
  "Blue Delta",
  "Sharp Tape",
  "Slow Arb",
  "Paused Macro",
  "Signal Nine",
  "Risk Pivot",
  "Nova Copy",
  "Tight Spread",
  "Late Steam",
  "Gamma Watch",
  "Cash Flow",
  "Micro Edge",
  "Deep Liquidity",
  "Range Rider",
  "Event Scout",
  "Calm Beta",
  "Fast Window",
  "Muted Whale",
  "Cyan Signal",
  "Red Hedge",
  "Green Drift",
  "Yellow Lock",
  "Blue Ledger",
  "Value Loop",
  "Spread Lab",
  "Pace Maker",
  "Long Bias",
  "Short Bias",
  "Outcome Desk",
  "Terminal QA",
];

const markets = [
  "NBA Finals Game 6 winner",
  "Fed rate decision in June",
  "Champions League total goals",
  "Bitcoin above 100k by Friday",
  "Election turnout above forecast",
  "Oil closes above weekly range",
];

const wallets = walletNames.map((label, index) => {
  const addressDigit = String((index % 9) + 1);
  const proxyWallet = `0x${String(index + 1).padStart(40, addressDigit)}`;
  const freshnessCycle = index % 4;
  const freshnessStatus =
    freshnessCycle === 0
      ? "live_candidate"
      : freshnessCycle === 1
        ? "recent_outside_window"
        : freshnessCycle === 2
          ? "historical"
          : "unknown_time";
  return {
    id: `qa-wallet-${index + 1}`,
    label,
    profile_url: index % 5 === 0 ? `https://polymarket.com/profile/${proxyWallet}` : null,
    proxy_wallet: proxyWallet,
    enabled: index % 7 !== 3,
    mode: "demo",
    real_trading_enabled: false,
    copy_buys: true,
    copy_sells: index % 6 !== 0,
    copy_amount_mode: "preset",
    copy_amount_usd: String([25, 50, 75, 100, 150, 200][index % 6]),
    max_trade_usd: String([80, 120, 200, 300][index % 4]),
    max_daily_usd: String([250, 400, 750, 1000][index % 4]),
    max_slippage_bps: 150,
    max_delay_seconds: [10, 30, 60, 120, 300][index % 5],
    copy_window_seconds: [10, 30, 60, 120, 300][index % 5],
    sports_only: index % 5 === 0,
    last_scan_at: isoAgo(80 + index * 70),
    last_trade_at: isoAgo(25 + index * 170),
    recent_trades: 1 + (index % 7),
    historical_trades: 8 + index,
    live_candidates: index % 4,
    demo_copied_count: index % 5 === 2 ? 0 : 3 + index,
    demo_buy_count: 2 + (index % 5),
    demo_sell_count: index % 6,
    demo_skipped_count: index % 4,
    last_demo_copy_at: index % 5 === 2 ? null : isoAgo(120 + index * 220),
    last_demo_copy_action: index % 2 === 0 ? "buy" : "sell",
    last_demo_copy_amount_usd: index % 5 === 2 ? null : String(25 + index * 4),
    last_trade_freshness_status: freshnessStatus,
    last_trade_freshness_label:
      freshnessStatus === "live_candidate"
        ? "Copiable ahora"
        : freshnessStatus === "recent_outside_window"
          ? "Fuera de ventana"
          : freshnessStatus === "historical"
            ? "Historico"
            : "Sin hora confiable",
    created_at: isoAgo(86400 + index * 900),
    updated_at: isoAgo(100 + index * 90),
  };
});

function makeTrade(wallet, tradeIndex) {
  const walletIndex = Number(wallet.id.replace("qa-wallet-", ""));
  return {
    id: `qa-trade-${wallet.id}-${tradeIndex}`,
    wallet_id: wallet.id,
    source_transaction_hash: `0xqa${walletIndex}${tradeIndex}`.padEnd(66, "0"),
    dedupe_key: `qa-dedupe-${wallet.id}-${tradeIndex}`,
    source_proxy_wallet: wallet.proxy_wallet,
    condition_id: `qa-condition-${tradeIndex}`,
    asset: `qa-asset-${tradeIndex}`,
    outcome: tradeIndex % 2 === 0 ? "YES" : "NO",
    market_title: markets[(walletIndex + tradeIndex) % markets.length],
    market_slug: `qa-market-${walletIndex}-${tradeIndex}`,
    side: tradeIndex % 2 === 0 ? "buy" : "sell",
    source_price: String((0.36 + ((walletIndex + tradeIndex) % 8) * 0.055).toFixed(3)),
    source_size: String(40 + walletIndex * 2 + tradeIndex * 11),
    source_amount_usd: String(24 + walletIndex * 3 + tradeIndex * 12),
    source_timestamp: isoAgo(40 + walletIndex * 80 + tradeIndex * 520),
    detected_at: isoAgo(35 + walletIndex * 80 + tradeIndex * 520),
    age_seconds: 40 + walletIndex * 80 + tradeIndex * 520,
    freshness_status:
      tradeIndex === 0
        ? "live_candidate"
        : tradeIndex === 1
          ? "recent_outside_window"
          : "historical",
    freshness_label:
      tradeIndex === 0 ? "Copiable ahora" : tradeIndex === 1 ? "Fuera de ventana" : "Historico",
    copy_window_seconds: wallet.copy_window_seconds,
    is_live_candidate: tradeIndex === 0,
  };
}

const trades = wallets.slice(0, 24).flatMap((wallet) => [
  makeTrade(wallet, 0),
  makeTrade(wallet, 1),
  makeTrade(wallet, 2),
]);

const positions = wallets.slice(0, 18).flatMap((wallet, walletIndex) =>
  [0, 1].map((positionIndex) => {
    const positive = walletIndex % 4 === 0 || walletIndex % 4 === 1;
    const pending = walletIndex % 9 === 2 && positionIndex === 0;
    const pnlValue = pending ? null : positive ? 6 + walletIndex * 1.7 - positionIndex : -4 - walletIndex * 0.9 - positionIndex;
    const entryAmount = 35 + walletIndex * 5 + positionIndex * 10;
    return {
      id: `qa-position-${wallet.id}-${positionIndex}`,
      wallet_id: wallet.id,
      wallet_label: wallet.label,
      proxy_wallet: wallet.proxy_wallet,
      opening_order_id: `qa-order-open-${wallet.id}-${positionIndex}`,
      closing_order_id: positionIndex === 1 ? `qa-order-close-${wallet.id}` : null,
      condition_id: `qa-condition-${walletIndex}-${positionIndex}`,
      asset: `qa-asset-${walletIndex}-${positionIndex}`,
      outcome: positionIndex % 2 === 0 ? "YES" : "NO",
      market_title: markets[(walletIndex + positionIndex) % markets.length],
      market_slug: `qa-position-market-${walletIndex}-${positionIndex}`,
      entry_action: positionIndex % 2 === 0 ? "buy" : "sell",
      entry_price: String((0.42 + (walletIndex % 8) * 0.045).toFixed(3)),
      entry_amount_usd: String(entryAmount),
      entry_size: String(60 + walletIndex * 4),
      current_price: pending ? null : String((0.47 + (walletIndex % 7) * 0.044).toFixed(3)),
      current_value_usd: pending ? null : String((entryAmount + (pnlValue ?? 0)).toFixed(2)),
      unrealized_pnl_usd: positionIndex === 0 && pnlValue !== null ? String(pnlValue.toFixed(2)) : null,
      unrealized_pnl_percent:
        positionIndex === 0 && pnlValue !== null ? String(((pnlValue / entryAmount) * 100).toFixed(2)) : null,
      realized_pnl_usd: positionIndex === 1 && pnlValue !== null ? String(pnlValue.toFixed(2)) : null,
      exit_price: positionIndex === 1 ? "0.620" : null,
      exit_value_usd: positionIndex === 1 && pnlValue !== null ? String((entryAmount + pnlValue).toFixed(2)) : null,
      close_reason: positionIndex === 1 ? "demo_exit" : null,
      status: pending ? "price_pending" : positionIndex === 1 ? "closed" : "open",
      opened_at: isoAgo(500 + walletIndex * 260 + positionIndex * 420),
      closed_at: positionIndex === 1 ? isoAgo(240 + walletIndex * 250) : null,
      updated_at: isoAgo(120 + walletIndex * 220 + positionIndex * 180),
    };
  }),
);

const openPositions = positions.filter((position) => position.status !== "closed");
const closedPositions = positions.filter((position) => position.status === "closed");

const tickSummary = {
  wallets_scanned: wallets.length,
  trades_detected: trades.length,
  new_trades: 18,
  orders_simulated: 24,
  buy_simulated: 14,
  sell_simulated: 10,
  orders_skipped: 9,
  orders_blocked: 0,
  live_candidates: 12,
  recent_outside_window: 10,
  historical_trades: 50,
  skipped_reasons: {
    outside_window: 5,
    duplicate_trade: 3,
    missing_price: 1,
  },
  errors: [],
};

const events = wallets.slice(0, 12).map((wallet, index) => ({
  id: `qa-event-${index + 1}`,
  wallet_id: wallet.id,
  level: index % 5 === 0 ? "warning" : "info",
  event_type: index % 3 === 0 ? "scan_completed" : "demo_copy",
  message:
    index % 3 === 0
      ? `Escaneo demo completado para ${wallet.label}`
      : `Copia demo ${index % 2 === 0 ? "BUY" : "SELL"} registrada para ${wallet.label}`,
  metadata: {
    qa: true,
    source: "copy-trading-master-detail-visual-qa",
  },
  created_at: isoAgo(90 + index * 160),
}));

const orders = closedPositions.slice(0, 16).map((position, index) => ({
  id: `qa-order-${index + 1}`,
  wallet_id: position.wallet_id,
  detected_trade_id: trades[index]?.id ?? null,
  mode: "demo",
  action: index % 2 === 0 ? "buy" : "sell",
  status: index % 5 === 0 ? "skipped" : "simulated",
  reason: index % 5 === 0 ? "outside_window" : null,
  intended_amount_usd: String(25 + index * 4),
  intended_size: String(50 + index * 2),
  simulated_price: String((0.4 + index * 0.015).toFixed(3)),
  freshness_status: index % 4 === 0 ? "live_candidate" : "historical",
  freshness_label: index % 4 === 0 ? "Copiable ahora" : "Historico",
  created_at: isoAgo(140 + index * 140),
  updated_at: isoAgo(120 + index * 140),
}));

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const openPnl = openPositions.reduce((total, position) => total + numeric(position.unrealized_pnl_usd), 0);
const realizedPnl = closedPositions.reduce((total, position) => total + numeric(position.realized_pnl_usd), 0);
const openCapital = openPositions.reduce((total, position) => total + numeric(position.entry_amount_usd), 0);
const closedCapital = closedPositions.reduce((total, position) => total + numeric(position.entry_amount_usd), 0);
const winningClosed = closedPositions.filter((position) => numeric(position.realized_pnl_usd) > 0).length;
const losingClosed = closedPositions.filter((position) => numeric(position.realized_pnl_usd) < 0).length;

const demoPnlSummary = {
  open_positions_count: openPositions.length,
  closed_positions_count: closedPositions.length,
  capital_demo_used_usd: String((openCapital + closedCapital).toFixed(2)),
  open_capital_usd: String(openCapital.toFixed(2)),
  closed_capital_usd: String(closedCapital.toFixed(2)),
  open_current_value_usd: String((openCapital + openPnl).toFixed(2)),
  open_pnl_usd: String(openPnl.toFixed(2)),
  realized_pnl_usd: String(realizedPnl.toFixed(2)),
  total_demo_pnl_usd: String((openPnl + realizedPnl).toFixed(2)),
  demo_roi_percent: String((((openPnl + realizedPnl) / Math.max(1, openCapital + closedCapital)) * 100).toFixed(2)),
  win_rate_percent: String(((winningClosed / Math.max(1, closedPositions.length)) * 100).toFixed(2)),
  average_closed_pnl_usd: String((realizedPnl / Math.max(1, closedPositions.length)).toFixed(2)),
  best_closed_pnl_usd: String(Math.max(...closedPositions.map((position) => numeric(position.realized_pnl_usd))).toFixed(2)),
  worst_closed_pnl_usd: String(Math.min(...closedPositions.map((position) => numeric(position.realized_pnl_usd))).toFixed(2)),
  winning_closed_count: winningClosed,
  losing_closed_count: losingClosed,
  price_pending_count: openPositions.filter((position) => position.status === "price_pending").length,
};

function bodyForCopyTradingRequest(requestUrl, method) {
  const url = new URL(requestUrl);
  const path = url.pathname.replace(/^\/api\/backend/, "");
  endpointsHit.add(path);

  if (path === "/copy-trading/status") {
    return {
      body: {
        mode_default: "demo",
        real_trading_available: false,
        real_trading_block_reason: "QA visual: credenciales reales bloqueadas",
        wallets_total: wallets.length,
        wallets_enabled: wallets.filter((wallet) => wallet.enabled).length,
        trades_detected: trades.length,
        orders_simulated: orders.filter((order) => order.status === "simulated").length,
        orders_skipped: orders.filter((order) => order.status === "skipped").length,
        orders_blocked: 0,
        last_scan_at: isoAgo(60),
      },
    };
  }
  if (path === "/copy-trading/watcher/status" || path.startsWith("/copy-trading/watcher/")) {
    return {
      body: {
        enabled: true,
        running: false,
        interval_seconds: 5,
        current_run_started_at: null,
        last_run_started_at: isoAgo(75),
        last_run_at: isoAgo(70),
        last_run_finished_at: isoAgo(66),
        last_run_duration_ms: 1280,
        average_run_duration_ms: 1410,
        next_run_at: new Date(qaStart.getTime() + 5000).toISOString(),
        last_result: tickSummary,
        error_count: 0,
        slow_wallet_count: 1,
        timeout_count: 0,
        is_over_interval: false,
        behind_by_seconds: 0,
        last_error: null,
        message: "QA visual con watcher mockeado",
      },
    };
  }
  if (path === "/copy-trading/wallets" && method === "GET") {
    return { body: { wallets } };
  }
  if (path === "/copy-trading/trades") {
    return { body: { trades } };
  }
  if (path === "/copy-trading/orders") {
    return { body: { orders } };
  }
  if (path === "/copy-trading/events") {
    return { body: { events } };
  }
  if (path === "/copy-trading/demo/positions/open") {
    return { body: { positions: openPositions } };
  }
  if (path === "/copy-trading/demo/positions/history") {
    return { body: { positions: closedPositions } };
  }
  if (path === "/copy-trading/demo/pnl-summary") {
    return { body: { summary: demoPnlSummary } };
  }
  if (path === "/copy-trading/demo/tick" || path.endsWith("/scan") || path === "/copy-trading/watcher/run-once") {
    return { body: tickSummary };
  }
  if (path === "/copy-trading/wallets" && method === "POST") {
    return { body: wallets[0] };
  }
  if (path.startsWith("/copy-trading/wallets/") && method === "PATCH") {
    return { body: wallets[0] };
  }
  if (path.startsWith("/copy-trading/wallets/") && method === "DELETE") {
    return { body: null, status: 204 };
  }

  return { body: {}, status: 200 };
}

class ChromeConnection {
  constructor(webSocketUrl) {
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.socket = new WebSocket(webSocketUrl);
  }

  async open() {
    await new Promise((resolvePromise, rejectPromise) => {
      this.socket.addEventListener("open", resolvePromise, { once: true });
      this.socket.addEventListener("error", rejectPromise, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolvePromise, rejectPromise } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) {
          rejectPromise(new Error(JSON.stringify(message.error)));
        } else {
          resolvePromise(message.result || {});
        }
        return;
      }
      const listeners = this.listeners.get(message.method) || [];
      for (const listener of listeners) {
        listener(message.params || {});
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
      }, 15000);
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

  on(method, listener) {
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  close() {
    this.socket.close();
  }
}

function wait(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${url} responded ${response.status}`);
  }
  return response.json();
}

async function waitForHttp(url, label, timeoutMs = 60000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 404 || response.status === 500) {
        return;
      }
      lastError = new Error(`${label} responded ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await wait(500);
  }
  throw new Error(`${label} did not become available: ${lastError?.message || "timeout"}`);
}

function canListen(port) {
  return new Promise((resolvePromise) => {
    const server = createServer();
    server.once("error", () => resolvePromise(false));
    server.once("listening", () => {
      server.close(() => resolvePromise(true));
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
  throw new Error(`No available local QA port found starting at ${startPort}`);
}

function spawnNextDev() {
  const child = spawn("cmd.exe", ["/d", "/s", "/c", `npm.cmd --workspace apps/web run dev -- -p ${localPort}`], {
    cwd: resolve(appRoot, "..", ".."),
    env: {
      ...process.env,
      NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:65535",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", (chunk) => {
    const text = String(chunk).trim();
    if (text) {
      console.log(`[next] ${text}`);
    }
  });
  child.stderr.on("data", (chunk) => {
    const text = String(chunk).trim();
    if (text) {
      console.error(`[next] ${text}`);
    }
  });
  return child;
}

function spawnChrome() {
  const userDataDir = join(process.env.TEMP || resultsDir, `polysignal-copy-trading-qa-${Date.now()}`);
  return spawn(
    chromePath,
    [
      "--headless=new",
      `--remote-debugging-port=${chromeDebugPort}`,
      `--user-data-dir=${userDataDir}`,
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    {
      stdio: "ignore",
      windowsHide: true,
    },
  );
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

async function waitForChrome() {
  const versionUrl = `http://127.0.0.1:${chromeDebugPort}/json/version`;
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < 30000) {
    try {
      return await fetchJson(versionUrl);
    } catch (error) {
      lastError = error;
      await wait(250);
    }
  }
  throw new Error(`Chrome debugger did not become available: ${lastError?.message || "timeout"}`);
}

async function createTarget(url) {
  return fetchJson(`http://127.0.0.1:${chromeDebugPort}/json/new?${encodeURIComponent(url)}`, {
    method: "PUT",
  });
}

async function evaluate(connection, expression) {
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

async function waitForExpression(connection, expression, label, timeoutMs = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate(connection, expression)) {
      return;
    }
    await wait(250);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function setViewport(connection, width, height) {
  await connection.send("Emulation.setDeviceMetricsOverride", {
    deviceScaleFactor: 1,
    height,
    mobile: width <= 520,
    width,
  });
}

async function screenshot(connection, fileName) {
  const result = await connection.send("Page.captureScreenshot", {
    captureBeyondViewport: false,
    format: "png",
    fromSurface: true,
  });
  const filePath = join(resultsDir, fileName);
  writeFileSync(filePath, Buffer.from(result.data, "base64"));
  return filePath;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function pageMetrics(connection) {
  return evaluate(
    connection,
    `(() => {
      const rectFor = (selector) => {
        const element = Array.from(document.querySelectorAll(selector)).find((candidate) => {
          const rect = candidate.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return {
          bottom: Math.round(rect.bottom),
          height: Math.round(rect.height),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          top: Math.round(rect.top),
          width: Math.round(rect.width)
        };
      };
      const list = rectFor(".copy-wallets-list-panel");
      const detail = rectFor(".copy-wallet-detail-panel");
      const activity = rectFor(".copy-wallet-activity-card");
      const selected = rectFor(".copy-wallet-row.selected");
      const rows = Array.from(document.querySelectorAll(".copy-wallet-row"))
        .filter((row) => {
          const rect = row.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map((row) => row.textContent.trim());
      const bodyText = document.body.textContent;
      return {
        activity,
        activityItems: Array.from(document.querySelectorAll(".copy-wallet-activity-item")).filter((item) => {
          const rect = item.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }).length,
        bodyTextIncludesNegative: bodyText.includes("-$") || bodyText.includes("-"),
        bodyTextIncludesPositive: bodyText.includes("+$") || bodyText.includes("+"),
        detail,
        detailBelowList: list && detail ? detail.top >= list.bottom - 1 : false,
        firstRows: rows.slice(0, 4),
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        innerWidth: window.innerWidth,
        list,
        rowCount: rows.length,
        scrollWidth: document.documentElement.scrollWidth,
        selected,
        selectedLabel: Array.from(document.querySelectorAll(".copy-wallet-row.selected strong")).find((item) => {
          const rect = item.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })?.textContent || null,
        walletToolbarVisible: Boolean(document.querySelector(".copy-wallet-toolbar")),
      };
    })()`,
  );
}

async function clickByText(connection, selector, exactText) {
  const escapedText = JSON.stringify(exactText);
  const clicked = await evaluate(
    connection,
    `(() => {
      const element = Array.from(document.querySelectorAll(${JSON.stringify(selector)}))
        .find((candidate) => candidate.textContent.trim() === ${escapedText});
      if (!element) return false;
      element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      return true;
    })()`,
  );
  assert(clicked, `Could not click ${exactText}`);
}

async function runVisualQa() {
  localPort = await findAvailablePort(localPort);
  localBaseUrl = `http://127.0.0.1:${localPort}`;
  const nextProcess = spawnNextDev();
  let chromeProcess;
  let connection;

  try {
    await waitForHttp(`${localBaseUrl}/copy-trading`, "Next.js copy-trading page");
    chromeProcess = spawnChrome();
    await waitForChrome();
    const target = await createTarget("about:blank");
    connection = new ChromeConnection(target.webSocketDebuggerUrl);
    await connection.open();
    await connection.send("Page.enable");
    await connection.send("Runtime.enable");
    await connection.send("Fetch.enable", {
      patterns: [{ requestStage: "Request", urlPattern: "*://127.0.0.1:*/api/backend/copy-trading*" }],
    });
    connection.on("Runtime.consoleAPICalled", (event) => {
      consoleMessages.push({
        level: event.type,
        text: event.args?.map((arg) => arg.value || arg.description || "").join(" "),
      });
    });
    connection.on("Fetch.requestPaused", async (event) => {
      try {
        if (event.request.url.includes("/api/backend/copy-trading")) {
          const { body, status = 200 } = bodyForCopyTradingRequest(event.request.url, event.request.method);
          await connection.send("Fetch.fulfillRequest", {
            body: body === null ? "" : Buffer.from(JSON.stringify(body)).toString("base64"),
            requestId: event.requestId,
            responseCode: status,
            responseHeaders: status === 204 ? [] : [{ name: "Content-Type", value: "application/json" }],
          });
          return;
        }
        await connection.send("Fetch.continueRequest", { requestId: event.requestId });
      } catch (error) {
        console.error(`[qa] fetch interception failed: ${error.message}`);
      }
    });

    await setViewport(connection, 1440, 1100);
    await connection.send("Page.navigate", { url: `${localBaseUrl}/copy-trading` });
    await waitForExpression(connection, `document.querySelector(".copy-tabs") !== null`, "Copy Trading tabs");
    await wait(500);
    await clickByText(connection, "button", "Wallets");
    await waitForExpression(
      connection,
      `document.querySelector('button[aria-pressed="true"]')?.textContent.trim() === "Wallets"`,
      "Wallets tab active",
    );
    await waitForExpression(
      connection,
      `Array.from(document.querySelectorAll(".copy-wallet-row")).filter((row) => {
        const rect = row.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }).length >= 10`,
      "mock wallet rows",
    );
    await wait(500);
    await evaluate(connection, `document.querySelector(".copy-wallets-master-detail")?.scrollIntoView({ block: "start" })`);
    await wait(300);

    const desktopFull = await screenshot(connection, "desktop-wallets-master-detail.png");
    const desktopMetrics = await pageMetrics(connection);
    assert(desktopMetrics.rowCount >= 10, "Desktop did not render enough wallet rows");
    assert(!desktopMetrics.horizontalOverflow, "Desktop has horizontal overflow");
    assert(desktopMetrics.activityItems >= 2, "Desktop activity timeline did not render populated items");

    await evaluate(connection, `document.querySelectorAll(".copy-wallet-row")[5]?.click()`);
    await wait(300);
    const selectedWallet = await screenshot(connection, "desktop-wallet-selected.png");
    const selectedMetrics = await pageMetrics(connection);
    assert(selectedMetrics.selectedLabel, "Selecting another wallet did not update selection");

    await clickByText(connection, "button", "Siguiente");
    await wait(300);
    const paginationText = await evaluate(
      connection,
      `Array.from(document.querySelectorAll(".copy-wallet-pagination-meta > span")).map((span) => span.textContent.trim()).join(" | ")`,
    );
    assert(
      paginationText.includes("16-30") || paginationText.includes("16-"),
      `Pagination did not advance to the second wallet page: ${paginationText}`,
    );

    await evaluate(
      connection,
      `(() => {
        const input = document.querySelector(".copy-wallet-toolbar-search input");
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(input, "Blue");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      })()`,
    );
    await wait(300);
    const filteredWallet = await screenshot(connection, "desktop-wallet-filtered.png");
    const filterMetrics = await pageMetrics(connection);
    assert(filterMetrics.rowCount >= 1, "Search filter removed all rows unexpectedly");

    await clickByText(connection, "button", "Agregar wallet");
    await wait(300);
    const addDialogVisible = await evaluate(connection, `Boolean(document.querySelector(".copy-overlay-card"))`);
    assert(addDialogVisible, "Agregar wallet dialog did not open");
    await evaluate(connection, `document.querySelector(".copy-overlay-backdrop")?.click()`);
    await wait(250);

    await clickByText(connection, "button", "Editar");
    await wait(300);
    const editDialogVisible = await evaluate(connection, `Boolean(document.querySelector(".copy-overlay-card"))`);
    assert(editDialogVisible, "Editar wallet dialog did not open");
    await evaluate(connection, `document.querySelector(".copy-overlay-backdrop")?.click()`);
    await wait(250);

    await setViewport(connection, 900, 1100);
    await wait(350);
    await evaluate(connection, `document.querySelector(".copy-wallets-master-detail")?.scrollIntoView({ block: "start" })`);
    await wait(250);
    const tablet = await screenshot(connection, "tablet-wallets-master-detail.png");
    const tabletMetrics = await pageMetrics(connection);
    assert(!tabletMetrics.horizontalOverflow, "Tablet has horizontal overflow");

    await setViewport(connection, 390, 1100);
    await wait(350);
    await evaluate(connection, `document.querySelector(".copy-wallets-master-detail")?.scrollIntoView({ block: "start" })`);
    await wait(250);
    const mobile = await screenshot(connection, "mobile-wallets-master-detail.png");
    const mobileMetrics = await pageMetrics(connection);
    assert(!mobileMetrics.horizontalOverflow, "Mobile has horizontal overflow");
    assert(mobileMetrics.detailBelowList, "Mobile detail panel did not stack below the wallet list");

    const report = {
      checks: {
        addDialogVisible,
        editDialogVisible,
        filterRows: filterMetrics.rowCount,
        paginationText,
        selectedWallet: selectedMetrics.selectedLabel,
      },
      consoleMessages,
      endpointsHit: Array.from(endpointsHit).sort(),
      mockData: {
        closedPositions: closedPositions.length,
        events: events.length,
        openPositions: openPositions.length,
        orders: orders.length,
        trades: trades.length,
        wallets: wallets.length,
      },
      screenshots: {
        desktopFull,
        filteredWallet,
        mobile,
        selectedWallet,
        tablet,
      },
      visualMetrics: {
        desktop: desktopMetrics,
        filter: filterMetrics,
        mobile: mobileMetrics,
        selected: selectedMetrics,
        tablet: tabletMetrics,
      },
    };
    writeFileSync(join(resultsDir, "qa-report.json"), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (connection) {
      connection.close();
    }
    if (chromeProcess && !chromeProcess.killed) {
      killProcessTree(chromeProcess);
    }
    if (!nextProcess.killed) {
      killProcessTree(nextProcess);
    }
  }
}

await runVisualQa();
