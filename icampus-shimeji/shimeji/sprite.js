// ==== shimeji/sprite.js ====
console.log('[Shimeji] sprite loaded');

window.Shimeji = window.Shimeji || {};

class Sprite {
  constructor(conf, motion) {
    this.conf = conf;
    this.motion = motion;
    this.state = 'walk'; // 'walk' | 'sit'

    this.root = document.createElement('div');
    this.root.className = 'shimeji-sprite';
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

    this.updateFrame(0);
    this.attachEvents();
  }

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
    if (this.state === 'walk'|| this.state === 'jump') 
    {
        this.accum += dt;
        const spf = 1 / this.conf.fps;
        while (this.accum >= spf) 
        {
            this.accum -= spf;

            if(this.state === 'walk')
            {
                this.frame = (this.frame + 1) % this.conf.frames;
                const col = this.frame % this.conf.cols;
                const row = Math.floor(this.frame / this.conf.cols);
                const bx = -col * this.conf.frameW;
                const by = -row * this.conf.frameH;
                this.root.style.backgroundPosition = `${bx}px ${by}px`;
            }
            else if(this.state === 'jump')
            {
                this.frame = (this.frame + 1) % this.conf.jframes;
                const col = this.frame % this.conf.jcols;
                const row = Math.floor(this.frame / this.conf.jcols);
                const bx = -col * this.conf.jframeW;
                const by = -row * this.conf.jframeH;
                this.root.style.backgroundPosition = `${bx}px ${by}px`;
            }
      }
    } 
    else if (this.state === 'sit') 
    {
      // sit: 5x5 기준 (0,4) 프레임 예시
      const bx = 0;
      const by = -4 * this.conf.frameH;
      this.root.style.backgroundPosition = `${bx}px ${by}px`;
    }
  }

  applyTransform() {
    this.root.style.left = `${this.x}px`;
    this.root.style.top  = `${this.y}px`;
    this.root.style.transform = `scaleX(${this.flip})`;
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
    const ground = Shimeji.groundAt(xMid, footY);

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

  destroy() { this.root.remove(); }
}

// 외부 노출
Shimeji.Sprite = Sprite;
