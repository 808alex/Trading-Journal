const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeDaySummary } = require('../server/daily');

let nextId = 1;
function trade(overrides) {
  return {
    id: nextId++,
    coin_name: 'COIN',
    status: 'closed',
    emotional_state: 'calm',
    followed_plan: 'yes',
    grade: 'B',
    pnl_amount: 1,
    pnl_percent: 100,
    created_at: '2026-09-20 09:00:00',
    closed_at: '2026-09-20T10:00:00.000Z',
    ...overrides,
  };
}

const DAY = '2026-09-20';

test('counts what was opened and closed that day, and sums realised P&L', () => {
  const s = computeDaySummary(
    [
      trade({ pnl_amount: 1 }), // opened + closed today
      trade({ created_at: '2026-09-18 12:00:00', pnl_amount: -0.5, pnl_percent: -50 }), // opened earlier, closed today
      trade({ status: 'open', closed_at: null, pnl_amount: null, pnl_percent: null }), // opened today, still open
      trade({ created_at: '2026-09-19 12:00:00', closed_at: '2026-09-19T13:00:00.000Z' }), // not today
    ],
    DAY,
    'UTC'
  );
  assert.equal(s.opened, 2);
  assert.equal(s.closed, 2);
  assert.equal(s.pnl, 0.5);
  assert.equal(s.wins, 1);
  assert.equal(s.losses, 1);
  assert.equal(s.winRate, 50);
});

test('mood mix describes only the trades opened that day, most frequent first', () => {
  const s = computeDaySummary(
    [
      trade({ emotional_state: 'fomo' }),
      trade({ emotional_state: 'calm' }),
      trade({ emotional_state: 'fomo' }),
      trade({ emotional_state: 'anxious', created_at: '2026-09-10 09:00:00' }), // opened another day
    ],
    DAY,
    'UTC'
  );
  assert.deepEqual(s.moodMix, [
    { mood: 'fomo', count: 2 },
    { mood: 'calm', count: 1 },
  ]);
});

test('plan adherence is counted across trades closed that day', () => {
  const s = computeDaySummary(
    [trade({ followed_plan: 'yes' }), trade({ followed_plan: 'yes' }), trade({ followed_plan: 'no' })],
    DAY,
    'UTC'
  );
  assert.deepEqual(s.plan, { yes: 2, partially: 0, no: 1 });
});

test('best and worst only appear when they are genuinely a win / a loss', () => {
  const allWins = computeDaySummary([trade({ pnl_amount: 1 }), trade({ pnl_amount: 2 })], DAY, 'UTC');
  assert.equal(allWins.best.pnl_amount, 2);
  assert.equal(allWins.worst, null);

  const mixed = computeDaySummary(
    [trade({ coin_name: 'UP', pnl_amount: 3 }), trade({ coin_name: 'DOWN', pnl_amount: -2 })],
    DAY,
    'UTC'
  );
  assert.equal(mixed.best.coin_name, 'UP');
  assert.equal(mixed.worst.coin_name, 'DOWN');
});

test('midnight follows the given timezone: 23:30 UTC is already tomorrow in Dublin', () => {
  const late = trade({ created_at: '2026-09-19 22:00:00', closed_at: '2026-09-19T23:30:00.000Z' });
  assert.equal(computeDaySummary([late], '2026-09-19', 'UTC').closed, 1);
  assert.equal(computeDaySummary([late], '2026-09-20', 'UTC').closed, 0);
  assert.equal(computeDaySummary([late], '2026-09-20', 'Europe/Dublin').closed, 1);
  assert.equal(computeDaySummary([late], '2026-09-19', 'Europe/Dublin').closed, 0);
});

test('a day with no activity is all zeros and nulls', () => {
  const s = computeDaySummary([trade()], '2026-01-01', 'UTC');
  assert.equal(s.opened, 0);
  assert.equal(s.closed, 0);
  assert.equal(s.pnl, 0);
  assert.equal(s.winRate, null);
  assert.deepEqual(s.moodMix, []);
  assert.equal(s.best, null);
  assert.equal(s.worst, null);
  assert.deepEqual(s.trades, []);
});

test('the trade list flags whether each trade was opened and/or closed that day', () => {
  const both = trade({ coin_name: 'BOTH' });
  const onlyClosed = trade({ coin_name: 'LATE', created_at: '2026-09-15 09:00:00' });
  const onlyOpened = trade({ coin_name: 'HOLD', status: 'open', closed_at: null, pnl_amount: null, pnl_percent: null });
  const s = computeDaySummary([onlyOpened, onlyClosed, both], DAY, 'UTC');

  const byName = Object.fromEntries(s.trades.map((t) => [t.coin_name, t]));
  assert.deepEqual([byName.BOTH.opened_today, byName.BOTH.closed_today], [true, true]);
  assert.deepEqual([byName.LATE.opened_today, byName.LATE.closed_today], [false, true]);
  assert.deepEqual([byName.HOLD.opened_today, byName.HOLD.closed_today], [true, false]);
  assert.deepEqual(s.trades.map((t) => t.id), [...s.trades.map((t) => t.id)].sort((a, b) => a - b));
});
