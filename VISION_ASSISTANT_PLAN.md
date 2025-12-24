# Vision Assistant - Product Pivot Plan

## Vision
Transform Memory Layer into a **universal AI assistant** that:
- **Sees your screen** at all times (with explicit permission)
- **Understands context** from what you're viewing
- **Provides a persistent chat interface** (floating overlay)
- **Remembers everything** across all applications and websites
- **Answers questions** about what's on screen using full context

## Technical Architecture

### 1. Screen Capture
- **Chrome API**: `chrome.desktopCapture` (requires user permission)
- **Capture Method**: 
  - Option A: Full screen capture (high privacy, high resource)
  - Option B: Active window only (better privacy, lower resource)
  - Option C: Selected region (best privacy, user control)
- **Frequency**: 
  - On-demand (when user asks question)
  - Periodic snapshots (every 5-10 seconds)
  - Continuous (high resource usage)

### 2. Vision Processing
- **Model**: GPT-4 Vision API or Claude 3.5 Sonnet (vision)
- **Processing**:
  - Screenshot → Base64 image
  - Send to vision model with prompt
  - Extract text, UI elements, context
  - Store in memory system

### 3. Persistent UI Overlay
- **Technology**: Chrome Extension with overlay injection
- **UI Framework**: React (same as current side panel)
- **Positioning**: 
  - Floating window (always on top)
  - Dockable to edges
  - Minimizable
- **Features**:
  - Chat interface (like image shows)
  - Context awareness indicator
  - Quick actions
  - Memory search

### 4. Context Understanding
- **Current Page Analysis**: DOM content (already have this)
- **Screen Content**: OCR + Vision model analysis
- **Application Context**: Detect active app/window
- **Memory Integration**: Link screen context to threads

## Implementation Phases

### Phase 1: Enhanced Page Context (Week 1-2)
**Goal**: Make current system understand full page context, not just ChatGPT

**Changes**:
- Extend content script to work on ALL websites
- Extract page content (text, headings, links, images)
- Create page context summaries
- Store in memory system

**Deliverable**: Extension that understands any webpage

### Phase 2: Floating Chat UI (Week 2-3)
**Goal**: Add persistent chat interface overlay

**Changes**:
- Create overlay component (React)
- Inject into all pages (or as separate window)
- Chat interface with message history
- Connect to memory system

**Deliverable**: Floating chat UI that works everywhere

### Phase 3: Screen Capture (Week 3-4)
**Goal**: Add screen capture capability

**Changes**:
- Add `desktopCapture` permission
- Implement screen capture API
- Send screenshots to vision model
- Integrate with chat interface

**Deliverable**: Can see and understand screen content

### Phase 4: Full Integration (Week 4-5)
**Goal**: Complete vision assistant

**Changes**:
- Combine page context + screen capture
- Smart context switching
- Memory linking across sessions
- Performance optimization

**Deliverable**: Full vision assistant product

## Technical Requirements

### New Permissions Needed
```json
{
  "permissions": [
    "desktopCapture",  // Screen capture
    "tabs",            // All tabs access
    "activeTab",       // Current tab
    "storage",
    "sidePanel"
  ],
  "host_permissions": [
    "<all_urls>"       // Work on all websites
  ]
}
```

### New Dependencies
- Vision API client (OpenAI or Anthropic)
- Image processing (canvas API for screenshots)
- Overlay injection library

### Backend Changes
- New Edge Function: `analyze-screenshot`
- Vision model integration
- Enhanced memory storage (with screenshots/context)

## Privacy & Security Considerations

### ⚠️ Critical Privacy Concerns
1. **Screen Capture**: Very sensitive permission
2. **Always-On Monitoring**: Privacy implications
3. **Data Storage**: Screenshots contain sensitive info
4. **User Control**: Must be explicit opt-in

### Privacy Safeguards
- **Explicit Permission**: Multi-step permission flow
- **User Control**: 
  - Pause/resume capture
  - Clear history
  - Selective capture (region/window)
- **Data Handling**:
  - No screenshot storage (only analysis)
  - Encrypted transmission
  - User can delete all data
- **Transparency**: Clear indicators when capturing

## User Experience Flow

1. **Installation**: 
   - User installs extension
   - Permission prompts (screen capture, all sites)
   - Initial setup wizard

2. **Daily Use**:
   - Extension runs in background
   - Floating chat button appears
   - User clicks → chat opens
   - User asks: "What's on my screen?"
   - AI analyzes current screen + context
   - Provides answer with memory context

3. **Context Awareness**:
   - Detects page changes
   - Updates context automatically
   - Links to relevant memories
   - Suggests related threads

## Competitive Analysis

Similar products exist:
- **Cognito**: AI memory assistant for web
- **Aii**: AI assistant with page context
- **Context Engine**: Tab-aware AI assistant

**Our Differentiation**:
- Full screen capture (not just web)
- Persistent memory across all apps
- Thread-based organization
- Open source / self-hostable

## Cost Considerations

### API Costs (Estimated)
- **GPT-4 Vision**: ~$0.01-0.03 per screenshot
- **If capturing every 10 seconds**: ~$260-780/month (8 hours/day)
- **On-demand only**: Much lower (~$10-50/month)

### Optimization Strategies
- Capture only when chat is open
- Thumbnail analysis (lower resolution)
- Cache analysis results
- Smart capture triggers

## Next Steps

### Immediate (If proceeding)
1. **Decision**: Full pivot or add-on feature?
2. **Prototype**: Build Phase 1 (enhanced page context)
3. **User Testing**: Validate concept
4. **Iterate**: Based on feedback

### Questions to Answer
- [ ] Is this a complete pivot or an additional feature?
- [ ] What's the primary use case? (web browsing, coding, research?)
- [ ] How often should we capture? (on-demand vs continuous)
- [ ] What's the privacy model? (local processing vs cloud)
- [ ] What's the business model? (free, paid, freemium?)

## Recommendation

**Start with Phase 1** (Enhanced Page Context):
- Extends current system naturally
- Lower privacy concerns
- Validates user interest
- Can add screen capture later if needed

This gives you:
- Universal web assistant (not just ChatGPT)
- Floating chat UI
- Full page context understanding
- Memory system integration

Then evaluate if screen capture is needed based on user feedback.

