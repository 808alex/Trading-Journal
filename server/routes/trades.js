const express = require('express');
const db = require('../db');
const { computePnl } = require('../pnl');

const router = express.Router();

const EMOTIONAL_STATES = ['calm', 'excited', 'anxious', 'bored', 'fomo'];
const FOLLOWED_PLAN = ['yes', 'partially', 'no'];
const GRADES = ['A', 'B', 'C', 'D'];

function serialize(row) {
  return { ...row, ...computePnl(row) };
}

// GET /api/trades?from=YYYY-MM-DD&to=YYYY-MM-DD&grade=A
router.get('/', (req, res) => {
  const { from, to, grade } = req.query;
  const clauses = [];
  const params = [];

  if (from) {
    clauses.push("date(coalesce(closed_at, created_at)) >= ?");
    params.push(from);
  }
  if (to) {
    clauses.push("date(coalesce(closed_at, created_at)) <= ?");
    params.push(to);
  }
  if (grade) {
    clauses.push('grade = ?');
    params.push(grade);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT * FROM trades ${where} ORDER BY coalesce(closed_at, created_at) DESC, id DESC`)
    .all(...params);

  res.json(rows.map(serialize));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM trades WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Trade not found' });
  res.json(serialize(row));
});

// POST /api/trades — open a new trade
router.post('/', (req, res) => {
  const {
    coin_name,
    entry_price,
    entry_mcap,
    amount_invested,
    percent_risked,
    emotional_state,
    thesis,
  } = req.body;

  if (!coin_name || !coin_name.trim()) {
    return res.status(400).json({ error: 'coin_name is required' });
  }
  if (entry_price == null && entry_mcap == null) {
    return res.status(400).json({ error: 'entry_price or entry_mcap is required' });
  }
  if (amount_invested == null || Number.isNaN(Number(amount_invested))) {
    return res.status(400).json({ error: 'amount_invested is required' });
  }
  if (percent_risked == null || Number.isNaN(Number(percent_risked))) {
    return res.status(400).json({ error: 'percent_risked is required' });
  }
  if (!EMOTIONAL_STATES.includes(emotional_state)) {
    return res.status(400).json({ error: `emotional_state must be one of ${EMOTIONAL_STATES.join(', ')}` });
  }

  const result = db
    .prepare(
      `INSERT INTO trades
        (coin_name, entry_price, entry_mcap, amount_invested, percent_risked, emotional_state, thesis)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      coin_name.trim(),
      entry_price ?? null,
      entry_mcap ?? null,
      Number(amount_invested),
      Number(percent_risked),
      emotional_state,
      thesis ?? null
    );

  const row = db.prepare('SELECT * FROM trades WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(serialize(row));
});

// PUT /api/trades/:id — update an open trade, or close it
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM trades WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Trade not found' });

  const fields = [
    'coin_name',
    'entry_price',
    'entry_mcap',
    'exit_price',
    'exit_mcap',
    'amount_invested',
    'percent_risked',
    'thesis',
    'emotional_state',
    'followed_plan',
    'thoughts_during',
    'lesson_learned',
    'grade',
  ];

  const next = { ...existing };
  for (const f of fields) {
    if (req.body[f] !== undefined) next[f] = req.body[f];
  }

  const closing = req.body.status === 'closed';

  if (closing) {
    if (next.exit_price == null && next.exit_mcap == null) {
      return res.status(400).json({ error: 'exit_price or exit_mcap is required to close a trade' });
    }
    if (!next.thesis || !String(next.thesis).trim()) {
      return res.status(400).json({ error: 'thesis is required before a trade can be closed' });
    }
    if (!GRADES.includes(next.grade)) {
      return res.status(400).json({ error: `grade must be one of ${GRADES.join(', ')} to close a trade` });
    }
    if (!FOLLOWED_PLAN.includes(next.followed_plan)) {
      return res.status(400).json({ error: `followed_plan must be one of ${FOLLOWED_PLAN.join(', ')} to close a trade` });
    }
  }

  if (next.emotional_state && !EMOTIONAL_STATES.includes(next.emotional_state)) {
    return res.status(400).json({ error: `emotional_state must be one of ${EMOTIONAL_STATES.join(', ')}` });
  }

  db.prepare(
    `UPDATE trades SET
      coin_name = ?, entry_price = ?, entry_mcap = ?, exit_price = ?, exit_mcap = ?,
      amount_invested = ?, percent_risked = ?, thesis = ?, emotional_state = ?,
      followed_plan = ?, thoughts_during = ?, lesson_learned = ?, grade = ?,
      status = ?, closed_at = ?
     WHERE id = ?`
  ).run(
    next.coin_name,
    next.entry_price ?? null,
    next.entry_mcap ?? null,
    next.exit_price ?? null,
    next.exit_mcap ?? null,
    next.amount_invested,
    next.percent_risked,
    next.thesis ?? null,
    next.emotional_state,
    next.followed_plan ?? null,
    next.thoughts_during ?? null,
    next.lesson_learned ?? null,
    next.grade ?? null,
    closing ? 'closed' : existing.status,
    closing ? new Date().toISOString() : existing.closed_at,
    req.params.id
  );

  const row = db.prepare('SELECT * FROM trades WHERE id = ?').get(req.params.id);
  res.json(serialize(row));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM trades WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Trade not found' });
  res.status(204).end();
});

module.exports = router;
