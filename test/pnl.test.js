const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computePnl } = require('../server/pnl');

const approx = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} !~= ${expected}`);

test('P&L is net of fees, from the price ratio', () => {
  const r = computePnl({ entry_price: 1, exit_price: 2, amount_invested: 1, fees: 0.1 });
  approx(r.pnl_amount, 0.9);
  approx(r.pnl_percent, 90);
});

test('falls back to market cap when there is no price', () => {
  const r = computePnl({ entry_mcap: 100000, exit_mcap: 300000, amount_invested: 2, fees: 0 });
  approx(r.pnl_amount, 4);
  approx(r.pnl_percent, 200);
});

test('prefers price over market cap when both exist', () => {
  const r = computePnl({
    entry_price: 1, exit_price: 1.5, entry_mcap: 100, exit_mcap: 1000, amount_invested: 1, fees: 0,
  });
  approx(r.pnl_percent, 50);
});

test('a losing trade gives a negative amount and percent', () => {
  const r = computePnl({ entry_mcap: 200000, exit_mcap: 100000, amount_invested: 1, fees: 0 });
  approx(r.pnl_amount, -0.5);
  approx(r.pnl_percent, -50);
});

test('returns nulls while a trade has no exit yet', () => {
  assert.deepEqual(computePnl({ entry_mcap: 100, amount_invested: 1, fees: 0 }), {
    pnl_percent: null,
    pnl_amount: null,
  });
});

test('returns nulls instead of dividing by a zero entry', () => {
  assert.deepEqual(computePnl({ entry_price: 0, exit_price: 5, amount_invested: 1, fees: 0 }), {
    pnl_percent: null,
    pnl_amount: null,
  });
});
