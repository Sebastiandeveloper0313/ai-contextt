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

        // Wait a moment for session to be set
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Get the user's email from Supabase Auth (more reliable than form input)
        const userEmail = data.user.email || email;
        
        // Create user in our custom users table immediately
        try {
          console.log('Attempting to upsert user:', { id: data.user.id, email: userEmail });
          const { error: userError, data: userData } = await supabase.from('users').upsert({ 
            id: data.user.id,
            email: userEmail
          }, { onConflict: 'id' });
          
          if (userError) {
            console.error('Could not create/update user in users table:', userError);
            console.error('Error code:', userError.code);
            console.error('Error message:', userError.message);
            console.error('Error details:', JSON.stringify(userError, null, 2));
            // Try alternative: use insert with ignore conflict
            const { error: insertError } = await supabase.from('users').insert({ 
              id: data.user.id,
              email: userEmail
            }).select();
            if (insertError && insertError.code !== '23505') { // 23505 is unique violation, which is okay
              console.error('Insert also failed:', insertError);
            }
          } else {
            console.log('User created/updated successfully:', userData);
          }
        } catch (err) {
          console.error('Error creating user in users table:', err);
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

        // Wait a moment for session to be set
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Get the user's email from Supabase Auth (more reliable than form input)
        const userEmail = data.user.email || email;

        // Ensure user exists in our custom users table
        try {
          console.log('Attempting to upsert user:', { id: data.user.id, email: userEmail });
          const { error: userError, data: userData } = await supabase.from('users').upsert({ 
            id: data.user.id,
            email: userEmail
          }, { onConflict: 'id' });
          
          if (userError) {
            console.error('Could not sync user to users table:', userError);
            console.error('Error code:', userError.code);
            console.error('Error message:', userError.message);
            console.error('Error details:', JSON.stringify(userError, null, 2));
            // Try alternative: use insert with ignore conflict
            const { error: insertError } = await supabase.from('users').insert({ 
              id: data.user.id,
              email: userEmail
            }).select();
            if (insertError && insertError.code !== '23505') { // 23505 is unique violation, which is okay
              console.error('Insert also failed:', insertError);
            }
          } else {
            console.log('User synced successfully:', userData);
          }
        } catch (err) {
          console.error('Error syncing user to users table:', err);
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

