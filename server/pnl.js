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
  // Both figures are net of fees -- pnl_percent is your actual return on
  // the capital you put in (pnl_amount / amount_invested), not the raw
  // price move, since fees are money you really paid and a "200%" that
  // ignores them isn't your real return.
  const pnl_amount = trade.amount_invested * (ratio - 1) - (trade.fees || 0);
  const pnl_percent = trade.amount_invested ? (pnl_amount / trade.amount_invested) * 100 : null;

  return { pnl_percent, pnl_amount };
}

module.exports = { computePnl };
