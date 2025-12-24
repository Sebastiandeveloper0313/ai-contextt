// Supabase Edge Function for AI chat assistant
// Handles chat requests with page context and memory integration

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!
    const openai = new OpenAI({ apiKey: openaiApiKey })

    // Get relevant memories
    let relevantMemories: any[] = []
    try {
      // Generate embedding for user message
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: message,
      })
      const queryEmbedding = embeddingResponse.data[0].embedding

      // Search memories
      const { data: memories } = await supabase.rpc('match_memories', {
        query_embedding: `[${queryEmbedding.join(',')}]`,
        user_id_filter: userId,
        match_threshold: 0.6,
        match_count: 5
      })

      relevantMemories = memories || []
    } catch (error) {
      console.error('Error searching memories:', error)
    }

    // Build context for AI
    let contextParts: string[] = []

    if (pageContext) {
      contextParts.push(`Current Page Context:
- URL: ${pageContext.url}
- Title: ${pageContext.title}
${pageContext.selectedText ? `- Selected Text: ${pageContext.selectedText}` : ''}
- Page Content: ${pageContext.text.substring(0, 3000)}`)
    }

    if (relevantMemories.length > 0) {
      contextParts.push(`Relevant Past Memories:
${relevantMemories.map((m: any) => `- ${m.summary}: ${m.content.substring(0, 200)}`).join('\n')}`)
    }

    // Get active thread if available
    let threadContext = ''
    try {
      const { data: activeThreadId } = await supabase
        .from('threads')
        .select('id, title, description')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single()

      if (activeThreadId) {
        threadContext = `\nActive Thread: ${activeThreadId.title} - ${activeThreadId.description}`
      }
    } catch (error) {
      // No active thread, that's okay
    }

    const systemPrompt = `You are Memory Layer, an AI assistant that helps users understand and work with information across their browsing sessions.

You have access to:
1. The current page the user is viewing
2. Their past memories and conversations
3. Active threads/projects they're working on

Be helpful, concise, and context-aware. Reference specific information from the page or memories when relevant.`

    const userPrompt = `${contextParts.join('\n\n')}${threadContext}

User Question: ${message}

Provide a helpful response based on the context above.`

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.slice(-6), // Last 6 messages for context
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 1000,
    })

    const response = completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response.'

    // Optionally store this interaction as a memory if it's meaningful
    // (You could add logic here to extract and store important information)

    return new Response(
      JSON.stringify({ 
        response,
        memoriesUsed: relevantMemories.length,
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

