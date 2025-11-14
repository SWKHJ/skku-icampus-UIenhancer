// ==== cat-mascot/sprite.js ====
console.log('[catMascot] sprite loaded');

window.catMascot = window.catMascot || {};

// config 에서 악세서리 정의 가져오기 (없으면 빈 객체)
const ACCESSORY_CONF =
  (window.catMascot.conf && window.catMascot.conf.accessories) || {};

// 슬롯 목록 (neck, head 확장 가능)
const ACCESSORY_SLOTS = ['neck', 'head'];

class Sprite {
  constructor(conf, motion) {
    this.conf = conf;
    this.motion = motion;
    this.state = 'walk'; // 'walk' | 'sit' | 'jump'

    this.root = document.createElement('div');
    this.root.className = 'catMascot-sprite';
    Object.assign(this.root.style, {
      position: 'fixed',
      width: `${conf.frameW}px`,
      height: `${conf.frameH}px`,
      backgroundImage: `url(${conf.url})`,
      backgroundRepeat: 'no-repeat',
      backgroundSize: `${conf.frameW * conf.cols}px ${conf.frameH * conf.rows}px`,
      imageRendering: 'auto',
      zIndex: 2147483647,
      pointerEvents: 'auto',
      userSelect: 'none',
      touchAction: 'none',
      willChange: 'transform, left, top, background-position'
    });
    document.body.appendChild(this.root);

    // ----- 악세서리 레이어 -----
    this.accLayer = document.createElement('div');
    Object.assign(this.accLayer.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      overflow: 'visible'
    });
    this.root.appendChild(this.accLayer);

    // 슬롯별 dom/정의 저장: this.accessories[slot] = { el, def }
    this.accessories = {};

    // 초기 상태
    this.x = Math.max(20, Math.min(innerWidth - conf.frameW - 20, 200));
    this.y = Math.max(20, Math.min(innerHeight - conf.frameH - 20, 120));
    this.vx = (Math.random() * 200) - 100;
    this.vy = 0;
    this.dir = this.vx >= 0 ? 1 : -1;
    this.flip = this.dir;

    // 애니메이션
    this.frame = 0;
    this.accum = 0;

    // 입력 상태
    this.pointerActive = false;
    this.dragging = false;
    this.clickStart = null;
    this.throwVX = 0;
    this.throwVY = 0;
    this.DRAG_THRESH_PX = 6;
    this.CLICK_TIME_MS = 250;

    // 현재 전역 장착 상태 기반으로 악세서리 구성
    this.refreshAccessories();

    this.updateFrame(0);
    this.attachEvents();
  }

  // ---- 악세서리 관련 유틸 ----

  // 현재 상태에 맞는 frameW/frameH 반환
  getCurrentFrameSize() {
    if (this.state === 'jump' && this.conf.jframeW && this.conf.jframeH) {
      return { w: this.conf.jframeW, h: this.conf.jframeH };
    }
    return { w: this.conf.frameW, h: this.conf.frameH };
  }

  // sprite 외부에서 catMascot.activeAccessories 를 갱신해두면,
  // 이 메서드를 호출해서 슬롯들을 다시 구성할 수 있다.
  refreshAccessories() {
    const active = (window.catMascot && window.catMascot.activeAccessories) || {};

    // 기존 DOM 제거
    Object.values(this.accessories).forEach(({ el }) => el.remove());
    this.accessories = {};

    for (const slot of ACCESSORY_SLOTS) {
      const id = active[slot];
      if (!id) continue;
      const def = ACCESSORY_CONF[id];
      if (!def) continue;

      const img = document.createElement('img');
      img.src = def.img;
      img.alt = def.id;
      Object.assign(img.style, {
        position: 'absolute',
        pointerEvents: 'none'
      });

      // 크기는 정의된 width/height 있으면 사용, 아니면 기본값
      const w = def.width || 60;
      const h = def.height || 60;
      img.style.width = `${w}px`;
      img.style.height = `${h}px`;

      this.accLayer.appendChild(img);
      this.accessories[slot] = { el: img, def };
    }

    // 구성 후 한 번 위치 갱신
    this.updateAccessoryLayout();
  }

  // 현재 state / flip 에 맞게 악세서리 위치 갱신
  updateAccessoryLayout() {
    if (!this.accessories) return;

    const stateKey =
      this.state === 'sit' ? 'sit' :
      this.state === 'jump' ? 'jump' :
      'walk';

    const { w: frameW, h: frameH } = this.getCurrentFrameSize();

    for (const slot of Object.keys(this.accessories)) {
      const { el, def } = this.accessories[slot];
      if (!el || !def) continue;

      const anchorAll = def.anchor || {};
      const stateAnchor = anchorAll[stateKey] || anchorAll.walk;
      if (!stateAnchor) continue;

      // flip 방향에 따라 left / right 중 하나 선택
      const dirKey = this.flip < 0 ? 'left' : 'right';
      const anchorDir =
        stateAnchor[dirKey] ||
        stateAnchor.center ||     // 혹시 center 같은 걸 쓸 수도 있으니 폴백
        stateAnchor.left ||
        stateAnchor.right;

      if (!anchorDir) continue;

      const accW = def.width || el.offsetWidth || 40;
      const accH = def.height || el.offsetHeight || 40;

      // 정규화 anchor 를 실제 픽셀로 변환
      const baseX = anchorDir.x * frameW;
      const baseY = anchorDir.y * frameH;

      // 중앙 정렬
      const left = baseX - accW / 2;
      const top  = baseY - accH / 2;

      el.style.left = `${left}px`;
      el.style.top  = `${top}px`;
    }
  }

  // ---- 기존 로직 ----

  toggleSit() { this.state = (this.state === 'sit' ? 'walk' : 'sit'); }

  attachEvents() {
    const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

    this.root.addEventListener('pointerdown', e => {
      this.pointerActive = true;
      this.dragging = false;
      this.root.setPointerCapture?.(e.pointerId);
      this.clickStart = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.vx = 0; this.vy = 0;
    });

    this.root.addEventListener('pointermove', e => {
      if (!this.pointerActive) return;
      const dx = e.clientX - this.clickStart.x;
      const dy = e.clientY - this.clickStart.y;
      if (!this.dragging && Math.hypot(dx, dy) > this.DRAG_THRESH_PX) this.dragging = true;
      if (this.dragging) {
        const now = performance.now();
        const dt  = Math.max(1, now - this.clickStart.t) / 1000.0;
        this.x += dx; this.y += dy;
        this.throwVX = dx / dt; this.throwVY = dy / dt;
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
    this.root.addEventListener('pointerup', end);
    this.root.addEventListener('pointercancel', end);

    addEventListener('resize', () => {
      this.x = Math.max(0, Math.min(innerWidth - this.conf.frameW, this.x));
      this.y = Math.max(0, Math.min(innerHeight - (this.state==='jump'?this.conf.jframeH:this.conf.frameH), this.y));
      this.applyTransform();
    });
  }

  updateFrame(dt) {
    if (this.state === 'walk'|| this.state === 'jump') {
      this.accum += dt;
      const spf = 1 / this.conf.fps;
      while (this.accum >= spf) {
        this.accum -= spf;

        if(this.state === 'walk') {
          this.frame = (this.frame + 1) % this.conf.frames;
          const col = this.frame % this.conf.cols;
          const row = Math.floor(this.frame / this.conf.cols);
          const bx = -col * this.conf.frameW;
          const by = -row * this.conf.frameH;
          this.root.style.backgroundPosition = `${bx}px ${by}px`;
        }
        else if(this.state === 'jump') {
          this.frame = (this.frame + 1) % this.conf.jframes;
          const col = this.frame % this.conf.jcols;
          const row = Math.floor(this.frame / this.conf.jcols);
          const bx = -col * this.conf.jframeW;
          const by = -row * this.conf.jframeH;
          this.root.style.backgroundPosition = `${bx}px ${by}px`;
        }
      }
    }
    else if (this.state === 'sit') {
      const bx = 0;
      const by = -4 * this.conf.frameH;
      this.root.style.backgroundPosition = `${bx}px ${by}px`;
    }

    // 프레임/상태 변경 후 악세서리 위치도 한 번 갱신
    this.updateAccessoryLayout();
  }

  applyTransform() {
    this.root.style.left = `${this.x}px`;
    this.root.style.top  = `${this.y}px`;
    this.root.style.transform = `scaleX(${this.flip})`;

    // 좌우 flip / 위치 변경 후에도 레이아웃 업데이트
    this.updateAccessoryLayout();
  }

  step(dt) {
    if (this.dragging) { this.updateFrame(dt); return; }

    // 중력/공기저항
    this.vy += this.motion.gravity * dt;
    this.vx *= this.motion.airDrag;

    // 이동
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // 좌우 벽
    const maxX = innerWidth - this.conf.frameW;
    if (this.x < 0) { this.x = 0; this.vx = Math.abs(this.vx); this.dir = 1; }
    else if (this.x > maxX) { this.x = maxX; this.vx = -Math.abs(this.vx); this.dir = -1; }

    // 요소 기반 바닥
    const xMid  = this.x + this.conf.frameW / 2;
    const footY = this.y + (this.state==='jump'?this.conf.jframeH:this.conf.frameH);
    const ground = catMascot.groundAt(xMid, footY);

    const worldFloor = ground ? ground.y : innerHeight;
    const maxY = worldFloor - (this.state==='jump'?this.conf.jframeH:this.conf.frameH);

    // 천장/바닥
    if (this.y < 0) { this.y = 0; this.vy = 0; }
    else if (this.y > maxY) {
      this.y = maxY;
      if (Math.abs(this.vy) > 200) {
        this.vy = -this.vy * this.motion.groundBounce;
      } else {
        this.vy = 0;
        this.vx *= this.motion.friction;

        if (this.state === 'walk') {
          const target = this.dir * this.motion.idleSpeed;
          this.vx += (target - this.vx) * this.motion.idleAccel * dt;
        } else {
          const target = 0;
          this.vx += (target - this.vx) * (this.motion.idleAccel * 1.5) * dt;
        }
      }
    }

    // 선택된 ground가 있으면 해당 가로폭 안으로 가두기(선택)
    if (ground) {
      const minX = ground.rect.left - this.conf.frameW / 2;
      const maxX2 = ground.rect.right - this.conf.frameW / 2;
      if (this.x < minX) { this.x = minX; this.vx = Math.abs(this.vx); this.dir = 1; }
      else if (this.x > maxX2) { this.x = maxX2; this.vx = -Math.abs(this.vx); this.dir = -1; }
    }

    // flip
    const sx = Math.abs(this.vx) > 5 ? (this.vx >= 0 ? 1 : -1) : (this.dir >= 0 ? 1 : -1);
    this.flip = sx;

    this.applyTransform();
    this.updateFrame(dt);
  }

  destroy() {
    if (this.accLayer) this.accLayer.remove();
    this.root.remove();
  }
}

// 외부 노출
catMascot.Sprite = Sprite;

// 전역에서 장착 상태 바뀔 때 호출해 쓰라고 helper 하나 추가
catMascot.refreshAccessoriesAll = function() {
  if (!catMascot.sprites) return;
  catMascot.sprites.forEach(s => s.refreshAccessories && s.refreshAccessories());
};
