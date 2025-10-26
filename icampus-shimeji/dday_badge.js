const CFG = {
  DAY_HEADER_SELECTOR: 'h2, h3',
  DAY_SECTION_HINT: '[class*="Day-styles__root"]',
  COMPLETED_GROUP_HINT: '[class*="CompletedItemsFacade-styles__root"]',
  COLLAPSED_ARIA: 'button[aria-expanded="false"]',
  SCORE_BLOCK_SEL: '[class*="PlannerItem-styles_metrics"] [class*="PlannerItem-styles_score"]',
  BADGE_ITEM_SEL:  '[class*="BadgeList-styles__item"], [class*="BadgeList-styles_item"]',
  OBSERVER: { childList: true, subtree: true },
  DEBOUNCE_MS: 150,
  DEBUG_PREVIEW_PAST_STYLE: false,
  DEBUG_LOG: false
};

const atMidnight = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayDiff = (from, to) => Math.round((atMidnight(to) - atMidnight(from)) / 86400000);
const dLabel  = diff => diff === 0 ? 'TODAY' : (diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`);

const parseKoDate = txt => {
  const m = txt.match(/(\d{1,2})\s*월\s*(\d{1,2}),\s*(\d{4})/);
  return m ? new Date(+m[3], +m[1]-1, +m[2]) : null;
};
function parseRelativeKo(text) {
  const t = text.replace(/\s/g, '');
  const base = atMidnight(new Date());
  if (t.includes('오늘'))  return base;
  if (t.includes('어제'))  return new Date(base.getFullYear(), base.getMonth(), base.getDate()-1);
  if (t.includes('내일'))  return new Date(base.getFullYear(), base.getMonth(), base.getDate()+1);
  return null;
}
function parseHeaderDate(text) {
  const rel = parseRelativeKo(text);
  if (rel) return rel;
  const d1 = new Date(text);
  if (!isNaN(d1)) return atMidnight(d1);
  const d2 = parseKoDate(text);
  return d2 ? atMidnight(d2) : null;
}

const debounce = (fn, ms) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
const findDaySection = h =>
  h.closest(CFG.DAY_SECTION_HINT) || h.closest('section, li, div') || h.parentElement;

function isRenderable(el){
  if (!el) return false;
  if (el.closest('[hidden],[aria-hidden="true"]')) return false;
  if (el instanceof HTMLElement) {
    const rects = el.getClientRects?.();
    if (rects && rects.length) return true;
    if (el.offsetParent !== null) return true;
  }
  return true;
}
function isCollapsedCompletedGroup(el){
  const group = el.closest(CFG.COMPLETED_GROUP_HINT);
  return !!group?.querySelector(CFG.COLLAPSED_ARIA);
}
function hasScoredItem(sectionEl){
  const render = sel => [...sectionEl.querySelectorAll(sel)].filter(isRenderable);
  const hasMetricNum = render(CFG.SCORE_BLOCK_SEL).some(n => /\b\d+\s*점\b|\bscore\b/i.test(n.textContent||''));
  const hasBadge    = render(CFG.BADGE_ITEM_SEL).some(n => /(평가됨|제출됨|제출함|graded|score)/i.test(n.textContent||''));
  const looseNum    = /\b\d+\s*점\b/.test((sectionEl.textContent||'').toLowerCase());
  return hasMetricNum || hasBadge || looseNum;
}

function classForDiff(diff){
  if (diff >= 4 && diff <= 7) return 'ic-dday--info';
  if (diff >= 1 && diff <= 3) return 'ic-dday--alert';
  if (diff === 0)             return 'ic-dday--today';
  return '';
}

/* 
  Debug-only feature:
  When DEBUG_PREVIEW_PAST_STYLE is true, past days (D+N) 
  are visually mapped by |N|%7 to preview their color styles 
  (0→today, 1–3→alert, 4–6→info). Labels remain unchanged (D+N).
  This has no effect on real behavior — only for visual debugging.
*/
function mapPastDiffForPreview(diff) {
  if (diff >= 0) return diff;
  const n = Math.abs(diff) % 7;
  return (n === 0) ? 0 : n;
}
function classForDiffWithDebug(diff){
  if (!CFG.DEBUG_PREVIEW_PAST_STYLE) return classForDiff(diff);
  return classForDiff(mapPastDiffForPreview(diff));
}

function setBadge(headerEl, label, cls, title, dbg){
  const old = headerEl.querySelector('.ic-dday-badge');
  if (old && old.textContent === label && (cls ? old.classList.contains(cls) : !old.dataset.classApplied)) return;

  headerEl.querySelectorAll('.ic-dday-badge').forEach(n => n.remove());
  if (!label) return;

  const tag = document.createElement('span');
  tag.className = 'ic-dday-badge' + (cls ? ' ' + cls : '');
  if (!cls) tag.dataset.classApplied = '0';
  tag.textContent = label;
  if (title) tag.title = title;

  if (CFG.DEBUG_LOG && dbg) console.log('[D-Day]', dbg);

  headerEl.appendChild(tag);
}

function evaluateHeader(headerEl){
  const raw = (headerEl.textContent || '').trim();
  const d = parseHeaderDate(raw);
  if (!d) return setBadge(headerEl, null);

  const section = findDaySection(headerEl);
  if (!isRenderable(section) || isCollapsedCompletedGroup(section)) return setBadge(headerEl, null);
  if (!hasScoredItem(section)) return setBadge(headerEl, null);

  const diff  = dayDiff(new Date(), d);
  const label = dLabel(diff);
  const cls   = classForDiffWithDebug(diff);
  const tip = diff === 0 ? '오늘 마감' : (diff > 0 ? `마감까지 ${diff}일` : `마감 후 ${Math.abs(diff)}일`);

  setBadge(headerEl, label, cls, tip, { header: raw, diff, cls, preview: CFG.DEBUG_PREVIEW_PAST_STYLE });
}

const scanAll = debounce(() => {
  document.querySelectorAll(CFG.DAY_HEADER_SELECTOR).forEach(h => { try { evaluateHeader(h); } catch {} });
}, CFG.DEBOUNCE_MS);

function init(){
  scanAll();
  new MutationObserver(scanAll).observe(document.body, CFG.OBSERVER);
}
document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', init)
  : init();
