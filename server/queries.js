const db = require('./db');
const { computePnl } = require('./pnl');

// Everything except the screenshot column: screenshots are stored inline as
// base64 and can be megabytes each, and no summary or insight needs them.
const LIGHT_TRADE_COLUMNS = [
  'id', 'coin_name', 'contract_address', 'entry_price', 'entry_mcap', 'exit_price', 'exit_mcap',
  'amount_invested', 'percent_risked', 'fees', 'emotional_state', 'followed_plan', 'grade',
  'status', 'created_at', 'closed_at', 'updated_at',
].join(', ');

function loadTradesWithPnl() {
  return db
    .prepare(`SELECT ${LIGHT_TRADE_COLUMNS} FROM trades`)
    .all()
    .map((row) => ({ ...row, ...computePnl(row) }));
}

module.exports = { loadTradesWithPnl };
