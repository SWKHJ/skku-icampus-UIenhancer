// ===== shimeji/points_client.js (safe version) =====

// 내부 유틸: sendMessage + timeout
function safeMessage(msg, timeoutMs = 300) {
  return new Promise((resolve) => {
    let done = false;

    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve({ ok: false, timeout: true });
      }
    }, timeoutMs);

    chrome.runtime.sendMessage(msg, (res) => {
      if (done) return;   // 이미 timeout 발생
      done = true;
      clearTimeout(timer);
      resolve(res || { ok: false, empty: true });
    });
  });
}

export const Points = {
  async get() {
    const r = await safeMessage({ type: 'POINTS_GET' });
    if (r?.balance != null) return r.balance; 
    return 0; // 실패 시 기본값
  },

  async earn(delta, reason) {
    const r = await safeMessage({ type: 'POINTS_EARN', delta, reason });
    return r || { ok: false, reason: 'no_response' };
  },

  async spend(cost, reason) {
    const r = await safeMessage({ type: 'POINTS_SPEND', cost, reason });
    return r || { ok: false, reason: 'no_response' };
  },
};

// 실시간 업데이트 구독
export function bindBalanceUpdates(onUpdate){
  const h = (m)=>{ 
    if (m?.type === 'POINTS_UPDATED') onUpdate(m.balance); 
  };
  chrome.runtime.onMessage.addListener(h);
  return ()=>chrome.runtime.onMessage.removeListener(h);
}
