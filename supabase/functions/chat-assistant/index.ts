// Supabase Edge Function for AI chat assistant
// Simple AI assistant that sees page context

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import OpenAI from 'https://deno.land/x/openai@v4.20.1/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ChatRequest {
  userId: string;
  message: string;
  pageContext?: {
    url: string;
    title: string;
    text: string;
    selectedText?: string;
  };
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  mode?: 'ask' | 'do'; // Explicit mode override
}

interface ActionPlan {
  mode: 'ask' | 'do';
  intent: string;
  steps: string[];
  outputType?: 'sheet' | 'csv' | 'table' | 'text';
  requiresConfirmation: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userId, message, pageContext, conversationHistory = [] }: ChatRequest = await req.json()

    if (!userId || !message) {
      return new Response(
        JSON.stringify({ error: 'userId and message required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!
    const openai = new OpenAI({ apiKey: openaiApiKey })

    // Build context from page only - format naturally without labels
    let contextText = ''

    if (pageContext) {
      contextText = `The user is currently viewing: ${pageContext.title} (${pageContext.url})

${pageContext.selectedText ? `They have selected this text: "${pageContext.selectedText}"\n\n` : ''}Page content:
${pageContext.text.substring(0, 5000)}`
    }

    // Detect if this is a DO mode request (action-oriented)
    const isActionRequest = detectActionMode(message, conversationHistory)
    
    const systemPrompt = isActionRequest 
      ? `You are an AI assistant that can perform tasks on the user's behalf in their browser.

When the user requests an action (search, extract, create, navigate, etc.), you must return a JSON object with this exact structure:

{
  "mode": "do",
  "intent": "Clear description of what the user wants to accomplish",
  "steps": ["Step 1 description", "Step 2 description", "Step 3 description"],
  "outputType": "sheet" | "csv" | "table" | "text",
  "requiresConfirmation": true
}

Rules:
- "intent" should be a clear, one-sentence description
- "steps" should be an array of 3-10 clear, actionable steps
- "outputType" should be "sheet" for Google Sheets, "csv" for CSV files, "table" for table preview, "text" for plain text
- "requiresConfirmation" should be true for any action that modifies data, creates files, or navigates away
- Steps should be specific and executable (e.g., "Search Google for 'top AI tools for email marketing'", "Extract tool name, pricing, and URL from each result")
- Return ONLY valid JSON, no additional text before or after`
      : `You are a helpful AI assistant that can see the web page the user is currently viewing.

When responding:
- Answer directly and naturally, as if you're having a conversation
- DO NOT include labels like "URL Information:", "Page Content Overview:", "User Question:", or "Response:" in your answer
- DO NOT repeat or structure the question back to the user
- Simply provide a helpful, direct answer based on what you see on the page
- Reference specific information from the page when relevant
- Use Markdown formatting (bold, headings, lists, code blocks) to make your response clear and readable

Be concise, helpful, and context-aware.`

    const userPrompt = contextText ? `${contextText}

${message}` : `${message}

${pageContext ? `(Note: I'm viewing ${pageContext.title} but couldn't access the full page content.)` : '(No page context available.)'}`

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.slice(-6), // Last 6 messages for context
        { role: 'user', content: userPrompt }
      ],
      temperature: isActionRequest ? 0.3 : 0.7, // Lower temperature for more structured plans
      max_tokens: isActionRequest ? 1500 : 1000,
      response_format: isActionRequest ? { type: 'json_object' } : undefined
    })

    const response = completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response.'

    // Parse action plan if in DO mode
    if (isActionRequest) {
      try {
        // Try to extract JSON from response (might have markdown code blocks)
        let jsonStr = response.trim();
        // Remove markdown code blocks if present
        jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
        const plan: ActionPlan = JSON.parse(jsonStr);
        
        // Validate plan structure
        if (plan.mode === 'do' && plan.intent && Array.isArray(plan.steps)) {
          return new Response(
            JSON.stringify({ 
              mode: 'do',
              plan,
              response: `I'll help you ${plan.intent}. Here's my plan:\n\n${plan.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nWould you like me to proceed?`,
              hasPageContext: !!pageContext
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      } catch (e) {
        // If JSON parsing fails, treat as regular response
        console.error('Failed to parse action plan:', e, 'Response was:', response.substring(0, 200))
      }
    }

    return new Response(
      JSON.stringify({ 
        mode: 'ask',
        response,
        hasPageContext: !!pageContext
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in chat-assistant:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// Detect if user request is action-oriented (DO mode)
function detectActionMode(message: string, history: Array<{ role: string; content: string }>): boolean {
  const actionKeywords = [
    'find', 'search', 'collect', 'extract', 'gather', 'create', 'make', 'build',
    'put', 'add', 'fill', 'complete', 'automate', 'navigate', 'open', 'click',
    'generate', 'compile', 'organize', 'list', 'get', 'fetch', 'download',
    'save', 'export', 'import', 'update', 'modify', 'change', 'set'
  ]
  
  const actionPhrases = [
    'put this into', 'create a sheet', 'make a table', 'extract data',
    'search for', 'find all', 'collect information', 'gather data',
    'automate this', 'do this', 'perform', 'execute', 'run'
  ]
  
  const lowerMessage = message.toLowerCase()
  
  // Check for explicit action phrases
  if (actionPhrases.some(phrase => lowerMessage.includes(phrase))) {
    return true
  }
  
  // Check for action keywords at start of sentence
  const firstWords = lowerMessage.split(/\s+/).slice(0, 3)
  if (actionKeywords.some(keyword => firstWords.includes(keyword))) {
    return true
  }
  
  // Check conversation history for context
  if (history.length > 0) {
    const lastMessage = history[history.length - 1]?.content?.toLowerCase() || ''
    if (actionPhrases.some(phrase => lastMessage.includes(phrase))) {
      return true
    }
  }
  
  return false
}

