const POLYMARKET_WALLET_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export function isPolymarketWalletAddress(value?: string | null): boolean {
  return typeof value === "string" && POLYMARKET_WALLET_ADDRESS_PATTERN.test(value.trim());
}

export function buildPolymarketWalletProfileUrl(walletAddress?: string | null): string | null {
  if (!isPolymarketWalletAddress(walletAddress)) {
    return null;
  }
  return `https://polymarket.com/profile/${walletAddress!.trim()}`;
}
