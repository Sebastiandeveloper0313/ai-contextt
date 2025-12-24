# Clear Old Config to See Auth Screen

If you're still seeing the old interface instead of the login screen, you have old credentials stored.

## Quick Fix

Open the extension side panel, then open the browser console (F12) and run:

```javascript
chrome.storage.local.clear(() => {
  console.log('✅ Cleared! Reload the extension.');
  location.reload();
});
```

Or manually clear:
1. Go to `chrome://extensions/`
2. Find "Memory Layer"
3. Click "Details"
4. Under "Storage" → "Clear site data"
5. Reload the extension

## What This Does

- Clears old Supabase config
- Forces the auth screen to show
- You'll see the sign up/login screen

After clearing, you should see the auth screen!

