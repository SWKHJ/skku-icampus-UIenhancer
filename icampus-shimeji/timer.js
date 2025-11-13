// ===== timer.js (stable, HH:MM:SS everywhere; no live aggregation in UI) =====
const KEY    = 'studyTimer:v1';
const MAX_MS = (99 * 60 + 59) * 1000; // 99분 59초 보호 한계

/* ---------- 초기 상태 ---------- */
function defaultState() {
  return {
    // 런타임
    running: false,
    startTimestamp: 0,
    offsetMs: 0,          // 일시중지까지 누적(ms)
    elapsedMs: 0,         // (오프스크린 하트비트가 매초 갱신; UI는 직접 사용하지 않음)
    lastAliveAt: 0,       // 마지막 하트비트 시각(시계 점프 탐지 기준)

    // 메타
    work: '',
    detail: '',
    taskName: '',

    // 점수
    mode: 'linear_min',   // 분당 0.1 + 30분마다 +1
    linearPerMin: 0.10,

    // 로그 (종료된 세션만)
    // {
    //   task, detail, start, end, seconds, minutes, points, mode,
    //   tz, endLocalDate, endLocalYM, isoYear, isoWeek
    // }
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

/* ---------- 포맷터 (단위 명시형; 전부 HH:MM:SS로 통일) ---------- */
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

// 하위 호환(기존 호출부 임시 유지). 기본을 ms로 간주.
export function fmtHMS(msOrSec) { return fmtHMS_ms(msOrSec); }
export function fmtMMSS(ms)     { return fmtHMS_ms(ms); }

/* ---------- 타임존/집계 키 유틸 ---------- */
function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * buildSessionKeys(endMs)
 * - 세션 종료 시각(end, UTC ms)을 기준으로
 *   세션 당시의 타임존/일·월·주 집계 키를 생성
 */
function buildSessionKeys(endMs) {
  const d = new Date(endMs);

  // IANA 타임존 (예: "Asia/Seoul"). 지원 안 되면 UTC로 폴백.
  let tz = 'UTC';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    // 환경에 따라 Intl이 없을 수도 있으니 방어
    tz = 'UTC';
  }

  const y  = d.getFullYear();
  const m  = d.getMonth(); // 0-based
  const dd = d.getDate();

  const endLocalDate = `${y}-${pad2(m + 1)}-${pad2(dd)}`;
  const endLocalYM   = `${y}-${pad2(m + 1)}`;

  // ISO week-year/week 계산 (UTC 기준이지만, 실사용엔 충분)
  const tmp = new Date(Date.UTC(y, m, dd));
  const dayNum = tmp.getUTCDay() || 7;         // 1(월)~7(일)
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum); // 해당 주의 목요일
  const isoYear = tmp.getUTCFullYear();
  const jan1 = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil(((tmp - jan1) / 86400000 + 1) / 7);

  return { tz, endLocalDate, endLocalYM, isoYear, isoWeek };
}

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

/* ---------- 세션 포인트 지급(고양이 포인트) ---------- */
// CHG: 실제 고양이 포인트 지급은 여기서만 수행.
//      logs에는 calcPoints 그대로 기록하고,
//      고양이 포인트는 Math.floor(points)만큼만 지급.
async function awardSessionPoints(rawPoints, mode) {
  const delta = Math.floor(Math.max(0, Number(rawPoints) || 0));
  if (!delta) return; // 0 이하면 아무 것도 안 함
  try {
    await chrome.runtime?.sendMessage?.({
      type: 'POINTS_EARN',
      delta,
      reason: `timer_session:${mode || 'unknown'}`
    });
  } catch {
    // 메시지 실패해도 타이머/로그는 그대로 유지
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

  const keys = buildSessionKeys(now);

  const log = {
    task:   st.work || st.taskName || '',
    detail: st.detail || '',
    start,
    end: now,
    seconds,
    minutes,
    points,
    mode: st.mode,
    ...keys
  };

  // CHG: 로그에 세션 점수를 기록한 뒤, 그 점수만큼 고양이 포인트 지급
  const next = { ...st, logs: [...st.logs, log] };
  await setState(next);
  await awardSessionPoints(points, st.mode);
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
  const rows = [[
    'task','detail','startISO','endISO',
    'seconds','minutes','points','mode',
    'tz','endLocalDate','endLocalYM','isoYear','isoWeek'
  ]];

  st.logs.forEach(l => rows.push([
    l.task,
    l.detail || '',
    new Date(l.start).toISOString(),
    new Date(l.end).toISOString(),
    l.seconds,
    Math.round(l.minutes * 100) / 100, // 소수 2자리
    l.points,
    l.mode,
    l.tz || '',
    l.endLocalDate || '',
    l.endLocalYM || '',
    l.isoYear ?? '',
    l.isoWeek ?? ''
  ]));
  return rows.map(r => r.map(csvEsc).join(',')).join('\n');
}

function csvEsc(s) {
  s = String(s);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/* ---------- 삭제 유틸 ---------- */
// N일 이전(종료 시각 기준) 로그 삭제
export async function purgeLogsOlderThan(days = 180) {
  const st = await getState();
  const cutoff = Date.now() - Math.max(1, Number(days)||180) * 24*60*60*1000;
  const kept = (st.logs || []).filter(l => (l?.end ?? 0) >= cutoff);
  await setState({ ...st, logs: kept });
}

// 전체 로그 삭제
export async function purgeAllLogs() {
  const st = await getState();
  await setState({ ...st, logs: [] });
}


/* ---------- 시계 점프/자정 분할/스타트업 정산 ---------- */
/**
 * clampIfClockAnomaly(now)
 * - 시스템 시계가 과거/미래로 급격히 이동했을 때 음수 경과가 생기지 않도록
 *   startTimestamp가 now보다 미래면 now로 당겨 보정.
 * - lastAliveAt은 슬립/웨이크 체크 기준점으로 갱신.
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

  // 기준점 갱신(경고성 로깅 위치—필요시 console.warn 추가 가능)
  await setState({ lastAliveAt: now });
  return false;
}

/**
 * splitIfCrossedMidnight(now)
 * - running 세션이 자정 경계를 넘겼으면, 경계 이전 구간을 하나의 로그로 확정하고
 *   동일 작업을 00:00부터 계속 진행(startTimestamp=boundary)하도록 분할.
 * - offsetMs(일시중지로 누적된 구간)는 “현재 running 블록의 과거 구간”이므로
 *   경계 이전 파트로 귀속시키고 0으로 초기화.
 */
export async function splitIfCrossedMidnight(now = Date.now()) {
  const st = await getState();
  if (!st.running || !st.startTimestamp) return false;

  // 오늘 00:00(로컬) 경계
  const today0 = new Date(now);
  today0.setHours(0, 0, 0, 0);
  const boundary = today0.getTime();

  // 시작시각이 오늘 00:00 이전이면 분할 필요
  if (st.startTimestamp < boundary) {
    const elapsedFirst = Math.max(0, (boundary - st.startTimestamp) + (st.offsetMs || 0));

    if (elapsedFirst > 0) {
      const seconds = Math.floor(elapsedFirst / 1000);
      const minutes = seconds / 60;
      const points  = calcPoints(minutes, st.mode, { linearPerMin: st.linearPerMin });

      // (end - length)로 start 역산
      const end1   = boundary;
      const start1 = end1 - elapsedFirst;

      const keys1 = buildSessionKeys(end1);

      const log1 = {
        task:   st.work || st.taskName || '',
        detail: st.detail || '',
        start:  start1,
        end:    end1,
        seconds,
        minutes,
        points,
        mode:   st.mode,
        ...keys1
      };

      await setState({
        logs: [...(st.logs || []), log1],
        startTimestamp: boundary, // 경계부터 계속
        offsetMs: 0,              // 과거 파트로 귀속했으므로 초기화
      });

      // CHG: 자정 분할로 생긴 첫 번째 조각에 대해서도 포인트 지급
      await awardSessionPoints(points, st.mode);

      return true;
    }
  }
  return false;
}

/**
 * settleOnStartup()
 * - 브라우저/확장 재시작 시 상태를 정상화:
 *   1) 클록 보정(clampIfClockAnomaly)
 *   2) 자정 분할(splitIfCrossedMidnight)
 *   3) 상한 보호(forceStopIfExceeded)
 */
export async function settleOnStartup() {
  const now = Date.now();
  await clampIfClockAnomaly(now);
  await splitIfCrossedMidnight(now);
  await forceStopIfExceeded();
}
