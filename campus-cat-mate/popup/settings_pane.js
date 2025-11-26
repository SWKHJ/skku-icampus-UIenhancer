// ===== popup/settings_pane.js =====
// Settings 탭: CSV 내보내기(원시/일간) + 범위 검증 + 날짜 역전 시 버튼 비활성화
//           + "N일 이전 삭제" / "모든 로그 삭제"
//           + 고양이 마스코트 ON/OFF 설정
// 의존: chrome.downloads, chrome.storage, ../timer.js(getState, setState)

import { getState, setState } from '../timer.js';

const PREF_KEY = 'shimeji_prefs_v1';

let root = null;

// export
let elStart = null, elEnd = null;
let modeRaw = null, modeDaily = null;
let btnExportGo = null;
let hint = null;

// delete
let daysOlder = null;
let btnDeleteOlder = null;
let btnDeleteAll = null;
let deleteHint = null;

// mascot
let chkMascot = null;

// 이벤트 추적
const bound = [];

// 개별 핸들러 참조 (unbind용)
let onExportClick = null;
let onMascotChange = null;

/* --------------- helpers --------------- */
const on  = (el, ev, fn) => el && el.addEventListener(ev, fn);
const off = (el, ev, fn) => el && el.removeEventListener(ev, fn);

function fmtDateLocal(ms) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const dd= String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}

// YYYY-MM-DD → [startMs, endMs); invalid -> null
function dateRangeToMs(startStr, endStr) {
  if (!startStr || !endStr) return null;
  const s = new Date(`${startStr}T00:00:00`).getTime();
  const e = new Date(`${endStr}T00:00:00`).getTime() + 24*60*60*1000;
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
  if (s >= e) return null; // 종료일이 시작일보다 앞서면 무효
  return { startMs: s, endMs: e };
}

function csvEsc(s) {
  s = String(s ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}
const rowsToCSV = (rows) => rows.map(r => r.map(csvEsc).join(',')).join('\n');
const toHMS = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s/3600);
  const m = Math.floor((s%3600)/60);
  const ss= s%60;
  return [h,m,ss].map(v=>String(v).padStart(2,'0')).join(':');
};
const fnameRangeLabel = (a,b) => `${a}_to_${b}`;

/* --------------- CSV builders --------------- */
function buildRawCSV(logs, startMs, endMs) {
  const rows = [[
    'task','detail',
    'startISO','endISO',
    'startLocal','endLocal',
    'seconds','minutes','hh:mm:ss','mode',
    'tz','endLocalDate','endLocalYM','isoYear','isoWeek'
  ]];

  for (const l of logs || []) {
    if (!(l?.end >= startMs && l.end < endMs)) continue;

    const sec = Number.isFinite(l.seconds)
      ? l.seconds
      : Math.max(0, Math.floor((l.minutes||0)*60));
    const min = Math.round((sec/60)*100)/100;

    const startISO = new Date(l.start).toISOString();
    const endISO   = new Date(l.end).toISOString();

    const startLocalStr = `${fmtDateLocal(l.start)} ${new Date(l.start).toTimeString().slice(0,8)}`;
    const endLocalStr   = `${fmtDateLocal(l.end)} ${new Date(l.end).toTimeString().slice(0,8)}`;

    // 새 버전 로그에는 아래 필드가 그대로 들어 있고,
    // 구버전 로그는 fallback 으로 비우거나 계산 가능한 것만 채운다.
    const tz          = l.tz || '';
    const endLocalDate= l.endLocalDate || fmtDateLocal(l.end);
    const endLocalYM  = l.endLocalYM || endLocalDate.slice(0,7);
    const isoYear     = (l.isoYear !== undefined && l.isoYear !== null) ? l.isoYear : '';
    const isoWeek     = (l.isoWeek !== undefined && l.isoWeek !== null) ? l.isoWeek : '';

    rows.push([
      l.task || '',
      l.detail || '',
      startISO,
      endISO,
      startLocalStr,
      endLocalStr,
      sec,
      min,
      toHMS(sec),
      l.mode || '',
      tz,
      endLocalDate,
      endLocalYM,
      isoYear,
      isoWeek
    ]);
  }
  return rowsToCSV(rows);
}

function buildDailySummaryCSV(logs, startMs, endMs) {
  const bucket = new Map(); // key: date|||work|||detail

  for (const l of logs || []) {
    if (!(l?.end >= startMs && l.end < endMs)) continue;
    // 가능하면 세션 당시 로컬 날짜(endLocalDate)를 그대로 사용
    const day = l.endLocalDate || fmtDateLocal(l.end);
    const key = `${day}|||${l.task||''}|||${l.detail||''}`;
    const sec = Number.isFinite(l.seconds)
      ? l.seconds
      : Math.max(0, Math.floor((l.minutes||0)*60));
    bucket.set(key, (bucket.get(key) || 0) + sec);
  }

  const rows = [['date','task','detail','seconds','minutes','hh:mm:ss']];
  const entries = Array.from(bucket.entries()).map(([k, sec]) => {
    const [date, work, detail] = k.split('|||');
    return { date, work, detail, sec };
  }).sort((a,b)=>{
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.work !== b.work) return a.work < b.work ? -1 : 1;
    if (a.detail !== b.detail) return a.detail < b.detail ? -1 : 1;
    return 0;
  });

  for (const r of entries) {
    const min = Math.round((r.sec/60)*100)/100;
    rows.push([r.date, r.work, r.detail, r.sec, min, toHMS(r.sec)]);
  }
  return rowsToCSV(rows);
}

/* --------------- download --------------- */
async function downloadCSV(csvText, baseName) {
   // UTF-8 BOM 추가
  const BOM = '\uFEFF';
  const blob = new Blob([BOM, csvText], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url,
      filename: `study-timer/${baseName}.csv`,
      saveAs: true
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

/* --------------- export actions --------------- */
function updateExportValidity() {
  const r = dateRangeToMs(elStart?.value, elEnd?.value);
  const valid = !!r;
  if (btnExportGo) btnExportGo.disabled = !valid;
  if (!valid) {
    showHint('시작일이 종료일보다 늦거나 같은 경우 내보내기를 할 수 없습니다.', true);
  } else {
    showHint('유형을 선택하고 기간을 지정한 뒤 <b>CSV 내보내기</b>를 누르면 다운로드됩니다.');
  }
}

async function doExport(kind /* 'raw' | 'daily' */) {
  const range = dateRangeToMs(elStart?.value, elEnd?.value);
  if (!range) { updateExportValidity(); return; }

  const st = await getState();
  const logs = st?.logs || [];

  if (kind === 'raw') {
    const csv = buildRawCSV(logs, range.startMs, range.endMs);
    await downloadCSV(csv, `raw_${fnameRangeLabel(elStart.value, elEnd.value)}`);
    showHint('원시 세션 CSV를 저장했습니다.');
  } else {
    const csv = buildDailySummaryCSV(logs, range.startMs, range.endMs);
    await downloadCSV(csv, `daily_${fnameRangeLabel(elStart.value, elEnd.value)}`);
    showHint('일간 요약 CSV를 저장했습니다.');
  }
}

/* --------------- delete actions --------------- */
async function doDeleteOlder() {
  const n = Math.max(1, Math.floor(Number(daysOlder?.value || 0)));
  const cutoff = Date.now() - n * 24*60*60*1000;

  const ok = confirm(`${n}일 이전의 원시 로그를 삭제합니다. 되돌릴 수 없습니다. 진행할까요?`);
  if (!ok) return;

  const st = await getState();
  const nextLogs = (st.logs || []).filter(l => (l?.end ?? 0) >= cutoff);
  await setState({ ...st, logs: nextLogs });
  showDeleteHint(`${n}일 이전 로그를 삭제했습니다. (잔여 ${nextLogs.length}개)`);
}

async function doDeleteAll() {
  const ok1 = confirm('모든 학습 기록(원시 로그)을 삭제합니다. 되돌릴 수 없습니다.\n정말 삭제할까요?');
  if (!ok1) return;
  const ok2 = confirm('최종 확인: 삭제를 진행할까요?');
  if (!ok2) return;

  const st = await getState();
  await setState({ ...st, logs: [] });
  showDeleteHint('모든 원시 로그를 삭제했습니다.');
}

/* --------------- Mascot helpers --------------- */

function broadcastMascotToggle(enabled) {
  try {
    // I-Campus 탭들에만 보내기
    chrome.tabs.query({ url: '*://canvas.skku.edu/*' }, (tabs) => {
      for (const tab of tabs) {
        try {
          chrome.tabs.sendMessage(tab.id, {
            type: 'SHIMEJI_TOGGLE',
            enabled: !!enabled
          });
        } catch {}
      }
    });
  } catch {}
}

function loadMascotPrefs() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    if (chkMascot) chkMascot.checked = true;
    return;
  }
  try {
    chrome.storage.local.get(PREF_KEY, (data) => {
      const prefs = data[PREF_KEY] || { enabled: true };
      if (chkMascot) chkMascot.checked = prefs.enabled !== false;
    });
  } catch {
    if (chkMascot) chkMascot.checked = true;
  }
}

/* --------------- UI hint --------------- */
function showHint(text, isWarn = false) {
  if (!hint) return;
  hint.innerHTML = text;
  hint.classList.toggle('warn', !!isWarn);
}
function showDeleteHint(text, isWarn = false) {
  if (!deleteHint) return;
  deleteHint.textContent = text;
  deleteHint.classList.toggle('warn', !!isWarn);
}

/* --------------- init/destroy --------------- */
export async function initPane(rootEl) {
  root = rootEl;
  if (!root) return;

  elStart = root.querySelector('#expStart');
  elEnd   = root.querySelector('#expEnd');
  modeRaw   = root.querySelector('#modeRaw');
  modeDaily = root.querySelector('#modeDaily');
  btnExportGo = root.querySelector('#btnExportGo');
  hint = root.querySelector('#exportHint');

  daysOlder = root.querySelector('#daysOlder');
  btnDeleteOlder = root.querySelector('#btnDeleteOlder');
  btnDeleteAll   = root.querySelector('#btnDeleteAll');
  deleteHint     = root.querySelector('#deleteHint');

  chkMascot = root.querySelector('#shimejiEnabled');

  // 날짜 기본값
  try {
    const st = await getState();
    const logs = st?.logs || [];
    const today = fmtDateLocal(Date.now());
    if (elEnd) elEnd.value = today;

    if (logs.length) {
      const minStart = logs.reduce((a,l)=> Math.min(a, l.start||Infinity), Infinity);
      if (elStart) elStart.value = Number.isFinite(minStart) ? fmtDateLocal(minStart) : today;
    } else {
      if (elStart) elStart.value = today;
    }
  } catch {
    const today = fmtDateLocal(Date.now());
    if (elStart) elStart.value = today;
    if (elEnd)   elEnd.value   = today;
  }

  updateExportValidity();
  loadMascotPrefs();

  // 바인딩
  on(elStart, 'change', updateExportValidity);
  bound.push({el:elStart, ev:'change', fn:updateExportValidity});

  on(elEnd,   'change', updateExportValidity);
  bound.push({el:elEnd,   ev:'change', fn:updateExportValidity});

  // Export 버튼 클릭 핸들러
  onExportClick = async () => {
    const kind = (modeDaily && modeDaily.checked) ? 'daily' : 'raw';
    await doExport(kind);
  };
  on(btnExportGo, 'click', onExportClick);
  bound.push({ el: btnExportGo, ev: 'click', fn: onExportClick });

  on(btnDeleteOlder, 'click', doDeleteOlder);
  bound.push({el:btnDeleteOlder, ev:'click', fn:doDeleteOlder});

  on(btnDeleteAll,   'click', doDeleteAll);
  bound.push({el:btnDeleteAll,   ev:'click', fn:doDeleteAll});

  // Mascot 토글
  onMascotChange = (e) => {
    const enabled = !!e.target.checked;
    try {
      chrome.storage.local.set({ [PREF_KEY]: { enabled } });
    } catch {}
    broadcastMascotToggle(enabled);
  };
  on(chkMascot, 'change', onMascotChange);
  bound.push({ el: chkMascot, ev:'change', fn:onMascotChange });
}

export function destroyPane() {
  bound.forEach(({el,ev,fn}) => off(el, ev, fn));
  bound.length = 0;

  root = elStart = elEnd = modeRaw = modeDaily = btnExportGo = hint = null;
  daysOlder = btnDeleteOlder = btnDeleteAll = deleteHint = null;
  chkMascot = null;
  onExportClick = null;
  onMascotChange = null;
}
