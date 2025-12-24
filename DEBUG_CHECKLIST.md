# Debug Checklist - Why Nothing is Happening

## Step 1: Verify Content Script is Loading

1. Go to ChatGPT page
2. Open Console (F12)
3. Type this in console and press Enter:

```javascript
document.querySelectorAll('[data-testid="conversation-turn"]')
```

**Expected:** Should return a NodeList with message elements
**If empty:** ChatGPT UI changed, selectors need update

## Step 2: Check if Extension is Active

1. Go to `chrome://extensions/`
2. Find "Memory Layer"
3. Click "service worker" link (under "Inspect views")
4. Check the service worker console for errors

## Step 3: Verify Content Script Injection

1. On ChatGPT page, open Console (F12)
2. Type: `window.memoryLayerMonitor`
3. **Expected:** Should show an object (the monitor instance)
4. **If undefined:** Content script didn't load

## Step 4: Check Storage

1. On ChatGPT page, open Console (F12)
2. Run this:

```javascript
chrome.storage.local.get(null, (items) => {
  console.log('Storage:', items);
});
```

**Check for:**
- `hasPermission: true`
- `supabaseUrl: "https://..."`
- `supabaseAnonKey: "eyJ..."`

## Step 5: Manual Test

If content script isn't loading, try:

1. Reload the extension
2. Reload ChatGPT page (F5)
3. Check console again for `[Memory Layer] Initializing...`

## Common Issues

**No `[Memory Layer]` messages:**
- Content script not injected
- Extension not enabled
- Wrong page (must be chat.openai.com)

**"Supabase not configured":**
- Check storage has supabaseUrl and supabaseAnonKey
- Reconfigure in side panel

**"Permission not granted":**
- Click "Enable Memory Layer" in side panel

**No messages detected:**
- ChatGPT UI changed
- Selectors need update


