# Memory Layer

A lightweight "long-term memory" system that automatically extracts, summarizes, and recalls meaningful information from AI conversations across time and chats.

## Problem

Heavy AI chat users (ChatGPT, Claude, etc.) lose important context across long and multiple conversations. Chats become slow, fragmented, and users forget what they previously said or decided.

## Solution

Memory Layer provides:
- **Automatic extraction** of key ideas, decisions, definitions, and questions from conversations
- **Semantic search** to find relevant past context
- **Threads (Projects/Topics)** as persistent containers for ongoing ideas across multiple chats
- **Automatic thread assignment** using semantic similarity
- **Privacy-first design** with explicit user permission and no screen recording

## Architecture

### Components

1. **Chrome Extension** (`extension/`)
   - Content script monitors ChatGPT conversations
   - Extracts messages from DOM in real-time
   - Groups messages into conversation chunks
   - Sends conversation chunks to backend
   - Side panel UI for viewing relevant context and managing threads
   - Thread switching and manual assignment

2. **Backend API** (Supabase Edge Functions)
   - Supabase Edge Functions (Deno-based serverless)
   - PostgreSQL with pgvector for semantic search
   - OpenAI API for summarization and embeddings
   - Thread assignment using semantic similarity
   - RESTful API for conversations, memories, and threads

3. **Web Dashboard** (`dashboard/`)
   - React + TypeScript + Vite
   - View memories by topic
   - Natural language search
   - Settings and data management

## Data Flow

```
┌─────────────────┐
│  ChatGPT Page   │
│  (chat.openai)  │
└────────┬────────┘
         │
         │ DOM Monitoring
         ▼
┌─────────────────┐
│ Content Script  │
│  (extension)    │
└────────┬────────┘
         │
         │ POST /api/conversations
         ▼
┌─────────────────┐
│  Backend API    │
│  (Node.js)      │
└────────┬────────┘
         │
         ├─► Summarization (OpenAI)
         ├─► Embedding Generation
         └─► Storage (PostgreSQL + pgvector)
                │
                ▼
         ┌──────────────┐
         │  Memories    │
         │  Database    │
         └──────────────┘
                │
                │ Semantic Search
                ▼
         ┌──────────────┐
         │   Dashboard  │
         │   (React)    │
         └──────────────┘
```

## Setup

### Prerequisites

- Node.js 18+
- Supabase account (free tier works)
- OpenAI API key
- Chrome browser

### 1. Supabase Setup

1. Create a free account at [supabase.com](https://supabase.com)
2. Create a new project
3. Go to SQL Editor and run the migrations in order:
   - `backend/src/db/migrations/001_initial_schema.sql` (base schema)
   - `backend/src/db/migrations/002_add_threads.sql` (threads support)
4. Get your credentials from Settings → API:
   - Project URL
   - Anon Key (public, safe for client-side)
   - Service Role Key (keep this secret! Only for Edge Functions)

### 2. Supabase Edge Functions Setup

The backend runs as Supabase Edge Functions. Set up environment secrets:

1. Go to Supabase Dashboard → Edge Functions → Secrets
2. Set the following secrets:
   - `SUPABASE_URL`: Your project URL (e.g., `https://xxxxx.supabase.co`)
   - `SUPABASE_SERVICE_ROLE_KEY`: Your service role key
   - `OPENAI_API_KEY`: Your OpenAI API key

3. Deploy Edge Functions:

```bash
# Install Supabase CLI (if not already installed)
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy functions
supabase functions deploy process-conversation
supabase functions deploy search-memories
supabase functions deploy threads
supabase functions deploy resume-thread
```

See `SUPABASE_EDGE_FUNCTIONS.md` for detailed instructions.

### 3. Chrome Extension Setup

```bash
cd extension
npm install
npm run build

# Load extension in Chrome:
# 1. Open chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select the extension/dist directory
```

### 4. Dashboard Setup

```bash
cd dashboard
npm install
npm run dev

# Open http://localhost:5173
```

## Usage

### Chrome Extension

1. **Configure Supabase**: Open the side panel and enter your Supabase URL and Anon Key
2. **Grant Permission**: Click "Enable Memory Layer" to allow data capture
3. **Automatic Capture**: The extension automatically monitors conversations on chat.openai.com
4. **Thread Management**:
   - **Active Thread**: The side panel shows your current active thread
   - **Auto-Assignment**: New memories are automatically assigned to threads based on semantic similarity
   - **Switch Thread**: Click "Switch" to change the active thread
   - **Create Thread**: Create new threads manually for specific projects
   - **Rename Thread**: Edit thread titles and descriptions
5. **View Context**: Open the side panel to see relevant past context
6. **Resume Thread**: Click "Resume Thread Context" to inject thread summary, key memories, and open questions into your current conversation

### Dashboard

1. **View Memories**: Browse all extracted memories
2. **Topics**: View memories organized by topic
3. **Search**: Use natural language to find relevant memories
4. **Settings**: Export data or configure retention

## Threads (Projects/Topics)

**Threads** are persistent containers that represent ongoing ideas, projects, or lines of thinking across multiple chats. Unlike ephemeral chat sessions, threads provide stable organization for your memories.

### How Threads Work

1. **Automatic Assignment**: When new memories are created, the system:
   - Generates an embedding for the memory
   - Searches for existing threads with similar embeddings (similarity threshold: 0.75)
   - If a similar thread is found → assigns memory to that thread
   - Otherwise → creates a new thread automatically

2. **Thread Properties**:
   - **Title**: Human-readable name (auto-generated from topic or user-defined)
   - **Description**: Auto-updated summary of thread contents
   - **Embedding**: Vector representation for semantic matching
   - **Memory Count**: Number of memories in the thread

3. **User Control**:
   - **Switch Thread**: Manually change which thread new memories are assigned to
   - **Create Thread**: Create new threads for specific projects
   - **Rename Thread**: Edit thread titles and descriptions
   - **Resume Thread**: Get context packet with thread summary, key memories, and open questions

### Why Threads?

- **Persistent Context**: Threads survive across chat sessions
- **Semantic Grouping**: Related memories are automatically grouped
- **Resume Capability**: Easily pick up where you left off on a project
- **Organization**: Better than flat topic tags for complex, ongoing work

## API Endpoints

### Supabase Edge Functions

All endpoints are deployed as Supabase Edge Functions:

#### Conversations

- `POST /functions/v1/process-conversation` - Process conversation chunk and assign to thread
  ```json
  {
    "userId": "user_123",
    "chunk": {
      "messages": [...],
      "threadId": "conversation_thread_456",
      "timestamp": 1234567890
    },
    "activeThreadId": 42  // Optional: explicitly assign to thread
  }
  ```
  Returns: `{ success: true, memoriesCreated: 5, thread: { id: 42, title: "...", description: "..." } }`

#### Memories

- `POST /functions/v1/search-memories` - Semantic search
  ```json
  {
    "userId": "user_123",
    "query": "What did we decide about the API design?",
    "limit": 5
  }
  ```

#### Threads

- `GET /functions/v1/threads?userId=...` - List all threads for user
- `POST /functions/v1/threads` - Create or update thread
  ```json
  {
    "id": 42,  // Optional: if provided, updates existing thread
    "title": "AI Tools Research",
    "description": "Researching best AI tools for distribution"
  }
  ```
- `DELETE /functions/v1/threads?userId=...&threadId=42` - Delete thread

#### Resume Thread

- `POST /functions/v1/resume-thread` - Get context packet for resuming a thread
  ```json
  {
    "userId": "user_123",
    "threadId": 42
  }
  ```
  Returns: `{ context: { thread: {...}, summary: "...", keyMemories: [...], openQuestions: [...] } }`

## Privacy & Security

- **Explicit Permission**: Users must explicitly grant permission before any data is sent
- **No Screen Recording**: Only text content is extracted from DOM
- **No Microphone**: No audio capture
- **No Always-On Monitoring**: Only active when user grants permission
- **User Control**: Users can export or delete their data at any time

## Development

### Extension Development

```bash
cd extension
npm run dev  # Watch mode for development
```

### Backend Development

```bash
cd backend
npm run dev  # Uses ts-node-dev for hot reload
```

### Dashboard Development

```bash
cd dashboard
npm run dev  # Vite dev server
```

## Project Structure

```
memory-layer/
├── extension/           # Chrome extension
│   ├── src/
│   │   ├── content.ts   # DOM monitoring
│   │   ├── background.ts # Service worker
│   │   ├── sidepanel.tsx # React UI
│   │   └── sidepanel.css
│   ├── manifest.json
│   └── package.json
│
├── backend/             # Node.js API
│   ├── src/
│   │   ├── index.ts     # Express server
│   │   ├── db/          # Database setup
│   │   ├── routes/      # API routes
│   │   └── services/    # Business logic
│   └── package.json
│
├── dashboard/           # React dashboard
│   ├── src/
│   │   ├── App.tsx
│   │   └── components/
│   └── package.json
│
└── README.md
```

## Future Enhancements

- Support for Claude and other AI chat platforms
- Thread merging suggestions (when similar threads detected)
- Thread templates and presets
- Memory relationships and graphs within threads
- Export threads to various formats (Markdown, CSV)
- Thread sharing and collaboration
- API rate limiting and authentication
- Multi-user support with proper auth

## License

MIT

## Contributing

This is a working prototype. Contributions welcome!

