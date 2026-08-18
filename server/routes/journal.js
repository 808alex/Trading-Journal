const express = require('express');
const db = require('../db');

const router = express.Router();

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
// than always creating a new row.
router.post('/', (req, res) => {
  const { entry_date, title, narrative, volume, challenges, lessons, starred } = req.body;

  if (!entry_date || !/^\d{4}-\d{2}-\d{2}$/.test(entry_date)) {
    return res.status(400).json({ error: 'entry_date is required, in YYYY-MM-DD format' });
  }

  db.prepare(
    `INSERT INTO journal_entries (entry_date, title, narrative, volume, challenges, lessons, starred)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(entry_date) DO UPDATE SET
       title = excluded.title,
       narrative = excluded.narrative,
       volume = excluded.volume,
       challenges = excluded.challenges,
       lessons = excluded.lessons,
       starred = excluded.starred,
       updated_at = datetime('now')`
  ).run(
    entry_date,
    title ?? null,
    narrative ?? null,
    volume ?? null,
    challenges ?? null,
    lessons ?? null,
    starred ? 1 : 0
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
