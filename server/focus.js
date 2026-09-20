const { dayOf, shiftDay } = require('../shared/dates');

// How many recent days of activity the guidance looks at. Days, not calendar
// days: a weekend off shouldn't leave Monday with nothing to say.
const WINDOW_DAYS = 5;
const CARRY_OVER_ENTRIES = 3;
const MAX_CARRY_OVER_ITEMS = 5;
const MAX_CALLOUTS = 4;
const RISKY_MOODS = ['fomo', 'anxious'];
const JOURNAL_LOOKBACK_DAYS = 7;

const round1 = (n) => Math.round(n * 10) / 10;
const avg = (nums) => nums.reduce((a, b) => a + b, 0) / nums.length;
const signedPct = (n) => `${n >= 0 ? '+' : ''}${round1(n)}%`;
const TONE_ORDER = { warn: 0, info: 1, good: 2 };

function tradeDays(t, timeZone) {
  const days = [dayOf(t.created_at, timeZone)];
  if (t.status === 'closed') days.push(dayOf(t.closed_at || t.created_at, timeZone));
  return days;
}

function recentActiveDays(trades, entries, today, timeZone) {
  const days = new Set();
  trades.forEach((t) => tradeDays(t, timeZone).forEach((d) => days.add(d)));
  entries.forEach((e) => days.add(e.entry_date));
  return [...days].filter((d) => d < today).sort().reverse().slice(0, WINDOW_DAYS);
}

// Items from your last few "work on tomorrow" notes, newest first, with the
// same item written on several days shown once (under its latest date).
function carryOver(entries, today) {
  const seen = new Set();
  const items = [];
  entries
    .filter((e) => e.entry_date < today && e.work_on)
    .sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1))
    .slice(0, CARRY_OVER_ENTRIES)
    .forEach((e) => {
      e.work_on.split('\n').forEach((text) => {
        const key = text.trim().toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);
        items.push({ text: text.trim(), date: e.entry_date });
      });
    });
  return items.slice(0, MAX_CARRY_OVER_ITEMS);
}

function planCallout(closed) {
  if (closed.length < 3) return null;
  const notFully = closed.filter((t) => t.followed_plan === 'no' || t.followed_plan === 'partially').length;
  if (notFully === 0) {
    return {
      kind: 'plan', tone: 'good',
      text: `You followed your plan on all ${closed.length} of your last ${closed.length} closed trades. Keep doing exactly that.`,
    };
  }
  if (notFully / closed.length >= 0.4) {
    return {
      kind: 'plan', tone: 'warn',
      text: `You didn't fully follow your plan on ${notFully} of your last ${closed.length} closed trades.`,
    };
  }
  return null;
}

function moodCallout(opened, closed) {
  if (opened.length < 3) return null;
  const risky = opened.filter((t) => RISKY_MOODS.includes(t.emotional_state)).length;
  if (risky < 2 || risky / opened.length < 0.4) return null;

  let text = `${risky} of your last ${opened.length} entries were taken feeling FOMO or anxious.`;
  const scored = closed.filter((t) => t.pnl_percent != null);
  const riskyPnl = scored.filter((t) => RISKY_MOODS.includes(t.emotional_state)).map((t) => t.pnl_percent);
  const otherPnl = scored.filter((t) => !RISKY_MOODS.includes(t.emotional_state)).map((t) => t.pnl_percent);
  if (riskyPnl.length >= 2 && otherPnl.length >= 2) {
    text += ` Those trades averaged ${signedPct(avg(riskyPnl))} vs ${signedPct(avg(otherPnl))} for the rest.`;
  }
  return { kind: 'mood', tone: 'warn', text };
}

function sleepCallout(entries) {
  const ratings = entries.map((e) => e.sleep_rating).filter((n) => n != null);
  if (ratings.length < 3) return null;
  const mean = avg(ratings);
  if (mean > 2.5) return null;
  return {
    kind: 'sleep', tone: 'warn',
    text: `Your sleep averaged ${mean.toFixed(1)}/5 over your last ${ratings.length} check-ins. Tired trading is expensive trading.`,
  };
}

function rulesCallout(entries) {
  const answers = entries.map((e) => e.rules_followed).filter(Boolean);
  if (answers.length < 3) return null;
  const notFully = answers.filter((a) => a !== 'yes').length;
  if (notFully === 0) {
    return { kind: 'rules', tone: 'good', text: `You kept your rules on all ${answers.length} of your last ${answers.length} check-ins.` };
  }
  if (notFully / answers.length >= 0.4) {
    return {
      kind: 'rules', tone: 'warn',
      text: `You marked your rules as only partly followed or broken on ${notFully} of your last ${answers.length} check-ins.`,
    };
  }
  return null;
}

// The most recent day (within a week) you traded but never journaled.
function journalGapCallout(trades, entries, today, timeZone) {
  const traded = new Set();
  trades.forEach((t) => tradeDays(t, timeZone).forEach((d) => traded.add(d)));
  const journaled = new Set(entries.map((e) => e.entry_date));

  for (let back = 1; back <= JOURNAL_LOOKBACK_DAYS; back += 1) {
    const day = shiftDay(today, -back);
    if (traded.has(day) && !journaled.has(day)) {
      const when = back === 1 ? 'yesterday' : `on ${day}`;
      return {
        kind: 'journal', tone: 'info', date: day,
        text: `You traded ${when} but didn't journal it. Two minutes now keeps your patterns honest.`,
      };
    }
  }
  return null;
}

// Rule-based (no model, nothing leaves your machine): every callout only
// fires with enough data behind it, so it never sounds sure off two trades.
// `trades` need pnl_percent; `entries` are journal_entries rows.
function computeFocus({ trades, entries, today, timeZone }) {
  const days = recentActiveDays(trades, entries, today, timeZone);
  const inWindow = new Set(days);

  const opened = trades.filter((t) => inWindow.has(dayOf(t.created_at, timeZone)));
  const closed = trades.filter(
    (t) => t.status === 'closed' && inWindow.has(dayOf(t.closed_at || t.created_at, timeZone))
  );
  const recentEntries = entries.filter((e) => inWindow.has(e.entry_date));

  const callouts = [
    planCallout(closed),
    moodCallout(opened, closed),
    sleepCallout(recentEntries),
    rulesCallout(recentEntries),
    journalGapCallout(trades, entries, today, timeZone),
  ]
    .filter(Boolean)
    .sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone])
    .slice(0, MAX_CALLOUTS);

  return { today, windowDays: days.length, days, carryOver: carryOver(entries, today), callouts };
}

module.exports = { computeFocus };
