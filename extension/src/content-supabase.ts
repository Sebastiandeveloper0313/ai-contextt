// Content script for monitoring ChatGPT conversations - Supabase Edge Functions version
interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  messageId: string;
}

interface ConversationChunk {
  messages: Message[];
  threadId: string;
  timestamp: number;
}

class ConversationMonitor {
  private observedMessages: Set<string> = new Set();
  private currentThread: Message[] = [];
  private threadId: string = '';
  private observer: MutationObserver | null = null;
  // Get Supabase URL from extension storage or use default
  private supabaseUrl: string = '';
  private supabaseAnonKey: string = '';
  private readonly BATCH_INTERVAL = 5000; // 5 seconds
  private batchTimer: number | null = null;

  constructor() {
    this.loadSupabaseConfig();
    this.initializeThread();
    this.startMonitoring();
  }

  private async loadSupabaseConfig() {
    // Get Supabase config from storage (set by user or extension options)
    return new Promise<void>((resolve) => {
      chrome.storage.local.get(['supabaseUrl', 'supabaseAnonKey'], (result) => {
        this.supabaseUrl = result.supabaseUrl || '';
        this.supabaseAnonKey = result.supabaseAnonKey || '';
        if (!this.supabaseUrl || !this.supabaseAnonKey) {
          console.warn('[Memory Layer] Supabase config not set. Go to extension options to configure.');
        }
        resolve();
      });
    });
  }

  private initializeThread() {
    this.threadId = `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.currentThread = [];
  }

  private startMonitoring() {
    // Wait for page to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupObserver());
    } else {
      this.setupObserver();
    }
  }

  private setupObserver() {
    // ChatGPT uses specific selectors for messages
    const messageContainer = document.querySelector('[data-testid="conversation-turn"]')?.parentElement ||
                            document.querySelector('main') ||
                            document.body;

    if (!messageContainer) {
      console.warn('[Memory Layer] Could not find message container, retrying...');
      setTimeout(() => this.setupObserver(), 1000);
      return;
    }

    this.observer = new MutationObserver(() => {
      this.extractMessages();
    });

    this.observer.observe(messageContainer, {
      childList: true,
      subtree: true
    });

    // Initial extraction
    this.extractMessages();
  }

  private extractMessages() {
    // ChatGPT message selectors (updated for current UI)
    const messageElements = document.querySelectorAll('[data-testid="conversation-turn"]');
    
    // Debug: Log what we find
    if (messageElements.length > 0) {
      console.log('[Memory Layer] Found', messageElements.length, 'message elements');
    }
    
    messageElements.forEach((element) => {
      const messageId = element.getAttribute('data-message-id') || 
                       element.querySelector('[data-message-id]')?.getAttribute('data-message-id') ||
                       `${element.textContent?.substring(0, 50)}_${element.textContent?.length}`;

      if (this.observedMessages.has(messageId)) {
        return;
      }

      // Determine role
      const roleIndicator = element.querySelector('[data-message-author-role]')?.getAttribute('data-message-author-role') ||
                           (element.textContent?.includes('ChatGPT') || element.querySelector('svg') ? 'assistant' : 'user');

      // Extract text content
      const textContent = this.extractTextContent(element);
      
      if (!textContent || textContent.trim().length < 10) {
        return;
      }

      const message: Message = {
        role: roleIndicator === 'assistant' ? 'assistant' : 'user',
        content: textContent,
        timestamp: Date.now(),
        messageId
      };

      this.observedMessages.add(messageId);
      this.currentThread.push(message);

      // Check if we should start a new thread (e.g., new chat session)
      this.checkThreadBoundary();
    });

    // Schedule batch send
    this.scheduleBatchSend();
  }

  private extractTextContent(element: Element): string {
    // Try to find the main message content
    const contentSelectors = [
      '[data-message-content]',
      '.markdown',
      '.prose',
      'div[class*="message"]',
      'div[class*="content"]'
    ];

    for (const selector of contentSelectors) {
      const contentEl = element.querySelector(selector);
      if (contentEl) {
        return contentEl.textContent || '';
      }
    }

    // Fallback: get all text
    return element.textContent || '';
  }

  private checkThreadBoundary() {
    // Detect new chat session (ChatGPT creates new conversation containers)
    const conversationTurns = document.querySelectorAll('[data-testid="conversation-turn"]');
    if (conversationTurns.length === 0 && this.currentThread.length > 0) {
      // New chat detected
      this.sendChunk();
      this.initializeThread();
    }
  }

  private scheduleBatchSend() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    this.batchTimer = window.setTimeout(() => {
      if (this.currentThread.length > 0) {
        this.sendChunk();
      }
    }, this.BATCH_INTERVAL);
  }

  private async sendChunk() {
    if (this.currentThread.length === 0) {
      return;
    }

    const chunk: ConversationChunk = {
      messages: [...this.currentThread],
      threadId: this.threadId,
      timestamp: Date.now()
    };

    // Check user permission
    const hasPermission = await this.checkPermission();
    if (!hasPermission) {
      console.log('[Memory Layer] User has not granted permission to send data');
      return;
    }

    if (!this.supabaseUrl || !this.supabaseAnonKey) {
      console.error('[Memory Layer] Supabase not configured');
      return;
    }

    try {
      const userId = await this.getUserId();
      
      // Call Supabase Edge Function
      const response = await fetch(`${this.supabaseUrl}/functions/v1/process-conversation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.supabaseAnonKey}`
        },
        body: JSON.stringify({
          userId,
          chunk
        })
      });

      if (response.ok) {
        console.log('[Memory Layer] Successfully sent conversation chunk');
        // Clear sent messages but keep thread ID
        this.currentThread = [];
      } else {
        const errorText = await response.text();
        console.error('[Memory Layer] Failed to send chunk:', response.status, errorText);
      }
    } catch (error) {
      console.error('[Memory Layer] Error sending chunk:', error);
    }
  }

  private async checkPermission(): Promise<boolean> {
    return new Promise((resolve) => {
      chrome.storage.local.get(['hasPermission'], (result) => {
        resolve(result.hasPermission === true);
      });
    });
  }

  private async getUserId(): Promise<string> {
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
  }

  public async getRelevantContext(query: string): Promise<any[]> {
    const hasPermission = await this.checkPermission();
    if (!hasPermission || !this.supabaseUrl || !this.supabaseAnonKey) {
      return [];
    }

    try {
      const userId = await this.getUserId();
      const response = await fetch(`${this.supabaseUrl}/functions/v1/search-memories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.supabaseAnonKey}`
        },
        body: JSON.stringify({
          userId,
          query
        })
      });

      if (response.ok) {
        const data = await response.json();
        return data.memories || [];
      }
    } catch (error) {
      console.error('[Memory Layer] Error fetching context:', error);
    }

    return [];
  }
}

// Initialize monitor
if (window.location.hostname === 'chat.openai.com') {
  console.log('[Memory Layer] Initializing on ChatGPT page');
  const monitor = new ConversationMonitor();
  
  // Expose to background script
  (window as any).memoryLayerMonitor = monitor;

  // Listen for messages from side panel
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_CURRENT_CONTEXT') {
      const messages = Array.from(document.querySelectorAll('[data-testid="conversation-turn"]'))
        .slice(-3)
        .map((el) => {
          const text = el.textContent || '';
          return text.substring(0, 500);
        })
        .join(' ');
      
      sendResponse({ context: messages });
      return true;
    }

    if (message.type === 'FETCH_CONTEXT') {
      monitor.getRelevantContext(message.query).then((memories) => {
        sendResponse({ memories });
      });
      return true;
    }

    if (message.type === 'INJECT_CONTEXT') {
      const textarea = document.querySelector('textarea[data-id="root"]') as HTMLTextAreaElement ||
                      document.querySelector('textarea') as HTMLTextAreaElement;
      
      if (textarea) {
        const currentValue = textarea.value || '';
        const newValue = `${message.context}\n\n---\n\n${currentValue}`;
        textarea.value = newValue;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
      sendResponse({ success: true });
      return true;
    }
  });
}


