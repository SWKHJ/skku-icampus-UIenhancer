// ==== popup.js ====
// Cat Custom Shop (4칸: 기본/핑크/라임/컬러커스텀툴)

const STORE_KEY = 'shimeji_store_v1';

// 기본(초기화 시 적용할) 색 필터 = “기본 고양이”
const BASE_PRESET = { id: 'cat_default', hue: 0, sat: 120, bri: 100, con: 100, opa: 100 };

// 초기 상태: 오직 기본 고양이만 소유
const DEFAULT_STATE = {
  points: 0,
  owned: { cat_default: true }, // 기본만 선구매
  activeColorPreset: null,
  unlockedTools: {}             // { color_tool: true }
};

const $ = (s) => document.querySelector(s);
const pointsEl = $('#points');
const storeEl  = $('#store');

async function loadState() {
  const obj = await chrome.storage.local.get(STORE_KEY);
  const st = { ...DEFAULT_STATE, ...(obj[STORE_KEY] || {}) };
  // 누락 키 보정
  st.owned = { cat_default: !!st.owned?.cat_default, cat_pink: !!st.owned?.cat_pink, cat_lime: !!st.owned?.cat_lime };
  st.unlockedTools = { color_tool: !!st.unlockedTools?.color_tool };
  return st;
}
async function saveState(st) { await chrome.storage.local.set({ [STORE_KEY]: st }); }
function updatePointsLabel(n){ pointsEl.textContent = String(n); }

// 현재 탭에 프리셋 적용
function applyToActiveTab(preset) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs?.[0]; if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { type: 'APPLY_COLOR_PRESET', preset });
  });
}

// 현재 탭에 컬러 툴 열기
function openToolOnActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs?.[0]; if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { type: 'OPEN_COLOR_TOOL' });
  });
}

// 프리셋 → CSS filter 문자열 (썸네일 미리보기용)
function presetToFilter(p) {
  if (!p) return 'none';
  return `hue-rotate(${p.hue}deg) saturate(${p.sat}%) brightness(${p.bri}%) contrast(${p.con}%)`;
}

/* --------------------------
   스토어 아이템 (4칸)
   1) Default Cat (소유)
   2) Pink Cat (hue 120, sat 150)
   3) Light Lime Cat (hue 275, sat 190)
   4) Cat Color Custom Tool (구매 → 열기)
   -------------------------- */

// 모든 카드 썸네일은 동일 이미지 재사용
const THUMB = 'assets/Thumbnail.png';

const ITEMS = [
  {
    kind: 'preset',
    id: 'cat_default',
    name: 'Default Cat',
    price: 0,
    img: THUMB,
    preset: { ...BASE_PRESET }
  },
  {
    kind: 'preset',
    id: 'cat_pink',
    name: 'Pink Cat',
    price: 100,
    img: THUMB,
    preset: { id: 'cat_pink', hue: 120, sat: 150, bri: 100, con: 100, opa: 100 }
  },
  {
    kind: 'preset',
    id: 'cat_lime',
    name: 'Light Lime Cat',
    price: 150,
    img: THUMB,
    preset: { id: 'cat_lime', hue: 275, sat: 190, bri: 100, con: 100, opa: 100 }
  },
  {
    kind: 'tool',
    id: 'color_tool',
    name: 'Custom Cat Color',
    price: 300,
    img: THUMB // 아이콘 대체로 썸네일 재사용
  }
];

// 카드 DOM
function card(item, st) {
  const owned = item.kind === 'tool' ? !!st.unlockedTools[item.id] : !!st.owned[item.id];
  const activeId = st.activeColorPreset?.id || null;

  const el = document.createElement('div');
  el.className = 'card' + (owned ? ' owned' : '');

  const btnText =
    item.kind === 'tool'
      ? (owned ? '열기' : '구매')
      : (owned ? (activeId === item.id ? '사용중' : '적용') : '구매');

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
        <button>${btnText}</button>
      </div>
    </div>
  `;

  // 썸네일에 프리셋 미리보기 필터
  const img = el.querySelector('.thumb');
  if (item.kind === 'preset') {
    img.style.filter = presetToFilter(item.preset);
  } else {
    // 툴 카드 썸네일은 기본색 미리보기로 통일하거나 아이콘으로 대체
    img.style.filter = 'none';
  }

  // 버튼 핸들러
  const btn = el.querySelector('button');
  btn.addEventListener('click', async () => {
    const cur = await loadState();

    if (item.kind === 'tool') {
      if (!cur.unlockedTools[item.id]) {
        if (cur.points < item.price) { alert('포인트가 부족합니다.'); return; }
        cur.points -= item.price;
        cur.unlockedTools[item.id] = true;
        await saveState(cur);
        updatePointsLabel(cur.points);
        render();
      } else {
        openToolOnActiveTab();
      }
      return;
    }

    // 프리셋: 구매 → 적용
    if (!cur.owned[item.id]) {
      if (cur.points < item.price) { alert('포인트가 부족합니다.'); return; }
      cur.points -= item.price;
      cur.owned[item.id] = true;
    }
    cur.activeColorPreset = { ...item.preset };
    await saveState(cur);
    updatePointsLabel(cur.points);
    applyToActiveTab(cur.activeColorPreset);
    render();
  });

  return el;
}

// 렌더
async function render() {
  const st = await loadState();
  updatePointsLabel(st.points);
  storeEl.innerHTML = '';
  ITEMS.forEach(item => storeEl.appendChild(card(item, st)));
}

// 테스트 포인트
$('#add100').addEventListener('click', async () => {
  const st = await loadState(); st.points += 100; await saveState(st); updatePointsLabel(st.points);
});
$('#sub100').addEventListener('click', async () => {
  const st = await loadState(); st.points = Math.max(0, st.points - 100); await saveState(st); updatePointsLabel(st.points);
});

// 초기화: 모든 구매/해금/활성 프리셋 리셋 + 기본색 적용
$('#resetShop').addEventListener('click', async () => {
  const st = { ...DEFAULT_STATE };
  await saveState(st);
  applyToActiveTab(BASE_PRESET);
  render();
});

render();
