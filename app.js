import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js';
import {
  getDatabase, ref, onValue, set, remove, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js';

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

const STATUS_HINT = 'Gõ xong là tự chốt, khỏi bấm gì.';
const STATUS_DONE = 'Đã chốt!';
const AUTOSAVE_MS = 600;
const STORAGE_KEY = 'chon-nuoc-me';
const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

const $ = (id) => document.getElementById(id);
const inputs = [...document.querySelectorAll('.tier-input')];
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

const db = getDatabase(initializeApp(firebaseConfig));
const day = dayKey();
const orderRef = (memberId) => ref(db, `orders/${day}/${memberId}`);

let me = loadMe();
let orders = null; // null = chưa tải xong
let dirty = false; // có chữ vừa gõ chưa lưu xong
let editVersion = 0;
let saveTimer = null;

function showBanner(text) {
  $('banner').textContent = text;
  $('banner').hidden = !text;
}

function fillMyInputs() {
  const choices = (orders && me && orders[me]?.choices) || [];
  inputs.forEach((input, i) => {
    const saved = choices[i] ?? '';
    // So sánh sau trim để không ăn mất dấu cách của chữ đang gõ dở.
    if (input.value.trim() !== saved) input.value = saved;
  });
  dirty = false;
}

function syncClearBtn() {
  $('clearBtn').hidden = inputs.every((input) => !input.value.trim());
}

function syncStatus() {
  syncClearBtn();
  $('status').textContent = me && orders?.[me] ? STATUS_DONE : STATUS_HINT;
}

async function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!dirty || !me) return;

  const version = editVersion;
  const choices = inputs.map((input) => input.value.trim());
  const saved = orders?.[me]?.choices || [];
  if (choices.every((c, i) => c === (saved[i] ?? ''))) {
    dirty = false;
    syncStatus();
    return;
  }

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
    $('status').textContent = 'Chưa lưu được, gõ lại thử nha.';
  }
}

function renderOthers() {
  const rows = MEMBERS.filter((m) => m.id !== me).map((m) => {
    const picks = (orders?.[m.id]?.choices || []).filter(Boolean);
    const row = document.createElement('div');
    row.className = picks.length ? 'row' : 'row empty';

    const name = document.createElement('div');
    name.className = 'row-name';
    name.textContent = m.name;

    const text = document.createElement('div');
    text.className = 'row-picks';
    if (orders === null) text.textContent = '...';
    else text.textContent = picks.length ? picks.join(' › ') : 'Còn đang phân vân giữa nhiều mối…';

    row.append(name, text);
    return row;
  });
  $('others').replaceChildren(...rows);
}

function setMe(id) {
  if (me !== id) saveNow(); // chữ đang gõ dở thuộc về tên cũ
  me = id;
  saveMe(id);
  $('whoBtn').textContent = `Tớ là: ${MEMBERS.find((m) => m.id === id).name}`;
  fillMyInputs();
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

// Menu: ảnh menu.jpg đặt cùng thư mục, chưa có thì báo chưa có.
$('menuImg').addEventListener('load', () => { $('menuImg').hidden = false; });
$('menuImg').addEventListener('error', () => { $('menuEmpty').hidden = false; });
$('menuBtn').addEventListener('click', () => {
  if (!$('menuImg').getAttribute('src')) $('menuImg').src = 'menu.jpg';
  $('menuDlg').showModal();
});

// Tự lưu khi ngừng gõ, hoặc ngay khi rời ô / rời trang
inputs.forEach((input) => {
  input.addEventListener('input', () => {
    dirty = true;
    editVersion += 1;
    syncClearBtn();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, AUTOSAVE_MS);
  });
  input.addEventListener('blur', saveNow);
});
window.addEventListener('pagehide', saveNow);

$('clearBtn').addEventListener('click', () => {
  if (!window.confirm('Xoá hết món của cậu thật à?')) return;
  inputs.forEach((input) => { input.value = ''; });
  dirty = true;
  editVersion += 1;
  syncClearBtn();
  saveNow();
});

// Dữ liệu realtime của hôm nay
onValue(ref(db, `orders/${day}`), (snap) => {
  orders = snap.val() || {};
  showBanner('');
  if (!dirty) {
    fillMyInputs();
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
renderOthers();
if (me) setMe(me);
else $('whoDlg').showModal();
