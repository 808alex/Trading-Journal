const express = require('express');
const db = require('../db');
const { computePnl } = require('../pnl');

const router = express.Router();

function getColumns(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

// GET /api/backup/export — everything the app stores, as a single JSON
// file the browser downloads directly (Content-Disposition), so updating
// or reinstalling the app doesn't mean starting the journal over from
// scratch. No auth/encryption here -- this app never asks for anything
// sensitive in the first place (no wallet keys, no real account), so the
// export is just the trades/journal data as-is.
router.get('/export', (req, res) => {
  const trades = db.prepare('SELECT * FROM trades').all();
  const journal_entries = db.prepare('SELECT * FROM journal_entries').all();
  const wallets = db.prepare('SELECT * FROM wallets').all();

  const payload = {
    exportedFrom: 'Trenching Journal',
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    trades,
    journal_entries,
    wallets,
  };

  const filename = `trenching-journal-backup-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(JSON.stringify(payload, null, 2));
});

// A single CSV field, quoted only when it needs to be (contains a comma,
// quote, or newline) -- an internal quote doubles up per the CSV spec.
function csvField(value) {
  if (value == null) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

// GET /api/backup/export-csv — trades only (journal entries are free-text
// narrative, not really spreadsheet-shaped) with P&L computed the same way
// the app displays it, for anyone who wants to poke at their own data in
// Excel/Sheets rather than the app itself.
router.get('/export-csv', (req, res) => {
  const trades = db.prepare('SELECT * FROM trades ORDER BY coalesce(closed_at, created_at) ASC, id ASC').all();

  const columns = [
    'id', 'coin_name', 'contract_address', 'status',
    'entry_price', 'entry_mcap', 'exit_price', 'exit_mcap',
    'amount_invested', 'percent_risked', 'fees',
    'pnl_amount', 'pnl_percent',
    'emotional_state', 'followed_plan', 'grade',
    'thesis', 'thoughts_during', 'lesson_learned',
    'created_at', 'closed_at',
  ];

  const rows = trades.map((t) => ({ ...t, ...computePnl(t) }));
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => csvField(row[c])).join(','));
  }

  const filename = `trenching-journal-trades-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(lines.join('\r\n'));
});

// Replaces every row in `table` with `rows` from the import file. Column
// names come from the *current* schema (via PRAGMA table_info), not from
// whatever keys happen to be in the uploaded JSON -- the file's keys are
// only used to look up values, never interpolated into SQL. A column left
// out of a given row is omitted from that row's INSERT entirely (rather
// than explicitly written as NULL), so the column's own schema default
// applies instead of tripping a NOT NULL constraint -- e.g. created_at,
// which is NOT NULL with a DEFAULT, but has no value in a hand-built or
// partial import.
function importRows(table, rows) {
  const validColumns = getColumns(table);
  db.prepare(`DELETE FROM ${table}`).run();
  if (!Array.isArray(rows) || rows.length === 0) return 0;

  let count = 0;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const columns = validColumns.filter((c) => row[c] !== undefined);
    if (columns.length === 0) continue;
    const placeholders = columns.map(() => '?').join(', ');
    db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`).run(
      ...columns.map((c) => row[c])
    );
    count += 1;
  }
  return count;
}

// POST /api/backup/import — replaces trades, journal_entries, and/or
// wallets with whatever arrays are present in the uploaded file. Whichever
// key is missing from the file is left untouched here (rather than wiped),
// so a partial/hand-edited export doesn't silently blow away the others.
router.post('/import', (req, res) => {
  const { trades, journal_entries, wallets } = req.body || {};

  if (!Array.isArray(trades) && !Array.isArray(journal_entries) && !Array.isArray(wallets)) {
    return res.status(400).json({ error: "That doesn't look like a Trenching Journal export file." });
  }

  const result = {};
  if (Array.isArray(trades)) result.tradesImported = importRows('trades', trades);
  if (Array.isArray(journal_entries)) result.journalEntriesImported = importRows('journal_entries', journal_entries);
  if (Array.isArray(wallets)) result.walletsImported = importRows('wallets', wallets);
  res.json(result);
});

module.exports = router;
