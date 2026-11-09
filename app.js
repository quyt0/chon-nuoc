import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js';
import {
  getDatabase, ref, onValue, set, remove, serverTimestamp, runTransaction,
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js';
import { MENU, TOPPINGS, SUNFLOWER_K } from './menu.js';
import { BANKS, ACCOUNTS } from './accounts.js';
import { computeBill, drinkK, toppingsK, formatK, fold, OVERRIDE_INDEX } from './bill.js';

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
const memberName = (id) => MEMBERS.find((m) => m.id === id)?.name ?? '';

const STATUS_HINT = 'Chọn xong là tự chốt, khỏi bấm gì.';
const STATUS_DONE = 'Đã chốt!';
const AUTOSAVE_MS = 600;
const STORAGE_KEY = 'chon-nuoc-me';
const BANK_APP_KEY = 'chon-nuoc-bank-app';
const AUTOFILL_APP = 'mb'; // theo danh sách của VietQR, trong 5 ngân hàng chỉ MB tự điền
const SITE_URL = 'https://lela.izcuyt.com/';
const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const LEVELS = [100, 70, 50, 30, 0];
const DEFAULT_LEVEL = 100;
const MAX_SEEDS = 30;

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

function loadBankApp() {
  try {
    return localStorage.getItem(BANK_APP_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveBankApp(appId) {
  try {
    localStorage.setItem(BANK_APP_KEY, appId);
  } catch {
    // Không lưu được thì lần sau chọn lại app.
  }
}

const blank = () => ({ name: '', size: '', sugar: DEFAULT_LEVEL, ice: DEFAULT_LEVEL, note: '', toppings: [] });

// Dữ liệu cũ lưu mỗi món là một chuỗi; ô trống là ''.
function normalize(stored) {
  if (!stored) return blank();
  if (typeof stored === 'string') return { ...blank(), name: stored };
  return { ...blank(), ...stored, toppings: [...(stored.toppings || [])] };
}

function toStored(choice) {
  const name = choice.name.trim();
  if (!name) return '';
  const stored = { name, sugar: choice.sugar, ice: choice.ice };
  if (choice.size) stored.size = choice.size;
  const note = choice.note.trim();
  if (note) stored.note = note;
  if (choice.toppings.length) stored.toppings = choice.toppings;
  return stored;
}

const choiceKey = (c) => [c.name.trim(), c.size, c.sugar, c.ice, c.note.trim(), c.toppings.join(',')].join('|');

function describe(c) {
  const parts = [c.name];
  if (c.size) parts.push(`Size ${c.size}`);
  if (c.sugar !== DEFAULT_LEVEL) parts.push(`Đường ${c.sugar}%`);
  if (c.ice !== DEFAULT_LEVEL) parts.push(`Đá ${c.ice}%`);
  c.toppings.forEach((t) => parts.push(`+ ${t}`));
  if (c.note) parts.push(c.note);
  return parts.join(' · ');
}

const db = getDatabase(initializeApp(firebaseConfig));
const day = dayKey();
const orderRef = (memberId) => ref(db, `orders/${day}/${memberId}`);

let me = loadMe();
let orders = null; // null = chưa tải xong
let extras = {}; // người trả, hướng dương, không đi, món thật, mời
let draft = Array.from({ length: 4 }, blank);
let dirty = false; // có thay đổi món chưa lưu xong
let editVersion = 0;
let saveTimer = null;
let reasonTimer = null;
let pickingTier = 0;
let overrideFor = null; // đang chọn "Món khác" cho ai; null = chọn cho ô của tớ
let transfer = null; // khoản tớ cần chuyển, null nếu không hiện QR
let qrPng = null; // { url, blob: Promise<Blob> }, tạo sẵn để nút lưu ảnh chạy ngay
let qrMsgTimer = null;
let bill = computeBill([], 0);

function showBanner(text) {
  $('banner').textContent = text;
  $('banner').hidden = !text;
}

const person = (id) => extras.people?.[id] ?? {};

async function writeExtra(path, value) {
  try {
    await set(ref(db, `extras/${day}/${path}`), value);
  } catch (err) {
    console.error(err);
    showBanner('Chưa lưu được, thử lại nha.');
  }
}

const setPerson = (id, field, value) => writeExtra(`people/${id}/${field}`, value);

function validPayer() {
  const p = extras.payer;
  if (!p || !ACCOUNTS[p.member] || person(p.member).absent) return null;
  const list = ACCOUNTS[p.member].list;
  return { member: p.member, account: list.find((a) => a.no === p.account) ?? list[0] };
}

// ----- Món của tớ -----

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

  const topping = document.createElement('button');
  topping.type = 'button';
  topping.className = 'opt opt-topping';
  topping.addEventListener('click', () => openToppings(draft[i].toppings, (next) => {
    updateChoice(i, { toppings: next });
    renderTier(i);
    renderAll();
  }));

  const note = document.createElement('input');
  note.className = 'opt-note';
  note.maxLength = 100;
  note.placeholder = 'Ghi chú (ít ngọt, không kem...)';
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
  opts.append(size, sugar, ice, topping, note);
  tier.append(opts);

  return { pick, opts, size, sugar, ice, topping, note };
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
  ui.topping.textContent = c.toppings.length ? `+ ${c.toppings.join(', ')}` : 'Thêm topping';
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

// ----- Mấy đứa kia -----

function renderOthers() {
  const rows = MEMBERS.filter((m) => m.id !== me).map((m) => {
    const picks = (orders?.[m.id]?.choices || []).map(normalize).filter((c) => c.name);
    const absent = person(m.id).absent;
    const row = document.createElement('div');
    row.className = picks.length && !absent ? 'row' : 'row empty';

    const name = document.createElement('div');
    name.className = 'row-name';
    name.textContent = m.name;
    row.append(name);

    const addLine = (text) => {
      const line = document.createElement('div');
      line.className = 'row-picks';
      line.textContent = text;
      row.append(line);
    };

    if (absent) {
      const reason = person(m.id).reason;
      addLine(reason ? `Hôm nay không đi: ${reason}` : 'Hôm nay không đi.');
    } else if (picks.length) {
      picks.forEach((c, i) => addLine(`${i + 1}. ${describe(c)}`));
    } else {
      addLine(orders === null ? '...' : 'Còn đang phân vân giữa nhiều mối…');
    }
    return row;
  });
  $('others').replaceChildren(...rows);
}

// ----- Không đi -----

function renderAbsent() {
  const absent = Boolean(me && person(me).absent);
  $('absentBox').checked = absent;
  $('absentReason').hidden = !absent;
  $('orderArea').hidden = absent;
  if (document.activeElement !== $('absentReason')) {
    $('absentReason').value = me ? person(me).reason ?? '' : '';
  }
}

function saveReason() {
  clearTimeout(reasonTimer);
  reasonTimer = null;
  if (!me || !person(me).absent) return;
  const reason = $('absentReason').value.trim();
  if (reason !== (person(me).reason ?? '')) setPerson(me, 'reason', reason || null);
}

$('absentBox').addEventListener('change', () => {
  if (!me) return;
  if ($('absentBox').checked) {
    saveNow();
    setPerson(me, 'absent', true);
    if (extras.payer?.member === me) writeExtra('payer', null);
  } else {
    writeExtra(`people/${me}/absent`, null);
    setPerson(me, 'reason', null);
  }
});

$('absentReason').addEventListener('input', () => {
  clearTimeout(reasonTimer);
  reasonTimer = setTimeout(saveReason, AUTOSAVE_MS);
});
$('absentReason').addEventListener('blur', saveReason);

// ----- Người trả -----

function renderPayer() {
  const payer = validPayer();
  const absent = Boolean(me && person(me).absent);
  const isMe = payer?.member === me;

  if (!payer) $('payerText').textContent = 'Chưa ai nhận trả.';
  else if (isMe) $('payerText').textContent = 'Hôm nay tớ trả nha.';
  else $('payerText').textContent = `Hôm nay ${memberName(payer.member)} trả.`;

  $('payerBtn').hidden = absent || !me;
  if (!payer) $('payerBtn').textContent = 'Hôm nay tớ trả';
  else $('payerBtn').textContent = isMe ? 'Thôi, tớ không trả nữa' : 'Giành trả';

  const select = $('payerAccount');
  select.hidden = !isMe;
  if (isMe && document.activeElement !== select) {
    const key = `${me}`;
    if (select.dataset.owner !== key) {
      select.replaceChildren(...ACCOUNTS[me].list.map((a) => new Option(`${BANKS[a.bank].name} · ${a.no}`, a.no)));
      select.dataset.owner = key;
    }
    select.value = payer.account.no;
  }
}

$('payerBtn').addEventListener('click', () => {
  if (!me) return;
  const payer = validPayer();
  if (payer?.member === me) {
    writeExtra('payer', null);
    return;
  }
  if (payer && !window.confirm(`Giành trả với ${memberName(payer.member)} thật à?`)) return;
  writeExtra('payer', { member: me, account: ACCOUNTS[me].list[0].no });
});

$('payerAccount').addEventListener('change', () => writeExtra('payer/account', $('payerAccount').value));

// ----- Hướng dương -----

function renderSeeds() {
  const seeds = extras.seeds ?? 0;
  $('seedsCount').textContent = `${seeds} gói`;
  $('seedsMinus').disabled = seeds <= 0;
  $('seedsPlus').disabled = seeds >= MAX_SEEDS;
  if (!seeds) $('seedsInfo').textContent = `${formatK(SUNFLOWER_K)} một gói.`;
  else if (!bill.goingCount) $('seedsInfo').textContent = 'Chưa có ai đi để chia.';
  else $('seedsInfo').textContent = `${formatK(seeds * SUNFLOWER_K)} chia ${bill.goingCount} người: ${formatK(bill.seedK)} mỗi người.`;
}

// Transaction để hai người bấm cùng lúc vẫn cộng đủ.
async function bumpSeeds(delta) {
  try {
    await runTransaction(ref(db, `extras/${day}/seeds`), (n) => Math.min(MAX_SEEDS, Math.max(0, (n ?? 0) + delta)));
  } catch (err) {
    console.error(err);
    showBanner('Chưa lưu được, thử lại nha.');
  }
}

$('seedsMinus').addEventListener('click', () => bumpSeeds(-1));
$('seedsPlus').addEventListener('click', () => bumpSeeds(1));

// ----- Tiền của tớ + QR -----

function transferNote(senderName) {
  const now = new Date();
  return `nuoc ${pad(now.getDate())}${pad(now.getMonth() + 1)} ${fold(senderName)}`;
}

function qrUrl(transfer) {
  const { account, holderAscii, amount, note } = transfer;
  // Dùng thẳng .svg: link .png chỉ chuyển hướng sang .svg và bước chuyển hướng đó chặn fetch.
  return `https://img.vietqr.io/image/${BANKS[account.bank].bin}-${account.no}-compact2.svg`
    + `?amount=${amount}&addInfo=${encodeURIComponent(note)}&accountName=${encodeURIComponent(holderAscii)}`;
}

function deepLink(transfer, appId) {
  const { account, holderAscii, amount, note } = transfer;
  return `https://dl.vietqr.io/pay?app=${appId}&ba=${account.no}@${account.bank.toLowerCase()}`
    + `&am=${amount}&tn=${encodeURIComponent(note)}&bn=${encodeURIComponent(holderAscii)}`
    + `&url=${encodeURIComponent(SITE_URL)}`;
}

// App ngân hàng chỉ đọc được ảnh thường, nên đổi SVG của VietQR sang PNG.
async function renderQrPng(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`QR ${res.status}`);
  const blobUrl = URL.createObjectURL(new Blob([await res.text()], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = blobUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = (img.naturalWidth || 500) * 2;
    canvas.height = (img.naturalHeight || 600) * 2;
    const ctx = canvas.getContext('2d');
    const draw = () => {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    // Safari có thể chưa vẽ ảnh nhúng trong SVG ở lần đầu.
    draw();
    await new Promise((resolve) => setTimeout(resolve, 250));
    draw();
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('empty png'))), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function prepareQrPng(url) {
  if (qrPng?.url === url) return;
  qrPng = { url, blob: renderQrPng(url) };
  qrPng.blob.catch((err) => console.error(err));
}

function renderBankLink() {
  const appId = $('bankApp').value;
  const link = $('openBank');
  link.hidden = !appId || !transfer;
  $('bankHint').hidden = !appId || appId === AUTOFILL_APP;
  if (appId && transfer) {
    link.href = deepLink(transfer, appId);
    link.textContent = `Mở app ${BANKS[appId.toUpperCase()].name}`;
  }
}

function flashMessage(text) {
  $('qrMsg').textContent = text;
  clearTimeout(qrMsgTimer);
  qrMsgTimer = setTimeout(() => { $('qrMsg').textContent = ''; }, 3000);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    flashMessage(`Đã copy ${text}`);
  } catch {
    // Mở bằng http:// thì trình duyệt không cho copy tự động.
    window.prompt('Copy đoạn này:', text);
  }
}

async function saveQr() {
  try {
    const blob = await qrPng.blob;
    const file = new File([blob], 'qr-chuyen-tien.png', { type: 'image/png' });
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    // iPhone: tải về sẽ vào app Tệp, phải qua menu chia sẻ mới lưu được vào Ảnh.
    if (isIOS && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    flashMessage('Đã lưu ảnh QR.');
  } catch (err) {
    console.error(err);
    flashMessage('Chưa lưu được, cậu chụp màn hình giúp tớ nha.');
  }
}

$('bankApp').addEventListener('change', () => {
  saveBankApp($('bankApp').value);
  renderBankLink();
});
$('saveQr').addEventListener('click', saveQr);
$('copyNo').addEventListener('click', () => copyText(transfer.account.no));
$('copyAmount').addEventListener('click', () => copyText(String(transfer.amount)));

function billLines(r) {
  const lines = [];
  if (r.choice) {
    const label = `${r.choice.name}${r.choice.size ? ` ${r.choice.size}` : ''}`;
    lines.push(`${label}: ${r.drinkK === null ? 'chưa có giá' : formatK(r.drinkK)}`);
  } else if (r.going) {
    lines.push('Không uống gì');
  }
  if (r.toppingK) lines.push(`Topping: ${formatK(r.toppingK)}`);
  if (r.seedK) lines.push(`Hướng dương: ${formatK(r.seedK)}`);
  r.invited.forEach((id) => {
    const guest = bill.rows.get(id);
    lines.push(`Mời ${memberName(id)}: ${guest.priceMissing ? 'chưa có giá' : formatK(guest.ownK)}`);
  });
  return lines;
}

function setQr(next) {
  transfer = next;
  $('qrWrap').hidden = !next;
  if (!next) return;
  const url = qrUrl(next);
  const img = $('qrImg');
  if (img.getAttribute('src') !== url) img.src = url;
  $('qrInfo').textContent = `${BANKS[next.account.bank].name} · ${next.account.no} · ${next.holder}`;
  prepareQrPng(url);
  renderBankLink();
}

function renderMyPay() {
  const r = me ? bill.rows.get(me) : null;
  const show = Boolean(r && !person(me).absent && (r.going || r.invited.length || validPayer()?.member === me));
  $('payBox').hidden = !show;
  setQr(null);
  if (!show) return;

  const payer = validPayer();
  const lines = r.rootId !== me ? [] : billLines(r);
  $('payLines').replaceChildren(...lines.map((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    return li;
  }));

  if (r.rootId !== me) {
    $('payTitle').textContent = `${memberName(r.rootId)} mời cậu rồi, khỏi trả.`;
  } else if (payer?.member === me) {
    const incoming = [...bill.rows.values()].filter((x) => x.going && x.rootId === x.id && x.id !== me);
    const missing = incoming.some((x) => x.totalMissing);
    const sum = incoming.reduce((s, x) => s + x.totalK, 0);
    $('payTitle').textContent = missing
      ? 'Còn món chưa có giá, nhập giá ở bảng dưới đã.'
      : `Cậu ứng tiền, mấy đứa kia sẽ chuyển lại ${formatK(sum)}.`;
  } else if (r.totalMissing) {
    $('payTitle').textContent = 'Còn món chưa có giá, nhập giá ở bảng dưới đã.';
  } else if (!payer) {
    $('payTitle').textContent = `Cậu sẽ trả ${formatK(r.totalK)}. Chờ có người nhận trả nha.`;
  } else if (!r.totalK) {
    $('payTitle').textContent = 'Không phải trả đồng nào.';
  } else {
    const holder = ACCOUNTS[payer.member].holder;
    $('payTitle').textContent = `Cậu chuyển cho ${memberName(payer.member)}: ${formatK(r.totalK)}`;
    setQr({
      account: payer.account,
      holder,
      holderAscii: fold(holder).toUpperCase(),
      amount: r.totalK * 1000,
      note: transferNote(memberName(me)),
    });
  }
}

// ----- Bảng tiền cả nhóm -----

function reaches(from, target) {
  const seen = new Set();
  let current = from;
  while (current && !seen.has(current)) {
    if (current === target) return true;
    seen.add(current);
    current = bill.rows.get(current)?.treatedBy;
  }
  return false;
}

function drinkOptionLabel(c, prefix) {
  const k = drinkK(c);
  const price = k === null ? 'tự gõ' : `${k + toppingsK(c)}k`;
  return `${prefix}${c.name}${c.size ? ` ${c.size}` : ''} (${price})`;
}

function saveOverride(id, override) {
  const stored = { name: override.name };
  if (override.size) stored.size = override.size;
  if (override.toppings?.length) stored.toppings = override.toppings;
  setPerson(id, 'override', stored);
}

function billRow(r) {
  const row = document.createElement('div');
  row.className = 'row bill-row';

  const head = document.createElement('div');
  head.className = 'bill-head';
  const name = document.createElement('span');
  name.className = 'row-name';
  name.textContent = memberName(r.id);
  const amount = document.createElement('span');
  amount.className = 'row-name';
  if (r.rootId !== r.id) amount.textContent = `${memberName(r.rootId)} mời`;
  else amount.textContent = r.totalMissing ? 'Chưa có giá' : formatK(r.totalK);
  head.append(name, amount);
  row.append(head);

  const choices = (orders?.[r.id]?.choices || []).map(normalize);
  const select = document.createElement('select');
  select.className = 'opt bill-select';
  select.setAttribute('aria-label', `Món thật của ${memberName(r.id)}`);
  choices.forEach((c, i) => { if (c.name) select.add(new Option(drinkOptionLabel(c, `${i + 1}. `), String(i))); });
  const override = person(r.id).override ? normalize(person(r.id).override) : null;
  if (override) select.add(new Option(drinkOptionLabel(override, 'Khác: '), String(OVERRIDE_INDEX)));
  select.add(new Option('Không uống gì', '-1'));
  select.add(new Option('Món khác...', 'other'));
  select.value = String(r.actual);
  select.addEventListener('change', () => {
    if (select.value === 'other') {
      select.value = String(r.actual);
      openOverridePicker(r.id);
    } else {
      setPerson(r.id, 'actual', Number(select.value));
    }
  });
  row.append(select);

  if (r.actual === OVERRIDE_INDEX) {
    const extras2 = document.createElement('div');
    extras2.className = 'opts';
    if (r.choice.size) {
      extras2.append(makeSelect(`Size món của ${memberName(r.id)}`, [['M', 'Size M'], ['L', 'Size L']], (v) => saveOverride(r.id, { ...r.choice, size: v })));
      extras2.lastChild.value = r.choice.size;
    }
    const topping = document.createElement('button');
    topping.type = 'button';
    topping.className = 'opt opt-topping';
    topping.textContent = r.choice.toppings.length ? `+ ${r.choice.toppings.join(', ')}` : 'Thêm topping';
    topping.addEventListener('click', () => openToppings(r.choice.toppings, (next) => {
      saveOverride(r.id, { ...normalize(person(r.id).override), toppings: next });
    }));
    extras2.append(topping);
    row.append(extras2);
  }

  if (r.needsManual) {
    const price = document.createElement('input');
    price.className = 'opt-note';
    price.inputMode = 'numeric';
    price.placeholder = 'Giá món tự gõ (nghìn đồng), ví dụ 35';
    price.setAttribute('aria-label', `Giá món của ${memberName(r.id)}, tính bằng nghìn đồng`);
    if (r.manualPrice !== undefined) price.value = String(r.manualPrice);
    price.addEventListener('change', () => {
      const n = Number.parseInt(price.value, 10);
      setPerson(r.id, 'manualPrice', Number.isInteger(n) && n >= 0 && n <= 1000 ? n : null);
    });
    row.append(price);
  }

  const lines = billLines(r);
  if (lines.length && r.rootId === r.id) {
    const detail = document.createElement('div');
    detail.className = 'row-picks';
    detail.textContent = lines.join(' · ');
    row.append(detail);
  }

  if (me && r.id !== me && !person(me).absent && bill.rows.get(me)?.going) {
    const mine = r.treatedBy === me;
    if (mine || (!r.treatedBy && !reaches(me, r.id))) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'invite';
      btn.textContent = mine ? 'Bỏ mời' : 'Tớ mời bạn này';
      btn.addEventListener('click', () => setPerson(r.id, 'treatedBy', mine ? null : me));
      row.append(btn);
    }
  }
  return row;
}

function renderBillRows() {
  const active = document.activeElement;
  if (active && $('billRows').contains(active) && active.tagName !== 'BUTTON') return;
  const rows = MEMBERS.map((m) => bill.rows.get(m.id)).filter((r) => r?.going);
  $('billRows').replaceChildren(...rows.map(billRow));
  $('billEmpty').hidden = rows.length > 0;
}

$('billRows').addEventListener('focusout', () => setTimeout(renderBillRows, 0));

function renderAll() {
  bill = computeBill(MEMBERS.map((m) => ({
    id: m.id,
    choices: (orders?.[m.id]?.choices || []).map(normalize),
    ...person(m.id),
    override: person(m.id).override ? normalize(person(m.id).override) : undefined,
  })), extras.seeds ?? 0);
  renderOthers();
  renderAbsent();
  renderPayer();
  renderSeeds();
  renderMyPay();
  renderBillRows();
}

function setMe(id) {
  if (me !== id) saveNow(); // thay đổi đang dở thuộc về tên cũ
  me = id;
  saveMe(id);
  $('whoBtn').textContent = `Tớ là: ${memberName(id)}`;
  $('payerAccount').dataset.owner = '';
  loadDraft();
  syncStatus();
  renderAll();
}

// ----- Hộp thoại -----

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

$('menuBtn').addEventListener('click', () => $('menuDlg').showModal());

function choose(name, hasSizes) {
  if (overrideFor) {
    saveOverride(overrideFor, { name, size: hasSizes ? 'M' : '' });
    setPerson(overrideFor, 'actual', OVERRIDE_INDEX);
    $('pickDlg').close();
    return;
  }
  draft[pickingTier] ={ ...blank(), name, size: hasSizes ? 'M' : '' };
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

function showPicker(canClear) {
  $('pickSearch').value = '';
  $('pickClear').hidden = !canClear;
  renderPickList();
  $('pickDlg').showModal();
}

function openPicker(i) {
  pickingTier = i;
  overrideFor = null;
  showPicker(Boolean(draft[i].name));
}

function openOverridePicker(id) {
  overrideFor = id;
  showPicker(false);
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

function openToppings(initial, onChange) {
  let selected = [...initial];
  $('toppingList').replaceChildren(...TOPPINGS.map((t) => {
    const label = document.createElement('label');
    label.className = 'topping-row';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = selected.includes(t.name);
    box.addEventListener('change', () => {
      const others = selected.filter((name) => name !== t.name);
      selected = box.checked ? [...others, t.name] : others;
      onChange(selected);
    });
    const name = document.createElement('span');
    name.textContent = t.name;
    const price = document.createElement('span');
    price.className = 'pick-price';
    price.textContent = `+${t.p}k`;
    label.append(box, name, price);
    return label;
  }));
  $('toppingDlg').showModal();
}

$('toppingClose').addEventListener('click', () => $('toppingDlg').close());

// Lưu khi rời trang, xoá hết
window.addEventListener('pagehide', () => {
  saveNow();
  saveReason();
});

$('clearBtn').addEventListener('click', () => {
  if (draft.every((c) => !c.name)) return;
  if (!window.confirm('Xoá hết món của cậu thật à?')) return;
  draft = draft.map(blank);
  draft.forEach((_, i) => renderTier(i));
  markDirty();
  saveNow();
});

// ----- Dữ liệu realtime của hôm nay -----

onValue(ref(db, `orders/${day}`), (snap) => {
  orders = snap.val() || {};
  showBanner('');
  if (!dirty) {
    loadDraft();
    syncStatus();
  }
  renderAll();
}, (err) => {
  console.error(err);
  showBanner('Chưa đọc được dữ liệu từ Firebase.');
});

onValue(ref(db, `extras/${day}`), (snap) => {
  extras = snap.val() || {};
  renderAll();
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
  if (document.hidden) {
    saveNow();
    saveReason();
  } else if (dayKey() !== day && !dirty) {
    location.reload();
  }
});

// Khởi động
$('bankApp').add(new Option('Chọn app ngân hàng của cậu', ''));
Object.entries(BANKS).forEach(([key, bank]) => {
  const appId = key.toLowerCase();
  $('bankApp').add(new Option(appId === AUTOFILL_APP ? `${bank.name} (tự điền sẵn)` : bank.name, appId));
});
$('bankApp').value = loadBankApp();
if ($('bankApp').selectedIndex < 0) $('bankApp').value = '';

const now = new Date();
$('date').textContent = `${WEEKDAYS[now.getDay()]}, ${pad(now.getDate())}/${pad(now.getMonth() + 1)}`;
draft.forEach((_, i) => renderTier(i));
renderAll();
if (me) setMe(me);
else $('whoDlg').showModal();
