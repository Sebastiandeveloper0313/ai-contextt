# Setting Up Supabase Edge Functions

## Step 1: Install Supabase CLI (Windows)

### Option A: Using Scoop (Recommended)
```powershell
# Install Scoop if you don't have it
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression

# Install Supabase CLI
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

### Option B: Direct Download
1. Go to https://github.com/supabase/cli/releases
2. Download `supabase_windows_amd64.zip`
3. Extract and add to PATH, or use from that folder

### Option C: Use npx (No installation needed)
We can use `npx supabase` instead of installing globally.

## Step 2: Login to Supabase

```bash
npx supabase login
```

Or if installed:
```bash
supabase login
```

This will open a browser to authenticate.

## Step 3: Link Your Project

Get your project reference ID from your Supabase dashboard URL:
- URL looks like: `https://app.supabase.com/project/abcdefghijklmnop`
- The `abcdefghijklmnop` part is your project ref

Then link:
```bash
npx supabase link --project-ref YOUR_PROJECT_REF
```

## Step 4: Initialize Functions (if needed)

```bash
npx supabase functions new process-conversation
npx supabase functions new search-memories
```

(But we already created the files, so we can skip this)

## Step 5: Deploy Functions

```bash
npx supabase functions deploy process-conversation
npx supabase functions deploy search-memories
```

## Step 6: Set Environment Secrets

```bash
npx supabase secrets set OPENAI_API_KEY=your_openai_key_here
```

The SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are automatically available in Edge Functions.

## Step 7: Update Extension

We'll update the extension to use your Supabase project URL instead of localhost.

## Quick Start (Using npx - No Installation)

Since global install doesn't work, we'll use `npx` which doesn't require installation:

```bash
# Login
npx supabase login

# Link project (replace with your project ref)
npx supabase link --project-ref YOUR_PROJECT_REF

# Deploy functions
npx supabase functions deploy process-conversation
npx supabase functions deploy search-memories

# Set OpenAI key
npx supabase secrets set OPENAI_API_KEY=sk-your-key-here
```

Let's start with this approach!


