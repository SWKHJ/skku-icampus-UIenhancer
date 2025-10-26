// ==== shimeji/script_watch.js ====
// A) 페이지 훅(Main world) 주입 요청 (제출 감지용)
// B) 제출 연관 스크립트/요청 감지 → 축하 애니메이션 (기존 유지)
// C) 접속 보상 +5pt
//    - 디버그 모드 ON → 접속할 때마다 +5pt
//    - 디버그 모드 OFF → '하루 1회'만 +5pt
//    - 디버그 토글은 chrome.storage.local('shimeji_debug_flags_v1') 로 관리
// D) 간단 토스트 UI
// E) 과제 제출 성공(phase==='completed') 시 +10pt 지급  ← NEW

(() => {
  // --------- 상수/도우미 ----------
  const STORE_KEY = 'shimeji_store_v1';           // 상점/포인트 저장소
  const DEBUG_KEY = 'shimeji_debug_flags_v1';     // 디버그 플래그 저장소
  const RE_SCRIPT = /\/dist\/webpack-production\/submit_assignment-[^/]+\.js(\?|#|$)/i;
  const RE_REQ    = /(^|\/)submissions?(\/|\.|$)/i;

  const COOLDOWN_MS = 1200;
  const seen = new Map();

  const clamp = (v,a,b) => Math.max(a, Math.min(b, v));

  // storage helpers
  async function loadShop() {
    const obj = await chrome.storage?.local.get(STORE_KEY);
    return obj?.[STORE_KEY] || { points: 0, owned: {}, activeColorPreset: null, unlockedTools: {}, _meta: {} };
  }
  async function saveShop(st) { await chrome.storage?.local.set({ [STORE_KEY]: st }); }

  async function loadDebugFlags() {
    const obj = await chrome.storage?.local.get(DEBUG_KEY);
    // 기본값: 디버그 ON (접속 시마다 +5)
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

  async function awardPoints(pts, reasonMsg) {
    try {
      const st = await loadShop();
      st.points = clamp((st.points ?? 0) + pts, 0, 1e9);
      await saveShop(st);
      if (reasonMsg) toast(`+${pts} pt\n${reasonMsg}`);
      // (팝업 열려 있으면 포인트 갱신 메시지를 보낼 수도 있지만 여기서는 생략)
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

    // 🔸 NEW: 과제 제출 "성공 시점"으로 쓰던 completed 타이밍에만 +10pt 지급
    if (phase === 'completed') {
      awardPoints(10, 'Assignment submitted');
    }
  });

  // 기존 script 태그/Performance API/MutationObserver
  // Array.from(document.scripts).forEach(sc => {
  //   if (sc.src && RE_SCRIPT.test(sc.src)) onHit('script', sc.src, 'existing');
  // });
  // try {
  //   performance.getEntriesByType('resource')
  //     .filter(e => e.initiatorType === 'script' && RE_SCRIPT.test(e.name))
  //     .forEach(e => onHit('script', e.name, 'perf-initial'));
  //   const po = new PerformanceObserver(list => {
  //     list.getEntries()
  //       .filter(e => e.initiatorType === 'script' && RE_SCRIPT.test(e.name))
  //       .forEach(e => onHit('script', e.name, 'perf-observer'));
  //   });
  //   po.observe({ type: 'resource', buffered: true });
  // } catch {}
  // const mo = new MutationObserver(muts => {
  //   for (const m of muts) {
  //     m.addedNodes.forEach(n => {
  //       if (n.tagName === 'SCRIPT' && n.src && RE_SCRIPT.test(n.src)) {
  //         n.addEventListener('load', () => onHit('script', n.src, 'script-load'), { once: true });
  //         onHit('script', n.src, 'script-added');
  //       }
  //     });
  //   }
  // });
  // mo.observe(document.documentElement, { subtree: true, childList: true });

  // --------- C) 접속 보상 +5pt (디버그/일반 토글) ----------
  function todayStr() {
    const d = new Date();
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  async function grantVisitBonus() {
    try {
      const flags = await loadDebugFlags();        // { dailyBonusAlways: true|false }
      const st = await loadShop();
      st._meta = st._meta || {};

      if (flags.dailyBonusAlways) {
        // 디버그: 접속할 때마다 +5
        st.points = clamp((st.points ?? 0) + 5, 0, 1e9);
        await saveShop(st);
        toast(`+5 pt\nDebug: visit bonus`);
        return;
      }

      // 일반 모드: 하루 1회만 +5 (사이트 전역)
      const today = todayStr();
      const last = st._meta.lastDailyVisitBonusDate;
      if (last !== today) {
        st.points = clamp((st.points ?? 0) + 5, 0, 1e9);
        st._meta.lastDailyVisitBonusDate = today;
        await saveShop(st);
        toast(`+5 pt\nDaily visit bonus`);
      }
    } catch {}
  }

  // DOM 준비되면 접속 보상 처리
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', grantVisitBonus, { once: true });
  } else {
    grantVisitBonus();
  }

  // --------- (참고) 디버그 토글을 콘솔에서 쉽게 바꾸는 헬퍼(원하면 사용) ----------
  // 개발자도구 콘솔에서:
  //   chrome.storage.local.set({ shimeji_debug_flags_v1: { dailyBonusAlways: true }})  // 매 접속마다 +5
  //   chrome.storage.local.set({ shimeji_debug_flags_v1: { dailyBonusAlways: false }}) // 하루 1회만 +5
  // 위 주석만으로 충분해서 실제 함수는 주입하지 않음.
})();
