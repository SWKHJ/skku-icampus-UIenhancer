// ==== shimeji/config.js ====
console.log('[Shimeji] config loaded');

window.Shimeji = window.Shimeji || {};

const scale = 0.5;
Shimeji.conf = {
  scale,
  sprite: {
    url: chrome.runtime.getURL("assets/walk-Sheet.png"),
    bgurl: chrome.runtime.getURL("assets/jump.png"),
    frameW: 357 * scale,
    frameH: 271 * scale,
    cols: 5,
    rows: 5,
    frames: 18,
    jframeW: 275 * scale,
    jframeH: 372 * scale,
    jcols: 4,
    jrows: 4,
    jframes: 13,
    fps: 10
  },
  motion: {
    gravity: 900,
    groundBounce: 0.2,
    friction: 0.85,
    airDrag: 0.995,
    idleSpeed: 80,
    idleAccel: 10
  }
};
