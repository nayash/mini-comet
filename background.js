console.log("background.js script loaded.");
// this listens for click on extension's icon on toolbar

// When the user clicks on the extension action.
chrome.action.onClicked.addListener(async (tab) => {
  console.log(`background.js onClicked called: ${tab.id}`);
  // Get the content of the current tab via a content script
  // Set the side panel for the current tab and open it.
  chrome.sidePanel.open({ tabId: tab.id });
  await chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: 'sidepanel.html',
    enabled: true
  });
});

// When the user switches to a different tab.
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  // Enable the side panel for the new active tab.
  await chrome.sidePanel.setOptions({
    tabId,
    path: 'sidepanel.html',
    enabled: true
  });
});

// When a tab is updated (e.g., new URL is loaded).
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Check if the URL has changed and the tab is active.
  if (tab.active && changeInfo.url) {
    console.log(`URL changed in active tab ${tabId} to: ${changeInfo.url}`);
    // Re-enable the side panel to force it to reload its content for the new page.
    await chrome.sidePanel.setOptions({ tabId, path: 'sidepanel.html', enabled: true });
  }
});