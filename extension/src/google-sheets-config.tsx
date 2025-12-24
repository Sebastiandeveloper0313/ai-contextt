// Google Sheets OAuth Configuration Component
import React, { useState, useEffect } from 'react';

export const GoogleSheetsConfig: React.FC = () => {
  const [clientId, setClientId] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Load existing config
    chrome.storage.local.get(['googleSheetsClientId'], (result) => {
      if (result.googleSheetsClientId) {
        setClientId(result.googleSheetsClientId);
      }
    });
  }, []);

  const handleSave = async () => {
    setLoading(true);
    setSaved(false);
    
    await chrome.storage.local.set({ googleSheetsClientId: clientId }, () => {
      setSaved(true);
      setLoading(false);
      setTimeout(() => setSaved(false), 3000);
    });
  };

  return (
    <div style={{ 
      padding: '16px',
      border: '1px solid #e0e0e0',
      borderRadius: '8px',
      margin: '12px',
      backgroundColor: '#f9f9f9'
    }}>
      <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600' }}>
        Google Sheets API Configuration
      </h3>
      <p style={{ fontSize: '12px', color: '#666', margin: '0 0 12px 0' }}>
        Enter your Google OAuth Client ID to enable automatic Google Sheets import.
        <br />
        <a 
          href="https://console.cloud.google.com/apis/credentials" 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ color: '#2196f3' }}
        >
          Get your Client ID from Google Cloud Console
        </a>
      </p>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
        <input
          type="text"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="Enter OAuth Client ID (e.g., xxxxx.apps.googleusercontent.com)"
          style={{
            flex: 1,
            padding: '8px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '13px'
          }}
        />
        <button
          onClick={handleSave}
          disabled={loading || !clientId.trim()}
          style={{
            padding: '8px 16px',
            backgroundColor: clientId.trim() ? '#2196f3' : '#ccc',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: clientId.trim() ? 'pointer' : 'not-allowed',
            fontSize: '13px',
            fontWeight: '600'
          }}
        >
          {loading ? 'Saving...' : 'Save'}
        </button>
      </div>
      {saved && (
        <div style={{ 
          padding: '8px',
          backgroundColor: '#4caf50',
          color: '#fff',
          borderRadius: '4px',
          fontSize: '12px'
        }}>
          ✓ Configuration saved! You can now use Google Sheets import.
        </div>
      )}
      <p style={{ fontSize: '11px', color: '#999', margin: '8px 0 0 0' }}>
        Need help? See <code>GOOGLE_SHEETS_OAUTH_SETUP.md</code> for detailed setup instructions.
      </p>
    </div>
  );
};

