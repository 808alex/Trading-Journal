const express = require('express');
const db = require('../db');
const { computePnl } = require('../pnl');
const { computeDashboard } = require('../dashboard');

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM trades').all();
  const trades = rows.map((row) => ({ ...row, ...computePnl(row) }));
  res.json(computeDashboard(trades));
});

module.exports = router;
