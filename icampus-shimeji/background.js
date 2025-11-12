// ===== background.js (Robust + prefill guard; offscreen + alarms wired) =====

// 0) 컨텍스트 메뉴: 선택 텍스트에서만 노출
const SEL_ID = 'catTimer.fromSelection';

function createMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: SEL_ID,
      title: '공부 시간 측정',
      contexts: ['selection'],
      documentUrlPatterns: ['http://*/*', 'https://*/*']
    });
  });
}
createMenus();
chrome.runtime.onInstalled.addListener(createMenus);
chrome.runtime.onStartup.addListener(createMenus);

// 1) 선택 텍스트 → (정지 상태면) 프리필, (아니면) 차단 안내만
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== SEL_ID) return;

  const KEY = 'studyTimer:v1';
  const st = await new Promise(res => chrome.storage.local.get(KEY, o => res(o[KEY] || {})));
  const runningOrPaused = !!st?.running || (Number(st?.offsetMs) > 0);

  if (runningOrPaused) {
    await chrome.storage.session.set({ prefillBlocked: true });
    await chrome.action.openPopup();
    return;
  }

  const normalize = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  let detail = normalize(info.selectionText || '');
  if (!detail && tab?.id != null) {
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => (window.getSelection ? String(window.getSelection()).trim() : '')
      });
      detail = normalize(result);
    } catch (e) {
      console.warn('executeScript fallback failed:', e);
    }
  }

  let work = normalize(tab?.title || '');
  if (!work) {
    try { work = new URL(tab?.url || '').host; } catch {}
  }
  work = cut(work, 80);
  detail = cut(detail, 140);

  await chrome.storage.session.set({ timerPrefill: { work, detail } });
  await chrome.action.openPopup();
});

// 2) 타이머 보조(오프스크린/알람) — 실패해도 메뉴는 그대로 동작
(async () => {
  try {
    // 타이머 보조 유틸들
    const {
      forceStopIfExceeded,
      clampIfClockAnomaly,
      splitIfCrossedMidnight,
      settleOnStartup
    } = await import('./timer.js');

    // 선택적 페이지 훅 주입
    chrome.runtime.onMessage.addListener((msg, sender) => {
      if (msg?.type === 'INJECT_PAGE_HOOK' && sender.tab?.id != null) {
        chrome.scripting.executeScript({
          target: { tabId: sender.tab.id },
          files: ['shimeji/page_hook.js'],
          world: 'MAIN'
        });
      }
    });

    // ---------- Offscreen 문서 관리 ----------
    chrome.runtime.onMessage.addListener(async (msg) => {
      if (msg?.type === 'OFFSCREEN_START') await ensureOffscreen();
      else if (msg?.type === 'OFFSCREEN_STOP') await closeOffscreen();
    });

    async function ensureOffscreen() {
      try {
        const exists = await chrome.offscreen.hasDocument?.();
        if (exists) return;
        await chrome.offscreen.createDocument({
          url: 'offscreen_timer.html',
          reasons: ['DOM_PARSER'], // 허용 사유. BLOBS도 대안 가능
          justification: 'Second-precision study timer heartbeat while popup is closed.'
        });
      } catch (e) {
        // 일부 환경에서 offscreen 미지원일 수 있음 → 조용히 패스
        console.debug('ensureOffscreen skipped:', e?.message || e);
      }
    }
    async function closeOffscreen() {
      try {
        const exists = await chrome.offscreen.hasDocument?.();
        if (exists) await chrome.offscreen.closeDocument();
      } catch (e) {
        console.debug('closeOffscreen skipped:', e?.message || e);
      }
    }

    // 타이머가 멈추면 오프스크린 자동 정리 (여러 팝업/창 간에 안전)
    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (area !== 'local') return;
      const st = changes['studyTimer:v1']?.newValue;
      if (!st) return;
      if (!st.running) await closeOffscreen();
    });

    // ---------- 알람(1분 단위 보호/정산) ----------
    function ensureAlarm() {
      // onInstalled 외에도 재생성 보장
      chrome.alarms.create('study-tick', { periodInMinutes: 1 });
    }
    chrome.runtime.onInstalled.addListener(ensureAlarm);
    chrome.runtime.onStartup.addListener(async () => {
      ensureAlarm();
      await settleOnStartup();   // 재시작 시 상태 정상화 (시계 보정/자정 분할/상한 보호)
      await closeOffscreen();    // 시작 시 오프스크린 정리
    });

    chrome.alarms.onAlarm.addListener(async (a) => {
      if (a.name !== 'study-tick') return;
      const now = Date.now();
      await clampIfClockAnomaly(now);    // 시계 뒤로 이동/깜박임 보정
      await splitIfCrossedMidnight(now); // 자정 경계 분할
      await forceStopIfExceeded();       // 99:59 상한 보호
    });
  } catch (e) {
    console.error('Timer module init failed:', e);
  }
})();
