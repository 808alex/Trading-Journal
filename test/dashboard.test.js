const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeDashboard } = require('../server/dashboard');

function closedTrade(overrides) {
  return {
    status: 'closed',
    emotional_state: 'calm',
    percent_risked: 3,
    grade: 'B',
    pnl_amount: 1,
    pnl_percent: 50,
    ...overrides,
  };
}

test('asks for more data instead of over-claiming from fewer than 3 closed trades', () => {
  const { bullets } = computeDashboard([closedTrade(), closedTrade()]);
  assert.deepEqual(bullets, ['Log a few more closed trades to unlock correlation insights.']);
});

test('open trades never count toward the breakdowns', () => {
  const { byEmotion } = computeDashboard([
    closedTrade(),
    { status: 'open', emotional_state: 'fomo', percent_risked: 1, pnl_amount: null, pnl_percent: null },
  ]);
  assert.deepEqual(byEmotion.map((e) => e.key), ['calm']);
});

test('groups closed trades by emotional state with count, average and win rate', () => {
  const { byEmotion } = computeDashboard([
    closedTrade({ emotional_state: 'fomo', pnl_amount: -1, pnl_percent: -40 }),
    closedTrade({ emotional_state: 'fomo', pnl_amount: 1, pnl_percent: 20 }),
    closedTrade({ emotional_state: 'calm', pnl_amount: 2, pnl_percent: 60 }),
  ]);
  const fomo = byEmotion.find((e) => e.key === 'fomo');
  assert.equal(fomo.count, 2);
  assert.equal(fomo.avgPnlPercent, -10);
  assert.equal(fomo.winRate, 50);
});

test('risk buckets split at 2%, 5% and 10% (lower bound inclusive)', () => {
  const { byRisk } = computeDashboard([
    closedTrade({ percent_risked: 1.99 }),
    closedTrade({ percent_risked: 2 }),
    closedTrade({ percent_risked: 5 }),
    closedTrade({ percent_risked: 10 }),
  ]);
  assert.deepEqual(byRisk.map((r) => r.key), ['< 2%', '2–5%', '5–10%', '10%+']);
});

test('the headline bullet reports count, win rate and total P&L', () => {
  const { bullets } = computeDashboard([
    closedTrade({ pnl_amount: 1 }),
    closedTrade({ pnl_amount: 1 }),
    closedTrade({ pnl_amount: -0.5 }),
  ]);
  assert.equal(bullets[0], '3 closed trades, 66.7% win rate, +1.500 SOL total.');
});
