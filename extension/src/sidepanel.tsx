import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import ReactMarkdown from 'react-markdown';
import './sidepanel.css';
import Auth from './auth';

interface Memory {
  id: string;
  content: string;
  summary: string;
  topic?: string;
  timestamp: number;
  relevanceScore?: number;
}

interface Thread {
  id: number;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
  memoryCount?: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// Helper function to get Supabase config (shared between components)
const getSupabaseConfig = (): Promise<{ url: string; key: string }> => {
  return new Promise((resolve) => {
    chrome.storage.local.get(['supabaseUrl', 'supabaseAnonKey'], (result) => {
      resolve({
        url: result.supabaseUrl || '',
        key: result.supabaseAnonKey || ''
      });
    });
  });
};

// Chat Interface Component
const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [currentPageInfo, setCurrentPageInfo] = useState<{ title: string; url: string } | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const messagesContainerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Get current page info
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        setCurrentPageInfo({
          title: tabs[0].title || 'Unknown',
          url: tabs[0].url || ''
        });
      }
    });

    // Load chat history
    chrome.storage.local.get(['sidepanelChatHistory'], (result) => {
      if (result.sidepanelChatHistory) {
        setMessages(result.sidepanelChatHistory);
      }
    });
  }, []);

  useEffect(() => {
    // Scroll to bottom when new message
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    // Hide scroll button when at bottom
    setShowScrollButton(false);
  }, [messages]);

  // Check scroll position
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const checkScrollPosition = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50; // 50px threshold
      setShowScrollButton(!isAtBottom);
    };

    container.addEventListener('scroll', checkScrollPosition);
    // Check initial position
    checkScrollPosition();

    return () => {
      container.removeEventListener('scroll', checkScrollPosition);
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollButton(false);
  };

  const saveChatHistory = (newMessages: ChatMessage[]) => {
    chrome.storage.local.set({ sidepanelChatHistory: newMessages });
  };

  const sendMessage = async () => {
    if (!input.trim() || chatLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now()
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    saveChatHistory(newMessages);
    setInput('');
    setChatLoading(true);

    try {
      // Get current page context
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      let pageContext = null;
      if (tab.id && tab.url) {
        // Check if URL is accessible (not chrome://, chrome-extension://, etc.)
        const url = new URL(tab.url);
        const isAccessible = url.protocol === 'http:' || url.protocol === 'https:';
        
        if (isAccessible) {
          try {
            // Inject script to get page content
            const results = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: () => {
                return {
                  url: window.location.href,
                  title: document.title,
                  text: document.body.innerText.substring(0, 5000),
                  selectedText: window.getSelection()?.toString() || ''
                };
              }
            });
            
            if (results[0]?.result) {
              pageContext = results[0].result;
            }
          } catch (scriptError) {
            // Script injection failed (might be restricted page)
            console.warn('[Memory Layer] Could not inject script:', scriptError);
            // Use tab info as fallback
            pageContext = {
              url: tab.url,
              title: tab.title || 'Unknown',
              text: '',
              selectedText: ''
            };
          }
        } else {
          // For chrome:// or other restricted URLs, use tab info only
          pageContext = {
            url: tab.url,
            title: tab.title || 'Unknown',
            text: `This is a ${url.protocol} page. Content cannot be accessed for security reasons.`,
            selectedText: ''
          };
        }
      }

      // Get Supabase config
      const config = await getSupabaseConfig();

      if (!config.url || !config.key) {
        throw new Error('Not authenticated. Please sign in.');
      }

      // Get user ID from storage (set during auth)
      const userId = await new Promise<string>((resolve) => {
        chrome.storage.local.get(['userId'], (result) => {
          if (!result.userId) {
            throw new Error('Not authenticated. Please sign in.');
          }
          resolve(result.userId);
        });
      });

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
          pageContext: pageContext ? {
            url: pageContext.url,
            title: pageContext.title,
            text: pageContext.text,
            selectedText: pageContext.selectedText
          } : undefined,
          conversationHistory: messages.slice(-10).map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      });

      if (!chatResponse.ok) {
        const errorText = await chatResponse.text();
        throw new Error(`Chat API error: ${chatResponse.status} - ${errorText}`);
      }

      const chatData = await chatResponse.json();
      
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: chatData.response || 'I apologize, but I could not generate a response.',
        timestamp: Date.now()
      };

      const finalMessages = [...newMessages, assistantMessage];
      setMessages(finalMessages);
      saveChatHistory(finalMessages);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to process request. Make sure Supabase is configured and chat-assistant function is deployed.'}`,
        timestamp: Date.now()
      };
      const finalMessages = [...newMessages, errorMessage];
      setMessages(finalMessages);
      saveChatHistory(finalMessages);
    } finally {
      setChatLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100%',
      overflow: 'hidden'
    }}>
      {currentPageInfo && (
        <div style={{ 
          fontSize: '11px', 
          color: '#666', 
          padding: '6px 12px',
          backgroundColor: '#f5f5f5',
          borderBottom: '1px solid #e0e0e0',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flexShrink: 0
        }}>
          📄 {currentPageInfo.title}
        </div>
      )}

      <div 
        ref={messagesContainerRef}
        style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: '8px',
          minHeight: 0
        }}
      >
        {messages.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            color: '#666', 
            padding: '20px',
            fontSize: '13px'
          }}>
            <p style={{ margin: 0 }}>Ask me anything about this page!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                marginBottom: '12px',
                display: 'flex',
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                alignItems: 'flex-start'
              }}
            >
              <div
                style={{
                  maxWidth: '80%',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  backgroundColor: msg.role === 'user' 
                    ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                    : '#fff',
                  background: msg.role === 'user' 
                    ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                    : '#fff',
                  color: msg.role === 'user' ? '#fff' : '#333',
                  border: msg.role === 'user' ? 'none' : '1px solid #e0e0e0',
                  fontSize: '14px',
                  lineHeight: '1.6',
                  wordWrap: 'break-word'
                }}
              >
                {msg.role === 'assistant' ? (
                  <ReactMarkdown
                    components={{
                      // Headings
                      h1: ({node, ...props}) => <h1 style={{ fontSize: '20px', fontWeight: '700', margin: '16px 0 8px 0', color: '#333', borderBottom: '2px solid #e0e0e0', paddingBottom: '4px' }} {...props} />,
                      h2: ({node, ...props}) => <h2 style={{ fontSize: '18px', fontWeight: '600', margin: '14px 0 6px 0', color: '#333' }} {...props} />,
                      h3: ({node, ...props}) => <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '12px 0 4px 0', color: '#333' }} {...props} />,
                      // Paragraphs with spacing
                      p: ({node, ...props}) => <p style={{ margin: '8px 0', color: 'inherit' }} {...props} />,
                      // Lists
                      ul: ({node, ...props}) => <ul style={{ margin: '8px 0', paddingLeft: '20px', color: 'inherit' }} {...props} />,
                      ol: ({node, ...props}) => <ol style={{ margin: '8px 0', paddingLeft: '20px', color: 'inherit' }} {...props} />,
                      li: ({node, ...props}) => <li style={{ margin: '4px 0', color: 'inherit' }} {...props} />,
                      // Bold and italic
                      strong: ({node, ...props}) => <strong style={{ fontWeight: '700', color: 'inherit' }} {...props} />,
                      em: ({node, ...props}) => <em style={{ fontStyle: 'italic', color: 'inherit' }} {...props} />,
                      // Code blocks
                      code: ({node, inline, ...props}: any) => 
                        inline ? (
                          <code style={{ 
                            backgroundColor: msg.role === 'user' ? 'rgba(255,255,255,0.2)' : '#f4f4f4', 
                            padding: '2px 6px', 
                            borderRadius: '4px', 
                            fontSize: '13px',
                            fontFamily: 'monospace',
                            color: 'inherit'
                          }} {...props} />
                        ) : (
                          <code style={{ 
                            display: 'block',
                            backgroundColor: msg.role === 'user' ? 'rgba(255,255,255,0.15)' : '#f4f4f4', 
                            padding: '10px', 
                            borderRadius: '6px', 
                            fontSize: '13px',
                            fontFamily: 'monospace',
                            overflowX: 'auto',
                            margin: '8px 0',
                            color: 'inherit',
                            whiteSpace: 'pre-wrap'
                          }} {...props} />
                        ),
                      pre: ({node, ...props}) => <pre style={{ margin: '8px 0', color: 'inherit' }} {...props} />,
                      // Links
                      a: ({node, ...props}) => <a style={{ color: msg.role === 'user' ? '#fff' : '#2196f3', textDecoration: 'underline' }} {...props} />,
                      // Blockquotes
                      blockquote: ({node, ...props}) => <blockquote style={{ 
                        margin: '8px 0', 
                        paddingLeft: '12px', 
                        borderLeft: `3px solid ${msg.role === 'user' ? 'rgba(255,255,255,0.5)' : '#ddd'}`,
                        color: 'inherit',
                        fontStyle: 'italic'
                      }} {...props} />,
                      // Horizontal rule
                      hr: ({node, ...props}) => <hr style={{ 
                        margin: '12px 0', 
                        border: 'none', 
                        borderTop: `1px solid ${msg.role === 'user' ? 'rgba(255,255,255,0.3)' : '#e0e0e0'}` 
                      }} {...props} />,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                )}
              </div>
            </div>
          ))
        )}
        {chatLoading && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'flex-start',
            marginBottom: '12px'
          }}>
            <div style={{
              padding: '10px 14px',
              borderRadius: '12px',
              backgroundColor: '#fff',
              border: '1px solid #e0e0e0',
              fontSize: '14px',
              color: '#666'
            }}>
              Thinking...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom button - floating above input */}
      {showScrollButton && (
        <div style={{
          position: 'relative',
          height: '0',
          flexShrink: 0
        }}>
          <button
            onClick={scrollToBottom}
            style={{
              position: 'absolute',
              bottom: '8px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: 'white',
              border: '2px solid #000',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
              transition: 'background-color 0.2s, transform 0.2s',
              zIndex: 100
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f5f5f5';
              e.currentTarget.style.transform = 'translateX(-50%) scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'white';
              e.currentTarget.style.transform = 'translateX(-50%) scale(1)';
            }}
            aria-label="Scroll to bottom"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#000"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>
      )}

      <div style={{ 
        display: 'flex', 
        gap: '6px', 
        alignItems: 'flex-end',
        padding: '8px',
        borderTop: '1px solid #e0e0e0',
        backgroundColor: 'white',
        flexShrink: 0
      }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask about this page..."
          style={{
            flex: 1,
            padding: '8px',
            border: '1px solid #ddd',
            borderRadius: '6px',
            fontSize: '13px',
            fontFamily: 'inherit',
            resize: 'none',
            minHeight: '40px',
            maxHeight: '80px',
            lineHeight: '1.4'
          }}
          rows={1}
        />
        <button
          onClick={sendMessage}
          disabled={chatLoading || !input.trim()}
          style={{
            padding: '8px 16px',
            backgroundColor: chatLoading || !input.trim() ? '#ccc' : '#2196f3',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: chatLoading || !input.trim() ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
};

const SidePanel: React.FC = () => {
  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const [relevantContext, setRelevantContext] = useState<Memory[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [currentQuery, setCurrentQuery] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [backendUrl, setBackendUrl] = useState<string>('');
  const [authToken, setAuthToken] = useState<string>('');
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [showThreadSelector, setShowThreadSelector] = useState<boolean>(false);
  const [showThreadManager, setShowThreadManager] = useState<boolean>(false);
  const [editingThread, setEditingThread] = useState<Thread | null>(null);
  const [newThreadTitle, setNewThreadTitle] = useState<string>('');
  const [newThreadDescription, setNewThreadDescription] = useState<string>('');
  const [showThreads, setShowThreads] = useState<boolean>(false);
  const [showMemories, setShowMemories] = useState<boolean>(false);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      checkPermission();
      loadActiveThread();
      loadThreads();
      loadRelevantContext();
    }
  }, [isAuthenticated]);

  const checkAuth = () => {
    chrome.storage.local.get(['userId', 'supabaseUrl', 'supabaseAnonKey', 'userEmail'], (result) => {
      // Require new auth format (with userEmail) OR explicitly allow old config for now
      // For now, if they have old config, show auth screen to migrate
      const hasNewAuth = result.userId && result.userEmail && result.supabaseUrl && result.supabaseAnonKey;
      const hasOldConfig = result.supabaseUrl && result.supabaseAnonKey && result.userId && !result.userEmail;
      
      // If they have old config but no email, show auth to migrate
      if (hasOldConfig) {
        // Clear old config to force auth
        chrome.storage.local.remove(['userId', 'supabaseUrl', 'supabaseAnonKey'], () => {
          setIsAuthenticated(false);
          setAuthLoading(false);
        });
        return;
      }
      
      if (hasNewAuth) {
        setIsAuthenticated(true);
      }
      setAuthLoading(false);
    });
  };

  const handleAuth = (userId: string) => {
    // Auto-grant permission when user signs up/logs in
    chrome.storage.local.set({ hasPermission: true }, () => {
      setIsAuthenticated(true);
      setHasPermission(true);
      // Reload to refresh the component
      window.location.reload();
    });
  };

  const checkPermission = () => {
    chrome.storage.local.get(['hasPermission'], (result) => {
      setHasPermission(result.hasPermission === true);
    });
  };

  const requestPermission = () => {
    chrome.storage.local.set({ hasPermission: true }, () => {
      setHasPermission(true);
      loadRelevantContext();
    });
  };

  // getSupabaseConfig is defined above as a shared function

  const getUserId = (): Promise<string> => {
    return new Promise((resolve) => {
      chrome.storage.local.get(['userId'], (result) => {
        if (result.userId) {
          resolve(result.userId);
        } else {
          const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          chrome.storage.local.set({ userId }, () => {
            resolve(userId);
          });
        }
      });
    });
  };

  const loadActiveThread = async () => {
    const config = await getSupabaseConfig();
    if (!config.url || !config.key) return;

    chrome.storage.local.get(['activeThreadId'], async (result) => {
      if (result.activeThreadId) {
        try {
          const userId = await getUserId();
          const response = await fetch(`${config.url}/functions/v1/threads?userId=${userId}`, {
            headers: {
              'Authorization': `Bearer ${config.key}`
            }
          });

          if (response.ok) {
            const data = await response.json();
            const thread = data.threads?.find((t: Thread) => t.id === result.activeThreadId);
            if (thread) {
              setActiveThread(thread);
            }
          }
        } catch (error) {
          console.error('[Memory Layer] Error loading active thread:', error);
        }
      }
    });
  };

  const loadThreads = async () => {
    const config = await getSupabaseConfig();
    if (!config.url || !config.key) return;

    try {
      const userId = await getUserId();
      const response = await fetch(`${config.url}/functions/v1/threads?userId=${userId}`, {
        headers: {
          'Authorization': `Bearer ${config.key}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setThreads(data.threads || []);
      }
    } catch (error) {
      console.error('[Memory Layer] Error loading threads:', error);
    }
  };

  const switchThread = async (threadId: number) => {
    chrome.storage.local.set({ activeThreadId: threadId }, () => {
      const thread = threads.find(t => t.id === threadId);
      setActiveThread(thread || null);
      setShowThreadSelector(false);
      loadRelevantContext();
    });
  };

  const createThread = async () => {
    if (!newThreadTitle.trim()) return;

    const config = await getSupabaseConfig();
    if (!config.url || !config.key) return;

    try {
      const userId = await getUserId();
      const response = await fetch(`${config.url}/functions/v1/threads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.key}`
        },
        body: JSON.stringify({
          title: newThreadTitle,
          description: newThreadDescription
        })
      });

      if (response.ok) {
        const data = await response.json();
        await loadThreads();
        setNewThreadTitle('');
        setNewThreadDescription('');
        if (data.thread) {
          switchThread(data.thread.id);
        }
      }
    } catch (error) {
      console.error('[Memory Layer] Error creating thread:', error);
    }
  };

  const updateThread = async (thread: Thread) => {
    const config = await getSupabaseConfig();
    if (!config.url || !config.key) return;

    try {
      const userId = await getUserId();
      const response = await fetch(`${config.url}/functions/v1/threads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.key}`
        },
        body: JSON.stringify({
          id: thread.id,
          title: thread.title,
          description: thread.description
        })
      });

      if (response.ok) {
        await loadThreads();
        await loadActiveThread();
        setEditingThread(null);
      }
    } catch (error) {
      console.error('[Memory Layer] Error updating thread:', error);
    }
  };

  const loadRelevantContext = async () => {
    if (!hasPermission) return;

    setLoading(true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'GET_CURRENT_CONTEXT' }, async (response) => {
          if (chrome.runtime.lastError) {
            console.log('[Memory Layer] Content script not ready yet');
            setLoading(false);
            return;
          }
          
          if (response?.context) {
            const query = response.context;
            setCurrentQuery(query);
            
            const config = await getSupabaseConfig();
            if (!config.url || !config.key) {
              setLoading(false);
              return;
            }

            try {
              const userId = await getUserId();
              const searchResponse = await fetch(`${config.url}/functions/v1/search-memories`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${config.key}`
                },
                body: JSON.stringify({
                  userId,
                  query
                })
              });

              if (searchResponse.ok) {
                const data = await searchResponse.json();
                setRelevantContext(data.memories || []);
              }
            } catch (error) {
              console.error('[Memory Layer] Error fetching context:', error);
            }
            setLoading(false);
          } else {
            setLoading(false);
          }
        });
      }
    } catch (error) {
      console.error('Error loading context:', error);
      setLoading(false);
    }
  };

  const resumeThread = async () => {
    if (!activeThread) return;

    const config = await getSupabaseConfig();
    if (!config.url || !config.key) return;

    try {
      const userId = await getUserId();
      const response = await fetch(`${config.url}/functions/v1/resume-thread`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.key}`
        },
        body: JSON.stringify({
          userId,
          threadId: activeThread.id
        })
      });

      if (response.ok) {
        const data = await response.json();
        const context = data.context;

        // Build context text
        let contextText = `[Thread: ${context.thread.title}]\n${context.summary}\n\n`;
        
        if (context.keyMemories && context.keyMemories.length > 0) {
          contextText += '[Key Memories]\n';
          context.keyMemories.forEach((m: any) => {
            contextText += `- ${m.summary}\n`;
          });
          contextText += '\n';
        }

        if (context.openQuestions && context.openQuestions.length > 0) {
          contextText += '[Open Questions]\n';
          context.openQuestions.forEach((q: string) => {
            contextText += `- ${q}\n`;
          });
        }

        // Inject into ChatGPT
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'INJECT_CONTEXT',
            context: contextText
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.warn('[Memory Layer]', chrome.runtime.lastError.message);
            }
          });
        }
      }
    } catch (error) {
      console.error('[Memory Layer] Error resuming thread:', error);
    }
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="sidepanel-container" style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        height: '100vh'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: '#666' }}>Loading...</div>
        </div>
      </div>
    );
  }

  // Show auth screen if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="sidepanel-container">
        <Auth onAuth={handleAuth} />
      </div>
    );
  }

  // Permission is now auto-granted on signup, but check just in case
  if (!hasPermission && isAuthenticated) {
    // Auto-grant if authenticated but permission not set
    requestPermission();
    return (
      <div className="sidepanel-container" style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        height: '100vh'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: '#666' }}>Setting up...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="sidepanel-container" style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100vh',
      overflow: 'hidden'
    }}>
      <header className="sidepanel-header" style={{ 
        padding: '12px 16px',
        borderBottom: '1px solid #e0e0e0',
        flexShrink: 0
      }}>
        <h1 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>Memory Layer</h1>
      </header>

      {/* Active Thread Section - Collapsible */}
      <section style={{ 
        padding: '8px 12px', 
        borderBottom: '1px solid #e0e0e0',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
            {activeThread ? (
              <>
                <span style={{ fontSize: '12px', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeThread.title}
                </span>
                <span style={{ fontSize: '11px', color: '#999' }}>
                  ({activeThread.memoryCount || 0})
                </span>
              </>
            ) : (
              <span style={{ fontSize: '12px', color: '#666' }}>No active thread</span>
            )}
          </div>
          <button 
            onClick={() => setShowThreads(!showThreads)}
            style={{ 
              fontSize: '11px', 
              padding: '4px 8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
              backgroundColor: 'white',
              whiteSpace: 'nowrap'
            }}
          >
            {showThreads ? 'Hide' : 'Threads'}
          </button>
        </div>
        
        {showThreads && (
          <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#f9f9f9', borderRadius: '4px', maxHeight: '200px', overflowY: 'auto' }}>
            {threads.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#666' }}>No threads yet</div>
            ) : (
              <div>
                {threads.map(thread => (
                  <div
                    key={thread.id}
                    onClick={() => switchThread(thread.id)}
                    style={{
                      padding: '6px',
                      marginBottom: '4px',
                      cursor: 'pointer',
                      backgroundColor: thread.id === activeThread?.id ? '#e3f2fd' : 'white',
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}
                  >
                    <div style={{ fontWeight: '600' }}>{thread.title}</div>
                    <div style={{ fontSize: '11px', color: '#666' }}>{thread.memoryCount || 0} memories</div>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowThreadManager(true)}
              style={{
                marginTop: '8px',
                fontSize: '12px',
                padding: '6px 12px',
                border: '1px solid #2196f3',
                borderRadius: '4px',
                cursor: 'pointer',
                backgroundColor: '#2196f3',
                color: 'white',
                width: '100%'
              }}
            >
              + New Thread
            </button>
          </div>
        )}

        {showThreadSelector && (
          <div style={{ marginTop: '12px', padding: '8px', backgroundColor: 'white', borderRadius: '4px' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>Select Thread:</div>
            {threads.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#666' }}>No threads yet</div>
            ) : (
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {threads.map(thread => (
                  <div
                    key={thread.id}
                    onClick={() => switchThread(thread.id)}
                    style={{
                      padding: '8px',
                      marginBottom: '4px',
                      cursor: 'pointer',
                      backgroundColor: thread.id === activeThread?.id ? '#e3f2fd' : '#f9f9f9',
                      borderRadius: '4px',
                      border: thread.id === activeThread?.id ? '1px solid #2196f3' : '1px solid #ddd'
                    }}
                  >
                    <div style={{ fontWeight: '600', fontSize: '13px' }}>{thread.title}</div>
                    <div style={{ fontSize: '11px', color: '#666' }}>{thread.memoryCount || 0} memories</div>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowThreadManager(true)}
              style={{
                marginTop: '8px',
                fontSize: '12px',
                padding: '6px 12px',
                border: '1px solid #2196f3',
                borderRadius: '4px',
                cursor: 'pointer',
                backgroundColor: '#2196f3',
                color: 'white',
                width: '100%'
              }}
            >
              + New Thread
            </button>
          </div>
        )}
      </section>

      {/* Thread Manager Modal */}
      {showThreadManager && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            width: '90%',
            maxWidth: '400px'
          }}>
            <h3 style={{ marginTop: 0 }}>Create New Thread</h3>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>Title:</label>
            <input
              type="text"
              value={newThreadTitle}
              onChange={(e) => setNewThreadTitle(e.target.value)}
              placeholder="e.g., AI Tools Research"
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #ddd',
                marginBottom: '12px'
              }}
            />
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>Description (optional):</label>
            <textarea
              value={newThreadDescription}
              onChange={(e) => setNewThreadDescription(e.target.value)}
              placeholder="Brief description of this thread"
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #ddd',
                marginBottom: '12px',
                minHeight: '60px'
              }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={createThread}
                disabled={!newThreadTitle.trim()}
                style={{
                  flex: 1,
                  padding: '8px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: '#2196f3',
                  color: 'white',
                  cursor: newThreadTitle.trim() ? 'pointer' : 'not-allowed',
                  opacity: newThreadTitle.trim() ? 1 : 0.5
                }}
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowThreadManager(false);
                  setNewThreadTitle('');
                  setNewThreadDescription('');
                }}
                style={{
                  flex: 1,
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: 'white',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Thread Modal */}
      {editingThread && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            width: '90%',
            maxWidth: '400px'
          }}>
            <h3 style={{ marginTop: 0 }}>Edit Thread</h3>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>Title:</label>
            <input
              type="text"
              value={editingThread.title}
              onChange={(e) => setEditingThread({ ...editingThread, title: e.target.value })}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #ddd',
                marginBottom: '12px'
              }}
            />
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>Description:</label>
            <textarea
              value={editingThread.description || ''}
              onChange={(e) => setEditingThread({ ...editingThread, description: e.target.value })}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #ddd',
                marginBottom: '12px',
                minHeight: '60px'
              }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => updateThread(editingThread)}
                style={{
                  flex: 1,
                  padding: '8px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: '#2196f3',
                  color: 'white',
                  cursor: 'pointer'
                }}
              >
                Save
              </button>
              <button
                onClick={() => setEditingThread(null)}
                style={{
                  flex: 1,
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: 'white',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat Interface - Main Focus */}
      <section style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column',
        overflow: 'hidden',
        minHeight: 0
      }}>
        <div style={{ 
          padding: '8px 12px',
          borderBottom: '1px solid #e0e0e0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0
        }}>
          <h2 style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>Chat</h2>
          {relevantContext.length > 0 && (
            <button
              onClick={() => setShowMemories(!showMemories)}
              style={{
                fontSize: '11px',
                padding: '4px 8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer',
                backgroundColor: 'white'
              }}
            >
              {showMemories ? 'Hide' : 'Memories'} ({relevantContext.length})
            </button>
          )}
        </div>
        
        {showMemories && relevantContext.length > 0 && (
          <div style={{ 
            padding: '8px 12px',
            borderBottom: '1px solid #e0e0e0',
            maxHeight: '150px',
            overflowY: 'auto',
            backgroundColor: '#f9f9f9',
            flexShrink: 0
          }}>
            {relevantContext.map((memory) => (
              <div key={memory.id} style={{
                padding: '6px',
                marginBottom: '4px',
                backgroundColor: 'white',
                borderRadius: '4px',
                fontSize: '12px'
              }}>
                <div style={{ fontWeight: '600', marginBottom: '2px' }}>{memory.summary}</div>
                {memory.topic && (
                  <div style={{ fontSize: '11px', color: '#666' }}>{memory.topic}</div>
                )}
              </div>
            ))}
          </div>
        )}
        
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ChatInterface />
        </div>
      </section>

      {/* Footer - Minimal */}
      <footer style={{ 
        padding: '8px 12px',
        borderTop: '1px solid #e0e0e0',
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '11px',
        flexShrink: 0
      }}>
        <button
          onClick={() => {
            chrome.storage.local.clear(() => {
              window.location.reload();
            });
          }}
          style={{
            fontSize: '11px',
            padding: '4px 8px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            cursor: 'pointer',
            backgroundColor: 'white',
            color: '#666'
          }}
        >
          Sign Out
        </button>
        {activeThread && (
          <button 
            onClick={resumeThread}
            style={{
              fontSize: '11px',
              padding: '4px 8px',
              border: '1px solid #2196f3',
              borderRadius: '4px',
              cursor: 'pointer',
              backgroundColor: '#2196f3',
              color: 'white'
            }}
          >
            Resume Thread
          </button>
        )}
      </footer>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<SidePanel />);
}
