// Background service worker for Memory Layer extension

chrome.runtime.onInstalled.addListener(() => {
  console.log('Memory Layer extension installed');
  
  // Request side panel permission
  chrome.sidePanel.setOptions({
    path: 'sidepanel.html',
    enabled: true
  });
  
  // Enable overlay by default
  chrome.storage.local.set({ overlayEnabled: true });
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Handle messages from content script and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_RELEVANT_CONTEXT') {
    // Forward to content script
    if (sender.tab?.id) {
      chrome.tabs.sendMessage(sender.tab.id, {
        type: 'FETCH_CONTEXT',
        query: message.query
      }, (response) => {
        sendResponse(response);
      });
      return true; // Keep channel open for async response
    }
  }
  
  if (message.type === 'CHECK_PERMISSION') {
    chrome.storage.local.get(['hasPermission'], (result) => {
      sendResponse({ hasPermission: result.hasPermission === true });
    });
    return true;
  }

  if (message.type === 'SET_PERMISSION') {
    chrome.storage.local.set({ hasPermission: message.hasPermission }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  // Handle Supabase configuration from page console
  if (message.type === 'SET_SUPABASE_CONFIG') {
    chrome.storage.local.set({
      supabaseUrl: message.supabaseUrl,
      supabaseAnonKey: message.supabaseAnonKey
    }, () => {
      sendResponse({ success: true });
      console.log('[Memory Layer] Supabase configured successfully!');
    });
    return true;
  }

  // Toggle overlay
  if (message.type === 'TOGGLE_OVERLAY') {
    chrome.storage.local.get(['overlayEnabled'], (result) => {
      const newValue = !result.overlayEnabled;
      chrome.storage.local.set({ overlayEnabled: newValue }, () => {
        sendResponse({ enabled: newValue });
      });
    });
    return true;
  }
});

