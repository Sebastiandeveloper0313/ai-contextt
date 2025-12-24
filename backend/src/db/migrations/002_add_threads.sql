-- Migration 002: Add Threads as first-class objects
-- Run this in Supabase SQL Editor after 001_initial_schema.sql

-- Create threads table
CREATE TABLE IF NOT EXISTS threads (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  embedding vector(1536), -- For semantic similarity matching
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add unique constraint (after table creation to avoid issues)
ALTER TABLE threads 
  ADD CONSTRAINT threads_user_title_unique UNIQUE(user_id, title);

-- Update memories table to reference threads
-- First, add the new thread_id column (will be BIGINT, referencing threads.id)
ALTER TABLE memories 
  ADD COLUMN IF NOT EXISTS thread_id_new BIGINT;

-- Migrate existing data: create threads from existing topics
-- This creates a thread for each unique topic
INSERT INTO threads (user_id, title, description, created_at, updated_at)
SELECT DISTINCT 
  user_id,
  COALESCE(topic, 'Untitled Thread') as title,
  'Auto-created from existing memories' as description,
  MIN(created_at) as created_at,
  MAX(created_at) as updated_at
FROM memories
WHERE topic IS NOT NULL
GROUP BY user_id, topic
ON CONFLICT ON CONSTRAINT threads_user_title_unique DO NOTHING;

-- Update memories to reference threads
UPDATE memories m
SET thread_id_new = t.id
FROM threads t
WHERE m.user_id = t.user_id 
  AND m.topic = t.title
  AND m.thread_id_new IS NULL;

-- For memories without topics, create a default thread
INSERT INTO threads (user_id, title, description)
SELECT DISTINCT 
  user_id,
  'General' as title,
  'Default thread for uncategorized memories' as description
FROM memories
WHERE topic IS NULL
ON CONFLICT ON CONSTRAINT threads_user_title_unique DO NOTHING;

-- Update remaining memories to default thread
UPDATE memories m
SET thread_id_new = t.id
FROM threads t
WHERE m.thread_id_new IS NULL
  AND m.user_id = t.user_id
  AND t.title = 'General';

-- Drop old thread_id column and rename new one
ALTER TABLE memories DROP COLUMN IF EXISTS thread_id;
ALTER TABLE memories RENAME COLUMN thread_id_new TO thread_id;

-- Add foreign key constraint
ALTER TABLE memories 
  ADD CONSTRAINT memories_thread_id_fkey 
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE SET NULL;

-- Add indexes
CREATE INDEX IF NOT EXISTS threads_user_id_idx ON threads(user_id);
CREATE INDEX IF NOT EXISTS threads_embedding_idx 
  ON threads 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
CREATE INDEX IF NOT EXISTS memories_thread_id_idx ON memories(thread_id);

-- Add updated_at trigger for threads
CREATE OR REPLACE FUNCTION update_thread_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_threads_updated_at
  BEFORE UPDATE ON threads
  FOR EACH ROW
  EXECUTE FUNCTION update_thread_updated_at();

-- RLS policies for threads
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own threads" ON threads;
DROP POLICY IF EXISTS "Users can insert own threads" ON threads;
DROP POLICY IF EXISTS "Users can update own threads" ON threads;
DROP POLICY IF EXISTS "Users can delete own threads" ON threads;

CREATE POLICY "Users can view own threads" ON threads
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own threads" ON threads
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own threads" ON threads
  FOR UPDATE USING (true);

CREATE POLICY "Users can delete own threads" ON threads
  FOR DELETE USING (true);

-- Function to find or create thread based on semantic similarity
CREATE OR REPLACE FUNCTION find_or_create_thread(
  p_user_id VARCHAR(255),
  p_memory_embedding vector(1536),
  p_topic VARCHAR(255),
  p_similarity_threshold FLOAT DEFAULT 0.75
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_thread_id BIGINT;
  v_similarity FLOAT;
BEGIN
  -- Try to find existing thread with similar embedding
  SELECT id, 1 - (embedding <=> p_memory_embedding) as sim
  INTO v_thread_id, v_similarity
  FROM threads
  WHERE user_id = p_user_id
    AND embedding IS NOT NULL
    AND 1 - (embedding <=> p_memory_embedding) > p_similarity_threshold
  ORDER BY embedding <=> p_memory_embedding
  LIMIT 1;

  -- If found similar thread, return it
  IF v_thread_id IS NOT NULL THEN
    RETURN v_thread_id;
  END IF;

  -- Otherwise, create new thread
  INSERT INTO threads (user_id, title, description, embedding)
  VALUES (
    p_user_id,
    COALESCE(p_topic, 'Untitled Thread'),
    'Auto-created thread',
    p_memory_embedding
  )
  RETURNING id INTO v_thread_id;

  RETURN v_thread_id;
END;
$$;


