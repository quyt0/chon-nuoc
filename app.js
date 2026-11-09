import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js';
import {
  getDatabase, ref, onValue, set, remove, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js';
import { MENU } from './menu.js';

// Config web của Firebase vốn công khai; quyền ghi do database.rules.json quyết định.
const firebaseConfig = {
  apiKey: 'AIzaSyCAhZd6wMxvmVadF9ohYJJSI0XUH5YVdiI',
  authDomain: 'chon-nuoc.firebaseapp.com',
  databaseURL: 'https://chon-nuoc-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'chon-nuoc',
  storageBucket: 'chon-nuoc.firebasestorage.app',
  messagingSenderId: '171113054027',
  appId: '1:171113054027:web:5f74e315b23e13a5b732ce',
};

const MEMBERS = [
  { id: 'mai-anh', name: 'Mai Anh' },
  { id: 'duong-thuy', name: 'Dương Thuỳ' },
  { id: 'le-hanh', name: 'Lê Hạnh' },
  { id: 'duy-cuyt', name: 'Duy Cuýt' },
  { id: 'minh-tuan', name: 'Minh Tuấn' },
];

const STATUS_HINT = 'Chọn xong là tự chốt, khỏi bấm gì.';
const STATUS_DONE = 'Đã chốt!';
const AUTOSAVE_MS = 600;
const STORAGE_KEY = 'chon-nuoc-me';
const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const LEVELS = [100, 70, 50, 30, 0];
const DEFAULT_LEVEL = 100;

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');

function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function loadMe() {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    return MEMBERS.some((m) => m.id === id) ? id : null;
  } catch {
    return null;
  }
}

function saveMe(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Không lưu được thì lần sau hỏi lại tên, vẫn dùng bình thường.
  }
}

const blank = () => ({ name: '', size: '', sugar: DEFAULT_LEVEL, ice: DEFAULT_LEVEL, note: '' });

// Dữ liệu cũ lưu mỗi món là một chuỗi; ô trống là ''.
function normalize(stored) {
  if (!stored) return blank();
  if (typeof stored === 'string') return { ...blank(), name: stored };
  return { ...blank(), ...stored };
}

function toStored(choice) {
  const name = choice.name.trim();
  if (!name) return '';
  const stored = { name, sugar: choice.sugar, ice: choice.ice };
  if (choice.size) stored.size = choice.size;
  const note = choice.note.trim();
  if (note) stored.note = note;
  return stored;
}

const choiceKey = (c) => [c.name.trim(), c.size, c.sugar, c.ice, c.note.trim()].join('|');

function describe(c) {
  const parts = [c.name];
  if (c.size) parts.push(`Size ${c.size}`);
  if (c.sugar !== DEFAULT_LEVEL) parts.push(`Đường ${c.sugar}%`);
  if (c.ice !== DEFAULT_LEVEL) parts.push(`Đá ${c.ice}%`);
  if (c.note) parts.push(c.note);
  return parts.join(' · ');
}

const db = getDatabase(initializeApp(firebaseConfig));
const day = dayKey();
const orderRef = (memberId) => ref(db, `orders/${day}/${memberId}`);

let me = loadMe();
let orders = null; // null = chưa tải xong
let draft = Array.from({ length: 4 }, blank);
let dirty = false; // có thay đổi chưa lưu xong
let editVersion = 0;
let saveTimer = null;
let pickingTier = 0;

function showBanner(text) {
  $('banner').textContent = text;
  $('banner').hidden = !text;
}

function makeSelect(label, options, onChange) {
  const select = document.createElement('select');
  select.className = 'opt';
  select.setAttribute('aria-label', label);
  options.forEach(([value, text]) => select.add(new Option(text, value)));
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

const levelOptions = (label) => LEVELS.map((v) => [String(v), `${label} ${v}%`]);

function markDirty() {
  dirty = true;
  editVersion += 1;
}

function updateChoice(i, patch) {
  Object.assign(draft[i], patch);
  markDirty();
  saveNow();
}

const controls = [...document.querySelectorAll('.tier')].map((tier, i) => {
  const pick = tier.querySelector('.tier-pick');
  pick.addEventListener('click', () => openPicker(i));

  const size = makeSelect('Size', [['M', 'Size M'], ['L', 'Size L']], (v) => updateChoice(i, { size: v }));
  const sugar = makeSelect('Đường', levelOptions('Đường'), (v) => updateChoice(i, { sugar: Number(v) }));
  const ice = makeSelect('Đá', levelOptions('Đá'), (v) => updateChoice(i, { ice: Number(v) }));

  const note = document.createElement('input');
  note.className = 'opt-note';
  note.maxLength = 100;
  note.placeholder = 'Ghi chú (topping, ít ngọt...)';
  note.setAttribute('aria-label', 'Ghi chú');
  note.addEventListener('input', () => {
    draft[i].note = note.value;
    markDirty();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, AUTOSAVE_MS);
  });
  note.addEventListener('blur', saveNow);

  const opts = document.createElement('div');
  opts.className = 'opts';
  opts.append(size, sugar, ice, note);
  tier.append(opts);

  return { pick, opts, size, sugar, ice, note };
});

function renderTier(i) {
  const c = draft[i];
  const ui = controls[i];
  ui.pick.textContent = c.name || 'Chọn món...';
  ui.pick.classList.toggle('is-empty', !c.name);
  ui.opts.hidden = !c.name;
  ui.size.hidden = !c.size;
  ui.size.value = c.size || 'M';
  ui.sugar.value = String(c.sugar);
  ui.ice.value = String(c.ice);
  // So sánh sau trim để không ăn mất dấu cách của chữ đang gõ dở.
  if (ui.note.value.trim() !== c.note) ui.note.value = c.note;
}

function loadDraft() {
  const saved = (orders && me && orders[me]?.choices) || [];
  draft = draft.map((_, i) => normalize(saved[i]));
  draft.forEach((_, i) => renderTier(i));
  dirty = false;
}

function syncStatus() {
  $('status').textContent = me && orders?.[me] ? STATUS_DONE : STATUS_HINT;
}

async function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!dirty || !me) return;

  const version = editVersion;
  const saved = orders?.[me]?.choices || [];
  if (draft.every((c, i) => choiceKey(c) === choiceKey(normalize(saved[i])))) {
    dirty = false;
    syncStatus();
    return;
  }

  const choices = draft.map(toStored);
  const memberRef = orderRef(me);
  $('status').textContent = 'Đang chốt...';
  try {
    if (choices.some(Boolean)) await set(memberRef, { choices, at: serverTimestamp() });
    else await remove(memberRef);
    if (version === editVersion) {
      dirty = false;
      syncStatus();
    }
  } catch (err) {
    console.error(err);
    $('status').textContent = 'Chưa lưu được, chọn lại thử nha.';
  }
}

function renderOthers() {
  const rows = MEMBERS.filter((m) => m.id !== me).map((m) => {
    const picks = (orders?.[m.id]?.choices || []).map(normalize).filter((c) => c.name);
    const row = document.createElement('div');
    row.className = picks.length ? 'row' : 'row empty';

    const name = document.createElement('div');
    name.className = 'row-name';
    name.textContent = m.name;
    row.append(name);

    if (picks.length) {
      picks.forEach((c, i) => {
        const line = document.createElement('div');
        line.className = 'row-picks';
        line.textContent = `${i + 1}. ${describe(c)}`;
        row.append(line);
      });
    } else {
      const line = document.createElement('div');
      line.className = 'row-picks';
      line.textContent = orders === null ? '...' : 'Còn đang phân vân giữa nhiều mối…';
      row.append(line);
    }
    return row;
  });
  $('others').replaceChildren(...rows);
}

function setMe(id) {
  if (me !== id) saveNow(); // thay đổi đang dở thuộc về tên cũ
  me = id;
  saveMe(id);
  $('whoBtn').textContent = `Tớ là: ${MEMBERS.find((m) => m.id === id).name}`;
  loadDraft();
  syncStatus();
  renderOthers();
}

// Chọn tên
$('whoList').replaceChildren(...MEMBERS.map((m) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pill';
  btn.textContent = m.name;
  btn.addEventListener('click', () => {
    setMe(m.id);
    $('whoDlg').close();
  });
  return btn;
}));
$('whoBtn').addEventListener('click', () => $('whoDlg').showModal());
$('whoDlg').addEventListener('cancel', (e) => { if (!me) e.preventDefault(); });

// Ảnh menu
$('menuBtn').addEventListener('click', () => $('menuDlg').showModal());

// Chọn món
const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

function choose(name, hasSizes) {
  draft[pickingTier] = { ...blank(), name, size: hasSizes ? 'M' : '' };
  renderTier(pickingTier);
  markDirty();
  saveNow();
  $('pickDlg').close();
}

function pickRow(label, price, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pick-row';
  const nameEl = document.createElement('span');
  nameEl.textContent = label;
  btn.append(nameEl);
  if (price) {
    const priceEl = document.createElement('span');
    priceEl.className = 'pick-price';
    priceEl.textContent = price;
    btn.append(priceEl);
  }
  btn.addEventListener('click', onClick);
  return btn;
}

function renderPickList() {
  const typed = $('pickSearch').value.trim();
  const query = fold(typed);
  const nodes = [];
  let exact = false;

  MENU.forEach(({ group, items }) => {
    const matches = items.filter((item) => fold(item.name).includes(query));
    if (!matches.length) return;
    const heading = document.createElement('h3');
    heading.className = 'pick-group';
    heading.textContent = group;
    nodes.push(heading);
    matches.forEach((item) => {
      if (fold(item.name) === query) exact = true;
      const hasSizes = item.m !== undefined;
      const price = hasSizes ? `M ${item.m}k · L ${item.l}k` : `${item.p}k`;
      nodes.push(pickRow(item.name, price, () => choose(item.name, hasSizes)));
    });
  });

  if (typed && !exact) nodes.unshift(pickRow(`Dùng tên "${typed}"`, '', () => choose(typed, false)));
  $('pickList').replaceChildren(...nodes);
}

function openPicker(i) {
  pickingTier = i;
  $('pickSearch').value = '';
  $('pickClear').hidden = !draft[i].name;
  renderPickList();
  $('pickDlg').showModal();
}

$('pickSearch').addEventListener('input', renderPickList);
$('pickClose').addEventListener('click', () => $('pickDlg').close());
$('pickClear').addEventListener('click', () => {
  draft[pickingTier] = blank();
  renderTier(pickingTier);
  markDirty();
  saveNow();
  $('pickDlg').close();
});

// Lưu khi rời trang, xoá hết
window.addEventListener('pagehide', saveNow);

$('clearBtn').addEventListener('click', () => {
  if (draft.every((c) => !c.name)) return;
  if (!window.confirm('Xoá hết món của cậu thật à?')) return;
  draft = draft.map(blank);
  draft.forEach((_, i) => renderTier(i));
  markDirty();
  saveNow();
});

// Dữ liệu realtime của hôm nay
onValue(ref(db, `orders/${day}`), (snap) => {
  orders = snap.val() || {};
  showBanner('');
  if (!dirty) {
    loadDraft();
    syncStatus();
  }
  renderOthers();
}, (err) => {
  console.error(err);
  showBanner('Chưa đọc được dữ liệu từ Firebase.');
});

let offlineTimer = setTimeout(() => showBanner('Đang mất kết nối, kiểm tra mạng nha.'), 5000);
onValue(ref(db, '.info/connected'), (snap) => {
  clearTimeout(offlineTimer);
  if (snap.val() === true) {
    if ($('banner').textContent.startsWith('Đang mất')) showBanner('');
  } else {
    offlineTimer = setTimeout(() => showBanner('Đang mất kết nối, kiểm tra mạng nha.'), 5000);
  }
});

// Để tab qua đêm thì sang ngày mới tự có danh sách mới.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveNow();
  else if (dayKey() !== day && !dirty) location.reload();
});

// Khởi động
const now = new Date();
$('date').textContent = `${WEEKDAYS[now.getDay()]}, ${pad(now.getDate())}/${pad(now.getMonth() + 1)}`;
draft.forEach((_, i) => renderTier(i));
renderOthers();
if (me) setMe(me);
else $('whoDlg').showModal();
