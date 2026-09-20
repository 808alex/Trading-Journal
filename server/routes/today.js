const express = require('express');
const db = require('../db');
const { loadTradesWithPnl } = require('../queries');
const { computeDaySummary } = require('../daily');
const { computeFocus } = require('../focus');
const { resolveTimeZone, todayIn } = require('../../shared/dates');

const router = express.Router();

// GET /api/today?tz=Europe/Dublin — everything the home screen needs in one
// round trip: today's numbers, positions still open, the focus guidance, and
// whether today's journal / check-in has been started.
router.get('/', (req, res) => {
  const timeZone = resolveTimeZone(req.query.tz);
  const today = todayIn(timeZone);

  const trades = loadTradesWithPnl();
  const entries = db.prepare('SELECT * FROM journal_entries').all();
  const todayEntry = entries.find((e) => e.entry_date === today) || null;

  const openPositions = trades
    .filter((t) => t.status === 'open')
    .sort((a, b) => a.id - b.id)
    .map((t) => ({
      id: t.id,
      coin_name: t.coin_name,
      created_at: t.created_at,
      amount_invested: t.amount_invested,
      percent_risked: t.percent_risked,
      emotional_state: t.emotional_state,
    }));

  res.json({
    date: today,
    summary: computeDaySummary(trades, today, timeZone),
    openPositions,
    focus: computeFocus({ trades, entries, today, timeZone }),
    journal: {
      hasEntry: !!todayEntry,
      hasCheckIn: !!(todayEntry && (todayEntry.work_on || todayEntry.sleep_rating || todayEntry.rules_followed)),
    },
  });
});

module.exports = router;
