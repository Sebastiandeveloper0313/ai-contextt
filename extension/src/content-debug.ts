// Debug version - tries to find ChatGPT messages with multiple strategies
console.log('[Memory Layer DEBUG] Script loaded at:', new Date().toISOString());
console.log('[Memory Layer DEBUG] Hostname:', window.location.hostname);
console.log('[Memory Layer DEBUG] Full URL:', window.location.href);

// Wait for page to be fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[Memory Layer DEBUG] DOM loaded');
    findChatGPTMessages();
  });
} else {
  console.log('[Memory Layer DEBUG] DOM already loaded');
  findChatGPTMessages();
}

function findChatGPTMessages() {
  console.log('[Memory Layer DEBUG] 🔍 Searching for messages...');
  
  // Strategy 1: Look for any elements with text content that might be messages
  const allDivs = document.querySelectorAll('div');
  console.log('[Memory Layer DEBUG] Total divs on page:', allDivs.length);
  
  // Strategy 2: Look for main content area
  const main = document.querySelector('main');
  if (main) {
    console.log('[Memory Layer DEBUG] Found <main> element');
    console.log('[Memory Layer DEBUG] Main children:', main.children.length);
    
    // Look for message-like structures
    const possibleMessages = Array.from(main.children).filter((el: Element) => {
      const text = el.textContent || '';
      return text.length > 20; // Has substantial text
    });
    
    console.log('[Memory Layer DEBUG] Possible message containers:', possibleMessages.length);
    possibleMessages.forEach((el, i) => {
      console.log(`[Memory Layer DEBUG] Message ${i}:`, {
        tagName: el.tagName,
        className: el.className,
        textPreview: (el.textContent || '').substring(0, 50),
        attributes: Array.from(el.attributes).map(attr => `${attr.name}="${attr.value}"`).join(', ')
      });
    });
  }
  
  // Strategy 3: Look for common patterns
  const patterns = [
    '[data-testid*="message"]',
    '[data-testid*="turn"]',
    '[data-testid*="conversation"]',
    '[class*="message"]',
    '[class*="Message"]',
    '[class*="turn"]',
    '[class*="Turn"]',
    'article',
    '[role="article"]',
    '[role="group"]'
  ];
  
  patterns.forEach(pattern => {
    const elements = document.querySelectorAll(pattern);
    if (elements.length > 0) {
      console.log(`[Memory Layer DEBUG] ✅ Found ${elements.length} elements with: ${pattern}`);
      if (elements.length <= 5) {
        Array.from(elements).forEach((el, i) => {
          console.log(`[Memory Layer DEBUG]   Element ${i}:`, {
            tagName: el.tagName,
            className: el.className,
            id: el.id,
            attributes: Array.from(el.attributes).map(attr => `${attr.name}="${attr.value}"`).slice(0, 3)
          });
        });
      }
    }
  });
  
  // Strategy 4: Monitor DOM changes
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) { // Element node
            const el = node as Element;
            const text = el.textContent || '';
            if (text.length > 20 && (text.includes('ChatGPT') || text.includes('User'))) {
              console.log('[Memory Layer DEBUG] 🆕 New message-like element added:', {
                tagName: el.tagName,
                className: el.className,
                textPreview: text.substring(0, 100),
                parent: el.parentElement?.tagName
              });
            }
          }
        });
      }
    });
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  console.log('[Memory Layer DEBUG] ✅ Observer set up. Try sending a message in ChatGPT and watch for logs.');
}


