import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface Topic {
  topic: string;
  count: number;
}

interface Memory {
  id: string;
  content: string;
  summary: string;
  topic?: string;
  timestamp: number;
}

interface TopicsViewProps {
  userId: string;
  apiUrl: string;
}

const TopicsView: React.FC<TopicsViewProps> = ({ userId, apiUrl }) => {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTopics();
  }, [userId]);

  useEffect(() => {
    if (selectedTopic) {
      loadTopicMemories(selectedTopic);
    }
  }, [selectedTopic, userId]);

  const loadTopics = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/memories/topics?userId=${userId}`);
      const data = await response.json();
      setTopics(data.topics || []);
    } catch (error) {
      console.error('Error loading topics:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTopicMemories = async (topic: string) => {
    try {
      const response = await fetch(`${apiUrl}/api/memories/topic/${encodeURIComponent(topic)}?userId=${userId}`);
      const data = await response.json();
      setMemories(data.memories || []);
    } catch (error) {
      console.error('Error loading topic memories:', error);
    }
  };

  if (loading) {
    return <div className="loading">Loading topics...</div>;
  }

  return (
    <div>
      <h1>Topics</h1>
      {topics.length === 0 ? (
        <div className="empty-state">
          <p>No topics yet. Memories will be automatically organized by topic.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '24px' }}>
          <div className="card">
            <h2>All Topics</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {topics.map((topic) => (
                <button
                  key={topic.topic}
                  onClick={() => setSelectedTopic(topic.topic)}
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    background: selectedTopic === topic.topic ? '#e7f3ff' : 'transparent',
                    border: '1px solid #e0e0e0',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <span>{topic.topic}</span>
                  <span style={{ 
                    fontSize: '12px', 
                    color: '#666',
                    background: '#f0f0f0',
                    padding: '2px 6px',
                    borderRadius: '4px'
                  }}>
                    {topic.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            {selectedTopic ? (
              <>
                <h2 style={{ marginBottom: '16px' }}>Memories: {selectedTopic}</h2>
                {memories.length === 0 ? (
                  <div className="empty-state">No memories for this topic.</div>
                ) : (
                  memories.map((memory) => (
                    <div key={memory.id} className="card">
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
                  ))
                )}
              </>
            ) : (
              <div className="empty-state">
                <p>Select a topic to view its memories.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TopicsView;


