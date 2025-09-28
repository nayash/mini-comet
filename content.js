// this is loaded only if pages are reloaded or new tabs. 
// If a page is open even before extension is installed/loaded, it is not loaded
// console.log('content.js loaded');
// chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
//   console.log(`content.js: listener called with: ${request.action}`);
//   if (request.action === "get_page_text") {
//     console.log(`listener matched ${request.action}: text=${document.body.innerText.slice(0, 100)}`);
//     sendResponse({ text: document.body.innerText });
//   }
// });

// content.js
console.log('content.js loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'get_page_text') {
    try {
      // 1) Prefer Readability (works on a cloned DOM to avoid mutating the page)
      const docClone = document.cloneNode(true);
      const article = new Readability(docClone).parse(); // requires Readability to be injected first

      if (article && (article.textContent || article.content)) {
        console.log(`content.js: article text from Readability`);
        // Return both plain text and HTML for flexible rendering in the side panel
        sendResponse({
          text: article.textContent || '',
          html: article.content || '',
          title: article.title || '',
          excerpt: article.excerpt || '',
          byline: article.byline || ''
        });
        return true; // indicate async-safe path
      }

      console.log(`content.js: article text from fallback`);
      // 2) Fallbacks: try semantic containers before body
      const mainEl =
        document.querySelector('main, article, [role="main"]') ||
        // looser fallback: the largest texty section among common containers
        [...document.querySelectorAll('article, main, #content, .content, .post, section')]
          .sort((a, b) => (b.innerText || '').length - (a.innerText || '').length)[0];

      const fallbackText = (mainEl?.innerText || document.body.innerText || '').trim();
      sendResponse({ text: fallbackText, html: '', title: document.title || '' });
      return true;
    } catch (e) {
      console.error('Extraction error:', e);
      sendResponse({ text: (document.body.innerText || '').trim(), html: '', title: document.title || '' });
      return true;
    }
  }
});
