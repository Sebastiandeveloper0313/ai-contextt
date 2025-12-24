# Agentic Execution System

## Overview

The Memory Layer extension now includes an **agentic execution system** that allows the AI to perform real tasks on behalf of the user based on natural language instructions.

## Features

### Two Modes

1. **ASK Mode** (default): The AI answers questions and explains things without performing actions
2. **DO Mode**: The AI generates execution plans and performs tasks when the user requests actions

### Automatic Mode Detection

The system automatically detects DO mode when users use action-oriented language:
- Imperative verbs: "find", "search", "collect", "extract", "create", "put", "automate"
- Action phrases: "put this into a sheet", "search for", "extract data", "create a table"

### Execution Pipeline

For every DO-mode request:

1. **Intent Interpretation**: AI parses the user's request into a clear goal
2. **Plan Generation**: AI creates a step-by-step execution plan
3. **User Confirmation**: Plan is displayed for user review and approval
4. **Visible Execution**: Actions are performed visibly in the browser
5. **Output Delivery**: Results are delivered as CSV, Google Sheet, or table preview

## Supported Task Types

### 1. Information Gathering
- Search the web for specified topics
- Open and read multiple pages
- Extract structured data (lists, tables, attributes)

### 2. Structured Output Creation
- Create CSV files with extracted data
- Populate Google Sheets (via CSV import)
- Generate table previews

### 3. Navigation & UI Assistance
- Navigate to URLs
- Search Google
- Scroll pages
- Extract content from pages

## Safety & Trust

- ✅ **User confirmation required** before execution
- ✅ **Visible execution** - all actions happen in the browser where you can see them
- ✅ **Stop button** - cancel execution at any time
- ✅ **No irreversible actions** without explicit confirmation
- ✅ **No background execution** - everything is transparent

## Usage Example

### Example 1: Search and Extract

**User:** "Search for the top 10 AI tools for email marketing and put them into a CSV"

**AI Response (DO Mode):**
```
I'll help you search for the top 10 AI tools for email marketing and create a CSV. Here's my plan:

1. Search Google for "top AI tools for email marketing"
2. Extract tool names, descriptions, and URLs from search results
3. Create a CSV file with the extracted data
4. Download the CSV file

Would you like me to proceed?
```

**After user confirms:**
- AI navigates to Google search
- Extracts data from results
- Creates and downloads CSV file
- Shows completion status

### Example 2: Extract Current Page Data

**User:** "Extract all the links from this page and create a table"

**AI Response (DO Mode):**
```
I'll extract all links from the current page and create a table. Here's my plan:

1. Extract all anchor tags from the current page
2. Collect link text and URLs
3. Create a table preview with the data
4. Optionally export as CSV

Would you like me to proceed?
```

## Technical Implementation

### Components

1. **chat-assistant Edge Function** (`supabase/functions/chat-assistant/index.ts`)
   - Detects ASK vs DO mode
   - Generates execution plans
   - Returns structured plan JSON

2. **Execution Engine** (`extension/src/execution-engine.ts`)
   - Performs browser actions (navigate, search, extract, click, type, scroll)
   - Handles output creation (CSV, Google Sheets)
   - Manages execution state and progress

3. **UI Components** (`extension/src/sidepanel.tsx`)
   - Plan preview and confirmation
   - Live execution status
   - Stop functionality
   - Progress indicators

### Browser Actions Supported

- `navigate`: Navigate to a URL
- `search`: Search Google for a query
- `extract`: Extract data using CSS selectors
- `click`: Click elements
- `type`: Type into input fields
- `scroll`: Scroll the page
- `wait`: Wait for a specified time
- `create_output`: Create CSV, Google Sheet, or table

## Deployment

### 1. Deploy Chat Assistant Function

```bash
cd supabase
supabase functions deploy chat-assistant
```

### 2. Rebuild Extension

```bash
cd extension
npm run build
```

### 3. Reload Extension

1. Go to `chrome://extensions/`
2. Find "Memory Layer"
3. Click the reload icon (🔄)

## Limitations & Future Enhancements

### Current Limitations

- Step type detection is heuristic-based (could be improved with better parsing)
- Google Sheets creation uses CSV import (not direct API)
- Extraction selectors are basic (could be enhanced with AI-powered element detection)
- No cross-tab coordination yet

### Future Enhancements

- Direct Google Sheets API integration
- AI-powered element detection for better extraction
- Multi-tab task coordination
- Reusable action templates
- Better error recovery
- Visual highlighting of elements being interacted with

## Safety Model

The system is designed with safety in mind:

1. **No Hidden Actions**: All actions are visible in the browser
2. **User Control**: Every plan requires explicit approval
3. **Reversible**: Most actions can be undone or stopped
4. **No Sensitive Data**: Never accesses passwords, private messages, or financial data
5. **No Background Execution**: Everything happens with user awareness

## Troubleshooting

### Plan Not Showing

- Check browser console for errors
- Verify chat-assistant function is deployed
- Check that the response includes `mode: 'do'` and `plan` object

### Execution Failing

- Check that the page is accessible (not chrome:// or extension://)
- Verify selectors are correct for extraction steps
- Check browser console for detailed error messages

### CSV Not Downloading

- Verify "downloads" permission is in manifest.json
- Check browser download settings
- Look for errors in background script console

## Example Workflows

### Workflow 1: Research and Compile

1. User: "Find the top 5 project management tools and their pricing"
2. AI generates plan: Search → Extract → Create CSV
3. User approves
4. AI executes: Searches Google, extracts data, creates CSV
5. User gets downloadable CSV file

### Workflow 2: Page Analysis

1. User: "Extract all the product names and prices from this page"
2. AI generates plan: Extract using selectors → Create table
3. User approves
4. AI executes: Extracts data, shows table preview
5. User can export to CSV if needed

## Next Steps

To use the agentic execution system:

1. **Deploy the updated function** (see Deployment section)
2. **Reload the extension**
3. **Try an action request** like:
   - "Search for AI tools and create a CSV"
   - "Extract all links from this page"
   - "Find information about X and put it in a table"

The system will automatically detect DO mode, generate a plan, and wait for your approval before executing.

