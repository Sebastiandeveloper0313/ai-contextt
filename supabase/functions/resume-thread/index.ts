// Supabase Edge Function to resume a thread (get context for resuming)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userId, threadId }: { userId: string; threadId: number } = await req.json()

    if (!userId || !threadId) {
      return new Response(
        JSON.stringify({ error: 'userId and threadId required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get thread info
    const { data: thread, error: threadError } = await supabase
      .from('threads')
      .select('id, title, description')
      .eq('id', threadId)
      .eq('user_id', userId)
      .single()

    if (threadError || !thread) {
      return new Response(
        JSON.stringify({ error: 'Thread not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get important memories from this thread
    // Prioritize: decisions, questions, then ideas
    const { data: memories, error: memoriesError } = await supabase
      .from('memories')
      .select('id, summary, content, topic, created_at')
      .eq('thread_id', threadId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10)

    if (memoriesError) throw memoriesError

    // Get open questions (memories with type 'question')
    const { data: questions } = await supabase
      .from('memories')
      .select('summary, content')
      .eq('thread_id', threadId)
      .eq('user_id', userId)
      .ilike('summary', '%question%')
      .limit(5)

    // Build context packet
    const context = {
      thread: {
        id: thread.id,
        title: thread.title,
        description: thread.description,
      },
      summary: thread.description,
      keyMemories: (memories || []).map(m => ({
        summary: m.summary,
        content: m.content,
      })),
      openQuestions: (questions || []).map(q => q.summary),
    }

    return new Response(
      JSON.stringify({ context }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error resuming thread:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})


