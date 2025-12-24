# Threads Feature - Testing Guide

## Prerequisites

Before testing, make sure you've completed these setup steps:

### 1. Run Database Migration

1. Go to your Supabase Dashboard → SQL Editor
2. Run the migration: `backend/src/db/migrations/002_add_threads.sql`
3. Verify it completed successfully (should see "Success. No rows returned")

### 2. Deploy Edge Functions

You need to deploy/update the Edge Functions:

```bash
# Make sure you're in the project root
cd supabase/functions

# Deploy all functions
supabase functions deploy process-conversation
supabase functions deploy search-memories
supabase functions deploy threads
supabase functions deploy resume-thread
```

**Note**: If you haven't set up Supabase CLI yet:
```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

### 3. Rebuild Extension

```bash
cd extension
npm run build
```

Then reload the extension in Chrome:
1. Go to `chrome://extensions/`
2. Find "Memory Layer"
3. Click the reload icon (🔄)

## Testing Steps

### Test 1: Automatic Thread Creation

1. **Open ChatGPT** (chat.openai.com or chatgpt.com)
2. **Open Memory Layer side panel** (click the extension icon)
3. **Start a conversation** in ChatGPT about a specific topic, e.g.:
   - "What are the best AI tools for content creation?"
   - "How do I set up a Node.js backend?"
   - "Explain React hooks"

4. **Wait 5-10 seconds** for the extension to capture and send the conversation
5. **Check the side panel** - you should see:
   - An "Active Thread" section
   - A thread title (auto-generated from the topic)
   - Thread description
   - Memory count

6. **Check console** (F12 → Console tab) - you should see:
   ```
   [Memory Layer] ✅ Successfully sent conversation chunk!
   [Memory Layer] 🧵 Active thread updated: [thread title]
   ```

### Test 2: Thread Switching

1. **Create a new conversation** in ChatGPT about a different topic
2. **In the side panel**, click "Switch" button
3. **Select a different thread** from the list (or create a new one)
4. **Continue chatting** - new memories should be assigned to the selected thread

### Test 3: Manual Thread Creation

1. **In the side panel**, click "Switch" → "+ New Thread"
2. **Fill in**:
   - Title: "My Project"
   - Description: "Testing manual thread creation"
3. **Click "Create"**
4. **Verify** the new thread is now active
5. **Chat in ChatGPT** - memories should go to this thread

### Test 4: Resume Thread Context

1. **Have an active thread** with some memories
2. **Start a new ChatGPT conversation** (or clear the current one)
3. **In the side panel**, click "Resume Thread Context"
4. **Check ChatGPT** - you should see context injected:
   - Thread title and description
   - Key memories
   - Open questions

### Test 5: Thread Renaming

1. **In the side panel**, find your active thread
2. **Click "Rename"**
3. **Edit** the title and/or description
4. **Click "Save"**
5. **Verify** the changes appear in the side panel

### Test 6: Semantic Thread Assignment

1. **Create a thread** about "AI Tools"
2. **Switch to a different thread**
3. **Chat about AI tools again** (similar topic)
4. **Check console** - the system should detect similarity and either:
   - Assign to the existing "AI Tools" thread (if similarity > 0.75)
   - Create a new thread (if similarity is lower)

## Troubleshooting

### No Active Thread Showing

- **Check console** for errors
- **Verify** you've run the database migration
- **Check** that Edge Functions are deployed
- **Reload** the extension

### Threads Not Creating

- **Check Supabase logs**: Dashboard → Edge Functions → Logs
- **Verify** `OPENAI_API_KEY` is set in Edge Function secrets
- **Check** that `process-conversation` function is deployed

### "Resume Thread" Not Working

- **Verify** you have an active thread selected
- **Check** that the thread has memories (memory count > 0)
- **Look for errors** in console

### Thread Switching Not Working

- **Reload** the extension
- **Check** that `threads` Edge Function is deployed
- **Verify** Supabase URL and Anon Key are correct in extension config

## Expected Behavior

✅ **Working correctly when:**
- Active thread appears in side panel
- New memories are assigned to threads automatically
- You can switch between threads
- Thread descriptions update over time
- Resume context injects thread information

❌ **Not working if:**
- No thread appears after chatting
- Console shows errors
- Memories aren't being created
- Thread switching does nothing

## Database Verification

You can verify threads are being created in Supabase:

1. Go to Supabase Dashboard → Table Editor
2. Check the `threads` table - should see rows with:
   - `id` (BIGINT)
   - `user_id` (VARCHAR)
   - `title` (VARCHAR)
   - `description` (TEXT)
   - `created_at`, `updated_at` (TIMESTAMP)

3. Check the `memories` table - `thread_id` column should reference `threads.id`

## Next Steps

Once basic functionality works:
- Test with multiple conversations
- Verify semantic similarity is grouping related memories
- Try resuming threads in new chat sessions
- Check that thread descriptions update as you add more memories

