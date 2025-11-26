// ==== cat-mascot/script_watch.js ====
// A) 페이지 훅(Main world) 주입 요청 (제출 감지용)
// B) 제출 연관 스크립트/요청 감지 → 축하 애니메이션 (기존 유지)
// C) 접속 보상 +5pt (디버그: 방문마다 / 일반: 하루 1회)
// D) 간단 토스트 UI
// E) 과제 제출 성공(phase==='completed') 시 +10pt 지급  ← 유지
// CHG: 포인트 증가는 전부 background에 메시지로 위임(서명 토큰 검증 경유)
// F) 마스코트 ON/OFF 설정 → Main world(boot.js)로 브리지

(() => {
  // --------- 상수/도우미 ----------
  const STORE_KEY = 'catMascot_store_v1';           // 상점 상태 저장(포인트 제외)
  const DEBUG_KEY = 'catMascot_debug_flags_v1';     // 디버그 플래그 저장소
  const PREF_KEY  = 'shimeji_prefs_v1';             // 마스코트 설정 저장소
  const RE_SCRIPT = /\/dist\/webpack-production\/submit_assignment-[^/]+\.js(\?|#|$)/i;
  const RE_REQ    = /(^|\/)submissions?(\/|\.|$)/i;

  const COOLDOWN_MS = 1200;
  const seen = new Map();

  // CHG: 포인트 권위 경로(얇은 래퍼)
  const Points = {
    async earn(delta, reason) {
      const r = await chrome.runtime.sendMessage({ type: 'POINTS_EARN', delta, reason });
      return r?.ok;
    }
  };

  // storage helpers (포인트 제외)
  async function loadShop() {
    const obj = await chrome.storage?.local.get(STORE_KEY);
    const st = obj?.[STORE_KEY] || {};
    // 메타만 사용(예: lastDailyVisitBonusDate); owned/tool 등 다른 필드가 있어도 그대로 둠
    st._meta = st._meta || {};
    return st;
  }
  async function saveShop(st) {
    // _meta 만 업데이트하고, 나머지 필드(ownedAccessories 등)는 그대로 보존
    const obj  = await chrome.storage?.local.get(STORE_KEY);
    const prev = obj?.[STORE_KEY] || {};

    const next = {
      ...prev,
      _meta: st._meta || prev._meta || {}
      // owned, activeColorPreset, unlockedTools,
      // ownedAccessories, equippedAccessories 등은 prev 그대로 유지
    };

    await chrome.storage?.local.set({ [STORE_KEY]: next });
  }

  async function loadDebugFlags() {
    const obj = await chrome.storage?.local.get(DEBUG_KEY);
    // 기본값: dailyBonusAlways=false (하루 1회)
    return Object.assign({ dailyBonusAlways: false }, obj?.[DEBUG_KEY] || {});
  }

  // toast
  function toast(msg, opts={}) {
    try {
      const el = document.createElement('div');
      el.textContent = msg;
      Object.assign(el.style, {
        position:'fixed', right:'16px', bottom:'16px',
        background:'rgba(28,28,32,0.95)', color:'#e6e6e6',
        padding:'10px 12px', borderRadius:'10px',
        border:'1px solid rgba(255,255,255,0.12)',
        font:'12px/1.4 system-ui,-apple-system,Segoe UI,Roboto,"Noto Sans KR",sans-serif',
        zIndex: 2147483647, boxShadow:'0 10px 24px rgba(0,0,0,0.35)',
        pointerEvents:'none', whiteSpace:'pre-line'
      });
      document.body.appendChild(el);
      setTimeout(()=> el.remove(), opts.ttl ?? 2000);
    } catch {}
  }

  // --------- A) Main world 훅 주입 ----------

  if (!window.__shim_hook_injected__) {
    window.__shim_hook_injected__ = true;
    try { chrome.runtime?.sendMessage?.({ type: 'INJECT_PAGE_HOOK' }); } catch {}
  }

  // CHG: 포인트 증가는 메시지 경유 (직접 저장 금지)
  async function awardPoints(pts, reasonMsg) {
    try {
      const ok = await Points.earn(pts, reasonMsg);
      if (ok && reasonMsg) toast(`+${pts} pt\n${reasonMsg}`);
    } catch {}
  }

  function onHit(url, phase) {
    const key = `${phase}|${url}`;
    const now = Date.now();
    const last = seen.get(key) || 0;
    if (now - last < COOLDOWN_MS) return; // 쏟아지는 중복 차단
    seen.set(key, now);

    sessionStorage.setItem('__catMascot_afterSubmission', JSON.stringify({
      t: now, url, phase
    }));
  }

  // --------- page_hook.js / boot.js → postMessage 수신 ----------
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d) return;

    // ★ boot.js 준비 완료 신호 → 이때 설정값을 동기화
    if (d.__from === 'CampusCatMate' && d.type === 'SHIMEJI_READY') {
      syncInitialMascotState();
      return;
    }

    // 제출 감지용 메시지만 처리
    if (d.type !== '__catMascot_req') return;

    const url = d.url || '';
    const phase = (d.phase || '').toLowerCase();
    if (!RE_REQ.test(url)) return; // /submissions 만

    // 기존 애니메이션 트리거 유지
    onHit(d.url, d.phase || 'unknown');

    // NEW: 제출 완료(completed)에서만 +10pt
    if (phase === 'completed') {
      awardPoints(10, 'Assignment submitted');
    }
  });

  // --------- F) 마스코트 ON/OFF 브리지 ----------

  function postMascotToggle(enabled) {
    // Main world(boot.js)가 듣도록 페이지에 메시지 브로드캐스트
    window.postMessage(
      { __from: 'CampusCatMate', type: 'SHIMEJI_TOGGLE', enabled: !!enabled },
      '*'
    );
  }

  async function syncInitialMascotState() {
    try {
      const obj = await chrome.storage?.local.get(PREF_KEY);
      const prefs = obj?.[PREF_KEY] || { enabled: true };
      // 기본값: enabled === true
      postMascotToggle(prefs.enabled !== false);
    } catch {
      // storage 실패 시에는 그냥 ON 으로 간주
      postMascotToggle(true);
    }
  }

  // popup/settings → content 로 오는 토글 메시지 브리지
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== 'SHIMEJI_TOGGLE') return;
    postMascotToggle(msg.enabled);
  });

  // --------- C) 접속 보상 +5pt (디버그/일반) ----------
  function todayStr() {
    const d = new Date();
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  async function grantVisitBonus() {
    try {
      const flags = await loadDebugFlags();  // { dailyBonusAlways: true|false }
      const st = await loadShop();

      if (flags.dailyBonusAlways) {
        // CHG: 방문마다 +5 → 권위 경로로 지급
        const ok = await Points.earn(5, 'Debug: visit bonus');
        if (ok) toast(`+5 pt\nDebug: visit bonus`);
        return;
      }

      // 일반 모드: 하루 1회만 +5 (사이트 전역)
      const today = todayStr();
      const last = st._meta.lastDailyVisitBonusDate;
      if (last !== today) {
        const ok = await Points.earn(5, 'Daily visit bonus'); // CHG
        if (ok) {
          st._meta.lastDailyVisitBonusDate = today;
          await saveShop(st); // 메타만 저장
          toast(`+5 pt\nDaily visit bonus`);
        }
      }
    } catch {}
  }

  // DOM 준비되면:
  // - 접속 보상 처리
  // - 약간 딜레이 후 한 번 더 마스코트 상태 동기화 시도
  //   (boot.js 가 먼저/나중에 로드되는 모든 케이스 커버용)
  function onReady() {
    grantVisitBonus();

    // READY 메시지를 못 받는 레이스 케이스 대비용
    setTimeout(() => {
      syncInitialMascotState();
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady, { once: true });
  } else {
    onReady();
  }

  // (참고) 디버그 토글은 기존 주석 안내대로 storage에서 설정
})();
