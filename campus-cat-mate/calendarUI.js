// ===== calendarUI.js =====
(() => {
  // =========================
  // 설정
  //  - DAILY_THRESHOLD: 하루 이벤트가 이 수 이상일 때만 과목별로 묶음(가독성 개선, 과도한 래핑 방지)
  //  - STORAGE_PREFIX: 세션 저장 키 접두어(새로고침 시 초기화해 기본 접힘 정책 유지)
  //  - HOST_CLASS: 날짜 칸 내부에 아코디언을 담는 컨테이너
  // =========================
  const DAILY_THRESHOLD = 5;           
  const STORAGE_PREFIX  = "icv2_acc:";  // v2 네임스페이스
  const HOST_CLASS      = "ic-acc-host";

  // =========================
  // 공용 CSS 주입
  //  - FullCalendar 기본 absolute 배치가 아코디언 내부에서는 겹침을 만들 수 있어,
  //    프록시 카드가 블록 흐름으로 표시되도록 최소한의 레이아웃 리셋을 함께 주입
  // =========================
  function ensureAccordionStyles() {
    if (document.getElementById("ic-acc-style")) return;
    const st = document.createElement("style");
    st.id = "ic-acc-style";
    st.textContent = `
    a.fc-day-grid-event.ic-hidden-original { display: none !important; }
    .ic-acc-body a.fc-day-grid-event {
      position: static !important;
      display: block !important;
      width: auto !important;
      left: auto !important; right: auto !important; top: auto !important;
      margin: 2px 0 !important;
      white-space: normal !important;
    }
    .ic-acc-body .fc-content { white-space: normal !important; }
    .ic-acc-body .fc-time { display: none; }
    .ic-acc-body .fc-resizer { display: none !important; }
    `;
    document.head.appendChild(st);
  }
  ensureAccordionStyles();

  // =========================
  // 셀렉터 (FullCalendar Month Basic)
  //  - 버전 변경 시 수정 포인트
  // =========================
  const MONTH_VIEW_ROOT = ".fc-view.fc-month-view.fc-basic-view";
  const WEEK_ROW_SEL    = ".fc-row.fc-week.fc-widget-content";
  const BG_DAY_TD_SEL   = ".fc-bg table td[data-date]";          // 주(week) 내부의 날짜 7칸
  const SKEL_BODY_ROW   = ".fc-content-skeleton table tbody tr"; // 이벤트 카드가 들어가는 테이블 행들
  const TD_EVENT_CONT   = "td.fc-event-container";
  const EVENT_SEL       = "a.fc-day-grid-event.fc-h-event.fc-event";

  const isMonthView = () => document.querySelector(MONTH_VIEW_ROOT) != null;

  // =========================
  // 스코프(YYYY-MM) & 세션 키
  //  - 같은 달(YYYY-MM) 안에서 날짜+과목 단위로 열림/닫힘 상태를 구분 관리
  //  - 새로고침하면 기본 접힘
  // =========================
  function getMonthScope() {
    const m = (location.hash || "").match(/view_start=(\d{4}-\d{2}-\d{2})/);
    return (m ? m[1] : new Date().toISOString().slice(0, 10)).slice(0, 7);
  }
  const storageKey = (scope, dateStr, courseId) =>
    `${STORAGE_PREFIX}${scope}|${dateStr}|${courseId}`;

  // --- 새로고침 시 기본값은 "모두 접힘" ---
  (function clearAccordionStatesOnLoad() {
    try {
      const rm = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith(STORAGE_PREFIX)) rm.push(k);
      }
      rm.forEach(k => sessionStorage.removeItem(k));
    } catch (_) {}
  })();

  // 레거시 키 1회 정리 (예전 접두어 잔존 시 혼선 방지)
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
  // 추출/유틸: 과목 ID/이름/색
  //  - 아코디언 헤더 정보 및 버킷 분류에 활용
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
    return cs.borderLeftColor || cs.borderBottomColor || cs.borderColor || "";
  };

  // 아코디언 DOM(헤더/바디) 생성: 템플릿으로 일관성 유지
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

  // 헤더의 색 점(dot)을 아코디언 내부 첫 이벤트 카드의 색과 동기화
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
  // 프록시 카드: 원본은 제자리에 숨기고, 복제본을 아코디언 바디에 배치
  //  - 프록시 클릭 → 원본 클릭으로 포워딩(원본의 Canvas 핸들러/컨텍스트 유지)
  // =========================
  function triggerNativeClick(el) {
    const evt = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
    el.dispatchEvent(evt);
  }

  function makeProxyEventCard(originalA) {
    // 이미 proxied였더라도(표식 존재) 재빌드시 새 프록시 생성 → 레이스/참조 꼬임 방지
    const proxy = originalA.cloneNode(true);
    proxy.removeAttribute("id");
    proxy.dataset.icProxy = "1";

    proxy.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      triggerNativeClick(originalA);
    }, { passive: false });

    // 원본은 제거하지 않고 숨김 처리(원본의 내부 상태/핸들러 보존)
    originalA.classList.add("ic-hidden-original");
    originalA.dataset.icProxied = "1";

    return proxy;
  }

  // =========================
  // 주(week) 시그니처: "요일별 원본 이벤트 개수" 7칸 합성
  //  - 프록시/숨김 원본 제외(스크립트가 만든 변화로 재빌드 루프 방지)
  //  - 실제 데이터 변화에만 재빌드
  // =========================
  function weekSignature(weekEl) {
    const dateCells = Array.from(weekEl.querySelectorAll(BG_DAY_TD_SEL));
    if (dateCells.length !== 7) return "NA";

    const skelRows = Array.from(weekEl.querySelectorAll(SKEL_BODY_ROW));
    const colBuckets = Array.from({ length: 7 }, () => []);
    for (const tr of skelRows) {
      const tds = Array.from(tr.querySelectorAll(TD_EVENT_CONT));
      for (let col = 0; col < Math.min(7, tds.length); col++) colBuckets[col].push(tds[col]);
    }

    const counts = [];
    for (let col = 0; col < 7; col++) {
      let cnt = 0;
      for (const td of colBuckets[col]) {
        const anchors = td.querySelectorAll(
          `${EVENT_SEL}:not([data-ic-proxy="1"]):not(.ic-hidden-original)`
        );
        cnt += anchors.length;
      }
      counts.push(cnt);
    }
    return counts.join(",");
  }

  // =========================
  // Week 단위 처리 (시그니처 기반 재빌드)
  //  - 날짜별 원본 카드 수집 → 임계치 검사 → 과목별 버킷 → 아코디언 생성/삽입
  // =========================
  function processWeekRow(weekEl) {
    // 변화가 없으면 스킵(멱등/성능)
    const sigNow = weekSignature(weekEl);
    if (weekEl.dataset.icSig === sigNow) return;
    weekEl.dataset.icSig = sigNow;

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

      // 아코디언 내부/프록시 제외한 "원본" 카드만 수집
      const allCards = [];
      for (const td of eventTds) {
        const anchors = Array
          .from(td.querySelectorAll(EVENT_SEL))
          .filter(a => !a.closest(".ic-accordion") && a.dataset.icProxy !== "1");
        if (anchors.length) allCards.push(...anchors);
      }
      if (!allCards.length) continue;

      // 임계치 미달: 기본 UI 유지(일정이 적을 때는 오히려 평면 나열이 명확)
      if (allCards.length < DAILY_THRESHOLD) continue;

      // 과목별 버킷(같은 과목 끼리 묶어 탐색성 향상)
      const buckets = new Map();
      for (const a of allCards) {
        const cid   = extractCourseId(a) || "unknown";
        const name  = extractCourseName(a) || `Course ${cid}`;
        const color = extractColor(a);
        if (!buckets.has(cid)) buckets.set(cid, { name, color, nodes: [] });
        buckets.get(cid).nodes.push(a);
      }

      const firstTd = eventTds[0];

      // 기존 host 제거(중복 방지) 후 다시 생성/부착
      const prevHost = firstTd.querySelector(`.${HOST_CLASS}`);
      if (prevHost) prevHost.remove();

      for (const [cid, info] of buckets.entries()) {
        if (!info.nodes.length) continue;

        const key = storageKey(monthScope, dateStr, cid);
        const { wrap, header, body } =
          createAccordion(info.name, info.nodes.length, info.color, info.name);

        // 기본은 접힘(세션 키 없으면 닫힘). 세션 동안만 열림 상태 유지.
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

        // 프록시 삽입(원본은 숨기고, 프록시는 클릭 포워딩)
        info.nodes.forEach(n => {
          const proxy = makeProxyEventCard(n);
          body.appendChild(proxy);
        });

        // host 부착(날짜 칸의 첫 td 상단에 고정)
        let host = firstTd.querySelector(`.${HOST_CLASS}`);
        if (!host) {
          host = document.createElement("div");
          host.className = HOST_CLASS;
          firstTd.prepend(host);
        }
        host.appendChild(wrap);
      }
    }
  }

  // 월간 뷰일 때만 전체 주에 적용
  function applyMonthAccordion() {
    if (!isMonthView()) return;
    document.querySelectorAll(WEEK_ROW_SEL).forEach(processWeekRow);
    refreshHeaderColors(document);
  }

  // =========================
  // "접힌 항목 펼치기"
  //  - 세션 기록 없이 일시적으로 모두 펼침(새로고침 시 다시 접힘)
  // =========================
  function expandAllNoPersist() {
    document.querySelectorAll(".ic-accordion").forEach(acc => {
      const h = acc.querySelector(".ic-acc-header");
      const b = acc.querySelector(".ic-acc-body");
      if (!h || !b) return;
      b.style.display = "block";
      h.classList.add("is-open");
    });
  }

  // =========================
  // 스케줄링 & 옵저버
  //  - DOM 변화가 몰릴 때 scheduleApply로 1회 처리
  //  - MutationObserver/hashchange로 월 이동·비동기 로딩 대응
  // =========================
  let ticking = false;
  function scheduleApply(after) {
    if (ticking) return;
    ticking = true;
    const run = () => {
      try { applyMonthAccordion(); } finally {
        ticking = false;
        if (after) after();
      }
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
  window.addEventListener("hashchange", () => setTimeout(() => scheduleApply(), 0));

  // ============== 우하단 단일 버튼: "접힌 항목 펼치기" ==============
  (function ensureExpandToolbar() {
    if (document.getElementById("ic-acc-expand-toolbar")) return;
    const btn = document.createElement("button");
    btn.id = "ic-acc-expand-toolbar";
    btn.type = "button";
    btn.textContent = "접힌 항목 펼치기";
    btn.style.position = "fixed";
    btn.style.right = "16px";
    btn.style.bottom = "16px";
    btn.style.zIndex = "9999";
    btn.style.padding = "8px 12px";
    btn.style.border = "1px solid #cbd5e1";
    btn.style.borderRadius = "999px";
    btn.style.background = "#fff";
    btn.style.fontSize = "12px";
    btn.style.cursor = "pointer";
    btn.addEventListener("click", () => {
      // 최신 빌드 상태 보장 후 전체 펼침
      scheduleApply(() => expandAllNoPersist());
    });
    document.body.appendChild(btn);
  })();
})();
