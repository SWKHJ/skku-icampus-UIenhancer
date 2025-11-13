// ==== shimeji/config.js ====
console.log('[Shimeji] config loaded');

window.Shimeji = window.Shimeji || {};

const scale = 0.5;

Shimeji.conf = {
  scale,

  // ----- 기본 스프라이트 시트 설정 -----
  sprite: {
    url:   chrome.runtime.getURL("assets/walk-Sheet.png"),
    bgurl: chrome.runtime.getURL("assets/jump.png"),

    frameW: 357 * scale,
    frameH: 271 * scale,
    cols:   5,
    rows:   5,
    frames: 18,

    jframeW: 275 * scale,
    jframeH: 372 * scale,
    jcols:   4,
    jrows:   4,
    jframes: 13,

    fps: 10
  },

  // ----- 물리 파라미터 -----
  motion: {
    gravity:      900,
    groundBounce: 0.2,
    friction:     0.85,
    airDrag:      0.995,
    idleSpeed:    80,
    idleAccel:    10
  },

  // ----- 악세서리 정의 -----
  //
  // anchor 값은 "정규화 좌표":
  //   x, y ∈ [0,1]  (0=왼쪽/위, 1=오른쪽/아래)
  //   실제 픽셀 = anchor.x * frameW, anchor.y * frameH
  //
  // state 키:
  //   - walk : 기본 걷기
  //   - sit  : 앉기
  //   - jump : 점프
  accessories: {
    ribbon_red: {
      id:   'ribbon_red',
      slot: 'neck',
      img:  chrome.runtime.getURL('assets/accessories/acc_ribbon_red.png'),

      width:  80 * scale,
      height: 56 * scale,

      anchor: {
        walk: {
          left:  { x: 0.73, y: 0.70 },
          right: { x: 0.73, y: 0.70 }
        },
        sit: {
          left:  { x: 0.55, y: 0.72 },
          right: { x: 0.55, y: 0.72 }
        },
        jump: {
          left:  { x: 0.48, y: 0.70 },
          right: { x: 0.52, y: 0.70 }
        }
      }
    },

    hat_blue: {
      id:   'hat_blue',   // 상점/스토리지에서 쓰는 id 와 일치
      slot: 'head',
      img:  chrome.runtime.getURL('assets/accessories/acc_hat_blue.png'),

      width:  90 * scale,
      height: 60 * scale,

      anchor: {
        walk: {
          left:  { x: 0.71, y: 0.18 },
          right: { x: 0.71, y: 0.18 }
        },
        sit: {
          left:  { x: 0.55, y: 0.20 },
          right: { x: 0.57, y: 0.20 }
        },
        jump: {
          left:  { x: 0.46, y: 0.17 },
          right: { x: 0.54, y: 0.17 }
        }
      }
    }
  }
};
