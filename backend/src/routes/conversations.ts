import express from 'express';
import { supabase } from '../db/init';
import { SummarizerService } from '../services/summarizer';

const router = express.Router();
const summarizer = new SummarizerService();

interface ConversationChunk {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>;
  threadId: string;
  timestamp: number;
}

router.post('/', async (req, res) => {
  try {
    const { userId, chunk }: { userId: string; chunk: ConversationChunk } = req.body;

    if (!userId || !chunk || !chunk.messages || chunk.messages.length === 0) {
      return res.status(400).json({ error: 'Invalid request: userId and chunk with messages required' });
    }

    // Ensure user exists (upsert)
    const { error: userError } = await supabase
      .from('users')
      .upsert({ id: userId }, { onConflict: 'id' });

    if (userError) {
      console.error('Error upserting user:', userError);
    }

    // Store raw conversation
    const { error: convError } = await supabase
      .from('conversations')
      .insert({
        user_id: userId,
        thread_id: chunk.threadId,
        raw_messages: chunk.messages,
      });

    if (convError) {
      console.error('Error storing conversation:', convError);
      return res.status(500).json({ error: 'Failed to store conversation' });
    }

    // Extract and store memories
    const memories = await summarizer.extractMemories(chunk.messages);

    for (const memory of memories) {
      // Generate embedding
      const embeddingText = `${memory.summary} ${memory.content}`;
      const embedding = await summarizer.generateEmbedding(embeddingText);

      // Store memory with embedding
      // Supabase/pgvector expects the embedding as a string in format '[0.1,0.2,...]'
      const { error: memoryError } = await supabase
        .from('memories')
        .insert({
          user_id: userId,
          content: memory.content,
          summary: memory.summary,
          topic: memory.topic || null,
          embedding: `[${embedding.join(',')}]`, // pgvector format
          thread_id: chunk.threadId,
        });

      if (memoryError) {
        console.error('Error storing memory:', memoryError);
      }
    }

    res.json({
      success: true,
      memoriesCreated: memories.length,
    });
  } catch (error) {
    console.error('Error processing conversation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as conversationRoutes };

