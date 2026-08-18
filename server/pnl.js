// P&L is derived, never stored: entry/exit can be edited, so a stored value
// would risk going stale. Price is preferred over market cap when both exist;
// mcap is used as a fallback since the ratio (exit/entry) is the same either way
// for a fixed token supply.
function computePnl(trade) {
  const entryRef = trade.entry_price ?? trade.entry_mcap;
  const exitRef = trade.exit_price ?? trade.exit_mcap;

  if (entryRef == null || exitRef == null || entryRef === 0) {
    return { pnl_percent: null, pnl_amount: null };
  }

  const ratio = exitRef / entryRef;
  const pnl_percent = (ratio - 1) * 100;
  // Fees come out of the SOL result (what actually lands in your wallet),
  // not the percent (a pure measure of the price move itself).
  const pnl_amount = trade.amount_invested * (ratio - 1) - (trade.fees || 0);

  return { pnl_percent, pnl_amount };
}

module.exports = { computePnl };
