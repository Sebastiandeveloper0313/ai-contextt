# Starting the Backend

## Quick Start

```bash
cd backend
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

## What to Expect

When the backend starts successfully, you should see:
```
Memory Layer backend running on port 3000
Database connection successful
Supabase client initialized
```

## Test the Backend

Open your browser and go to:
http://localhost:3000/health

You should see: `{"status":"ok"}`

## Troubleshooting

**"Missing Supabase environment variables"**
- Check that `.env` file exists in `backend/` directory
- Verify all three variables are set: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY

**"Tables do not exist yet"**
- Run the SQL migration in Supabase SQL Editor
- See: `backend/src/db/migrations/001_initial_schema.sql`

**Connection errors**
- Verify your SUPABASE_URL is correct (no trailing slash)
- Check that service_role key is correct (not anon key)
- Ensure your Supabase project is active



