// shimeji/page_hook.js  (메인 월드, CSP 영향 없음)
(() => {
  const reReq = /(^|\/)submissions?(\/|\.|$)/i;

  const post = (url, phase) =>
    window.postMessage({ type: '__shimeji_req', url, phase }, '*');

  // fetch hook
  const _fetch = window.fetch;
  window.fetch = async function(input, init) {
    const url = (typeof input === 'string') ? input : input?.url || '';
    if (reReq.test(url)) post(url, 'before');
    const res = await _fetch.apply(this, arguments);
    if (reReq.test(url)) post(url, 'completed');
    return res;
  };

  // XHR hook
  const OXHR = XMLHttpRequest;
  XMLHttpRequest = function() {
    const xhr = new OXHR();
    const open = xhr.open;
    xhr.open = function(m, u) { this.__u = u; return open.apply(this, arguments); };
    xhr.addEventListener('loadstart', function() {
      if (reReq.test(this.__u || '')) post(this.__u, 'before');
    });
    xhr.addEventListener('loadend', function() {
      if (reReq.test(this.__u || '')) post(this.__u, 'completed');
    });
    return xhr;
  };
})();
