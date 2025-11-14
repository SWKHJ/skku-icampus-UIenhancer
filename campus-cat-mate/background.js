// ===== background.js (Robust + prefill guard; offscreen + alarms + points authority) =====

// ⬇⬇⬇ NEW: 서비스워커에서는 동적 import() 금지 → 정적 import로 변경
import {
  forceStopIfExceeded,
  clampIfClockAnomaly,
  splitIfCrossedMidnight,
  settleOnStartup
} from './timer.js';

import * as PointsToken from './cat-mascot/points_token.js';
// ⬆⬆⬆ 여기까지 새로 추가

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

// 2) 타이머 보조(오프스크린/알람)
//    ⬇ 기존엔 여기서 await import('./timer.js') 했던 부분을 제거하고,
//      위에서 import한 함수들을 그대로 사용하는 구조로 변경
(async () => {
  try {
    // 선택적 페이지 훅 주입
    chrome.runtime.onMessage.addListener((msg, sender) => {
      if (msg?.type === 'INJECT_PAGE_HOOK' && sender.tab?.id != null) {
        chrome.scripting.executeScript({
          target: { tabId: sender.tab.id },
          files: ['cat-mascot/page_hook.js'],
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
          reasons: ['DOM_PARSER'],
          justification: 'Second-precision study timer heartbeat while popup is closed.'
        });
      } catch (e) {
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

    // 타이머가 멈추면 오프스크린 자동 정리
    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (area !== 'local') return;
      const st = changes['studyTimer:v1']?.newValue;
      if (!st) return;
      if (!st.running) await closeOffscreen();
    });

    // ---------- 알람(1분 단위 보호/정산) ----------
    function ensureAlarm() {
      chrome.alarms.create('study-tick', { periodInMinutes: 1 });
    }
    chrome.runtime.onInstalled.addListener(ensureAlarm);
    chrome.runtime.onStartup.addListener(async () => {
      ensureAlarm();
      await settleOnStartup();   // timer.js에서 import한 함수
      await closeOffscreen();
    });

    chrome.alarms.onAlarm.addListener(async (a) => {
      if (a.name !== 'study-tick') return;
      const now = Date.now();
      await clampIfClockAnomaly(now);
      await splitIfCrossedMidnight(now);
      await forceStopIfExceeded();
    });
  } catch (e) {
    console.error('Timer module init failed:', e);
  }
})();

// ======================
// 3) Points 권위 경로
//    ⬇ 여기서도 dynamic import → 위쪽 정적 import 사용
// ======================
(async () => {
  try {
    await PointsToken.initPointsKey();   // 키 준비

    // 직렬화 큐 (earn/spend 경합 시 순서 보장)
    let queue = Promise.resolve();
    const enqueue = (fn) => (queue = queue.then(fn).catch(() => {}));

    // 변경 브로드캐스트 (UI 동기화)
    function broadcastBalance(bal) {
      chrome.tabs.query({}, tabs => {
        for (const t of tabs) {
          if (!t.id) continue;
          chrome.tabs.sendMessage?.(t.id, { type: 'POINTS_UPDATED', balance: bal });
        }
      });
      chrome.runtime.sendMessage?.({ type: 'POINTS_UPDATED', balance: bal });
    }

    // 메시지 라우터 (get / earn / spend)
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      (async () => {
        switch (msg?.type) {
          case 'POINTS_GET': {
            const r = await PointsToken.getBalanceToken();
            sendResponse({ ok: true, balance: r.balance });
            break;
          }
          case 'POINTS_EARN': {
            await enqueue(async () => {
              const r = await PointsToken.earnPoints(+msg.delta || 0);
              if (r.ok) broadcastBalance(r.balance);
              sendResponse(r);
            });
            break;
          }
          case 'POINTS_SPEND': {
            await enqueue(async () => {
              const r = await PointsToken.spendPoints(+msg.cost || 0);
              if (r.ok) broadcastBalance(r.balance);
              sendResponse(r);
            });
            break;
          }
          default:
            break;
        }
      })();
      return true; // async 응답 유지
    });
  } catch (e) {
    console.error('Points module init failed:', e);
  }
})();
