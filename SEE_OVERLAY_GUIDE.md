# How to See the Overlay Chat

## Current Status

**Screen Capture**: ❌ Not built yet (Phase 3 in plan)  
**Page Context**: ✅ Built (reads text from web pages)  
**Overlay Chat**: ✅ Built (floating chat window)

## What You're Seeing

The side panel you see is **separate** from the overlay chat. The overlay is a **floating window** that should appear on **any webpage** (not in the side panel).

## How to See the Overlay

### Step 1: Reload Extension
1. Go to `chrome://extensions/`
2. Find "Memory Layer"
3. Click the **reload icon** (🔄)

### Step 2: Visit Any Website
1. Go to **any website** (not ChatGPT, try Wikipedia, GitHub, etc.)
2. The overlay should appear as a **floating chat window** in the bottom-right corner
3. Look for a purple/blue chat box

### Step 3: Check Console
1. Press **F12** to open DevTools
2. Go to **Console** tab
3. Look for: `[Memory Layer] ✅ Overlay container created`
4. If you see errors, share them

### Step 4: Manual Test
If overlay doesn't appear, try this in console (F12):

```javascript
// Check if overlay is enabled
chrome.storage.local.get(['overlayEnabled'], console.log);

// Enable it
chrome.storage.local.set({ overlayEnabled: true }, () => {
  location.reload();
});
```

## What the Overlay Does

The overlay can:
- ✅ **See page text** - Reads content from the webpage
- ✅ **Understand context** - Knows what page you're on
- ✅ **Search memories** - Finds relevant past conversations
- ❌ **Screen capture** - NOT YET (this is Phase 3)

## Current Capabilities

### What It CAN Do:
- Read text from web pages
- Understand page content
- Answer questions about the page
- Search your memory system
- Use thread context

### What It CAN'T Do Yet:
- See your screen (screenshots)
- See images on the page (vision)
- See other applications
- See your desktop

## Next Steps

1. **Reload extension** (chrome://extensions/)
2. **Visit a regular website** (not ChatGPT)
3. **Look for floating chat** (bottom-right)
4. **Check console** (F12) for errors
5. **Try asking**: "What's this page about?"

## Troubleshooting

### Overlay Not Showing?
1. Check console for errors
2. Verify Supabase is configured
3. Try reloading the page
4. Check `overlayEnabled` in storage

### Want Screen Capture?
Screen capture is **Phase 3** in the plan. We're currently on **Phase 1** (page context). To add screen capture, we need to:
1. Add `desktopCapture` permission
2. Implement screenshot capture
3. Send to GPT-4 Vision API
4. Integrate with chat

Would you like me to build screen capture now?

