# Troubleshooting Memory Layer

## Data Not Being Captured

If you're chatting but no memories appear in Supabase:

### 1. Check Browser Console
- Open ChatGPT page
- Press F12 to open DevTools
- Go to "Console" tab
- Look for messages starting with `[Memory Layer]`
- Check for errors (red text)

**Common errors:**
- `Failed to send chunk: Failed to fetch` → Backend not running or wrong URL
- `User has not granted permission` → Click "Enable Memory Layer" in side panel
- `Could not find message container` → ChatGPT UI changed, selectors need update

### 2. Check Permission
- Open the Memory Layer side panel
- Make sure you clicked "Enable Memory Layer"
- If you see the permission prompt, click the button

### 3. Check Backend Connection
- Open browser console (F12)
- Look for network errors when extension tries to send data
- Test backend: Go to `http://localhost:3000/health` (or your deployed URL)
- Should return: `{"status":"ok"}`

### 4. Check ChatGPT Selectors
ChatGPT's UI changes frequently. The extension looks for:
- `[data-testid="conversation-turn"]` for messages
- If these don't exist, the extension won't detect messages

**To debug:**
1. Open ChatGPT
2. Open Console (F12)
3. Type: `document.querySelectorAll('[data-testid="conversation-turn"]')`
4. If it returns empty array, ChatGPT changed their UI

### 5. Verify Extension is Active
- Check `chrome://extensions/`
- Make sure Memory Layer is enabled
- Check for errors (red "Errors" button)
- Try reloading the extension

### 6. Check Supabase
- Go to Supabase dashboard → Table Editor
- Check `conversations` table - raw messages should appear here first
- Check `memories` table - processed memories appear here
- If `conversations` has data but `memories` is empty, OpenAI API might be failing

## Backend Not Starting

### Error: "Missing Supabase environment variables"
- Check `.env` file exists in `backend/` folder
- Verify all three variables are set:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `OPENAI_API_KEY`

### Error: "Cannot find module"
- Run: `cd backend && npm install`
- Then: `npm run build`
- Then: `npm start`

### Backend starts but crashes
- Check console output for error messages
- Common issues:
  - Invalid Supabase credentials
  - Invalid OpenAI API key
  - Network connection issues

## Extension Not Loading

### "Failed to load extension"
- Make sure you selected the `dist` folder, not `extension` folder
- Check that `manifest.json` exists in `dist/`
- Rebuild: `cd extension && npm run build`

### Side panel not opening
- Click the extension icon in Chrome toolbar
- Or: Right-click extension icon → "Open side panel"
- Make sure you're on `chat.openai.com`

## No Memories in Dashboard

### Memories table is empty
1. Check if conversations are being captured:
   - Supabase → Table Editor → `conversations` table
   - Should have entries if extension is working

2. Check if OpenAI processing is working:
   - Backend logs should show "Successfully sent conversation chunk"
   - Check OpenAI API key is valid
   - Check you have OpenAI credits

3. Check for errors:
   - Backend console for OpenAI API errors
   - Browser console for extension errors

## Semantic Search Not Working

### "Error in semantic search"
- Make sure `match_memories` function exists in Supabase
- Run the SQL migration again (the function creation part)
- Check that embeddings are being generated (look in `memories` table, `embedding` column should not be null)

## Quick Debug Checklist

- [ ] Extension loaded in Chrome (`chrome://extensions/`)
- [ ] Permission granted (clicked "Enable Memory Layer")
- [ ] Backend running (`http://localhost:3000/health` returns ok)
- [ ] On ChatGPT page (`chat.openai.com`)
- [ ] Browser console shows `[Memory Layer]` messages
- [ ] No errors in browser console
- [ ] Supabase tables exist (users, conversations, memories)
- [ ] Environment variables set correctly
- [ ] OpenAI API key is valid

## Still Not Working?

1. **Check all logs:**
   - Browser console (F12 on ChatGPT page)
   - Backend console (terminal where you ran `npm start`)
   - Supabase logs (Dashboard → Logs)

2. **Test each component:**
   - Backend health: `curl http://localhost:3000/health`
   - Extension permission: Check side panel
   - Message detection: Check browser console for `[Memory Layer]` logs

3. **Common fixes:**
   - Reload extension
   - Restart backend
   - Clear browser cache
   - Check ChatGPT hasn't changed their UI


