// this is loaded only if pages are reloaded or new tabs. 
// If a page is open even before extension is installed/loaded, it is not loaded
console.log('content.js loaded');
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log(`content.js: listener called with: ${request.action}`);
  if (request.action === "get_page_text") {
    console.log(`listener matched ${request.action}: text=${document.body.innerText.slice(0, 100)}`);
    sendResponse({ text: document.body.innerText });
  }
});