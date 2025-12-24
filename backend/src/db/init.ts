import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

// Use service role key for admin operations (bypasses RLS)
export const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function initializeDatabase() {
  try {
    // Enable pgvector extension (run this in Supabase SQL editor first)
    // CREATE EXTENSION IF NOT EXISTS vector;
    
    // Create users table
    const { error: usersError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(255) PRIMARY KEY,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `
    });

    // Since RPC might not be available, we'll use direct SQL via Supabase
    // For initial setup, run the SQL migration in Supabase dashboard
    // For now, we'll just verify connection
    
    // Check if we can query (this will fail if tables don't exist, which is expected)
    const { data, error } = await supabase.from('users').select('count').limit(1);
    
    if (error && error.code === 'PGRST116') {
      console.log('Tables do not exist yet. Please run the SQL migration in Supabase SQL Editor.');
      console.log('See: backend/src/db/migrations/001_initial_schema.sql');
    } else if (error) {
      console.warn('Database check warning:', error.message);
    } else {
      console.log('Database connection successful');
    }

    console.log('Supabase client initialized');
  } catch (error) {
    console.error('Database initialization error:', error);
    // Don't throw - Supabase tables should be created via SQL editor
    console.log('Note: Run the SQL migration in Supabase dashboard if tables do not exist');
  }
}
