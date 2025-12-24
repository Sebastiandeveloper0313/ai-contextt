# Quick Console Tests

Run these commands **one at a time** in the ChatGPT page console (F12):

## Test 1: Check if messages exist
```javascript
document.querySelectorAll('[data-testid="conversation-turn"]')
```
**Expected:** Should return a NodeList (array-like object) with message elements
**If empty:** ChatGPT UI changed, we need to update selectors

## Test 2: Check if content script loaded
```javascript
window.memoryLayerMonitor
```
**Expected:** Should show an object (the monitor instance)
**If undefined:** Content script didn't load

## Test 3: Check extension storage
```javascript
chrome.storage.local.get(null, (items) => { console.log('Storage:', items); });
```
**Expected:** Should show an object with hasPermission, supabaseUrl, supabaseAnonKey, userId
**Check for:**
- `hasPermission: true` ✅
- `supabaseUrl: "https://..."` ✅
- `supabaseAnonKey: "eyJ..."` ✅

## Test 4: Check for Memory Layer logs
Look in console for any messages starting with `[Memory Layer]`

If you see:
- `[Memory Layer] Content script loaded` ✅ Script is running
- `[Memory Layer] ✅ Initializing on ChatGPT page` ✅ Detected ChatGPT
- `[Memory Layer] ✅ Supabase configured` ✅ Config is set
- `[Memory Layer] Found X message elements` ✅ Messages detected

## Test 5: Manual message detection
```javascript
// Try to find messages with different selectors
console.log('Test 1:', document.querySelectorAll('[data-testid="conversation-turn"]').length);
console.log('Test 2:', document.querySelectorAll('div[class*="message"]').length);
console.log('Test 3:', document.querySelectorAll('[role="article"]').length);
console.log('Test 4:', document.querySelectorAll('div[data-message-id]').length);
```

Run these and share what you see!



