import express from 'express';
import { supabase } from '../db/init';
import { SummarizerService } from '../services/summarizer';

const router = express.Router();
const summarizer = new SummarizerService();

// Semantic search for relevant memories
router.post('/search', async (req, res) => {
  try {
    const { userId, query, limit = 5 }: { userId: string; query: string; limit?: number } = req.body;

    if (!userId || !query) {
      return res.status(400).json({ error: 'userId and query required' });
    }

    // Generate embedding for query
    const queryEmbedding = await summarizer.generateEmbedding(query);

    // Use the match_memories function for semantic search
    const { data, error } = await supabase.rpc('match_memories', {
      query_embedding: `[${queryEmbedding.join(',')}]`,
      user_id_filter: userId,
      match_threshold: 0.3, // Lower threshold for more results
      match_count: limit,
    });

    if (error) {
      console.error('Error in semantic search:', error);
      // Fallback to simple text search if function doesn't exist
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('memories')
        .select('id, content, summary, topic, created_at')
        .eq('user_id', userId)
        .ilike('summary', `%${query}%`)
        .limit(limit);

      if (fallbackError) {
        throw fallbackError;
      }

      const memories = (fallbackData || []).map((row) => ({
        id: row.id.toString(),
        content: row.content,
        summary: row.summary,
        topic: row.topic,
        timestamp: new Date(row.created_at).getTime(),
        relevanceScore: 0.5, // Default score for text search
      }));

      return res.json({ memories });
    }

    const memories = (data || []).map((row: any) => ({
      id: row.id.toString(),
      content: row.content,
      summary: row.summary,
      topic: row.topic,
      timestamp: new Date(row.created_at).getTime(),
      relevanceScore: row.similarity,
    }));

    res.json({ memories });
  } catch (error) {
    console.error('Error searching memories:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get memories by topic
router.get('/topic/:topic', async (req, res) => {
  try {
    const { topic } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    const { data, error } = await supabase
      .from('memories')
      .select('id, content, summary, topic, created_at')
      .eq('user_id', userId)
      .eq('topic', decodeURIComponent(topic))
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    const memories = (data || []).map((row) => ({
      id: row.id.toString(),
      content: row.content,
      summary: row.summary,
      topic: row.topic,
      timestamp: new Date(row.created_at).getTime(),
    }));

    res.json({ memories });
  } catch (error) {
    console.error('Error fetching memories by topic:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all topics for a user
router.get('/topics', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    const { data, error } = await supabase
      .from('memories')
      .select('topic')
      .eq('user_id', userId)
      .not('topic', 'is', null);

    if (error) {
      throw error;
    }

    // Group and count topics
    const topicMap = new Map<string, number>();
    (data || []).forEach((row) => {
      const topic = row.topic;
      if (topic) {
        topicMap.set(topic, (topicMap.get(topic) || 0) + 1);
      }
    });

    const topics = Array.from(topicMap.entries())
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count);

    res.json({ topics });
  } catch (error) {
    console.error('Error fetching topics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all memories for a user (paginated)
router.get('/', async (req, res) => {
  try {
    const { userId, page = 1, limit = 20 } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const offset = (pageNum - 1) * limitNum;

    // Get memories
    const { data, error } = await supabase
      .from('memories')
      .select('id, content, summary, topic, created_at', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (error) {
      throw error;
    }

    // Get total count
    const { count, error: countError } = await supabase
      .from('memories')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (countError) {
      console.error('Error getting count:', countError);
    }

    const memories = (data || []).map((row) => ({
      id: row.id.toString(),
      content: row.content,
      summary: row.summary,
      topic: row.topic,
      timestamp: new Date(row.created_at).getTime(),
    }));

    res.json({
      memories,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count || 0,
      },
    });
  } catch (error) {
    console.error('Error fetching memories:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a memory
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    const { error } = await supabase
      .from('memories')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting memory:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as memoryRoutes };
