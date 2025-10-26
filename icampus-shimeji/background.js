// background.js
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'INJECT_PAGE_HOOK' && sender.tab?.id != null) {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      files: ['shimeji/page_hook.js'],  // ← 새 파일
      world: 'MAIN'                     // 페이지 메인 월드 (CSP 우회)
    });
  }
});
