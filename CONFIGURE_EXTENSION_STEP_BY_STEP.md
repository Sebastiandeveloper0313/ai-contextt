# Step-by-Step: Configure Extension with Supabase

## Step 1: Get Your Credentials

1. Go to your Supabase Dashboard: https://app.supabase.com/project/ckhbyivskfnxdrjwgeyf
2. Click **Settings** (gear icon in left sidebar)
3. Click **API** (under "Project Settings")
4. You'll see two things you need:

   **a) Project URL:**
   - Look for "Project URL" 
   - It should be: `https://ckhbyivskfnxdrjwgeyf.supabase.co`
   - Copy this entire URL

   **b) anon public key:**
   - Look for "Project API keys" section
   - Find the key labeled **"anon" "public"**
   - Click the eye icon 👁️ to reveal it
   - Copy the entire key (it's a long string starting with `eyJ...`)

## Step 2: Configure Extension in Browser

1. **Go to ChatGPT:**
   - Open https://chat.openai.com in Chrome

2. **Open Developer Console:**
   - Press **F12** (or right-click → Inspect)
   - Click the **Console** tab

3. **Run this command:**
   - Replace the values with what you copied:

```javascript
chrome.storage.local.set({
  supabaseUrl: 'https://ckhbyivskfnxdrjwgeyf.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNraGJ5aXZza2ZueGRyandnZXlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzUwMDAwMDAsImV4cCI6MjA1MDU3NjAwMH0.your-actual-key-here'
}, () => {
  console.log('✅ Supabase configured! Now reload the page.');
});
```

**Important:** 
- Replace `'https://ckhbyivskfnxdrjwgeyf.supabase.co'` with your actual Project URL if it's different
- Replace `'eyJ...your-actual-key-here'` with your actual anon public key

4. **Press Enter** - you should see: `✅ Supabase configured! Now reload the page.`

5. **Reload the ChatGPT page:**
   - Press **F5** or click the reload button
   - Or close and reopen the tab

## Step 3: Verify It Worked

After reloading:

1. **Open Console again (F12)**
2. **Look for this message:**
   - `[Memory Layer] Initializing on ChatGPT page`
   - `[Memory Layer] Supabase configured: https://ckhbyivskfnxdrjwgeyf.supabase.co`

If you see those messages, it's configured correctly! ✅

If you see:
- `[Memory Layer] Supabase not configured` → The values weren't set correctly, try again

## Visual Guide

```
Supabase Dashboard → Settings → API
├── Project URL: https://ckhbyivskfnxdrjwgeyf.supabase.co  ← Copy this
└── Project API keys
    └── anon public (click 👁️ to reveal)                    ← Copy this
```

Then paste both into the JavaScript command above!


