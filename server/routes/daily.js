const express = require('express');
const db = require('../db');
const { computePnl } = require('../pnl');
const { computeDaySummary } = require('../daily');
const { resolveTimeZone } = require('../../shared/dates');

const router = express.Router();

// GET /api/daily/2026-09-20?tz=Europe/Dublin
// tz is the browser's IANA timezone, so "the 20th" means the user's 20th.
router.get('/:date', (req, res) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date)) {
    return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
  }
  const rows = db.prepare('SELECT * FROM trades').all();
  const trades = rows.map((row) => ({ ...row, ...computePnl(row) }));
  res.json(computeDaySummary(trades, req.params.date, resolveTimeZone(req.query.tz)));
});

module.exports = router;
