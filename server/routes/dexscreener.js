const express = require('express');

const router = express.Router();

// A contract address can have several trading pairs across different pools
// (Raydium, Orca, etc.) with wildly different liquidity -- the thin ones
// give unreliable prices, so we pick whichever pair has the most USD
// liquidity as the "real" one, same heuristic DexScreener's own site uses.
function pickBestPair(pairs) {
  return pairs.reduce((best, p) => {
    const liq = p.liquidity?.usd ?? 0;
    const bestLiq = best?.liquidity?.usd ?? -1;
    return liq > bestLiq ? p : best;
  }, null);
}

// GET /api/dexscreener/:address — Solana-only, matching this app's scope.
// No API key needed; DexScreener's token endpoint is public.
router.get('/:address', async (req, res) => {
  const address = req.params.address.trim();
  if (!address) return res.status(400).json({ error: 'Contract address is required' });

  let response;
  try {
    response = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${encodeURIComponent(address)}`, {
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return res.status(502).json({ error: "Couldn't reach DexScreener. Try again in a moment." });
  }

  if (!response.ok) {
    return res.status(502).json({ error: `DexScreener returned an error (${response.status}).` });
  }

  const pairs = await response.json();
  if (!Array.isArray(pairs) || pairs.length === 0) {
    return res.status(404).json({ error: 'No trading pairs found for that address on DexScreener.' });
  }

  const best = pickBestPair(pairs);
  res.json({
    symbol: best.baseToken.symbol,
    name: best.baseToken.name,
    price_usd: best.priceUsd ? Number(best.priceUsd) : null,
    market_cap: best.marketCap ?? best.fdv ?? null,
    liquidity_usd: best.liquidity?.usd ?? null,
    dex_url: best.url ?? null,
  });
});

module.exports = router;
