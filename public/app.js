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

// ---------- Close-trade validation ----------
// The server already refuses to close a trade missing these fields
// (validateCloseFields in server/routes/trades.js), but that's a round trip
// just to find out something was missing. This checks the same
// requirements client-side first and highlights exactly which field(s) are
// empty, rather than a generic error banner after a failed submit. Only
// applies when actually closing -- saving/editing an open trade has no such
// requirement.
function markFieldError(el) {
  el.classList.add('field-error');
}

function clearFieldErrors(root) {
  root.querySelectorAll('.field-error').forEach((el) => el.classList.remove('field-error'));
}

function validateCloseRequirements(root, { exitEl, exitHasValue, thesisEl, followedPlanEl, gradeEl }) {
  clearFieldErrors(root);
  const missing = [];
  if (!exitHasValue) {
    markFieldError(exitEl);
    missing.push('exit value');
  }
  if (!thesisEl.value.trim()) {
    markFieldError(thesisEl);
    missing.push('thesis');
  }
  if (!followedPlanEl.value) {
    markFieldError(followedPlanEl);
    missing.push('"did you follow your plan?"');
  }
  if (!gradeEl.value) {
    markFieldError(gradeEl);
    missing.push('grade');
  }
  return missing;
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
  if (viewName === 'journal') {
    loadJournalList();
    refreshJournalDaySummary();
  }
  if (viewName === 'dashboard') loadDashboard();
  if (viewName === 'achievements') loadAchievements();
  // Paste-the-address-first is the fast path, so land there -- but not on a
  // touch screen, where that would throw the keyboard up unasked.
  if (viewName === 'add' && window.matchMedia('(pointer: fine)').matches) {
    document.getElementById('contract_address').focus();
  }
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

// Sent with day-based requests so the server decides where midnight is using
// the browser's timezone, not its own.
const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

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

// A trade/journal row only gets updated_at set once it's actually been
// edited after creation (see PUT /api/trades/:id and the journal upsert's
// ON CONFLICT branch) -- null means "never touched since logging it", so
// this stays silent for anything that's never been edited. Doesn't affect
// sort order anywhere; it's purely a label.
function editedTag(row) {
  if (!row.updated_at) return '';
  const when = TrenchDates.formatDateTime(row.updated_at);
  return ` <span class="edited-tag" title="Last edited ${escapeHtml(when)}">(edited)</span>`;
}

// ---------- Add / Log Trade form ----------
const addForm = document.getElementById('add-trade-form');
const addStatus = document.getElementById('add-trade-status');

// ---------- Log Trade: auto "% risked" + collapsible exit section ----------
const amountInvestedInput = document.getElementById('amount_invested');
const percentRiskedInput = document.getElementById('percent_risked');
const percentRiskedHint = document.getElementById('percent-risked-hint');
const exitDetails = document.getElementById('add-exit-details');
const saveOpenBtn = document.getElementById('save-open-btn');
const saveClosedBtn = document.getElementById('save-closed-btn');
let percentRiskedEdited = false; // true once the user types their own number

function getPortfolioSol() {
  const n = Number(localStorage.getItem('portfolioSol'));
  return n > 0 ? n : null;
}

// With a portfolio size saved in Settings, "% risked" is just amount ÷
// portfolio -- so it fills itself in, until the user types their own value.
function refreshPercentRisked() {
  const portfolio = getPortfolioSol();
  percentRiskedHint.textContent = portfolio
    ? `Auto-filled from your ${portfolio} SOL portfolio. Type to override.`
    : 'Tip: set your portfolio size in Settings and this fills itself in.';
  if (!portfolio || percentRiskedEdited) return;
  const amount = Number(amountInvestedInput.value);
  percentRiskedInput.value = amount > 0 ? String(Math.round((amount / portfolio) * 10000) / 100) : '';
}

amountInvestedInput.addEventListener('input', refreshPercentRisked);
percentRiskedInput.addEventListener('input', () => {
  percentRiskedEdited = percentRiskedInput.value !== '';
  if (!percentRiskedEdited) refreshPercentRisked();
});
addForm.addEventListener('reset', () => {
  percentRiskedEdited = false;
  setTimeout(refreshPercentRisked, 0); // the inputs are cleared just after this event
});

// Exit & reflection stays out of the way for a live entry. "Log & Close" only
// makes sense once that section is open, so it appears with it and "Save as
// Open" is the primary action the rest of the time.
function syncExitSection() {
  const open = exitDetails.open;
  saveClosedBtn.classList.toggle('hidden', !open);
  saveOpenBtn.classList.toggle('btn-primary', !open);
  saveOpenBtn.classList.toggle('btn-secondary', open);
}
exitDetails.addEventListener('toggle', syncExitSection);
refreshPercentRisked();

const addScreenshot = wireScreenshotField(
  { previewId: 'add-screenshot-preview', uploadBtnId: 'add-screenshot-upload', removeBtnId: 'add-screenshot-remove', fileId: 'add-screenshot-file', pasteBtnId: 'add-screenshot-paste' },
  null,
  { onError: (err) => { addStatus.textContent = err.message; addStatus.classList.add('error'); } }
);

// ---------- DexScreener coin lookup ----------
// Only confirms the coin name -- price/mcap are NOT auto-filled. DexScreener's
// price data runs well behind a live chart (confirmed ~30s lag against a
// real chart during testing), which is too stale to trust for what you
// actually trade at, so entry/exit values stay manual. Debounced on input
// rather than a dedicated "look up" button, so pasting a contract address
// (the natural first thing you do when logging a fast memecoin trade) just
// works without an extra click. Silent on failure -- a brand-new/unlisted
// token not being found isn't an error, it's normal, and shouldn't nag the
// user mid-trade-entry.
const dexscreenerStatus = document.getElementById('dexscreener-status');
let dexscreenerDebounce;
let dexscreenerLastAddress = null;

document.getElementById('contract_address').addEventListener('input', (e) => {
  clearTimeout(dexscreenerDebounce);
  const address = e.target.value.trim();
  if (address.length < 32 || address === dexscreenerLastAddress) return;
  dexscreenerDebounce = setTimeout(() => lookupDexscreener(address), 700);
});

// Renders whatever DexScreener actually returned for this pair -- socials
// and stats are per-token (set by whoever created it) and DexScreener just
// doesn't have some of them for a lot of tokens, so every slot falls back
// to a plain "No X" instead of silently disappearing, per the same pattern
// used for locked achievements.
function renderDexInfo(data) {
  const panel = document.getElementById('dexscreener-info');

  const link = (url, label) => (url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${label}</a>` : `<span class="hint-inline">No ${label}</span>`);
  const links = [link(data.twitter_url, 'Twitter/X'), link(data.website_url, 'Website')];
  if (data.telegram_url) links.push(link(data.telegram_url, 'Telegram'));

  const stats = [
    ['DEX', data.dex_id || 'No DEX data'],
    ['24h Volume', data.volume_24h != null ? `$${Math.round(data.volume_24h).toLocaleString()}` : 'No volume data'],
    ['24h Change', data.price_change_24h != null ? `${data.price_change_24h >= 0 ? '+' : ''}${data.price_change_24h}%` : 'No price change data'],
    ['24h Buys/Sells', data.buys_24h != null && data.sells_24h != null ? `${data.buys_24h} / ${data.sells_24h}` : 'No txn data'],
  ];

  panel.innerHTML = `
    <div class="dex-info-links">${links.join(' &middot; ')}</div>
    <div class="dex-info-stats">
      ${stats.map(([label, value]) => `<div class="dex-info-stat"><span class="dex-info-label">${label}</span><span class="dex-info-value">${escapeHtml(String(value))}</span></div>`).join('')}
    </div>
  `;
  panel.classList.remove('hidden');
}

function hideDexInfo() {
  document.getElementById('dexscreener-info').classList.add('hidden');
}

async function lookupDexscreener(address) {
  dexscreenerLastAddress = address;
  dexscreenerStatus.textContent = 'Looking up token on DexScreener…';
  dexscreenerStatus.className = 'status-msg';
  hideDexInfo();
  try {
    const data = await api(`/api/dexscreener/${encodeURIComponent(address)}`);
    document.getElementById('coin_name').value = data.symbol || data.name || '';
    // Deliberately not auto-filling entry price/mcap here -- DexScreener's
    // price data lags real charts by something like 30 seconds (confirmed
    // against a live chart during testing), which is well past the point
    // of being trustworthy to silently drop into a trade record. The name
    // lookup is reliable (it doesn't change tick to tick), so that stays;
    // the actual entry number is always typed in by hand.
    dexscreenerStatus.textContent = `Found: ${data.name} (${data.symbol}) — enter your own entry price/mcap below.`;
    dexscreenerStatus.classList.add('success');
    renderDexInfo(data);
  } catch {
    dexscreenerStatus.textContent = '';
  }
}

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  addStatus.textContent = '';
  addStatus.className = 'status-msg';
  clearFieldErrors(addForm);

  const status = e.submitter?.dataset.status || 'open';
  const entryVal = readToggledValue(addForm, 'entry', 'entry_value');
  const exitVal = readToggledValue(addForm, 'exit', 'exit_value');

  if (status === 'closed') {
    const missing = validateCloseRequirements(addForm, {
      exitEl: document.getElementById('exit_value'),
      exitHasValue: exitVal.price != null || exitVal.mcap != null,
      thesisEl: document.getElementById('thesis'),
      followedPlanEl: document.getElementById('followed_plan'),
      gradeEl: document.getElementById('grade'),
    });
    if (missing.length > 0) {
      addStatus.textContent = `Fill in ${missing.join(', ')} before closing this trade.`;
      addStatus.classList.add('error');
      return;
    }
  }

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
    screenshot: addScreenshot.get(),
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
    addScreenshot.reset();
    exitDetails.open = false;
    dexscreenerLastAddress = null;
    dexscreenerStatus.textContent = '';
    hideDexInfo();
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
  const date = TrenchDates.dayOf(t.closed_at || t.created_at);
  card.innerHTML = `
    <div class="trade-card-top">
      <span class="coin">${escapeHtml(t.coin_name)}
        <span class="badge status-${t.status}">${t.status}</span>
        ${t.grade ? `<span class="badge grade-${t.grade}">${t.grade}</span>` : ''}
        ${t.screenshot ? '<span class="badge" title="Has screenshot">📷</span>' : ''}
      </span>
      <span class="${pnlClass(t.pnl_amount)}">${fmtMoney(t.pnl_amount)} (${fmtPct(t.pnl_percent)})</span>
    </div>
    <div class="trade-card-meta">${escapeHtml(t.contract_address)}</div>
    <div class="trade-card-meta">${date} · ${t.percent_risked}% risked · ${EMOTIONAL_LABELS[t.emotional_state] || t.emotional_state}${editedTag(t)}</div>
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

  // The date range is applied here, not in the API: the server only knows
  // UTC, but these pickers are days on the user's own calendar.
  if (from || to) {
    trades = trades.filter((t) => {
      const day = TrenchDates.dayOf(t.closed_at || t.created_at);
      return (!from || day >= from) && (!to || day <= to);
    });
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

// Points at whichever modal's screenshot field is currently wired up, so
// the page-level paste listener knows where to route a pasted image while
// the modal is open. Only consulted while the modal is visible, so a stale
// reference from a previously-closed modal is harmless.
let currentModalScreenshot = null;

document.getElementById('modal-close').addEventListener('click', () => modal.classList.add('hidden'));
modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

async function openTradeModal(id) {
  const t = await api(`/api/trades/${id}`);
  const exitType = t.exit_price != null ? 'price' : 'mcap';
  const exitValue = t.exit_price ?? t.exit_mcap ?? '';

  modalBody.innerHTML = `
    <h2>${escapeHtml(t.coin_name)}</h2>
    <p class="hint">${escapeHtml(t.contract_address)}</p>
    <p class="hint">Logged ${TrenchDates.formatDateTime(t.created_at)} · Status: ${t.status}${editedTag(t)}</p>

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
      <label>Screenshot</label>
      <p class="hint">Tip: you can paste a screenshot straight from the clipboard with Ctrl+V, or click Paste below.</p>
      <div id="m-screenshot-preview" class="screenshot-preview">
        ${t.screenshot ? `<img id="m-screenshot-img" src="${t.screenshot}" alt="Trade screenshot">` : '<p class="hint">No screenshot attached.</p>'}
      </div>
      <input type="file" id="m-screenshot-file" accept="image/*" class="hidden">
      <div style="display:flex; gap:0.6rem; margin-top:0.4rem; flex-wrap:wrap;">
        <button type="button" id="m-screenshot-upload" class="btn-secondary">${t.screenshot ? 'Replace' : 'Upload'} Screenshot</button>
        <button type="button" id="m-screenshot-paste" class="btn-secondary">📋 Paste</button>
        <button type="button" id="m-screenshot-remove" class="btn-danger ${t.screenshot ? '' : 'hidden'}">Remove</button>
      </div>
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

  const modalScreenshot = wireScreenshotField(
    { previewId: 'm-screenshot-preview', uploadBtnId: 'm-screenshot-upload', removeBtnId: 'm-screenshot-remove', fileId: 'm-screenshot-file', pasteBtnId: 'm-screenshot-paste' },
    t.screenshot ?? null,
    { onError: (err) => { statusEl.textContent = err.message; statusEl.className = 'status-msg error'; } }
  );
  currentModalScreenshot = modalScreenshot;

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
      screenshot: modalScreenshot.get(),
    };
  }

  const statusEl = document.getElementById('m-status');

  document.getElementById('m-save').addEventListener('click', async () => {
    clearFieldErrors(modalBody);
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
      const exit = readToggledValue(modalBody, 'm-exit', 'm-exit_value');
      const missing = validateCloseRequirements(modalBody, {
        exitEl: document.getElementById('m-exit_value'),
        exitHasValue: exit.price != null || exit.mcap != null,
        thesisEl: document.getElementById('m-thesis'),
        followedPlanEl: document.getElementById('m-followed_plan'),
        gradeEl: document.getElementById('m-grade'),
      });
      if (missing.length > 0) {
        statusEl.textContent = `Fill in ${missing.join(', ')} before closing this trade.`;
        statusEl.className = 'status-msg error';
        return;
      }

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
    .filter((t) => isInPeriod(TrenchDates.dayOf(t.closed_at || t.created_at), totalsPeriod));

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
    const day = TrenchDates.dayOf(t.closed_at || t.created_at);
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

// ---------- Day summary (shared by the Journal and the Today screen) ----------
const daySummaryEl = document.getElementById('journal-day-summary');
let daySummaryRequestId = 0;

function dayTile(value, label, cls = '') {
  return `<div class="day-tile"><div class="day-tile-value ${cls}">${value}</div><div class="day-tile-label">${label}</div></div>`;
}

// Makes every .day-trade-row inside `container` open that trade's modal,
// by mouse or keyboard.
function wireDayTradeRows(container) {
  container.querySelectorAll('.day-trade-row').forEach((row) => {
    const open = () => openTradeModal(Number(row.dataset.tradeId));
    row.addEventListener('click', open);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
  });
}

function renderDaySummary(s, { title = 'Your trading day', emptyText = 'No trades logged on this day.' } = {}) {
  if (s.opened === 0 && s.closed === 0) {
    return `<div class="day-summary-title">${title}</div><p class="hint">${emptyText}</p>`;
  }

  const mood = s.moodMix.map((m) => `${EMOTIONAL_LABELS[m.mood] || m.mood} ×${m.count}`).join(' · ');
  const plan = s.closed ? `${s.plan.yes} yes · ${s.plan.partially} partly · ${s.plan.no} no` : '';
  const tradeLabel = (t) => `${escapeHtml(t.coin_name)} ${fmtPct(t.pnl_percent)}`;

  const rows = s.trades
    .map((t) => {
      // Describe the trade as of THIS day: its P&L only counts on the day it
      // closed, so a trade opened here but closed later reads "closed later".
      const what = [t.opened_today ? 'opened' : '', t.closed_today ? 'closed' : ''].filter(Boolean).join(' & ');
      const outcome = t.closed_today
        ? `<span class="${pnlClass(t.pnl_amount)}">${fmtMoney(t.pnl_amount)}</span>`
        : `<span class="day-trade-state">${t.status === 'open' ? 'still open' : 'closed later'}</span>`;
      return `
        <div class="day-trade-row" data-trade-id="${t.id}" role="button" tabindex="0">
          <span class="day-trade-name">${escapeHtml(t.coin_name)}</span>
          <span class="day-trade-meta">${what} · ${EMOTIONAL_LABELS[t.emotional_state] || t.emotional_state}</span>
          ${outcome}
        </div>`;
    })
    .join('');

  return `
    <div class="day-summary-title">${title}</div>
    <div class="day-summary-tiles">
      ${dayTile(s.opened, 'opened')}
      ${dayTile(s.closed, 'closed')}
      ${dayTile(s.closed ? fmtMoney(s.pnl) : '—', 'P&amp;L', s.closed ? pnlClass(s.pnl) : '')}
      ${dayTile(s.closed ? `${s.wins}W / ${s.losses}L` : '—', 'win / loss')}
    </div>
    ${mood ? `<div class="day-line"><span>Mood at entry</span><span>${mood}</span></div>` : ''}
    ${plan ? `<div class="day-line"><span>Followed plan</span><span>${plan}</span></div>` : ''}
    ${s.best ? `<div class="day-line"><span>Best trade</span><span class="pnl-pos">${tradeLabel(s.best)}</span></div>` : ''}
    ${s.worst ? `<div class="day-line"><span>Worst trade</span><span class="pnl-neg">${tradeLabel(s.worst)}</span></div>` : ''}
    <div class="day-trades">${rows}</div>
  `;
}

async function refreshJournalDaySummary() {
  const date = journalDateInput.value;
  if (!date) {
    daySummaryEl.innerHTML = '';
    return;
  }
  // Only the newest request may paint: flicking through dates quickly can
  // make responses arrive out of order.
  const requestId = ++daySummaryRequestId;
  try {
    const summary = await api(`/api/daily/${date}?tz=${encodeURIComponent(browserTimeZone)}`);
    if (requestId !== daySummaryRequestId) return;
    daySummaryEl.innerHTML = renderDaySummary(summary);
    wireDayTradeRows(daySummaryEl);
  } catch {
    if (requestId !== daySummaryRequestId) return;
    daySummaryEl.innerHTML = '<p class="hint">Couldn\'t load this day\'s trades. Is the server running?</p>';
  }
}

// ---------- Journal: end-of-day check-in ----------
// Segmented buttons where at most one is active and clicking the active one
// clears it (so "no answer" stays possible). Deliberately not the
// .value-toggle class: initValueToggles() makes those always-one-selected.
function wireSegmented(groupId) {
  const group = document.getElementById(groupId);
  const buttons = [...group.querySelectorAll('.toggle-btn')];
  const set = (value) => {
    buttons.forEach((b) => {
      const on = value != null && b.dataset.value === String(value);
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  };
  group.addEventListener('click', (e) => {
    const btn = e.target.closest('.toggle-btn');
    if (!btn) return;
    set(btn.classList.contains('active') ? null : btn.dataset.value);
  });
  set(null);
  return { set, get: () => buttons.find((b) => b.classList.contains('active'))?.dataset.value ?? null };
}

const journalSleep = wireSegmented('journal-sleep-group');
const journalRules = wireSegmented('journal-rules-group');
const journalWorkOnInputs = [1, 2, 3].map((n) => document.getElementById(`journal-workon-${n}`));

function setCheckinFields(entry) {
  const items = (entry?.work_on || '').split('\n');
  journalWorkOnInputs.forEach((input, i) => { input.value = items[i] || ''; });
  journalSleep.set(entry?.sleep_rating ?? null);
  journalRules.set(entry?.rules_followed ?? null);
}

const RULES_LABELS = { yes: 'Yes', partly: 'Partly', no: 'No' };

function journalCheckinView(entry) {
  const items = (entry.work_on || '').split('\n').filter(Boolean);
  const parts = [];
  if (items.length) {
    parts.push(
      `<div class="view-field"><div class="view-field-label">Work on tomorrow</div><ul class="bullet-list">${items
        .map((i) => `<li>${escapeHtml(i)}</li>`)
        .join('')}</ul></div>`
    );
  }
  if (entry.sleep_rating) parts.push(journalField('Sleep last night', `${entry.sleep_rating} / 5`));
  if (entry.rules_followed) parts.push(journalField('Stuck to my rules', RULES_LABELS[entry.rules_followed]));
  return parts.join('');
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
journalDateInput.addEventListener('change', refreshJournalDaySummary);

function resetJournalForm(date) {
  journalTitleInput.value = '';
  journalDateInput.value = date || todayStr();
  document.getElementById('journal-narrative').value = '';
  document.getElementById('journal-volume').value = '';
  document.getElementById('journal-challenges').value = '';
  document.getElementById('journal-lessons').value = '';
  setCheckinFields(null);
  setJournalStar(false);
  journalDeleteBtn.classList.add('hidden');
  journalStatus.textContent = '';
  journalStatus.className = 'status-msg';
  refreshJournalDaySummary();
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
    setCheckinFields(entry);
    setJournalStar(!!entry.starred);
    journalDeleteBtn.classList.remove('hidden');
    journalStatus.textContent = '';
    journalStatus.className = 'status-msg';
    refreshJournalDaySummary();
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
    work_on: journalWorkOnInputs.map((input) => input.value.trim()).filter(Boolean),
    sleep_rating: journalSleep.get() == null ? null : Number(journalSleep.get()),
    rules_followed: journalRules.get(),
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
    const workOnFirst = (e.work_on || '').split('\n')[0];
    const preview = e.narrative || e.lessons || e.challenges || (workOnFirst ? `Work on: ${workOnFirst}` : '(no notes)');
    const heading = e.title ? e.title : e.entry_date;
    const card = document.createElement('div');
    card.className = 'trade-card';
    card.innerHTML = `
      <div class="trade-card-top">
        <span class="coin">${escapeHtml(heading)} <span class="badge">${e.entry_date}</span>${editedTag(e)}</span>
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
  const hasNotes =
    entry.narrative || entry.volume || entry.challenges || entry.lessons || entry.work_on || entry.sleep_rating || entry.rules_followed;

  modalBody.innerHTML = `
    <h2>${escapeHtml(heading)}</h2>
    <p class="hint">${entry.entry_date}${entry.starred ? ' &middot; &#9733; Starred' : ''}${editedTag(entry)}</p>
    ${journalField('Market narrative / meta trends', entry.narrative)}
    ${journalField('Volume / activity', entry.volume)}
    ${journalField('Challenges faced', entry.challenges)}
    ${journalField('Lessons of the day', entry.lessons)}
    ${journalCheckinView(entry)}
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

// ---------- Today (home screen) ----------
const todayFocusEl = document.getElementById('today-focus');
const todaySummaryEl = document.getElementById('today-summary');
const todayOpenEl = document.getElementById('today-open');
const todayJournalBtn = document.getElementById('today-journal-btn');
const SHORT_DAY_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const LONG_DAY_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
let todayDate = null; // "today" as the server worked it out for the browser's timezone

// Formats a YYYY-MM-DD calendar day for display ('Sat, 19 Sep').
function niceDay(dayStr, formatter = SHORT_DAY_FORMAT) {
  const [y, m, d] = dayStr.split('-').map(Number);
  return formatter.format(new Date(y, m - 1, d));
}

function openJournalFor(date) {
  switchToView('journal');
  loadJournalEntryIntoForm(date);
}

document.getElementById('today-log-btn').addEventListener('click', () => switchToView('add'));
todayJournalBtn.addEventListener('click', () => openJournalFor(todayDate));

function renderTodayFocus(focus) {
  const parts = ['<div class="day-summary-title">Focus for today</div>'];

  if (focus.carryOver.length) {
    parts.push(
      '<div class="focus-subtitle">You said you would work on</div>',
      '<ul class="focus-list">' +
        focus.carryOver
          .map((i) => `<li class="focus-item"><span>${escapeHtml(i.text)}</span><span class="focus-item-date">${niceDay(i.date)}</span></li>`)
          .join('') +
        '</ul>'
    );
  }

  if (focus.callouts.length) {
    parts.push(`<div class="focus-subtitle">Patterns in your last ${focus.windowDays} active day${focus.windowDays === 1 ? '' : 's'}</div>`);
    focus.callouts.forEach((c) => {
      const action =
        c.kind === 'journal' ? `<button type="button" class="btn-secondary" data-journal-date="${c.date}">Journal it</button>` : '';
      parts.push(`<div class="focus-callout ${c.tone}"><span>${escapeHtml(c.text)}</span>${action}</div>`);
    });
  }

  if (!focus.carryOver.length && !focus.callouts.length) {
    parts.push(
      focus.windowDays === 0
        ? '<p class="hint">Nothing to flag yet. Log a few trades and finish each day with the check-in in the Journal. This card will carry your "work on tomorrow" notes forward and point out patterns.</p>'
        : `<p class="hint">Nothing stands out in your last ${focus.windowDays} active day${focus.windowDays === 1 ? '' : 's'}. Keep logging and it will flag anything that does.</p>`
    );
  }
  return parts.join('');
}

function renderTodayOpen(positions) {
  if (!positions.length) return '';
  const rows = positions
    .map(
      (p) => `
        <div class="day-trade-row" data-trade-id="${p.id}" role="button" tabindex="0">
          <span class="day-trade-name">${escapeHtml(p.coin_name)}</span>
          <span class="day-trade-meta">${TrenchDates.formatDateTime(p.created_at)} · ${p.amount_invested} SOL · ${EMOTIONAL_LABELS[p.emotional_state] || p.emotional_state}</span>
          <span class="day-trade-action">Close out &rarr;</span>
        </div>`
    )
    .join('');
  return `<div class="day-summary-title">Open positions (${positions.length})</div><div class="day-trades">${rows}</div>`;
}

function renderToday(t) {
  todayDate = t.date;
  document.getElementById('today-date').textContent = niceDay(t.date, LONG_DAY_FORMAT);

  todayFocusEl.innerHTML = renderTodayFocus(t.focus);
  todayFocusEl.querySelectorAll('[data-journal-date]').forEach((btn) => {
    btn.addEventListener('click', () => openJournalFor(btn.dataset.journalDate));
  });

  todaySummaryEl.innerHTML = renderDaySummary(t.summary, {
    title: 'Today so far',
    emptyText: 'No trades yet today. Log one and it shows up here.',
  });
  wireDayTradeRows(todaySummaryEl);

  todayOpenEl.innerHTML = renderTodayOpen(t.openPositions);
  wireDayTradeRows(todayOpenEl);

  todayJournalBtn.textContent = !t.journal.hasEntry
    ? "Write today's journal"
    : t.journal.hasCheckIn
      ? "Edit today's journal"
      : "Finish today's check-in";
}

async function loadDashboard() {
  const dashboardErrorEl = document.getElementById('dashboard-error');
  let data;
  let today;
  try {
    [today, data] = await Promise.all([
      api(`/api/today?tz=${encodeURIComponent(browserTimeZone)}`),
      api('/api/dashboard'),
    ]);
    dashboardErrorEl.classList.add('hidden');
  } catch (err) {
    dashboardErrorEl.textContent = `Couldn't load your dashboard: ${err.message}. Is the server running?`;
    dashboardErrorEl.classList.remove('hidden');
    return;
  }

  renderToday(today);

  document.getElementById('dashboard-bullets').innerHTML =
    '<ul class="bullet-list">' + data.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('') + '</ul>';

  renderCorrList('dashboard-by-emotion', data.byEmotion);
  renderCorrList('dashboard-by-risk', data.byRisk);
  renderCorrList('dashboard-by-grade', data.byGrade);
}

// ---------- Achievements ----------
async function loadAchievements() {
  const errorEl = document.getElementById('achievements-error');
  let data;
  try {
    data = await api('/api/achievements');
    errorEl.classList.add('hidden');
  } catch (err) {
    errorEl.textContent = `Couldn't load achievements: ${err.message}. Is the server running?`;
    errorEl.classList.remove('hidden');
    return;
  }

  document.getElementById('achievements-count').textContent = `${data.totalEarned} / ${data.totalBadges} earned`;

  document.getElementById('achievements-streaks').innerHTML = data.streaks
    .map(
      (s) => `
        <div class="streak-chip" title="${escapeHtml(s.label)} Streak — ${escapeHtml(s.description)} A streak counts how many times something happened back-to-back, in a row.">
          <span class="streak-fire-row"><span class="streak-fire">🔥</span><span class="streak-value">${s.value}</span></span>
          <span class="streak-label">${escapeHtml(s.label)}</span>
        </div>
      `
    )
    .join('');

  document.getElementById('achievements-categories').innerHTML = data.categories
    .map(
      (cat) => `
        <h3>${escapeHtml(cat.name)}</h3>
        <div class="badge-list">
          ${cat.badges
            .map(
              (b) => `
                <div class="badge-row ${b.earned ? 'earned' : 'locked'}">
                  <span class="badge-row-icon">${b.earned ? b.icon : '🔒'}</span>
                  <div class="badge-row-text">
                    <span class="badge-row-title">${escapeHtml(b.title)}</span>
                    <span class="badge-row-desc">${escapeHtml(b.description)}</span>
                  </div>
                </div>
              `
            )
            .join('')}
        </div>
      `
    )
    .join('');
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
// No "Create Account" gate -- the name/photo fields are just always there,
// and save themselves as you go (see saveUsername below and pfpUpload's
// change handler), same as everything else in Settings. There used to be a
// gate requiring an explicit "Enter" click to persist the name, which was
// easy to miss -- typing a name looked saved (it was sitting right there in
// the input) but never actually landed in localStorage unless that button
// was also clicked, which is exactly the kind of thing that silently loses
// data across an export/import or a reinstall.
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
}

usernameInput.value = localStorage.getItem('displayName') || '';
applyProfile();

function saveUsername() {
  if (usernameInput.value.trim()) localStorage.setItem('displayName', usernameInput.value.trim());
  else localStorage.removeItem('displayName');
  applyProfile();
}

// Saves on every keystroke rather than requiring a separate confirm click --
// there's nowhere for a typed name to go that *isn't* saved now, matching
// how the photo upload has always worked (picks a file, it's saved).
usernameInput.addEventListener('input', saveUsername);

document.getElementById('settings-clear-profile-btn').addEventListener('click', () => {
  if (!confirm('Clear your name and photo? Your trades, journal entries, and wallets are untouched.')) return;
  localStorage.removeItem('displayName');
  localStorage.removeItem('profilePicture');
  usernameInput.value = '';
  applyProfile();
});

// Downsizes a trade screenshot before it goes in the request body. Capped
// higher (1600px, quality 0.92) than a typical thumbnail resize -- chart
// screenshots are mostly sharp text/thin lines, which show JPEG compression
// artifacts a lot more visibly than a photo would at the same quality
// setting, so this errs toward fidelity over file size.
function resizeScreenshotToDataUrl(file, maxWidth = 1600) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      };
      img.onerror = () => reject(new Error('Could not read that image.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

// Full-size click-to-view opens an in-page lightbox rather than a new tab --
// a condensed thumbnail can hide small text/numbers on a chart, so this is
// the way to actually read one.
const screenshotLightbox = document.getElementById('screenshot-lightbox');
const screenshotLightboxImg = document.getElementById('screenshot-lightbox-img');

function openScreenshotFullSize(dataUrl) {
  screenshotLightboxImg.src = dataUrl;
  screenshotLightbox.classList.remove('hidden');
}

function closeScreenshotLightbox() {
  screenshotLightbox.classList.add('hidden');
  screenshotLightboxImg.src = '';
}

document.getElementById('screenshot-lightbox-close').addEventListener('click', closeScreenshotLightbox);
screenshotLightbox.addEventListener('click', (e) => {
  if (e.target === screenshotLightbox) closeScreenshotLightbox();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !screenshotLightbox.classList.contains('hidden')) closeScreenshotLightbox();
});

// Shared upload/preview/remove wiring for a trade screenshot field -- used
// by both the Log Trade form (attach while logging) and the trade edit/close
// modal (attach or replace later), so there's one code path either way.
// handleFile() is also exposed so a page-level paste listener (for pasting
// a Snipping Tool screenshot straight from the clipboard) can feed whichever
// field is currently on screen through the exact same upload path.
function wireScreenshotField(ids, initial, { onError } = {}) {
  let data = initial;
  const previewEl = document.getElementById(ids.previewId);
  const uploadBtn = document.getElementById(ids.uploadBtnId);
  const removeBtn = document.getElementById(ids.removeBtnId);
  const fileInput = document.getElementById(ids.fileId);
  const pasteBtn = ids.pasteBtnId ? document.getElementById(ids.pasteBtnId) : null;

  function render() {
    previewEl.innerHTML = data
      ? `<img src="${data}" alt="Trade screenshot">`
      : '<p class="hint">No screenshot attached.</p>';
    uploadBtn.textContent = data ? 'Replace Screenshot' : 'Upload Screenshot';
    removeBtn.classList.toggle('hidden', !data);
    const img = previewEl.querySelector('img');
    if (img) img.addEventListener('click', () => openScreenshotFullSize(data));
  }

  async function handleFile(file) {
    if (!file) return;
    try {
      data = await resizeScreenshotToDataUrl(file);
      render();
    } catch (err) {
      onError?.(err);
    }
  }

  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
  removeBtn.addEventListener('click', () => {
    data = null;
    render();
  });

  // Ctrl+V works anywhere on the page (see the page-level paste listener
  // below) -- this button is a visible, discoverable alternative that does
  // the same clipboard read on click, for anyone who doesn't know the
  // keyboard shortcut exists or would rather click something.
  pasteBtn?.addEventListener('click', async () => {
    if (!navigator.clipboard?.read) {
      onError?.(new Error("This browser doesn't support reading images via the Paste button — use Ctrl+V instead."));
      return;
    }
    try {
      const clipboardItems = await navigator.clipboard.read();
      const item = clipboardItems.find((ci) => ci.types.some((t) => t.startsWith('image/')));
      if (!item) {
        onError?.(new Error('No image found on the clipboard — copy a screenshot first, then click Paste.'));
        return;
      }
      const type = item.types.find((t) => t.startsWith('image/'));
      const blob = await item.getType(type);
      await handleFile(new File([blob], 'pasted-image', { type }));
    } catch (err) {
      // Most browsers require an explicit, per-site "Clipboard" permission
      // grant for read-via-button (unlike a native Ctrl+V paste event, which
      // needs no permission at all) -- NotAllowedError means that grant was
      // never given or was denied, which Ctrl+V sidesteps entirely.
      const message = err?.name === 'NotAllowedError'
        ? "Clipboard permission was denied — check this site's permissions in your browser's address bar, or just use Ctrl+V instead."
        : "Couldn't read the clipboard — use Ctrl+V instead.";
      onError?.(new Error(message));
    }
  });

  render();

  return {
    get: () => data,
    handleFile,
    reset: (newInitial = null) => {
      data = newInitial;
      fileInput.value = '';
      render();
    },
  };
}

// A snip from Snipping Tool (or any screenshot tool) lands on the clipboard
// as image data with no accompanying text, so Ctrl+V anywhere on the page
// is unambiguous -- if there's an image on the clipboard, it's for whichever
// screenshot field is currently relevant, and we don't touch normal text
// paste at all (that clipboard has no image item, so this just returns).
document.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  const imageItem = [...items].find((item) => item.type.startsWith('image/'));
  if (!imageItem) return;

  const target = !modal.classList.contains('hidden')
    ? currentModalScreenshot
    : document.getElementById('view-add').classList.contains('active')
      ? addScreenshot
      : null;
  if (!target) return;

  e.preventDefault();
  target.handleFile(imageItem.getAsFile());
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

document.getElementById('settings-icon-btn').addEventListener('click', () => switchToView('settings'));

// ---------- Backup / Restore ----------
// fetch + Blob + a programmatic <a download> click, rather than a plain
// window.location.href navigation to the endpoint. A raw navigation to a
// Content-Disposition: attachment response is the "normal" way to do this
// and works in an ordinary browser, but in this app's embedded preview
// environment that navigation gets silently killed (net::ERR_ABORTED,
// confirmed directly against network logs) -- the fetch+blob route doesn't
// go through the same code path and completes cleanly there instead.
// `transform`, if given, receives the parsed JSON body and returns what
// actually gets written to the downloaded file -- used below to merge the
// localStorage profile/settings into the export without a second copy of
// the blob/anchor download mechanics.
async function downloadFromApi(url, fallbackFilename, transform) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Export failed (${res.status})`);

  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : fallbackFilename;

  const blob = transform
    ? new Blob([JSON.stringify(await transform(await res.json()), null, 2)], { type: 'application/json' })
    : await res.blob();

  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

// The parts of "who's using this app" that only ever lived in localStorage
// (see [[project_tech_stack]] -- deliberately not real auth, no server
// account). Folded into the JSON export/import so restoring a backup also
// brings back your name, photo, theme, and currency setup, not just the
// trade data -- not part of the CSV export, which is trades-only by design.
const SETTINGS_KEYS = ['displayName', 'profilePicture', 'appTheme', 'defaultCurrency', 'displayMode', 'solPrices', 'portfolioSol', 'onboardingComplete'];

function readSettingsForExport() {
  const settings = {};
  for (const key of SETTINGS_KEYS) {
    const value = localStorage.getItem(key);
    if (value != null) settings[key] = value;
  }
  return settings;
}

document.getElementById('settings-export-btn').addEventListener('click', async () => {
  const statusEl = document.getElementById('settings-backup-status');
  try {
    await downloadFromApi('/api/backup/export', 'trenching-journal-backup.json', async (payload) => {
      payload.settings = readSettingsForExport();
      return payload;
    });
    statusEl.textContent = '';
    statusEl.className = 'status-msg';
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = 'status-msg error';
  }
});

document.getElementById('settings-export-csv-btn').addEventListener('click', async () => {
  const statusEl = document.getElementById('settings-backup-status');
  try {
    await downloadFromApi('/api/backup/export-csv', 'trenching-journal-trades.csv');
    statusEl.textContent = '';
    statusEl.className = 'status-msg';
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = 'status-msg error';
  }
});

document.getElementById('settings-import-btn').addEventListener('click', () => {
  document.getElementById('settings-import-file').click();
});

// Parses CSV text written in the same quoting style the export uses
// (RFC-4180-ish: a field with a comma/quote/newline is wrapped in quotes,
// an internal quote doubles up). A plain text.split(',') would corrupt any
// thesis/lesson text that happens to contain a comma or a line break, which
// is common in these fields, so this is a real small state-machine parser
// rather than a shortcut.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else { inQuotes = false; }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') { inQuotes = true; continue; }
    if (char === ',') { row.push(field); field = ''; continue; }
    if (char === '\r') continue;
    if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += char;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  if (rows.length === 0) return [];

  const headers = rows[0];
  return rows
    .slice(1)
    .filter((r) => r.length > 1 || r[0] !== '')
    .map((r) => Object.fromEntries(headers.map((h, idx) => [h, r[idx] ?? ''])));
}

// The CSV export's numeric columns come back as plain strings and its
// pnl_amount/pnl_percent columns aren't real trade columns at all (they're
// computed on read, same as everywhere else in the app) -- those get sent
// along harmlessly anyway since the import route only ever inserts columns
// that actually exist in the schema. An empty string means "no value", not
// literally the text "", so that becomes null rather than a blank string
// landing in a REAL/numeric column.
const CSV_NUMERIC_FIELDS = ['id', 'entry_price', 'entry_mcap', 'exit_price', 'exit_mcap', 'amount_invested', 'percent_risked', 'fees'];

function csvRowToTrade(row) {
  const trade = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === '') { trade[key] = null; continue; }
    trade[key] = CSV_NUMERIC_FIELDS.includes(key) ? Number(value) : value;
  }
  return trade;
}

document.getElementById('settings-import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  const statusEl = document.getElementById('settings-backup-status');
  const isCsv = file.name.toLowerCase().endsWith('.csv');
  const confirmMsg = isCsv
    ? 'Importing will replace every trade currently in this app with the trades from this CSV file. Journal entries and wallets are untouched (the CSV export never included them). This cannot be undone. Continue?'
    : 'Importing will replace every trade, journal entry, and wallet currently in this app with the data from this file -- along with your name, photo, theme, and currency settings, if the file has them. This cannot be undone. Continue?';
  if (!confirm(confirmMsg)) return;

  statusEl.textContent = 'Importing…';
  statusEl.className = 'status-msg';
  try {
    const payload = isCsv
      ? { trades: parseCsv(await file.text()).map(csvRowToTrade) }
      : JSON.parse(await file.text());
    const result = await api('/api/backup/import', { method: 'POST', body: JSON.stringify(payload) });

    let restoredSettings = false;
    if (payload.settings && typeof payload.settings === 'object') {
      for (const key of SETTINGS_KEYS) {
        if (payload.settings[key] != null) localStorage.setItem(key, payload.settings[key]);
      }
      restoredSettings = true;
    }

    const parts = [];
    if (result.tradesImported != null) parts.push(`${result.tradesImported} trades`);
    if (result.journalEntriesImported != null) parts.push(`${result.journalEntriesImported} journal entries`);
    if (result.walletsImported != null) parts.push(`${result.walletsImported} wallets`);
    if (restoredSettings) parts.push('profile settings');
    statusEl.textContent = `Imported ${parts.join(', ')}. Reloading…`;
    statusEl.classList.add('success');
    // Full reload rather than patching the UI in place -- theme in
    // particular only applies at initial page load (see the inline
    // flash-prevention script in index.html's <head>), so a reload is the
    // one reliable way to make every part of the page reflect an import
    // that can change trades, journal, wallets, AND the profile all at once.
    await new Promise((r) => setTimeout(r, 500));
    location.reload();
  } catch (err) {
    statusEl.textContent = err instanceof SyntaxError ? "That file isn't valid JSON — is it a Trenching Journal export?" : err.message;
    statusEl.classList.add('error');
  }
});

// ---------- Wallets ----------
// A reference list only -- no balances, no link to trades. Loaded once on
// script init (Settings has no dedicated switchToView load hook the way the
// other tabs do, since it's not gated behind an async fetch anywhere else).
async function loadWallets() {
  const listEl = document.getElementById('wallets-list');
  try {
    const wallets = await api('/api/wallets');
    listEl.innerHTML = wallets.length
      ? wallets
          .map(
            (w) => `
              <div class="wallet-row">
                <span class="wallet-row-name">${escapeHtml(w.name)}</span>
                <span class="wallet-row-address">${escapeHtml(w.address)}</span>
                <button type="button" class="icon-btn-sm wallet-remove-btn" data-id="${w.id}" aria-label="Remove wallet" title="Remove">&times;</button>
              </div>
            `
          )
          .join('')
      : '<p class="hint">No wallets added yet.</p>';
    listEl.querySelectorAll('.wallet-remove-btn').forEach((btn) => {
      btn.addEventListener('click', () => deleteWallet(btn.dataset.id));
    });
  } catch (err) {
    listEl.innerHTML = `<p class="status-msg error">Couldn't load wallets: ${escapeHtml(err.message)}</p>`;
  }
}

async function deleteWallet(id) {
  if (!confirm('Remove this wallet from the list?')) return;
  await api(`/api/wallets/${id}`, { method: 'DELETE' });
  loadWallets();
}

document.getElementById('wallet-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById('wallet-status');
  statusEl.textContent = '';
  statusEl.className = 'status-msg';
  try {
    await api('/api/wallets', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('wallet-name').value,
        address: document.getElementById('wallet-address').value,
      }),
    });
    document.getElementById('wallet-form').reset();
    loadWallets();
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.classList.add('error');
  }
});

loadWallets();

// ---------- Reset Everything ----------
// A full factory reset -- every trade, journal entry, and wallet, plus the
// whole localStorage personalization layer (name, photo, theme, currency).
// Uses an in-app modal rather than window.prompt()/confirm() -- this app's
// embedded browser environment doesn't support native prompt() at all (it
// throws), and a real modal reads more clearly as "an action, not page
// text" anyway. Gated behind typing the word "RESET" (the confirm button
// stays disabled until it matches exactly) since this has no undo.
const resetModal = document.getElementById('reset-modal');
const resetConfirmInput = document.getElementById('reset-confirm-input');
const resetConfirmBtn = document.getElementById('reset-confirm-btn');
const resetStatusEl = document.getElementById('settings-reset-status');

function openResetModal() {
  resetConfirmInput.value = '';
  resetConfirmBtn.disabled = true;
  resetStatusEl.textContent = '';
  resetStatusEl.className = 'status-msg';
  resetModal.classList.remove('hidden');
  resetConfirmInput.focus();
}

function closeResetModal() {
  resetModal.classList.add('hidden');
}

document.getElementById('settings-reset-btn').addEventListener('click', openResetModal);
document.getElementById('reset-modal-close').addEventListener('click', closeResetModal);
document.getElementById('reset-cancel-btn').addEventListener('click', closeResetModal);
resetModal.addEventListener('click', (e) => { if (e.target === resetModal) closeResetModal(); });

resetConfirmInput.addEventListener('input', () => {
  resetConfirmBtn.disabled = resetConfirmInput.value !== 'RESET';
});

resetConfirmBtn.addEventListener('click', async () => {
  if (resetConfirmInput.value !== 'RESET') return;

  resetStatusEl.textContent = 'Resetting…';
  resetStatusEl.className = 'status-msg';
  try {
    await api('/api/backup/reset', { method: 'POST' });
    localStorage.clear();
    location.reload();
  } catch (err) {
    resetStatusEl.textContent = err.message;
    resetStatusEl.classList.add('error');
  }
});

document.getElementById('account-widget').addEventListener('click', () => switchToView('settings'));

// ---------- Guided tour ----------
// A lightweight spotlight tour over real elements on the Today screen, rather
// than a separate slideshow -- each step highlights the actual button
// (boosting its z-index above the dimmed backdrop, no clip-path/SVG mask
// needed) and points a callout at it.
const TOUR_STEPS = [
  { selector: '#hamburger-btn', text: 'Tap here to open the menu and jump to any section of the app.' },
  { selector: '.today-actions', text: "Your home base: log a trade or open today's journal, and see what to focus on below." },
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
  window.location.href = `mailto:feedback@example.com?subject=${encodeURIComponent('Trenching Journal feedback')}`;
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

// Portfolio size: saved as you type (like the display name), and the Log
// Trade form re-derives "% risked" from it straight away.
const settingsPortfolioInput = document.getElementById('settings-portfolio');
settingsPortfolioInput.value = localStorage.getItem('portfolioSol') || '';
settingsPortfolioInput.addEventListener('input', () => {
  const size = Number(settingsPortfolioInput.value);
  if (size > 0) localStorage.setItem('portfolioSol', String(size));
  else localStorage.removeItem('portfolioSol');
  refreshPercentRisked();
});

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

// Fetches SOL's current price once (from DexScreener, converted into every
// supported currency server-side) and fills in solPrices for all of them at
// once -- SOL barely moves minute-to-minute, so this doesn't need to be a
// live feed, just a one-click way to avoid typing a rate in by hand.
// Shared by the Settings "Auto-fetch" button and the silent on-load fetch
// below -- `silent` skips the status-message UI for the on-load case, since
// a background refresh failing (e.g. offline) shouldn't greet the user with
// an error message before they've done anything.
async function fetchAndApplySolPrice({ silent } = {}) {
  const statusEl = document.getElementById('settings-sol-price-status');
  if (!silent) {
    statusEl.textContent = 'Fetching SOL price…';
    statusEl.className = 'status-msg';
  }
  try {
    const prices = await api('/api/solprice');
    solPrices = { ...solPrices, ...prices };
    localStorage.setItem('solPrices', JSON.stringify(solPrices));
    updateCurrencyPriceField();
    if (!silent) {
      statusEl.textContent = `Fetched — 1 SOL = ${CURRENCY_SYMBOLS.usd}${prices.usd.toFixed(2)} (and set for every currency above).`;
      statusEl.classList.add('success');
    }
    window.dispatchEvent(new Event('currencychange'));
  } catch (err) {
    if (!silent) {
      statusEl.textContent = err.message;
      statusEl.classList.add('error');
    }
  }
}

document.getElementById('settings-sol-price-fetch').addEventListener('click', () => fetchAndApplySolPrice());

// Refresh the SOL price automatically once whenever the app is opened,
// rather than requiring a manual click every time -- SOL doesn't move
// enough minute-to-minute for this to need to be more frequent than that.
fetchAndApplySolPrice({ silent: true });

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
