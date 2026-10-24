// 英鎊記帳：所有資料只存在這支手機的瀏覽器裡（localStorage），不會上傳。

// ---- 設定：類別與付款方式，沿用「英鎊開支追蹤」表的清單 ----
const EXPENSE_CATEGORIES = [
  '房租水電', '雜貨日用', '外食', '交通', '手機網路', '保險醫療', '創作材料器材',
  '工作室/場地', '展覽/報名費', '軟體訂閱', '個人用品', '娛樂社交', '旅遊/返台', '其他支出',
];
const INCOME_CATEGORIES = ['作品銷售', '委託案', '教學/工作坊', '補助/獎金', '其他收入'];
// 這幾類預設算「業務成本」，年底報 Self Assessment 用
const BUSINESS_CATEGORIES = ['創作材料器材', '工作室/場地', '展覽/報名費', '軟體訂閱'];
const PAYMENT_METHODS = ['簽帳卡', '信用卡', '現金', '轉帳'];

const STORAGE_KEY = 'uk-expenses.entries.v1';
const SETTINGS_KEY = 'uk-expenses.settings.v1';
const EMERGENCY_MONTHS = 12; // 緊急預備金：收入不穩期間要留 12 個月支出
const LAST_PAYMENT_KEY = 'uk-expenses.lastPayment';

// ---- 資料存取 ----
// 每一筆：{ id, date: 'YYYY-MM-DD', type: '支出'|'收入', category, note, pence, payment, business }
// 金額用「便士」整數存，避免 0.1 + 0.2 這類小數誤差。
function loadEntries() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

let entries = loadEntries();

// 設定：{ budgetPence, cashPence, cashDate }，沒設定的欄位是 null
function loadSettings() {
  try {
    return { budgetPence: null, cashPence: null, cashDate: null, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) };
  } catch {
    return { budgetPence: null, cashPence: null, cashDate: null };
  }
}
let settings = loadSettings();

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// ---- 小工具 ----
const $ = (id) => document.getElementById(id);

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatPounds(pence) {
  return '£' + (pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parsePence(text) {
  const cleaned = text.replace(/[£\s]/g, '').replace(/[,，]/g, '.');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
function formatDayHeading(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')} ${weekday}`;
}

// ---- 主畫面：目前看的月份 ----
let viewYear = new Date().getFullYear();
let viewMonth = new Date().getMonth() + 1; // 1–12

function monthKey() {
  return `${viewYear}-${String(viewMonth).padStart(2, '0')}`;
}

function render() {
  renderLedger();
  renderOverview();
}

function sumOf(list, type) {
  return list.filter((e) => e.type === type).reduce((s, e) => s + e.pence, 0);
}

function renderLedger() {
  $('monthTitle').textContent = `${viewYear}.${String(viewMonth).padStart(2, '0')}`;

  const monthEntries = entries
    .filter((e) => e.date.startsWith(monthKey()))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  const out = monthEntries.filter((e) => e.type === '支出').reduce((s, e) => s + e.pence, 0);
  const inc = monthEntries.filter((e) => e.type === '收入').reduce((s, e) => s + e.pence, 0);
  $('sumOut').textContent = formatPounds(out);
  $('sumIn').textContent = formatPounds(inc);
  fitSummary();

  renderBudget($('budgetBox'), out);
  renderCategories($('catBox'), monthEntries);

  const list = $('list');
  list.innerHTML = '';
  $('empty').hidden = monthEntries.length > 0;

  // 依日期分組
  const byDay = new Map();
  for (const e of monthEntries) {
    if (!byDay.has(e.date)) byDay.set(e.date, []);
    byDay.get(e.date).push(e);
  }

  for (const [date, dayEntries] of byDay) {
    const dayOut = dayEntries.filter((e) => e.type === '支出').reduce((s, e) => s + e.pence, 0);
    const head = document.createElement('div');
    head.className = 'day-head label';
    head.innerHTML = `<span>${formatDayHeading(date)}</span><span>${dayOut ? 'OUT ' + formatPounds(dayOut) : ''}</span>`;
    list.append(head);

    const card = document.createElement('div');
    card.className = 'day-card';
    for (const e of dayEntries) card.append(entryRow(e));
    list.append(card);
  }
}

// ---- 預算進度條 ----
function renderBudget(box, spent) {
  box.innerHTML = '';
  if (!settings.budgetPence) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'link-btn';
    b.textContent = '＋ 設定每月預算';
    b.addEventListener('click', openSettings);
    box.append(b);
    return;
  }
  const budget = settings.budgetPence;
  const ratio = spent / budget;
  const over = spent > budget;

  const head = document.createElement('div');
  head.className = 'row-between label';
  head.innerHTML = `<span>預算 ${formatPounds(budget)}</span><span>已用 ${Math.round(ratio * 100)}%</span>`;

  const track = document.createElement('div');
  track.className = 'bar-track';
  const fill = document.createElement('div');
  fill.className = 'bar-fill' + (over ? ' over' : '');
  fill.style.width = Math.min(ratio, 1) * 100 + '%';
  track.append(fill);

  const foot = document.createElement('p');
  foot.className = 'budget-left' + (over ? ' over' : '');
  foot.textContent = over ? `超支 ${formatPounds(spent - budget)}` : `還剩 ${formatPounds(budget - spent)}`;

  box.append(head, track, foot);
}

// ---- 類別統計：這個月每個支出類別各花多少 ----
function renderCategories(box, monthEntries) {
  box.innerHTML = '';
  const totals = new Map();
  for (const e of monthEntries) {
    if (e.type !== '支出') continue;
    totals.set(e.category, (totals.get(e.category) || 0) + e.pence);
  }
  if (!totals.size) return;
  const rows = [...totals].sort((a, b) => b[1] - a[1]);
  const max = rows[0][1];
  const all = rows.reduce((s, [, v]) => s + v, 0);

  const title = document.createElement('div');
  title.className = 'label block-title';
  title.textContent = '類別 · BY CATEGORY';
  box.append(title);

  rows.forEach(([name, pence], i) => {
    const row = document.createElement('div');
    row.className = 'cat-row';
    const top = document.createElement('div');
    top.className = 'row-between';
    const left = document.createElement('span');
    left.textContent = name;
    const right = document.createElement('span');
    right.className = 'cat-amt';
    right.innerHTML = `${formatPounds(pence)}<span class="label"> ${Math.round((pence / all) * 100)}%</span>`;
    top.append(left, right);
    const track = document.createElement('div');
    track.className = 'bar-track thin';
    const fill = document.createElement('div');
    fill.className = 'bar-fill' + (i === 0 ? '' : ' muted'); // 花最多的那類用招牌紫色
    fill.style.width = (pence / max) * 100 + '%';
    track.append(fill);
    row.append(top, track);
    box.append(row);
  });
}

// ---- 總覽：目前現金、可支應月數、本月預算 ----
// 目前現金 = 設定的餘額 ＋ 那天之後的收入 － 那天之後的支出
function currentCash() {
  if (settings.cashPence === null || !settings.cashDate) return null;
  const after = entries.filter((e) => e.date > settings.cashDate);
  return settings.cashPence + sumOf(after, '收入') - sumOf(after, '支出');
}

function formatDate(dateStr) {
  return dateStr.replace(/-/g, '.');
}

function renderOverview() {
  const cash = currentCash();
  if (cash === null) {
    $('ovCash').textContent = '—';
    $('ovCashNote').textContent = '按右上角「設定」輸入現在的現金餘額。';
  } else {
    $('ovCash').textContent = (cash < 0 ? '−' : '') + formatPounds(Math.abs(cash));
    const after = entries.filter((e) => e.date > settings.cashDate);
    $('ovCashNote').textContent =
      `${formatDate(settings.cashDate)} 結束時 ${formatPounds(settings.cashPence)}，` +
      `之後收入 +${formatPounds(sumOf(after, '收入'))}、支出 −${formatPounds(sumOf(after, '支出'))}`;
  }

  const runwayEl = $('ovRunway');
  runwayEl.classList.remove('warn');
  if (cash === null || !settings.budgetPence) {
    runwayEl.textContent = '—';
    $('ovRunwayNote').textContent = '設定現金餘額和每月預算後才算得出來。';
  } else {
    const months = Math.max(cash, 0) / settings.budgetPence;
    runwayEl.innerHTML = `${months.toFixed(1)}<span class="unit">個月</span>`;
    const warn = months < EMERGENCY_MONTHS;
    runwayEl.classList.toggle('warn', warn);
    $('ovRunwayNote').textContent = `以每月預算 ${formatPounds(settings.budgetPence)} 計算。` +
      (warn ? `已低於 ${EMERGENCY_MONTHS} 個月的緊急預備金。` : `緊急預備金目標是 ${EMERGENCY_MONTHS} 個月。`);
  }

  // 總覽的預算永遠看「今天這個月」
  const now = todayString().slice(0, 7);
  const [y, m] = now.split('-');
  $('ovBudgetLabel').textContent = `本月預算 · ${y}.${m}`;
  renderBudget($('ovBudget'), sumOf(entries.filter((e) => e.date.startsWith(now)), '支出'));
}

// ---- 分頁切換 ----
function showView(id) {
  for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== id;
  for (const t of document.querySelectorAll('.tab')) t.classList.toggle('on', t.dataset.view === id);
  window.scrollTo(0, 0);
  fitSummary();
}
for (const t of document.querySelectorAll('.tab')) t.addEventListener('click', () => showView(t.dataset.view));

// ---- 設定面板 ----
function penceToInput(p) {
  return p === null ? '' : (p / 100).toFixed(2);
}

function openSettings() {
  $('setBudget').value = penceToInput(settings.budgetPence);
  $('setCash').value = penceToInput(settings.cashPence);
  $('setCashDate').value = settings.cashDate || todayString();
  $('settingsError').hidden = true;
  $('settingsSheet').showModal();
}

$('settingsBtn').addEventListener('click', openSettings);
$('settingsCancel').addEventListener('click', () => $('settingsSheet').close());

$('settingsForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const err = (msg) => { $('settingsError').textContent = msg; $('settingsError').hidden = false; };
  const budgetText = $('setBudget').value.trim();
  const cashText = $('setCash').value.trim();
  const budget = budgetText ? parsePence(budgetText) : null;
  const cash = cashText ? parsePence(cashText) : null;
  if (budgetText && !budget) return err('每月預算請輸入數字，例如 750');
  if (cashText && cash === null) return err('現金餘額請輸入數字，例如 18000');
  if (cashText && !$('setCashDate').value) return err('請選現金餘額的日期');

  settings = {
    budgetPence: budget,
    cashPence: cash,
    cashDate: cashText ? $('setCashDate').value : null,
  };
  saveSettings();
  $('settingsSheet').close();
  render();
});

// 本月合計的數字太長時縮小字級，讓它留在格子裡；支出和收入用同一個大小
const SUMMARY_FONT_PX = 44;
function fitSummary() {
  const els = [$('sumOut'), $('sumIn')];
  let size = SUMMARY_FONT_PX;
  for (const el of els) {
    el.style.fontSize = SUMMARY_FONT_PX + 'px';
    const available = el.parentElement.clientWidth - 2 * 16;
    if (el.offsetWidth > available) size = Math.min(size, Math.floor(SUMMARY_FONT_PX * available / el.offsetWidth));
  }
  for (const el of els) el.style.fontSize = size + 'px';
  // 總覽的大數字也一樣，太長就縮小
  for (const el of [$('ovCash'), $('ovRunway')]) {
    el.style.fontSize = '';
    const available = el.parentElement.clientWidth;
    if (available && el.offsetWidth > available) {
      el.style.fontSize = Math.floor(parseFloat(getComputedStyle(el).fontSize) * available / el.offsetWidth) + 'px';
    }
  }
}

function entryRow(e) {
  const row = document.createElement('button');
  row.className = 'entry';
  row.type = 'button';

  const main = document.createElement('span');
  main.className = 'entry-main';
  const title = document.createElement('div');
  title.className = 'entry-title';
  title.textContent = e.category;
  if (e.business) {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = 'BIZ';
    title.append(tag);
  }
  const sub = document.createElement('div');
  sub.className = 'entry-sub';
  sub.textContent = [e.note, e.payment].filter(Boolean).join(' · ');
  main.append(title, sub);

  const amt = document.createElement('span');
  amt.className = 'entry-amt' + (e.type === '收入' ? ' income' : '');
  amt.textContent = (e.type === '收入' ? '+' : '−') + formatPounds(e.pence);

  row.append(main, amt);
  row.addEventListener('click', () => openSheet(e));
  return row;
}

// ---- 新增／編輯面板 ----
let editingId = null;
let formType = '支出';
let formCategory = null;
let formPayment = localStorage.getItem(LAST_PAYMENT_KEY) || PAYMENT_METHODS[0];

function renderChips() {
  const cats = formType === '支出' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const box = $('categoryChips');
  box.innerHTML = '';
  for (const name of cats) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (name === formCategory ? ' on' : '');
    chip.textContent = name;
    chip.addEventListener('click', () => {
      formCategory = name;
      // 換類別時，業務成本跟著類別預設走
      $('business').checked = BUSINESS_CATEGORIES.includes(name);
      renderChips();
    });
    box.append(chip);
  }
}

function renderTypeSeg() {
  for (const b of $('typeSeg').children) b.classList.toggle('on', b.dataset.value === formType);
}

function renderPaySeg() {
  const seg = $('paySeg');
  seg.innerHTML = '';
  for (const p of PAYMENT_METHODS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = p;
    b.className = p === formPayment ? 'on' : '';
    b.addEventListener('click', () => { formPayment = p; renderPaySeg(); });
    seg.append(b);
  }
}

function openSheet(entry) {
  editingId = entry ? entry.id : null;
  formType = entry ? entry.type : '支出';
  formCategory = entry ? entry.category : null;
  if (entry) formPayment = entry.payment;

  $('amount').value = entry ? (entry.pence / 100).toFixed(2) : '';
  $('date').value = entry ? entry.date : todayString();
  $('note').value = entry ? entry.note : '';
  $('business').checked = entry ? entry.business : false;
  $('error').hidden = true;
  $('deleteBtn').hidden = !entry;

  renderTypeSeg();
  renderChips();
  renderPaySeg();
  $('sheet').showModal();
  fitAmountWidth(); // 面板打開後才量得到寬度
  if (!entry) $('amount').focus();
}

// 金額欄：用一個看不見的「量尺」量出數字實際多寬，再把輸入欄設成剛好的寬度。
// 數字太長放不下時，字級等比例縮小。
const AMOUNT_FONT_PX = 72;
function fitAmountWidth() {
  const el = $('amount');
  const measure = $('amountMeasure');
  const available = $('form').clientWidth - 2 * 16 - 48; // 扣掉左右留白和 £ 的位置
  measure.style.fontSize = AMOUNT_FONT_PX + 'px';
  measure.textContent = el.value || el.placeholder;
  const natural = measure.offsetWidth;
  const size = natural > available ? Math.floor(AMOUNT_FONT_PX * available / natural) : AMOUNT_FONT_PX;
  el.style.fontSize = size + 'px';
  el.style.width = Math.ceil(natural * size / AMOUNT_FONT_PX) + 6 + 'px';
}

// 只接受數字和一個小數點，小數最多兩位；逗號當成小數點
function cleanAmountInput() {
  const el = $('amount');
  let v = el.value.replace(/[,，]/g, '.').replace(/[^\d.]/g, '');
  const dot = v.indexOf('.');
  if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  const [whole, frac] = v.split('.');
  v = whole.slice(0, 7) + (frac !== undefined ? '.' + frac : '');
  if (v !== el.value) el.value = v;
  fitAmountWidth();
}
$('amount').addEventListener('input', cleanAmountInput);
// 字型下載完成後再量一次，避免用到備用字型時量錯
if (document.fonts) document.fonts.ready.then(() => { fitAmountWidth(); fitSummary(); });

function closeSheet() {
  $('sheet').close();
}

function showError(msg) {
  $('error').textContent = msg;
  $('error').hidden = false;
}

$('typeSeg').addEventListener('click', (ev) => {
  const v = ev.target.dataset.value;
  if (!v || v === formType) return;
  formType = v;
  formCategory = null;
  $('business').checked = false;
  renderTypeSeg();
  renderChips();
});

$('form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const pence = parsePence($('amount').value);
  if (!pence) return showError('請輸入金額，例如 12.50');
  if (!formCategory) return showError('請選一個類別');
  if (!$('date').value) return showError('請選日期');

  const data = {
    date: $('date').value,
    type: formType,
    category: formCategory,
    note: $('note').value.trim(),
    pence,
    payment: formPayment,
    business: $('business').checked,
  };

  if (editingId) {
    entries = entries.map((e) => (e.id === editingId ? { ...e, ...data } : e));
  } else {
    entries.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ...data });
  }
  saveEntries(entries);
  localStorage.setItem(LAST_PAYMENT_KEY, formPayment);

  // 存完跳到那筆紀錄所在的月份
  [viewYear, viewMonth] = data.date.split('-').map(Number);
  closeSheet();
  render();
});

$('deleteBtn').addEventListener('click', () => {
  if (!confirm('確定刪除這筆？')) return;
  entries = entries.filter((e) => e.id !== editingId);
  saveEntries(entries);
  closeSheet();
  render();
});

$('cancelBtn').addEventListener('click', closeSheet);
$('addBtn').addEventListener('click', () => openSheet(null));

// 點面板外的灰色區域也能關閉，但已經輸入金額時不關，避免打到一半的資料不見
$('sheet').addEventListener('click', (ev) => {
  if (ev.target === $('sheet') && !$('amount').value) closeSheet();
});

$('prevMonth').addEventListener('click', () => {
  viewMonth--;
  if (viewMonth < 1) { viewMonth = 12; viewYear--; }
  render();
});
$('nextMonth').addEventListener('click', () => {
  viewMonth++;
  if (viewMonth > 12) { viewMonth = 1; viewYear++; }
  render();
});

// ---- 匯出 CSV（可用 Numbers 開，也當備份）----
function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// scope 'month'：只匯出正在看的月份，檔名 2026-10.csv，方便每月存一份到電腦
// scope 'all'：所有紀錄，當完整備份
async function exportCsv(scope) {
  const list = scope === 'month' ? entries.filter((e) => e.date.startsWith(monthKey())) : entries;
  if (!list.length) return alert(scope === 'month' ? '這個月還沒有紀錄可以匯出。' : '還沒有任何紀錄可以匯出。');
  // 欄位順序跟「英鎊開支追蹤」的記帳分頁一樣，方便貼回去
  const header = ['日期', '類型', '類別', '說明', '金額（£）', '付款方式', '業務成本', '備註'];
  const rows = [...list]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => [e.date, e.type, e.category, e.note, (e.pence / 100).toFixed(2), e.payment, e.business ? '是' : '否', '']);
  // 開頭的 ﻿ 讓 Numbers / Excel 正確認出中文
  const csv = '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
  const filename = scope === 'month' ? `${monthKey()}.csv` : `all-${todayString()}.csv`;
  const file = new File([csv], filename, { type: 'text/csv' });

  // iPhone 上用「分享」最順：可以存到檔案、AirDrop 到 Mac 或用 Numbers 開
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] }); // 只帶檔案：多帶 title 的話 iPhone 會多存一個 text 檔
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('exportBtn').addEventListener('click', () => exportCsv('month'));
$('exportAllBtn').addEventListener('click', () => exportCsv('all'));

// ---- 離線可用：註冊 service worker ----
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}
// 請瀏覽器把資料當成「重要、不要自動清掉」
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

render();
