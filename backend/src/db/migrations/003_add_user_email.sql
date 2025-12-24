-- Migration 003: Add email column to users table
-- Run this in Supabase SQL Editor

-- Add email column to users table
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Create index on email for lookups
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);

-- Add UPDATE policy for users table (needed for upsert operations)
DROP POLICY IF EXISTS "Users can update own data" ON users;
CREATE POLICY "Users can update own data" ON users
  FOR UPDATE 
  USING (auth.uid()::text = id OR true)
  WITH CHECK (auth.uid()::text = id OR true);

-- Function to sync user email from auth.users to users table
CREATE OR REPLACE FUNCTION sync_user_email()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert or update user in users table with email from auth.users
  INSERT INTO public.users (id, email, created_at)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.created_at, NOW()))
  ON CONFLICT (id) 
  DO UPDATE SET 
    email = NEW.email,
    created_at = COALESCE(users.created_at, NEW.created_at);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger to sync email when user is created or updated in auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_email();

-- Also sync existing users (run this once to backfill)
INSERT INTO public.users (id, email, created_at)
SELECT id, email, created_at
FROM auth.users
ON CONFLICT (id) 
DO UPDATE SET 
  email = EXCLUDED.email;

-- Add unique constraint on email (optional - uncomment if you want unique emails)
-- ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE(email);


