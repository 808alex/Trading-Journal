const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./support/server');

let server;
before(async () => { server = await startServer(); });
after(async () => { await server.stop(); });

const baseTrade = {
  coin_name: 'TESTCOIN',
  contract_address: 'So11111111111111111111111111111111111111112',
  entry_mcap: 100000,
  amount_invested: 1,
  percent_risked: 5,
  emotional_state: 'calm',
};

test('rejects a trade with no coin name', async () => {
  const res = await server.post('/api/trades', { ...baseTrade, coin_name: '  ' });
  assert.equal(res.status, 400);
});

test('rejects an emotional state that is not one of the allowed values', async () => {
  const res = await server.post('/api/trades', { ...baseTrade, emotional_state: 'happy' });
  assert.equal(res.status, 400);
});

test('a trade opens, cannot close without reflection, then closes with P&L', async () => {
  const opened = await server.post('/api/trades', baseTrade);
  assert.equal(opened.status, 201);
  assert.equal(opened.data.status, 'open');
  assert.equal(opened.data.pnl_percent, null);

  const tooEarly = await server.put(`/api/trades/${opened.data.id}`, { status: 'closed', exit_mcap: 200000 });
  assert.equal(tooEarly.status, 400);

  const closed = await server.put(`/api/trades/${opened.data.id}`, {
    status: 'closed',
    exit_mcap: 200000,
    thesis: 'Narrative was heating up',
    grade: 'B',
    followed_plan: 'yes',
  });
  assert.equal(closed.status, 200);
  assert.equal(closed.data.status, 'closed');
  assert.ok(closed.data.closed_at);
  assert.equal(closed.data.pnl_percent, 100);
});

test('a trade can be logged and closed in a single request', async () => {
  const res = await server.post('/api/trades', {
    ...baseTrade,
    status: 'closed',
    exit_mcap: 50000,
    thesis: 'Bad read',
    grade: 'D',
    followed_plan: 'no',
  });
  assert.equal(res.status, 201);
  assert.equal(res.data.status, 'closed');
  assert.equal(res.data.pnl_percent, -50);
});

test('journal entries are one-per-date: saving twice updates instead of duplicating', async () => {
  const date = '2026-01-15';
  await server.post('/api/journal', { entry_date: date, title: 'First', lessons: 'a' });
  await server.post('/api/journal', { entry_date: date, title: 'Second', lessons: 'b' });

  const list = await server.get('/api/journal');
  const forDate = list.data.filter((e) => e.entry_date === date);
  assert.equal(forDate.length, 1);
  assert.equal(forDate[0].title, 'Second');
  assert.equal(forDate[0].lessons, 'b');
});

test('the daily summary reports a trade closed today, and rejects a bad date', async () => {
  const { todayIn } = require('../shared/dates');
  const today = todayIn('UTC');

  const res = await server.get(`/api/daily/${today}?tz=UTC`);
  assert.equal(res.status, 200);
  assert.equal(res.data.date, today);
  assert.ok(res.data.closed >= 2, 'the trades closed by earlier tests should show up');
  assert.ok(Array.isArray(res.data.moodMix));

  assert.equal((await server.get('/api/daily/not-a-date')).status, 400);
  // An invalid timezone falls back to the server's own instead of failing.
  assert.equal((await server.get(`/api/daily/${today}?tz=Mars/Olympus_Mons`)).status, 200);
});

test('journal rejects a malformed date', async () => {
  const res = await server.post('/api/journal', { entry_date: '15/01/2026' });
  assert.equal(res.status, 400);
});

test('a failed import leaves existing data untouched instead of half-wiping it', async () => {
  const before = (await server.get('/api/trades')).data.length;
  assert.ok(before > 0);

  const bad = {
    trades: [
      { ...baseTrade, emotional_state: 'calm' },
      { ...baseTrade, emotional_state: 'not-a-real-mood' },
    ],
  };
  const res = await server.post('/api/backup/import', bad);
  assert.ok(res.status >= 400, `expected an error status, got ${res.status}`);

  assert.equal((await server.get('/api/trades')).data.length, before);
});

test('an exported backup can be re-imported after a reset', async () => {
  const before = (await server.get('/api/trades')).data.length;
  assert.ok(before > 0);

  const exported = (await server.get('/api/backup/export')).data;
  assert.equal(exported.trades.length, before);

  await server.post('/api/backup/reset');
  assert.equal((await server.get('/api/trades')).data.length, 0);

  const imported = await server.post('/api/backup/import', exported);
  assert.equal(imported.status, 200);
  assert.equal((await server.get('/api/trades')).data.length, before);
});
