// ===== timer.js (stable, HH:MM:SS, no live aggregation in UI) =====
const KEY    = 'studyTimer:v1';
const MAX_MS = (99 * 60 + 59) * 1000; // 99분 59초 보호 한계

/* ---------- 초기 상태 ---------- */
function defaultState() {
  return {
    // 런타임
    running: false,
    startTimestamp: 0,
    offsetMs: 0,          // 일시중지까지 누적(ms)
    elapsedMs: 0,         // (옵션: 오프스크린 하트비트용. UI는 사용하지 않음)
    lastAliveAt: 0,

    // 메타
    work: '',
    detail: '',
    taskName: '',

    // 점수
    mode: 'linear_min',   // 분당 0.1 + 30분마다 +1
    linearPerMin: 0.10,

    // 로그 (종료된 세션만)
    // {task, detail, start, end, seconds, minutes, points, mode}
    logs: []
  };
}

/* ---------- 상태 IO ---------- */
export async function getState() {
  return new Promise(res => {
    chrome.storage.local.get(KEY, s => {
      if (!s[KEY]) {
        const init = defaultState();
        chrome.storage.local.set({ [KEY]: init }, () => res(init));
      } else {
        res(s[KEY]);
      }
    });
  });
}

export async function setState(patch) {
  const st = await getState();
  const merged = { ...st, ...patch };
  return new Promise(res => {
    chrome.storage.local.set({ [KEY]: merged }, () => res(merged));
  });
}

/* ---------- 메타 설정 ---------- */
export async function setWorkDetail(work = '', detail = '') {
  return setState({
    work: String(work),
    detail: String(detail),
    taskName: String(work)
  });
}

/* ---------- 포맷터 (단위 명시형) ---------- */
// ms → "HH:MM:SS"
export function fmtHMS_ms(ms = 0) {
  const sec = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

// sec → "HH:MM:SS"
export function fmtHMS_sec(secInput = 0) {
  const sec = Math.max(0, Math.floor(Number(secInput) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

// 하위 호환(기존 호출부가 많다면 임시로 유지). 기본을 ms로 간주.
export function fmtHMS(msOrSec) { return fmtHMS_ms(msOrSec); }
export function fmtMMSS(ms)     { return fmtHMS_ms(ms); }

/* ---------- 점수 계산 ---------- */
export function calcPoints(totalMinutes, mode = 'linear_min', opts = {}) {
  const mins = Math.max(0, Number(totalMinutes) || 0);
  switch (mode) {
    case 'study_bunny': return Math.floor(mins / 10); // 10분당 1점
    case 'forest_like': {
      const base = Math.floor(mins / 5);
      const bonus = Math.floor(mins / 30) * 5;
      return base + bonus;
    }
    case 'linear_min':
    default: {
      const perMin = Number.isFinite(opts.linearPerMin) ? opts.linearPerMin : 0.10;
      const base  = mins * perMin;           // 소수 허용
      const bonus = Math.floor(mins / 30);   // 30분마다 +1
      return Math.round((base + bonus) * 10) / 10; // 소수 1자리
    }
  }
}

/* ---------- 타이머 동작 ---------- */
export async function start(taskName = '') {
  const st = await getState();
  if (st.running) return st; // 이미 진행 중

  const now = Date.now();
  const nextName = taskName || st.work || st.taskName || '';

  const next = await setState({
    running: true,
    startTimestamp: now,
    taskName: nextName
    // offsetMs는 그대로 둔다(일시중지 후 재시작 시 이어붙임)
  });

  try { chrome.runtime?.sendMessage?.({ type: 'OFFSCREEN_START' }); } catch {}
  return next;
}

export async function pause() {
  const st = await getState();
  if (!st.running) return st;

  const now     = Date.now();
  const elapsed = Math.max(0, now - st.startTimestamp);

  const next = await setState({
    running: false,
    startTimestamp: 0,
    offsetMs: st.offsetMs + elapsed
  });

  try { chrome.runtime?.sendMessage?.({ type: 'OFFSCREEN_STOP' }); } catch {}
  return next;
}

export async function stop() {
  // running 이든 paused(offsetMs>0) 이든 세션 확정
  const st = await getState();
  if (!st.running && !(st.offsetMs > 0)) return st;

  await finalizeSession();

  const next = await setState({
    running: false,
    startTimestamp: 0,
    offsetMs: 0
  });

  try { chrome.runtime?.sendMessage?.({ type: 'OFFSCREEN_STOP' }); } catch {}
  return next;
}

/* ---------- 실시간 경과(ms) ---------- */
export async function nowElapsedMs() {
  const st = await getState();
  return st.running
    ? (st.offsetMs + (Date.now() - st.startTimestamp))
    : st.offsetMs;
}

/* ---------- 상한 검사(보호) ---------- */
export async function forceStopIfExceeded() {
  const st = await getState();
  if (!st.running) return false;

  const elapsed = (Date.now() - st.startTimestamp) + st.offsetMs;
  if (elapsed >= MAX_MS) {
    await finalizeSession();
    await setState({ running: false, startTimestamp: 0, offsetMs: 0 });
    try { chrome.runtime?.sendMessage?.({ type: 'OFFSCREEN_STOP' }); } catch {}
    return true;
  }
  return false;
}

/* ---------- 세션 확정/로그 적립 ---------- */
async function finalizeSession() {
  const st  = await getState();
  const now = Date.now();

  // running 이면 시작~현재 + offsetMs, paused면 offsetMs만
  let elapsedMs = 0;
  if (st.running && st.startTimestamp > 0) {
    elapsedMs = Math.max(0, (now - st.startTimestamp) + st.offsetMs);
  } else {
    elapsedMs = Math.max(0, st.offsetMs);
  }
  if (elapsedMs <= 0) return;

  const seconds = Math.floor(elapsedMs / 1000);
  const minutes = seconds / 60; // 소수 허용
  const points  = calcPoints(minutes, st.mode, { linearPerMin: st.linearPerMin });

  // 일시중지 종료의 경우 startTimestamp가 0일 수 있으므로 역산
  const start = (st.running && st.startTimestamp > 0)
    ? st.startTimestamp
    : (now - elapsedMs);

  const log = {
    task:   st.work || st.taskName || '',
    detail: st.detail || '',
    start,
    end: now,
    seconds,
    minutes,
    points,
    mode: st.mode
  };

  const next = { ...st, logs: [...st.logs, log] };
  await setState(next);
}

/* ---------- 집계/CSV ---------- */
/**
 * aggregates(includeLive = false)
 * - 기본값: 진행 중 시간은 포함하지 않음(정지 시에만 오늘/주 누적 증가)
 * - includeLive=true 로 호출한 경우에만 라이브 초를 더함
 */
export async function aggregates(includeLive = false) {
  const st  = await getState();
  const now = new Date();

  const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dow = (now.getDay() + 6) % 7; // Mon=0
  const sow = new Date(now);
  sow.setDate(now.getDate() - dow);
  sow.setHours(0, 0, 0, 0);

  // 초 단위로 합산
  const sumFrom = (from) =>
    st.logs.reduce((acc, l) => {
      const sec = Number.isFinite(l.seconds)
        ? l.seconds
        : Math.max(0, Math.floor((l.minutes || 0) * 60));
      if (l.end >= from) acc += sec;
      return acc;
    }, 0);

  let daySec  = sumFrom(sod);
  let weekSec = sumFrom(sow.getTime());

  if (includeLive && st.running) {
    const liveSec = Math.floor((await nowElapsedMs()) / 1000);
    daySec  += liveSec;
    weekSec += liveSec;
  }

  const toAgg = (sec) => {
    const m = sec / 60;
    const p = calcPoints(m, st.mode, { linearPerMin: st.linearPerMin });
    return { sec, m, p };
  };

  return { day: toAgg(daySec), week: toAgg(weekSec) };
}

export async function toCSV() {
  const st = await getState();
  const rows = [['task','detail','startISO','endISO','seconds','minutes','points','mode']];
  st.logs.forEach(l => rows.push([
    l.task,
    l.detail || '',
    new Date(l.start).toISOString(),
    new Date(l.end).toISOString(),
    l.seconds,
    Math.round(l.minutes * 100) / 100, // 소수 2자리
    l.points,
    l.mode
  ]));
  return rows.map(r => r.map(csvEsc).join(',')).join('\n');
}

function csvEsc(s) {
  s = String(s);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
/* ---------- 시계 점프/자정 분할/스타트업 정산 ---------- */

/**
 * clampIfClockAnomaly(now)
 * - 시스템 시간이 과거로 급격히 이동했거나(수동 조정),
 *   running 중 startTimestamp가 now보다 미래가 되는 이상 상태를 정리한다.
 * - 여기서는 보수적으로 '미래로 가 있는 시작값'만 바로잡는다.
 */
export async function clampIfClockAnomaly(now = Date.now()) {
  const st = await getState();

  // startTimestamp가 현재보다 미래면, 현재로 당겨서 음수 경과 방지
  if (st.running && st.startTimestamp > now) {
    await setState({ startTimestamp: now, lastAliveAt: now });
    return true;
  }

  // 최초 호출 시 lastAliveAt이 0이면 채워둔다(슬립/웨이크 기준점)
  if (!st.lastAliveAt || st.lastAliveAt <= 0) {
    await setState({ lastAliveAt: now });
    return false;
  }

  // 기준점 갱신(경고성 의미. 과도한 보정은 지양)
  await setState({ lastAliveAt: now });
  return false;
}

/**
 * splitIfCrossedMidnight(now)
 * - running 세션이 자정 경계를 넘었으면, 경계 이전 구간을 하나의 로그로 확정하고
 *   00:00부터 이어서 달리게 분할한다. offsetMs는 이전 파트에 귀속.
 */
export async function splitIfCrossedMidnight(now = Date.now()) {
  const st = await getState();
  if (!st.running || !st.startTimestamp) return false;

  // 오늘 00:00(로컬) 경계
  const today0 = new Date(now);
  today0.setHours(0, 0, 0, 0);
  const boundary = today0.getTime();

  // 시작이 오늘 00:00 이전이면 분할
  if (st.startTimestamp < boundary) {
    const elapsedFirst = Math.max(0, (boundary - st.startTimestamp) + (st.offsetMs || 0));

    if (elapsedFirst > 0) {
      const seconds = Math.floor(elapsedFirst / 1000);
      const minutes = seconds / 60;
      const points  = calcPoints(minutes, st.mode, { linearPerMin: st.linearPerMin });

      const end1   = boundary;
      const start1 = end1 - elapsedFirst;

      const log1 = {
        task:   st.work || st.taskName || '',
        detail: st.detail || '',
        start:  start1,
        end:    end1,
        seconds,
        minutes,
        points,
        mode:   st.mode
      };

      await setState({
        logs: [...(st.logs || []), log1],
        startTimestamp: boundary, // 경계부터 이어서 진행
        offsetMs: 0,              // 이전 파트에 귀속
      });
      return true;
    }
  }
  return false;
}

/**
 * settleOnStartup()
 * - 브라우저/확장 재시작 시 상태 정상화:
 *   1) 시계 이상치 보정(clamp)
 *   2) 자정 경계 분할(추가 안전망)
 *   3) 과다 경과 보호(99:59 상한)
 */
export async function settleOnStartup() {
  const now = Date.now();
  await clampIfClockAnomaly(now);
  await splitIfCrossedMidnight(now);
  await forceStopIfExceeded();
}
