// ==== shimeji/script_watch.js ====
// A) 페이지 훅(Main world) 주입 요청 (제출 감지용)
// B) 제출 연관 스크립트/요청 감지 → 축하 애니메이션 (기존 유지)
// C) 접속 보상 +5pt (디버그: 방문마다 / 일반: 하루 1회)
// D) 간단 토스트 UI
// E) 과제 제출 성공(phase==='completed') 시 +10pt 지급  ← 유지
// CHG: 포인트 증가는 전부 background에 메시지로 위임(서명 토큰 검증 경유)

(() => {
  // --------- 상수/도우미 ----------
  const STORE_KEY = 'shimeji_store_v1';           // 상점 상태 저장(포인트 제외)
  const DEBUG_KEY = 'shimeji_debug_flags_v1';     // 디버그 플래그 저장소
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
    // CHG: 포인트 필드가 들어가지 않도록 방어적으로 필터링
    const { _meta, owned, activeColorPreset, unlockedTools } = st;
    await chrome.storage?.local.set({ [STORE_KEY]: { _meta, owned, activeColorPreset, unlockedTools } });
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

    sessionStorage.setItem('__shimeji_afterSubmission', JSON.stringify({
      t: now, url, phase
    }));
  }

  // page_hook.js → postMessage 수신
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.type !== '__shimeji_req') return;

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

  // (기존 스크립트 감시 로직은 주석 상태 유지)

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

  // DOM 준비되면 접속 보상 처리
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', grantVisitBonus, { once: true });
  } else {
    grantVisitBonus();
  }

  // (참고) 디버그 토글은 기존 주석 안내대로 storage에서 설정
})();
