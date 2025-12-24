// Simple backend API for Memory Layer SaaS
// Handles authentication and proxies to Supabase

import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const app = express();
app.use(cors());
app.use(express.json());

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Simple in-memory user store (replace with database in production)
const users = new Map<string, { email: string; password: string; userId: string }>();

// Auth endpoints
app.post('/api/auth/signup', async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  // Check if user exists
  if (users.has(email)) {
    return res.status(400).json({ error: 'User already exists' });
  }

  // Create user
  const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  users.set(email, { email, password, userId });

  // Create user in Supabase
  await supabase.from('users').upsert({ id: userId }, { onConflict: 'id' });

  // Generate simple token (use JWT in production)
  const token = Buffer.from(`${userId}:${email}`).toString('base64');

  res.json({ userId, token, email });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const user = users.get(email);
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = Buffer.from(`${user.userId}:${email}`).toString('base64');
  res.json({ userId: user.userId, token, email });
});

// Middleware to verify auth
const verifyAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' });
  }

  const token = authHeader.replace('Bearer ', '');
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [userId] = decoded.split(':');
    (req as any).userId = userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Chat endpoint
app.post('/api/chat', verifyAuth, async (req, res) => {
  const { message, pageContext, conversationHistory } = req.body;
  const userId = (req as any).userId;

  // Get relevant memories
  let relevantMemories: any[] = [];
  try {
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: message,
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;

    const { data: memories } = await supabase.rpc('match_memories', {
      query_embedding: `[${queryEmbedding.join(',')}]`,
      user_id_filter: userId,
      match_threshold: 0.6,
      match_count: 5
    });

    relevantMemories = memories || [];
  } catch (error) {
    console.error('Error searching memories:', error);
  }

  // Build context
  let contextParts: string[] = [];
  if (pageContext) {
    contextParts.push(`Current Page: ${pageContext.title}\n${pageContext.text.substring(0, 3000)}`);
  }
  if (relevantMemories.length > 0) {
    contextParts.push(`Relevant Memories:\n${relevantMemories.map(m => `- ${m.summary}`).join('\n')}`);
  }

  // Call OpenAI
  const completion = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      { role: 'system', content: 'You are Memory Layer, an AI assistant that helps users understand and work with information.' },
      ...(conversationHistory || []).slice(-6),
      { role: 'user', content: `${contextParts.join('\n\n')}\n\nUser Question: ${message}` }
    ],
    temperature: 0.7,
    max_tokens: 1000,
  });

  res.json({ 
    response: completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response.',
    memoriesUsed: relevantMemories.length
  });
});

// Process conversation endpoint
app.post('/api/conversations', verifyAuth, async (req, res) => {
  const { chunk, activeThreadId } = req.body;
  const userId = (req as any).userId;

  // Store conversation
  await supabase.from('conversations').insert({
    user_id: userId,
    thread_id: chunk.threadId,
    raw_messages: chunk.messages,
  });

  // Extract memories (same logic as Edge Function)
  const conversationText = chunk.messages
    .map((m: any) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  const prompt = `Analyze the following conversation and extract meaningful memories...`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      { role: 'system', content: 'You are a memory extraction system.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
  const memories = Array.isArray(parsed.memories) ? parsed.memories : [];

  // Process memories and assign to thread
  // ... (similar to Edge Function logic)

  res.json({ success: true, memoriesCreated: memories.length });
});

// Search memories endpoint
app.post('/api/memories/search', verifyAuth, async (req, res) => {
  const { query } = req.body;
  const userId = (req as any).userId;

  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  });
  const queryEmbedding = embeddingResponse.data[0].embedding;

  const { data: memories } = await supabase.rpc('match_memories', {
    query_embedding: `[${queryEmbedding.join(',')}]`,
    user_id_filter: userId,
    match_threshold: 0.6,
    match_count: 5
  });

  res.json({ memories: memories || [] });
});

// Threads endpoints
app.get('/api/threads', verifyAuth, async (req, res) => {
  const userId = (req as any).userId;
  const { data } = await supabase
    .from('threads')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  
  res.json({ threads: data || [] });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Memory Layer API running on port ${PORT}`);
});

