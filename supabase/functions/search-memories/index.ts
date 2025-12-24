// Supabase Edge Function for semantic search
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import OpenAI from 'https://deno.land/x/openai@v4.20.1/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userId, query, limit = 5 }: { userId: string; query: string; limit?: number } = await req.json()

    if (!userId || !query) {
      return new Response(
        JSON.stringify({ error: 'userId and query required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!
    const openai = new OpenAI({ apiKey: openaiApiKey })

    // Generate embedding for query
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    })
    const queryEmbedding = embeddingResponse.data[0].embedding

    // Use the match_memories function for semantic search
    const { data, error } = await supabase.rpc('match_memories', {
      query_embedding: `[${queryEmbedding.join(',')}]`,
      user_id_filter: userId,
      match_threshold: 0.3,
      match_count: limit,
    })

    if (error) {
      console.error('Error in semantic search:', error)
      // Fallback to text search
      const { data: fallbackData } = await supabase
        .from('memories')
        .select('id, content, summary, topic, created_at')
        .eq('user_id', userId)
        .ilike('summary', `%${query}%`)
        .limit(limit)

      const memories = (fallbackData || []).map((row) => ({
        id: row.id.toString(),
        content: row.content,
        summary: row.summary,
        topic: row.topic,
        timestamp: new Date(row.created_at).getTime(),
        relevanceScore: 0.5,
      }))

      return new Response(
        JSON.stringify({ memories }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const memories = (data || []).map((row: any) => ({
      id: row.id.toString(),
      content: row.content,
      summary: row.summary,
      topic: row.topic,
      timestamp: new Date(row.created_at).getTime(),
      relevanceScore: row.similarity,
    }))

    return new Response(
      JSON.stringify({ memories }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error searching memories:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})



