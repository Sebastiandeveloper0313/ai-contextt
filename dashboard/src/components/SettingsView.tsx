import React, { useState, useEffect } from 'react';

interface SettingsViewProps {
  userId: string;
  apiUrl: string;
}

const SettingsView: React.FC<SettingsViewProps> = ({ userId, apiUrl }) => {
  const [retentionDays, setRetentionDays] = useState(365);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      // Fetch all memories
      const response = await fetch(`${apiUrl}/api/memories?userId=${userId}&limit=10000`);
      const data = await response.json();
      
      // Create download
      const blob = new Blob([JSON.stringify(data.memories, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `memory-layer-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting:', error);
      alert('Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm('Are you sure you want to delete ALL memories? This cannot be undone.')) {
      return;
    }

    try {
      // Note: This would require a backend endpoint to delete all memories
      // For now, we'll show a message
      alert('Bulk delete functionality requires a backend endpoint. Please delete memories individually from the Memories view.');
    } catch (error) {
      console.error('Error deleting:', error);
    }
  };

  return (
    <div>
      <h1>Settings</h1>
      
      <div className="card">
        <h2>Data Retention</h2>
        <p style={{ marginBottom: '16px', color: '#666' }}>
          Configure how long your memories are stored. (Note: This setting is informational. 
          Actual retention policy implementation requires backend support.)
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label>
            Retention period (days):
            <input
              type="number"
              value={retentionDays}
              onChange={(e) => setRetentionDays(parseInt(e.target.value))}
              min="1"
              max="3650"
              className="input"
              style={{ width: '100px', marginLeft: '8px' }}
            />
          </label>
        </div>
      </div>

      <div className="card">
        <h2>Data Export</h2>
        <p style={{ marginBottom: '16px', color: '#666' }}>
          Download all your memories as a JSON file.
        </p>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="button"
        >
          {exporting ? 'Exporting...' : 'Export All Data'}
        </button>
      </div>

      <div className="card">
        <h2>Danger Zone</h2>
        <p style={{ marginBottom: '16px', color: '#666' }}>
          Permanently delete all your memories. This action cannot be undone.
        </p>
        <button
          onClick={handleDeleteAll}
          className="button button-secondary"
          style={{ background: '#dc3545' }}
        >
          Delete All Memories
        </button>
      </div>

      <div className="card">
        <h2>User ID</h2>
        <p style={{ marginBottom: '8px', color: '#666', fontSize: '14px' }}>
          Your unique identifier:
        </p>
        <code style={{ 
          display: 'block', 
          padding: '8px', 
          background: '#f5f5f5', 
          borderRadius: '4px',
          fontSize: '12px',
          wordBreak: 'break-all'
        }}>
          {userId}
        </code>
      </div>
    </div>
  );
};

export default SettingsView;



