// ===== popup/shop_pane.js =====
// Shop 탭 전용 모듈: initPane(root), destroyPane()

/* Null-safe helpers */
const on  = (el, ev, fn) => el && el.addEventListener(ev, fn);
const off = (el, ev, fn) => el && el.removeEventListener(ev, fn);

// CHG: 포인트는 전부 background 권위 경로로 호출
import { Points, bindBalanceUpdates } from '../shimeji/points_client.js';

/** 디버그 모드: true 일 때만 +100 / -100 / 초기화 버튼 노출·동작 */
const DEBUG_SHOP_POINTS = false;

/* Storage / Items (포인트 제외한 상점 상태만 로컬에 저장) */
const STORE_KEY = 'shimeji_store_v1';

const BASE_PRESET = { id: 'cat_default', hue: 0,   sat: 120, bri: 100, con: 100, opa: 100 };
const DEFAULT_STATE = {
  // 색 프리셋
  owned: { cat_default: true, cat_pink: false, cat_lime: false },
  activeColorPreset: null,
  // 커스텀 컬러 툴
  unlockedTools: { color_tool: false },
  // 악세서리 소유/장착 상태
  ownedAccessories: {
    ribbon_red: false,
    hat_blue:  false
  },
  equippedAccessories: {
    neck: null,   // 예: 'ribbon_red'
    head: null    // 예: 'hat_blue'
  }
};

// 모든 카드 썸네일은 동일 이미지 재사용 (개별 이미지도 가능)
const THUMB = 'assets/Thumbnail.png';

// 악세서리 전용 썸네일 (없으면 THUMB 재사용해도 됨)
const RIBBON_IMG = 'assets/accessories/acc_ribbon_red.png';
const HAT_IMG    = 'assets/accessories/acc_hat_blue.png';

const ITEMS = [
  // ----- 색 프리셋 -----
  { kind: 'preset', id: 'cat_default', name: 'Default Cat', price: 0,   img: THUMB, preset: { ...BASE_PRESET } },
  { kind: 'preset', id: 'cat_pink',    name: 'Pink Cat',    price: 100, img: THUMB, preset: { id: 'cat_pink', hue: 120, sat: 150, bri: 100, con: 100, opa: 100 } },
  { kind: 'preset', id: 'cat_lime',    name: 'Light Lime',  price: 150, img: THUMB, preset: { id: 'cat_lime', hue: 275, sat: 190, bri: 100, con: 100, opa: 100 } },

  // ----- 악세서리 (슬롯 기반) -----
  // slot: 'neck' | 'head' | ... 로 확장 가능
  { kind: 'accessory', slot: 'neck', id: 'ribbon_red', name: 'Red Ribbon', price: 120, img: RIBBON_IMG },
  { kind: 'accessory', slot: 'head', id: 'hat_blue',   name: 'Blue Hat',   price: 180, img: HAT_IMG },

  // ----- 도구 -----
  { kind: 'tool',   id: 'color_tool',  name: 'Custom Color', price: 300, img: THUMB }
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
  const raw = obj[STORE_KEY] || {};
  const st  = { ...DEFAULT_STATE, ...raw };

  // 프리셋 소유 보정
  st.owned = {
    cat_default: !!st.owned?.cat_default,
    cat_pink:    !!st.owned?.cat_pink,
    cat_lime:    !!st.owned?.cat_lime
  };

  // 툴 보정
  st.unlockedTools = { color_tool: !!st.unlockedTools?.color_tool };

  // 악세서리 소유/장착 보정
  st.ownedAccessories = {
    ribbon_red: !!st.ownedAccessories?.ribbon_red,
    hat_blue:   !!st.ownedAccessories?.hat_blue
  };
  st.equippedAccessories = {
    neck: st.equippedAccessories?.neck || null,
    head: st.equippedAccessories?.head || null
  };

  return st;
}

async function saveState(st) {
  // 포인트 필드를 절대 넣지 않도록 방어
  const {
    owned,
    activeColorPreset,
    unlockedTools,
    ownedAccessories,
    equippedAccessories
  } = st;

  await chrome.storage.local.set({
    [STORE_KEY]: {
      owned,
      activeColorPreset,
      unlockedTools,
      ownedAccessories,
      equippedAccessories
    }
  });
}

/* UI helpers */
function updatePointsLabel(n) {
  if (pointsLabel) pointsLabel.textContent = String(n);
}
function presetToFilter(p) {
  return p
    ? `hue-rotate(${p.hue}deg) saturate(${p.sat}%) brightness(${p.bri}%) contrast(${p.con}%)`
    : 'none';
}

/* Active tab messaging (content.js / color_ui.js 쪽에서 처리) */
function applyToActiveTab(preset) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs?.[0]; if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { type: 'APPLY_COLOR_PRESET', preset });
  });
}

// 악세서리 장착 정보 브로드캐스트
function applyAccessoriesToActiveTab(equippedAccessories) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs?.[0]; if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, {
      type: 'APPLY_ACCESSORIES',
      equipped: equippedAccessories
    });
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
  let owned = false;
  let isEquipped = false;

  if (item.kind === 'tool') {
    owned = !!st.unlockedTools[item.id];
  } else if (item.kind === 'accessory') {
    owned = !!st.ownedAccessories[item.id];
    const slotId = st.equippedAccessories[item.slot];
    isEquipped = slotId === item.id;
  } else { // preset
    owned = !!st.owned[item.id];
  }

  const activePresetId = st.activeColorPreset?.id || null;

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
        <button class="act"></button>
      </div>
    </div>`;

  const img = el.querySelector('.thumb');
  const btn = el.querySelector('.act');

  // 썸네일 필터 (프리셋 전용)
  if (item.kind === 'preset') img.style.filter = presetToFilter(item.preset);

  // 버튼 텍스트 설정
  if (!owned) {
    btn.textContent = '구매';
  } else {
    if (item.kind === 'tool') {
      btn.textContent = '열기';
    } else if (item.kind === 'accessory') {
      btn.textContent = isEquipped ? '해제' : '장착';
    } else { // preset
      btn.textContent = (activePresetId === item.id) ? '사용중' : '적용';
    }
  }

  const onClick = async () => {
    const cur = await loadState();

    // ----- 도구 -----
    if (item.kind === 'tool') {
      if (!cur.unlockedTools[item.id]) {
        const r = await Points.spend(item.price, `buy:${item.id}`);
        if (!r.ok) {
          alert(r.reason === 'insufficient'
            ? '포인트가 부족합니다.'
            : `구매 실패: ${r.reason || 'unknown'}`);
          return;
        }
        cur.unlockedTools[item.id] = true;
        await saveState(cur);
        await rerender();
      } else {
        openToolOnActiveTab();
      }
      return;
    }

    // ----- 악세서리 -----
    if (item.kind === 'accessory') {
      const slot = item.slot;

      if (!cur.ownedAccessories[item.id]) {
        // 최초 구매
        const r = await Points.spend(item.price, `buy:acc:${item.id}`);
        if (!r.ok) {
          alert(r.reason === 'insufficient'
            ? '포인트가 부족합니다.'
            : `구매 실패: ${r.reason || 'unknown'}`);
          return;
        }
        cur.ownedAccessories[item.id] = true;
      }

      // 장착 토글
      const currently = cur.equippedAccessories[slot] || null;
      if (currently === item.id) {
        // 이미 장착 중이면 해제
        cur.equippedAccessories[slot] = null;
      } else {
        cur.equippedAccessories[slot] = item.id;
      }

      await saveState(cur);
      applyAccessoriesToActiveTab(cur.equippedAccessories);
      await rerender();
      return;
    }

    // ----- 색 프리셋 -----
    if (!cur.owned[item.id]) {
      const r = await Points.spend(item.price, `buy:${item.id}`);
      if (!r.ok) {
        alert(r.reason === 'insufficient'
          ? '포인트가 부족합니다.'
          : `구매 실패: ${r.reason || 'unknown'}`);
        return;
      }
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

  storeGrid.innerHTML = '';

  // 1) 상점 상태 로드 (포인트와 독립)
  const st = await loadState();

  // 2) 포인트 조회 (실패해도 UI가 깨지지 않게)
  let balance = 0;
  try {
    balance = await Points.get();
  } catch (e) {
    console.warn('[Shop] Points.get 실패, 0으로 폴백합니다.', e);
  }
  updatePointsLabel(balance);

  // 3) 아이템 카드 렌더링
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

  // 디버그 컨트롤 래퍼
  const debugWrap = root.querySelector('#debugControls');

  // 플래그가 꺼져 있으면 아예 숨김
  if (!DEBUG_SHOP_POINTS && debugWrap) {
    debugWrap.style.display = 'none';
  }

  // 실시간 포인트 갱신 바인딩 (디버그 여부와 무관)
  const unbind = bindBalanceUpdates((b) => updatePointsLabel(b));
  bound.push({ el: null, ev: 'POINTS_UPDATED', fn: unbind }); // destroyPane에서 호출 용도

  // 디버그/관리용 버튼은 플래그가 true일 때만 활성화
  if (DEBUG_SHOP_POINTS && debugWrap && btnAdd && btnSub && btnReset) {
    const onAdd = async () => {
      const r = await Points.earn(100, 'debug:add100');
      if (!r.ok) alert(`증가 실패: ${r.reason || 'unknown'}`);
      await renderStore();
    };

    const onSub = async () => {
      const r = await Points.spend(100, 'debug:sub100');
      if (!r.ok) {
        alert(r.reason === 'insufficient'
          ? '포인트가 부족합니다.'
          : `감소 실패: ${r.reason || 'unknown'}`);
      }
      await renderStore();
    };

    const onReset = async () => {
      // 상점 상태만 초기화(포인트는 권위 경로 유지)
      const st = { ...DEFAULT_STATE };
      await saveState(st);
      applyToActiveTab(BASE_PRESET);
      applyAccessoriesToActiveTab(st.equippedAccessories);
      await renderStore();

      // 포인트까지 0으로 초기화 (디버그용)
      const bal = await Points.get();
      if (bal > 0) await Points.spend(bal, 'reset:toZero');
    };

    on(btnAdd,   'click', onAdd);   bound.push({ el: btnAdd,  ev:'click', fn:onAdd });
    on(btnSub,   'click', onSub);   bound.push({ el: btnSub,  ev:'click', fn:onSub });
    on(btnReset, 'click', onReset); bound.push({ el: btnReset,ev:'click', fn:onReset });
  }

  await renderStore();
}

export function destroyPane() {
  // 이벤트 해제
  bound.forEach(({ el, ev, fn }) => {
    if (el) off(el, ev, fn);
    else if (typeof fn === 'function') fn(); // bindBalanceUpdates 해제
  });
  bound.length = 0;

  // 레퍼런스 정리
  root = storeGrid = btnAdd = btnSub = btnReset = pointsLabel = null;
}
