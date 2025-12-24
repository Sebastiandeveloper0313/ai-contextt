// Inject overlay chat into all web pages
// This runs on every page to provide universal AI assistance

import React from 'react';
import { createRoot } from 'react-dom/client';
import OverlayChat from './overlay';
import './overlay.css';

// Wait for page to be ready
function initOverlay() {
  // Check if overlay already exists
  if (document.getElementById('memory-layer-overlay-root')) {
    return;
  }

  // Check if user has enabled overlay
  chrome.storage.local.get(['overlayEnabled'], (result) => {
    const enabled = result.overlayEnabled !== false; // Default to enabled
    
    if (enabled) {
      // Create container for overlay
      const overlayRoot = document.createElement('div');
      overlayRoot.id = 'memory-layer-overlay-root';
      overlayRoot.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 999999;
      `;
      document.body.appendChild(overlayRoot);
      
      console.log('[Memory Layer] ✅ Overlay container created');

      // Render overlay component
      const root = createRoot(overlayRoot);
      root.render(React.createElement(OverlayChat));
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initOverlay);
} else {
  initOverlay();
}
