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
  const cleaned = text.replace(/[£,\s]/g, '').replace('，', '.');
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
  $('monthTitle').textContent = `${viewYear}.${String(viewMonth).padStart(2, '0')}`;

  const monthEntries = entries
    .filter((e) => e.date.startsWith(monthKey()))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  const out = monthEntries.filter((e) => e.type === '支出').reduce((s, e) => s + e.pence, 0);
  const inc = monthEntries.filter((e) => e.type === '收入').reduce((s, e) => s + e.pence, 0);
  $('sumOut').textContent = formatPounds(out);
  $('sumIn').textContent = formatPounds(inc);

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

  fitAmountWidth();
  renderTypeSeg();
  renderChips();
  renderPaySeg();
  $('sheet').showModal();
  if (!entry) $('amount').focus();
}

// 金額欄寬度跟著字數變，讓 £ 符號一直貼著數字、整體置中
function fitAmountWidth() {
  const el = $('amount');
  el.style.width = Math.max(el.value.length || el.placeholder.length, 1) * 0.5 + 0.2 + 'em';
}
$('amount').addEventListener('input', fitAmountWidth);

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

// 點面板外的灰色區域也能關閉
$('sheet').addEventListener('click', (ev) => {
  if (ev.target === $('sheet')) closeSheet();
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

async function exportCsv() {
  if (!entries.length) return alert('還沒有任何紀錄可以匯出。');
  // 欄位順序跟「英鎊開支追蹤」的記帳分頁一樣，方便貼回去
  const header = ['日期', '類型', '類別', '說明', '金額（£）', '付款方式', '業務成本', '備註'];
  const rows = [...entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => [e.date, e.type, e.category, e.note, (e.pence / 100).toFixed(2), e.payment, e.business ? '是' : '否', '']);
  // 開頭的 ﻿ 讓 Numbers / Excel 正確認出中文
  const csv = '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
  const filename = `英鎊記帳_${todayString()}.csv`;
  const file = new File([csv], filename, { type: 'text/csv' });

  // iPhone 上用「分享」最順：可以存到檔案、AirDrop 到 Mac 或用 Numbers 開
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
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

$('exportBtn').addEventListener('click', exportCsv);

// ---- 離線可用：註冊 service worker ----
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

render();
