// ==== cat-mascot/boot.js ====
console.log('[catMascot] boot loaded on', location.href);

window.catMascot = window.catMascot || {};
const { conf } = catMascot;

// 설정 키 (popup/settings, script_watch 와 동일)
const PREF_KEY = 'shimeji_prefs_v1';

// 여러 마리 관리
catMascot.sprites = catMascot.sprites || [];

// 한 마리 생성
catMascot.spawn = function () {
  const s = new catMascot.Sprite(conf.sprite, conf.motion);
  catMascot.sprites.push(s);
  return s;
};

// 전부 제거
catMascot.clear = function () {
  while (catMascot.sprites.length) {
    const s = catMascot.sprites.pop();
    if (s && typeof s.destroy === 'function') s.destroy();
  }
};

// 메인 루프 (sprites 배열이 비어 있으면 거의 일 안 함)
(function loop() {
  let last = performance.now();
  function frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const s of catMascot.sprites) s.step(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

// ===== 헬퍼: 외부에서 쓸 수 있는 on/off 래퍼 =====
function ensureSpawn() {
  if (!catMascot.sprites.length) {
    catMascot.spawn();
  }
}

function ensureCleared() {
  if (catMascot.sprites.length) {
    catMascot.clear();
  }
}

// 설정을 읽어서 최초 표시 상태를 결정
function applyInitialVisibility() {
  // chrome API가 없는 환경이면 그냥 ON 으로 동작
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    ensureSpawn();
    try {
      window.postMessage({ __from: 'CampusCatMate', type: 'SHIMEJI_READY' }, '*');
    } catch {}
    return;
  }

  try {
    chrome.storage.local.get(PREF_KEY, (data) => {
      const prefs = data?.[PREF_KEY] || { enabled: true };
      const enabled = prefs.enabled !== false;

      if (enabled) {
        ensureSpawn();
      } else {
        ensureCleared();
      }

      // 설정 적용 끝났다는 신호 (script_watch 가 듣고 다시 한 번 동기화 가능)
      try {
        window.postMessage({ __from: 'CampusCatMate', type: 'SHIMEJI_READY' }, '*');
      } catch {}
    });
  } catch {
    // storage 에러 시에는 그냥 기본값 ON
    ensureSpawn();
    try {
      window.postMessage({ __from: 'CampusCatMate', type: 'SHIMEJI_READY' }, '*');
    } catch {}
  }
}

// ===== 초기 실행 (중복 방지) =====
if (!window.__catMascotBooted__) {
  window.__catMascotBooted__ = true;

  // ❗ 기존: 무조건 ensureSpawn()
  // → 변경: prefs 를 보고 spawn/clear 결정
  applyInitialVisibility();

  if (catMascot.initColorUI) catMascot.initColorUI();
}

// ===== popup → background → content script → page 로 전달되는 토글 메시지 처리 =====
// content script 에서 예를 들면:
// window.postMessage({ __from: 'CampusCatMate', type: 'SHIMEJI_TOGGLE', enabled: true }, '*');
window.addEventListener('message', (ev) => {
  const msg = ev.data;
  if (!msg || msg.__from !== 'CampusCatMate') return;

  if (msg.type === 'SHIMEJI_TOGGLE') {
    if (msg.enabled) {
      ensureSpawn();
    } else {
      ensureCleared();
    }
  }
});

// ===== 기존 jump / walk / 제출 후 리줌 로직 =====

function set_jump(s) {
  s.state = 'jump';
  s.root.style.backgroundImage = `url(${s.conf.bgurl})`;

  s.root.style.width  = `${s.conf.jframeW}px`;
  s.root.style.height = `${s.conf.jframeH}px`;
  s.root.style.backgroundSize =
    `${s.conf.jframeW * s.conf.jcols}px ${s.conf.jframeH * s.conf.jrows}px`;

  s.frame = 0;
  s.accum = 0;
  s.updateFrame(1 / s.conf.fps);
}

function set_walk(s) {
  s.state = 'walk';
  s.root.style.backgroundImage = `url(${s.conf.url})`;

  s.root.style.width  = `${s.conf.frameW}px`;
  s.root.style.height = `${s.conf.frameH}px`;
  s.root.style.backgroundSize =
    `${s.conf.frameW * s.conf.cols}px ${s.conf.frameH * s.conf.rows}px`;

  s.frame = 0;
  s.accum = 0;
  s.updateFrame(1 / s.conf.fps);
}

// 새로고침 직후에 실행해야 할 액션이 있으면 꺼내서 실행
(function resumeAfterSubmission() {
  const raw = sessionStorage.getItem('__catMascot_afterSubmission');
  console.log(raw);
  if (!raw) return;
  console.log('aaa');

  // 너무 오래된 플래그는 무시 (예: 10초 이상)
  try {
    const data = JSON.parse(raw);
    if (Date.now() - (data.t || 0) < 10_000) {
      const runEffect = () => {
        if (window.catMascot?.sprites?.length) {
          window.catMascot.sprites.forEach((s) => set_jump(s));
          setTimeout(
            () => window.catMascot.sprites.forEach((s) => set_walk(s)),
            4000
          );
        }
      };

      if (window.catMascot?.sprites?.length) {
        runEffect();
      } else {
        // 부트 타이밍 대비
        setTimeout(runEffect, 300);
      }
    }
  } catch {}
  // 한 번 사용 후 제거
  sessionStorage.removeItem('__catMascot_afterSubmission');
})();

// 디버그/외부 제어용
window.__spawncatMascot = () => { ensureSpawn(); };
window.__clearcatMascot = () => { ensureCleared(); };
