console.log("background.js script loaded.");

// In-memory store to track the last known URL for each tab.
const tabUrlCache = {};

// When the user clicks on the extension action.
chrome.action.onClicked.addListener(async (tab) => {
  console.log(`background.js onClicked called: ${tab.id}`);
  // Open the side panel first, in direct response to the user gesture.
  await chrome.sidePanel.open({ tabId: tab.id });
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
  // We only care about updates to the active tab.
  if (!tab.active) {
    return;
  }

  // The 'status' property is a reliable indicator for reloads and new page navigations.
  if (changeInfo.status === 'loading') {
    // Normalize the URL by removing the hash, as hash changes don't reload the page content.
    const newUrl = tab.url.split('#')[0];
    const oldUrl = tabUrlCache[tabId];

    // If the URL (without the hash) has changed, it's a new page.
    if (newUrl !== oldUrl) {
      console.log(`New page loaded in tab ${tabId}: ${newUrl}`);
      tabUrlCache[tabId] = newUrl; // Update the cache.
      await chrome.sidePanel.setOptions({ tabId, path: 'sidepanel.html', enabled: true });
    }
  }
});