const { test } = require('node:test');
const assert = require('node:assert/strict');
const { dayOf, formatDateTime, shiftDay, isValidTimeZone } = require('../shared/dates');

// 23:30 UTC on 19 Sep is already the 20th in Dublin (BST, UTC+1) and Tokyo,
// but still the 19th in New York (EDT, UTC-4).
test('a late-evening UTC timestamp lands on the right local day per timezone', () => {
  assert.equal(dayOf('2026-09-19 23:30:00', 'UTC'), '2026-09-19');
  assert.equal(dayOf('2026-09-19 23:30:00', 'Europe/Dublin'), '2026-09-20');
  assert.equal(dayOf('2026-09-19 23:30:00', 'Asia/Tokyo'), '2026-09-20');
  assert.equal(dayOf('2026-09-19 23:30:00', 'America/New_York'), '2026-09-19');
});

test('SQLite-style and ISO timestamps for the same instant give the same day', () => {
  assert.equal(
    dayOf('2026-09-19 23:30:00', 'Europe/Dublin'),
    dayOf('2026-09-19T23:30:00.000Z', 'Europe/Dublin')
  );
});

test('an evening trade in New York belongs to that evening, not the next UTC day', () => {
  // 9pm EDT on the 19th is 01:00 UTC on the 20th.
  assert.equal(dayOf('2026-09-20T01:00:00.000Z', 'America/New_York'), '2026-09-19');
});

test('daylight saving is respected: Dublin is UTC+0 in winter', () => {
  assert.equal(dayOf('2026-12-19 23:30:00', 'Europe/Dublin'), '2026-12-19');
});

test('formatDateTime shows the wall-clock time in the requested timezone', () => {
  assert.equal(formatDateTime('2026-09-19 23:30:00', 'UTC'), '2026-09-19 23:30');
  assert.equal(formatDateTime('2026-09-19 23:30:00', 'Europe/Dublin'), '2026-09-20 00:30');
  assert.equal(formatDateTime('2026-09-19T23:30:00.000Z', 'America/New_York'), '2026-09-19 19:30');
});

test('formatDateTime shows midnight as 00:00, never 24:00', () => {
  assert.equal(formatDateTime('2026-09-20 00:00:00', 'UTC'), '2026-09-20 00:00');
});

test('a bare date passes through unchanged', () => {
  assert.equal(dayOf('2026-09-20', 'Asia/Tokyo'), '2026-09-20');
});

test('an unparseable value falls back to its first 10 characters', () => {
  assert.equal(dayOf('not-a-real-timestamp-at-all', 'UTC'), 'not-a-real');
});

test('shiftDay crosses month, year and leap-day boundaries', () => {
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDay('2028-03-01', -1), '2028-02-29');
  assert.equal(shiftDay('2026-01-01', -1), '2025-12-31');
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDay('2026-09-20', -5), '2026-09-15');
});

test('isValidTimeZone accepts IANA names and rejects junk', () => {
  assert.equal(isValidTimeZone('Europe/Dublin'), true);
  assert.equal(isValidTimeZone('Mars/Olympus_Mons'), false);
});
