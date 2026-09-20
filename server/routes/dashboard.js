const express = require('express');
const { loadTradesWithPnl } = require('../queries');
const { computeDashboard } = require('../dashboard');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(computeDashboard(loadTradesWithPnl()));
});

module.exports = router;
