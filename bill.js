import { MENU, TOPPINGS, SUNFLOWER_K } from './menu.js';

const DRINKS = new Map(MENU.flatMap((g) => g.items.map((item) => [item.name, item])));
const TOPPING_K = new Map(TOPPINGS.map((t) => [t.name, t.p]));

// Giá trị của "actual" khi người đó uống món nằm ngoài 4 lựa chọn (lưu ở "override").
export const OVERRIDE_INDEX = 4;

export const fold =(s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

export function formatK(k) {
  return k ? `${k.toLocaleString('vi-VN')}.000đ` : '0đ';
}

// Giá món theo menu (nghìn đồng); null nếu là món tự gõ.
export function drinkK(choice) {
  const item = DRINKS.get(choice.name);
  if (!item) return null;
  return item.p ?? (choice.size === 'L' ? item.l : item.m);
}

export function toppingsK(choice) {
  return choice.toppings.reduce((sum, name) => sum + (TOPPING_K.get(name) ?? 0), 0);
}

// Người mời cuối cùng trả cho id; vòng lặp mời nhau thì mỗi người tự trả.
function rootOf(id, rows) {
  const seen = new Set([id]);
  let current = id;
  for (;;) {
    const target = rows.get(current).treatedBy;
    if (!target || !rows.get(target)?.going) return current;
    if (seen.has(target)) return id;
    seen.add(target);
    current = target;
  }
}

// people: [{ id, choices, absent, actual, override, manualPrice, treatedBy }]
export function computeBill(people, seeds) {
  const rows = new Map();

  people.forEach((p) => {
    const first = p.choices.findIndex((c) => c.name);
    const going = !p.absent && first >= 0;
    let actual = first;
    if (p.actual === -1) actual = -1;
    else if (p.actual === OVERRIDE_INDEX && p.override?.name) actual = OVERRIDE_INDEX;
    else if (p.choices[p.actual]?.name) actual = p.actual;

    const picked = actual === OVERRIDE_INDEX ? p.override : p.choices[actual];
    const choice = going && actual >= 0 ? picked : null;
    const menuK = choice ? drinkK(choice) : 0;
    rows.set(p.id, {
      id: p.id,
      going,
      actual,
      choice,
      treatedBy: p.treatedBy,
      needsManual: menuK === null,
      manualPrice: p.manualPrice,
      drinkK: menuK ?? p.manualPrice ?? null,
      toppingK: choice ? toppingsK(choice) : 0,
    });
  });

  const goingCount = [...rows.values()].filter((r) => r.going).length;
  const seedK = goingCount ? Math.ceil((seeds * SUNFLOWER_K) / goingCount) : 0;

  rows.forEach((r) => {
    r.seedK = r.going ? seedK : 0;
    r.ownK = (r.drinkK ?? 0) + r.toppingK + r.seedK;
    r.priceMissing = r.drinkK === null;
    r.rootId = r.going ? rootOf(r.id, rows) : r.id;
    r.totalK = 0;
    r.invited = [];
    r.totalMissing = false;
  });

  rows.forEach((r) => {
    if (!r.going) return;
    const root = rows.get(r.rootId);
    root.totalK += r.ownK;
    root.totalMissing = root.totalMissing || r.priceMissing;
    if (root !== r) root.invited.push(r.id);
  });

  return { rows, goingCount, seedK };
}
