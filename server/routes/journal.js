const express = require('express');
const db = require('../db');

const router = express.Router();

const RULES_FOLLOWED = ['yes', 'partly', 'no'];
const MAX_WORK_ON_ITEMS = 3;
const MAX_WORK_ON_LENGTH = 200;

// "Work on tomorrow" arrives as an array of lines or one newline-separated
// string; it is stored as the latter, trimmed, capped, with blanks dropped.
function normaliseWorkOn(value) {
  if (value == null) return null;
  const lines = (Array.isArray(value) ? value : String(value).split('\n'))
    .map((line) => String(line).trim().slice(0, MAX_WORK_ON_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_WORK_ON_ITEMS);
  return lines.length ? lines.join('\n') : null;
}

// GET /api/journal — all entries, newest first
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM journal_entries ORDER BY entry_date DESC').all();
  res.json(rows);
});

router.get('/:date', (req, res) => {
  const row = db.prepare('SELECT * FROM journal_entries WHERE entry_date = ?').get(req.params.date);
  if (!row) return res.status(404).json({ error: 'No journal entry for that date' });
  res.json(row);
});

// POST /api/journal — one entry per day, so this upserts by entry_date rather
// than always creating a new row. A field that is left out of the request
// keeps its saved value (only an explicit null clears it), so a partial
// payload -- like the star toggle -- can never wipe the rest of the entry.
router.post('/', (req, res) => {
  const body = req.body || {};
  const { entry_date } = body;

  if (!entry_date || !/^\d{4}-\d{2}-\d{2}$/.test(entry_date)) {
    return res.status(400).json({ error: 'entry_date is required, in YYYY-MM-DD format' });
  }

  const existing = db.prepare('SELECT * FROM journal_entries WHERE entry_date = ?').get(entry_date);
  const pick = (key) => (body[key] !== undefined ? body[key] : existing ? existing[key] : null);

  const sleepRaw = pick('sleep_rating');
  const sleep = sleepRaw == null || sleepRaw === '' ? null : Number(sleepRaw);
  if (sleep !== null && !(Number.isInteger(sleep) && sleep >= 1 && sleep <= 5)) {
    return res.status(400).json({ error: 'sleep_rating must be a whole number from 1 to 5' });
  }

  const rules = pick('rules_followed') || null;
  if (rules !== null && !RULES_FOLLOWED.includes(rules)) {
    return res.status(400).json({ error: `rules_followed must be one of ${RULES_FOLLOWED.join(', ')}` });
  }

  const workOn = body.work_on !== undefined ? normaliseWorkOn(body.work_on) : existing?.work_on ?? null;

  db.prepare(
    `INSERT INTO journal_entries
       (entry_date, title, narrative, volume, challenges, lessons, starred, work_on, sleep_rating, rules_followed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(entry_date) DO UPDATE SET
       title = excluded.title,
       narrative = excluded.narrative,
       volume = excluded.volume,
       challenges = excluded.challenges,
       lessons = excluded.lessons,
       starred = excluded.starred,
       work_on = excluded.work_on,
       sleep_rating = excluded.sleep_rating,
       rules_followed = excluded.rules_followed,
       updated_at = datetime('now')`
  ).run(
    entry_date,
    pick('title'),
    pick('narrative'),
    pick('volume'),
    pick('challenges'),
    pick('lessons'),
    pick('starred') ? 1 : 0,
    workOn,
    sleep,
    rules
  );

  const row = db.prepare('SELECT * FROM journal_entries WHERE entry_date = ?').get(entry_date);
  res.status(201).json(row);
});

router.delete('/:date', (req, res) => {
  const result = db.prepare('DELETE FROM journal_entries WHERE entry_date = ?').run(req.params.date);
  if (result.changes === 0) return res.status(404).json({ error: 'No journal entry for that date' });
  res.status(204).end();
});

module.exports = router;
