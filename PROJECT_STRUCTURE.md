# Project Structure

```
memory-layer/
│
├── extension/              # Chrome Extension
│   ├── src/
│   │   ├── content.ts      # DOM monitoring & message extraction
│   │   ├── background.ts  # Service worker for extension logic
│   │   ├── sidepanel.tsx  # React UI component
│   │   ├── sidepanel.css  # Styles
│   │   └── sidepanel.html # HTML template
│   ├── icons/             # Extension icons (16x16, 48x48, 128x128)
│   ├── manifest.json      # Extension manifest
│   ├── package.json
│   ├── tsconfig.json
│   └── webpack.config.js  # Build configuration
│
├── backend/               # Node.js Backend API
│   ├── src/
│   │   ├── index.ts       # Express server entry point
│   │   ├── db/
│   │   │   ├── init.ts    # Database initialization
│   │   │   └── migrations/
│   │   │       └── 001_initial_schema.sql
│   │   ├── routes/
│   │   │   ├── conversations.ts  # Conversation ingestion
│   │   │   └── memories.ts       # Memory search & retrieval
│   │   └── services/
│   │       └── summarizer.ts     # OpenAI integration
│   ├── .env.example       # Environment variables template
│   ├── package.json
│   └── tsconfig.json
│
├── dashboard/             # React Web Dashboard
│   ├── src/
│   │   ├── App.tsx        # Main app component
│   │   ├── App.css       # Global styles
│   │   ├── main.tsx      # React entry point
│   │   └── components/
│   │       ├── MemoriesView.tsx  # List all memories
│   │       ├── TopicsView.tsx    # View by topic
│   │       ├── SearchView.tsx    # Semantic search
│   │       └── SettingsView.tsx  # User settings
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts    # Vite build config
│
├── README.md              # Main documentation
├── SETUP.md               # Setup instructions
├── CONTRIBUTING.md        # Contribution guidelines
├── LICENSE                # MIT License
└── .gitignore            # Git ignore rules
```

## Key Files

### Extension
- **content.ts**: Monitors ChatGPT DOM, extracts messages, sends to backend
- **background.ts**: Handles extension lifecycle and message routing
- **sidepanel.tsx**: React UI for viewing relevant context

### Backend
- **index.ts**: Express server setup and route registration
- **init.ts**: Supabase client initialization
- **summarizer.ts**: OpenAI API integration for summarization and embeddings
- **conversations.ts**: Endpoint to receive and process conversation chunks
- **memories.ts**: Endpoints for semantic search and memory retrieval
- **migrations/001_initial_schema.sql**: Database schema (run in Supabase SQL Editor)

### Dashboard
- **App.tsx**: Main routing and layout
- **MemoriesView**: Browse all memories with pagination
- **TopicsView**: Organize memories by topic
- **SearchView**: Natural language semantic search
- **SettingsView**: Data export and retention settings

## Data Flow

1. **Capture**: Extension monitors ChatGPT DOM → extracts messages
2. **Send**: Content script batches messages → POST to `/api/conversations`
3. **Process**: Backend receives chunk → OpenAI summarization → extract memories
4. **Store**: Memories saved to PostgreSQL with vector embeddings
5. **Retrieve**: Dashboard/extension queries → semantic search → relevant memories

## Technology Stack

- **Extension**: TypeScript, React, Webpack, Chrome Extension API
- **Backend**: Node.js, Express, TypeScript, Supabase (PostgreSQL + pgvector), OpenAI API
- **Dashboard**: React, TypeScript, Vite, React Router

