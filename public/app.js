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

// ---------- Currency setting (Settings tab) ----------
// Two separate concerns: `defaultCurrency` is which fiat currency Settings
// is configured for (usd/gbp/eur/jpy) and its rate; `displayMode` is
// whether the app is *currently* showing SOL or that fiat currency right
// now. Settings only controls the former -- the latter gets a quick SOL/
// {currency} toggle on Total P&L and the Calendar, so you don't have to
// dig into Settings every time you want to flip between the two. Both are
// global (not per-page) so toggling one place keeps everything in sync.
const CURRENCY_SYMBOLS = { usd: '$', gbp: '£', eur: '€', jpy: '¥' };

let defaultCurrency = localStorage.getItem('defaultCurrency');
let displayMode = localStorage.getItem('displayMode');
let solPrices = {};
try {
  solPrices = JSON.parse(localStorage.getItem('solPrices') || '{}');
} catch {
  solPrices = {};
}

// One-time migration from the old single appCurrency setting.
if (!defaultCurrency) {
  const legacy = localStorage.getItem('appCurrency');
  if (legacy && legacy !== 'sol') {
    defaultCurrency = legacy;
    displayMode = displayMode || 'fiat';
  } else {
    defaultCurrency = 'usd';
  }
  localStorage.setItem('defaultCurrency', defaultCurrency);
}
displayMode = displayMode || 'sol';

// Displays a SOL amount as SOL or the configured default currency,
// depending on the current display mode. Standard 2dp currency formatting
// (0dp above $1000, and JPY is always 0dp since it has no minor subunit in
// everyday use).
function fmtMoney(sol, decimals) {
  if (sol == null) return '—';
  const price = solPrices[defaultCurrency];
  if (displayMode === 'fiat' && price) {
    const amount = sol * price;
    const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
    const abs = Math.abs(amount);
    const dp = defaultCurrency === 'jpy' ? 0 : abs >= 1000 ? 0 : 2;
    return `${sign}${CURRENCY_SYMBOLS[defaultCurrency]}${abs.toFixed(dp)}`;
  }
  return fmtSol(sol, decimals);
}

// Shown wherever fmtMoney() is used for a headline number, so a fiat
// currency silently falling back to SOL (because no rate has been entered
// yet) doesn't read as "the currency setting doesn't work." Returns plain
// text -- callers wrap it in whatever element fits their layout.
function currencyPendingHint() {
  if (displayMode !== 'fiat' || solPrices[defaultCurrency]) return '';
  return `Showing SOL — set a SOL price for ${defaultCurrency.toUpperCase()} in Settings to see this in ${defaultCurrency.toUpperCase()}.`;
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

// ---------- DexScreener autofill ----------
// Debounced on input rather than a dedicated "look up" button, so pasting
// a contract address (the natural first thing you do when logging a fast
// memecoin trade) just works without an extra click. Silent on failure --
// a brand-new/unlisted token not being found isn't an error, it's normal,
// and shouldn't nag the user mid-trade-entry.
const dexscreenerStatus = document.getElementById('dexscreener-status');
let dexscreenerDebounce;
let dexscreenerLastAddress = null;

document.getElementById('contract_address').addEventListener('input', (e) => {
  clearTimeout(dexscreenerDebounce);
  const address = e.target.value.trim();
  if (address.length < 32 || address === dexscreenerLastAddress) return;
  dexscreenerDebounce = setTimeout(() => lookupDexscreener(address), 700);
});

async function lookupDexscreener(address) {
  dexscreenerLastAddress = address;
  dexscreenerStatus.textContent = 'Looking up token on DexScreener…';
  dexscreenerStatus.className = 'status-msg';
  try {
    const data = await api(`/api/dexscreener/${encodeURIComponent(address)}`);
    document.getElementById('coin_name').value = data.symbol || data.name || '';
    // Fill whichever unit (mcap or price) the entry toggle is currently set
    // to, rather than forcing it to Market Cap -- respects whatever the
    // user already picked.
    const entryType = getToggleType(addForm, 'entry');
    const value = entryType === 'price' ? data.price_usd : data.market_cap;
    if (value != null) document.getElementById('entry_value').value = Math.round(value * 100) / 100;
    dexscreenerStatus.textContent = `Auto-filled from DexScreener: ${data.name} (${data.symbol})`;
    dexscreenerStatus.classList.add('success');
  } catch {
    dexscreenerStatus.textContent = '';
  }
}

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
    dexscreenerLastAddress = null;
    dexscreenerStatus.textContent = '';
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
      <div class="inline-input-group">
        <input type="text" inputmode="decimal" id="m-exit_value" value="${exitValue}" placeholder="e.g. 500k, 1.2m, 0.000045">
        <button type="button" id="m-fetch-price" class="btn-secondary">&#128260; Current Price</button>
      </div>
      <p id="m-dexscreener-status" class="status-msg"></p>
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

  document.getElementById('m-fetch-price').addEventListener('click', async () => {
    const statusEl = document.getElementById('m-dexscreener-status');
    statusEl.textContent = 'Fetching current price…';
    statusEl.className = 'status-msg';
    try {
      // Read the live input, not the trade object the modal was opened
      // with -- if the address was just corrected/edited, that's what
      // "current price" should look up.
      const address = document.getElementById('m-contract_address').value.trim();
      const data = await api(`/api/dexscreener/${encodeURIComponent(address)}`);
      const exitType = getToggleType(modalBody, 'm-exit');
      const value = exitType === 'price' ? data.price_usd : data.market_cap;
      if (value != null) document.getElementById('m-exit_value').value = Math.round(value * 100) / 100;
      statusEl.textContent = `Current: ${data.name} (${data.symbol})`;
      statusEl.classList.add('success');
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.classList.add('error');
    }
  });

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
    ${currencyPendingHint() ? `<p class="hint">${currencyPendingHint()}</p>` : ''}
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
  document.getElementById('cal-currency-hint').textContent = currencyPendingHint();

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
const journalTitleInput = document.getElementById('journal-title');
const journalDateInput = document.getElementById('journal-date');
const journalStarBtn = document.getElementById('journal-star-btn');
const journalStatus = document.getElementById('journal-status');
const journalDeleteBtn = document.getElementById('journal-delete');
const journalListEl = document.getElementById('journal-list');
const journalListErrorEl = document.getElementById('journal-list-error');

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let journalStarred = false;

function setJournalStar(starred) {
  journalStarred = starred;
  journalStarBtn.classList.toggle('active', starred);
  journalStarBtn.setAttribute('aria-pressed', String(starred));
  journalStarBtn.innerHTML = starred ? '&#9733; Starred' : '&#9734; Star this entry';
}

journalStarBtn.addEventListener('click', () => setJournalStar(!journalStarred));

journalDateInput.value = todayStr();

function resetJournalForm(date) {
  journalTitleInput.value = '';
  journalDateInput.value = date || todayStr();
  document.getElementById('journal-narrative').value = '';
  document.getElementById('journal-volume').value = '';
  document.getElementById('journal-challenges').value = '';
  document.getElementById('journal-lessons').value = '';
  setJournalStar(false);
  journalDeleteBtn.classList.add('hidden');
  journalStatus.textContent = '';
  journalStatus.className = 'status-msg';
}

document.getElementById('journal-new').addEventListener('click', () => resetJournalForm());

async function loadJournalEntryIntoForm(date) {
  try {
    const entry = await api(`/api/journal/${date}`);
    journalTitleInput.value = entry.title ?? '';
    journalDateInput.value = entry.entry_date;
    document.getElementById('journal-narrative').value = entry.narrative ?? '';
    document.getElementById('journal-volume').value = entry.volume ?? '';
    document.getElementById('journal-challenges').value = entry.challenges ?? '';
    document.getElementById('journal-lessons').value = entry.lessons ?? '';
    setJournalStar(!!entry.starred);
    journalDeleteBtn.classList.remove('hidden');
    journalStatus.textContent = '';
    journalStatus.className = 'status-msg';
    journalForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    title: journalTitleInput.value || null,
    narrative: document.getElementById('journal-narrative').value || null,
    volume: document.getElementById('journal-volume').value || null,
    challenges: document.getElementById('journal-challenges').value || null,
    lessons: document.getElementById('journal-lessons').value || null,
    starred: journalStarred,
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

async function deleteJournalEntry(date) {
  if (!confirm('Delete this journal entry? This cannot be undone.')) return;
  try {
    await api(`/api/journal/${date}`, { method: 'DELETE' });
    if (journalDateInput.value === date) resetJournalForm();
    loadJournalList();
  } catch (err) {
    journalStatus.textContent = err.message;
    journalStatus.classList.add('error');
  }
}

journalDeleteBtn.addEventListener('click', () => deleteJournalEntry(journalDateInput.value));

async function toggleJournalStarFromList(entry) {
  try {
    await api('/api/journal', {
      method: 'POST',
      body: JSON.stringify({ ...entry, starred: !entry.starred }),
    });
    loadJournalList();
  } catch {
    // Non-critical -- if this fails the list just doesn't update; no need
    // to interrupt the user with an error for a quick star toggle.
  }
}

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
    const heading = e.title ? e.title : e.entry_date;
    const card = document.createElement('div');
    card.className = 'trade-card';
    card.innerHTML = `
      <div class="trade-card-top">
        <span class="coin">${escapeHtml(heading)} <span class="badge">${e.entry_date}</span></span>
        <button type="button" class="journal-card-star ${e.starred ? 'active' : ''}" title="${e.starred ? 'Unstar' : 'Star'} this entry">${e.starred ? '&#9733;' : '&#9734;'}</button>
      </div>
      <div class="trade-card-meta">${escapeHtml(preview.slice(0, 140))}${preview.length > 140 ? '…' : ''}</div>
      <button type="button" class="btn-danger journal-card-delete">Delete</button>
    `;
    card.addEventListener('click', () => openJournalViewModal(e));
    card.querySelector('.journal-card-star').addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggleJournalStarFromList(e);
    });
    card.querySelector('.journal-card-delete').addEventListener('click', (ev) => {
      ev.stopPropagation();
      deleteJournalEntry(e.entry_date);
    });
    journalListEl.appendChild(card);
  });
}

// Read-only detail view -- clicking a journal card shows this instead of
// dropping straight into the edit form. Reuses the same generic modal
// shell as the trade-detail modal (#trade-modal/#modal-body); Edit hands
// off to the actual form for changes.
// Deliberately not the .field/label styling used in forms -- there the
// label is a small hint above the thing you're editing, but in a read-only
// view the label IS the heading and should read as more prominent than
// the body text under it, not less.
function journalField(label, value) {
  if (!value) return '';
  return `<div class="view-field"><div class="view-field-label">${label}</div><p>${escapeHtml(value)}</p></div>`;
}

function openJournalViewModal(entry) {
  const heading = entry.title || entry.entry_date;
  const hasNotes = entry.narrative || entry.volume || entry.challenges || entry.lessons;

  modalBody.innerHTML = `
    <h2>${escapeHtml(heading)}</h2>
    <p class="hint">${entry.entry_date}${entry.starred ? ' &middot; &#9733; Starred' : ''}</p>
    ${journalField('Market narrative / meta trends', entry.narrative)}
    ${journalField('Volume / activity', entry.volume)}
    ${journalField('Challenges faced', entry.challenges)}
    ${journalField('Lessons of the day', entry.lessons)}
    ${hasNotes ? '' : '<p class="hint">No notes on this entry.</p>'}
    <div class="form-actions">
      <button type="button" id="jv-edit" class="btn-primary">Edit</button>
      <button type="button" id="jv-delete" class="btn-danger">Delete</button>
    </div>
  `;

  modal.classList.remove('hidden');

  document.getElementById('jv-edit').addEventListener('click', () => {
    modal.classList.add('hidden');
    loadJournalEntryIntoForm(entry.entry_date);
  });
  document.getElementById('jv-delete').addEventListener('click', () => {
    modal.classList.add('hidden');
    deleteJournalEntry(entry.entry_date);
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
const accountAvatar = document.getElementById('account-avatar');
const accountName = document.getElementById('account-name');
const pfpPreview = document.getElementById('pfp-preview');
const pfpRemoveBtn = document.getElementById('pfp-remove-btn');
const onboardingPfpPreview = document.getElementById('onboarding-pfp-preview');

function getInitials(name) {
  const parts = name.trim().split(/\s+/);
  return parts.length === 1 ? parts[0][0].toUpperCase() : (parts[0][0] + parts[1][0]).toUpperCase();
}

// Shared by the Settings preview circle and the bottom-left widget avatar --
// shows the uploaded photo if one exists, otherwise falls back to initials.
function setAvatarVisual(el, dataUrl, fallbackText) {
  if (dataUrl) {
    el.style.backgroundImage = `url(${dataUrl})`;
    el.textContent = '';
  } else {
    el.style.backgroundImage = '';
    el.textContent = fallbackText;
  }
}

// Drives the Dashboard's "Welcome back" line, the bottom-left account
// widget, and the Settings preview circle -- no real accounts, just a
// personalization touch built from the display name/photo in Settings.
// Whether the "Create Account" form is showing even though no name has
// been saved yet -- needed for the very first fill-in, since before that
// hasAccount (below) is false and would otherwise keep the fields hidden.
let settingsShowCreateForm = false;

function updateSettingsAccountUI() {
  const hasAccount = !!localStorage.getItem('displayName');
  document.getElementById('settings-no-account').classList.toggle('hidden', hasAccount || settingsShowCreateForm);
  document.getElementById('settings-account-fields').classList.toggle('hidden', !hasAccount && !settingsShowCreateForm);
  document.getElementById('settings-logout-section').classList.toggle('hidden', !hasAccount);
}

function applyProfile() {
  const name = localStorage.getItem('displayName');
  const pfp = localStorage.getItem('profilePicture');
  const fallback = name ? getInitials(name) : '?';

  setAvatarVisual(accountAvatar, pfp, fallback);
  setAvatarVisual(pfpPreview, pfp, fallback);
  setAvatarVisual(onboardingPfpPreview, pfp, fallback);
  pfpRemoveBtn.classList.toggle('hidden', !pfp);

  if (name) {
    dashboardGreeting.textContent = `Welcome back, ${name}.`;
    dashboardGreeting.classList.remove('hidden');
    accountName.textContent = name;
  } else {
    dashboardGreeting.classList.add('hidden');
    accountName.textContent = 'Guest';
  }

  updateSettingsAccountUI();
}

usernameInput.value = localStorage.getItem('displayName') || '';
applyProfile();

document.getElementById('settings-create-account-btn').addEventListener('click', () => {
  settingsShowCreateForm = true;
  updateSettingsAccountUI();
  usernameInput.focus();
});

function saveUsername() {
  if (usernameInput.value.trim()) localStorage.setItem('displayName', usernameInput.value.trim());
  else localStorage.removeItem('displayName');
  applyProfile();
}

document.getElementById('settings-username-save').addEventListener('click', saveUsername);
usernameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveUsername();
});

// Crops to a centered square and downsizes before storing, so a multi-MB
// photo doesn't get shoved whole into localStorage.
function resizeImageToDataUrl(file, size = 200) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('Could not read that image.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

// Shared by the Settings upload controls and the first-run onboarding
// modal's upload controls, so there's one upload/resize/store code path.
function wirePfpUpload(uploadBtnId, fileInputId) {
  const fileInput = document.getElementById(fileInputId);
  document.getElementById(uploadBtnId).addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      localStorage.setItem('profilePicture', dataUrl);
      applyProfile();
    } catch {
      // Not worth a whole error UI for a local avatar upload -- just leave
      // the previous photo (or fallback) in place if the file couldn't be read.
    }
    fileInput.value = '';
  });
}

wirePfpUpload('pfp-upload-btn', 'pfp-file-input');
wirePfpUpload('onboarding-pfp-upload-btn', 'onboarding-pfp-file-input');

pfpRemoveBtn.addEventListener('click', () => {
  localStorage.removeItem('profilePicture');
  applyProfile();
});

// ---------- First-run onboarding ----------
// Shown once, the first time the app is opened with no name set yet --
// covers what "Welcome back, {name}" is for once there IS a name, and
// gives new users an intentional way to set their name/photo instead of a
// browser autofill suggestion silently landing in the field.
const onboardingModal = document.getElementById('onboarding-modal');

function completeOnboarding() {
  localStorage.setItem('onboardingComplete', '1');
  onboardingModal.classList.add('hidden');
}

document.getElementById('onboarding-get-started').addEventListener('click', () => {
  const name = document.getElementById('onboarding-username').value.trim();
  if (name) {
    localStorage.setItem('displayName', name);
    usernameInput.value = name;
    applyProfile();
  }
  completeOnboarding();
  // startTour() is defined further down (function declarations are
  // hoisted), and by the time this click can actually fire the whole
  // script has already run, so it's always available here.
  startTour();
});

document.getElementById('onboarding-skip').addEventListener('click', completeOnboarding);

if (!localStorage.getItem('onboardingComplete') && !localStorage.getItem('displayName')) {
  onboardingModal.classList.remove('hidden');
}

// "Log out" here just means clearing the local profile -- there's no real
// account system (no server, no user database, no auth) to sign out of.
// Real Google/Apple/email sign-in would need a hosted backend, registered
// OAuth apps with each provider, and a user database -- a different kind
// of project than a local single-profile journal.
document.getElementById('settings-logout-btn').addEventListener('click', () => {
  if (!confirm("Log out? This clears your name and photo (not your trades or journal entries) and shows the welcome screen again.")) return;
  localStorage.removeItem('displayName');
  localStorage.removeItem('profilePicture');
  localStorage.removeItem('onboardingComplete');
  usernameInput.value = '';
  settingsShowCreateForm = false;
  applyProfile();
  switchToView('dashboard');
  document.getElementById('onboarding-username').value = '';
  onboardingModal.classList.remove('hidden');
});

document.getElementById('settings-icon-btn').addEventListener('click', () => switchToView('settings'));
document.getElementById('account-widget').addEventListener('click', () => switchToView('settings'));

// ---------- Guided tour ----------
// A lightweight spotlight tour over real elements on the Dashboard, rather
// than a separate slideshow -- each step highlights the actual button
// (boosting its z-index above the dimmed backdrop, no clip-path/SVG mask
// needed) and points a callout at it.
const TOUR_STEPS = [
  { selector: '#hamburger-btn', text: 'Tap here to open the menu and jump to any section of the app.' },
  { selector: '.quick-links', text: "Quick shortcuts to the places you'll use most, right from the Dashboard." },
  { selector: '#settings-icon-btn', text: 'Your name, photo, default currency, and theme all live in Settings.' },
  { selector: '#account-widget', text: "That's you. Click here any time to jump to Settings." },
  { selector: '#help-btn', text: "Stuck later? Come back here any time to replay this tour or check the FAQ." },
];

const tourBackdrop = document.getElementById('tour-backdrop');
const tourCallout = document.getElementById('tour-callout');
let tourStepIndex = 0;
let tourHighlightedEl = null;

function clearTourHighlight() {
  if (!tourHighlightedEl) return;
  if (tourHighlightedEl.dataset.tourWasStatic) {
    tourHighlightedEl.style.position = '';
    delete tourHighlightedEl.dataset.tourWasStatic;
  }
  tourHighlightedEl.style.zIndex = '';
  tourHighlightedEl.style.boxShadow = '';
  tourHighlightedEl = null;
}

function positionTourCallout(target) {
  const rect = target.getBoundingClientRect();
  const calloutRect = tourCallout.getBoundingClientRect();
  let top = rect.bottom + 14;
  if (top + calloutRect.height > window.innerHeight - 16) {
    top = Math.max(16, rect.top - calloutRect.height - 14);
  }
  let left = rect.left;
  if (left + calloutRect.width > window.innerWidth - 16) left = window.innerWidth - calloutRect.width - 16;
  if (left < 16) left = 16;
  tourCallout.style.top = `${top}px`;
  tourCallout.style.left = `${left}px`;
}

function showTourStep(i) {
  clearTourHighlight();
  if (i >= TOUR_STEPS.length) return endTour();

  const step = TOUR_STEPS[i];
  const target = document.querySelector(step.selector);
  if (!target) return showTourStep(i + 1); // skip a step whose element isn't on screen

  target.scrollIntoView({ behavior: 'smooth', block: 'center' });

  if (getComputedStyle(target).position === 'static') {
    target.dataset.tourWasStatic = 'true';
    target.style.position = 'relative';
  }
  target.style.zIndex = '201';
  target.style.boxShadow = '0 0 0 4px var(--accent), 0 0 24px 6px var(--accent)';
  tourHighlightedEl = target;

  document.getElementById('tour-callout-text').textContent = step.text;
  document.getElementById('tour-step-indicator').textContent = `${i + 1} of ${TOUR_STEPS.length}`;
  document.getElementById('tour-next').textContent = i === TOUR_STEPS.length - 1 ? 'Done' : 'Next';

  tourCallout.classList.add('hidden');
  setTimeout(() => {
    tourCallout.classList.remove('hidden');
    positionTourCallout(target);
  }, 350); // let scrollIntoView settle before measuring position
}

function startTour() {
  closeDrawer();
  document.getElementById('help-panel').classList.add('hidden');
  switchToView('dashboard');
  tourStepIndex = 0;
  tourBackdrop.classList.remove('hidden');
  setTimeout(() => showTourStep(0), 100);
}

function endTour() {
  clearTourHighlight();
  tourBackdrop.classList.add('hidden');
  tourCallout.classList.add('hidden');
}

document.getElementById('tour-next').addEventListener('click', () => showTourStep(++tourStepIndex));
document.getElementById('tour-skip').addEventListener('click', endTour);
tourBackdrop.addEventListener('click', endTour);

// ---------- Help ----------
const helpPanel = document.getElementById('help-panel');

document.getElementById('help-btn').addEventListener('click', () => helpPanel.classList.toggle('hidden'));
document.getElementById('help-panel-close').addEventListener('click', () => helpPanel.classList.add('hidden'));
document.getElementById('replay-tour-btn').addEventListener('click', startTour);

// A local single-user app has no real support inbox to send feedback to --
// Placeholder address -- swap for a real inbox before this is anything
// more than a personal local app. (Kept out of source as a real address
// for now since this repo may be public.)
document.getElementById('help-email-link').addEventListener('click', (e) => {
  e.preventDefault();
  window.location.href = `mailto:feedback@example.com?subject=${encodeURIComponent('Trading Journal feedback')}`;
});

const settingsCurrencySelect = document.getElementById('settings-currency');
const settingsSolPriceInput = document.getElementById('settings-sol-price');
const settingsSolPriceLabel = document.getElementById('settings-sol-price-label');

function updateCurrencyPriceField() {
  settingsSolPriceLabel.textContent = `1 SOL in ${defaultCurrency.toUpperCase()}`;
  settingsSolPriceInput.placeholder = `e.g. ${CURRENCY_SYMBOLS[defaultCurrency]}150`;
  settingsSolPriceInput.value = solPrices[defaultCurrency] ?? '';
}

// Every SOL/{currency} toggle on the app (Total P&L, Calendar) shares this
// label + click behavior, so they're all wired from one place and always
// agree on what "the fiat option" currently means.
function refreshCurrencyToggleLabels() {
  document.querySelectorAll('.fiat-toggle-label').forEach((el) => {
    el.textContent = defaultCurrency.toUpperCase();
  });
  document.querySelectorAll('.value-toggle[data-toggle-group="display-mode"] .toggle-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.type === displayMode);
  });
}

function setDisplayMode(mode) {
  displayMode = mode;
  localStorage.setItem('displayMode', mode);
  refreshCurrencyToggleLabels();
  window.dispatchEvent(new Event('currencychange'));
}

function wireDisplayModeToggle(root) {
  root.querySelectorAll('.value-toggle[data-toggle-group="display-mode"] .toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => setDisplayMode(btn.dataset.type));
  });
}

// Both the Total P&L and Calendar SOL/{currency} toggles exist in the
// static page markup (not modal-injected), so wiring them once here covers
// both -- clicking either stays in sync since displayMode is global.
wireDisplayModeToggle(document);
refreshCurrencyToggleLabels();

settingsCurrencySelect.value = defaultCurrency;
updateCurrencyPriceField();
refreshCurrencyToggleLabels();

settingsCurrencySelect.addEventListener('change', () => {
  defaultCurrency = settingsCurrencySelect.value;
  localStorage.setItem('defaultCurrency', defaultCurrency);
  updateCurrencyPriceField();
  refreshCurrencyToggleLabels();
  window.dispatchEvent(new Event('currencychange'));
});

settingsSolPriceInput.addEventListener('input', () => {
  const val = Number(settingsSolPriceInput.value);
  if (val > 0) solPrices[defaultCurrency] = val;
  else delete solPrices[defaultCurrency];
  localStorage.setItem('solPrices', JSON.stringify(solPrices));
  window.dispatchEvent(new Event('currencychange'));
});

// Re-render whatever's currently on screen when the currency setting
// changes, so switching it updates a view you already had open instead of
// only taking effect the next time you navigate to it.
window.addEventListener('currencychange', () => {
  if (document.getElementById('view-totals').classList.contains('active')) loadTotals();
  if (document.getElementById('view-list').classList.contains('active')) loadTradeList();
  if (!calendarModal.classList.contains('hidden')) loadCalendar();
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
