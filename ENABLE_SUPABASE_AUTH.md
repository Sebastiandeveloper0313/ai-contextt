# Enable Supabase Auth - One-Time Setup

## What Changed
✅ **No more Supabase config needed!** Users just sign up/login.

## One-Time Setup Required

You need to enable Supabase Auth in your project:

### Step 1: Enable Email Auth
1. Go to Supabase Dashboard → Authentication → Providers
2. Enable **Email** provider
3. Save

### Step 2: Configure Email (Optional)
- You can use Supabase's built-in email service for now
- Or configure your own SMTP (for production)

### Step 3: Test It
1. Reload the extension
2. Open side panel
3. You should see a **Sign Up / Sign In** screen
4. Create an account
5. Start using Memory Layer!

## How It Works Now

1. **User opens extension** → Sees sign up/login screen
2. **User creates account** → Supabase Auth handles it
3. **User signs in** → Extension stores auth token
4. **All operations** → Use authenticated user ID
5. **No Supabase config needed** → Everything is automatic!

## For Production

When you're ready to launch:
1. Replace hardcoded Supabase URL with environment variable
2. Set up proper email service (SendGrid, etc.)
3. Add password reset flow
4. Add email verification (optional)

## Current Status

- ✅ Auth component created
- ✅ Sign up/login flow implemented
- ✅ No Supabase config needed
- ⏳ Need to enable Email auth in Supabase Dashboard

Once you enable Email auth in Supabase, users can just sign up and use it!


