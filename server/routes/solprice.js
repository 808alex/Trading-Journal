const express = require('express');

const router = express.Router();

// Wrapped SOL's own mint address -- DexScreener treats it like any other
// SPL token, so the same lookup used for coin prices works here too.
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const SUPPORTED_CURRENCIES = ['usd', 'gbp', 'eur', 'jpy'];

function pickBestPair(pairs) {
  return pairs.reduce((best, p) => {
    const liq = p.liquidity?.usd ?? 0;
    const bestLiq = best?.liquidity?.usd ?? -1;
    return liq > bestLiq ? p : best;
  }, null);
}

// GET /api/solprice — current SOL price from DexScreener (USD), converted
// into every fiat currency this app supports via a free, no-key FX-rate
// API. SOL moves slowly enough minute-to-minute that this is a manual
// "Auto-fetch" button in Settings, not something that needs to poll.
router.get('/', async (req, res) => {
  let dexRes;
  try {
    dexRes = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${SOL_MINT}`, {
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return res.status(502).json({ error: "Couldn't reach DexScreener. Try again in a moment." });
  }
  if (!dexRes.ok) {
    return res.status(502).json({ error: `DexScreener returned an error (${dexRes.status}).` });
  }

  const pairs = await dexRes.json();
  const best = Array.isArray(pairs) ? pickBestPair(pairs) : null;
  const usdPrice = best?.priceUsd ? Number(best.priceUsd) : null;
  if (!usdPrice) {
    return res.status(502).json({ error: "Couldn't read a SOL price from DexScreener." });
  }

  // FX rates are best-effort -- if the rate lookup fails, still return the
  // USD price rather than failing the whole request.
  let rates = {};
  try {
    const fxRes = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(8000) });
    const fxJson = await fxRes.json();
    if (fxJson.result === 'success') {
      rates = { gbp: fxJson.rates.GBP, eur: fxJson.rates.EUR, jpy: fxJson.rates.JPY };
    }
  } catch {
    // Fall through with USD only.
  }

  const prices = { usd: usdPrice };
  for (const currency of SUPPORTED_CURRENCIES) {
    if (rates[currency]) prices[currency] = usdPrice * rates[currency];
  }
  res.json(prices);
});

module.exports = router;
