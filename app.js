// ============================================================
//  CONTA PRA MIM — PWA v2.0
//  Método Breno Nogueira — Controle Financeiro Diário
// ============================================================
'use strict';

const STORE_KEY = 'contapramim_v2';

// ── Defaults ─────────────────────────────────────────────────
const DEFAULT_TAGS = [
  { id: 't1', name: 'Alimentação', emoji: '🍔', color: '#F97316' },
  { id: 't2', name: 'Transporte',  emoji: '🚗', color: '#3B82F6' },
  { id: 't3', name: 'Moradia',     emoji: '🏠', color: '#10B981' },
  { id: 't4', name: 'Saúde',       emoji: '💊', color: '#EF4444' },
  { id: 't5', name: 'Lazer',       emoji: '🎮', color: '#8B5CF6' },
  { id: 't6', name: 'Educação',    emoji: '📚', color: '#F59E0B' },
  { id: 't7', name: 'Salário',     emoji: '💰', color: '#059669' },
  { id: 't8', name: 'Outros',      emoji: '📦', color: '#6B7280' },
];

function getDefaultData() {
  return {
    transactions: [],
    tags: JSON.parse(JSON.stringify(DEFAULT_TAGS)),
    accounts: [{ id: 'a1', name: 'Conta Principal', color: '#F97316', balance: 0 }],
    settings: { dailyBudget: 50, currency: 'BRL', dividirPor: 30 },
    previsaoDiario: [
      { id: 'pre1', nome: 'Alimentação', tagId: 't1', valorMensal: 0 },
      { id: 'pre2', nome: 'Transporte',  tagId: 't2', valorMensal: 0 },
    ],
  };
}

// ── State ─────────────────────────────────────────────────────
let state = {
  data: getDefaultData(),
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear(),
  activeScreen: 'saldos',
  colMode: 'saidas',   // 'saidas'|'entradas'|'diarios'|'cartao'
  selectedType: 'saida', // 'saida'|'entrada'|'cartao'
  selectedTagId: null,
  editingId: null,
  dayDetailDate: null,
  recTipo: 'nvezes',   // 'nvezes'|'semfim'
};

// ── Persistence ───────────────────────────────────────────────
function saveData() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state.data)); }
  catch(e) { console.warn('storage error', e); }
}
function loadData() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) state.data = { ...getDefaultData(), ...JSON.parse(raw) };
  } catch(e) { state.data = getDefaultData(); }
}

// ── Helpers ───────────────────────────────────────────────────
const MONTHS_PT   = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MONTHS_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const WEEKDAYS    = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

const daysInMonth = (m, y) => new Date(y, m + 1, 0).getDate();

function formatBRL(val) {
  const abs = Math.abs(val);
  const s = abs.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (val < 0 ? '-' : '') + 'R$ ' + s;
}
function parseBRL(str) {
  if (!str) return 0;
  return parseFloat(str.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
}
const monthKey  = (m, y) => `${y}-${String(m+1).padStart(2,'0')}`;
const todayStr  = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const dateStr   = (y, m, d) => `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
const uniqueId  = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const getTag    = (id) => state.data.tags.find(t => t.id === id) || { emoji: '📦', name: 'Sem tag', color: '#6B7280' };

// ── Transaction Queries ───────────────────────────────────────
function getTxForMonth(m, y) {
  const key = monthKey(m, y);
  return state.data.transactions.filter(tx => tx.date.startsWith(key));
}
function getTxForDay(ds) {
  return state.data.transactions.filter(tx => tx.date === ds);
}

// ── Saldo Computation ─────────────────────────────────────────
function getInitialBalance(m, y) {
  const storedInit = state.data.transactions.find(tx =>
    tx.type === 'saldo_inicial' && tx.date === dateStr(y, m, 1)
  );
  if (storedInit) return storedInit.amount;
  const prevM = m === 0 ? 11 : m - 1;
  const prevY = m === 0 ? y - 1 : y;
  let saldo = 0;
  state.data.transactions
    .filter(tx => tx.date.startsWith(monthKey(prevM, prevY)))
    .forEach(tx => {
      if (tx.type === 'entrada') saldo += tx.amount;
      else if (tx.type === 'saida' || tx.type === 'cartao') saldo -= tx.amount;
    });
  return saldo;
}

function computeDaySaldos(m, y) {
  const result = {};
  let saldo = getInitialBalance(m, y);
  for (let d = 1; d <= daysInMonth(m, y); d++) {
    const ds = dateStr(y, m, d);
    const txs = getTxForDay(ds);
    let entradas = 0, saidas = 0, cartao = 0;
    txs.forEach(tx => {
      if (tx.type === 'entrada') entradas += tx.amount;
      else if (tx.type === 'saida') saidas += tx.amount;
      else if (tx.type === 'cartao') cartao += tx.amount;
    });
    saldo += entradas - saidas - cartao;
    result[ds] = { saldo, entradas, saidas, cartao, txs };
  }
  return result;
}

// Previsão Diário: calcula valor por dia baseado nos itens da tela de previsão
function getPrevisaoDiario() {
  const total = (state.data.previsaoDiario || []).reduce((s, p) => s + (p.valorMensal || 0), 0);
  const div = state.data.settings.dividirPor || 30;
  return div > 0 ? total / div : 0;
}

// ── Navigation ────────────────────────────────────────────────
function switchScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item[data-screen]').forEach(b => b.classList.remove('active'));
  const s = document.getElementById('screen-' + id);
  if (s) s.classList.add('active');
  const nb = document.querySelector(`.nav-item[data-screen="${id}"]`);
  if (nb) nb.classList.add('active');
  state.activeScreen = id;
  renderCurrentScreen();
}
function renderCurrentScreen() {
  switch (state.activeScreen) {
    case 'saldos':  renderSaldos(); break;
    case 'totais':  renderTotais(); break;
    case 'tags':    renderTags(); break;
    case 'menu':    renderMenu(); break;
  }
}

// ── RENDER: SALDOS ─────────────────────────────────────────────
function renderSaldos() {
  const { currentMonth: m, currentYear: y, colMode } = state;
  document.getElementById('monthLabel').textContent = `${MONTHS_PT[m]}/${String(y).slice(2)}`;
  updateColHeader();

  const days = daysInMonth(m, y);
  const daySaldos = computeDaySaldos(m, y);
  const previsaoDia = getPrevisaoDiario();
  const list = document.getElementById('daysList');
  const today = todayStr();
  list.innerHTML = '';

  for (let d = 1; d <= days; d++) {
    const ds = dateStr(y, m, d);
    const info = daySaldos[ds] || { saldo: 0, entradas: 0, saidas: 0, cartao: 0, txs: [] };
    const date = new Date(y, m, d);
    const weekday = WEEKDAYS[date.getDay()];
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const isToday = ds === today;
    const hasTx = info.txs.length > 0;
    const saldo = info.saldo;

    // Cor da linha
    let rowClass = 'day-row';
    if (isToday) rowClass += ' is-today';
    if (isWeekend) rowClass += ' is-weekend';
    if (saldo < 0) rowClass += ' saldo-negativo';
    else if (hasTx) rowClass += ' has-lancamento';

    // Dot indicator
    const hasS = info.saidas > 0 || info.cartao > 0;
    const hasE = info.entradas > 0;
    let dotClass = 'indicator-dot';
    if (hasS && hasE)   dotClass += ' has-both';
    else if (info.cartao > 0) dotClass += ' has-cartao';
    else if (hasS)      dotClass += ' has-saida';
    else if (hasE)      dotClass += ' has-entrada';

    // Valor da coluna do meio
    let midVal = 0, midClass = '';
    switch (colMode) {
      case 'saidas':   midVal = info.saidas;   midClass = midVal > 0 ? 'mid-saida' : ''; break;
      case 'entradas': midVal = info.entradas; midClass = midVal > 0 ? 'mid-entrada' : ''; break;
      case 'cartao':   midVal = info.cartao;   midClass = midVal > 0 ? 'mid-cartao' : ''; break;
      case 'diarios':  midVal = previsaoDia;   midClass = 'mid-diario'; break;
    }
    const midStr = midVal > 0 ? formatBRL(midVal) : 'R$ 0,00';

    const row = document.createElement('div');
    row.className = rowClass;
    row.innerHTML = `
      <div class="day-num-wrap">
        <span class="day-num">${d}</span>
        <span class="day-week">${weekday}</span>
      </div>
      <div class="day-indicator"><div class="${dotClass}"></div></div>
      <div class="day-mid ${midClass}">${midStr}</div>
      <div class="day-saldo ${saldo > 0 ? 'positivo' : saldo < 0 ? 'negativo' : 'zero'}">${formatBRL(saldo)}</div>`;
    row.addEventListener('click', () => openDayDetail(ds, d));
    list.appendChild(row);
  }

  // Scroll para hoje
  if (m === new Date().getMonth() && y === new Date().getFullYear()) {
    setTimeout(() => {
      const row = list.children[new Date().getDate() - 1];
      if (row) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 80);
  }
}

function updateColHeader() {
  const { colMode } = state;
  const dot = document.getElementById('colMidDot');
  const label = document.getElementById('colMidLabel');
  const colors = { saidas: 'var(--red)', entradas: 'var(--green)', diarios: 'var(--accent)', cartao: 'var(--purple)' };
  const labels = { saidas: 'Saídas', entradas: 'Entradas', diarios: 'Diários', cartao: 'Cartão' };
  if (dot) dot.style.background = colors[colMode] || 'var(--gray-400)';
  if (label) label.textContent = labels[colMode] || colMode;
}

// ── RENDER: TOTAIS ─────────────────────────────────────────────
function renderTotais() {
  const { currentMonth: m, currentYear: y } = state;
  document.getElementById('monthLabelTotais').textContent = `${MONTHS_PT[m]}/${String(y).slice(2)}`;
  const txs = getTxForMonth(m, y);
  let totalE = 0, totalS = 0, totalC = 0;
  txs.forEach(tx => {
    if (tx.type === 'entrada') totalE += tx.amount;
    else if (tx.type === 'saida') totalS += tx.amount;
    else if (tx.type === 'cartao') totalC += tx.amount;
  });
  const totalSaidas = totalS + totalC;
  const saldoFinal = getInitialBalance(m, y) + totalE - totalSaidas;
  const mediaDiaria = totalSaidas / daysInMonth(m, y);

  const byCat = {};
  txs.filter(tx => tx.type === 'saida' || tx.type === 'cartao').forEach(tx => {
    const tid = tx.tagId || 't8';
    byCat[tid] = (byCat[tid] || 0) + tx.amount;
  });

  document.getElementById('totaisContent').innerHTML = `
    <div class="totais-big" style="background:${saldoFinal >= 0 ? 'var(--accent)' : 'var(--red)'}">
      <div class="totais-big-label">Saldo acumulado</div>
      <div class="totais-big-value">${formatBRL(saldoFinal)}</div>
    </div>
    <div class="totais-card">
      <div class="totais-card-header">Resumo do mês</div>
      <div class="totais-row"><span class="totais-row-label">Entradas</span><span class="totais-row-value green">${formatBRL(totalE)}</span></div>
      <div class="totais-row"><span class="totais-row-label">Saídas</span><span class="totais-row-value red">${formatBRL(totalS)}</span></div>
      <div class="totais-row"><span class="totais-row-label">Cartão</span><span class="totais-row-value purple">${formatBRL(totalC)}</span></div>
      <div class="totais-row"><span class="totais-row-label">Total de gastos</span><span class="totais-row-value red">${formatBRL(totalSaidas)}</span></div>
      <div class="totais-row"><span class="totais-row-label">Média diária</span><span class="totais-row-value accent">${formatBRL(mediaDiaria)}</span></div>
      <div class="totais-row"><span class="totais-row-label">Previsão diário</span><span class="totais-row-value">${formatBRL(getPrevisaoDiario())}</span></div>
    </div>
    ${Object.keys(byCat).length > 0 ? `
    <div class="totais-card">
      <div class="totais-card-header">Por Tag</div>
      ${Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([tid, val]) => {
        const tag = getTag(tid);
        const pct = totalSaidas > 0 ? Math.round(val/totalSaidas*100) : 0;
        return `<div class="tag-spending-row">
          <div class="tag-color-dot" style="background:${tag.color}"></div>
          <span class="tag-spending-name">${tag.emoji} ${tag.name}</span>
          <span class="tag-spending-pct">${pct}%</span>
          <span class="tag-spending-val">${formatBRL(val)}</span>
        </div>`;
      }).join('')}
    </div>` : ''}`;
}

// ── RENDER: TAGS ───────────────────────────────────────────────
function renderTags() {
  const list = document.getElementById('tagsList');
  if (!state.data.tags.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">🏷️</div><div class="empty-text">Nenhuma tag criada</div></div>`;
    return;
  }
  list.innerHTML = state.data.tags.map(tag => `
    <div class="tag-item">
      <div class="tag-emoji" style="background:${tag.color}20">${tag.emoji}</div>
      <span class="tag-name">${tag.name}</span>
      <span class="tag-count">${state.data.transactions.filter(tx=>tx.tagId===tag.id).length}</span>
      <button class="tag-delete" data-id="${tag.id}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>
      </button>
    </div>`).join('');
  list.querySelectorAll('.tag-delete').forEach(btn =>
    btn.addEventListener('click', e => { e.stopPropagation(); deleteTag(btn.dataset.id); })
  );
}
function deleteTag(id) {
  if (confirm('Excluir essa tag?')) {
    state.data.tags = state.data.tags.filter(t => t.id !== id);
    saveData(); renderTags();
  }
}

// ── RENDER: MENU ───────────────────────────────────────────────
function renderMenu() {
  document.getElementById('menuContent').innerHTML = `
    <div class="menu-section">
      <div class="menu-section-title">Planejamento</div>
      <div class="menu-row" id="menuPrevisao">
        <span class="menu-row-icon">📅</span>
        <span class="menu-row-label">Previsão de diário</span>
        <span class="menu-row-value">${formatBRL(getPrevisaoDiario())}/dia</span>
        <span class="menu-row-arrow">›</span>
      </div>
      <div class="menu-row" id="menuHorizonte">
        <span class="menu-row-icon">📊</span>
        <span class="menu-row-label">Horizonte de saldos</span>
        <span class="menu-row-arrow">›</span>
      </div>
    </div>
    <div class="menu-section">
      <div class="menu-section-title">Orçamento</div>
      <div class="menu-field-inline">
        <label for="menuDailyBudget">Valor diário livre (R$)</label>
        <input type="number" id="menuDailyBudget" value="${state.data.settings.dailyBudget}" min="0" step="0.01">
      </div>
      <div class="menu-field-inline">
        <label for="menuDividirPor">Dividir por (dias)</label>
        <input type="number" id="menuDividirPor" value="${state.data.settings.dividirPor}" min="1" max="31">
      </div>
    </div>
    <div class="menu-section">
      <div class="menu-section-title">Dados</div>
      <div class="menu-row" id="menuExport">
        <span class="menu-row-icon">⬇️</span>
        <span class="menu-row-label">Exportar dados (JSON)</span>
        <span class="menu-row-arrow">›</span>
      </div>
      <div class="menu-row" id="menuClear">
        <span class="menu-row-icon" style="color:#E53E3E">🗑️</span>
        <span class="menu-row-label" style="color:#E53E3E">Apagar todos os dados</span>
      </div>
    </div>
    <div class="menu-section">
      <div class="menu-row"><span class="menu-row-icon">📱</span><span class="menu-row-label">Conta Pra Mim</span><span class="menu-row-value">v2.0</span></div>
      <div class="menu-row"><span class="menu-row-icon">💡</span><span class="menu-row-label">Método Breno Nogueira</span></div>
    </div>`;

  document.getElementById('menuPrevisao').onclick = () => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-previsao').classList.add('active');
    renderPrevisao();
  };
  document.getElementById('menuHorizonte').onclick = () => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-horizonte').classList.add('active');
    renderHorizonte();
  };
  document.getElementById('menuDailyBudget').onchange = e => {
    state.data.settings.dailyBudget = parseFloat(e.target.value) || 0; saveData();
  };
  document.getElementById('menuDividirPor').onchange = e => {
    state.data.settings.dividirPor = parseInt(e.target.value) || 30; saveData();
  };
  document.getElementById('menuExport').onclick = () => {
    const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'contapramim_backup.json'; a.click();
  };
  document.getElementById('menuClear').onclick = () => {
    if (confirm('⚠️ Apagar TODOS os dados? Não pode ser desfeito.')) {
      state.data = getDefaultData(); saveData(); renderCurrentScreen();
    }
  };
}

// ── RENDER: PREVISÃO DE DIÁRIO ─────────────────────────────────
function renderPrevisao() {
  const items = state.data.previsaoDiario || [];
  const total = items.reduce((s, p) => s + (p.valorMensal || 0), 0);
  const div = state.data.settings.dividirPor || 30;
  const diario = div > 0 ? total / div : 0;

  document.getElementById('previsaoContent').innerHTML = `
    <div class="previsao-list" id="previsaoList">
      ${items.map(item => {
        const tag = getTag(item.tagId);
        return `<div class="previsao-item" data-id="${item.id}">
          <div class="previsao-icon" style="background:${tag.color}20">${tag.emoji}</div>
          <div class="previsao-info">
            <div class="previsao-nome">${item.nome || tag.name}</div>
          </div>
          <input type="number" class="previsao-valor" data-id="${item.id}"
            value="${item.valorMensal||0}" min="0" step="1" placeholder="0">
          <button class="previsao-del" data-id="${item.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>
          </button>
        </div>`;
      }).join('')}
    </div>
    <div class="previsao-totals">
      <div class="prev-row"><span>Total mensal</span><strong>${formatBRL(total)}</strong></div>
      <div class="prev-row">
        <span>Dividido por</span>
        <select id="prevDividirPor" class="prev-select">
          ${[28,29,30,31].map(n=>`<option value="${n}" ${n===div?'selected':''}>${n} dias</option>`).join('')}
        </select>
      </div>
      <div class="prev-row prev-destaque"><span>Previsão diário</span><strong class="prev-valor">${formatBRL(diario)}</strong></div>
    </div>`;

  // Events
  document.getElementById('previsaoList').querySelectorAll('.previsao-valor').forEach(inp => {
    inp.addEventListener('change', () => {
      const item = state.data.previsaoDiario.find(p => p.id === inp.dataset.id);
      if (item) { item.valorMensal = parseFloat(inp.value) || 0; saveData(); renderPrevisao(); }
    });
  });
  document.getElementById('previsaoList').querySelectorAll('.previsao-del').forEach(btn => {
    btn.addEventListener('click', () => {
      state.data.previsaoDiario = state.data.previsaoDiario.filter(p => p.id !== btn.dataset.id);
      saveData(); renderPrevisao();
    });
  });
  document.getElementById('prevDividirPor').addEventListener('change', e => {
    state.data.settings.dividirPor = parseInt(e.target.value) || 30;
    saveData(); renderPrevisao();
  });
}

function addPrevisaoItem() {
  // Abre picker de tag para adicionar item
  const tags = state.data.tags;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <button class="modal-close" id="prevTagClose">✕</button>
        <h3 class="modal-title">Adicionar categoria</h3>
        <button class="modal-save" id="prevTagSave">Adicionar</button>
      </div>
      <div style="padding:16px;display:flex;flex-direction:column;gap:12px">
        <div><label class="field-label">Nome</label>
          <input type="text" id="prevNome" class="field-input" placeholder="Ex: Combustível"></div>
        <div><label class="field-label">Valor mensal (R$)</label>
          <input type="number" id="prevValor" class="field-input" placeholder="0" min="0" step="1"></div>
        <div><label class="field-label">Tag</label>
          <select id="prevTagSel" class="field-select">
            ${tags.map(t=>`<option value="${t.id}">${t.emoji} ${t.name}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#prevTagClose').onclick = () => overlay.remove();
  overlay.querySelector('#prevTagSave').onclick = () => {
    const nome = overlay.querySelector('#prevNome').value.trim();
    const valor = parseFloat(overlay.querySelector('#prevValor').value) || 0;
    const tagId = overlay.querySelector('#prevTagSel').value;
    if (!nome) { alert('Digite o nome'); return; }
    if (!state.data.previsaoDiario) state.data.previsaoDiario = [];
    state.data.previsaoDiario.push({ id: uniqueId(), nome, tagId, valorMensal: valor });
    saveData(); overlay.remove(); renderPrevisao();
  };
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// ── RENDER: HORIZONTE ─────────────────────────────────────────
function renderHorizonte() {
  const { currentMonth: m, currentYear: y } = state;
  const months = [];
  for (let i = -1; i <= 4; i++) {
    let mm = m + i, yy = y;
    if (mm < 0) { mm += 12; yy--; }
    if (mm > 11) { mm -= 12; yy++; }
    months.push({ m: mm, y: yy });
  }
  let thead = '<tr><th>Dia</th>' + months.map(({m:mm,y:yy}) => `<th>${MONTHS_PT[mm]}/${String(yy).slice(2)}</th>`).join('') + '</tr>';
  let tbody = '';
  for (let d = 1; d <= 31; d++) {
    tbody += `<tr><td>${d}</td>`;
    months.forEach(({m:mm,y:yy}) => {
      if (d > daysInMonth(mm, yy)) { tbody += '<td></td>'; return; }
      const ds = dateStr(yy, mm, d);
      const saldo = computeDaySaldos(mm, yy)[ds]?.saldo;
      if (!saldo) { tbody += '<td class="zero">0</td>'; return; }
      const cls = saldo > 0 ? 'pos' : 'neg';
      const abbr = Math.abs(saldo) >= 1000 ? (saldo/1000).toFixed(1)+'K' : Math.round(saldo).toString();
      tbody += `<td class="${cls}">${saldo<0?'-':''}${abbr}</td>`;
    });
    tbody += '</tr>';
  }
  document.getElementById('horizonteContent').innerHTML =
    `<div style="overflow:auto;flex:1"><table class="horizonte-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>`;
}

// ── DAY DETAIL ────────────────────────────────────────────────
function openDayDetail(ds, dayNum) {
  state.dayDetailDate = ds;
  const [y, m, d] = ds.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  document.getElementById('dayDetailTitle').textContent = `${dayNum} de ${MONTHS_FULL[m-1]} — ${WEEKDAYS[date.getDay()]}`;
  renderDayDetail();
  document.getElementById('dayDetailOverlay').classList.remove('hidden');
  document.getElementById('btnAddToDayDetail').onclick = () => { closeDayDetail(); openAddModal(ds); };
}

function renderDayDetail() {
  const ds = state.dayDetailDate;
  const txs = getTxForDay(ds);
  const list = document.getElementById('dayDetailList');
  if (!txs.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">Nenhum lançamento neste dia<br><small>Toque em + para adicionar</small></div></div>`;
    return;
  }
  let totalS = 0, totalE = 0;
  txs.forEach(tx => {
    if (tx.type === 'entrada') totalE += tx.amount;
    else totalS += tx.amount;
  });
  list.innerHTML = txs.map(tx => {
    const tag = getTag(tx.tagId);
    const isE = tx.type === 'entrada';
    const isC = tx.type === 'cartao';
    const badge = isC ? '<span class="cartao-badge">Cartão</span>' : '';
    const subLabel = isC && tx.vencimento
      ? `Venc. ${tx.vencimento.split('-').reverse().join('/')}`
      : tag.name + (tx.recurring ? ' · 🔄' : '') + (tx.installmentNum && tx.installments ? ` · ${tx.installmentNum}/${tx.installments}` : '');
    return `<div class="lancamento-item" data-id="${tx.id}">
      <div class="lancamento-icon" style="background:${isC?'#7C3AED20':tag.color+'20'}">${isC?'💳':tag.emoji}</div>
      <div class="lancamento-info">
        <div class="lancamento-desc">${tx.description || 'Sem descrição'} ${badge}</div>
        <div class="lancamento-tag">${subLabel}</div>
      </div>
      <span class="lancamento-value ${isE?'entrada':isC?'cartao':'saida'}">${isE?'+':'-'}${formatBRL(tx.amount)}</span>
      <button class="lancamento-delete" data-id="${tx.id}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>
      </button>
    </div>`;
  }).join('') + `
    <div class="day-detail-total">
      <span class="day-detail-total-label">Resultado do dia</span>
      <span class="day-detail-total-value ${totalE-totalS>=0?'positivo':'negativo'}">${formatBRL(totalE-totalS)}</span>
    </div>`;

  list.querySelectorAll('.lancamento-delete').forEach(btn =>
    btn.addEventListener('click', e => { e.stopPropagation(); deleteTx(btn.dataset.id); })
  );
  list.querySelectorAll('.lancamento-item').forEach(item =>
    item.addEventListener('click', e => {
      if (e.target.closest('.lancamento-delete')) return;
      closeDayDetail(); openAddModal(state.dayDetailDate, item.dataset.id);
    })
  );
}

function closeDayDetail() { document.getElementById('dayDetailOverlay').classList.add('hidden'); }

function deleteTx(id) {
  if (!confirm('Excluir este lançamento?')) return;
  state.data.transactions = state.data.transactions.filter(t => t.id !== id);
  saveData(); renderDayDetail(); renderCurrentScreen();
}

// ── ADD / EDIT MODAL ─────────────────────────────────────────
function openAddModal(ds, editId = null) {
  state.editingId = editId;
  state.selectedTagId = null;
  state.recTipo = 'nvezes';

  const modal = document.getElementById('modalOverlay');
  modal.classList.remove('hidden');

  const today = ds || todayStr();
  document.getElementById('dateInput').value = today;
  document.getElementById('vencimentoInput').value = today;
  document.getElementById('amountInput').value = '';
  document.getElementById('descInput').value = '';
  document.getElementById('recurringCheck').checked = false;
  document.getElementById('parcelasInput').value = '12';
  document.getElementById('parcelasField').classList.add('hidden');
  document.getElementById('editingId').value = editId || '';
  document.getElementById('modalTitle').textContent = editId ? 'Editar lançamento' : 'Novo lançamento';
  setModalType('saida');
  setRecTipo('nvezes');

  if (editId) {
    const tx = state.data.transactions.find(t => t.id === editId);
    if (tx) {
      setModalType(tx.type);
      document.getElementById('amountInput').value = tx.amount.toFixed(2).replace('.', ',');
      document.getElementById('descInput').value = tx.description || '';
      if (tx.type === 'cartao') {
        document.getElementById('vencimentoInput').value = tx.vencimento || today;
      } else {
        document.getElementById('dateInput').value = tx.date;
      }
      if (tx.recurring) {
        document.getElementById('recurringCheck').checked = true;
        document.getElementById('parcelasField').classList.remove('hidden');
        if (tx.installments) {
          document.getElementById('parcelasInput').value = tx.installments;
          setRecTipo('nvezes');
        } else {
          setRecTipo('semfim');
        }
        updateParcelasInfo();
      }
      state.selectedTagId = tx.tagId;
    }
  }
  renderTagSelector();
  renderAccountSelector();
  document.getElementById('amountInput').focus();
}

function setModalType(type) {
  state.selectedType = type;
  document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  // Mostrar/esconder campos conforme tipo
  const isCartao = type === 'cartao';
  document.getElementById('fieldData').classList.toggle('hidden', isCartao);
  document.getElementById('fieldVencimento').classList.toggle('hidden', !isCartao);
  document.getElementById('fieldConta').classList.toggle('hidden', isCartao);
}

function setRecTipo(tipo) {
  state.recTipo = tipo;
  document.querySelectorAll('.rec-opt').forEach(b => b.classList.toggle('active', b.dataset.rec === tipo));
  const nVezesField = document.getElementById('nVezesField');
  if (nVezesField) nVezesField.classList.toggle('hidden', tipo === 'semfim');
  if (tipo === 'semfim') {
    const info = document.getElementById('parcelasInfo');
    if (info) info.innerHTML = '<span>∞</span> sem data de fim prevista';
  } else {
    updateParcelasInfo();
  }
}

function updateParcelasInfo() {
  if (state.recTipo === 'semfim') return;
  const n = parseInt(document.getElementById('parcelasInput').value) || 1;
  const dateVal = document.getElementById(state.selectedType === 'cartao' ? 'vencimentoInput' : 'dateInput').value;
  const info = document.getElementById('parcelasInfo');
  if (!info) return;
  if (dateVal && n > 1) {
    const [y, m] = dateVal.split('-').map(Number);
    let endMM = m - 1 + (n - 1);
    let endYY = y + Math.floor(endMM / 12);
    endMM = endMM % 12;
    info.innerHTML = `<span>${n}×</span> parcelas · até ${MONTHS_PT[endMM]}/${String(endYY).slice(2)}`;
  } else {
    info.innerHTML = n === 1 ? 'Apenas este mês' : '';
  }
}

function renderTagSelector() {
  const scroll = document.getElementById('tagSelectorScroll');
  scroll.innerHTML = `
    <div class="tag-chip ${!state.selectedTagId?'selected':''}" data-id="">📦 Sem tag</div>
    ${state.data.tags.map(tag => `
      <div class="tag-chip ${state.selectedTagId===tag.id?'selected':''}" data-id="${tag.id}">${tag.emoji} ${tag.name}</div>
    `).join('')}`;
  scroll.querySelectorAll('.tag-chip').forEach(chip =>
    chip.addEventListener('click', () => { state.selectedTagId = chip.dataset.id || null; renderTagSelector(); })
  );
}

function renderAccountSelector() {
  const sel = document.getElementById('accountSelect');
  sel.innerHTML = state.data.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
}

function saveTransaction() {
  const amount = parseBRL(document.getElementById('amountInput').value.replace(',', '.'));
  if (!amount || amount <= 0) { alert('Digite um valor válido'); return; }

  const isCartao = state.selectedType === 'cartao';
  const date = isCartao
    ? document.getElementById('vencimentoInput').value
    : document.getElementById('dateInput').value;
  if (!date) { alert('Selecione a data'); return; }

  const isRecurring = document.getElementById('recurringCheck').checked;
  const isSemFim = state.recTipo === 'semfim';
  const installments = (!isSemFim && isRecurring)
    ? (parseInt(document.getElementById('parcelasInput').value) || 1)
    : (isSemFim ? 120 : 1); // 120 = 10 anos para "a perder de vista"

  const groupId = isRecurring && installments > 1 ? uniqueId() : null;
  const baseDesc = document.getElementById('descInput').value.trim();

  const baseTx = {
    id: state.editingId || uniqueId(),
    date, type: state.selectedType, amount,
    description: baseDesc,
    tagId: state.selectedTagId,
    accountId: !isCartao ? document.getElementById('accountSelect').value : null,
    vencimento: isCartao ? date : null,
    recurring: isRecurring,
    installments: isRecurring && !isSemFim ? installments : null,
    installmentNum: isRecurring ? 1 : null,
    semFim: isSemFim || false,
    groupId,
    createdAt: new Date().toISOString(),
  };

  if (state.editingId) {
    const idx = state.data.transactions.findIndex(t => t.id === state.editingId);
    if (idx !== -1) state.data.transactions[idx] = { ...baseTx, id: state.editingId };
  } else {
    // Gera parcelas
    const total = isRecurring ? installments : 1;
    const [yyyy, mm, dd] = date.split('-').map(Number);
    for (let i = 0; i < total; i++) {
      let futMM = mm - 1 + i;
      let futYY = yyyy + Math.floor(futMM / 12);
      futMM = futMM % 12;
      const futDD = Math.min(dd, daysInMonth(futMM, futYY));
      const futDate = dateStr(futYY, futMM, futDD);
      const desc = total > 1 && baseDesc ? `${baseDesc} (${i+1}/${isSemFim?'∞':total})` : baseDesc;
      state.data.transactions.push({
        ...baseTx,
        id: i === 0 ? baseTx.id : uniqueId(),
        date: futDate,
        vencimento: isCartao ? futDate : null,
        installmentNum: isRecurring ? i + 1 : null,
        description: desc,
        createdAt: new Date().toISOString(),
      });
    }
  }

  saveData();
  closeModal();
  renderCurrentScreen();
}

function closeModal() { document.getElementById('modalOverlay').classList.add('hidden'); }

// ── ADD TAG ───────────────────────────────────────────────────
const TAG_EMOJIS = ['🍔','🚗','🏠','💊','🎮','📚','💰','📦','🛒','☕','✈️','💻','👗','🎵','🐕','💡','📱','🎁','⚽','🍕','💳','🔑','🏋️','🎓'];
const TAG_COLORS = ['#F97316','#EF4444','#3B82F6','#10B981','#8B5CF6','#F59E0B','#EC4899','#06B6D4','#6B7280','#7C3AED'];
let newTagEmoji = '📦', newTagColor = '#F97316';

function openAddTagModal() {
  newTagEmoji = '📦'; newTagColor = '#F97316';
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <button class="modal-close" id="btnTagClose">✕</button>
        <h3 class="modal-title">Nova Tag</h3>
        <button class="modal-save" id="btnTagSave">Criar</button>
      </div>
      <div class="tag-form">
        <div><div class="field-label">Nome</div>
          <input type="text" id="tagNameInput" class="field-input" placeholder="Ex: Alimentação"></div>
        <div><div class="field-label">Ícone</div>
          <div class="emoji-picker-row">
            ${TAG_EMOJIS.map(e=>`<button class="emoji-opt ${e===newTagEmoji?'selected':''}" data-e="${e}">${e}</button>`).join('')}
          </div>
        </div>
        <div><div class="field-label">Cor</div>
          <div class="color-picker-row">
            ${TAG_COLORS.map(c=>`<div class="color-opt ${c===newTagColor?'selected':''}" data-c="${c}" style="background:${c}"></div>`).join('')}
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelectorAll('.emoji-opt').forEach(btn => btn.addEventListener('click', () => {
    newTagEmoji = btn.dataset.e;
    overlay.querySelectorAll('.emoji-opt').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  }));
  overlay.querySelectorAll('.color-opt').forEach(dot => dot.addEventListener('click', () => {
    newTagColor = dot.dataset.c;
    overlay.querySelectorAll('.color-opt').forEach(d => d.classList.remove('selected'));
    dot.classList.add('selected');
  }));
  overlay.querySelector('#btnTagClose').onclick = () => overlay.remove();
  overlay.querySelector('#btnTagSave').onclick = () => {
    const name = overlay.querySelector('#tagNameInput').value.trim();
    if (!name) { alert('Digite o nome'); return; }
    state.data.tags.push({ id: uniqueId(), name, emoji: newTagEmoji, color: newTagColor });
    saveData(); overlay.remove(); renderTags();
  };
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// ── EVENTS ────────────────────────────────────────────────────
function setupEvents() {
  // Nav
  document.querySelectorAll('.nav-item[data-screen]').forEach(btn =>
    btn.addEventListener('click', () => switchScreen(btn.dataset.screen))
  );

  // FAB
  document.getElementById('fabBtn').addEventListener('click', e => {
    e.stopPropagation(); openAddModal(null);
  });

  // Mês saldos
  document.getElementById('btnPrevMonth').addEventListener('click', () => {
    if (state.currentMonth===0){state.currentMonth=11;state.currentYear--;}else state.currentMonth--;
    renderSaldos();
  });
  document.getElementById('btnNextMonth').addEventListener('click', () => {
    if (state.currentMonth===11){state.currentMonth=0;state.currentYear++;}else state.currentMonth++;
    renderSaldos();
  });
  document.getElementById('btnCalendar').addEventListener('click', () => {
    const n = new Date(); state.currentMonth=n.getMonth(); state.currentYear=n.getFullYear(); renderSaldos();
  });

  // Mês totais
  document.getElementById('btnPrevMonthTotais').addEventListener('click', () => {
    if (state.currentMonth===0){state.currentMonth=11;state.currentYear--;}else state.currentMonth--;
    renderTotais();
  });
  document.getElementById('btnNextMonthTotais').addEventListener('click', () => {
    if (state.currentMonth===11){state.currentMonth=0;state.currentYear++;}else state.currentMonth++;
    renderTotais();
  });

  // Horizonte / back
  document.getElementById('btnHorizonte').addEventListener('click', () => {
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    document.getElementById('screen-horizonte').classList.add('active');
    renderHorizonte();
  });
  document.getElementById('btnBackHorizonte').addEventListener('click', () => switchScreen('saldos'));
  document.getElementById('btnBackPrevisao').addEventListener('click', () => switchScreen('menu'));
  document.getElementById('btnAddPrevisao').addEventListener('click', addPrevisaoItem);

  // Column picker dropdown
  document.getElementById('colMidBtn').addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('colPicker').classList.toggle('hidden');
  });
  document.querySelectorAll('.col-pick-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      state.colMode = opt.dataset.mode;
      document.getElementById('colPicker').classList.add('hidden');
      renderSaldos();
    });
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#colMidBtn') && !e.target.closest('#colPicker')) {
      document.getElementById('colPicker')?.classList.add('hidden');
    }
  });

  // Tipo no modal
  document.querySelectorAll('.type-btn').forEach(btn =>
    btn.addEventListener('click', () => setModalType(btn.dataset.type))
  );

  // Recorrência tipo
  document.querySelectorAll('.rec-opt').forEach(btn =>
    btn.addEventListener('click', () => setRecTipo(btn.dataset.rec))
  );

  // Recurring toggle
  document.getElementById('recurringCheck').addEventListener('change', function() {
    const field = document.getElementById('parcelasField');
    field.classList.toggle('hidden', !this.checked);
    if (this.checked) updateParcelasInfo();
  });

  // Parcelas −/+
  document.getElementById('parcelasDecr').addEventListener('click', () => {
    const inp = document.getElementById('parcelasInput');
    inp.value = Math.max(1, (parseInt(inp.value)||1) - 1);
    updateParcelasInfo();
  });
  document.getElementById('parcelasIncr').addEventListener('click', () => {
    const inp = document.getElementById('parcelasInput');
    inp.value = Math.min(360, (parseInt(inp.value)||1) + 1);
    updateParcelasInfo();
  });
  document.getElementById('parcelasInput').addEventListener('input', updateParcelasInfo);

  // Presets
  document.querySelectorAll('.preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.getElementById('parcelasInput').value = chip.dataset.n;
      document.querySelectorAll('.preset-chip').forEach(c=>c.classList.remove('active'));
      chip.classList.add('active');
      updateParcelasInfo();
    });
  });

  // Modal
  document.getElementById('btnModalClose').addEventListener('click', closeModal);
  document.getElementById('btnModalSave').addEventListener('click', saveTransaction);
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });

  // Day detail
  document.getElementById('btnDayDetailClose').addEventListener('click', closeDayDetail);
  document.getElementById('dayDetailOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('dayDetailOverlay')) closeDayDetail();
  });

  // Tags
  document.getElementById('btnAddTag').addEventListener('click', openAddTagModal);

  // Amount input: format as currency
  document.getElementById('amountInput').addEventListener('input', function() {
    let val = this.value.replace(/[^\d]/g, '');
    if (!val) { this.value = ''; return; }
    this.value = (parseInt(val) / 100).toFixed(2).replace('.', ',');
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal(); closeDayDetail(); }
  });
}

// ── INIT ──────────────────────────────────────────────────────
function init() {
  loadData();
  setupEvents();
  switchScreen('saldos');
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
document.addEventListener('DOMContentLoaded', init);
