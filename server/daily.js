const { dayOf } = require('../shared/dates');

const MOOD_ORDER = ['calm', 'excited', 'anxious', 'bored', 'fomo'];

const round1 = (n) => Math.round(n * 10) / 10;

function brief(t) {
  return {
    id: t.id,
    coin_name: t.coin_name,
    status: t.status,
    emotional_state: t.emotional_state,
    grade: t.grade ?? null,
    pnl_amount: t.pnl_amount,
    pnl_percent: t.pnl_percent,
  };
}

// Everything the journal (and the Today screen) says about one calendar day,
// derived from the trades rather than typed in. `trades` must already carry
// pnl_amount/pnl_percent. A trade counts as "opened" on the day it was
// logged and as "closed" on the day it was closed -- the same day the
// calendar puts its P&L on -- and `timeZone` decides where midnight is.
function computeDaySummary(trades, date, timeZone) {
  const opened = trades.filter((t) => dayOf(t.created_at, timeZone) === date);
  const closed = trades.filter(
    (t) => t.status === 'closed' && dayOf(t.closed_at || t.created_at, timeZone) === date
  );

  const pnl = closed.reduce((sum, t) => sum + (t.pnl_amount || 0), 0);
  const wins = closed.filter((t) => t.pnl_amount > 0).length;
  const losses = closed.filter((t) => t.pnl_amount < 0).length;

  // Mood is recorded at entry, so it describes the trades opened that day.
  const moodCounts = {};
  opened.forEach((t) => { moodCounts[t.emotional_state] = (moodCounts[t.emotional_state] || 0) + 1; });
  const moodMix = MOOD_ORDER.filter((m) => moodCounts[m])
    .map((mood) => ({ mood, count: moodCounts[mood] }))
    .sort((a, b) => b.count - a.count);

  // Plan adherence is answered when a trade is closed.
  const plan = { yes: 0, partially: 0, no: 0 };
  closed.forEach((t) => { if (t.followed_plan in plan) plan[t.followed_plan] += 1; });

  const scored = closed.filter((t) => t.pnl_amount != null);
  const bestTrade = scored.reduce((a, b) => (a == null || b.pnl_amount > a.pnl_amount ? b : a), null);
  const worstTrade = scored.reduce((a, b) => (a == null || b.pnl_amount < a.pnl_amount ? b : a), null);

  const touched = new Map();
  [...opened, ...closed].forEach((t) => touched.set(t.id, t));
  const dayTrades = [...touched.values()]
    .sort((a, b) => a.id - b.id)
    .map((t) => ({
      ...brief(t),
      opened_today: opened.includes(t),
      closed_today: closed.includes(t),
    }));

  return {
    date,
    opened: opened.length,
    closed: closed.length,
    pnl,
    wins,
    losses,
    winRate: closed.length ? round1((wins / closed.length) * 100) : null,
    moodMix,
    plan,
    best: bestTrade && bestTrade.pnl_amount > 0 ? brief(bestTrade) : null,
    worst: worstTrade && worstTrade.pnl_amount < 0 ? brief(worstTrade) : null,
    trades: dayTrades,
  };
}

module.exports = { computeDaySummary };
