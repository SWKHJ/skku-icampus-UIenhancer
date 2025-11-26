// ==== cat-mascot/color_ui.js ====
console.log('[Cat] color UI loaded');

window.catMascot = window.catMascot || {};

const STORE_KEY      = '__cat_color_ui_v1';    // 이 파일(패널)이 쓰는 로컬 상태
const SHOP_STORE_KEY = 'catMascot_store_v1';   // 상점 상태 (presets / tools / accessories)

// =============================
// 1) 로컬 색상 패널 상태
// =============================
const defaults = {
  hue: 0, sat: 120, bri: 100, con: 100, opa: 100,
  x: 24, y: 24, open: false  // 기본은 닫혀있음
};

const load = () => {
  try {
    return Object.assign({}, defaults, JSON.parse(localStorage.getItem(STORE_KEY) || '{}'));
  } catch {
    return { ...defaults };
  }
};
const save = (st) => localStorage.setItem(STORE_KEY, JSON.stringify(st));

// SHOP_STORE(activeColorPreset)에 색상 동기화
function persistColorToShop(st) {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  try {
    chrome.storage.local.get(SHOP_STORE_KEY, (obj) => {
      const prev = obj?.[SHOP_STORE_KEY] || {};
      const next = {
        ...prev,
        activeColorPreset: {
          hue: st.hue,
          sat: st.sat,
          bri: st.bri,
          con: st.con,
          opa: st.opa
        }
      };
      chrome.storage.local.set({ [SHOP_STORE_KEY]: next });
    });
  } catch {}
}

// =============================
// 2) 스프라이트에 색상 / 악세서리 적용 헬퍼
// =============================

// --- 색상 필터 ---
const applyFilters = (st) => {
  const filter = `hue-rotate(${st.hue}deg) saturate(${st.sat}%) brightness(${st.bri}%) contrast(${st.con}%)`;
  document.querySelectorAll('.catMascot-sprite').forEach(el => {
    el.style.filter  = filter;
    el.style.opacity = (st.opa / 100).toString();
  });
};

// --- 악세서리 적용 ---
function applyAccessoriesToSprites(accState) {
  window.catMascot = window.catMascot || {};
  window.catMascot.activeAccessories = accState || {};

  if (typeof window.catMascot.refreshAccessoriesAll === 'function') {
    window.catMascot.refreshAccessoriesAll();
  }
}

// =============================
// 3) 패널 슬라이더 ↔ 상태 동기화
// =============================
function syncPanelSlidersTo(st) {
  const panel = document.querySelector('.catMascot-color-panel');
  if (!panel) return;

  const sync = (k) => {
    const inp = panel.querySelector(`input[data-k="${k}"]`);
    const v   = st[k];
    if (!inp) return;
    inp.value = v;
    const out = inp.parentElement?.querySelector('.v');
    if (out) out.textContent = k === 'hue' ? v : (v + '%');
  };
  ['hue','sat','bri','con','opa'].forEach(sync);
}

function applyPresetFromShop(preset) {
  if (!preset) return;
  const st = load();
  st.hue = preset.hue;
  st.sat = preset.sat;
  st.bri = preset.bri;
  st.con = preset.con;
  st.opa = preset.opa;
  save(st);
  persistColorToShop(st);
  applyFilters(st);
  syncPanelSlidersTo(st);
}

// =============================
// 4) 패널 DOM 생성
// =============================
function buildPanel() {
  const st    = load();
  const panel = document.createElement('div');
  panel.className = 'catMascot-color-panel';
  panel.style.display = 'none';

  panel.innerHTML = `
    <div class="scp-header">🎨 Custom Cat Color <span class="scp-actions">
      <button data-act="reset" title="Reset">↺</button>
      <button data-act="close" title="Hide">✕</button>
    </span></div>
    <div class="scp-row"><label>Hue</label><input type="range" min="0" max="360" value="${st.hue}" data-k="hue"><span class="v">${st.hue}</span></div>
    <div class="scp-row"><label>Sat</label><input type="range" min="0" max="300" value="${st.sat}" data-k="sat"><span class="v">${st.sat}%</span></div>
    <div class="scp-row"><label>Bri</label><input type="range" min="0" max="200" value="${st.bri}" data-k="bri"><span class="v">${st.bri}%</span></div>
    <div class="scp-row"><label>Con</label><input type="range" min="0" max="200" value="${st.con}" data-k="con"><span class="v">${st.con}%</span></div>
    <div class="scp-row"><label>Opa</label><input type="range" min="0" max="100" value="${st.opa}" data-k="opa"><span class="v">${st.opa}%</span></div>
    <div class="scp-foot">Drag here · Ctrl+Shift+C toggle</div>
  `;

  Object.assign(panel.style, {
    position: 'fixed',
    left: (st.x || 24) + 'px',
    top:  (st.y || 24) + 'px',
    zIndex: 2147483647,
    width: '260px',
    background: 'rgba(24,24,28,0.92)',
    color: '#e6e6e6',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '12px',
    boxShadow: '0 10px 24px rgba(0,0,0,0.35)',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Noto Sans KR, sans-serif',
    fontSize: '12px',
    backdropFilter: 'blur(6px)',
    userSelect: 'none'
  });

  if (!document.querySelector('#__cat_color_ui_style')) {
    const style = document.createElement('style');
    style.id = '__cat_color_ui_style';
    style.textContent = `
      .catMascot-color-panel .scp-header{padding:10px 12px;font-weight:600;display:flex;justify-content:space-between;align-items:center;cursor:grab}
      .catMascot-color-panel .scp-actions button{background:transparent;border:none;color:#ddd;font-size:12px;cursor:pointer;margin-left:6px}
      .catMascot-color-panel .scp-row{display:grid;grid-template-columns:36px 1fr 48px;gap:8px;align-items:center;padding:6px 12px}
      .catMascot-color-panel .scp-row input[type="range"]{width:100%}
      .catMascot-color-panel .scp-row .v{text-align:right;color:#bdbdbd}
      .catMascot-color-panel .scp-foot{padding:8px 12px;color:#9aa0a6;font-size:11px;border-top:1px solid rgba(255,255,255,0.08)}
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(panel);

  // 슬라이더 → 상태
  panel.querySelectorAll('input[type="range"]').forEach(inp => {
    inp.addEventListener('input', () => {
      const k   = inp.dataset.k;
      const v   = Number(inp.value);
      const cur = load();
      cur[k] = v;
      save(cur);
      persistColorToShop(cur);
      applyFilters(cur);
      const out = inp.parentElement?.querySelector('.v');
      if (out) out.textContent = k === 'hue' ? v : (v + '%');
    });
  });

  // Reset / Close
  const onAction = (act, ev) => {
    ev?.stopPropagation();
    ev?.preventDefault();
    const cur = load();
    if (act === 'reset') {
      const reset = { ...defaults, x: cur.x, y: cur.y, open: true };
      save(reset);
      persistColorToShop(reset);
      applyFilters(reset);
      syncPanelSlidersTo(reset);
    } else if (act === 'close') {
      panel.style.display = 'none';
      cur.open = false;
      save(cur);
    }
  };
  panel.querySelector('button[data-act="reset"]').addEventListener('click', (e)=> onAction('reset', e));
  panel.querySelector('button[data-act="close"]').addEventListener('click',  (e)=> onAction('close', e));

  // 드래그 이동
  const header = panel.querySelector('.scp-header');
  let drag = null;
  header.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button[data-act]')) return;
    drag = { ox: e.clientX - panel.offsetLeft, oy: e.clientY - panel.offsetTop };
    header.setPointerCapture?.(e.pointerId);
    header.style.cursor = 'grabbing';
  });
  header.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const nx = Math.min(innerWidth  - panel.offsetWidth,  Math.max(8, e.clientX - drag.ox));
    const ny = Math.min(innerHeight - panel.offsetHeight, Math.max(8, e.clientY - drag.oy));
    panel.style.left = nx + 'px';
    panel.style.top  = ny + 'px';
    const cur = load();
    cur.x = nx; cur.y = ny;
    save(cur);
  });
  const endDrag = (e) => {
    if (!drag) return;
    drag = null;
    header.style.cursor = 'grab';
    header.releasePointerCapture?.(e.pointerId);
  };
  header.addEventListener('pointerup', endDrag);
  header.addEventListener('pointercancel', endDrag);

  return panel;
}

// =============================
// 5) 패널 열기 / 키보드 토글
// =============================
async function openPanel() {
  try {
    const obj = await chrome.storage?.local.get(SHOP_STORE_KEY);
    const unlocked = !!obj?.[SHOP_STORE_KEY]?.unlockedTools?.color_tool;
    if (!unlocked) return;
  } catch {}

  let panel = document.querySelector('.catMascot-color-panel');
  if (!panel) panel = buildPanel();
  panel.style.display = 'block';

  const st = load();
  st.open  = true;
  save(st);
  syncPanelSlidersTo(st);
}

addEventListener('keydown', async (e) => {
  if (!(e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c'))) return;

  let unlocked = false;
  try {
    const obj = await chrome.storage?.local.get(SHOP_STORE_KEY);
    unlocked = !!obj?.[SHOP_STORE_KEY]?.unlockedTools?.color_tool;
  } catch {}

  if (!unlocked) return;

  let panel = document.querySelector('.catMascot-color-panel');
  if (!panel) panel = buildPanel();
  const willShow = panel.style.display === 'none';
  panel.style.display = willShow ? 'block' : 'none';

  const st = load();
  st.open  = willShow;
  save(st);
  if (willShow) syncPanelSlidersTo(st);
});

// =============================
// 6) popup → content 메시지 처리
// =============================
chrome.runtime?.onMessage?.addListener((msg) => {
  if (msg?.type === 'APPLY_COLOR_PRESET' && msg.preset) {
    applyPresetFromShop(msg.preset);
  } else if (msg?.type === 'OPEN_COLOR_TOOL') {
    openPanel();
  } else if (msg?.type === 'APPLY_ACCESSORIES') {
    applyAccessoriesToSprites(msg.equipped || msg.accessories || {});
  }
});

// =============================
// 7) 페이지 로드 시: 저장된 색상/악세서리 복원
// =============================
(async function initFromStorageOnLoad() {
  let localState = load();
  try {
    const obj    = await chrome.storage?.local.get(SHOP_STORE_KEY);
    const stShop = obj?.[SHOP_STORE_KEY] || {};
    const p      = stShop.activeColorPreset;

    // SHOP 쪽에 activeColorPreset 이 있으면 그걸 우선
    if (p && typeof p.hue === 'number') {
      localState = { ...localState, ...p };
    } else {
      // 없으면 현재 localState 를 SHOP 쪽 기본값으로 밀어넣기
      persistColorToShop(localState);
    }

    save(localState);
    applyFilters(localState);

    const acc = stShop.equippedAccessories || stShop.activeAccessories;
    if (acc) applyAccessoriesToSprites(acc);
  } catch {
    save(localState);
    applyFilters(localState);
  }

  // 고양이가 뒤늦게 스폰된 경우를 대비해 한 번 더 적용
  setTimeout(() => applyFilters(load()), 300);
})();

// =============================
// 8) 새 스폰에도 색상/악세서리 유지
// =============================
(function wrapSpawnOnce(){
  if (window.__cat_color_spawn_wrapped__) return;
  window.__cat_color_spawn_wrapped__ = true;

  const tryWrap = () => {
    if (!window.catMascot || typeof window.catMascot.spawn !== 'function') return false;
    const old = window.catMascot.spawn;
    window.catMascot.spawn = function(...args){
      const s = old.apply(this, args);
      const st = load();
      applyFilters(st);
      if (window.catMascot.activeAccessories) {
        applyAccessoriesToSprites(window.catMascot.activeAccessories);
      }
      return s;
    };
    // 이미 떠 있는 스프라이트에도 한 번 반영
    applyFilters(load());
    return true;
  };

  if (!tryWrap()) {
    const t = setInterval(() => { if (tryWrap()) clearInterval(t); }, 200);
    setTimeout(() => clearInterval(t), 5000);
  }
})();

// =============================
// 9) 패널 오픈 상태 복원
// =============================
(function restorePanelOpenOnLoad() {
  const st = load();
  if (!st.open) return;

  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  chrome.storage.local.get(SHOP_STORE_KEY, (obj) => {
    const unlocked = !!obj?.[SHOP_STORE_KEY]?.unlockedTools?.color_tool;
    if (!unlocked) return;

    let panel = document.querySelector('.catMascot-color-panel');
    if (!panel) panel = buildPanel();
    panel.style.display = 'block';
    syncPanelSlidersTo(load());
  });
})();
