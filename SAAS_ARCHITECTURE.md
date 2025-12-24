# SaaS Architecture Plan

## Current Problem
Users have to configure Supabase credentials manually - bad UX!

## Solution
Create a backend API that handles all Supabase operations. Users just sign up/login.

## Architecture

```
Extension → Backend API → Supabase
```

### Backend API Responsibilities
- User authentication (signup/login)
- All Supabase operations (memories, threads, search)
- OpenAI API calls
- Data isolation per user

### Extension Responsibilities
- User signup/login UI
- Send requests to backend API
- Display data from backend

## Implementation

### Option 1: Simple Backend (Recommended for MVP)
- Node.js/Express backend
- Deploy to Vercel/Railway/Render
- Handles auth + all Supabase operations
- Extension just needs backend URL (can be hardcoded)

### Option 2: Keep Supabase Edge Functions
- Add auth layer on top
- Use Supabase Auth for user management
- Edge Functions handle everything
- Extension uses Supabase Auth

## Next Steps
1. Create backend API with auth
2. Update extension to use backend
3. Remove Supabase config from extension
4. Deploy backend


