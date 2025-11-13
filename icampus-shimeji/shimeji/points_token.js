// ===== shimeji/points_token.js =====
const PTS_KEY   = 'pts:key_b64';
const PTS_TOKEN = 'pts:token';
const EXP_SECONDS = 180;

// base64 helpers
function b64ToBytes(b){const bin=atob(b);const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a;}
function bytesToB64(u8){let s='';for(const b of new Uint8Array(u8)) s+=String.fromCharCode(b);return btoa(s);}

// HMAC
async function importKey(b64){return crypto.subtle.importKey('raw', b64ToBytes(b64), {name:'HMAC',hash:'SHA-256'}, false, ['sign','verify']);}
async function genKeyB64(){const k=await crypto.subtle.generateKey({name:'HMAC',hash:'SHA-256'}, true, ['sign','verify']);const raw=await crypto.subtle.exportKey('raw',k);return bytesToB64(raw);}
async function sign(keyB64,obj){const k=await importKey(keyB64);const enc=new TextEncoder().encode(JSON.stringify(obj));return bytesToB64(await crypto.subtle.sign('HMAC',k,enc));}
async function verify(keyB64,obj,sig){const k=await importKey(keyB64);const enc=new TextEncoder().encode(JSON.stringify(obj));return crypto.subtle.verify('HMAC',k,b64ToBytes(sig),enc);}

// storage
async function g(k){return (await chrome.storage.local.get(k))[k];}
async function s(k,v){return chrome.storage.local.set({[k]:v});}

// token helpers
const now=()=>Math.floor(Date.now()/1000);
const nonce=()=>crypto.getRandomValues(new Uint32Array(2)).join('-');

export async function initPointsKey(){
  let key = await g(PTS_KEY);
  if(!key){ key = await genKeyB64(); await s(PTS_KEY,key); }
  return key;
}
async function createToken(balance, keyB64){
  const payload={ user:'local', balance, ts:now(), exp:now()+EXP_SECONDS, nonce:nonce() };
  const sig = await sign(keyB64, payload);
  return {...payload, sig};
}
async function readToken(){ return await g(PTS_TOKEN); }
async function writeToken(t){ await s(PTS_TOKEN,t); }

export async function getBalanceToken(){
  const key = await initPointsKey();
  let tok = await readToken();
  const issueZero = async () => { tok = await createToken(0,key); await writeToken(tok); };
  if(!tok){ await issueZero(); return {token:tok, balance:0}; }
  const {sig, ...pl} = tok;
  const ok = await verify(key, pl, sig);
  if(!ok || pl.exp < now()){ await issueZero(); return {token:tok, balance:0}; }
  return {token:tok, balance: pl.balance||0};
}
export async function setBalance(newBal){
  const key = await initPointsKey();
  const tok = await createToken(newBal, key);
  await writeToken(tok);
  return {ok:true, balance:newBal};
}
export async function earnPoints(delta){
  if(!Number.isFinite(delta) || delta<=0) return {ok:false, reason:'bad_delta'};
  const {balance} = await getBalanceToken();
  return setBalance(balance + Math.floor(delta));
}
export async function spendPoints(cost){
  if(!Number.isFinite(cost) || cost<=0) return {ok:false, reason:'bad_cost'};
  const {balance} = await getBalanceToken();
  const nb = balance - Math.floor(cost);
  if(nb<0) return {ok:false, reason:'insufficient', balance};
  return setBalance(nb);
}
