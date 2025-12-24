# Configuring Extension for Supabase

After deploying Edge Functions, configure the extension to use your Supabase project.

## Method 1: Set via Browser Console (Quick)

1. Go to ChatGPT page
2. Open Console (F12)
3. Run these commands (replace with your values):

```javascript
// Get your values from Supabase Dashboard → Settings → API
chrome.storage.local.set({
  supabaseUrl: 'https://your-project-id.supabase.co',
  supabaseAnonKey: 'your-anon-key-here'
}, () => {
  console.log('Supabase configured! Reload the page.');
});
```

4. Reload the ChatGPT page

## Method 2: Create Options Page (Better UX)

We can create an options page in the extension for easier configuration.

## Get Your Values

1. **Supabase URL**: 
   - Go to Supabase Dashboard → Settings → API
   - Copy "Project URL" (e.g., `https://xxxxx.supabase.co`)

2. **Anon Key**:
   - Same page, under "Project API keys"
   - Copy the `anon` `public` key (NOT the service_role key)
   - This is safe to use in the extension (it's public)

## Test Configuration

After setting, check console for:
- `[Memory Layer] Supabase configured: https://...`

If you see warnings, the config isn't set correctly.

