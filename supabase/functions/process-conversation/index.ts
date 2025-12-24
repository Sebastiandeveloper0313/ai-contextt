// Supabase Edge Function to process conversations with Thread support
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import OpenAI from 'https://deno.land/x/openai@v4.20.1/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface ConversationChunk {
  messages: Message[];
  threadId: string; // This is the conversation thread ID, not the persistent Thread
  timestamp: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userId, chunk, activeThreadId }: { 
      userId: string; 
      chunk: ConversationChunk;
      activeThreadId?: number; // Optional: user-selected thread
    } = await req.json()

    if (!userId || !chunk || !chunk.messages || chunk.messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid request: userId and chunk with messages required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Initialize OpenAI
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!
    const openai = new OpenAI({ apiKey: openaiApiKey })

    // Ensure user exists
    await supabase
      .from('users')
      .upsert({ id: userId }, { onConflict: 'id' })

    // Store raw conversation
    await supabase
      .from('conversations')
      .insert({
        user_id: userId,
        thread_id: chunk.threadId,
        raw_messages: chunk.messages,
      })

    // Extract memories using OpenAI
    const conversationText = chunk.messages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n')

    const prompt = `Analyze the following conversation and extract meaningful memories. 
Focus on:
- Key decisions made
- Important definitions or concepts explained
- Open questions that need answers
- Creative ideas or solutions
- Project-specific information

For each memory, provide:
1. A concise summary (1-2 sentences)
2. The relevant topic/project name (if applicable)
3. The type (decision, definition, question, idea, or other)
4. The key content excerpt

Return as JSON object with a "memories" array:
{
  "memories": [
    {
      "summary": "...",
      "topic": "...",
      "type": "decision|definition|question|idea|other",
      "content": "..."
    }
  ]
}

Conversation:
${conversationText}

JSON:`

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a memory extraction system. Extract only meaningful, reusable information. Be concise and accurate.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      return new Response(
        JSON.stringify({ success: true, memoriesCreated: 0, threadId: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const parsed = JSON.parse(content)
    const memories = Array.isArray(parsed.memories) ? parsed.memories : []

    if (memories.length === 0) {
      return new Response(
        JSON.stringify({ success: true, memoriesCreated: 0, threadId: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Determine which thread to use
    let assignedThreadId: number | null = null

    // If user explicitly selected a thread, use it
    if (activeThreadId) {
      assignedThreadId = activeThreadId
    } else {
      // Auto-assign: use the first memory's embedding to find/create thread
      const firstMemory = memories[0]
      const embeddingText = `${firstMemory.summary} ${firstMemory.content}`
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: embeddingText,
      })
      const embedding = embeddingResponse.data[0].embedding

      // Use database function to find or create thread
      const { data: threadData, error: threadError } = await supabase.rpc('find_or_create_thread', {
        p_user_id: userId,
        p_memory_embedding: `[${embedding.join(',')}]`,
        p_topic: firstMemory.topic || null,
        p_similarity_threshold: 0.75
      })

      if (!threadError && threadData) {
        assignedThreadId = threadData
      } else {
        // Fallback: create thread manually
        const { data: newThread, error: createError } = await supabase
          .from('threads')
          .insert({
            user_id: userId,
            title: firstMemory.topic || 'Untitled Thread',
            description: 'Auto-created from conversation',
            embedding: `[${embedding.join(',')}]`,
          })
          .select('id')
          .single()

        if (!createError && newThread) {
          assignedThreadId = newThread.id
        }
      }
    }

    // Update thread summary if thread exists
    if (assignedThreadId) {
      // Generate updated thread description from all memories
      const threadMemories = memories.map(m => m.summary).join('. ')
      const summaryPrompt = `Summarize the following memories into a brief thread description (1-2 sentences):
${threadMemories}

Description:`

      const summaryCompletion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a summarization system. Create concise, informative descriptions.' },
          { role: 'user', content: summaryPrompt }
        ],
        temperature: 0.3,
        max_tokens: 100,
      })

      const threadDescription = summaryCompletion.choices[0]?.message?.content || 'Auto-created thread'

      // Update thread description
      await supabase
        .from('threads')
        .update({ 
          description: threadDescription,
          updated_at: new Date().toISOString()
        })
        .eq('id', assignedThreadId)
    }

    // Process each memory and assign to thread
    for (const memory of memories) {
      // Generate embedding
      const embeddingText = `${memory.summary} ${memory.content}`
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: embeddingText,
      })

      const embedding = embeddingResponse.data[0].embedding

      // Store memory with embedding and thread assignment
      await supabase.from('memories').insert({
        user_id: userId,
        content: memory.content || memory.summary,
        summary: memory.summary,
        topic: memory.topic || null,
        embedding: `[${embedding.join(',')}]`,
        thread_id: assignedThreadId, // Now references threads.id
      })
    }

    // Get thread info to return
    let threadInfo = null
    if (assignedThreadId) {
      const { data: thread } = await supabase
        .from('threads')
        .select('id, title, description')
        .eq('id', assignedThreadId)
        .single()
      
      threadInfo = thread
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        memoriesCreated: memories.length,
        thread: threadInfo
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error processing conversation:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
