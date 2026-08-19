const express = require('express');
const db = require('../db');
const { computePnl } = require('../pnl');
const { computeAchievements } = require('../achievements');

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM trades').all();
  const trades = rows.map((row) => ({ ...row, ...computePnl(row) }));
  const journalEntries = db.prepare('SELECT * FROM journal_entries').all();
  res.json(computeAchievements(trades, journalEntries));
});

module.exports = router;
