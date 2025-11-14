// ===== offscreen_timer.js (safe heartbeat: 1s compute, 15s write-merge) =====
const KEY = 'studyTimer:v1';

let tickId = null;
let writeId = null;

init();

async function init() {
  await safeTick();                  // 즉시 1회
  tickId = setIntervalSafe(safeTick, 1000);     // 1s 계산 (쓰기 없음)
  writeId = setIntervalSafe(periodicWrite, 15000); // 15s 병합 저장
}

async function safeTick() {
  const st = await getState();
  if (!st || !st.running || !st.startTimestamp) return cleanup(); // 러닝 아니면 종료

  const now = Date.now();
  // 경과 = offset + (now - start). 음수/NaN 방지
  const elapsed = Math.max(0, (st.offsetMs || 0) + Math.max(0, now - st.startTimestamp));

  // 메모리 상으로만 유지(표시/정합 보조)
  self._lastElapsedMs = elapsed;
  self._lastAliveAt   = now;
}

async function periodicWrite() {
  const st = await getState();
  if (!st || !st.running || !st.startTimestamp) return cleanup();

  // 최근 계산값을 병합 저장(다른 필드 절대 덮어쓰지 않음)
  const patch = {
    elapsedMs:   Math.max(0, Number(self._lastElapsedMs || 0)),
    lastAliveAt: Number(self._lastAliveAt || Date.now())
  };
  await mergeState(patch);
}

/* ---------------- Utils ---------------- */

function setIntervalSafe(fn, ms) {
  return setInterval(() => { try { fn(); } catch (e) {/* no-op */} }, ms);
}

function cleanup() {
  if (tickId) { clearInterval(tickId); tickId = null; }
  if (writeId){ clearInterval(writeId); writeId = null; }
  // 문서 자체 close는 background의 OFFSCREEN_STOP에서 처리
}

function getState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(KEY, (obj) => resolve(obj[KEY]));
  });
}

// 병합 저장: 최신 state를 다시 읽고 필요한 필드만 패치
async function mergeState(patch) {
  return new Promise((resolve) => {
    chrome.storage.local.get(KEY, (obj) => {
      const cur = obj[KEY] || {};
      const next = { ...cur, ...patch };
      chrome.storage.local.set({ [KEY]: next }, () => resolve());
    });
  });
}
