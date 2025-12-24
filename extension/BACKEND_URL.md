# Configuring Backend URL

After deploying your backend, update the extension to point to your deployed URL.

## Update Backend URL

1. **Edit `extension/src/content.ts`**
   - Find line: `private readonly BACKEND_URL = 'http://localhost:3000';`
   - Change to your deployed URL, e.g.:
     ```typescript
     private readonly BACKEND_URL = 'https://your-project.vercel.app';
     ```

2. **Rebuild the extension:**
   ```bash
   cd extension
   npm run build
   ```

3. **Reload extension in Chrome:**
   - Go to `chrome://extensions/`
   - Click the reload icon on Memory Layer extension

## For Development

Keep `http://localhost:3000` when testing locally.

## For Production

Use your deployed URL (Vercel, Railway, Render, etc.)

## Testing

After updating:
1. Go to ChatGPT
2. Open browser console (F12)
3. Look for `[Memory Layer]` messages
4. Should see "Successfully sent conversation chunk" when you chat

