# Configure Extension from Console (Fixed!)

The `chrome.storage` API isn't available in the page console. Use this method instead:

## Method 1: Use Extension Message API (Recommended)

Run this in the ChatGPT page console (F12):

```javascript
// This sends a message to the extension, which can access chrome.storage
const script = document.createElement('script');
script.textContent = `
  (function() {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage('${chrome.runtime.id}', {
        type: 'SET_SUPABASE_CONFIG',
        supabaseUrl: 'https://ckhbyivskfnxdrjwgeyf.supabase.co',
        supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNraGJ5aXZza2ZueGRyandnZXlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY1Mjg1OTQsImV4cCI6MjA4MjEwNDU5NH0.PE2i26i09lqhxzW6qlu3KxB63ZKSyivP6oCnaZfv9WI'
      }, (response) => {
        console.log('✅ Configuration saved!', response);
        console.log('Now reload the page (F5)');
      });
    }
  })();
`;
(document.head || document.documentElement).appendChild(script);
script.remove();
```

**Wait, that's complicated. Use Method 2 instead!**

## Method 2: Use Content Script Injection (Easier)

Run this simpler version in the console:

```javascript
// Inject into page and send message to extension
window.postMessage({
  type: 'MEMORY_LAYER_CONFIG',
  supabaseUrl: 'https://ckhbyivskfnxdrjwgeyf.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNraGJ5aXZza2ZueGRyandnZXlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY1Mjg1OTQsImV4cCI6MjA4MjEwNDU5NH0.PE2i26i09lqhxzW6qlu3KxB63ZKSyivP6oCnaZfv9WI'
}, '*');
```

Then the content script will listen for this and configure it.

## Method 3: Use Extension Side Panel (Easiest!)

Actually, the easiest way is to add a configuration UI in the side panel. Let me update that!



