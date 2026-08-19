const express = require('express');
const db = require('../db');

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

  const payload = {
    exportedFrom: 'Trading Journal',
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    trades,
    journal_entries,
  };

  const filename = `trading-journal-backup-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(JSON.stringify(payload, null, 2));
});

// Replaces every row in `table` with `rows` from the import file. Column
// names come from the *current* schema (via PRAGMA table_info), not from
// whatever keys happen to be in the uploaded JSON -- the file's keys are
// only used to look up values, never interpolated into SQL, and any column
// missing from an older export just gets NULL rather than failing the
// import outright.
function importRows(table, rows) {
  const columns = getColumns(table);
  db.prepare(`DELETE FROM ${table}`).run();
  if (!Array.isArray(rows) || rows.length === 0) return 0;

  const placeholders = columns.map(() => '?').join(', ');
  const stmt = db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`);
  let count = 0;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    stmt.run(...columns.map((c) => (row[c] !== undefined ? row[c] : null)));
    count += 1;
  }
  return count;
}

// POST /api/backup/import — replaces trades and/or journal_entries with
// whatever arrays are present in the uploaded file. Whichever key is
// missing from the file is left untouched here (rather than wiped), so a
// partial/hand-edited export doesn't silently blow away the other table.
router.post('/import', (req, res) => {
  const { trades, journal_entries } = req.body || {};

  if (!Array.isArray(trades) && !Array.isArray(journal_entries)) {
    return res.status(400).json({ error: "That doesn't look like a Trading Journal export file." });
  }

  const result = {};
  if (Array.isArray(trades)) result.tradesImported = importRows('trades', trades);
  if (Array.isArray(journal_entries)) result.journalEntriesImported = importRows('journal_entries', journal_entries);
  res.json(result);
});

module.exports = router;
