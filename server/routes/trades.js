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

// Shared by POST (log-and-close in one step) and PUT (close later): a trade
// can only become "closed" once it has an exit value, a thesis, a grade, and
// a followed-plan answer — the whole point of the journal is that these
// aren't optional afterthoughts.
function validateCloseFields(fields) {
  if (fields.exit_price == null && fields.exit_mcap == null) {
    return 'exit_price or exit_mcap is required to close a trade';
  }
  if (!fields.thesis || !String(fields.thesis).trim()) {
    return 'thesis is required before a trade can be closed';
  }
  if (!GRADES.includes(fields.grade)) {
    return `grade must be one of ${GRADES.join(', ')} to close a trade`;
  }
  if (!FOLLOWED_PLAN.includes(fields.followed_plan)) {
    return `followed_plan must be one of ${FOLLOWED_PLAN.join(', ')} to close a trade`;
  }
  return null;
}

// GET /api/trades?from=YYYY-MM-DD&to=YYYY-MM-DD&grade=A
router.get('/', (req, res) => {
  const { from, to, grade } = req.query;
  const clauses = [];
  const params = [];

  if (from) {
    clauses.push('date(coalesce(closed_at, created_at)) >= ?');
    params.push(from);
  }
  if (to) {
    clauses.push('date(coalesce(closed_at, created_at)) <= ?');
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

// POST /api/trades — open a trade, or log+close it in one shot (fast memecoin
// trades often finish in minutes, so the whole lifecycle can be submitted at once).
router.post('/', (req, res) => {
  const {
    coin_name,
    contract_address,
    entry_price,
    entry_mcap,
    exit_price,
    exit_mcap,
    amount_invested,
    percent_risked,
    fees,
    emotional_state,
    thesis,
    followed_plan,
    thoughts_during,
    lesson_learned,
    grade,
    status,
  } = req.body;

  if (!coin_name || !coin_name.trim()) {
    return res.status(400).json({ error: 'coin_name is required' });
  }
  if (!contract_address || !contract_address.trim()) {
    return res.status(400).json({ error: 'contract_address is required' });
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

  const closing = status === 'closed';
  if (closing) {
    const err = validateCloseFields({ exit_price, exit_mcap, thesis, grade, followed_plan });
    if (err) return res.status(400).json({ error: err });
  }

  const result = db
    .prepare(
      `INSERT INTO trades
        (coin_name, contract_address, entry_price, entry_mcap, exit_price, exit_mcap,
         amount_invested, percent_risked, fees, thesis, emotional_state,
         followed_plan, thoughts_during, lesson_learned, grade, status, closed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      coin_name.trim(),
      contract_address.trim(),
      entry_price ?? null,
      entry_mcap ?? null,
      exit_price ?? null,
      exit_mcap ?? null,
      Number(amount_invested),
      Number(percent_risked),
      fees ? Number(fees) : 0,
      thesis ?? null,
      emotional_state,
      followed_plan ?? null,
      thoughts_during ?? null,
      lesson_learned ?? null,
      grade ?? null,
      closing ? 'closed' : 'open',
      closing ? new Date().toISOString() : null
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
    'contract_address',
    'entry_price',
    'entry_mcap',
    'exit_price',
    'exit_mcap',
    'amount_invested',
    'percent_risked',
    'fees',
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
    const err = validateCloseFields(next);
    if (err) return res.status(400).json({ error: err });
  }

  if (next.emotional_state && !EMOTIONAL_STATES.includes(next.emotional_state)) {
    return res.status(400).json({ error: `emotional_state must be one of ${EMOTIONAL_STATES.join(', ')}` });
  }

  db.prepare(
    `UPDATE trades SET
      coin_name = ?, contract_address = ?, entry_price = ?, entry_mcap = ?, exit_price = ?, exit_mcap = ?,
      amount_invested = ?, percent_risked = ?, fees = ?, thesis = ?, emotional_state = ?,
      followed_plan = ?, thoughts_during = ?, lesson_learned = ?, grade = ?,
      status = ?, closed_at = ?
     WHERE id = ?`
  ).run(
    next.coin_name,
    next.contract_address,
    next.entry_price ?? null,
    next.entry_mcap ?? null,
    next.exit_price ?? null,
    next.exit_mcap ?? null,
    next.amount_invested,
    next.percent_risked,
    next.fees ?? 0,
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
