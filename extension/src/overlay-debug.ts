// Debug script to manually inject overlay
// Run this in console on any page to test overlay

(function() {
  console.log('[Memory Layer Debug] Starting overlay injection...');
  
  // Check if already exists
  if (document.getElementById('memory-layer-overlay-root')) {
    console.log('[Memory Layer Debug] Overlay already exists, removing...');
    document.getElementById('memory-layer-overlay-root')?.remove();
  }

  // Create script tag to load overlay
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('overlay-inject.js');
  script.onload = () => {
    console.log('[Memory Layer Debug] ✅ Overlay script loaded');
    script.remove();
  };
  script.onerror = (err) => {
    console.error('[Memory Layer Debug] ❌ Failed to load overlay:', err);
  };
  
  (document.head || document.documentElement).appendChild(script);
  
  console.log('[Memory Layer Debug] Script tag added, waiting for overlay...');
})();

