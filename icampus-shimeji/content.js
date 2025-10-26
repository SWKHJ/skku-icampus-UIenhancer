// ===== Sprite Walker - content.js (recursive ground detection) =====

console.log('[Shimeji] content loaded on', location.href);

// --- 표시 스케일 ---
const scale = 0.5;

// --- 스프라이트시트 설정 ---
const SPRITE_CONF = {
  url: chrome.runtime.getURL("assets/walk-Sheet.png"),
  frameW: 357 * scale,
  frameH: 271 * scale,
  cols: 5,
  rows: 5,
  frames: 18,
  fps: 10
};

// --- 바닥 후보 셀렉터 ---
const GROUND_SELECTORS = [
  'input[type="search"]',
  'form[role="search"] input',
  'input[name="q"]',
  '[role="search"] input',
  'input:not([type="hidden"])',
  'textarea',
  'button',
  'a',
  'video',
  'img',
  'canvas',
  '[data-shimeji-ground]',
  '.shimeji-ground',
  '#video-player-area',
  '.Grouping-styles__items'
  
];

let __shimejiGrounds = [];

// === 유틸 ===
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand  = (a, b) => a + Math.random() * (b - a);
function __isVisibleRect(r) {
  return r.width > 20 && r.height > 8 &&
         r.bottom > 0 && r.top < window.innerHeight &&
         r.right > 0 && r.left < window.innerWidth;
}
function __isActuallyVisible(el) {
  const st = getComputedStyle(el);
  if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
  const r = el.getBoundingClientRect();
  return __isVisibleRect(r);
}

// === 재귀 ground 스캐너 ===
function __collectFromRoot(root) {
  const arr = [];
  for (const sel of GROUND_SELECTORS) {
    root.querySelectorAll(sel).forEach(el => arr.push(el));
  }
  return arr;
}
function __walkShadow(root, out) {
  out.push(...__collectFromRoot(root));
  const all = root.querySelectorAll('*');
  all.forEach(el => {
    if (el.shadowRoot) __walkShadow(el.shadowRoot, out);
  });
}
function __walkIframes(doc, out) {
  doc.querySelectorAll('iframe').forEach(iframe => {
    try {
      const idoc = iframe.contentDocument;
      if (idoc) {
        __walkShadow(idoc, out);
        __walkIframes(idoc, out);
      }
    } catch (e) {
      // 접근 불가 iframe은 무시
    }
  });
}
function __rebuildGrounds() {
  const found = [];
  __walkShadow(document, found);
  __walkIframes(document, found);
  const uniq = [];
  const seen = new Set();
  for (const el of found) {
    if (!el || seen.has(el)) continue;
    seen.add(el);
    if (__isActuallyVisible(el)) uniq.push(el);
  }
  __shimejiGrounds = uniq;

  console.groupCollapsed(`[Shimeji] Found ${uniq.length} ground elements`);
  uniq.forEach((el, i) => {
    console.log(`#${i}`, el, el.getBoundingClientRect());
  });
  console.groupEnd();
}
let __rebuildTimer = null;
function __scheduleRebuild() {
  if (__rebuildTimer) cancelAnimationFrame(__rebuildTimer);
  __rebuildTimer = requestAnimationFrame(__rebuildGrounds);
}
__rebuildGrounds();
window.addEventListener('resize', __scheduleRebuild);
const __mo = new MutationObserver(__scheduleRebuild);
__mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true });

// === 바닥 y 찾기 ===
function __groundYAt(xMid, footY) {
  let bestY = null;
  for (const el of __shimejiGrounds) {
    const r = el.getBoundingClientRect();
    if (!__isVisibleRect(r)) continue;
    const withinX = xMid >= r.left && xMid <= r.right;
    const belowFeet = r.top >= footY - 4;
    if (withinX && belowFeet) {
      if (bestY === null || r.top < bestY) bestY = r.top;
    }
  }
  return bestY;
}

// === Sprite 클래스 ===
class Sprite {
  constructor(conf) {
    this.conf = conf;
    this.root = document.createElement("div");
    this.root.className = "shimeji-sprite";
    this.state = 'walk';

    Object.assign(this.root.style, {
      position: "fixed",
      width: `${conf.frameW}px`,
      height: `${conf.frameH}px`,
      backgroundImage: `url(${conf.url})`,
      backgroundRepeat: "no-repeat",
      backgroundSize: `${conf.frameW * conf.cols}px ${conf.frameH * conf.rows}px`,
      imageRendering: "auto",
      zIndex: 2147483647,
      pointerEvents: "auto",
      userSelect: "none",
      touchAction: "none",
      willChange: "transform, left, top, background-position"
    });
    document.body.appendChild(this.root);

    // 위치, 속도
    this.x = rand(20, window.innerWidth - conf.frameW - 20);
    this.y = rand(20, window.innerHeight - conf.frameH - 20);
    this.vx = rand(-100, 100);
    this.vy = 0;

    // 물리
    this.gravity = 900;
    this.groundBounce = 0.2;
    this.friction = 0.85;
    this.airDrag = 0.995;

    // 이동 관련
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.idleSpeed = 80;
    this.idleAccel = 10;

    // 애니메이션
    this.frame = 0;
    this.accum = 0;
    this.flip = this.dir;

    // 제스처 상태
    this.pointerActive = false;
    this.dragging = false;
    this.clickStart = null;
    this.throwVX = 0;
    this.throwVY = 0;
    this.DRAG_THRESH_PX = 6;
    this.CLICK_TIME_MS = 250;

    this.updateFrame(0);
    this.attachEvents();
  }

  toggleSit() { this.state = (this.state === 'sit' ? 'walk' : 'sit'); }

  attachEvents() {
    this.root.addEventListener("pointerdown", (e) => {
      this.pointerActive = true;
      this.dragging = false;
      this.root.setPointerCapture?.(e.pointerId);
      this.clickStart = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.vx = 0; this.vy = 0;
    });

    this.root.addEventListener("pointermove", (e) => {
      if (!this.pointerActive) return;
      const dx = e.clientX - this.clickStart.x;
      const dy = e.clientY - this.clickStart.y;
      if (!this.dragging && Math.hypot(dx, dy) > this.DRAG_THRESH_PX) this.dragging = true;
      if (this.dragging) {
        const now = performance.now();
        const dt = Math.max(1, now - this.clickStart.t) / 1000.0;
        this.x += dx; this.y += dy;
        this.throwVX = dx / dt;
        this.throwVY = dy / dt;
        this.clickStart = { x: e.clientX, y: e.clientY, t: now };
        this.applyTransform();
      }
    });

    const end = () => {
      if (!this.pointerActive) return;
      const now = performance.now();
      const dt = now - this.clickStart.t;
      if (this.dragging) {
        this.vx = clamp(this.throwVX, -800, 800);
        this.vy = clamp(this.throwVY, -800, 800);
        this.throwVX = 0; this.throwVY = 0;
      } else {
        if (dt <= this.CLICK_TIME_MS) this.toggleSit();
      }
      this.pointerActive = false;
      this.dragging = false;
    };
    this.root.addEventListener("pointerup", end);
    this.root.addEventListener("pointercancel", end);

    window.addEventListener("resize", () => {
      this.x = clamp(this.x, 0, window.innerWidth - this.conf.frameW);
      this.y = clamp(this.y, 0, window.innerHeight - this.conf.frameH);
      this.applyTransform();
    });
  }

  updateFrame(dt) {
    if (this.state === 'walk') {
      this.accum += dt;
      const spf = 1 / this.conf.fps;
      while (this.accum >= spf) {
        this.accum -= spf;
        this.frame = (this.frame + 1) % this.conf.frames;
        const col = this.frame % this.conf.cols;
        const row = Math.floor(this.frame / this.conf.cols);
        const bx = -col * this.conf.frameW;
        const by = -row * this.conf.frameH;
        this.root.style.backgroundPosition = `${bx}px ${by}px`;
      }
    } else {
      const bx = -0 * this.conf.frameW;
      const by = -4 * this.conf.frameH;
      this.root.style.backgroundPosition = `${bx}px ${by}px`;
    }
  }

  applyTransform() {
    this.root.style.left = `${this.x}px`;
    this.root.style.top = `${this.y}px`;
    this.root.style.transform = `scaleX(${this.flip})`;
  }

  step(dt) {
    if (this.dragging) { this.updateFrame(dt); return; }

    // 중력/공기저항
    this.vy += this.gravity * dt;
    this.vx *= this.airDrag;

    // 이동
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // 좌우 벽
    const maxX = window.innerWidth - this.conf.frameW;
    if (this.x < 0) { this.x = 0; this.vx = Math.abs(this.vx); this.dir = 1; }
    else if (this.x > maxX) { this.x = maxX; this.vx = -Math.abs(this.vx); this.dir = -1; }

    // 요소 기반 바닥 계산
    const xMid = this.x + this.conf.frameW / 2;
    const footY = this.y + this.conf.frameH;
    const gy = __groundYAt(xMid, footY);
    const worldFloor = (gy != null ? gy : window.innerHeight);
    const maxY = worldFloor - this.conf.frameH;

    // 천장/바닥 충돌
    if (this.y < 0) { this.y = 0; this.vy = 0; }
    else if (this.y > maxY) {
      this.y = maxY;
      if (Math.abs(this.vy) > 200) this.vy = -this.vy * this.groundBounce;
      else {
        this.vy = 0;
        this.vx *= this.friction;
        if (this.state === 'walk') {
          const target = this.dir * this.idleSpeed;
          this.vx += (target - this.vx) * this.idleAccel * dt;
        } else if (this.state === 'sit') {
          const target = 0;
          this.vx += (target - this.vx) * (this.idleAccel * 1.5) * dt;
        }
      }
    }

    const sx = Math.abs(this.vx) > 5 ? (this.vx >= 0 ? 1 : -1) : (this.dir >= 0 ? 1 : -1);
    this.flip = sx;

    this.applyTransform();
    this.updateFrame(dt);
  }

  destroy() { this.root.remove(); }
}

// === 메인 루프 ===
const sprites = [];
function spawn() { const s = new Sprite(SPRITE_CONF); sprites.push(s); return s; }

function loop() {
  let last = performance.now();
  function frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const s of sprites) s.step(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if (!window.__shimejiSpriteBooted__) {
  window.__shimejiSpriteBooted__ = true;
  spawn();
  loop();
}

window.__spawnShimeji = () => spawn();
window.__clearShimeji = () => { while (sprites.length) sprites.pop().destroy(); };
