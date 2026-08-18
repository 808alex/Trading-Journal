const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const db = new DatabaseSync(path.join(dataDir, 'trades.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coin_name TEXT NOT NULL,
    entry_price REAL,
    entry_mcap REAL,
    exit_price REAL,
    exit_mcap REAL,
    amount_invested REAL NOT NULL,
    percent_risked REAL NOT NULL,
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
`);

module.exports = db;
