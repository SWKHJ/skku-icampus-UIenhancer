// dashboardUI.js v4.0 — iCampus: "완료 항목 펼치기"만 제공 (안정/초간단)
;(function () {
  // 캘린더 페이지에서는 아무것도 하지 않음
  //if (/^\/calendar\b/.test(location.pathname)) return;
  const HEADER_ACTIONS = '#dashboard_header_container .ic-Dashboard-header__actions';
  const ITEM_SEL       = '.PlannerItem-styles__root.planner-item';
  const CHECKBOX_SEL   = 'input[type="checkbox"], [role="checkbox"]';
  const TOGGLE_SEL     = '[aria-expanded]'; // 접힘 상태면 aria-expanded="false"
  const GROUP_SEL      = 'div.planner-completed-items, div.CompletedItemsFacade-styles__root';

  const $all = (r, s) => Array.from(r.querySelectorAll(s));
  const qs   = (r, s) => r.querySelector(s);

  const isCompleted = (item) => {
    const cb = item.querySelector(CHECKBOX_SEL);
    const a  = cb?.getAttribute?.('aria-checked');
    return !!(cb && (cb.checked || a === 'true'));
  };

  const getToggle = (item) => {
    const el = item.querySelector(TOGGLE_SEL);
    return el ? (el.closest('button,[role="button"]') || el) : null;
  };

  const ensureGroupOpen = (next) => {
    const groups = $all(document, GROUP_SEL);
    let opened = 0;
    for (const g of groups) {
      const b = g.querySelector('button[aria-expanded],[role="button"][aria-expanded]');
      if (b && b.getAttribute('aria-expanded') === 'false') { b.click(); opened++; }
    }
    opened ? requestAnimationFrame(() => requestAnimationFrame(next)) : next();
  };

  const expandCompleted = () => {
    ensureGroupOpen(() => {
      $all(document, ITEM_SEL).forEach(it => {
        if (!isCompleted(it)) return;
        const btn = getToggle(it);
        if (!btn) return;
        if (btn.getAttribute('aria-expanded') === 'false') btn.click();
      });
    });
  };

  const injectButton = () => {
    const actions = qs(document, HEADER_ACTIONS); if (!actions) return;
    const today = [...actions.querySelectorAll('button,[role="button"]')]
      .find(b => ['오늘','Today'].includes((b.textContent||'').trim()));
    if (!today || qs(actions, '#icampus-expand-completed')) return;

    const btn = document.createElement('button');
    btn.id = 'icampus-expand-completed';
    btn.type = 'button';
    btn.textContent = '완료 항목 펼치기';
    btn.style.cssText = 'margin-right:8px;padding:6px 10px;border:1px solid rgba(0,0,0,.2);border-radius:8px;background:#fff;font-size:12px;cursor:pointer;';
    btn.addEventListener('click', expandCompleted);
    today.insertAdjacentElement('beforebegin', btn); // “오늘” 왼쪽
  };

  const mo = new MutationObserver(m => {
    for (const x of m) if (x.type === 'childList' && x.addedNodes.length) { injectButton(); break; }
  });

  const boot = () => { injectButton(); mo.observe(document.body, { childList:true, subtree:true }); };
  (document.readyState === 'loading')
    ? document.addEventListener('DOMContentLoaded', boot, { once:true })
    : boot();

  // 콘솔 수동 호출용(선택)
  window.ICampusExpandCompleted = expandCompleted;
})();
