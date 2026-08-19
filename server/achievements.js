// Badges are derived entirely from trades/journal data already in the DB --
// there's no separate "achievements" table, so there's nothing to keep in
// sync and no risk of a badge surviving after the trade that earned it gets
// deleted.

function longestStreak(itemsChrono, predicate) {
  let best = 0;
  let current = 0;
  for (const item of itemsChrono) {
    if (predicate(item)) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return best;
}

// Longest run of consecutive calendar days among a set of (possibly
// unsorted, possibly duplicate) YYYY-MM-DD strings.
function longestDateStreak(dateStrings) {
  const dates = [...new Set(dateStrings)].sort();
  if (dates.length === 0) return 0;

  let best = 1;
  let current = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(`${dates[i - 1]}T00:00:00`);
    const curr = new Date(`${dates[i]}T00:00:00`);
    const diffDays = Math.round((curr - prev) / 86400000);
    current = diffDays === 1 ? current + 1 : 1;
    best = Math.max(best, current);
  }
  return best;
}

const BADGES = [
  {
    id: 'first_trade',
    title: 'First Trade',
    description: 'Log your first trade.',
    icon: '🎬',
    check: (ctx) => ctx.trades.length >= 1,
  },
  {
    id: 'trades_10',
    title: 'Getting Started',
    description: 'Log 10 trades.',
    icon: '📈',
    check: (ctx) => ctx.trades.length >= 10,
  },
  {
    id: 'trades_50',
    title: 'Grinding',
    description: 'Log 50 trades.',
    icon: '⛏️',
    check: (ctx) => ctx.trades.length >= 50,
  },
  {
    id: 'trades_100',
    title: 'Veteran',
    description: 'Log 100 trades.',
    icon: '🎖️',
    check: (ctx) => ctx.trades.length >= 100,
  },
  {
    id: 'first_win',
    title: 'First Win',
    description: 'Close your first profitable trade.',
    icon: '✅',
    check: (ctx) => ctx.closed.some((t) => t.pnl_amount > 0),
  },
  {
    id: 'first_2x',
    title: 'Double Up',
    description: 'Hit a 2x (100%+) on a closed trade.',
    icon: '🚀',
    check: (ctx) => ctx.closed.some((t) => t.pnl_percent != null && t.pnl_percent >= 100),
  },
  {
    id: 'first_5x',
    title: 'High Roller',
    description: 'Hit a 5x (400%+) on a closed trade.',
    icon: '🔥',
    check: (ctx) => ctx.closed.some((t) => t.pnl_percent != null && t.pnl_percent >= 400),
  },
  {
    id: 'first_10x',
    title: 'Moonshot',
    description: 'Hit a 10x (900%+) on a closed trade.',
    icon: '🌕',
    check: (ctx) => ctx.closed.some((t) => t.pnl_percent != null && t.pnl_percent >= 900),
  },
  {
    id: 'win_streak_5',
    title: 'On a Heater',
    description: '5 winning trades in a row.',
    icon: '🌶️',
    check: (ctx) => longestStreak(ctx.closedChrono, (t) => t.pnl_amount > 0) >= 5,
  },
  {
    id: 'grade_a_streak_5',
    title: 'Disciplined',
    description: '5 grade-A trades in a row.',
    icon: '🧘',
    check: (ctx) => longestStreak(ctx.closedChrono, (t) => t.grade === 'A') >= 5,
  },
  {
    id: 'journal_first',
    title: 'Dear Diary',
    description: 'Write your first journal entry.',
    icon: '📔',
    check: (ctx) => ctx.journalEntries.length >= 1,
  },
  {
    id: 'journal_25',
    title: 'Chronicler',
    description: 'Write 25 journal entries.',
    icon: '📚',
    check: (ctx) => ctx.journalEntries.length >= 25,
  },
  {
    id: 'journal_streak_5',
    title: 'Consistent',
    description: '5-day journal streak.',
    icon: '📅',
    check: (ctx) => longestDateStreak(ctx.journalDates) >= 5,
  },
  {
    id: 'journal_streak_10',
    title: 'Habit Formed',
    description: '10-day journal streak.',
    icon: '🏅',
    check: (ctx) => longestDateStreak(ctx.journalDates) >= 10,
  },
];

function computeAchievements(trades, journalEntries) {
  const closed = trades.filter((t) => t.status === 'closed');
  const closedChrono = [...closed].sort((a, b) => new Date(a.closed_at) - new Date(b.closed_at));
  const journalDates = journalEntries.map((e) => e.entry_date);

  const ctx = { trades, closed, closedChrono, journalEntries, journalDates };

  return BADGES.map((b) => ({
    id: b.id,
    title: b.title,
    description: b.description,
    icon: b.icon,
    earned: b.check(ctx),
  }));
}

module.exports = { computeAchievements };
