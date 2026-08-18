const { computeRecurringPatterns } = require('./patterns');

function avg(nums) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

function round1(n) {
  return n == null ? null : Math.round(n * 10) / 10;
}

function riskBucket(pct) {
  if (pct < 2) return '< 2%';
  if (pct < 5) return '2–5%';
  if (pct < 10) return '5–10%';
  return '10%+';
}

const RISK_BUCKET_ORDER = ['< 2%', '2–5%', '5–10%', '10%+'];

// Groups closed trades by a key function and computes avg P&L / win rate per
// group -- shared by the emotion, risk, and grade breakdowns below.
function groupStats(closed, keyFn, order) {
  const groups = new Map();
  closed.forEach((t) => {
    const key = keyFn(t);
    if (key == null) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  });

  const rows = [...groups.entries()].map(([key, trades]) => {
    const pnlPercents = trades.map((t) => t.pnl_percent).filter((v) => v != null);
    const pnlAmounts = trades.map((t) => t.pnl_amount).filter((v) => v != null);
    const wins = trades.filter((t) => t.pnl_amount > 0).length;
    return {
      key,
      count: trades.length,
      avgPnlPercent: round1(avg(pnlPercents)),
      avgPnlAmount: avg(pnlAmounts),
      winRate: round1((wins / trades.length) * 100),
    };
  });

  if (order) {
    rows.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  } else {
    rows.sort((a, b) => b.count - a.count);
  }
  return rows;
}

// Simple, explainable heuristics -- not a model. Each bullet only fires when
// there's a real enough sample to say something meaningful, so the dashboard
// doesn't make confident-sounding claims off two data points.
function buildBullets({ closed, patterns, byEmotion, byRisk, byGrade }) {
  const bullets = [];

  if (closed.length < 3) {
    return ['Log a few more closed trades to unlock recurring-pattern and correlation insights.'];
  }

  const wins = closed.filter((t) => t.pnl_amount > 0).length;
  const winRate = round1((wins / closed.length) * 100);
  const totalPnl = closed.reduce((sum, t) => sum + (t.pnl_amount || 0), 0);
  bullets.push(
    `${closed.length} closed trades, ${winRate}% win rate, ${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(3)} SOL total.`
  );

  if (patterns.length > 0) {
    const top = patterns[0];
    bullets.push(`Most recurring note: "${top.phrase}" — shows up in ${top.count} of ${closed.length} closed trades.`);
  }

  const emotionsWithData = byEmotion.filter((e) => e.count >= 2 && e.avgPnlPercent != null);
  if (emotionsWithData.length >= 2) {
    const best = emotionsWithData.reduce((a, b) => (b.avgPnlPercent > a.avgPnlPercent ? b : a));
    const worst = emotionsWithData.reduce((a, b) => (b.avgPnlPercent < a.avgPnlPercent ? b : a));
    if (best.key !== worst.key) {
      bullets.push(
        `You do best entering trades feeling "${best.key}" (avg ${best.avgPnlPercent >= 0 ? '+' : ''}${best.avgPnlPercent}%), worst feeling "${worst.key}" (avg ${worst.avgPnlPercent >= 0 ? '+' : ''}${worst.avgPnlPercent}%).`
      );
    }
  }

  const riskWithData = byRisk.filter((r) => r.count >= 2 && r.avgPnlPercent != null);
  if (riskWithData.length >= 2) {
    const smallest = riskWithData[0];
    const largest = riskWithData[riskWithData.length - 1];
    if (smallest.key !== largest.key) {
      const direction = largest.avgPnlPercent < smallest.avgPnlPercent ? 'underperform' : 'outperform';
      bullets.push(
        `Trades sized at ${largest.key} of your portfolio ${direction} your ${smallest.key} trades on average (${largest.avgPnlPercent >= 0 ? '+' : ''}${largest.avgPnlPercent}% vs ${smallest.avgPnlPercent >= 0 ? '+' : ''}${smallest.avgPnlPercent}%).`
      );
    }
  }

  const gradesWithData = byGrade.filter((g) => g.count >= 2 && g.avgPnlPercent != null);
  const gradeA = gradesWithData.find((g) => g.key === 'A');
  const gradeD = gradesWithData.find((g) => g.key === 'D');
  if (gradeA && gradeD) {
    bullets.push(
      `Grade A trades average ${gradeA.avgPnlPercent >= 0 ? '+' : ''}${gradeA.avgPnlPercent}% vs ${gradeD.avgPnlPercent >= 0 ? '+' : ''}${gradeD.avgPnlPercent}% for grade D -- your process grading tracks real outcomes.`
    );
  }

  return bullets;
}

function computeDashboard(trades) {
  const closed = trades.filter((t) => t.status === 'closed');

  const patterns = computeRecurringPatterns(
    closed.map((t) => [t.lesson_learned, t.thoughts_during].filter(Boolean).join('. '))
  );

  const byEmotion = groupStats(closed, (t) => t.emotional_state);
  const byRisk = groupStats(closed, (t) => riskBucket(t.percent_risked), RISK_BUCKET_ORDER);
  const byGrade = groupStats(closed, (t) => t.grade, ['A', 'B', 'C', 'D']);

  const bullets = buildBullets({ closed, patterns, byEmotion, byRisk, byGrade });

  return { bullets, patterns, byEmotion, byRisk, byGrade };
}

module.exports = { computeDashboard };
