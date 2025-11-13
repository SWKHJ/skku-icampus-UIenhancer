// ===== shimeji/points_client.js =====
export const Points = {
  async get(){ const r=await chrome.runtime.sendMessage({type:'POINTS_GET'}); return r?.balance ?? 0; },
  async earn(delta, reason){ return await chrome.runtime.sendMessage({type:'POINTS_EARN', delta, reason}); },
  async spend(cost, reason){ return await chrome.runtime.sendMessage({type:'POINTS_SPEND', cost, reason}); },
};
export function bindBalanceUpdates(onUpdate){
  const h = (m)=>{ if(m?.type==='POINTS_UPDATED') onUpdate(m.balance); };
  chrome.runtime.onMessage.addListener(h);
  return ()=>chrome.runtime.onMessage.removeListener(h);
}
