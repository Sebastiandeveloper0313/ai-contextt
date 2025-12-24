# Quick Start: Supabase Edge Functions Setup

## Step 1: Login to Supabase

Run this command - it will open your browser to login:

```bash
npx supabase login
```

## Step 2: Get Your Project Reference ID

1. Go to your Supabase dashboard
2. Look at the URL: `https://app.supabase.com/project/abcdefghijklmnop`
3. Copy the part after `/project/` (the long string of letters/numbers)

## Step 3: Link Your Project

Replace `YOUR_PROJECT_REF` with the ID you copied:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
```

## Step 4: Deploy the Functions

I've already created the function code. Just deploy them:

```bash
npx supabase functions deploy process-conversation
npx supabase functions deploy search-memories
```

## Step 5: Set Your OpenAI API Key

```bash
npx supabase secrets set OPENAI_API_KEY=sk-your-actual-key-here
```

## Step 6: Get Your Supabase Project URL

1. Go to Supabase dashboard → Settings → API
2. Copy your **Project URL** (looks like `https://xxxxx.supabase.co`)

## Step 7: Update Extension

We'll update the extension to use your Supabase URL. The extension will call:
- `https://YOUR_PROJECT.supabase.co/functions/v1/process-conversation`
- `https://YOUR_PROJECT.supabase.co/functions/v1/search-memories`

## Ready to Start?

Run these commands one by one and let me know when you're done or if you hit any errors!



