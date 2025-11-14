// ===== popup.js (hardened storage + import retry + focus + settings pane wired + global points header) =====
import { Points, bindBalanceUpdates } from './cat-mascot/points_client.js'; // [NEW]

const $id = (id) => document.getElementById(id);
const on  = (el, ev, fn) => el && el.addEventListener(ev, fn);

const panes = {
  shop:     { el: $id('pane-shop'),     mod: null },
  timer:    { el: $id('pane-timer'),    mod: null },
  settings: { el: $id('pane-settings'), mod: null },
};

let current = null;
let activatingPromise = null;
let unbindPoints = null; // [NEW] 헤더 포인트 구독 해제용

function showTab(key) {
  Object.entries(panes).forEach(([k, p]) => {
    if (!p.el) return;
    const active = (k === key);
    p.el.classList.toggle('is-active', active);
    p.el.toggleAttribute('hidden', !active);
  });
  document.querySelectorAll('.tab-btn').forEach((b) => {
    const isActive = b?.dataset?.tab === key;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-selected', String(isActive));
  });
  // 마지막 탭 저장 (콜백 버전으로 안전하게)
  try { chrome.storage.local.set({ 'popup:lastTab': key }, () => {}); } catch {}
}

async function importPaneModule(key) {
  // 단순 재시도 1회
  const load = async () => {
    if (key === 'shop')     return import('./popup/shop_pane.js');
    if (key === 'timer')    return import('./popup/timer_pane.js');
    if (key === 'settings') return import('./popup/settings_pane.js');
    // 방어: 알 수 없는 키면 타이머로 포백
    return import('./popup/timer_pane.js');
  };
  try {
    return await load();
  } catch (e) {
    // 아주 드물게 발생하는 초기 캐시 이슈용 재시도
    return await load();
  }
}

async function activate(key) {
  if (!panes[key]?.el || current === key) return;

  if (activatingPromise) await activatingPromise;
  activatingPromise = (async () => {
    const prev = panes[current];
    if (prev?.mod?.destroyPane) { try { await prev.mod.destroyPane(); } catch {} }

    showTab(key);
    current = key;

    if (!panes[key].mod) {
      panes[key].mod = await importPaneModule(key);
    }
    await panes[key].mod?.initPane?.(panes[key].el);

    // UX: 타이머 탭이면 제목 입력에 포커스
    if (key === 'timer') {
      const input = panes[key].el?.querySelector?.('#work');
      if (input) { try { input.focus(); input.select?.(); } catch {} }
    }
  })();

  try { await activatingPromise; } finally { activatingPromise = null; }
}

function bindTabs() {
  const nav = document.querySelector('.tabs');
  on(nav, 'click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    const key = btn.dataset.tab;
    if (!key || !(key in panes)) return;
    activate(key);
  });

  // 키보드 접근성(좌우로 탭 이동)
  on(nav, 'keydown', (e) => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
    const btns = [...nav.querySelectorAll('.tab-btn')];
    const idx  = btns.findIndex(b => b.classList.contains('active'));
    if (idx < 0) return;

    let ni = idx;
    if (e.key === 'ArrowLeft')  ni = (idx - 1 + btns.length) % btns.length;
    if (e.key === 'ArrowRight') ni = (idx + 1) % btns.length;
    if (e.key === 'Home')       ni = 0;
    if (e.key === 'End')        ni = btns.length - 1;

    const key = btns[ni]?.dataset?.tab;
    if (key && (key in panes)) activate(key);
  });
}

// [NEW] 헤더 포인트 전역 초기화 + 실시간 반영
async function initHeaderPoints() {
  const lbl = document.getElementById('points');
  if (!lbl) return;

  try {
    const bal = await Points.get();
    lbl.textContent = String(bal);
  } catch {
    // 실패 시 그냥 0 그대로 두고 넘어감
  }

  // background → POINTS_UPDATED 브로드캐스트를 구독해서 항상 동기화
  unbindPoints = bindBalanceUpdates((balance) => {
    if (!lbl) return;
    lbl.textContent = String(balance);
  });
}

// 초기 탭 결정: timerPrefill가 있으면 timer, 없으면 마지막 탭(기본 shop)
async function decideInitialTab() {
  try {
    const { timerPrefill } = await chrome.storage.session.get('timerPrefill');
    if (timerPrefill && (timerPrefill.work || timerPrefill.detail)) return 'timer';
  } catch {}
  try {
    const obj = await chrome.storage.local.get('popup:lastTab');
    const key = obj['popup:lastTab'] || 'shop';
    return (key in panes) ? key : 'shop';
  } catch {
    return 'shop';
  }
}

// 백그라운드가 “Timer 탭 켜” 메시지 보낼 때
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'CAT_TIMER_ACTIVATE_TAB') activate('timer');
});

function initVersionLabel() {
  try {
    const m   = chrome.runtime.getManifest?.();
    const vEl = document.getElementById('appVer');
    if (m?.version && vEl && m?.version) vEl.textContent = m.version;
  } catch {}
}


async function boot() {
  bindTabs();
  await initHeaderPoints();           // [NEW] 헤더 포인트 먼저 동기화
  initVersionLabel();       
  const initial = await decideInitialTab();
  await activate(initial);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

// 팝업 닫힐 때 현재 pane 정리(안전망) + 포인트 구독 해제
window.addEventListener('unload', () => {
  if (unbindPoints) {
    try { unbindPoints(); } catch {}
    unbindPoints = null;
  }
  const cur = panes[current];
  if (cur?.mod?.destroyPane) { try { cur.mod.destroyPane(); } catch {} }
});
