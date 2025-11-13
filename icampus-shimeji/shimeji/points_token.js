// ===== shimeji/points_token.js (revised: persistent balance + signed short-lived token) =====
const PTS_KEY    = 'pts:key_b64';
const PTS_TOKEN  = 'pts:token';
const PTS_BAL    = 'pts:balance';   // [NEW] 영구 잔액 저장소
const EXP_SECONDS = 180;

// base64 helpers
function b64ToBytes(b){
  const bin = atob(b);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}
function bytesToB64(u8){
  let s = '';
  for (const b of new Uint8Array(u8)) s += String.fromCharCode(b);
  return btoa(s);
}

// HMAC
async function importKey(b64){
  return crypto.subtle.importKey(
    'raw',
    b64ToBytes(b64),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}
async function genKeyB64(){
  const k = await crypto.subtle.generateKey(
    { name: 'HMAC', hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );
  const raw = await crypto.subtle.exportKey('raw', k);
  return bytesToB64(raw);
}
async function sign(keyB64, obj){
  const k   = await importKey(keyB64);
  const enc = new TextEncoder().encode(JSON.stringify(obj));
  const sig = await crypto.subtle.sign('HMAC', k, enc);
  return bytesToB64(sig);
}
async function verify(keyB64, obj, sig){
  const k   = await importKey(keyB64);
  const enc = new TextEncoder().encode(JSON.stringify(obj));
  return crypto.subtle.verify('HMAC', k, b64ToBytes(sig), enc);
}

// storage helpers
async function g(k){ return (await chrome.storage.local.get(k))[k]; }
async function s(k, v){ return chrome.storage.local.set({ [k]: v }); }

// token helpers
const now   = () => Math.floor(Date.now() / 1000);
const nonce = () => crypto.getRandomValues(new Uint32Array(2)).join('-');

export async function initPointsKey(){
  let key = await g(PTS_KEY);
  if (!key) {
    key = await genKeyB64();
    await s(PTS_KEY, key);
  }
  return key;
}

// [NEW] persistent balance helpers
async function getStoredBalance(){
  const raw = await g(PTS_BAL);
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}
async function setStoredBalance(bal){
  const clean = Math.max(0, Math.floor(bal || 0));
  await s(PTS_BAL, clean);
  return clean;
}

async function createToken(balance, keyB64){
  const payload = {
    user: 'local',
    balance,
    ts:  now(),
    exp: now() + EXP_SECONDS,
    nonce: nonce()
  };
  const sig = await sign(keyB64, payload);
  return { ...payload, sig };
}
async function readToken(){ return await g(PTS_TOKEN); }
async function writeToken(t){ await s(PTS_TOKEN, t); }

/**
 * getBalanceToken()
 * - 항상 "영구 잔액(PTS_BAL)"을 source-of-truth로 사용.
 * - 토큰이 없거나, 서명이 틀리거나, 만료된 경우:
 *   → PTS_BAL 기준으로 새 토큰 발급.
 * - 예전 버전에서 토큰만 있고 PTS_BAL이 없는 경우:
 *   → 토큰의 balance로 한 번 초기화(마이그레이션) 후, 이후부턴 PTS_BAL 기준.
 */
export async function getBalanceToken(){
  const key = await initPointsKey();
  let tok  = await readToken();
  let bal  = await getStoredBalance();   // 영구 잔액

  // 토큰이 아예 없을 때:
  if (!tok) {
    // 이전 버전에서 balance를 토큰에만 들고 있었다면 여기까지 안 옴.
    // 그냥 "영구 잔액" 기준(초기에는 0)으로 토큰 발급.
    bal = await setStoredBalance(bal);
    tok = await createToken(bal, key);
    await writeToken(tok);
    return { token: tok, balance: bal };
  }

  const { sig, ...pl } = tok;
  let valid = false;
  try {
    valid = !!sig && await verify(key, pl, sig);
  } catch {
    valid = false;
  }

  const expired = pl.exp < now();

  // 1) 서명 실패 or 만료된 토큰인 경우
  if (!valid || expired) {
    // 마이그레이션: PTS_BAL이 아직 0인데, 예전 토큰 balance가 양수라면 한 번은 살려줌
    if (bal === 0 && Number.isFinite(pl.balance) && pl.balance > 0) {
      bal = await setStoredBalance(pl.balance);
    } else {
      bal = await setStoredBalance(bal); // (이미 저장된 값 존중)
    }
    tok = await createToken(bal, key);
    await writeToken(tok);
    return { token: tok, balance: bal };
  }

  // 2) 토큰은 유효한데, PTS_BAL이 아직 초기화 안 되어 있는 예전 데이터 케이스
  if (bal === 0 && Number.isFinite(pl.balance) && pl.balance > 0) {
    bal = await setStoredBalance(pl.balance);
    tok = await createToken(bal, key);
    await writeToken(tok);
    return { token: tok, balance: bal };
  }

  // 3) 둘 다 있지만 값이 다르면 PTS_BAL을 진실로 보고 토큰만 재발급
  if (pl.balance !== bal) {
    bal = await setStoredBalance(bal);
    tok = await createToken(bal, key);
    await writeToken(tok);
  }

  return { token: tok, balance: bal };
}

// balance를 새 값으로 설정 (PTS_BAL + 토큰 모두 갱신)
export async function setBalance(newBal){
  const key = await initPointsKey();
  const bal = await setStoredBalance(newBal);
  const tok = await createToken(bal, key);
  await writeToken(tok);
  return { ok: true, balance: bal };
}

// earn / spend: 항상 "영구 잔액"을 기반으로 동작
export async function earnPoints(delta){
  if (!Number.isFinite(delta) || delta <= 0) {
    return { ok: false, reason: 'bad_delta' };
  }
  const { balance } = await getBalanceToken();
  return setBalance(balance + Math.floor(delta));
}

export async function spendPoints(cost){
  if (!Number.isFinite(cost) || cost <= 0) {
    return { ok: false, reason: 'bad_cost' };
  }
  const { balance } = await getBalanceToken();
  const next = balance - Math.floor(cost);
  if (next < 0) {
    return { ok: false, reason: 'insufficient', balance };
  }
  return setBalance(next);
}
