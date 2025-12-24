import React, { useState } from 'react';

interface Memory {
  id: string;
  content: string;
  summary: string;
  topic?: string;
  timestamp: number;
  relevanceScore?: number;
}

interface SearchViewProps {
  userId: string;
  apiUrl: string;
}

const SearchView: React.FC<SearchViewProps> = ({ userId, apiUrl }) => {
  const [query, setQuery] = useState('');
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/memories/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, query }),
      });
      const data = await response.json();
      setMemories(data.memories || []);
    } catch (error) {
      console.error('Error searching:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>Search Memories</h1>
      <form onSubmit={handleSearch} style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your memories in natural language..."
            className="input"
            style={{ flex: 1 }}
          />
          <button type="submit" className="button" disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </form>

      {memories.length === 0 && !loading && query && (
        <div className="empty-state">
          <p>No memories found matching your search.</p>
        </div>
      )}

      {memories.length > 0 && (
        <div>
          <p style={{ marginBottom: '16px', color: '#666' }}>
            Found {memories.length} relevant {memories.length === 1 ? 'memory' : 'memories'}
          </p>
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
              {memory.relevanceScore && (
                <div style={{ 
                  fontSize: '12px', 
                  color: '#888', 
                  marginBottom: '8px' 
                }}>
                  Relevance: {(memory.relevanceScore * 100).toFixed(0)}%
                </div>
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
              <div style={{ marginTop: '12px', fontSize: '12px', color: '#888' }}>
                {new Date(memory.timestamp).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchView;



