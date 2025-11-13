// ===== popup/shop_pane.js =====
// Shop 탭 전용 모듈: initPane(root), destroyPane()

/* Null-safe helpers */
const on  = (el, ev, fn) => el && el.addEventListener(ev, fn);
const off = (el, ev, fn) => el && el.removeEventListener(ev, fn);

// CHG: 포인트는 전부 background 권위 경로로 호출
import { Points, bindBalanceUpdates } from '../shimeji/points_client.js';

/* Storage / Items (포인트 제외한 상점 상태만 로컬에 저장) */
const STORE_KEY = 'shimeji_store_v1';

const BASE_PRESET = { id: 'cat_default', hue: 0,   sat: 120, bri: 100, con: 100, opa: 100 };
const DEFAULT_STATE = {
  // CHG: points 제거 (포인트는 background가 관리)
  owned: { cat_default: true, cat_pink: false, cat_lime: false },
  activeColorPreset: null,
  unlockedTools: { color_tool: false }
};

// 모든 카드 썸네일은 동일 이미지 재사용
const THUMB = 'assets/Thumbnail.png';
const ITEMS = [
  { kind: 'preset', id: 'cat_default', name: 'Default Cat', price: 0,   img: THUMB, preset: { ...BASE_PRESET } },
  { kind: 'preset', id: 'cat_pink',    name: 'Pink Cat',    price: 100, img: THUMB, preset: { id: 'cat_pink', hue: 120, sat: 150, bri: 100, con: 100, opa: 100 } },
  { kind: 'preset', id: 'cat_lime',    name: 'Light Lime',  price: 150, img: THUMB, preset: { id: 'cat_lime', hue: 275, sat: 190, bri: 100, con: 100, opa: 100 } },
  { kind: 'tool',   id: 'color_tool',  name: 'Custom Color',price: 300, img: THUMB }
];

/* Module-scoped refs for cleanup */
let root = null;
let storeGrid = null;
let btnAdd = null, btnSub = null, btnReset = null;
let pointsLabel = null;
const bound = []; // [{el, ev, fn}] for destroy

/* Storage helpers (포인트 제외) */
async function loadState() {
  const obj = await chrome.storage.local.get(STORE_KEY);
  const st = { ...DEFAULT_STATE, ...(obj[STORE_KEY] || {}) };
  st.owned = {
    cat_default: !!st.owned?.cat_default,
    cat_pink:    !!st.owned?.cat_pink,
    cat_lime:    !!st.owned?.cat_lime
  };
  st.unlockedTools = { color_tool: !!st.unlockedTools?.color_tool };
  return st;
}
async function saveState(st) {
  // CHG: 포인트 필드를 절대 넣지 않도록 방어
  const { owned, activeColorPreset, unlockedTools } = st;
  await chrome.storage.local.set({ [STORE_KEY]: { owned, activeColorPreset, unlockedTools } });
}

/* UI helpers */
function updatePointsLabel(n) {
  if (pointsLabel) pointsLabel.textContent = String(n);
}
function presetToFilter(p) {
  return p ? `hue-rotate(${p.hue}deg) saturate(${p.sat}%) brightness(${p.bri}%) contrast(${p.con}%)` : 'none';
}

/* Active tab messaging */
function applyToActiveTab(preset) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs?.[0]; if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { type: 'APPLY_COLOR_PRESET', preset });
  });
}
function openToolOnActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs?.[0]; if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { type: 'OPEN_COLOR_TOOL' });
  });
}

/* Card factory */
function makeCard(item, st, rerender) {
  const owned = item.kind === 'tool' ? !!st.unlockedTools[item.id] : !!st.owned[item.id];
  const activeId = st.activeColorPreset?.id || null;

  const el = document.createElement('div');
  el.className = 'card' + (owned ? ' owned' : '');
  el.innerHTML = `
    <div class="imgwrap">
      <img class="thumb" src="${item.img}" alt="${item.name}">
    </div>
    <div class="meta">
      <div class="row">
        <div>${item.name}</div>
        <div class="price">${item.price} pt</div>
      </div>
      <div class="row">
        <div></div>
        <button class="act">${owned ? (item.kind==='tool' ? '열기' : (activeId===item.id?'사용중':'적용')) : '구매'}</button>
      </div>
    </div>`;

  const img = el.querySelector('.thumb');
  if (item.kind === 'preset') img.style.filter = presetToFilter(item.preset);

  const btn = el.querySelector('.act');
  const onClick = async () => {
    const cur = await loadState();

    if (item.kind === 'tool') {
      if (!cur.unlockedTools[item.id]) {
        // CHG: 직접 차감 금지 → 권위 경로로 결제
        const r = await Points.spend(item.price, `buy:${item.id}`);
        if (!r.ok) { alert(r.reason === 'insufficient' ? '포인트가 부족합니다.' : `구매 실패: ${r.reason||'unknown'}`); return; }
        cur.unlockedTools[item.id] = true;
        await saveState(cur);
        await rerender(); // 카드 상태 갱신
      } else {
        openToolOnActiveTab();
      }
      return;
    }

    // preset
    if (!cur.owned[item.id]) {
      // CHG: 직접 차감 금지 → 권위 경로로 결제
      const r = await Points.spend(item.price, `buy:${item.id}`);
      if (!r.ok) { alert(r.reason === 'insufficient' ? '포인트가 부족합니다.' : `구매 실패: ${r.reason||'unknown'}`); return; }
      cur.owned[item.id] = true;
    }
    cur.activeColorPreset = { ...item.preset };
    await saveState(cur);
    applyToActiveTab(cur.activeColorPreset);
    await rerender();
  };
  on(btn, 'click', onClick);
  bound.push({ el: btn, ev: 'click', fn: onClick });

  return el;
}

/* Render store grid */
async function renderStore() {
  if (!storeGrid) return;
  const st = await loadState();
  // CHG: 포인트 표시는 권위 경로에서 조회
  updatePointsLabel(await Points.get());
  storeGrid.innerHTML = '';
  ITEMS.forEach((it) => storeGrid.appendChild(makeCard(it, st, renderStore)));
}

/* Public API */
export async function initPane(rootEl) {
  root = rootEl;
  if (!root) return;

  storeGrid   = root.querySelector('#store');
  btnAdd      = root.querySelector('#add100');
  btnSub      = root.querySelector('#sub100');
  btnReset    = root.querySelector('#resetShop');
  pointsLabel = document.querySelector('#points');

  // CHG: 실시간 포인트 갱신 바인딩 (선택)
  const unbind = bindBalanceUpdates((b) => updatePointsLabel(b));
  bound.push({ el: null, ev: 'POINTS_UPDATED', fn: unbind }); // destroyPane에서 호출 용도로만 저장

  // Buttons (디버그/관리용)
  const onAdd = async () => { 
    // CHG: 직접 증가 금지
    const r = await Points.earn(100, 'debug:add100');
    if (!r.ok) alert(`증가 실패: ${r.reason||'unknown'}`);
    await renderStore();
  };
  const onSub = async () => { 
    // CHG: 직접 감소 금지
    const r = await Points.spend(100, 'debug:sub100');
    if (!r.ok) alert(r.reason === 'insufficient' ? '포인트가 부족합니다.' : `감소 실패: ${r.reason||'unknown'}`);
    await renderStore();
  };
  const onReset = async () => {
    // 상점 상태만 초기화(포인트는 권위 경로 유지)
    const st = { ...DEFAULT_STATE };
    await saveState(st);
    applyToActiveTab(BASE_PRESET);
    await renderStore();

    // CHG(옵션): 포인트도 0으로 초기화하고 싶다면 주석 해제
    // const bal = await Points.get();
    // if (bal > 0) await Points.spend(bal, 'reset:toZero');
  };

  on(btnAdd,   'click', onAdd);   bound.push({ el: btnAdd,  ev:'click', fn:onAdd });
  on(btnSub,   'click', onSub);   bound.push({ el: btnSub,  ev:'click', fn:onSub });
  on(btnReset, 'click', onReset); bound.push({ el: btnReset,ev:'click', fn:onReset });

  await renderStore();
}

export function destroyPane() {
  // 이벤트 해제
  bound.forEach(({ el, ev, fn }) => {
    if (el) off(el, ev, fn);
    else if (typeof fn === 'function') fn(); // CHG: bindBalanceUpdates 해제
  });
  bound.length = 0;

  // 레퍼런스 정리
  root = storeGrid = btnAdd = btnSub = btnReset = pointsLabel = null;
}
