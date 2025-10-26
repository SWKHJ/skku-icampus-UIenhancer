// ===== SKKU Canvas Month Grouper (Accordion) - proxy-click version =====
(() => {
  // =========================
  // 설정
  // =========================
  const DAILY_THRESHOLD = 5;            // 날짜별 전체 과제가 이 값 이상일 때만 과목별로 묶기
  const STORAGE_PREFIX  = "icv2_acc:";  // v2 네임스페이스

  // =========================
  // 셀렉터 (FullCalendar Month Basic)
  // =========================
  const MONTH_VIEW_ROOT = ".fc-view.fc-month-view.fc-basic-view";
  const WEEK_ROW_SEL    = ".fc-row.fc-week.fc-widget-content";
  const BG_DAY_TD_SEL   = ".fc-bg table td[data-date]";          // (주 내부) 날짜 셀 7개
  const SKEL_BODY_ROW   = ".fc-content-skeleton table tbody tr"; // (주 내부) 이벤트가 들어가는 행들
  const TD_EVENT_CONT   = "td.fc-event-container";
  const EVENT_SEL       = "a.fc-day-grid-event.fc-h-event.fc-event";

  const isMonthView = () => document.querySelector(MONTH_VIEW_ROOT) != null;

  // 현재 화면의 해시에서 month scope(YYYY-MM) 계산
  function getMonthScope() {
    const m = (location.hash || "").match(/view_start=(\d{4}-\d{2}-\d{2})/);
    return (m ? m[1] : new Date().toISOString().slice(0, 10)).slice(0, 7);
  }
  const storageKey = (scope, dateStr, courseId) =>
    `${STORAGE_PREFIX}${scope}|${dateStr}|${courseId}`;

  // 초기 진입 시 기존 상태 정리
  (function clearAllAccordionStatesOnLoad() {
    try {
      const rm = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith(STORAGE_PREFIX)) rm.push(k);
      }
      rm.forEach(k => sessionStorage.removeItem(k));
    } catch (_) {}
  })();

  (function cleanupLegacyKeysOnce() {
    const FLAG = `${STORAGE_PREFIX}cleanup_done`;
    if (sessionStorage.getItem(FLAG) === "1") return;
    try {
      const rm = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith("ic_acc:")) rm.push(k);
      }
      rm.forEach(k => sessionStorage.removeItem(k));
      sessionStorage.setItem(FLAG, "1");
    } catch (_) {}
  })();

  // =========================
  // 추출/유틸
  // =========================
  const extractCourseId = (a) =>
    ((a.className || "").match(/group_course_(\d+)/) || [])[1] || null;

  const extractCourseName = (a) => {
    const sr = a.querySelector(".fc-content .screenreader-only");
    if (sr && sr.textContent) {
      const t = sr.textContent.trim();
      const m = t.match(/캘린더:\s*(.+)$/);
      return (m ? m[1] : t).trim();
    }
    const t2 = a.textContent?.trim();
    return t2 || "";
  };

  const extractColor = (a) => {
    const cs = getComputedStyle(a);
    // Canvas 카드들은 보통 border-left 색에 과목색이 들어있음
    return cs.borderLeftColor || cs.borderBottomColor || cs.borderColor || "";
  };

  function createAccordion(title, count, color, fullTitleForTooltip) {
    const wrap = document.createElement("div");
    wrap.className = "ic-accordion";

    const header = document.createElement("button");
    header.type = "button";
    header.className = "ic-acc-header";
    header.setAttribute("title", fullTitleForTooltip || title);
    header.setAttribute("aria-label", fullTitleForTooltip || title);
    header.innerHTML = `
      <span class="ic-acc-dot" style="${color ? `background:${color}` : ""}"></span>
      <span class="ic-acc-title"></span>
      <span class="ic-acc-count">${count}</span>
    `;
    header.querySelector(".ic-acc-title").textContent = title;

    const body = document.createElement("div");
    body.className = "ic-acc-body";

    wrap.appendChild(header);
    wrap.appendChild(body);
    return { wrap, header, body };
  }

  function refreshHeaderColors(root = document) {
    root.querySelectorAll(".ic-accordion").forEach(acc => {
      const body = acc.querySelector(".ic-acc-body");
      const dot  = acc.querySelector(".ic-acc-dot");
      if (!body || !dot) return;
      const firstEvent = body.querySelector(EVENT_SEL);
      if (!firstEvent) return;
      const clr = extractColor(firstEvent);
      if (clr) dot.style.background = clr;
    });
  }

  // =========================
  // Proxy 카드: 원본을 옮기지 말고, 복제본을 넣고 원본을 클릭시킴
  // =========================
  function triggerNativeClick(el) {
    const evt = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
    el.dispatchEvent(evt);
  }

  function makeProxyEventCard(originalA) {
    // 이미 프록시 처리한 원본이면 재생성하지 않음
    if (originalA.dataset.icProxied === "1") {
      // 기존에 만들어진 형제 프록시를 찾아 재사용할 수도 있지만,
      // 호출부에서 매번 새로 만들지 않도록 필터링하므로 여기선 패스
    }
    const proxy = originalA.cloneNode(true);
    proxy.removeAttribute("id"); // 혹시 중복 id 방지
    proxy.dataset.icProxy = "1";

    // 프록시는 클릭 시 원본을 클릭
    proxy.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      triggerNativeClick(originalA);
    }, { passive: false });

    // 원본은 제자리에서 숨김(핸들러/컨텍스트 보존)
    originalA.classList.add("ic-hidden-original");
    originalA.dataset.icProxied = "1";

    return proxy;
  }

  // =========================
  // Week 단위 처리
  // =========================
  function processWeekRow(weekEl) {
    if (weekEl.dataset.icProcessed === "1") return;

    const dateCells = Array.from(weekEl.querySelectorAll(BG_DAY_TD_SEL));
    if (dateCells.length !== 7) return;

    const skelRows = Array.from(weekEl.querySelectorAll(SKEL_BODY_ROW));
    const colBuckets = Array.from({ length: 7 }, () => []);
    for (const tr of skelRows) {
      const tds = Array.from(tr.querySelectorAll(TD_EVENT_CONT));
      for (let col = 0; col < Math.min(7, tds.length); col++) colBuckets[col].push(tds[col]);
    }

    const monthScope = getMonthScope();

    for (let col = 0; col < 7; col++) {
      const dateTd = dateCells[col];
      const dateStr = dateTd.getAttribute("data-date");
      if (!dateStr) continue;

      const eventTds = colBuckets[col];
      if (!eventTds || !eventTds.length) continue;

      // 해당 날짜의 모든 a 카드 수집 (아직 아코디언 내부가 아닌 것만)
      const allCards = [];
      for (const td of eventTds) {
        const anchors = Array
          .from(td.querySelectorAll(EVENT_SEL))
          // 이미 아코디언에 들어간 프록시가 아니라, 원본만 대상
          .filter(a => !a.closest(".ic-accordion") && a.dataset.icProxy !== "1");
        if (anchors.length) allCards.push(...anchors);
      }
      if (!allCards.length) continue;

      if (allCards.length < DAILY_THRESHOLD) continue;

      // 과목별 버킷
      const buckets = new Map();
      for (const a of allCards) {
        const cid   = extractCourseId(a) || "unknown";
        const name  = extractCourseName(a) || `Course ${cid}`;
        const color = extractColor(a);
        if (!buckets.has(cid)) buckets.set(cid, { name, color, nodes: [] });
        buckets.get(cid).nodes.push(a);
      }

      const firstTd = eventTds[0];

      for (const [cid, info] of buckets.entries()) {
        if (!info.nodes.length) continue;

        const key = storageKey(monthScope, dateStr, cid);
        const { wrap, header, body } =
          createAccordion(info.name, info.nodes.length, info.color, info.name);

        const open = sessionStorage.getItem(key) === "1";
        body.style.display = open ? "block" : "none";
        header.classList.toggle("is-open", open);

        header.addEventListener("click", () => {
          const nowOpen = body.style.display === "none";
          body.style.display = nowOpen ? "block" : "none";
          header.classList.toggle("is-open", nowOpen);
          sessionStorage.setItem(key, nowOpen ? "1" : "0");
          refreshHeaderColors(wrap);
        });

        // 원본을 이동하지 않고 프록시를 아코디언에 삽입
        info.nodes.forEach(n => {
          // 이미 프록시된 원본은 건너뜀
          if (n.dataset.icProxied === "1") return;
          const proxy = makeProxyEventCard(n);
          body.appendChild(proxy);
        });

        // 첫 번째 칸 상단에 아코디언 prepend
        firstTd.prepend(wrap);
      }
    }

    weekEl.dataset.icProcessed = "1";
  }

  function applyMonthAccordion() {
    if (!isMonthView()) return;
    document.querySelectorAll(WEEK_ROW_SEL).forEach(processWeekRow);
    refreshHeaderColors(document);
  }

  // =========================
  // 스케줄링 & 옵저버
  // =========================
  let ticking = false;
  function scheduleApply() {
    if (ticking) return;
    ticking = true;
    const run = () => {
      try { applyMonthAccordion(); } finally { ticking = false; }
    };
    if ("requestIdleCallback" in window) {
      requestIdleCallback(run, { timeout: 200 });
    } else {
      requestAnimationFrame(run);
    }
  }

  // 최초 1회
  scheduleApply();

  // DOM 변화 감시 (월 이동, 데이터 로딩 등)
  const mo = new MutationObserver(() => {
    refreshHeaderColors(document);
    scheduleApply();
  });
  mo.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class"]
  });

  // 주소 해시로 월이 바뀌는 Canvas 패턴 대응
  window.addEventListener("hashchange", () => setTimeout(scheduleApply, 0));
})();
