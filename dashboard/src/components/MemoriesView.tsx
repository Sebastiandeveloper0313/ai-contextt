import React, { useState, useEffect } from 'react';

interface Memory {
  id: string;
  content: string;
  summary: string;
  topic?: string;
  timestamp: number;
}

interface MemoriesViewProps {
  userId: string;
  apiUrl: string;
}

const MemoriesView: React.FC<MemoriesViewProps> = ({ userId, apiUrl }) => {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    loadMemories();
  }, [page, userId]);

  const loadMemories = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/memories?userId=${userId}&page=${page}&limit=20`);
      const data = await response.json();
      setMemories(data.memories || []);
      if (data.pagination) {
        setTotalPages(Math.ceil(data.pagination.total / data.pagination.limit));
      }
    } catch (error) {
      console.error('Error loading memories:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteMemory = async (id: string) => {
    if (!confirm('Delete this memory?')) return;

    try {
      await fetch(`${apiUrl}/api/memories/${id}?userId=${userId}`, {
        method: 'DELETE',
      });
      loadMemories();
    } catch (error) {
      console.error('Error deleting memory:', error);
    }
  };

  if (loading) {
    return <div className="loading">Loading memories...</div>;
  }

  return (
    <div>
      <h1>All Memories</h1>
      {memories.length === 0 ? (
        <div className="empty-state">
          <p>No memories yet. Start using the extension to build your memory layer.</p>
        </div>
      ) : (
        <>
          {memories.map((memory) => (
            <div key={memory.id} className="card">
              {memory.topic && (
                <span style={{ 
                  display: 'inline-block',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#007bff',
                  background: '#e7f3ff',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  marginBottom: '8px'
                }}>
                  {memory.topic}
                </span>
              )}
              <p style={{ marginBottom: '8px', lineHeight: 1.6 }}>{memory.summary}</p>
              <details style={{ marginTop: '12px' }}>
                <summary style={{ cursor: 'pointer', color: '#666', fontSize: '14px' }}>
                  View full content
                </summary>
                <p style={{ marginTop: '8px', color: '#666', fontSize: '14px', lineHeight: 1.6 }}>
                  {memory.content}
                </p>
              </details>
              <div style={{ 
                marginTop: '12px', 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontSize: '12px', color: '#888' }}>
                  {new Date(memory.timestamp).toLocaleString()}
                </span>
                <button
                  onClick={() => deleteMemory(memory.id)}
                  className="button button-secondary"
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '24px' }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="button"
            >
              Previous
            </button>
            <span style={{ padding: '10px' }}>
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="button"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default MemoriesView;



