let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  // node:sqlite only works without a flag from Node 22.13; older versions
  // throw a cryptic ERR_UNKNOWN_BUILTIN_MODULE, so say what's actually wrong.
  console.error(
    `\nTrenching Journal needs Node.js 22.13 or newer, and this is ${process.version}.\n` +
      'Get the current LTS from https://nodejs.org, then start the app again.\n'
  );
  process.exit(1);
}
const path = require('node:path');
const fs = require('node:fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

// Tests point TRENCHING_DB_PATH at a throwaway file so they can never touch
// the real data/trades.db.
const db = new DatabaseSync(process.env.TRENCHING_DB_PATH || path.join(dataDir, 'trades.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coin_name TEXT NOT NULL,
    contract_address TEXT NOT NULL,
    entry_price REAL,
    entry_mcap REAL,
    exit_price REAL,
    exit_mcap REAL,
    amount_invested REAL NOT NULL,
    percent_risked REAL NOT NULL,
    fees REAL NOT NULL DEFAULT 0,
    thesis TEXT,
    emotional_state TEXT NOT NULL CHECK(emotional_state IN ('calm','excited','anxious','bored','fomo')),
    followed_plan TEXT CHECK(followed_plan IN ('yes','partially','no')),
    thoughts_during TEXT,
    lesson_learned TEXT,
    grade TEXT CHECK(grade IN ('A','B','C','D')),
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    closed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS wallets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_date TEXT NOT NULL UNIQUE,
    title TEXT,
    narrative TEXT,
    volume TEXT,
    challenges TEXT,
    lessons TEXT,
    starred INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT
  );
`);

// CREATE TABLE IF NOT EXISTS only helps for a brand-new database -- it won't
// add columns to a trades/journal_entries table that already exists from
// before contract_address/fees/title/starred were introduced. This keeps
// an existing local database (with real logged trades/entries) from
// breaking the moment the app starts referencing a column it doesn't have.
function ensureColumn(table, column, definition) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!existing.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('trades', 'contract_address', "TEXT NOT NULL DEFAULT ''");
ensureColumn('trades', 'fees', 'REAL NOT NULL DEFAULT 0');
ensureColumn('trades', 'screenshot', 'TEXT');
ensureColumn('trades', 'updated_at', 'TEXT');
ensureColumn('journal_entries', 'title', 'TEXT');
ensureColumn('journal_entries', 'starred', 'INTEGER NOT NULL DEFAULT 0');
// End-of-day check-in: what to work on tomorrow (up to 3 lines, newline-
// separated), last night's sleep 1-5, and whether the day's rules were kept.
ensureColumn('journal_entries', 'work_on', 'TEXT');
ensureColumn('journal_entries', 'sleep_rating', 'INTEGER CHECK(sleep_rating BETWEEN 1 AND 5)');
ensureColumn('journal_entries', 'rules_followed', "TEXT CHECK(rules_followed IN ('yes','partly','no'))");

// wallets.label -> wallets.name: renamed for clarity shortly after the
// column was introduced. Only matters for a database that already has the
// old column -- CREATE TABLE above already uses `name` for a fresh install.
function renameColumn(table, oldName, newName) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (existing.includes(oldName) && !existing.includes(newName)) {
    db.exec(`ALTER TABLE ${table} RENAME COLUMN ${oldName} TO ${newName}`);
  }
}
renameColumn('wallets', 'label', 'name');

module.exports = db;
