const today = new Date().toISOString().slice(0, 10);
let currentMonth = today.slice(0, 7);
let activeTab = 'home';
let searchQuery = '';
let searchTimer = null;
let latestSummary = null;
let latestTrend = null;
let categoryChart = null;
let trendChart = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function yen(value) {
  return `¥${Math.abs(Number(value) || 0).toLocaleString('ja-JP')}`;
}

function signedYen(value, type) {
  const sign = type === 'income' ? '+' : '−';
  return `${sign}${yen(value)}`;
}

function balanceYen(value) {
  return `${value < 0 ? '−' : ''}${yen(value)}`;
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

async function apiFetch(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response;
}

function applyTheme(theme, redraw = true) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('theme', theme);
  $('#theme-toggle').textContent = theme === 'dark' ? 'ライトにする' : 'ダークにする';
  if (redraw) {
    destroyCharts();
    renderCharts();
  }
}

function initTheme() {
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (prefersDark ? 'dark' : 'light'), false);
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
}

function destroyCharts() {
  if (trendChart) trendChart.destroy();
  if (categoryChart) categoryChart.destroy();
  trendChart = null;
  categoryChart = null;
}

function monthLabel(month) {
  const [year, monthNum] = month.split('-');
  return `${year}年${monthNum}月`;
}

function updateMonthLabels() {
  const label = monthLabel(currentMonth);
  $('#month-label').textContent = label;
  $('#page-month').textContent = label;
  $('#records-page-month').textContent = label;
  $('#month').value = currentMonth;
  $('#export-csv').href = `/api/export.csv?month=${currentMonth}`;
  $('#export-csv-settings').href = `/api/export.csv?month=${currentMonth}`;
}

function openMonthPicker() {
  const input = $('#month');
  input.showPicker?.() ?? input.click();
}

function switchTab(tab) {
  activeTab = tab;
  $$('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `tab-${tab}`));
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.tab === tab));
  if (tab === 'records') refreshRecords();
}

function setAddForm(open) {
  $('#add-card').hidden = !open;
  $('#open-add-form').setAttribute('aria-expanded', String(open));
}

function resetAddForm() {
  const form = $('#record-form');
  form.reset();
  form.elements.type.value = 'expense';
  $('#date-input').value = today;
  $$('.type-btn').forEach((button) => button.classList.toggle('active', button.dataset.type === 'expense'));
}

function payloadFromForm(form) {
  const fd = new FormData(form);
  return {
    date: fd.get('date') || today,
    type: fd.get('type'),
    category: String(fd.get('category') || '').trim(),
    amount: parseInt(fd.get('amount'), 10),
    note: String(fd.get('note') || '').trim(),
  };
}

async function refresh() {
  try {
    const [summary, trend] = await Promise.all([
      apiFetch(`/api/summary?month=${encodeURIComponent(currentMonth)}`).then((r) => r.json()),
      apiFetch('/api/trend?months=6').then((r) => r.json()),
    ]);
    latestSummary = summary;
    latestTrend = trend;
    renderSummary(summary);
    renderBudgets(summary.budgets || []);
    renderCharts();
    await refreshRecords();
  } catch (error) {
    alert(`通信エラー: ${error.message}`);
  }
}

async function refreshRecords() {
  try {
    const params = new URLSearchParams({ month: currentMonth });
    if (searchQuery) params.set('q', searchQuery);
    const records = await apiFetch(`/api/records?${params}`).then((r) => r.json());
    renderRecords($('#records-container'), records, activeTab === 'home' ? 8 : null);
    renderRecords($('#all-records-container'), records, null);
  } catch (error) {
    alert(`通信エラー: ${error.message}`);
  }
}

function pctDelta(current, previous) {
  if (previous == null || previous === 0) return '';
  const pct = Math.round(((current - previous) / Math.abs(previous)) * 100);
  return `前月比 ${pct > 0 ? '+' : ''}${pct}%`;
}

function renderSummary(summary) {
  $('#income-total').textContent = yen(summary.income);
  $('#expense-total').textContent = yen(summary.expense);
  $('#balance-total').textContent = balanceYen(summary.balance);
  $('.balance-card').classList.toggle('negative', summary.balance < 0);

  const previous = summary.previous || {};
  $('#income-delta').textContent = pctDelta(summary.income, previous.income);
  $('#expense-delta').textContent = pctDelta(summary.expense, previous.expense);
  $('#balance-delta').textContent = pctDelta(summary.balance, previous.balance);
}

function renderBudgets(budgets) {
  const list = $('#budget-list');
  if (!budgets.length) {
    list.innerHTML = '<p class="empty-msg">予算が設定されていません。編集から追加してください。</p>';
    return;
  }
  list.innerHTML = budgets.map((budget) => {
    const percent = Math.min(Number(budget.percent) || 0, 100);
    const level = budget.percent >= 100 ? 'over' : budget.percent >= 80 ? 'warn' : '';
    return `
      <div class="budget-row">
        <div class="budget-meta">
          <strong>${escapeHtml(budget.category)}</strong>
          <span>${yen(budget.spent)} / ${yen(budget.budget)} (${budget.percent}%)</span>
        </div>
        <div class="progress"><div class="progress-bar ${level}" style="width:${percent}%"></div></div>
      </div>`;
  }).join('');
}

const categoryColors = ['--cat-blue', '--cat-purple', '--cat-teal', '--cat-orange', '--expense', '--income'];

function renderCharts() {
  renderTrendChart(latestTrend || []);
  renderCategoryChart(latestSummary?.by_category || []);
}

function renderTrendChart(trend) {
  const canvas = $('#trend-chart');
  const empty = $('#trend-empty');
  if (trendChart) trendChart.destroy();
  trendChart = null;

  if (!trend.length) {
    canvas.style.display = 'none';
    empty.hidden = false;
    return;
  }

  canvas.style.display = '';
  empty.hidden = true;
  trendChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: trend.map((item) => `${parseInt(item.month.split('-')[1], 10)}月`),
      datasets: [
        {
          label: '収入',
          data: trend.map((item) => item.income),
          backgroundColor: cssVar('--bar-in'),
          borderRadius: 5,
          borderSkipped: false,
        },
        {
          label: '支出',
          data: trend.map((item) => item.expense),
          backgroundColor: cssVar('--bar-ex'),
          borderRadius: 5,
          borderSkipped: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${yen(ctx.raw)}` } },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: cssVar('--text-tert'), font: { family: "'Noto Sans JP', sans-serif", size: 11 } },
        },
        y: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: cssVar('--sep') },
          ticks: {
            color: cssVar('--text-tert'),
            maxTicksLimit: 4,
            font: { family: "'Noto Sans JP', sans-serif", size: 11 },
            callback: (value) => Number(value) >= 10000 ? `¥${Math.round(value / 1000)}k` : `¥${value}`,
          },
        },
      },
    },
  });
}

function renderCategoryChart(byCategory) {
  const canvas = $('#category-chart');
  const empty = $('#category-empty');
  if (categoryChart) categoryChart.destroy();
  categoryChart = null;

  if (!byCategory.length) {
    canvas.style.display = 'none';
    empty.hidden = false;
    return;
  }

  canvas.style.display = '';
  empty.hidden = true;
  categoryChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: byCategory.map((item) => item.category),
      datasets: [{
        data: byCategory.map((item) => item.amount),
        backgroundColor: byCategory.map((_, index) => cssVar(categoryColors[index % categoryColors.length])),
        borderColor: cssVar('--card-bg'),
        borderWidth: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: cssVar('--text-sec'),
            boxWidth: 10,
            padding: 10,
            font: { family: "'Noto Sans JP', sans-serif", size: 11 },
          },
        },
        tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${yen(ctx.raw)}` } },
      },
    },
  });
}

function iconForRecord(record) {
  const income = record.type === 'income';
  return {
    color: income ? cssVar('--income') : cssVar('--expense'),
    background: income ? cssVar('--income-bg') : cssVar('--expense-bg'),
    path: income
      ? 'M12 3v18M17 8.5A4 4 0 0 0 12 6a4 4 0 0 0 0 8 4 4 0 0 1 0 8 4 4 0 0 1-5-2.5'
      : 'M6 6h15l-2 8H8L6 3H3M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM18 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  };
}

function renderRecords(container, records, limit) {
  if (!container) return;
  const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));
  const visible = limit ? sorted.slice(0, limit) : sorted;

  if (!visible.length) {
    container.innerHTML = '<p class="empty-msg">記録がありません</p>';
    return;
  }

  container.innerHTML = `
    <div class="record-head">
      <span>日付</span><span>メモ</span><span>カテゴリ</span><span>金額</span><span>操作</span>
    </div>
    ${visible.map((record) => {
      const icon = iconForRecord(record);
      const typeClass = record.type === 'income' ? 'income' : 'expense';
      const pillBg = record.type === 'income' ? cssVar('--income-bg') : cssVar('--expense-bg');
      const pillColor = record.type === 'income' ? cssVar('--income') : cssVar('--expense');
      const title = record.note || record.category;
      return `
        <div class="record-row" data-record="${encodeURIComponent(JSON.stringify(record))}">
          <div class="record-date">${escapeHtml(record.date.slice(5).replace('-', '/'))}</div>
          <div class="record-memo">
            <div class="record-icon" style="background:${icon.background}">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="${icon.color}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${icon.path}"></path></svg>
            </div>
            <div class="record-title">${escapeHtml(title)}</div>
          </div>
          <div class="category-pill" style="background:${pillBg};color:${pillColor}">${escapeHtml(record.category)}</div>
          <div class="record-amount ${typeClass}">${signedYen(record.amount, record.type)}</div>
          <div class="record-actions">
            <button class="icon-btn btn-edit" type="button" data-index="${record.index}" aria-label="編集">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"></path></svg>
            </button>
            <button class="icon-btn btn-delete" type="button" data-index="${record.index}" aria-label="削除">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 15H6L5 6"></path></svg>
            </button>
          </div>
        </div>`;
    }).join('')}`;

  container.querySelectorAll('.btn-edit').forEach((button) => {
    button.addEventListener('click', () => {
      const row = button.closest('.record-row');
      openEditModal(JSON.parse(decodeURIComponent(row.dataset.record)));
    });
  });
  container.querySelectorAll('.btn-delete').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('この記録を削除しますか？')) return;
      try {
        await apiFetch(`/api/records/${button.dataset.index}`, { method: 'DELETE' });
        await refresh();
      } catch (error) {
        alert(`通信エラー: ${error.message}`);
      }
    });
  });
}

function openEditModal(record) {
  const form = $('#edit-form');
  form.elements.index.value = record.index;
  form.elements.date.value = record.date;
  form.elements.type.value = record.type;
  form.elements.category.value = record.category;
  form.elements.amount.value = record.amount;
  form.elements.note.value = record.note || '';
  $('#edit-modal').showModal();
}

async function openBudgetModal() {
  try {
    const budgets = await apiFetch('/api/budgets').then((r) => r.json());
    const entries = Object.entries(budgets);
    $('#budget-fields').innerHTML = '';
    if (!entries.length) addBudgetRow('', '');
    entries.forEach(([category, amount]) => addBudgetRow(category, amount));
    $('#budget-modal').showModal();
  } catch (error) {
    alert(`通信エラー: ${error.message}`);
  }
}

function addBudgetRow(category, amount) {
  const row = document.createElement('div');
  row.className = 'budget-field-row';
  row.innerHTML = `
    <input class="bcat" type="text" list="category-list" placeholder="カテゴリ" value="${escapeHtml(category)}">
    <input class="bamt" type="number" min="0" placeholder="月予算" value="${escapeHtml(String(amount))}">
    <button class="icon-btn" type="button" aria-label="削除">×</button>`;
  row.querySelector('button').addEventListener('click', () => row.remove());
  $('#budget-fields').appendChild(row);
}

function bindSearch(input) {
  input.addEventListener('input', (event) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = event.target.value.trim();
      $$('#home-search-input, #records-search-input').forEach((other) => {
        if (other !== event.target) other.value = event.target.value;
      });
      refreshRecords();
    }, 180);
  });
}

function bindEvents() {
  $('#theme-toggle').addEventListener('click', toggleTheme);
  $('#month-label').addEventListener('click', openMonthPicker);
  $('#month').addEventListener('change', (event) => {
    currentMonth = event.target.value || currentMonth;
    updateMonthLabels();
    refresh();
  });
  $$('.nav-item').forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.tab)));
  $('#open-add-form').addEventListener('click', () => setAddForm($('#add-card').hidden));
  $('#cancel-add-form').addEventListener('click', () => setAddForm(false));
  $$('.type-btn').forEach((button) => {
    button.addEventListener('click', () => {
      $('#record-form').elements.type.value = button.dataset.type;
      $$('.type-btn').forEach((item) => item.classList.toggle('active', item === button));
    });
  });
  $('#record-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await apiFetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadFromForm(event.currentTarget)),
      });
      resetAddForm();
      setAddForm(false);
      await refresh();
    } catch (error) {
      alert(`通信エラー: ${error.message}`);
    }
  });
  $('#edit-cancel').addEventListener('click', () => $('#edit-modal').close());
  $('#edit-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await apiFetch(`/api/records/${form.elements.index.value}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadFromForm(form)),
      });
      $('#edit-modal').close();
      await refresh();
    } catch (error) {
      alert(`通信エラー: ${error.message}`);
    }
  });
  $('#open-budget-modal').addEventListener('click', openBudgetModal);
  $('#budget-cancel').addEventListener('click', () => $('#budget-modal').close());
  $('#add-budget-row').addEventListener('click', () => addBudgetRow('', ''));
  $('#budget-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const budgets = {};
    $$('.budget-field-row').forEach((row) => {
      const category = row.querySelector('.bcat').value.trim();
      const amount = parseInt(row.querySelector('.bamt').value, 10);
      if (category && amount > 0) budgets[category] = amount;
    });
    try {
      await apiFetch('/api/budgets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budgets }),
      });
      $('#budget-modal').close();
      await refresh();
    } catch (error) {
      alert(`通信エラー: ${error.message}`);
    }
  });
  $$('#home-search-input, #records-search-input').forEach(bindSearch);
}

initTheme();
updateMonthLabels();
resetAddForm();
bindEvents();
refresh();
