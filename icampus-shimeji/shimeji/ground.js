// ==== shimeji/grounds.js ====
console.log('[Shimeji] grounds loaded');

window.Shimeji = window.Shimeji || {};

const GROUND_SELECTORS = [
  // 네가 타겟팅하고 싶은 요소를 자유롭게 추가
  '#uni-player',
  '#video-player-area',
  '.Grouping-styles__items',
  '[class*="Grouping-styles__items"]',

  // 일반 검색/입력
  'input[type="search"]','form[role="search"] input','input[name="q"]','[role="search"] input',
  'input:not([type="hidden"])','textarea','button','a',

  // 시각 요소
  'video','img','canvas',

  // 명시적 지정
  '[data-shimeji-ground]', '.shimeji-ground'
];

let GROUNDS = [];

const isVisibleRect = (r) =>
  r.width > 20 && r.height > 8 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;

const isActuallyVisible = (el) => {
  const st = getComputedStyle(el);
  if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
  return isVisibleRect(el.getBoundingClientRect());
};

// root(document 또는 shadowRoot)에서 수집
const collectFromRoot = (root) => {
  const out = [];
  for (const sel of GROUND_SELECTORS) root.querySelectorAll(sel).forEach(el => out.push(el));
  return out;
};

// shadow 재귀
const walkShadow = (root, out) => {
  out.push(...collectFromRoot(root));
  root.querySelectorAll('*').forEach(el => { if (el.shadowRoot) walkShadow(el.shadowRoot, out); });
};

// iframe 재귀 (same-origin만)
const walkIframes = (doc, out) => {
  doc.querySelectorAll('iframe').forEach(iframe => {
    try {
      const idoc = iframe.contentDocument;
      if (idoc) { walkShadow(idoc, out); walkIframes(idoc, out); }
    } catch (e) { /* cross-origin은 건너뜀 */ }
  });
};

function rebuildGrounds() {
  const found = [];
  walkShadow(document, found);
  walkIframes(document, found);

  const uniq = [];
  const seen = new Set();
  for (const el of found) {
    if (!el || seen.has(el)) continue;
    seen.add(el);
    if (isActuallyVisible(el)) uniq.push(el);
  }
  GROUNDS = uniq;

  // 디버그 로그 (원하면 주석 처리)
  console.groupCollapsed(`[Shimeji] Found ${uniq.length} ground elements`);
  uniq.forEach((el, i) => console.log(`#${i}`, el, el.getBoundingClientRect()));
  console.groupEnd();
}

// 스냅 대상 찾기: xMid/footY 기준 바로 아래의 가장 가까운 ground 윗변
function groundAt(xMid, footY) {
  let best = null; // {y, rect, el}
  for (const el of GROUNDS) {
    const r = el.getBoundingClientRect();
    if (!isVisibleRect(r)) continue;
    const withinX = xMid >= r.left && xMid <= r.right;
    const belowFeet = r.top >= footY - 4;
    if (withinX && belowFeet) {
      if (!best || r.top < best.y) best = { y: r.top, rect: r, el };
    }
  }
  return best;
}

// 외부 노출
Shimeji.rebuildGrounds = rebuildGrounds;
Shimeji.groundAt = groundAt;

// 자동 갱신
let rebuildTimer = null;
const scheduleRebuild = () => {
  if (rebuildTimer) cancelAnimationFrame(rebuildTimer);
  rebuildTimer = requestAnimationFrame(rebuildGrounds);
};
addEventListener('resize', scheduleRebuild);
const mo = new MutationObserver(scheduleRebuild);
mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true });

rebuildGrounds();
