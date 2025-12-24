# Fix: Content Script Not Loading

## Issue
The content script isn't running at all - no `[Memory Layer]` logs appear.

## Step 1: Verify Extension is Enabled

1. Go to `chrome://extensions/`
2. Find "Memory Layer"
3. Make sure the toggle is **ON** (blue)
4. If it's off, turn it on

## Step 2: Check Service Worker

1. In `chrome://extensions/`, find "Memory Layer"
2. Click "service worker" link (under "Inspect views")
3. Check for any errors in the service worker console

## Step 3: Verify Content Script File Exists

1. The file should be at: `extension/dist/content.js`
2. Check if it exists and has content

## Step 4: Check URL Match

The manifest matches `https://chat.openai.com/*`
- Make sure you're on `chat.openai.com` (not `chatgpt.com` or other domains)
- Try reloading the page after enabling extension

## Step 5: Manual Test

1. Reload extension
2. Reload ChatGPT page (F5)
3. Open Console (F12)
4. Look for `[Memory Layer] Content script loaded` message

If you still don't see it, there might be a JavaScript error preventing the script from running.

## Step 6: Find Correct Selectors

Since ChatGPT's UI changed, we need to find the new selectors:

1. **Send a message in ChatGPT**
2. **Right-click on your message** → "Inspect"
3. **Look at the HTML structure** - find:
   - The element containing your message
   - Any `data-*` attributes
   - Class names
   - Parent containers

4. **Share what you find** - I'll update the selectors!

## Quick Selector Test

After inspecting, try this in console:

```javascript
// Get the element you just inspected
$0  // This is the selected element in DevTools

// Check its attributes
$0.getAttributeNames()

// Check its classes
$0.className

// Check parent
$0.parentElement

// Find similar siblings
$0.parentElement.children
```

This will help us find the correct selector pattern!

