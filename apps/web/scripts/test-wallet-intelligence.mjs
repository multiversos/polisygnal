import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { appRoot, assert, loadTsModule } from "./lib/test-loader.mjs";

const {
  buildPolymarketWalletProfileUrl,
  isPolymarketWalletAddress,
} = loadTsModule("app/lib/polymarketWalletProfile.ts");

const walletDetailsSource = readFileSync(resolve(appRoot, "app/components/WalletIntelligenceDetails.tsx"), "utf8");

const wallet = "0xe1e7036279433715711a65fc3254a8af558c5fb6";
assert(isPolymarketWalletAddress(wallet), "expected valid 0x wallet to pass profile guard");
assert(
  buildPolymarketWalletProfileUrl(wallet) === `https://polymarket.com/profile/${wallet}`,
  "expected Polymarket profile URL to use the verified /profile/{wallet} path",
);
assert(!buildPolymarketWalletProfileUrl("0xabc"), "short identifiers must not become profile URLs");
assert(!buildPolymarketWalletProfileUrl("https://evil.example/0xe1e7036279433715711a65fc3254a8af558c5fb6"), "arbitrary URLs must not become profile links");

assert(walletDetailsSource.includes("wallet-details-key-grid"), "wallet drawer must have compact key-data grid");
assert(walletDetailsSource.includes("Ver perfil en Polymarket"), "wallet drawer must expose public profile verification when safe");
assert(walletDetailsSource.includes("Perfil Polymarket no disponible"), "wallet drawer must handle missing profile URLs honestly");
assert(walletDetailsSource.includes("Copiar direccion"), "wallet drawer must allow copying the public wallet address");
assert(walletDetailsSource.includes("Wallet completa no disponible"), "wallet drawer must not pretend short addresses are verifiable full wallets");
assert(walletDetailsSource.includes("Perfil destacado"), "wallet drawer must show highlighted profile badges when criteria pass");
assert(walletDetailsSource.includes("Guardar perfil"), "wallet drawer must allow eligible profiles to be saved");
assert(walletDetailsSource.includes("Historial de esta wallet"), "wallet drawer must expose wallet history in a collapsed section");
assert(walletDetailsSource.includes("Historial no disponible desde la fuente publica actual."), "wallet drawer must not invent unavailable history");
assert(walletDetailsSource.includes("<summary>Datos tecnicos</summary>"), "technical wallet details must be collapsed by default");
assert(walletDetailsSource.indexOf("wallet-details-key-grid") < walletDetailsSource.indexOf("<summary>Datos tecnicos</summary>"), "technical details should appear after compact fields");
assert(walletDetailsSource.includes("<dt>tokenId</dt>"), "expanded details must include tokenId");
assert(walletDetailsSource.includes("<dt>conditionId</dt>"), "expanded details must include conditionId");
assert(walletDetailsSource.includes("<dt>marketId</dt>"), "expanded details must include marketId");
assert(walletDetailsSource.includes("<dt>transactionHash</dt>"), "expanded details must include transactionHash");
assert(!walletDetailsSource.includes("<pre"), "wallet drawer must not show raw JSON by default");
assert(!walletDetailsSource.includes("sigue esta wallet"), "wallet drawer must not recommend following wallets");
assert(!walletDetailsSource.includes("copia esta operacion"), "wallet drawer must not recommend copying operations");
assert(!walletDetailsSource.includes("ROI 100%"), "wallet drawer must not invent ROI copy");
assert(!walletDetailsSource.includes("win rate 100%"), "wallet drawer must not invent win-rate copy");

console.log("Wallet Intelligence drawer tests passed");
