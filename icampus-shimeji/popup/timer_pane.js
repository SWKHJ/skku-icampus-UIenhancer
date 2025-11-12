// ===== popup/timer_pane.js (Accordion: Work total only, click to expand details) =====
//
// 이 모듈은 팝업의 "Timer" 탭 UI를 담당한다.
// 핵심 설계 포인트
// - 실시간 HH:MM:SS 표시는 "로컬 미러 + 1초 틱커"로 계산(스토리지 I/O 최소화)
// - "오늘의 항목"은 [작업명(부모) -> 내용(자식)] 트리로 그룹화, 기본 접힘(가독성)
// - '오늘 누적'은 확정 로그만 반영(진행 중에는 수치 흔들림 방지)
// - storage.onChanged 수신 → 미러 갱신 → 버튼/배지/표시 업데이트 (멀티 팝업 안전)
//
// 의존: timer.js (상태 저장/세션 확정/집계/포맷터)

import {
  getState, setWorkDetail,
  start, pause, stop,
  fmtHMS_ms, fmtHMS_sec,
  aggregates
} from '../timer.js';

/* ---------------- DOM 핸들/상태 ---------------- */
// 루트/입력/버튼/표시 엘리먼트 참조
let root = null;
let elWork = null, elDetail = null;
let elDisp = null, elBadge = null;
let btnStart = null, btnPause = null, btnStop = null;

// 상단 '오늘 누적', 하단 요약/목록
let elMiniTotal = null;
let elTodayTotal = null;
let elTodayItems = null;

// 이벤트/리스너 정리용
let storageHandler = null;
const bound = [];
let pendingPrefill = null;

/* ---------------- Mirror + 1s Ticker ----------------
   스토리지에 매초 접근하지 않고, 현재 진행 중일 때만
   (startTimestamp + offset)로 로컬에서 경과시간을 계산한다. */
let mirror = { running:false, start:0, offset:0 };
function syncMirror(st) {
  mirror.running = !!st.running;
  mirror.start   = Number(st.startTimestamp) || 0;
  mirror.offset  = Number(st.offsetMs) || 0;
}
function calcMs() {
  return mirror.running
    ? (Date.now() - mirror.start + mirror.offset)
    : mirror.offset;
}

// 틱커: 1초마다 표시만 갱신(스토리지 쓰기 없음)
let tickId = null;
function startTicker() {
  stopTicker();
  setDisplay(calcMs());          // 즉시 1회 반영
  tickId = setInterval(() => {
    setDisplay(calcMs());        // 매초 로컬 계산값 반영
  }, 1000);
}
function stopTicker() { if (tickId) { clearInterval(tickId); tickId = null; } }

/* ---------------- Helpers ---------------- */
const on  = (el, ev, fn) => el && el.addEventListener(ev, fn);
const off = (el, ev, fn) => el && el.removeEventListener(ev, fn);
const escapeHTML = (s) =>
  String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// 진행/일시중지 중에는 제목/내용 편집을 잠궈 입력 불일치 방지
function setInputsLocked(locked) {
  if (!elWork || !elDetail) return;
  elWork.readOnly = locked;
  elDetail.readOnly = locked;
  elWork.classList.toggle('readonly', locked);
  elDetail.classList.toggle('readonly', locked);
}

// 중앙 디스플레이: ms→HH:MM:SS (초 단위 틱커가 호출)
function setDisplay(ms) { if (elDisp) elDisp.textContent = fmtHMS_ms(ms || 0); }
function isPaused(st)   { return !st.running && (st.offsetMs || 0) > 0; }

// 상태 배지(진행중/일시중지) 노출/숨김
function showBadge(text) { if (elBadge) { elBadge.textContent = text; elBadge.hidden = false; } }
function hideBadge()     { if (elBadge) { elBadge.hidden = true;  elBadge.textContent = ''; } }

/* ---------------- Today total (no live add) ----------------
   UX 원칙: 진행 중엔 '오늘 누적' 수치가 흔들리지 않도록 확정 로그만 집계 */
async function updateMiniAgg() {
  if (!elMiniTotal) return;
  const agg = await aggregates(false);         // 실시간 누적 제외
  const sec = Math.max(0, (agg?.day?.sec || 0));
  elMiniTotal.textContent = fmtHMS_sec(sec);
}

/* ---------------- Defaults for empty names ----------------
   제목/내용 비어 있을 때의 안전한 기본값(집계/검색 일관성 유지) */
function defaultNames() {
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth()+1).padStart(2,'0');
  const d  = String(now.getDate()).padStart(2,'0');
  const hh = String(now.getHours()).padStart(2,'0');
  const mm = String(now.getMinutes()).padStart(2,'0');
  return { work:`Untitled ${y}-${mo}-${d}`, detail:`Session ${hh}:${mm}` };
}

/* ---------------- 버튼 활성/배지/틱커 동기화 ----------------
   상태 전이를 명확히 보여주고, 중복 클릭에 의한 레이스를 줄인다. */
function syncButtonsAndBadge(st) {
  if (!btnStart || !btnPause || !btnStop) return;
  const paused = isPaused(st);

  if (st.running) {
    btnStart.disabled = true;
    btnPause.disabled = false;
    btnStop.disabled  = false;
    setInputsLocked(true);
    showBadge('진행중');
    startTicker();
  } else if (paused) {
    btnStart.disabled = false;
    btnPause.disabled = true;
    btnStop.disabled  = false;   // 일시중지 상태에서도 '정지' 가능
    setInputsLocked(true);
    showBadge('일시중지');
    startTicker();               // 표시값은 고정 유지
  } else {
    btnStart.disabled = false;
    btnPause.disabled = true;
    btnStop.disabled  = true;
    setInputsLocked(false);
    hideBadge();
    startTicker();               // 0 또는 마지막 누적값 표시
  }
}

/* ---------------- Grouped Today list (Accordion) ----------------
   오늘의 확정 로그를 [작업명 -> 내용] 계층으로 묶어 가독성↑
   기본은 부모(작업명) 행만 보여주고, 클릭 시 자식(내용) 리스트를 펼친다. */

// 정렬: 최근 작업이 위에 오도록(보고/회고 흐름에 맞춤)
const SORT_MODE = 'recent_desc';

// 부모 합계 시간 포맷: HH:MM:SS로 통일
function fmtBriefParent(sec) {
  return fmtHMS_sec(Math.max(0, Math.floor(sec)));
}

// 오늘 00:00~24:00 범위
function todayRange() {
  const now = new Date();
  const s = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const e = new Date(s); e.setDate(e.getDate() + 1);
  return [s.getTime(), e.getTime()];
}

// 확정 로그 → work -> detail -> { sec, lastEnd } 트리로 변환
// sec: 누적 초, lastEnd: 최근 종료시각(정렬 기준으로 사용)
function buildTodayTree(logs) {
  const [s0, s1] = todayRange();
  const tree = new Map();

  for (const l of logs || []) {
    if (l.end < s0 || l.start >= s1) continue;

    const work   = l.task || l.work || '';
    const detail = l.detail || '';
    const sec = Number.isFinite(l.seconds)
      ? Math.max(0, l.seconds)
      : Math.max(0, Math.floor((l.minutes || 0) * 60));
    const end = l.end || 0;

    let detMap = tree.get(work);
    if (!detMap) { detMap = new Map(); tree.set(work, detMap); }

    const node = detMap.get(detail) || { sec:0, lastEnd:0 };
    node.sec += sec;
    node.lastEnd = Math.max(node.lastEnd, end);
    detMap.set(detail, node);
  }

  // 트리 → 정렬 가능한 배열(groups)로 변환
  const groups = [];
  for (const [work, detMap] of tree.entries()) {
    let parentSec = 0, parentLast = 0;
    const children = [];

    for (const [detail, info] of detMap.entries()) {
      parentSec  += info.sec;
      parentLast  = Math.max(parentLast, info.lastEnd);
      children.push({ work, detail, sec: info.sec, lastEnd: info.lastEnd });
    }

    // 자식 정렬: 최근/시간/연대 중 택1
    children.sort((a,b) => {
      switch (SORT_MODE) {
        case 'chrono_asc':    return a.lastEnd - b.lastEnd;
        case 'duration_desc': return b.sec - a.sec;
        case 'recent_desc':
        default:              return b.lastEnd - a.lastEnd;
      }
    });

    groups.push({ work, sec: parentSec, lastEnd: parentLast, children });
  }

  // 부모 정렬
  groups.sort((a,b) => {
    switch (SORT_MODE) {
      case 'chrono_asc':    return a.lastEnd - b.lastEnd;
      case 'duration_desc': return b.sec - a.sec;
      case 'recent_desc':
      default:              return b.lastEnd - a.lastEnd;
    }
  });

  return groups;
}

// DOM 렌더링: 부모(작업명) 기본 노출, 클릭 시 자식(내용) 토글
async function renderTodaySummaryGrouped() {
  const st = await getState();
  const groups = buildTodayTree(st.logs);

  // 하단 총합
  const totalSec = groups.reduce((a,g)=> a + g.sec, 0);
  if (elTodayTotal) elTodayTotal.textContent = fmtHMS_sec(totalSec);

  if (!elTodayItems) return;
  elTodayItems.innerHTML = '';

  if (groups.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'task-row empty';
    empty.textContent = '오늘 시작한 항목이 없습니다.';
    elTodayItems.appendChild(empty);
    return;
  }

  for (const g of groups) {
    // 부모 행(작업명 + 총합) — 기본 접힘
    const parent = document.createElement('div');
    parent.className = 'task-row parent';
    parent.innerHTML = `
      <div class="task-left">
        <div class="task-title">${escapeHTML(g.work || '(제목없음)')}</div>
      </div>
      <div class="task-time">${fmtBriefParent(g.sec)}</div>
    `;
    elTodayItems.appendChild(parent);

    // 자식 컨테이너(초기 숨김)
    const wrap = document.createElement('div');
    wrap.className = 'children hidden';
    elTodayItems.appendChild(wrap);

    // 자식 행들(내용별 누적)
    for (const c of g.children) {
      const child = document.createElement('div');
      child.className = 'task-row child';
      child.innerHTML = `
        <div class="task-left">
          <div class="task-detail">${escapeHTML(c.detail || '(내용없음)')}</div>
        </div>
        <div class="task-time">${fmtHMS_sec(c.sec)}</div>
      `;
      // 자식 클릭: 입력 프리필(작업명+내용)
      child.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (elWork)   elWork.value   = c.work || '';
        if (elDetail) elDetail.value = c.detail || '';
      });
      wrap.appendChild(child);
    }

    // 부모 클릭: 자식 토글(접힘/펼침)
    parent.addEventListener('click', () => {
      wrap.classList.toggle('hidden');
    });
    // 부모 더블클릭: 작업명만 프리필(내용 비움)
    parent.addEventListener('dblclick', () => {
      if (elWork)   elWork.value   = g.work || '';
      if (elDetail) elDetail.value = '';
    });
  }
}

/* ---------------- Public: 초기화/해제 ---------------- */
export async function initPane(rootEl) {
  root = rootEl;
  if (!root) return;

  // DOM 바인딩
  elWork       = root.querySelector('#work');
  elDetail     = root.querySelector('#detail');
  elDisp       = root.querySelector('#display');
  elBadge      = root.querySelector('#pausedBadge');
  btnStart     = root.querySelector('#btnStart');
  btnPause     = root.querySelector('#btnPause');
  btnStop      = root.querySelector('#btnStop');

  elMiniTotal  = root.querySelector('#miniTotal');
  elTodayTotal = root.querySelector('#todayTotal');
  elTodayItems = root.querySelector('#todayItems');

  // 초기 상태 로드 → 미러/버튼/표시 세팅
  const st0 = await getState();
  if (elWork)   elWork.value   = st0.work ?? st0.taskName ?? '';
  if (elDetail) elDetail.value = st0.detail ?? '';
  syncMirror(st0);
  setDisplay(calcMs());
  syncButtonsAndBadge(st0);
  startTicker();
  await updateMiniAgg();

  // 프리필 차단 배지(진행/일시중지 중에 컨텍스트 메뉴로 진입했을 때 안내)
  try {
    const { prefillBlocked } = await chrome.storage.session.get('prefillBlocked');
    if (prefillBlocked) {
      showBadge('진행/일시중지 중에는 새 항목 시작 불가. 먼저 정지하세요.');
      setTimeout(() => hideBadge(), 3000);
      await chrome.storage.session.remove('prefillBlocked');
    }
  } catch {}

  // 컨텍스트 메뉴에서 넘어온 프리필(정지 상태에서만 의미)
  try {
    const { timerPrefill } = await chrome.storage.session.get('timerPrefill');
    if (timerPrefill && (timerPrefill.work || timerPrefill.detail)) {
      pendingPrefill = timerPrefill;
      if (elWork  && timerPrefill.work   != null) elWork.value   = timerPrefill.work;
      if (elDetail&& timerPrefill.detail != null) elDetail.value = timerPrefill.detail;
    }
  } catch {}

  await renderTodaySummaryGrouped();

  // 버튼 핸들러: 상태 전이를 timer.js에 위임하고, 미러/버튼/UI를 동기화
  const onStart = async () => {
    if (pendingPrefill) {
      try { await chrome.storage.session.remove('timerPrefill'); } catch {}
      pendingPrefill = null;
    }
    let w = elWork?.value?.trim() || '';
    let d = elDetail?.value?.trim() || '';
    if (!w || !d) {
      const def = defaultNames();
      if (!w) w = def.work;
      if (!d) d = def.detail;
      if (elWork) elWork.value = w;
      if (elDetail) elDetail.value = d;
    }
    await setWorkDetail(w, d);
    await start();                 // 이미 진행 중이면 내부 가드로 조용히 리턴
    const st = await getState();
    syncMirror(st);
    syncButtonsAndBadge(st);
  };

  const onPause = async () => {
    await pause();                 // 진행 중이 아니면 내부 가드로 리턴
    const st = await getState();
    syncMirror(st);
    syncButtonsAndBadge(st);
  };

  const onStop = async () => {
    await stop();                  // 세션 확정(로그 추가) + 진행중/일시중지 초기화
    const st = await getState();
    syncMirror(st);
    syncButtonsAndBadge(st);
    await renderTodaySummaryGrouped(); // 목록/합계 갱신
    await updateMiniAgg();             // 상단 '오늘 누적' 갱신
  };

  on(btnStart, 'click', onStart); bound.push({ el:btnStart, ev:'click', fn:onStart });
  on(btnPause, 'click', onPause); bound.push({ el:btnPause, ev:'click', fn:onPause });
  on(btnStop,  'click', onStop ); bound.push({ el:btnStop,  ev:'click', fn:onStop  });

  // 멀티 팝업/백그라운드 갱신 반영: storage 변경 → 미러/버튼/표시 즉시 동기화
  storageHandler = (changes, area) => {
    if (area !== 'local') return;
    const st = changes['studyTimer:v1']?.newValue;
    if (!st) return;
    syncMirror(st);
    setDisplay(calcMs());
    syncButtonsAndBadge(st);
    // '오늘 누적'은 확정 로그에서만 늘어나므로 여기선 의도적으로 건드리지 않음
  };
  chrome.storage.onChanged.addListener(storageHandler);
}

// 파기: 이벤트/리스너/틱커 정리(메모리/중복 핸들러 방지)
export function destroyPane() {
  bound.forEach(({el,ev,fn}) => off(el, ev, fn));
  bound.length = 0;
  if (storageHandler) {
    chrome.storage.onChanged.removeListener(storageHandler);
    storageHandler = null;
  }
  stopTicker();
  root = elWork = elDetail = elDisp = elBadge = null;
  btnStart = btnPause = btnStop = null;
  elMiniTotal = elTodayTotal = elTodayItems = null;
}
