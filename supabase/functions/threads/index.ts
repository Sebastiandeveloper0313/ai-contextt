// Supabase Edge Function for thread management
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const url = new URL(req.url)
    const userId = url.searchParams.get('userId')

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // GET: List threads
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('threads')
        .select('id, title, description, created_at, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })

      if (error) throw error

      // Get memory count for each thread
      const threadsWithCounts = await Promise.all(
        (data || []).map(async (thread) => {
          const { count } = await supabase
            .from('memories')
            .select('*', { count: 'exact', head: true })
            .eq('thread_id', thread.id)

          return {
            ...thread,
            memoryCount: count || 0
          }
        })
      )

      return new Response(
        JSON.stringify({ threads: threadsWithCounts }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // POST: Create or update thread
    if (req.method === 'POST') {
      const body = await req.json()
      const { id, title, description } = body

      if (id) {
        // Update existing thread
        const { data, error } = await supabase
          .from('threads')
          .update({ title, description })
          .eq('id', id)
          .eq('user_id', userId)
          .select()
          .single()

        if (error) throw error
        return new Response(
          JSON.stringify({ thread: data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } else {
        // Create new thread
        const { data, error } = await supabase
          .from('threads')
          .insert({
            user_id: userId,
            title: title || 'Untitled Thread',
            description: description || '',
          })
          .select()
          .single()

        if (error) throw error
        return new Response(
          JSON.stringify({ thread: data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // DELETE: Delete thread
    if (req.method === 'DELETE') {
      const url = new URL(req.url)
      const threadId = url.searchParams.get('threadId')

      if (!threadId) {
        return new Response(
          JSON.stringify({ error: 'threadId required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Delete thread (memories will have thread_id set to NULL due to ON DELETE SET NULL)
      const { error } = await supabase
        .from('threads')
        .delete()
        .eq('id', threadId)
        .eq('user_id', userId)

      if (error) throw error

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in threads function:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})



