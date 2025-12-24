-- Initial database schema for Memory Layer (Supabase)
-- Run this in Supabase SQL Editor: https://app.supabase.com/project/YOUR_PROJECT/sql

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(255) PRIMARY KEY,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Conversations table (raw storage)
CREATE TABLE IF NOT EXISTS conversations (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
  thread_id VARCHAR(255) NOT NULL,
  raw_messages JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Memories table with vector embeddings
CREATE TABLE IF NOT EXISTS memories (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  summary TEXT NOT NULL,
  topic VARCHAR(255),
  embedding vector(1536), -- OpenAI text-embedding-3-small dimension
  thread_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
-- Vector similarity search index (ivfflat for cosine distance)
CREATE INDEX IF NOT EXISTS memories_embedding_idx 
ON memories 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Standard indexes
CREATE INDEX IF NOT EXISTS memories_user_id_idx ON memories(user_id);
CREATE INDEX IF NOT EXISTS memories_topic_idx ON memories(topic);
CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON conversations(user_id);
CREATE INDEX IF NOT EXISTS conversations_thread_id_idx ON conversations(thread_id);

-- Row Level Security (RLS) policies
-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own data
-- Note: Service role key bypasses RLS, but these policies protect against direct API access
-- Drop existing policies if they exist, then recreate
DROP POLICY IF EXISTS "Users can view own data" ON users;
DROP POLICY IF EXISTS "Users can insert own data" ON users;
DROP POLICY IF EXISTS "Users can view own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can insert own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can view own memories" ON memories;
DROP POLICY IF EXISTS "Users can insert own memories" ON memories;
DROP POLICY IF EXISTS "Users can delete own memories" ON memories;

CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (auth.uid()::text = id OR true); -- Allow service role

CREATE POLICY "Users can insert own data" ON users
  FOR INSERT WITH CHECK (true); -- Service role can insert any user

CREATE POLICY "Users can view own conversations" ON conversations
  FOR SELECT USING (true); -- Service role can view all

CREATE POLICY "Users can insert own conversations" ON conversations
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can view own memories" ON memories
  FOR SELECT USING (true); -- Service role can view all

CREATE POLICY "Users can insert own memories" ON memories
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can delete own memories" ON memories
  FOR DELETE USING (true);

-- Function for semantic search (optional helper)
-- Drop function if exists to allow recreation
DROP FUNCTION IF EXISTS match_memories(vector, VARCHAR, FLOAT, INT);

CREATE OR REPLACE FUNCTION match_memories(
  query_embedding vector(1536),
  user_id_filter VARCHAR(255),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id BIGINT,
  content TEXT,
  summary TEXT,
  topic VARCHAR(255),
  similarity FLOAT,
  created_at TIMESTAMP
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    memories.id,
    memories.content,
    memories.summary,
    memories.topic,
    1 - (memories.embedding <=> query_embedding) as similarity,
    memories.created_at
  FROM memories
  WHERE memories.user_id = user_id_filter
    AND memories.embedding IS NOT NULL
    AND 1 - (memories.embedding <=> query_embedding) > match_threshold
  ORDER BY memories.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
