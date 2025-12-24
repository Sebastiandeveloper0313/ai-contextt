// Simple authentication using Supabase Auth
import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

interface AuthProps {
  onAuth: (userId: string) => void;
}

// Hardcoded Supabase URL - in production, this would be your SaaS backend
const SUPABASE_URL = 'https://ckhbyivskfnxdrjwgeyf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNraGJ5aXZza2ZueGRyandnZXlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY1Mjg1OTQsImV4cCI6MjA4MjEwNDU5NH0.PE2i26i09lqhxzW6qlu3KxB63ZKSyivP6oCnaZfv9WI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const Auth: React.FC<AuthProps> = ({ onAuth }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isSignUp) {
        // Sign up
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (signUpError) throw signUpError;
        if (!data.user) throw new Error('Sign up failed');

        // Create user in our custom users table
        // Use service role key for this operation (we'll need to call an Edge Function)
        // For now, this will be handled when they first use a feature
        // But we can also create it here via an Edge Function
        
        // Create user in our custom users table immediately
        try {
          const { error: userError } = await supabase.from('users').upsert({ 
            id: data.user.id 
          }, { onConflict: 'id' });
          
          if (userError) {
            console.warn('Could not create user in users table:', userError);
            // This is okay - it will be created when they first use a feature
          }
        } catch (err) {
          console.warn('Error creating user in users table:', err);
        }

        // Store credentials and auto-grant permission (they signed up, so they want to use it!)
        chrome.storage.local.set({
          supabaseUrl: SUPABASE_URL,
          supabaseAnonKey: SUPABASE_ANON_KEY,
          userId: data.user.id,
          userEmail: email,
          hasPermission: true // Auto-grant on signup
        }, () => {
          onAuth(data.user.id);
        });
      } else {
        // Sign in
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) throw signInError;
        if (!data.user) throw new Error('Sign in failed');

        // Ensure user exists in our custom users table
        try {
          const { error: userError } = await supabase.from('users').upsert({ 
            id: data.user.id 
          }, { onConflict: 'id' });
          
          if (userError) {
            console.warn('Could not sync user to users table:', userError);
            // This is okay - it will be created when they first use a feature
          }
        } catch (err) {
          console.warn('Error syncing user to users table:', err);
        }

        // Store credentials and auto-grant permission
        chrome.storage.local.set({
          supabaseUrl: SUPABASE_URL,
          supabaseAnonKey: SUPABASE_ANON_KEY,
          userId: data.user.id,
          userEmail: email,
          hasPermission: true // Auto-grant on login
        }, () => {
          onAuth(data.user.id);
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      padding: '32px 24px', 
      textAlign: 'center',
      maxWidth: '400px',
      margin: '0 auto'
    }}>
      <h2 style={{ marginBottom: '24px', fontSize: '20px' }}>Memory Layer</h2>
      <p style={{ marginBottom: '24px', color: '#666', fontSize: '14px' }}>
        {isSignUp ? 'Create an account to get started' : 'Sign in to continue'}
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          style={{
            padding: '12px',
            border: '1px solid #ddd',
            borderRadius: '6px',
            fontSize: '14px'
          }}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          style={{
            padding: '12px',
            border: '1px solid #ddd',
            borderRadius: '6px',
            fontSize: '14px'
          }}
        />
        
        {error && (
          <div style={{ color: '#d32f2f', fontSize: '12px', textAlign: 'left' }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '12px',
            backgroundColor: '#2196f3',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1
          }}
        >
          {loading ? 'Loading...' : (isSignUp ? 'Sign Up' : 'Sign In')}
        </button>
      </form>

      <button
        onClick={() => setIsSignUp(!isSignUp)}
        style={{
          marginTop: '16px',
          background: 'none',
          border: 'none',
          color: '#2196f3',
          cursor: 'pointer',
          fontSize: '13px',
          textDecoration: 'underline'
        }}
      >
        {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
      </button>

      <p style={{ marginTop: '24px', fontSize: '11px', color: '#999', lineHeight: '1.4' }}>
        By signing up, you agree to our terms of service. Your data is stored securely and privately.
      </p>
    </div>
  );
};

export default Auth;

