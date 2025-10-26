// ==== shimeji/boot.js ====
console.log('[Shimeji] boot loaded on', location.href);

window.Shimeji = window.Shimeji || {};
const { conf } = Shimeji;

Shimeji.sprites = [];

Shimeji.spawn = function() {
  const s = new Shimeji.Sprite(conf.sprite, conf.motion);
  Shimeji.sprites.push(s);
  return s;
};

Shimeji.clear = function() {
  while (Shimeji.sprites.length) Shimeji.sprites.pop().destroy();
};

(function loop() {
  let last = performance.now();
  function frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const s of Shimeji.sprites) s.step(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

// 초기 실행 (중복 방지)
if (!window.__shimejiBooted__) {
  window.__shimejiBooted__ = true;
  Shimeji.spawn();
  if (Shimeji.initColorUI) Shimeji.initColorUI();
}

// ==== boot.js ==== (기존 부트 하단 어느 곳이나 OK)
function set_jump(s) 
{
    s.state = 'jump';
    s.root.style.backgroundImage = `url(${s.conf.bgurl})`;
    
    s.root.style.width  = `${s.conf.jframeW}px`;
    s.root.style.height = `${s.conf.jframeH}px`;
    s.root.style.backgroundSize = `${s.conf.jframeW*s.conf.jcols}px ${s.conf.jframeH*s.conf.jrows}px`;

    s.frame = 0;
    s.accum = 0;
    s.updateFrame(1/s.conf.fps);
}

function set_walk(s) 
{
    s.state = 'walk';
    s.root.style.backgroundImage = `url(${s.conf.url})`;
    
    s.root.style.width  = `${s.conf.frameW}px`;
    s.root.style.height = `${s.conf.frameH}px`;
    s.root.style.backgroundSize = `${s.conf.frameW*s.conf.cols}px ${s.conf.frameH*s.conf.rows}px`;

    s.frame = 0;
    s.accum = 0;
    s.updateFrame(1/s.conf.fps);
}

// 새로고침 직후에 실행해야 할 액션이 있으면 꺼내서 실행
(function resumeAfterSubmission(){
    // window.Shimeji.sprites.forEach(s => set_jump(s));
    // setTimeout(() => window.Shimeji.sprites.forEach(s => set_walk(s)), 4000);
    const raw = sessionStorage.getItem('__shimeji_afterSubmission');
    console.log(raw);
    if (!raw) return;
    console.log("aaa");

    // 너무 오래된 플래그는 무시 (예: 10초 이상)
    try {
        const data = JSON.parse(raw);
        if (Date.now() - (data.t || 0) < 10_000) {
        // 원하는 액션 실행
        if (window.Shimeji?.sprites?.length) {
            window.Shimeji.sprites.forEach(s => set_jump(s));
            setTimeout(() => window.Shimeji.sprites.forEach(s => set_walk(s)), 4000);
        } else {
            // 부트 타이밍 대비
            setTimeout(() => {
            if (window.Shimeji?.sprites?.length) {
                window.Shimeji.sprites.forEach(s => set_jump(s));
                setTimeout(() => window.Shimeji.sprites.forEach(s => set_walk(s)), 4000);
            }
            }, 300);
        }
        }
    } catch {}
    // 한 번 사용 후 제거
    sessionStorage.removeItem('__shimeji_afterSubmission');
})();


// 디버그/외부 제어용
window.__spawnShimeji = () => Shimeji.spawn();
window.__clearShimeji = () => Shimeji.clear();
