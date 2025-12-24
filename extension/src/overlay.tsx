// Floating chat overlay component
// This creates a persistent chat interface that floats over any webpage

import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import './overlay.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

const OverlayChat: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: window.innerWidth - 400, y: 100 });
  const [loading, setLoading] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    // Load chat history from storage
    chrome.storage.local.get(['overlayChatHistory'], (result) => {
      if (result.overlayChatHistory) {
        setMessages(result.overlayChatHistory);
      }
    });
  }, []);

  const saveHistory = (newMessages: Message[]) => {
    chrome.storage.local.set({ overlayChatHistory: newMessages });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.overlay-header')) {
      setIsDragging(true);
      dragStartPos.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y
      };
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStartPos.current.x,
        y: e.clientY - dragStartPos.current.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now()
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    saveHistory(newMessages);
    setInput('');
    setLoading(true);

    try {
      // Get current page context
      const pageContext = {
        url: window.location.href,
        title: document.title,
        text: document.body.innerText.substring(0, 5000), // First 5000 chars
        selectedText: window.getSelection()?.toString() || ''
      };

      // Get Supabase config
      const config = await new Promise<{ url: string; key: string }>((resolve) => {
        chrome.storage.local.get(['supabaseUrl', 'supabaseAnonKey'], (result) => {
          resolve({
            url: result.supabaseUrl || '',
            key: result.supabaseAnonKey || ''
          });
        });
      });

      if (!config.url || !config.key) {
        throw new Error('Supabase not configured');
      }

      // Get user ID
      const userId = await new Promise<string>((resolve) => {
        chrome.storage.local.get(['userId'], (result) => {
          if (result.userId) {
            resolve(result.userId);
          } else {
            const newUserId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            chrome.storage.local.set({ userId: newUserId }, () => {
              resolve(newUserId);
            });
          }
        });
      });

      // Call search-memories for relevant context
      const searchResponse = await fetch(`${config.url}/functions/v1/search-memories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.key}`
        },
        body: JSON.stringify({
          userId,
          query: input
        })
      });

      let relevantMemories = [];
      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        relevantMemories = searchData.memories || [];
      }

      // Build context for AI
      const contextText = `
Current Page Context:
- URL: ${pageContext.url}
- Title: ${pageContext.title}
- Selected Text: ${pageContext.selectedText}
- Page Content (excerpt): ${pageContext.text.substring(0, 2000)}

Relevant Past Memories:
${relevantMemories.map((m: any) => `- ${m.summary}`).join('\n')}

User Question: ${input}
`;

      // Call chat-assistant Edge Function
      const chatResponse = await fetch(`${config.url}/functions/v1/chat-assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.key}`
        },
        body: JSON.stringify({
          userId,
          message: input,
          pageContext,
          conversationHistory: messages.slice(-10).map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      });

      if (!chatResponse.ok) {
        throw new Error(`Chat API error: ${chatResponse.status}`);
      }

      const chatData = await chatResponse.json();
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: chatData.response || 'I apologize, but I could not generate a response.',
        timestamp: Date.now()
      };

      const finalMessages = [...newMessages, assistantMessage];
      setMessages(finalMessages);
      saveHistory(finalMessages);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to process request'}`,
        timestamp: Date.now()
      };
      const finalMessages = [...newMessages, errorMessage];
      setMessages(finalMessages);
      saveHistory(finalMessages);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (isMinimized) {
    return (
      <div
        className="overlay-minimized"
        style={{ 
          left: `${position.x}px`, 
          top: `${position.y}px`,
          pointerEvents: 'auto'
        }}
        onClick={() => setIsMinimized(false)}
      >
        💬
      </div>
    );
  }

  return (
    <div
      ref={overlayRef}
      className="overlay-chat"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        pointerEvents: 'auto'
      }}
    >
      <div className="overlay-header" onMouseDown={handleMouseDown}>
        <div className="overlay-title">Memory Layer Assistant</div>
        <div className="overlay-controls">
          <button onClick={() => setIsMinimized(true)}>−</button>
          <button onClick={() => overlayRef.current?.remove()}>×</button>
        </div>
      </div>
      
      <div className="overlay-messages">
        {messages.length === 0 ? (
          <div className="overlay-empty">
            <p>Ask me anything about this page or your past conversations!</p>
            <p className="hint">I can see: {document.title}</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`overlay-message overlay-message-${msg.role}`}>
              <div className="overlay-message-content">{msg.content}</div>
            </div>
          ))
        )}
        {loading && (
          <div className="overlay-message overlay-message-assistant">
            <div className="overlay-message-content">Thinking...</div>
          </div>
        )}
      </div>

      <div className="overlay-input-container">
        <textarea
          className="overlay-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask about this page or your memories..."
          rows={2}
        />
        <button className="overlay-send" onClick={sendMessage} disabled={loading || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
};

// Export component for use in overlay-inject.ts
export default OverlayChat;

