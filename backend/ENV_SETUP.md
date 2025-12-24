# Environment Variables Setup

Create a `.env` file in the `backend/` directory with the following variables:

```env
PORT=3000
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
OPENAI_API_KEY=sk-...
```

## How to Get These Values

### SUPABASE_URL
1. Go to your Supabase project dashboard
2. Navigate to **Settings** → **API**
3. Copy the **Project URL** (looks like `https://xxxxx.supabase.co`)

### SUPABASE_SERVICE_ROLE_KEY
1. In the same **Settings** → **API** page
2. Under **Project API keys**, find the **service_role** key
3. Click the eye icon to reveal it, then copy
4. ⚠️ **Keep this secret!** This key has admin access to your database

### OPENAI_API_KEY
1. Go to [platform.openai.com](https://platform.openai.com)
2. Navigate to **API keys**
3. Create a new secret key or use an existing one
4. Copy the key (starts with `sk-`)

## Security Notes

- Never commit `.env` to version control (it's in `.gitignore`)
- The `service_role` key bypasses Row Level Security - keep it secure
- For production, use environment variables from your hosting platform
- Consider using Supabase's `anon` key for client-side operations (if you add client-side features)



