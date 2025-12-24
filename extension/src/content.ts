// Content script for monitoring ChatGPT conversations
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
  private supabaseUrl: string = '';
  private supabaseAnonKey: string = '';
  private readonly BATCH_INTERVAL = 5000; // 5 seconds
  private batchTimer: number | null = null;

  constructor() {
    console.log('[Memory Layer] 🚀 ConversationMonitor created');
    this.loadSupabaseConfig();
    this.initializeThread();
    this.startMonitoring();
  }

  private async loadSupabaseConfig() {
    return new Promise<void>((resolve) => {
      chrome.storage.local.get(['supabaseUrl', 'supabaseAnonKey'], (result) => {
        this.supabaseUrl = result.supabaseUrl || '';
        this.supabaseAnonKey = result.supabaseAnonKey || '';
        if (!this.supabaseUrl || !this.supabaseAnonKey) {
          console.warn('[Memory Layer] ⚠️ Supabase not configured');
          console.warn('[Memory Layer] 💡 Configure in the side panel');
        } else {
          console.log('[Memory Layer] ✅ Supabase configured:', this.supabaseUrl);
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
    console.log('[Memory Layer] 📡 Starting to monitor page...');
    // Wait for page to be ready
    if (document.readyState === 'loading') {
      console.log('[Memory Layer] ⏳ Page still loading, waiting for DOMContentLoaded');
      document.addEventListener('DOMContentLoaded', () => {
        console.log('[Memory Layer] ✅ DOMContentLoaded fired');
        this.setupObserver();
      });
    } else {
      console.log('[Memory Layer] ✅ Page already loaded, setting up observer');
      this.setupObserver();
    }
  }

  private setupObserver() {
    // ChatGPT uses specific selectors for messages
    // Updated: Look for container with data-message-author-role elements
    const messageContainer = document.querySelector('[data-message-author-role]')?.closest('main') ||
                            document.querySelector('[data-testid="conversation-turn"]')?.parentElement ||
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

  private isTabVisible(): boolean {
    // Only process if tab is visible (not in background)
    return !document.hidden;
  }

  private extractMessages() {
    // Don't process if tab is in background (saves API costs)
    if (!this.isTabVisible()) {
      return;
    }

    // ChatGPT message selectors - Updated for current UI
    // Based on inspection: messages have data-message-author-role attribute
    let messageElements = document.querySelectorAll('[data-message-author-role]');
    
    // Fallback to old selector
    if (messageElements.length === 0) {
      messageElements = document.querySelectorAll('[data-testid="conversation-turn"]');
    }
    
    // If still no messages, try alternative selectors
    if (messageElements.length === 0) {
      console.log('[Memory Layer] ⚠️ No messages found with primary selectors. Trying alternatives...');
      const altSelectors = [
        'div[class*="message"]',
        'div[class*="Message"]',
        '[role="article"]',
        'div[data-message-id]'
      ];
      
      for (const selector of altSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          console.log('[Memory Layer] ✅ Found', elements.length, 'elements with selector:', selector);
          messageElements = elements;
          break;
        }
      }
    } else {
      // Only log if we found messages (avoid spam)
      if (messageElements.length !== this.observedMessages.size) {
        console.log('[Memory Layer] ✅ Found', messageElements.length, 'message elements');
      }
    }
    
    messageElements.forEach((element) => {
      const messageId = element.getAttribute('data-message-id') || 
                       element.querySelector('[data-message-id]')?.getAttribute('data-message-id') ||
                       `${element.textContent?.substring(0, 50)}_${element.textContent?.length}`;

      if (this.observedMessages.has(messageId)) {
        return;
      }

      // Determine role - element itself or child has data-message-author-role
      const roleIndicator = element.getAttribute('data-message-author-role') ||
                           element.querySelector('[data-message-author-role]')?.getAttribute('data-message-author-role') ||
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

      // Only log new messages (not already observed)
      if (!this.observedMessages.has(messageId)) {
        console.log('[Memory Layer] 📝 Extracted new message:', {
          role: message.role,
          contentPreview: message.content.substring(0, 50) + '...',
          contentLength: message.content.length
        });
      }

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

  private async getActiveThreadId(): Promise<number | null> {
    return new Promise((resolve) => {
      chrome.storage.local.get(['activeThreadId'], (result) => {
        resolve(result.activeThreadId || null);
      });
    });
  }

  private async sendChunk() {
    if (this.currentThread.length === 0) {
      return;
    }

    // Don't send if tab is in background (saves API costs)
    if (!this.isTabVisible()) {
      console.log('[Memory Layer] ⏸️ Tab is in background, skipping chunk send');
      return;
    }

    console.log('[Memory Layer] 📤 Preparing to send chunk with', this.currentThread.length, 'messages');

    const chunk: ConversationChunk = {
      messages: [...this.currentThread],
      threadId: this.threadId,
      timestamp: Date.now()
    };

    // Check user permission
    const hasPermission = await this.checkPermission();
    if (!hasPermission) {
      console.log('[Memory Layer] ❌ User has not granted permission to send data');
      console.log('[Memory Layer] 💡 Click "Enable Memory Layer" in the side panel');
      return;
    }

    if (!this.supabaseUrl || !this.supabaseAnonKey) {
      console.error('[Memory Layer] ❌ Supabase not configured');
      console.error('[Memory Layer] 💡 Configure in the side panel');
      return;
    }

    console.log('[Memory Layer] ✅ Permission granted, Supabase configured');
    console.log('[Memory Layer] 📤 Sending to:', `${this.supabaseUrl}/functions/v1/process-conversation`);

    try {
      const userId = await this.getUserId();
      const activeThreadId = await this.getActiveThreadId();
      console.log('[Memory Layer] 👤 User ID:', userId);
      if (activeThreadId) {
        console.log('[Memory Layer] 🧵 Active Thread ID:', activeThreadId);
      }
      
      // Call Supabase Edge Function
      const response = await fetch(`${this.supabaseUrl}/functions/v1/process-conversation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.supabaseAnonKey}`
        },
        body: JSON.stringify({
          userId,
          chunk,
          activeThreadId: activeThreadId || undefined
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('[Memory Layer] ✅ Successfully sent conversation chunk!', result);
        
        // Update active thread if one was assigned/created
        if (result.thread?.id) {
          chrome.storage.local.set({ activeThreadId: result.thread.id });
          console.log('[Memory Layer] 🧵 Active thread updated:', result.thread.title);
        }
        
        // Clear sent messages but keep thread ID
        this.currentThread = [];
      } else {
        const errorText = await response.text();
        console.error('[Memory Layer] ❌ Failed to send chunk:', response.status, errorText);
      }
    } catch (error) {
      console.error('[Memory Layer] ❌ Error sending chunk:', error);
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
    if (!hasPermission) {
      return [];
    }

    if (!this.supabaseUrl || !this.supabaseAnonKey) {
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

// Initialize monitor - ALWAYS log to verify script loads
console.log('[Memory Layer] ========================================');
console.log('[Memory Layer] Content script loaded!');
console.log('[Memory Layer] Hostname:', window.location.hostname);
console.log('[Memory Layer] Full URL:', window.location.href);
console.log('[Memory Layer] ========================================');

// ChatGPT conversation monitoring is DISABLED - app has pivoted to screen-aware AI assistant
// The extension now focuses on page context and overlay chat, not ChatGPT memory extraction
if (window.location.hostname === 'chat.openai.com' || 
    window.location.hostname === 'chatgpt.com' || 
    window.location.hostname.includes('openai.com') ||
    window.location.hostname.includes('chatgpt.com')) {
  console.log('[Memory Layer] ℹ️ ChatGPT page detected - conversation monitoring is disabled');
  console.log('[Memory Layer] 💡 Use the side panel or overlay chat for AI assistance');
  
  // Only keep message listener for side panel context requests (on-demand only, no automatic processing)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_CURRENT_CONTEXT') {
      // Extract current conversation context for side panel (on-demand only)
      let messageEls = document.querySelectorAll('[data-message-author-role]');
      if (messageEls.length === 0) {
        messageEls = document.querySelectorAll('[data-testid="conversation-turn"]');
      }
      
      const messages = Array.from(messageEls)
        .slice(-3) // Last 3 messages
        .map((el) => {
          const text = el.textContent || '';
          return text.substring(0, 500); // Limit context size
        })
        .join(' ');
      
      sendResponse({ context: messages });
      return true;
    }
  });
}

