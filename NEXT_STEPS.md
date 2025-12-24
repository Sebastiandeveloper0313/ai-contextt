# Next Steps - Almost Done! 🎉

## ✅ Completed
- [x] Supabase project linked
- [x] Edge Functions deployed:
  - `process-conversation` ✅
  - `search-memories` ✅

## 🔧 Step 5: Set OpenAI API Key

Run this command (replace with your actual OpenAI key):

```bash
npx supabase secrets set OPENAI_API_KEY=sk-your-actual-key-here
```

## 🔧 Step 6: Configure Extension

After setting the secret, configure the extension:

1. **Get your Supabase credentials:**
   - Go to Supabase Dashboard → Settings → API
   - Copy:
     - **Project URL** (e.g., `https://ckhbyivskfnxdrjwgeyf.supabase.co`)
     - **anon public** key (under "Project API keys")

2. **Configure extension:**
   - Go to ChatGPT page
   - Open Console (F12)
   - Run this (replace with your values):

```javascript
chrome.storage.local.set({
  supabaseUrl: 'https://ckhbyivskfnxdrjwgeyf.supabase.co',
  supabaseAnonKey: 'your-anon-key-here'
}, () => {
  console.log('✅ Supabase configured! Reload the page.');
});
```

3. **Reload the ChatGPT page**

4. **Test it:**
   - Start chatting
   - Check console for `[Memory Layer]` messages
   - Check Supabase → Table Editor → `memories` table

## 🎯 Your Supabase Project URL

Based on your project ID, your URL should be:
`https://ckhbyivskfnxdrjwgeyf.supabase.co`

The Edge Functions will be at:
- `https://ckhbyivskfnxdrjwgeyf.supabase.co/functions/v1/process-conversation`
- `https://ckhbyivskfnxdrjwgeyf.supabase.co/functions/v1/search-memories`

## 🐛 Troubleshooting

If you see "Supabase not configured" in console:
- Make sure you set both `supabaseUrl` and `supabaseAnonKey`
- Reload the page after setting
- Check the values are correct (no typos)

If functions don't work:
- Check Supabase Dashboard → Edge Functions → Logs
- Verify OpenAI API key is set: `npx supabase secrets list`


