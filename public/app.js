const GRADE_GUIDE = [
  ['A', 'Followed your thesis and plan, regardless of outcome.'],
  ['B', 'Mostly followed your plan, with a minor deviation (e.g. sized slightly off, exited a bit early/late).'],
  ['C', 'Real plan violations — ignored a rule, chased price, or exited on emotion.'],
  ['D', 'Fully random or FOMO entry, no real thesis, no plan followed.'],
];

const EMOTIONAL_LABELS = { calm: 'Calm', excited: 'Excited', anxious: 'Anxious', bored: 'Bored', fomo: 'FOMO' };
const FOLLOWED_PLAN_LABELS = { yes: 'Yes', partially: 'Partially', no: 'No' };

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

function fmtSol(n) {
  if (n == null) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(3)} SOL`;
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

// ---------- Add Trade form ----------
const addForm = document.getElementById('add-trade-form');
const addStatus = document.getElementById('add-trade-status');

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  addStatus.textContent = '';
  addStatus.className = 'status-msg';

  const fd = new FormData(addForm);
  const body = {
    coin_name: fd.get('coin_name'),
    entry_price: fd.get('entry_price') ? Number(fd.get('entry_price')) : null,
    entry_mcap: fd.get('entry_mcap') ? Number(fd.get('entry_mcap')) : null,
    amount_invested: Number(fd.get('amount_invested')),
    percent_risked: Number(fd.get('percent_risked')),
    emotional_state: fd.get('emotional_state'),
    thesis: fd.get('thesis') || null,
  };

  try {
    await api('/api/trades', { method: 'POST', body: JSON.stringify(body) });
    addStatus.textContent = 'Trade logged.';
    addStatus.classList.add('success');
    addForm.reset();
  } catch (err) {
    addStatus.textContent = err.message;
    addStatus.classList.add('error');
  }
});

// ---------- Trade List ----------
const tradeListEl = document.getElementById('trade-list');

async function loadTradeList() {
  const from = document.getElementById('filter-from').value;
  const to = document.getElementById('filter-to').value;
  const grade = document.getElementById('filter-grade').value;

  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (grade) params.set('grade', grade);

  const trades = await api(`/api/trades?${params.toString()}`);
  tradeListEl.innerHTML = '';

  if (trades.length === 0) {
    tradeListEl.innerHTML = '<p class="hint">No trades match these filters.</p>';
    return;
  }

  trades.forEach((t) => {
    const card = document.createElement('div');
    card.className = 'trade-card';
    const date = (t.closed_at || t.created_at).slice(0, 10);
    card.innerHTML = `
      <div class="trade-card-top">
        <span class="coin">${escapeHtml(t.coin_name)}
          <span class="badge status-${t.status}">${t.status}</span>
          ${t.grade ? `<span class="badge">${t.grade}</span>` : ''}
        </span>
        <span class="${pnlClass(t.pnl_amount)}">${fmtSol(t.pnl_amount)} (${fmtPct(t.pnl_percent)})</span>
      </div>
      <div class="trade-card-meta">${date} · ${t.percent_risked}% risked · ${EMOTIONAL_LABELS[t.emotional_state] || t.emotional_state}</div>
    `;
    card.addEventListener('click', () => openTradeModal(t.id));
    tradeListEl.appendChild(card);
  });
}

document.getElementById('apply-filters').addEventListener('click', loadTradeList);
document.getElementById('clear-filters').addEventListener('click', () => {
  document.getElementById('filter-from').value = '';
  document.getElementById('filter-to').value = '';
  document.getElementById('filter-grade').value = '';
  loadTradeList();
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Trade detail / close modal ----------
const modal = document.getElementById('trade-modal');
const modalBody = document.getElementById('modal-body');

document.getElementById('modal-close').addEventListener('click', () => modal.classList.add('hidden'));
modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

async function openTradeModal(id) {
  const t = await api(`/api/trades/${id}`);
  const gradeGuideHtml = GRADE_GUIDE.map(([g, desc]) => `<div><b>${g}</b> — ${desc}</div>`).join('');

  modalBody.innerHTML = `
    <h2>${escapeHtml(t.coin_name)}</h2>
    <p class="hint">Logged ${t.created_at.slice(0, 16).replace('T', ' ')} · Status: ${t.status}</p>

    <div class="field-row">
      <div class="field"><label>Exit price</label><input type="number" step="any" id="m-exit_price" value="${t.exit_price ?? ''}"></div>
      <div class="field"><label>Exit market cap</label><input type="number" step="any" id="m-exit_mcap" value="${t.exit_mcap ?? ''}"></div>
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

    <div class="grade-guide">${gradeGuideHtml}</div>

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

  function gatherFields() {
    return {
      exit_price: document.getElementById('m-exit_price').value ? Number(document.getElementById('m-exit_price').value) : null,
      exit_mcap: document.getElementById('m-exit_mcap').value ? Number(document.getElementById('m-exit_mcap').value) : null,
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
  const trades = await api('/api/trades');
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

document.getElementById('cal-prev').addEventListener('click', () => {
  calCursor.setMonth(calCursor.getMonth() - 1);
  loadCalendar();
});
document.getElementById('cal-next').addEventListener('click', () => {
  calCursor.setMonth(calCursor.getMonth() + 1);
  loadCalendar();
});

async function loadCalendar() {
  const year = calCursor.getFullYear();
  const month = calCursor.getMonth(); // 0-indexed

  document.getElementById('cal-month-label').textContent = calCursor.toLocaleString('default', { month: 'long', year: 'numeric' });

  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const trades = await api(`/api/trades?from=${from}&to=${to}`);
  const closed = trades.filter((t) => t.status === 'closed');

  const byDay = {};
  closed.forEach((t) => {
    const day = (t.closed_at || t.created_at).slice(0, 10);
    byDay[day] = (byDay[day] || 0) + (t.pnl_amount || 0);
  });

  const monthTotal = Object.values(byDay).reduce((a, b) => a + b, 0);
  const monthTotalEl = document.getElementById('cal-month-total');
  monthTotalEl.textContent = `Month total: ${fmtSol(monthTotal)}`;
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
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const pnl = byDay[dateStr];
    const cell = document.createElement('div');
    cell.className = `cal-cell ${pnl == null ? 'no-trades' : pnlClass(pnl)}`;
    cell.innerHTML = `<span class="day-num">${day}</span>${pnl != null ? `<span class="day-pnl">${fmtSol(pnl)}</span>` : ''}`;
    grid.appendChild(cell);
  }
}

// initial load
loadTradeList();
