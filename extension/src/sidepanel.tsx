import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import ReactMarkdown from 'react-markdown';
import './sidepanel.css';
import Auth from './auth';

// Removed Memory and Thread interfaces - no longer using these features

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
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      checkPermission();
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

  // Removed all thread and memory functions - no longer using these features

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
          flexShrink: 0
        }}>
          <h2 style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>Chat</h2>
        </div>
        
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
      </footer>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<SidePanel />);
}
