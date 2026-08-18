const GRADE_GUIDE = [
  ['A', 'Followed your thesis and plan, regardless of outcome.'],
  ['B', 'Mostly followed your plan, with a minor deviation (e.g. sized slightly off, exited a bit early/late).'],
  ['C', 'Real plan violations — ignored a rule, chased price, or exited on emotion.'],
  ['D', 'Fully random or FOMO entry, no real thesis, no plan followed.'],
];

const EMOTIONAL_LABELS = { calm: 'Calm', excited: 'Excited', anxious: 'Anxious', bored: 'Bored', fomo: 'FOMO' };

document.querySelectorAll('.grade-guide').forEach((el) => {
  el.innerHTML = GRADE_GUIDE.map(([g, desc]) => `<div><b>${g}</b> — ${desc}</div>`).join('');
});

// ---------- Flexible number parsing ----------
// Accepts 500000, 500,000, 500k, 500K, 1.2m, 1,000,000, etc.
function parseFlexibleNumber(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().replace(/,/g, '');
  if (s === '') return null;

  const match = s.match(/^(-?\d*\.?\d+)\s*([kKmMbB])?$/);
  if (!match) {
    const n = Number(s);
    return Number.isNaN(n) ? null : n;
  }

  const num = parseFloat(match[1]);
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[match[2]?.toLowerCase()] || 1;
  return num * mult;
}

// ---------- Value toggle (Market Cap / Price switch) ----------
function initValueToggles(root) {
  root.querySelectorAll('.value-toggle').forEach((group) => {
    group.querySelectorAll('.toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.toggle-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  });
}

function getToggleType(root, groupName) {
  const group = root.querySelector(`.value-toggle[data-toggle-group="${groupName}"]`);
  return group.querySelector('.toggle-btn.active').dataset.type;
}

// { price, mcap } — parsed value goes in the slot matching the active toggle, other is null
function readToggledValue(root, groupName, inputId) {
  const type = getToggleType(root, groupName);
  const parsed = parseFlexibleNumber(document.getElementById(inputId).value);
  return {
    price: type === 'price' ? parsed : null,
    mcap: type === 'mcap' ? parsed : null,
  };
}

initValueToggles(document);

// ---------- Tab navigation ----------
const tabButtons = document.querySelectorAll('.tab-btn');
const views = document.querySelectorAll('.view');

function switchToView(viewName) {
  tabButtons.forEach((b) => b.classList.toggle('active', b.dataset.view === viewName));
  views.forEach((v) => v.classList.toggle('active', v.id === `view-${viewName}`));
  document.getElementById('back-btn').classList.toggle('hidden', viewName === 'dashboard');

  if (viewName === 'list') loadTradeList();
  if (viewName === 'totals') loadTotals();
  if (viewName === 'journal') loadJournalList();
  if (viewName === 'dashboard') loadDashboard();
}

document.getElementById('back-btn').addEventListener('click', () => switchToView('dashboard'));

// ---------- Hamburger nav drawer ----------
const hamburgerBtn = document.getElementById('hamburger-btn');
const navDrawer = document.getElementById('nav-drawer');
const navBackdrop = document.getElementById('nav-backdrop');

function closeDrawer() {
  hamburgerBtn.classList.remove('open');
  navDrawer.classList.add('hidden');
  navBackdrop.classList.add('hidden');
}

hamburgerBtn.addEventListener('click', () => {
  const willOpen = navDrawer.classList.contains('hidden');
  hamburgerBtn.classList.toggle('open', willOpen);
  navDrawer.classList.toggle('hidden', !willOpen);
  navBackdrop.classList.toggle('hidden', !willOpen);
});

navBackdrop.addEventListener('click', closeDrawer);

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    switchToView(btn.dataset.view);
    closeDrawer();
  });
});

document.querySelectorAll('.quick-link-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchToView(btn.dataset.view));
});

// ---------- API helpers ----------
async function api(path, options) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(data?.error || 'Request failed');
  return data;
}

function fmtSol(n, decimals = 3) {
  if (n == null) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(decimals)} SOL`;
}

// ---------- Global currency setting (Settings tab) ----------
// A single app-wide display currency, not per-view -- the underlying data
// is always stored/computed in SOL. Persisted so it survives a reload.
// SOL itself needs no conversion; each fiat option remembers its own rate
// (SOL/USD and SOL/EUR are different numbers) so switching back and forth
// doesn't lose what you typed.
const CURRENCY_SYMBOLS = { usd: '$', gbp: '£', eur: '€', jpy: '¥' };
let appCurrency = localStorage.getItem('appCurrency') || 'usd';
let solPrices = {};
try {
  solPrices = JSON.parse(localStorage.getItem('solPrices') || '{}');
} catch {
  solPrices = {};
}

// Displays a SOL amount in whichever currency is set in Settings. Standard
// 2dp currency formatting (0dp above $1000, and JPY is always 0dp since it
// has no minor subunit in everyday use).
function fmtMoney(sol, decimals) {
  if (sol == null) return '—';
  const price = solPrices[appCurrency];
  if (appCurrency !== 'sol' && price) {
    const amount = sol * price;
    const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
    const abs = Math.abs(amount);
    const dp = appCurrency === 'jpy' ? 0 : abs >= 1000 ? 0 : 2;
    return `${sign}${CURRENCY_SYMBOLS[appCurrency]}${abs.toFixed(dp)}`;
  }
  return fmtSol(sol, decimals);
}

function fmtPct(n) {
  if (n == null) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

function pnlClass(n) {
  if (n == null) return 'pnl-neutral';
  return n > 0 ? 'pnl-pos' : n < 0 ? 'pnl-neg' : 'pnl-neutral';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Add / Log Trade form ----------
const addForm = document.getElementById('add-trade-form');
const addStatus = document.getElementById('add-trade-status');

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  addStatus.textContent = '';
  addStatus.className = 'status-msg';

  const status = e.submitter?.dataset.status || 'open';
  const entryVal = readToggledValue(addForm, 'entry', 'entry_value');
  const exitVal = readToggledValue(addForm, 'exit', 'exit_value');

  const body = {
    coin_name: document.getElementById('coin_name').value,
    contract_address: document.getElementById('contract_address').value,
    entry_price: entryVal.price,
    entry_mcap: entryVal.mcap,
    exit_price: exitVal.price,
    exit_mcap: exitVal.mcap,
    amount_invested: Number(document.getElementById('amount_invested').value),
    percent_risked: Number(document.getElementById('percent_risked').value),
    fees: document.getElementById('fees').value ? Number(document.getElementById('fees').value) : 0,
    emotional_state: document.getElementById('emotional_state').value,
    thesis: document.getElementById('thesis').value || null,
    followed_plan: document.getElementById('followed_plan').value || null,
    thoughts_during: document.getElementById('thoughts_during').value || null,
    lesson_learned: document.getElementById('lesson_learned').value || null,
    grade: document.getElementById('grade').value || null,
    status,
  };

  try {
    await api('/api/trades', { method: 'POST', body: JSON.stringify(body) });
    addStatus.textContent = status === 'closed' ? 'Trade logged and closed.' : 'Trade logged as open.';
    addStatus.classList.add('success');
    addForm.reset();
    addForm.querySelectorAll('.value-toggle').forEach((group) => {
      group.querySelectorAll('.toggle-btn').forEach((b) => b.classList.remove('active'));
      group.querySelector('.toggle-btn').classList.add('active');
    });
  } catch (err) {
    addStatus.textContent = err.message === 'Failed to fetch'
      ? "Couldn't reach the server. Is it running?"
      : err.message;
    addStatus.classList.add('error');
  }
});

// ---------- Trade List ----------
const openTradeListEl = document.getElementById('open-trade-list');
const closedTradeListEl = document.getElementById('closed-trade-list');

function renderTradeCard(t) {
  const card = document.createElement('div');
  card.className = 'trade-card';
  const date = (t.closed_at || t.created_at).slice(0, 10);
  card.innerHTML = `
    <div class="trade-card-top">
      <span class="coin">${escapeHtml(t.coin_name)}
        <span class="badge status-${t.status}">${t.status}</span>
        ${t.grade ? `<span class="badge grade-${t.grade}">${t.grade}</span>` : ''}
      </span>
      <span class="${pnlClass(t.pnl_amount)}">${fmtMoney(t.pnl_amount)} (${fmtPct(t.pnl_percent)})</span>
    </div>
    <div class="trade-card-meta">${escapeHtml(t.contract_address)}</div>
    <div class="trade-card-meta">${date} · ${t.percent_risked}% risked · ${EMOTIONAL_LABELS[t.emotional_state] || t.emotional_state}</div>
  `;
  card.addEventListener('click', () => openTradeModal(t.id));
  return card;
}

const tradeListErrorEl = document.getElementById('trade-list-error');

async function loadTradeList() {
  const q = document.getElementById('filter-search').value.trim();
  const from = document.getElementById('filter-from').value;
  const to = document.getElementById('filter-to').value;
  const grade = document.getElementById('filter-grade').value;
  const sort = document.getElementById('filter-sort').value;

  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (grade) params.set('grade', grade);

  let trades;
  try {
    trades = await api(`/api/trades?${params.toString()}`);
    tradeListErrorEl.classList.add('hidden');
  } catch (err) {
    tradeListErrorEl.textContent = `Couldn't load trades: ${err.message}. Is the server running?`;
    tradeListErrorEl.classList.remove('hidden');
    return;
  }

  const open = trades.filter((t) => t.status === 'open');
  const closed = trades.filter((t) => t.status === 'closed');

  if (sort === 'profit') closed.sort((a, b) => (b.pnl_amount ?? -Infinity) - (a.pnl_amount ?? -Infinity));
  else if (sort === 'loss') closed.sort((a, b) => (a.pnl_amount ?? Infinity) - (b.pnl_amount ?? Infinity));

  openTradeListEl.innerHTML = '';
  if (open.length === 0) {
    openTradeListEl.innerHTML = '<p class="hint">No open positions.</p>';
  } else {
    open.forEach((t) => openTradeListEl.appendChild(renderTradeCard(t)));
  }

  closedTradeListEl.innerHTML = '';
  if (closed.length === 0) {
    closedTradeListEl.innerHTML = '<p class="hint">No closed trades match these filters.</p>';
  } else {
    closed.forEach((t) => closedTradeListEl.appendChild(renderTradeCard(t)));
  }
}

['filter-from', 'filter-to', 'filter-grade', 'filter-sort'].forEach((id) => {
  document.getElementById(id).addEventListener('change', loadTradeList);
});

document.getElementById('clear-filters').addEventListener('click', () => {
  document.getElementById('filter-search').value = '';
  document.getElementById('filter-from').value = '';
  document.getElementById('filter-to').value = '';
  document.getElementById('filter-grade').value = '';
  document.getElementById('filter-sort').value = 'date';
  loadTradeList();
});

let searchDebounce;
document.getElementById('filter-search').addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(loadTradeList, 300);
});

// ---------- Trade detail / close modal ----------
const modal = document.getElementById('trade-modal');
const modalBody = document.getElementById('modal-body');

document.getElementById('modal-close').addEventListener('click', () => modal.classList.add('hidden'));
modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

async function openTradeModal(id) {
  const t = await api(`/api/trades/${id}`);
  const exitType = t.exit_price != null ? 'price' : 'mcap';
  const exitValue = t.exit_price ?? t.exit_mcap ?? '';

  modalBody.innerHTML = `
    <h2>${escapeHtml(t.coin_name)}</h2>
    <p class="hint">${escapeHtml(t.contract_address)}</p>
    <p class="hint">Logged ${t.created_at.slice(0, 16).replace('T', ' ')} · Status: ${t.status}</p>

    <div class="field-row">
      <div class="field"><label>Coin name</label><input type="text" id="m-coin_name" value="${escapeHtml(t.coin_name)}"></div>
      <div class="field"><label>Contract address</label><input type="text" id="m-contract_address" value="${escapeHtml(t.contract_address)}"></div>
    </div>

    <div class="field">
      <label>Exit value</label>
      <div class="value-toggle" data-toggle-group="m-exit">
        <button type="button" class="toggle-btn ${exitType === 'mcap' ? 'active' : ''}" data-type="mcap">Market Cap</button>
        <button type="button" class="toggle-btn ${exitType === 'price' ? 'active' : ''}" data-type="price">Price</button>
      </div>
      <input type="text" inputmode="decimal" id="m-exit_value" value="${exitValue}" placeholder="e.g. 500k, 1.2m, 0.000045">
    </div>

    <div class="field">
      <label>Fees / gas / tip (SOL)</label>
      <input type="number" step="any" id="m-fees" value="${t.fees ?? 0}">
    </div>

    <div class="field">
      <label>Thesis — why did you buy? ${t.status === 'open' ? '(required to close)' : ''}</label>
      <textarea id="m-thesis" rows="2">${t.thesis ?? ''}</textarea>
    </div>

    <div class="field">
      <label>Did you follow your plan?</label>
      <select id="m-followed_plan">
        <option value="">—</option>
        <option value="yes" ${t.followed_plan === 'yes' ? 'selected' : ''}>Yes</option>
        <option value="partially" ${t.followed_plan === 'partially' ? 'selected' : ''}>Partially</option>
        <option value="no" ${t.followed_plan === 'no' ? 'selected' : ''}>No</option>
      </select>
    </div>

    <div class="field">
      <label>Thoughts / emotions during the trade</label>
      <textarea id="m-thoughts_during" rows="2">${t.thoughts_during ?? ''}</textarea>
    </div>

    <div class="field">
      <label>Lesson learned</label>
      <textarea id="m-lesson_learned" rows="2">${t.lesson_learned ?? ''}</textarea>
    </div>

    <div class="grade-guide">${GRADE_GUIDE.map(([g, desc]) => `<div><b>${g}</b> — ${desc}</div>`).join('')}</div>

    <div class="field">
      <label>Grade (process quality, not P&amp;L)</label>
      <select id="m-grade">
        <option value="">—</option>
        <option value="A" ${t.grade === 'A' ? 'selected' : ''}>A</option>
        <option value="B" ${t.grade === 'B' ? 'selected' : ''}>B</option>
        <option value="C" ${t.grade === 'C' ? 'selected' : ''}>C</option>
        <option value="D" ${t.grade === 'D' ? 'selected' : ''}>D</option>
      </select>
    </div>

    <p>P&amp;L: <span class="${pnlClass(t.pnl_amount)}">${fmtMoney(t.pnl_amount)} (${fmtPct(t.pnl_percent)})</span></p>

    <div style="display:flex; gap:0.6rem; margin-top:1rem;">
      <button id="m-save" class="btn-secondary">Save</button>
      ${t.status === 'open' ? '<button id="m-close-trade" class="btn-primary">Close Trade</button>' : ''}
      <button id="m-delete" class="btn-danger">Delete</button>
    </div>
    <p id="m-status" class="status-msg"></p>
  `;

  modal.classList.remove('hidden');
  initValueToggles(modalBody);

  function gatherFields() {
    const exit = readToggledValue(modalBody, 'm-exit', 'm-exit_value');
    return {
      coin_name: document.getElementById('m-coin_name').value,
      contract_address: document.getElementById('m-contract_address').value,
      exit_price: exit.price,
      exit_mcap: exit.mcap,
      fees: document.getElementById('m-fees').value ? Number(document.getElementById('m-fees').value) : 0,
      thesis: document.getElementById('m-thesis').value || null,
      followed_plan: document.getElementById('m-followed_plan').value || null,
      thoughts_during: document.getElementById('m-thoughts_during').value || null,
      lesson_learned: document.getElementById('m-lesson_learned').value || null,
      grade: document.getElementById('m-grade').value || null,
    };
  }

  const statusEl = document.getElementById('m-status');

  document.getElementById('m-save').addEventListener('click', async () => {
    try {
      await api(`/api/trades/${id}`, { method: 'PUT', body: JSON.stringify(gatherFields()) });
      statusEl.textContent = 'Saved.';
      statusEl.className = 'status-msg success';
      loadTradeList();
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.className = 'status-msg error';
    }
  });

  const closeBtn = document.getElementById('m-close-trade');
  if (closeBtn) {
    closeBtn.addEventListener('click', async () => {
      try {
        await api(`/api/trades/${id}`, { method: 'PUT', body: JSON.stringify({ ...gatherFields(), status: 'closed' }) });
        modal.classList.add('hidden');
        loadTradeList();
      } catch (err) {
        statusEl.textContent = err.message;
        statusEl.className = 'status-msg error';
      }
    });
  }

  document.getElementById('m-delete').addEventListener('click', async () => {
    if (!confirm('Delete this trade? This cannot be undone.')) return;
    await api(`/api/trades/${id}`, { method: 'DELETE' });
    modal.classList.add('hidden');
    loadTradeList();
  });
}

// ---------- Totals ----------
let totalsPeriod = 'all';

// Calendar-based periods (not rolling windows), consistent with how the
// Calendar view already buckets days -- "this week" runs Sun-Sat like the
// calendar grid, "this month"/"this year" match the calendar's own units.
function isInPeriod(dateStr, period) {
  if (period === 'all') return true;
  const d = new Date(`${dateStr}T00:00:00`);
  const now = new Date();
  if (period === 'D') return dateStr === todayStr();
  if (period === 'W') {
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    return d >= startOfWeek;
  }
  if (period === 'M') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (period === 'Y') return d.getFullYear() === now.getFullYear();
  return true;
}

document.querySelectorAll('.value-toggle[data-toggle-group="totals-period"] .toggle-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    totalsPeriod = btn.dataset.type;
    loadTotals();
  });
});

async function loadTotals() {
  const totalsErrorEl = document.getElementById('totals-error');
  let trades;
  try {
    trades = await api('/api/trades');
    totalsErrorEl.classList.add('hidden');
  } catch (err) {
    totalsErrorEl.textContent = `Couldn't load trades: ${err.message}. Is the server running?`;
    totalsErrorEl.classList.remove('hidden');
    document.getElementById('totals-summary').innerHTML = '';
    return;
  }
  const openCount = trades.filter((t) => t.status === 'open').length;
  const closed = trades
    .filter((t) => t.status === 'closed')
    .filter((t) => isInPeriod((t.closed_at || t.created_at).slice(0, 10), totalsPeriod));

  const totalPnl = closed.reduce((sum, t) => sum + (t.pnl_amount || 0), 0);
  const wins = closed.filter((t) => t.pnl_amount > 0).length;
  const losses = closed.filter((t) => t.pnl_amount < 0).length;
  const winRate = closed.length ? ((wins / closed.length) * 100).toFixed(1) : '0.0';
  const periodLabel = { all: 'all time', D: 'today', W: 'this week', M: 'this month', Y: 'this year' }[totalsPeriod];

  document.getElementById('totals-summary').innerHTML = `
    <div class="big-number ${pnlClass(totalPnl)}">${fmtMoney(totalPnl)}</div>
    <p class="hint">P&amp;L across ${closed.length} closed trade${closed.length === 1 ? '' : 's'} &mdash; ${periodLabel}</p>
    <div class="stat-row"><span>Open trades</span><span>${openCount}</span></div>
    <div class="stat-row"><span>Wins / Losses</span><span>${wins} / ${losses}</span></div>
    <div class="stat-row"><span>Win rate</span><span>${winRate}%</span></div>
  `;
}

// ---------- Calendar (opens as a modal from the Total P&L view) ----------
let calCursor = new Date();
calCursor.setDate(1);

const calendarModal = document.getElementById('calendar-modal');

document.getElementById('open-calendar-btn').addEventListener('click', () => {
  calendarModal.classList.remove('hidden');
  loadCalendar();
});
document.getElementById('calendar-modal-close').addEventListener('click', () => calendarModal.classList.add('hidden'));
calendarModal.addEventListener('click', (e) => { if (e.target === calendarModal) calendarModal.classList.add('hidden'); });

document.getElementById('cal-prev').addEventListener('click', () => {
  calCursor.setMonth(calCursor.getMonth() - 1);
  loadCalendar();
});
document.getElementById('cal-next').addEventListener('click', () => {
  calCursor.setMonth(calCursor.getMonth() + 1);
  loadCalendar();
});

// "Gold day" = an outlier-good profit day. Using the median of only the
// profitable days (not all days) as the baseline keeps bad days from
// skewing it down — 10 bad days followed by 2 good ones shouldn't make an
// ordinary good day look like a huge multiple. Requires at least 3
// profitable days on record before calling anything an outlier, so one or
// two early wins don't trivially count as "5x everything before them."
function computeGoldThreshold(allDayTotals) {
  const profitDays = allDayTotals.filter((v) => v > 0);
  if (profitDays.length < 3) return null;
  const sorted = [...profitDays].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return median * 5;
}

async function loadCalendar() {
  const year = calCursor.getFullYear();
  const month = calCursor.getMonth(); // 0-indexed

  document.getElementById('cal-month-label').textContent = calCursor.toLocaleString('default', { month: 'long', year: 'numeric' });

  const calendarErrorEl = document.getElementById('calendar-error');
  let trades;
  try {
    // Fetch full history (not just this month) so the gold-day baseline
    // reflects your overall track record, not just whatever's visible.
    trades = await api('/api/trades');
    calendarErrorEl.classList.add('hidden');
  } catch (err) {
    calendarErrorEl.textContent = `Couldn't load trades: ${err.message}. Is the server running?`;
    calendarErrorEl.classList.remove('hidden');
    document.getElementById('calendar-grid').innerHTML = '';
    document.getElementById('cal-month-total').textContent = '';
    return;
  }
  const closed = trades.filter((t) => t.status === 'closed');

  const byDay = {};
  closed.forEach((t) => {
    const day = (t.closed_at || t.created_at).slice(0, 10);
    byDay[day] = (byDay[day] || 0) + (t.pnl_amount || 0);
  });

  const goldThreshold = computeGoldThreshold(Object.values(byDay));

  const lastDay = new Date(year, month + 1, 0).getDate();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
  const monthTotal = Object.entries(byDay)
    .filter(([day]) => day.startsWith(monthPrefix))
    .reduce((sum, [, v]) => sum + v, 0);

  const monthTotalEl = document.getElementById('cal-month-total');
  monthTotalEl.textContent = `Month total: ${fmtMoney(monthTotal, 3)}`;
  monthTotalEl.className = `cal-month-total ${pnlClass(monthTotal)}`;

  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((d) => {
    const label = document.createElement('div');
    label.className = 'cal-day-label';
    label.textContent = d;
    grid.appendChild(label);
  });

  const firstWeekday = new Date(year, month, 1).getDay();
  for (let i = 0; i < firstWeekday; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-cell empty';
    grid.appendChild(empty);
  }

  for (let day = 1; day <= lastDay; day++) {
    const dateStr = `${monthPrefix}${String(day).padStart(2, '0')}`;
    const pnl = byDay[dateStr];
    const isGold = pnl != null && goldThreshold != null && pnl > 0 && pnl >= goldThreshold;
    const cell = document.createElement('div');
    cell.className = `cal-cell ${pnl == null ? 'no-trades' : isGold ? 'pnl-gold' : pnlClass(pnl)}`;
    cell.title = pnl != null ? `${fmtSol(pnl)}${isGold ? ' — gold day' : ''}` : '';
    cell.innerHTML = `<span class="day-num">${day}</span>${pnl != null ? `<span class="day-pnl">${fmtMoney(pnl, 2)}</span>` : ''}`;
    grid.appendChild(cell);
  }
}

// ---------- Daily Journal ----------
const journalForm = document.getElementById('journal-form');
const journalDateInput = document.getElementById('journal-date');
const journalStatus = document.getElementById('journal-status');
const journalDeleteBtn = document.getElementById('journal-delete');
const journalListEl = document.getElementById('journal-list');
const journalListErrorEl = document.getElementById('journal-list-error');

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

journalDateInput.value = todayStr();

function resetJournalForm(date) {
  journalDateInput.value = date || todayStr();
  document.getElementById('journal-narrative').value = '';
  document.getElementById('journal-volume').value = '';
  document.getElementById('journal-challenges').value = '';
  document.getElementById('journal-lessons').value = '';
  journalDeleteBtn.classList.add('hidden');
  journalStatus.textContent = '';
  journalStatus.className = 'status-msg';
}

async function loadJournalEntryIntoForm(date) {
  try {
    const entry = await api(`/api/journal/${date}`);
    journalDateInput.value = entry.entry_date;
    document.getElementById('journal-narrative').value = entry.narrative ?? '';
    document.getElementById('journal-volume').value = entry.volume ?? '';
    document.getElementById('journal-challenges').value = entry.challenges ?? '';
    document.getElementById('journal-lessons').value = entry.lessons ?? '';
    journalDeleteBtn.classList.remove('hidden');
  } catch {
    resetJournalForm(date);
  }
}

journalForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  journalStatus.textContent = '';
  journalStatus.className = 'status-msg';

  const body = {
    entry_date: journalDateInput.value,
    narrative: document.getElementById('journal-narrative').value || null,
    volume: document.getElementById('journal-volume').value || null,
    challenges: document.getElementById('journal-challenges').value || null,
    lessons: document.getElementById('journal-lessons').value || null,
  };

  try {
    await api('/api/journal', { method: 'POST', body: JSON.stringify(body) });
    journalStatus.textContent = 'Entry saved.';
    journalStatus.classList.add('success');
    journalDeleteBtn.classList.remove('hidden');
    loadJournalList();
  } catch (err) {
    journalStatus.textContent = err.message;
    journalStatus.classList.add('error');
  }
});

journalDeleteBtn.addEventListener('click', async () => {
  if (!confirm('Delete this journal entry? This cannot be undone.')) return;
  try {
    await api(`/api/journal/${journalDateInput.value}`, { method: 'DELETE' });
    resetJournalForm();
    loadJournalList();
  } catch (err) {
    journalStatus.textContent = err.message;
    journalStatus.classList.add('error');
  }
});

async function loadJournalList() {
  let entries;
  try {
    entries = await api('/api/journal');
    journalListErrorEl.classList.add('hidden');
  } catch (err) {
    journalListErrorEl.textContent = `Couldn't load journal entries: ${err.message}. Is the server running?`;
    journalListErrorEl.classList.remove('hidden');
    return;
  }

  journalListEl.innerHTML = '';
  if (entries.length === 0) {
    journalListEl.innerHTML = '<p class="hint">No journal entries yet.</p>';
    return;
  }

  entries.forEach((e) => {
    const preview = e.narrative || e.lessons || e.challenges || '(no notes)';
    const card = document.createElement('div');
    card.className = 'trade-card';
    card.innerHTML = `
      <div class="trade-card-top">
        <span class="coin">${e.entry_date}</span>
      </div>
      <div class="trade-card-meta">${escapeHtml(preview.slice(0, 140))}${preview.length > 140 ? '…' : ''}</div>
    `;
    card.addEventListener('click', () => loadJournalEntryIntoForm(e.entry_date));
    journalListEl.appendChild(card);
  });
}

// ---------- Dashboard ----------
function renderCorrList(containerId, rows) {
  const el = document.getElementById(containerId);
  if (rows.length === 0) {
    el.innerHTML = '<p class="hint">Not enough closed trades yet.</p>';
    return;
  }

  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.avgPnlPercent ?? 0)));

  el.innerHTML = rows
    .map((r) => {
      const widthPct = r.avgPnlPercent == null ? 0 : Math.max(4, (Math.abs(r.avgPnlPercent) / maxAbs) * 100);
      const cls = pnlClass(r.avgPnlPercent);
      return `
        <div class="corr-row">
          <span class="corr-label">${escapeHtml(String(r.key))}</span>
          <div class="corr-bar-track"><div class="corr-bar-fill ${cls}" style="width:${widthPct}%"></div></div>
          <span class="corr-value ${cls}">${fmtPct(r.avgPnlPercent)} avg &middot; ${r.count} trade${r.count === 1 ? '' : 's'} &middot; ${r.winRate ?? 0}% win</span>
        </div>
      `;
    })
    .join('');
}

async function loadDashboard() {
  const dashboardErrorEl = document.getElementById('dashboard-error');
  let data;
  try {
    data = await api('/api/dashboard');
    dashboardErrorEl.classList.add('hidden');
  } catch (err) {
    dashboardErrorEl.textContent = `Couldn't load dashboard: ${err.message}. Is the server running?`;
    dashboardErrorEl.classList.remove('hidden');
    return;
  }

  document.getElementById('dashboard-bullets').innerHTML =
    '<ul class="bullet-list">' + data.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('') + '</ul>';

  const patternsEl = document.getElementById('dashboard-patterns');
  if (data.patterns.length === 0) {
    patternsEl.innerHTML = '<p class="hint">No recurring phrases yet &mdash; keep logging lessons and thoughts on your trades.</p>';
  } else {
    patternsEl.innerHTML = data.patterns
      .map((p) => `<span class="pattern-pill">${escapeHtml(p.phrase)} <span class="pattern-count">${p.count}</span></span>`)
      .join('');
  }

  renderCorrList('dashboard-by-emotion', data.byEmotion);
  renderCorrList('dashboard-by-risk', data.byRisk);
  renderCorrList('dashboard-by-grade', data.byGrade);
}

// ---------- Settings ----------
const usernameInput = document.getElementById('settings-username');
const dashboardGreeting = document.getElementById('dashboard-greeting');

function applyGreeting() {
  const name = localStorage.getItem('displayName');
  if (name) {
    dashboardGreeting.textContent = `Welcome back, ${name}.`;
    dashboardGreeting.classList.remove('hidden');
  } else {
    dashboardGreeting.classList.add('hidden');
  }
}

usernameInput.value = localStorage.getItem('displayName') || '';
applyGreeting();

let usernameDebounce;
usernameInput.addEventListener('input', () => {
  clearTimeout(usernameDebounce);
  usernameDebounce = setTimeout(() => {
    if (usernameInput.value.trim()) localStorage.setItem('displayName', usernameInput.value.trim());
    else localStorage.removeItem('displayName');
    applyGreeting();
  }, 400);
});

const settingsCurrencySelect = document.getElementById('settings-currency');
const settingsSolPriceInput = document.getElementById('settings-sol-price');
const settingsSolPriceLabel = document.getElementById('settings-sol-price-label');

function updateCurrencyPriceField() {
  const isFiat = appCurrency !== 'sol';
  settingsSolPriceInput.classList.toggle('hidden', !isFiat);
  if (isFiat) {
    settingsSolPriceLabel.textContent = `1 SOL in ${appCurrency.toUpperCase()}`;
    settingsSolPriceInput.placeholder = `e.g. ${CURRENCY_SYMBOLS[appCurrency]}150`;
    settingsSolPriceInput.value = solPrices[appCurrency] ?? '';
  }
}

settingsCurrencySelect.value = appCurrency;
updateCurrencyPriceField();

settingsCurrencySelect.addEventListener('change', () => {
  appCurrency = settingsCurrencySelect.value;
  localStorage.setItem('appCurrency', appCurrency);
  updateCurrencyPriceField();
});

settingsSolPriceInput.addEventListener('input', () => {
  const val = Number(settingsSolPriceInput.value);
  if (val > 0) solPrices[appCurrency] = val;
  else delete solPrices[appCurrency];
  localStorage.setItem('solPrices', JSON.stringify(solPrices));
});

// Only the accent/background tint changes per theme -- green/red/gold stay
// fixed everywhere since they carry P&L meaning, not brand identity.
document.querySelectorAll('.theme-swatch').forEach((btn) => {
  if (btn.dataset.theme === (localStorage.getItem('appTheme') || 'violet')) btn.classList.add('active');
  btn.addEventListener('click', () => {
    document.querySelectorAll('.theme-swatch').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.documentElement.setAttribute('data-theme', btn.dataset.theme);
    localStorage.setItem('appTheme', btn.dataset.theme);
  });
});

// initial load
loadDashboard();
