// Badges and streaks are derived entirely from trades/journal data already
// in the DB -- there's no achievements table, so nothing to keep in sync
// and no stale badge left behind if the trade that earned it gets deleted.

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

function totalProfit(closed) {
  return closed.reduce((total, t) => total + (t.pnl_amount || 0), 0);
}

// Descriptions are written for someone who has never seen this app before --
// every badge should be understandable without already knowing what it
// means, not just a title someone has to guess at.
const CATEGORIES = [
  {
    name: 'Getting Started',
    badges: [
      { id: 'first_trade_closed', title: 'First Trade Closed', description: 'Close your first trade — add an exit price and grade to an open trade.', icon: '🏁', check: (ctx) => ctx.closed.length >= 1 },
      { id: 'first_journal', title: 'First Journal Entry', description: 'Write your first daily journal entry.', icon: '📔', check: (ctx) => ctx.journalEntries.length >= 1 },
      { id: 'first_screenshot', title: 'First Screenshot', description: 'Attach a screenshot to any trade.', icon: '📷', check: (ctx) => ctx.trades.some((t) => !!t.screenshot) },
    ],
  },
  {
    name: 'Trade Volume',
    badges: [
      { id: 'trades_1', title: '1 Trade Logged', description: 'Log your first trade (open or closed).', icon: '🎬', check: (ctx) => ctx.trades.length >= 1 },
      { id: 'trades_5', title: '5 Trades Logged', description: 'Log 5 trades total (open or closed).', icon: '🌱', check: (ctx) => ctx.trades.length >= 5 },
      { id: 'trades_10', title: '10 Trades Logged', description: 'Log 10 trades total (open or closed).', icon: '📈', check: (ctx) => ctx.trades.length >= 10 },
      { id: 'trades_25', title: '25 Trades Logged', description: 'Log 25 trades total (open or closed).', icon: '⛏️', check: (ctx) => ctx.trades.length >= 25 },
      { id: 'trades_50', title: '50 Trades Logged', description: 'Log 50 trades total (open or closed).', icon: '🗻', check: (ctx) => ctx.trades.length >= 50 },
      { id: 'trades_100', title: '100 Trades Logged', description: 'Log 100 trades total (open or closed).', icon: '🎖️', check: (ctx) => ctx.trades.length >= 100 },
      { id: 'trades_250', title: '250 Trades Logged', description: 'Log 250 trades total (open or closed).', icon: '🏔️', check: (ctx) => ctx.trades.length >= 250 },
      { id: 'trades_500', title: '500 Trades Logged', description: 'Log 500 trades total (open or closed).', icon: '🗿', check: (ctx) => ctx.trades.length >= 500 },
      { id: 'trades_1000', title: '1,000 Trades Logged', description: 'Log 1,000 trades total (open or closed).', icon: '💯', check: (ctx) => ctx.trades.length >= 1000 },
    ],
  },
  {
    name: 'PNL',
    badges: [
      { id: 'first_win', title: 'First Win', description: 'Close a trade with a positive P&L — any amount of profit counts.', icon: '✅', check: (ctx) => ctx.closed.some((t) => t.pnl_amount > 0) },
      { id: 'double_up', title: 'Double Up', description: 'Close a trade that returned 2x or more (100%+ profit) on your entry.', icon: '🚀', check: (ctx) => ctx.closed.some((t) => t.pnl_percent != null && t.pnl_percent >= 100) },
      { id: 'high_roller', title: 'High Roller', description: 'Close a trade that returned 5x or more (400%+ profit) on your entry.', icon: '💎', check: (ctx) => ctx.closed.some((t) => t.pnl_percent != null && t.pnl_percent >= 400) },
      { id: 'moonshot', title: 'Moonshot', description: 'Close a trade that returned 10x or more (900%+ profit) on your entry.', icon: '🌕', check: (ctx) => ctx.closed.some((t) => t.pnl_percent != null && t.pnl_percent >= 900) },
      { id: 'profit_5', title: '+5 SOL Total Profit', description: 'Reach +5 SOL in profit, added up across every closed trade.', icon: '💰', check: (ctx) => totalProfit(ctx.closed) >= 5 },
      { id: 'profit_20', title: '+20 SOL Total Profit', description: 'Reach +20 SOL in profit, added up across every closed trade.', icon: '🏆', check: (ctx) => totalProfit(ctx.closed) >= 20 },
      { id: 'profit_50', title: '+50 SOL Total Profit', description: 'Reach +50 SOL in profit, added up across every closed trade.', icon: '👑', check: (ctx) => totalProfit(ctx.closed) >= 50 },
      { id: 'profit_100', title: '+100 SOL Total Profit', description: 'Reach +100 SOL in profit, added up across every closed trade.', icon: '💵', check: (ctx) => totalProfit(ctx.closed) >= 100 },
      { id: 'profit_250', title: '+250 SOL Total Profit', description: 'Reach +250 SOL in profit, added up across every closed trade.', icon: '🏦', check: (ctx) => totalProfit(ctx.closed) >= 250 },
      { id: 'profit_500', title: '+500 SOL Total Profit', description: 'Reach +500 SOL in profit, added up across every closed trade.', icon: '🐋', check: (ctx) => totalProfit(ctx.closed) >= 500 },
      { id: 'profit_1000', title: '+1,000 SOL Total Profit', description: 'Reach +1,000 SOL in profit, added up across every closed trade.', icon: '🌌', check: (ctx) => totalProfit(ctx.closed) >= 1000 },
    ],
  },
  {
    name: 'Followed Plan',
    badges: [
      { id: 'plan_5', title: '5 Trades On-Plan', description: 'Mark "Did you follow your plan?" as Yes on 5 closed trades.', icon: '🧭', check: (ctx) => ctx.closed.filter((t) => t.followed_plan === 'yes').length >= 5 },
      { id: 'plan_10', title: '10 Trades On-Plan', description: 'Mark "Did you follow your plan?" as Yes on 10 closed trades.', icon: '🧭', check: (ctx) => ctx.closed.filter((t) => t.followed_plan === 'yes').length >= 10 },
      { id: 'plan_25', title: '25 Trades On-Plan', description: 'Mark "Did you follow your plan?" as Yes on 25 closed trades.', icon: '🧭', check: (ctx) => ctx.closed.filter((t) => t.followed_plan === 'yes').length >= 25 },
    ],
  },
  {
    name: 'Grade',
    badges: [
      { id: 'grade_a_5', title: '5 Grade-A Trades', description: 'Give 5 closed trades a grade of A (followed your thesis and plan, regardless of outcome).', icon: '🧘', check: (ctx) => ctx.closed.filter((t) => t.grade === 'A').length >= 5 },
      { id: 'grade_a_10', title: '10 Grade-A Trades', description: 'Give 10 closed trades a grade of A.', icon: '🧘', check: (ctx) => ctx.closed.filter((t) => t.grade === 'A').length >= 10 },
      { id: 'grade_a_25', title: '25 Grade-A Trades', description: 'Give 25 closed trades a grade of A.', icon: '🧘', check: (ctx) => ctx.closed.filter((t) => t.grade === 'A').length >= 25 },
    ],
  },
  {
    name: 'Journal',
    badges: [
      { id: 'journal_5', title: '5 Journal Entries', description: "Write 5 journal entries -- any 5 days, they don't need to be consecutive.", icon: '📖', check: (ctx) => ctx.journalEntries.length >= 5 },
      { id: 'journal_10', title: '10 Journal Entries', description: "Write 10 journal entries -- any 10 days, they don't need to be consecutive.", icon: '📚', check: (ctx) => ctx.journalEntries.length >= 10 },
      { id: 'journal_25', title: '25 Journal Entries', description: "Write 25 journal entries -- any 25 days, they don't need to be consecutive.", icon: '🗂️', check: (ctx) => ctx.journalEntries.length >= 25 },
    ],
  },
];

// Streaks aren't lock/unlock badges -- they're an always-visible running
// count (your longest-ever run), shown separately from the badge lists.
const STREAKS = [
  { id: 'journal_streak', label: 'Journal', description: 'Longest run of consecutive days with a journal entry.', value: (ctx) => longestDateStreak(ctx.journalDates) },
  { id: 'win_streak', label: 'Win', description: 'Longest run of consecutive winning trades.', value: (ctx) => longestStreak(ctx.closedChrono, (t) => t.pnl_amount > 0) },
  { id: 'plan_streak', label: 'Plan', description: 'Longest run of consecutive trades where you followed your plan.', value: (ctx) => longestStreak(ctx.closedChrono, (t) => t.followed_plan === 'yes') },
  { id: 'grade_a_streak', label: 'Grade-A', description: 'Longest run of consecutive grade-A trades.', value: (ctx) => longestStreak(ctx.closedChrono, (t) => t.grade === 'A') },
];

function computeAchievements(trades, journalEntries) {
  const closed = trades.filter((t) => t.status === 'closed');
  const closedChrono = [...closed].sort((a, b) => new Date(a.closed_at) - new Date(b.closed_at));
  const journalDates = journalEntries.map((e) => e.entry_date);
  const ctx = { trades, closed, closedChrono, journalEntries, journalDates };

  const categories = CATEGORIES.map((cat) => ({
    name: cat.name,
    badges: cat.badges.map((b) => ({
      id: b.id,
      title: b.title,
      description: b.description,
      icon: b.icon,
      earned: b.check(ctx),
    })),
  }));

  const streaks = STREAKS.map((s) => ({
    id: s.id,
    label: s.label,
    description: s.description,
    value: s.value(ctx),
  }));

  const totalBadges = categories.reduce((total, c) => total + c.badges.length, 0);
  const totalEarned = categories.reduce((total, c) => total + c.badges.filter((b) => b.earned).length, 0);

  return { categories, streaks, totalEarned, totalBadges };
}

module.exports = { computeAchievements };
