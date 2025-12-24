# How to Load the Extension in Chrome

## Step 1: Build the Extension (Already Done ✅)

The extension has been built. The files are in the `extension/dist/` folder.

## Step 2: Load in Chrome

1. **Open Chrome Extensions Page**
   - Go to `chrome://extensions/` in your browser
   - Or: Menu (⋮) → Extensions → Manage Extensions

2. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top-right corner

3. **Load the Extension**
   - Click "Load unpacked" button
   - Navigate to: `C:\Users\sebbe\Documents\GitHub\ai-context\extension\dist`
   - Select the `dist` folder and click "Select Folder"

4. **Verify Installation**
   - You should see "Memory Layer" extension in your extensions list
   - It may show a default puzzle piece icon (that's okay - icons are optional)

## Step 3: Test the Extension

1. **Open ChatGPT**
   - Go to https://chat.openai.com

2. **Open the Side Panel**
   - Click the Memory Layer extension icon in your Chrome toolbar
   - Or: Right-click the extension icon → "Open side panel"

3. **Grant Permission**
   - You'll see a permission prompt
   - Click "Enable Memory Layer" to grant permission

4. **View the UI**
   - You should see the side panel with:
     - Header with "Memory Layer" title
     - "Relevant Past Context" section
     - "Resume Context" button (when context is available)

## Note About Backend

The extension will try to connect to `http://localhost:3000` by default. If the backend isn't running:
- The extension UI will still work
- You'll see "No relevant context found yet" 
- Console errors about failed API calls are normal (F12 to see them)

To test with backend:
1. Set up Supabase (see `SETUP.md`)
2. Start the backend: `cd backend && npm start`
3. The extension will automatically send conversation data

## Troubleshooting

**Extension not appearing?**
- Make sure you selected the `dist` folder, not the `extension` folder
- Check for errors in the extensions page (click "Errors" if shown)

**Side panel not opening?**
- Try clicking the extension icon in the toolbar
- Check if ChatGPT page is loaded (extension only works on chat.openai.com)

**Permission prompt not showing?**
- Check browser console (F12) for errors
- Try reloading the extension (click the reload icon on the extensions page)

**Icons missing?**
- The extension works without icons
- Chrome will show a default puzzle piece icon
- To add icons: Create 16x16, 48x48, and 128x128 PNG files in `extension/icons/` and rebuild

## Quick Test Without Backend

Even without the backend running, you can:
- ✅ See the extension UI
- ✅ Test the permission flow
- ✅ View the side panel design
- ❌ Won't capture conversations (needs backend)
- ❌ Won't show memories (needs backend)

The UI is fully functional - it just needs the backend to store and retrieve data!



