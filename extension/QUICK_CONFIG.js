// Quick Configuration Script for Memory Layer Extension
// Copy and paste this into Chrome Console (F12) on ChatGPT page
// Replace the values with your actual Supabase credentials

// Get these from: Supabase Dashboard → Settings → API
const SUPABASE_URL = 'https://ckhbyivskfnxdrjwgeyf.supabase.co';  // Your Project URL
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE';  // Your anon public key

// Set the configuration
chrome.storage.local.set({
  supabaseUrl: SUPABASE_URL,
  supabaseAnonKey: SUPABASE_ANON_KEY
}, () => {
  console.log('✅ Memory Layer configured!');
  console.log('Supabase URL:', SUPABASE_URL);
  console.log('Now reload the ChatGPT page (F5)');
  
  // Optional: Reload automatically
  // window.location.reload();
});


