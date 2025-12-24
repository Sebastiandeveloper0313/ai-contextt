# Quick Setup Guide

## Prerequisites

1. **Node.js 18+** - [Download](https://nodejs.org/)
2. **Supabase Account** - [Sign up free](https://supabase.com)
3. **OpenAI API Key** - [Get one here](https://platform.openai.com/api-keys)

## Step-by-Step Setup

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Click "New Project"
3. Fill in:
   - **Name**: Memory Layer (or your choice)
   - **Database Password**: Choose a strong password (save it!)
   - **Region**: Choose closest to you
4. Wait for project to be created (~2 minutes)

### 2. Set Up Database Schema

1. In your Supabase project, go to **SQL Editor** (left sidebar)
2. Click **New Query**
3. Copy and paste the contents of `backend/src/db/migrations/001_initial_schema.sql`
4. Click **Run** (or press Cmd/Ctrl + Enter)
5. Verify tables were created by going to **Table Editor** - you should see:
   - `users`
   - `conversations`
   - `memories`

### 3. Get Supabase Credentials

1. In Supabase dashboard, go to **Settings** → **API**
2. Copy these values:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **service_role key** (under "Project API keys" - use the `service_role` key, NOT the `anon` key)

⚠️ **Important**: The `service_role` key has admin access. Keep it secret and never expose it in client-side code.

### 4. Backend Setup

```bash
cd backend
npm install

# Create .env file
# Copy the template below and fill in your values
```

Create `backend/.env`:
```env
PORT=3000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
OPENAI_API_KEY=sk-your_openai_key_here
```

```bash
# Build and start
npm run build
npm start

# Or for development with hot reload:
npm run dev
```

The backend will connect to Supabase on startup.

### 5. Chrome Extension Setup

```bash
cd extension
npm install
npm run build
```

**Load in Chrome:**
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Navigate to `extension/dist` folder and select it
5. The extension should now appear in your extensions list

**Update Backend URL (if needed):**
- If your backend is not on `localhost:3000`, edit `extension/src/content.ts`
- Change the `BACKEND_URL` constant to your backend URL

**Note:** You'll need to create icon files (16x16, 48x48, 128x128 PNG) in `extension/icons/` or the extension will show a default icon.

### 6. Dashboard Setup

```bash
cd dashboard
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Testing

1. **Backend**: Visit http://localhost:3000/health - should return `{"status":"ok"}`

2. **Extension**: 
   - Go to https://chat.openai.com
   - Click the Memory Layer extension icon
   - Grant permission when prompted
   - Start a conversation - it should be automatically captured

3. **Dashboard**: 
   - Open http://localhost:5173
   - You should see your memories appear as you chat

4. **Supabase Dashboard**:
   - Go to your Supabase project → **Table Editor**
   - Check the `memories` table - you should see entries appearing

## Troubleshooting

### Backend won't start
- Check `.env` file exists and has correct values
- Verify Supabase URL format: `https://xxxxx.supabase.co` (no trailing slash)
- Ensure service_role key is correct (not anon key)
- Check OpenAI API key is valid

### Extension not capturing messages
- Check browser console for errors (F12)
- Verify permission is granted in extension storage
- Check backend is running and accessible
- Verify backend URL in `content.ts` matches your backend
- ChatGPT UI may have changed - check selectors in `content.ts`

### No memories appearing
- Check backend logs for errors
- Verify OpenAI API key is valid and has credits
- Check Supabase dashboard → Table Editor → `memories` table
- Verify database schema was run correctly (check SQL Editor history)

### Semantic search not working
- Ensure the `match_memories` function was created (check SQL migration)
- Verify pgvector extension is enabled in Supabase
- Check that embeddings are being generated (look for `embedding` column in memories table)

### Supabase connection errors
- Verify your project is active (not paused)
- Check you're using the correct region
- Ensure service_role key hasn't been rotated
- Check Supabase status page if issues persist

## Environment Variables Reference

### Backend (.env)
```env
PORT=3000                                    # Backend server port
SUPABASE_URL=https://xxx.supabase.co        # Your Supabase project URL
SUPABASE_SERVICE_ROLE_KEY=eyJ...            # Service role key (admin access)
OPENAI_API_KEY=sk-...                       # OpenAI API key
```

### Extension
- Backend URL is hardcoded in `src/content.ts` (default: `http://localhost:3000`)
- Update if deploying backend to a different URL

## Next Steps

- Deploy backend to production (Vercel, Railway, etc.)
- Update extension with production backend URL
- Set up custom domain for Supabase (optional)
- Configure Row Level Security policies for multi-user support
- Set up monitoring and alerts

## Supabase Free Tier Limits

- **Database**: 500 MB storage
- **API Requests**: Unlimited (with rate limits)
- **Vector Operations**: Supported on all tiers
- **Bandwidth**: 5 GB/month

For production, consider upgrading to Pro tier for more storage and features.
