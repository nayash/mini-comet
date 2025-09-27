console.log("background.js script loaded.");
// this listens for click on extension's icon on toolbar
chrome.action.onClicked.addListener(async (tab) => {
  console.log(`background.js onClicked called: ${tab.id}`);
  // Get the content of the current tab via a content script
  /*chrome.tabs.sendMessage(tab.id, { action: 'get_page_text' }, (response) => {
    console.log(`background.js response received: ${response.text.slice(0, 100)}`);
    chrome.storage.local.set({ latestPageText: response.text }, () => {
      // Open the side panel for the current tab
      console.log(`background.js sidePanel open called: ${tab.id}`);
      chrome.sidePanel.open({ tabId: tab.id });
    });
  });*/
  chrome.sidePanel.open({ tabId: tab.id });
});