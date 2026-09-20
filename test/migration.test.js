const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { startServer } = require('./support/server');

// Real users keep their data file across app updates, so opening a database
// created by an OLD version must upgrade it in place without losing anything.
test('an old-schema database is upgraded in place and keeps its rows', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trenching-migrate-'));
  const dbFile = path.join(dir, 'old.db');

  const old = new DatabaseSync(dbFile);
  old.exec(`
    CREATE TABLE trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coin_name TEXT NOT NULL,
      entry_price REAL, entry_mcap REAL, exit_price REAL, exit_mcap REAL,
      amount_invested REAL NOT NULL,
      percent_risked REAL NOT NULL,
      thesis TEXT,
      emotional_state TEXT NOT NULL,
      followed_plan TEXT, thoughts_during TEXT, lesson_learned TEXT, grade TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT
    );
    CREATE TABLE wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      address TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE journal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_date TEXT NOT NULL UNIQUE,
      narrative TEXT, volume TEXT, challenges TEXT, lessons TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    );
  `);
  old.prepare(
    "INSERT INTO trades (coin_name, entry_mcap, amount_invested, percent_risked, emotional_state) VALUES ('OLDCOIN', 1000, 1, 2, 'calm')"
  ).run();
  old.prepare("INSERT INTO wallets (label, address) VALUES ('main', 'abc123')").run();
  old.prepare("INSERT INTO journal_entries (entry_date, lessons) VALUES ('2025-12-01', 'old lesson')").run();
  old.close();

  const server = await startServer({ dbFile });
  try {
    const trades = (await server.get('/api/trades')).data;
    assert.equal(trades.length, 1);
    assert.equal(trades[0].coin_name, 'OLDCOIN');
    assert.equal(trades[0].fees, 0);
    assert.equal(trades[0].contract_address, '');

    const wallets = (await server.get('/api/wallets')).data;
    assert.equal(wallets[0].name, 'main');

    const journal = (await server.get('/api/journal')).data;
    assert.equal(journal[0].lessons, 'old lesson');
    assert.equal(journal[0].starred, 0);
    assert.equal(journal[0].work_on, null);
    assert.equal(journal[0].sleep_rating, null);
    assert.equal(journal[0].rules_followed, null);
  } finally {
    await server.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
