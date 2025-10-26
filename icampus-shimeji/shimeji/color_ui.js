// ==== shimeji/color_ui.js ====
console.log('[Cat] color UI loaded');

window.Shimeji = window.Shimeji || {};

const STORE_KEY = '__cat_color_ui_v1';      // 이 파일(패널)이 쓰는 로컬 상태
const SHOP_STORE_KEY = 'shimeji_store_v1';  // 상점 상태 (points/owned/activeColorPreset/unlockedTools)

const defaults = {
  hue: 0, sat: 120, bri: 100, con: 100, opa: 100,
  x: 24, y: 24, open: false  // 기본은 닫혀있음
};

// --- 상태 로드/저장 (localStorage) ---
const load = () => {
  try { return Object.assign({}, defaults, JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); }
  catch { return { ...defaults }; }
};
const save = (st) => localStorage.setItem(STORE_KEY, JSON.stringify(st));

// --- 스프라이트 전부에 CSS 필터 적용 ---
const applyFilters = (st) => {
  const filter = `hue-rotate(${st.hue}deg) saturate(${st.sat}%) brightness(${st.bri}%) contrast(${st.con}%)`;
  document.querySelectorAll('.shimeji-sprite').forEach(el => {
    el.style.filter = filter;
    el.style.opacity = (st.opa/100).toString();
  });
};

// --- 패널 슬라이더 표시값을 상태와 동기화 ---
function syncPanelSlidersTo(st) {
  const panel = document.querySelector('.shimeji-color-panel');
  if (!panel) return;
  const sync = (k) => {
    const inp = panel.querySelector(`input[data-k="${k}"]`);
    const v = st[k];
    if (!inp) return;
    inp.value = v;
    const out = inp.parentElement?.querySelector('.v');
    if (out) out.textContent = k === 'hue' ? v : (v + '%');
  };
  ['hue','sat','bri','con','opa'].forEach(sync);
}

// --- 상점의 프리셋을 적용(저장/필터/슬라이더 동기화) ---
function applyPresetFromShop(preset) {
  if (!preset) return;
  const st = load();
  st.hue = preset.hue; st.sat = preset.sat; st.bri = preset.bri; st.con = preset.con; st.opa = preset.opa;
  save(st);
  applyFilters(st);
  syncPanelSlidersTo(st);
}

// --- 패널 DOM 생성 (처음엔 숨김) ---
function buildPanel() {
  const st = load();
  const panel = document.createElement('div');
  panel.className = 'shimeji-color-panel';
  panel.style.display = 'none';

  // 내부 UI
  panel.innerHTML = `
    <div class="scp-header">🎨 Custom Cat Color <span class="scp-actions">
      <button data-act="reset" title="Reset">↺</button>
      <button data-act="close" title="Hide">✕</button>
    </span></div>
    <div class="scp-row"><label>Hue</label><input type="range" min="0" max="360" value="${st.hue}" data-k="hue"><span class="v">${st.hue}</span></div>
    <div class="scp-row"><label>Sat</label><input type="range" min="0" max="300" value="${st.sat}" data-k="sat"><span class="v">${st.sat}%</span></div>
    <div class="scp-row"><label>Bri</label><input type="range" min="50" max="200" value="${st.bri}" data-k="bri"><span class="v">${st.bri}%</span></div>
    <div class="scp-row"><label>Con</label><input type="range" min="50" max="200" value="${st.con}" data-k="con"><span class="v">${st.con}%</span></div>
    <div class="scp-row"><label>Opa</label><input type="range" min="20" max="100" value="${st.opa}" data-k="opa"><span class="v">${st.opa}%</span></div>
    <div class="scp-foot">Drag here · Ctrl+Shift+C toggle</div>
  `;

  // 패널 스타일
  Object.assign(panel.style, {
    position: 'fixed',
    left: (st.x || 24) + 'px',
    top: (st.y || 24) + 'px',
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

  // 중복 스타일 삽입 방지
  if (!document.querySelector('#__cat_color_ui_style')) {
    const style = document.createElement('style');
    style.id = '__cat_color_ui_style';
    style.textContent = `
      .shimeji-color-panel .scp-header{padding:10px 12px;font-weight:600;display:flex;justify-content:space-between;align-items:center;cursor:grab}
      .shimeji-color-panel .scp-actions button{background:transparent;border:none;color:#ddd;font-size:12px;cursor:pointer;margin-left:6px}
      .shimeji-color-panel .scp-row{display:grid;grid-template-columns:36px 1fr 48px;gap:8px;align-items:center;padding:6px 12px}
      .shimeji-color-panel .scp-row input[type="range"]{width:100%}
      .shimeji-color-panel .scp-row .v{text-align:right;color:#bdbdbd}
      .shimeji-color-panel .scp-foot{padding:8px 12px;color:#9aa0a6;font-size:11px;border-top:1px solid rgba(255,255,255,0.08)}
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(panel);

  // --- 슬라이더 변경 시 즉시 반영 ---
  panel.querySelectorAll('input[type="range"]').forEach(inp => {
    inp.addEventListener('input', () => {
      const k = inp.dataset.k;
      const v = Number(inp.value);
      const cur = load();
      cur[k] = v;
      save(cur);
      applyFilters(cur);
      const out = inp.parentElement?.querySelector('.v');
      if (out) out.textContent = k === 'hue' ? v : (v + '%');
    });
  });

  // --- Reset / Close 버튼 (드래그와 충돌 방지) ---
  const onAction = (act, ev) => {
    ev?.stopPropagation();
    ev?.preventDefault();
    const cur = load();
    if (act === 'reset') {
      const reset = { ...defaults, x: cur.x, y: cur.y, open: true };
      save(reset);
      applyFilters(reset);
      syncPanelSlidersTo(reset);
    } else if (act === 'close') {
      panel.style.display = 'none';
      cur.open = false;
      save(cur);
    }
  };
  panel.querySelector('button[data-act="reset"]').addEventListener('click', (e)=> onAction('reset', e));
  panel.querySelector('button[data-act="close"]').addEventListener('click', (e)=> onAction('close', e));

  // --- 드래그 이동 (버튼 클릭 시 드래그 금지) ---
  const header = panel.querySelector('.scp-header');
  let drag = null;
  header.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button[data-act]')) return; // 버튼이면 드래그 시작 금지
    drag = { ox: e.clientX - panel.offsetLeft, oy: e.clientY - panel.offsetTop };
    header.setPointerCapture?.(e.pointerId);
    header.style.cursor = 'grabbing';
  });
  header.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const nx = Math.min(innerWidth - panel.offsetWidth, Math.max(8, e.clientX - drag.ox));
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

// --- (구매 여부 체크 후) 패널 열기 ---
async function openPanel() {
  try {
    const obj = await chrome.storage?.local.get(SHOP_STORE_KEY);
    const unlocked = !!obj?.[SHOP_STORE_KEY]?.unlockedTools?.color_tool;
    if (!unlocked) return; // 구매 전이면 무시
  } catch { /* ignore */ }

  let panel = document.querySelector('.shimeji-color-panel');
  if (!panel) panel = buildPanel();
  panel.style.display = 'block';

  const st = load();
  st.open = true;
  save(st);
  syncPanelSlidersTo(st);
}

// --- 키보드 토글 (Ctrl+Shift+C) : 구매한 경우에만 열림 ---
addEventListener('keydown', async (e) => {
  if (!(e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c'))) return;

  // 구매 여부 확인
  let unlocked = false;
  try {
    const obj = await chrome.storage?.local.get(SHOP_STORE_KEY);
    unlocked = !!obj?.[SHOP_STORE_KEY]?.unlockedTools?.color_tool;
  } catch {}

  if (!unlocked) return; // 구매 전이면 토글 금지

  let panel = document.querySelector('.shimeji-color-panel');
  if (!panel) panel = buildPanel();
  const willShow = panel.style.display === 'none';
  panel.style.display = willShow ? 'block' : 'none';

  const st = load();
  st.open = willShow;
  save(st);
  if (willShow) syncPanelSlidersTo(st);
});

// --- popup(Shop) → content 메시지 처리 ---
chrome.runtime?.onMessage?.addListener((msg) => {
  if (msg?.type === 'APPLY_COLOR_PRESET' && msg.preset) {
    applyPresetFromShop(msg.preset);
  } else if (msg?.type === 'OPEN_COLOR_TOOL') {
    openPanel();
  }
});

// --- 페이지 로드시: 상점에 저장된 activeColorPreset 있으면 적용(패널은 열지 않음) ---
(async function applySavedPresetOnLoad() {
  try {
    const obj = await chrome.storage?.local.get(SHOP_STORE_KEY);
    const stShop = obj?.[SHOP_STORE_KEY];
    const p = stShop?.activeColorPreset;
    if (p && typeof p.hue === 'number') {
      applyPresetFromShop(p);
    } else {
      applyFilters(load());
    }
  } catch {
    applyFilters(load());
  }
})();

// --- 새 스폰에도 필터 유지 (spawn 래핑) ---
(function wrapSpawnOnce(){
  if (window.__cat_color_spawn_wrapped__) return;
  window.__cat_color_spawn_wrapped__ = true;
  const tryWrap = () => {
    if (!window.Shimeji || typeof window.Shimeji.spawn !== 'function') return false;
    const old = window.Shimeji.spawn;
    window.Shimeji.spawn = function(...args){
      const s = old.apply(this, args);
      applyFilters(load());
      return s;
    };
    return true;
  };
  if (!tryWrap()) {
    // spawn이 나중에 붙는 경우를 대비해 폴링
    const t = setInterval(() => { if (tryWrap()) clearInterval(t); }, 200);
    setTimeout(() => clearInterval(t), 5000);
  }
})();
