console.log("background.js script loaded.");
// this listens for click on extension's icon on toolbar
chrome.action.onClicked.addListener(async (tab) => {
  console.log(`background.js onClicked called: ${tab.id}`);
  // Get the content of the current tab via a content script
  chrome.sidePanel.open({ tabId: tab.id });
});