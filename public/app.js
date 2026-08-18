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

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabButtons.forEach((b) => b.classList.remove('active'));
    views.forEach((v) => v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`view-${btn.dataset.view}`).classList.add('active');

    if (btn.dataset.view === 'list') loadTradeList();
    if (btn.dataset.view === 'totals') loadTotals();
    if (btn.dataset.view === 'calendar') loadCalendar();
  });
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
      <span class="${pnlClass(t.pnl_amount)}">${fmtSol(t.pnl_amount)} (${fmtPct(t.pnl_percent)})</span>
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

    <p>P&amp;L: <span class="${pnlClass(t.pnl_amount)}">${fmtSol(t.pnl_amount)} (${fmtPct(t.pnl_percent)})</span></p>

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
  const closed = trades.filter((t) => t.status === 'closed');
  const totalPnl = closed.reduce((sum, t) => sum + (t.pnl_amount || 0), 0);
  const wins = closed.filter((t) => t.pnl_amount > 0).length;
  const losses = closed.filter((t) => t.pnl_amount < 0).length;
  const winRate = closed.length ? ((wins / closed.length) * 100).toFixed(1) : '0.0';

  document.getElementById('totals-summary').innerHTML = `
    <div class="big-number ${pnlClass(totalPnl)}">${fmtSol(totalPnl)}</div>
    <p class="hint">Total P&amp;L across ${closed.length} closed trade${closed.length === 1 ? '' : 's'}</p>
    <div class="stat-row"><span>Open trades</span><span>${trades.length - closed.length}</span></div>
    <div class="stat-row"><span>Wins / Losses</span><span>${wins} / ${losses}</span></div>
    <div class="stat-row"><span>Win rate</span><span>${winRate}%</span></div>
  `;
}

// ---------- Calendar ----------
let calCursor = new Date();
calCursor.setDate(1);
let calCurrency = 'sol';
let solPriceUsd = Number(localStorage.getItem('solPriceUsd')) || null;

document.getElementById('cal-prev').addEventListener('click', () => {
  calCursor.setMonth(calCursor.getMonth() - 1);
  loadCalendar();
});
document.getElementById('cal-next').addEventListener('click', () => {
  calCursor.setMonth(calCursor.getMonth() + 1);
  loadCalendar();
});

const solPriceInput = document.getElementById('sol-price-usd');
if (solPriceUsd) solPriceInput.value = solPriceUsd;

document.querySelectorAll('.value-toggle[data-toggle-group="cal-currency"] .toggle-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    calCurrency = btn.dataset.type;
    solPriceInput.classList.toggle('hidden', calCurrency !== 'usd');
    loadCalendar();
  });
});

solPriceInput.addEventListener('input', () => {
  const val = Number(solPriceInput.value);
  solPriceUsd = val > 0 ? val : null;
  if (solPriceUsd) localStorage.setItem('solPriceUsd', solPriceUsd);
  loadCalendar();
});

// Displays a SOL amount in whichever currency is currently toggled.
// USD always uses standard 2dp currency formatting (0dp above $1000),
// independent of the SOL decimal precision requested.
function fmtCalAmount(sol, decimals) {
  if (calCurrency === 'usd' && solPriceUsd) {
    const usd = sol * solPriceUsd;
    const sign = usd > 0 ? '+' : usd < 0 ? '-' : '';
    const abs = Math.abs(usd);
    return `${sign}$${abs >= 1000 ? abs.toFixed(0) : abs.toFixed(2)}`;
  }
  return fmtSol(sol, decimals);
}

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
  monthTotalEl.textContent = `Month total: ${fmtCalAmount(monthTotal, 3)}`;
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
    cell.innerHTML = `<span class="day-num">${day}</span>${pnl != null ? `<span class="day-pnl">${fmtCalAmount(pnl, 2)}</span>` : ''}`;
    grid.appendChild(cell);
  }
}

// initial load
loadTradeList();
