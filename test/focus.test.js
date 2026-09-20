const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeFocus } = require('../server/focus');

const TODAY = '2026-09-20';
let nextId = 1;

// A trade opened and closed on `day` (UTC noon / 1pm, so it is the same day in UTC).
function trade(day, overrides = {}) {
  return {
    id: nextId++,
    status: 'closed',
    emotional_state: 'calm',
    followed_plan: 'yes',
    pnl_percent: 10,
    created_at: `${day} 12:00:00`,
    closed_at: `${day}T13:00:00.000Z`,
    ...overrides,
  };
}

function entry(date, overrides = {}) {
  return { entry_date: date, work_on: null, sleep_rating: null, rules_followed: null, ...overrides };
}

const focus = (trades, entries = []) => computeFocus({ trades, entries, today: TODAY, timeZone: 'UTC' });
const kinds = (f) => f.callouts.map((c) => c.kind);

test('with no history there is nothing to say yet', () => {
  const f = focus([], []);
  assert.deepEqual(f.callouts, []);
  assert.deepEqual(f.carryOver, []);
  assert.equal(f.windowDays, 0);
});

test('plan: warns when at least 40% of recent closed trades were not fully followed', () => {
  const f = focus([
    trade('2026-09-19', { followed_plan: 'no' }),
    trade('2026-09-19', { followed_plan: 'partially' }),
    trade('2026-09-18', { followed_plan: 'yes' }),
    trade('2026-09-18', { followed_plan: 'yes' }),
    trade('2026-09-17', { followed_plan: 'yes' }),
  ]);
  const plan = f.callouts.find((c) => c.kind === 'plan');
  assert.equal(plan.tone, 'warn');
  assert.equal(plan.text, "You didn't fully follow your plan on 2 of your last 5 closed trades.");
});

test('plan: praises a clean run, stays quiet for a mild slip or too little data', () => {
  const clean = focus([trade('2026-09-19'), trade('2026-09-18'), trade('2026-09-17')]);
  assert.equal(clean.callouts.find((c) => c.kind === 'plan').tone, 'good');

  const mild = focus([
    trade('2026-09-19', { followed_plan: 'partially' }),
    trade('2026-09-19'), trade('2026-09-18'), trade('2026-09-18'), trade('2026-09-17'),
  ]);
  assert.equal(mild.callouts.find((c) => c.kind === 'plan'), undefined);

  const tooFew = focus([trade('2026-09-19', { followed_plan: 'no' }), trade('2026-09-18', { followed_plan: 'no' })]);
  assert.equal(tooFew.callouts.find((c) => c.kind === 'plan'), undefined);
});

test('mood: flags mostly-FOMO/anxious entries and compares their results when there is data', () => {
  const f = focus([
    trade('2026-09-19', { emotional_state: 'fomo', pnl_percent: -20 }),
    trade('2026-09-19', { emotional_state: 'anxious', pnl_percent: -10 }),
    trade('2026-09-18', { emotional_state: 'fomo', pnl_percent: -15 }),
    trade('2026-09-18', { emotional_state: 'calm', pnl_percent: 30 }),
    trade('2026-09-17', { emotional_state: 'calm', pnl_percent: 10 }),
  ]);
  const mood = f.callouts.find((c) => c.kind === 'mood');
  assert.equal(mood.tone, 'warn');
  assert.match(mood.text, /^3 of your last 5 entries were taken feeling FOMO or anxious\./);
  assert.match(mood.text, /averaged -15% vs \+20% for the rest\.$/);
});

test('mood: silent with a single risky entry or fewer than 3 entries', () => {
  const one = focus([
    trade('2026-09-19', { emotional_state: 'fomo' }), trade('2026-09-18'), trade('2026-09-17'),
  ]);
  assert.equal(one.callouts.find((c) => c.kind === 'mood'), undefined);

  const few = focus([trade('2026-09-19', { emotional_state: 'fomo' }), trade('2026-09-18', { emotional_state: 'fomo' })]);
  assert.equal(few.callouts.find((c) => c.kind === 'mood'), undefined);
});

test('sleep: warns on a low average over at least 3 check-ins, otherwise silent', () => {
  const low = focus([], [
    entry('2026-09-19', { sleep_rating: 2 }), entry('2026-09-18', { sleep_rating: 2 }), entry('2026-09-17', { sleep_rating: 3 }),
  ]);
  const sleep = low.callouts.find((c) => c.kind === 'sleep');
  assert.equal(sleep.tone, 'warn');
  assert.match(sleep.text, /averaged 2\.3\/5 over your last 3 check-ins/);

  const fine = focus([], [
    entry('2026-09-19', { sleep_rating: 3 }), entry('2026-09-18', { sleep_rating: 3 }), entry('2026-09-17', { sleep_rating: 4 }),
  ]);
  assert.equal(fine.callouts.find((c) => c.kind === 'sleep'), undefined);

  const two = focus([], [entry('2026-09-19', { sleep_rating: 1 }), entry('2026-09-18', { sleep_rating: 1 })]);
  assert.equal(two.callouts.find((c) => c.kind === 'sleep'), undefined);
});

test('rules: warns when they are often broken, praises a clean streak', () => {
  const broken = focus([], [
    entry('2026-09-19', { rules_followed: 'no' }),
    entry('2026-09-18', { rules_followed: 'partly' }),
    entry('2026-09-17', { rules_followed: 'yes' }),
  ]);
  const warn = broken.callouts.find((c) => c.kind === 'rules');
  assert.equal(warn.tone, 'warn');
  assert.match(warn.text, /on 2 of your last 3 check-ins/);

  const clean = focus([], [
    entry('2026-09-19', { rules_followed: 'yes' }), entry('2026-09-18', { rules_followed: 'yes' }), entry('2026-09-17', { rules_followed: 'yes' }),
  ]);
  assert.equal(clean.callouts.find((c) => c.kind === 'rules').tone, 'good');
});

test('journal gap: points at the latest traded-but-unjournaled day within a week', () => {
  const yesterday = focus([trade('2026-09-19')], []);
  const gap = yesterday.callouts.find((c) => c.kind === 'journal');
  assert.equal(gap.date, '2026-09-19');
  assert.match(gap.text, /You traded yesterday but didn't journal it/);

  const older = focus([trade('2026-09-17')], []);
  assert.match(older.callouts.find((c) => c.kind === 'journal').text, /You traded on 2026-09-17 but/);

  assert.equal(focus([trade('2026-09-19')], [entry('2026-09-19')]).callouts.find((c) => c.kind === 'journal'), undefined);
  assert.equal(focus([trade('2026-09-10')], []).callouts.find((c) => c.kind === 'journal'), undefined);
});

test('callouts are ordered warnings, then nudges, then praise, and capped at four', () => {
  const trades = [
    trade('2026-09-19', { followed_plan: 'yes' }),
    trade('2026-09-18', { followed_plan: 'yes' }),
    trade('2026-09-17', { followed_plan: 'yes' }), // plan: good
  ];
  const entries = [
    entry('2026-09-19', { sleep_rating: 1, rules_followed: 'no' }),
    entry('2026-09-18', { sleep_rating: 1, rules_followed: 'no' }),
    entry('2026-09-17', { sleep_rating: 2, rules_followed: 'no' }),
  ];
  const f = focus(trades, entries);
  const tones = f.callouts.map((c) => c.tone);
  assert.deepEqual(tones, [...tones].sort((a, b) => ({ warn: 0, info: 1, good: 2 }[a] - { warn: 0, info: 1, good: 2 }[b])));
  assert.ok(f.callouts.length <= 4);
  assert.deepEqual(kinds(f).slice(0, 2), ['sleep', 'rules']);
});

test('carry-over: the last three notes, newest first, duplicates collapsed, today excluded', () => {
  const f = focus([], [
    entry('2026-09-20', { work_on: 'Written today, for tomorrow' }),
    entry('2026-09-19', { work_on: 'Wait for confirmation\nSize smaller' }),
    entry('2026-09-18', { work_on: 'wait for confirmation\nJournal after each close' }),
    entry('2026-09-17', { work_on: 'Third most recent note' }),
    entry('2026-09-16', { work_on: 'Too old to show' }),
  ]);
  assert.deepEqual(f.carryOver, [
    { text: 'Wait for confirmation', date: '2026-09-19' },
    { text: 'Size smaller', date: '2026-09-19' },
    { text: 'Journal after each close', date: '2026-09-18' },
    { text: 'Third most recent note', date: '2026-09-17' },
  ]);
});

test('only the last five active days are considered, and today itself is left out', () => {
  const f = focus([
    trade(TODAY, { followed_plan: 'no' }),
    ...['2026-09-19', '2026-09-18', '2026-09-17', '2026-09-16', '2026-09-15'].map((d) => trade(d)),
    trade('2026-09-01', { followed_plan: 'no' }),
    trade('2026-09-02', { followed_plan: 'no' }),
  ]);
  assert.deepEqual(f.days, ['2026-09-19', '2026-09-18', '2026-09-17', '2026-09-16', '2026-09-15']);
  assert.equal(f.callouts.find((c) => c.kind === 'plan').tone, 'good');
});

test('the window follows the timezone: a 23:30 UTC trade is already today in Dublin', () => {
  // Both timestamps are 23:10-23:30 UTC on the 19th => 00:10-00:30 on the 20th in Dublin.
  const late = trade('2026-09-19', { created_at: '2026-09-19 23:10:00', closed_at: '2026-09-19T23:30:00.000Z' });
  const utc = computeFocus({ trades: [late], entries: [], today: TODAY, timeZone: 'UTC' });
  const dublin = computeFocus({ trades: [late], entries: [], today: TODAY, timeZone: 'Europe/Dublin' });
  assert.deepEqual(utc.days, ['2026-09-19']);
  assert.deepEqual(dublin.days, []); // it happened today, so it is not part of "recent days"
});
