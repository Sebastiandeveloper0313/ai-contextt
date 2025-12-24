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

    const systemPrompt = `You are a helpful AI assistant that can see the web page the user is currently viewing.

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
      temperature: 0.7,
      max_tokens: 1000,
    })

    const response = completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response.'

    return new Response(
      JSON.stringify({ 
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

