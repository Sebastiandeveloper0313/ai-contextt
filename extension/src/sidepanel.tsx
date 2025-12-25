import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import ReactMarkdown from 'react-markdown';
import './sidepanel.css';
import Auth from './auth';
import { ExecutionEngine, ExecutionStep, ExecutionResult, ExecutionStatus } from './execution-engine';

// Removed Memory and Thread interfaces - no longer using these features

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  mode?: 'ask' | 'do';
  plan?: {
    intent: string;
    steps: string[];
    outputType?: 'sheet' | 'csv' | 'table' | 'text';
    requiresConfirmation: boolean;
  };
  csvData?: string; // Store CSV data for easy copying
}

interface PlanState {
  plan: ChatMessage['plan'];
  messageId: string;
  isExecuting: boolean;
  executionResults: ExecutionResult[];
  currentStep: number;
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
  const [planState, setPlanState] = useState<PlanState | null>(null);
  const [executionStatus, setExecutionStatus] = useState<ExecutionStatus>(ExecutionStatus.STOPPED);
  const [executionStatusMessage, setExecutionStatusMessage] = useState<string>('');
  const [executionContext, setExecutionContext] = useState<{ tabId: number; windowId: number } | null>(null);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const messagesContainerRef = React.useRef<HTMLDivElement>(null);
  const executionEngine = React.useRef(new ExecutionEngine());

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
          // Only send last 3 messages to avoid context pollution between unrelated tasks
          conversationHistory: messages.slice(-3).map(m => ({
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
      
      // For DO mode, don't add a message - just execute silently
      if (chatData.mode === 'do' && chatData.plan) {
        // Start execution immediately without showing any message
        const newPlanState = {
          plan: chatData.plan,
          messageId: (Date.now() + 1).toString(),
          isExecuting: true,
          executionResults: [],
          currentStep: 0
        };
        setPlanState(newPlanState);
        // Execute plan immediately with the plan directly (don't wait for state)
        // Pass the original user message so we can extract the exact query
        executePlanWithPlan(chatData.plan, input);
      } else {
        // Regular chat response
        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: chatData.response || 'I apologize, but I could not generate a response.',
          timestamp: Date.now(),
          mode: chatData.mode || 'ask',
          plan: chatData.plan
        };

        const finalMessages = [...newMessages, assistantMessage];
        setMessages(finalMessages);
        saveChatHistory(finalMessages);
      }
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

  const executePlanWithPlan = async (plan: any, originalUserMessage?: string) => {
    // Auto-execute immediately without showing plan
    setPlanState({
      plan: plan,
      messageId: (Date.now() + 1).toString(),
      isExecuting: true,
      executionResults: [],
      currentStep: 0
    });
    
    const currentPlan = plan;

    // Convert plan steps to execution steps
    // Track mapping: executionStepIndex -> planStepIndex
    let executionSteps: ExecutionStep[] = [];
    let stepMapping: Map<number, number> = new Map(); // execution index -> plan index
    let previousWasSearch = false;
    
    console.log('[Execute Plan] Converting', currentPlan.steps.length, 'plan steps to execution steps');
    
    // SIMPLIFIED: For discovery tasks, extract search query from intent and add search step first
    const intent = currentPlan.intent.toLowerCase();
    const isDiscoveryTask = intent.includes('find') || intent.includes('top') || intent.includes('best') || 
                            intent.includes('search') || intent.includes('discover') || intent.includes('get');
    
    // Check if plan already has a search step
    const planHasSearchStep = currentPlan.steps.some(s => {
      const lower = s.toLowerCase();
      return lower.includes('search') || (lower.includes('google') && lower.includes('search'));
    });
    
    if (isDiscoveryTask && !planHasSearchStep) {
      // Extract the main query from the intent
      // "Find the top 5 best email marketing tools" -> "top 5 best email marketing tools"
      // IMPORTANT: Preserve the entire query including numbers and all keywords
      // Extract query from user's ORIGINAL message, not from backend-modified intent
      // This ensures we preserve exactly what the user asked for (numbers, "best", etc.)
      let searchQuery = originalUserMessage || currentPlan.intent;
      
      console.log('[Execute Plan] Using original user message for query extraction:', searchQuery);
      console.log('[Execute Plan] Backend intent (for reference):', currentPlan.intent);
      
      // Remove common action prefixes (but preserve numbers, "top", "best", etc.)
      searchQuery = searchQuery.replace(/^(find|search for|get|discover|look for|find me|search)\s+/i, '');
      
      // Remove "and put them in" or similar output instructions - be very careful to preserve the query
      const andMatch = searchQuery.match(/\s+and\s+(put|create|add|save|write|export|into|in a|in the|to a|to the)/i);
      if (andMatch && andMatch.index !== undefined) {
        searchQuery = searchQuery.substring(0, andMatch.index).trim();
      }
      
      // Remove trailing phrases that backend might add - be very specific to avoid removing user's actual query
      // Only remove if it's clearly a backend addition (phrases like "on a reliable website", "on a trusted review site", etc.)
      searchQuery = searchQuery.replace(/\s+(on|in|from|at)\s+(a|an|the)\s+(reliable|trusted|review|website|site|page|source|platform|review site|trusted site).*$/i, '').trim();
      // Remove standalone qualifiers at the end (but only if they're clearly not part of the user's query)
      searchQuery = searchQuery.replace(/\s+(on a reliable|on a trusted|on reliable|on trusted|reliable website|trusted website|review website|review site|trusted site|reliable site|reliable platform|trusted platform).*$/i, '').trim();
      // Remove "here" if it's at the very end (user might say "here in gothenburg" which is valid)
      // Only remove "here" if it's followed by nothing or just backend additions
      if (searchQuery.toLowerCase().endsWith(' here') && !searchQuery.toLowerCase().includes('here in')) {
        searchQuery = searchQuery.replace(/\s+here\s*$/i, '').trim();
      }
      
      console.log('[Execute Plan] Discovery task detected, adding search step with query:', searchQuery);
      console.log('[Execute Plan] Original intent:', currentPlan.intent);
      
      // Validate search query is not empty
      if (!searchQuery || searchQuery.trim().length === 0) {
        console.error('[Execute Plan] ERROR: Search query is empty after extraction!');
        console.error('[Execute Plan] Original intent was:', currentPlan.intent);
        // Fallback: use the original intent as-is
        searchQuery = currentPlan.intent;
      }
      
      executionSteps.push({
        type: 'search',
        description: `Search for: ${searchQuery}`,
        params: { query: searchQuery }
      });
      stepMapping.set(0, 0); // Map to first plan step
      previousWasSearch = true;
    }
    
    for (let planIndex = 0; planIndex < currentPlan.steps.length; planIndex++) {
      const step = currentPlan.steps[planIndex];
      const lowerStep = step.toLowerCase();
      
      // Skip navigation steps without URLs for discovery tasks (we already have search)
      if (isDiscoveryTask && (lowerStep.includes('navigate') || lowerStep.includes('go to'))) {
        const url = step.match(/https?:\/\/[^\s]+/)?.[0] || '';
        if (!url) {
          console.log('[Execute Plan] Skipping navigation step without URL for discovery task:', step);
          continue; // Skip this step
        }
      }
      
      // Skip search steps if we already added one automatically for discovery tasks
      if (lowerStep.includes('search') || (lowerStep.includes('google') && lowerStep.includes('search'))) {
        if (isDiscoveryTask && !planHasSearchStep && executionSteps.some(s => s.type === 'search')) {
          console.log('[Execute Plan] Skipping duplicate search step from plan (already added automatically):', step);
          previousWasSearch = true;
          continue;
        }
        const query = step.match(/search.*?for\s+["']?([^"']+)["']?/i)?.[1] || 
                      step.match(/["']([^"']+)["']/)?.[1] || '';
        const execIndex = executionSteps.length;
        executionSteps.push({
          type: 'search' as const,
          description: step,
          params: { query }
        });
        stepMapping.set(execIndex, planIndex);
        previousWasSearch = true;
      } else if (lowerStep.includes('extract') || lowerStep.includes('get') || lowerStep.includes('collect') || 
                 lowerStep.includes('compile') || lowerStep.includes('list')) {
        // After a search step, extract from search results
        // Otherwise use generic selectors
        const execIndex = executionSteps.length;
        executionSteps.push({
          type: 'extract' as const,
          description: step,
          params: { selector: previousWasSearch ? 'div.g, div[data-ved]' : 'div.g, div[data-ved], .result, .item, a, h3' }
        });
        stepMapping.set(execIndex, planIndex);
        previousWasSearch = false;
      } else if (lowerStep.includes('navigate') || lowerStep.includes('go to')) {
        const url = step.match(/https?:\/\/[^\s]+/)?.[0] || '';
        if (url) {
          const execIndex = executionSteps.length;
          executionSteps.push({
            type: 'navigate' as const,
            description: step,
            params: { url }
          });
          stepMapping.set(execIndex, planIndex);
        }
        // Skip if no URL found (might be "open a new tab" which we don't need)
        previousWasSearch = false;
      } else if (lowerStep.includes('open') && (lowerStep.includes('tab') || lowerStep.includes('new tab'))) {
        // Skip "open a new tab" - navigate() will create tabs automatically
        // We'll mark it as automatically completed (not skipped) in the UI
        console.log('[Execute Plan] Skipping "open new tab" step - tabs are created automatically during navigation');
        previousWasSearch = false;
        // Don't add any execution step, but mark the plan step as auto-completed
        // The next navigation step will handle tab creation
      } else if (lowerStep.includes('create') && (lowerStep.includes('sheet') || lowerStep.includes('csv'))) {
        const execIndex = executionSteps.length;
        executionSteps.push({
          type: 'create_output' as const,
          description: step,
          params: { outputType: currentPlan.outputType || 'csv' }
        });
        stepMapping.set(execIndex, planIndex);
        previousWasSearch = false;
      } else if (lowerStep.includes('wait') || lowerStep.includes('delay')) {
        const execIndex = executionSteps.length;
        executionSteps.push({
          type: 'wait' as const,
          description: step,
          params: { text: '2000' } // 2 seconds for page loads
        });
        stepMapping.set(execIndex, planIndex);
        previousWasSearch = false;
      } else {
        // For steps like "compile list" or "format", add a wait to ensure page is loaded
        if (previousWasSearch) {
          const execIndex = executionSteps.length;
          executionSteps.push({
            type: 'wait' as const,
            description: 'Wait for page to load',
            params: { text: '2000' }
          });
          stepMapping.set(execIndex, planIndex);
        }
        previousWasSearch = false;
      }
    }
    
    console.log('[Execute Plan] Created', executionSteps.length, 'execution steps:', executionSteps.map(s => s.type));

    // Ensure proper step order: search -> extract -> create output
    if (currentPlan.outputType && currentPlan.outputType !== 'text') {
      const hasExtraction = executionSteps.some(s => s.type === 'extract');
      const hasSearch = executionSteps.some(s => s.type === 'search');
      const hasOutput = executionSteps.some(s => s.type === 'create_output');
      
      // If we have a search but no extraction, add extraction after search
      if (hasSearch && !hasExtraction) {
        let lastSearchIndex = -1;
        for (let i = executionSteps.length - 1; i >= 0; i--) {
          if (executionSteps[i].type === 'search') {
            lastSearchIndex = i;
            break;
          }
        }
        if (lastSearchIndex >= 0) {
          // Find the plan index for the search step
          const searchPlanIndex = Array.from(stepMapping.entries()).find(([execIdx]) => execIdx === lastSearchIndex)?.[1] ?? lastSearchIndex;
          
          // Rebuild stepMapping for all steps after lastSearchIndex since we're inserting
          const newMapping = new Map<number, number>();
          for (const [execIdx, planIdx] of stepMapping.entries()) {
            if (execIdx <= lastSearchIndex) {
              newMapping.set(execIdx, planIdx);
            } else {
              // Shift indices for steps after insertion point
              newMapping.set(execIdx + 2, planIdx);
            }
          }
          
          executionSteps.splice(lastSearchIndex + 1, 0, {
            type: 'wait',
            description: 'Wait for search results to load',
            params: { text: '2000' }
          });
          newMapping.set(lastSearchIndex + 1, searchPlanIndex);
          executionSteps.splice(lastSearchIndex + 2, 0, {
            type: 'extract',
            description: 'Extract search results',
            params: { selector: 'div.g, div[data-ved]' }
          });
          newMapping.set(lastSearchIndex + 2, searchPlanIndex);
          
          // Update stepMapping
          stepMapping.clear();
          for (const [k, v] of newMapping.entries()) {
            stepMapping.set(k, v);
          }
        }
      }
      
      // Move all create_output steps to the end, after extraction
      // First, collect output steps before rebuilding
      const outputSteps: ExecutionStep[] = [];
      const outputStepIndices = new Set<number>();
      for (let i = 0; i < executionSteps.length; i++) {
        if (executionSteps[i].type === 'create_output') {
          outputSteps.push(executionSteps[i]);
          outputStepIndices.add(i);
        }
      }
      
      // Rebuild executionSteps and stepMapping
      const newSteps: ExecutionStep[] = [];
      const newMapping = new Map<number, number>();
      let newIndex = 0;
      
      for (let i = 0; i < executionSteps.length; i++) {
        if (!outputStepIndices.has(i)) {
          newSteps.push(executionSteps[i]);
          const planIndex = stepMapping.get(i);
          if (planIndex !== undefined) {
            newMapping.set(newIndex, planIndex);
          }
          newIndex++;
        }
      }
      
      executionSteps = newSteps;
      stepMapping = newMapping;
      
      // Add output creation at the end if not already present
      if (!hasOutput && outputSteps.length === 0) {
        const execIndex = executionSteps.length;
        const lastPlanIndex = currentPlan.steps.length - 1;
        executionSteps.push({
          type: 'create_output',
          description: `Create ${currentPlan.outputType} output`,
          params: { outputType: currentPlan.outputType }
        });
        stepMapping.set(execIndex, lastPlanIndex);
      } else if (outputSteps.length > 0) {
        // Add existing output steps at the end
        const lastPlanIndex = currentPlan.steps.length - 1;
        outputSteps.forEach((step, idx) => {
          const execIndex = executionSteps.length;
          executionSteps.push(step);
          stepMapping.set(execIndex, lastPlanIndex);
        });
      }
    }
    
    console.log('[Execute Plan] Final execution steps:', executionSteps.length);
    if (executionSteps.length === 0) {
      console.error('[Execute Plan] No execution steps created!');
      setPlanState(prev => prev ? {
        ...prev,
        isExecuting: false,
        executionResults: [{
          success: false,
          stepIndex: 0,
          status: 'No executable steps',
          error: 'Could not convert plan steps to executable actions'
        }]
      } : null);
      return;
    }

    // Log the step mapping for debugging
    console.log('[Execute Plan] Step mapping:', Array.from(stepMapping.entries()).map(([exec, plan]) => `exec ${exec} -> plan ${plan}`));
    
    // Status change handler
    const handleStatusChange = (status: ExecutionStatus, message: string) => {
      setExecutionStatus(status);
      setExecutionStatusMessage(message);
      
      // Update execution context when available
      const context = executionEngine.current.getExecutionContext();
      if (context) {
        setExecutionContext({ tabId: context.tabId, windowId: context.windowId });
      } else {
        setExecutionContext(null);
      }
    };
    
    executionEngine.current.executePlan(
      executionSteps,
      (result: ExecutionResult) => {
        // Map execution step index to plan step index
        const planStepIndex = stepMapping.get(result.stepIndex);
        console.log('[Execute Plan] Result from execution step', result.stepIndex, 'mapped to plan step', planStepIndex, 'status:', result.status, 'success:', result.success);
        
        if (planStepIndex === undefined) {
          console.warn('[Execute Plan] No mapping found for execution step', result.stepIndex, '- skipping result');
          // Don't add unmapped results
          return;
        }
        
        const mappedResult = { ...result, stepIndex: planStepIndex };
        console.log('[Execute Plan] Adding mapped result:', { planStep: planStepIndex, status: mappedResult.status, success: mappedResult.success });
        
        setPlanState(prev => {
          if (!prev) return null;
          
          // Check if we already have a result for this plan step
          const existingIndex = prev.executionResults.findIndex(r => r.stepIndex === planStepIndex);
          let newResults: ExecutionResult[];
          
          if (existingIndex >= 0) {
            // Replace existing result
            newResults = [...prev.executionResults];
            newResults[existingIndex] = mappedResult;
            console.log('[Execute Plan] Replaced existing result for plan step', planStepIndex);
          } else {
            // Add new result
            newResults = [...prev.executionResults, mappedResult];
            console.log('[Execute Plan] Added new result for plan step', planStepIndex);
          }
          
          return {
            ...prev,
            executionResults: newResults,
            currentStep: planStepIndex
          };
        });
      },
      (results: ExecutionResult[]) => {
        const successCount = results.filter(r => r.success).length;
        const totalSteps = results.length;
        
        // Get final status from execution engine
        const finalStatus = executionEngine.current.getStatus();
        setExecutionStatus(finalStatus);
        setExecutionStatusMessage(finalStatus === ExecutionStatus.COMPLETED ? 'Execution completed' : 
                                 finalStatus === ExecutionStatus.FAILED ? 'Execution failed' :
                                 'Execution stopped');
        setExecutionContext(null);
        
        // Find output step data (if any)
        const outputStep = results.find(r => r.data?.rowCount || r.data?.csv || r.data?.spreadsheetId);
        
        // ChatGPT style: Only show result if successful, or simple error message
        if (finalStatus === ExecutionStatus.COMPLETED && outputStep?.data) {
          const rowCount = outputStep.data.rowCount || 0;
          let resultText = '';
          
          if (outputStep.data.spreadsheetUrl) {
            resultText = `I've created a Google Sheet with ${rowCount} ${rowCount === 1 ? 'result' : 'results'}.\n\n[Open Sheet](${outputStep.data.spreadsheetUrl})`;
          } else if (outputStep.data.csv) {
            resultText = `I've collected ${rowCount} ${rowCount === 1 ? 'result' : 'results'}.`;
            // Store CSV for copy button
            if (outputStep.data.csv) {
              setMessages(prev => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.mode === 'do') {
                  return [...prev.slice(0, -1), { ...lastMsg, csvData: outputStep.data.csv }];
                }
                return prev;
              });
            }
          } else {
            resultText = `Done. Found ${rowCount} ${rowCount === 1 ? 'result' : 'results'}.`;
          }
          
          if (resultText) {
            const completionMessage: ChatMessage = {
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              content: resultText,
              timestamp: Date.now(),
              mode: 'do',
              csvData: outputStep?.data?.csv
            };
            // Use functional update to ensure we have the latest messages (including user's message)
            setMessages(prev => {
              const updated = [...prev, completionMessage];
              saveChatHistory(updated);
              return updated;
            });
          }
        } else if (finalStatus === ExecutionStatus.FAILED) {
          // Simple error message - ChatGPT style
          const errorMessage: ChatMessage = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `I couldn't complete this. ${outputStep?.data?.rowCount ? `I found ${outputStep.data.rowCount} results, but couldn't finish.` : 'No results were found.'}`,
            timestamp: Date.now(),
            mode: 'do'
          };
          // Use functional update to ensure we have the latest messages (including user's message)
          setMessages(prev => {
            const updated = [...prev, errorMessage];
            saveChatHistory(updated);
            return updated;
          });
        }

        // Clear plan state after a short delay to show completion
        setTimeout(() => {
          setPlanState(null);
        }, 2000); // 2 second delay to show completion status
      },
      handleStatusChange,
      currentPlan.intent // Pass task intent for classification
    );
  };

  const cancelPlan = () => {
    if (planState?.isExecuting) {
      executionEngine.current.stop();
    }
    setPlanState(null);
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
                
                {/* Copy CSV button if message has CSV data */}
                {msg.csvData && (
                  <div style={{ marginTop: '8px' }}>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(msg.csvData!);
                          alert('CSV data copied to clipboard! Go to Google Sheets, select cell A1, and press Ctrl+V to paste.');
                        } catch (err) {
                          console.error('Failed to copy:', err);
                          // Fallback: show in alert
                          alert('Copy failed. CSV data:\n\n' + msg.csvData!.substring(0, 500) + '...');
                        }
                      }}
                      style={{
                        padding: '6px 12px',
                        fontSize: '12px',
                        border: '1px solid #2196f3',
                        borderRadius: '6px',
                        backgroundColor: '#fff',
                        color: '#2196f3',
                        cursor: 'pointer',
                        fontWeight: '600',
                        marginTop: '8px'
                      }}
                    >
                      📋 Copy CSV to Clipboard
                    </button>
                  </div>
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

        {/* Execution status - ChatGPT style: "Doing: <action>" */}
        {planState && planState.isExecuting && (
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
              <span className="pulse-animation">
                {executionStatusMessage ? `Doing: ${executionStatusMessage}` :
                 executionStatus === ExecutionStatus.RUNNING ? 'Doing: Working on it...' : 
                 executionStatus === ExecutionStatus.PAUSED ? 'Paused' :
                 'Doing: Starting...'}
              </span>
            </div>
          </div>
        )}

        {/* OLD DO MODE UI - HIDDEN */}
        {false && planState && planState.plan && (
          <div style={{
            margin: '12px',
            padding: '16px',
            backgroundColor: '#f0f7ff',
            border: '2px solid #2196f3',
            borderRadius: '8px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>🤖</span>
                <strong style={{ fontSize: '14px', color: '#2196f3' }}>DO Mode: {planState.plan.intent}</strong>
              </div>
              {planState.isExecuting && (
                <div style={{ display: 'flex', gap: '4px' }}>
                  {executionStatus === ExecutionStatus.PAUSED ? (
                    <>
                      <button
                        onClick={() => executionEngine.current.resume()}
                        style={{
                          padding: '4px 12px',
                          fontSize: '12px',
                          border: '1px solid #4caf50',
                          borderRadius: '4px',
                          backgroundColor: '#fff',
                          color: '#4caf50',
                          cursor: 'pointer'
                        }}
                      >
                        Resume
                      </button>
                      <button
                        onClick={() => executionEngine.current.abort()}
                        style={{
                          padding: '4px 12px',
                          fontSize: '12px',
                          border: '1px solid #f44336',
                          borderRadius: '4px',
                          backgroundColor: '#fff',
                          color: '#f44336',
                          cursor: 'pointer'
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : executionStatus === ExecutionStatus.RUNNING ? (
                    <>
                      <button
                        onClick={() => executionEngine.current.pause()}
                        style={{
                          padding: '4px 12px',
                          fontSize: '12px',
                          border: '1px solid #ff9800',
                          borderRadius: '4px',
                          backgroundColor: '#fff',
                          color: '#ff9800',
                          cursor: 'pointer'
                        }}
                      >
                        Pause
                      </button>
                      <button
                        onClick={() => executionEngine.current.abort()}
                        style={{
                          padding: '4px 12px',
                          fontSize: '12px',
                          border: '1px solid #f44336',
                          borderRadius: '4px',
                          backgroundColor: '#fff',
                          color: '#f44336',
                          cursor: 'pointer'
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={cancelPlan}
                      style={{
                        padding: '4px 12px',
                        fontSize: '12px',
                        border: '1px solid #f44336',
                        borderRadius: '4px',
                        backgroundColor: '#fff',
                        color: '#f44336',
                        cursor: 'pointer'
                      }}
                    >
                      Stop
                    </button>
                  )}
                </div>
              )}
            </div>
            
            {/* Execution Status Display */}
            {planState.isExecuting && executionStatusMessage && (
              <div style={{
                marginBottom: '12px',
                padding: '8px 12px',
                borderRadius: '6px',
                backgroundColor: executionStatus === ExecutionStatus.PAUSED ? '#fff3cd' :
                                 executionStatus === ExecutionStatus.ABORTED ? '#f8d7da' :
                                 executionStatus === ExecutionStatus.RUNNING ? '#d1ecf1' : '#d4edda',
                border: `1px solid ${executionStatus === ExecutionStatus.PAUSED ? '#ffc107' :
                                       executionStatus === ExecutionStatus.ABORTED ? '#f5c6cb' :
                                       executionStatus === ExecutionStatus.RUNNING ? '#bee5eb' : '#c3e6cb'}`,
                fontSize: '12px',
                color: executionStatus === ExecutionStatus.PAUSED ? '#856404' :
                       executionStatus === ExecutionStatus.ABORTED ? '#721c24' :
                       executionStatus === ExecutionStatus.RUNNING ? '#0c5460' : '#155724'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>
                    {executionStatus === ExecutionStatus.PAUSED ? '⏸️' :
                     executionStatus === ExecutionStatus.ABORTED ? '❌' :
                     executionStatus === ExecutionStatus.RUNNING ? '▶️' : '✅'}
                  </span>
                  <span style={{ fontWeight: '600' }}>{executionStatusMessage}</span>
                </div>
                {executionContext && (
                  <div style={{ marginTop: '4px', fontSize: '11px', opacity: 0.8 }}>
                    Executing in tab {executionContext.tabId}
                  </div>
                )}
              </div>
            )}

            <div style={{ marginBottom: '12px' }}>
              <strong style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '8px' }}>Execution Plan:</strong>
              <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '13px' }}>
                {planState?.plan?.steps?.map((step, planIndex) => {
                  const result = planState?.executionResults?.find(r => r.stepIndex === planIndex);
                  const isCurrent = planState?.isExecuting && planState?.currentStep === planIndex;
                  const lowerStep = step.toLowerCase();
                  // Only show as auto-completed if execution has started (not just when viewing the plan)
                  const isAutoCompleted = planState?.isExecuting && (lowerStep.includes('open') && (lowerStep.includes('tab') || lowerStep.includes('new tab')));
                  const isSkipped = (lowerStep.includes('navigate') && !step.match(/https?:\/\/[^\s]+/));
                  
                  return (
                    <li key={planIndex} style={{
                      marginBottom: '4px',
                      color: isSkipped ? '#999' :
                             result?.success === false ? '#f44336' : 
                             result?.success === true || isAutoCompleted ? '#4caf50' :
                             isCurrent ? '#2196f3' : '#333',
                      fontWeight: isCurrent ? '600' : 'normal',
                      fontStyle: isSkipped ? 'italic' : 'normal'
                    }}>
                      {step}
                      {isAutoCompleted && (
                        <span style={{ fontSize: '11px', marginLeft: '8px', color: '#4caf50' }}>
                          ✓ Auto-completed (handled by navigation)
                        </span>
                      )}
                      {isSkipped && (
                        <span style={{ fontSize: '11px', marginLeft: '8px', color: '#999' }}>
                          ⊘ Skipped
                        </span>
                      )}
                      {!isSkipped && !isAutoCompleted && result && (
                        <span style={{ fontSize: '11px', marginLeft: '8px', color: result.success ? '#4caf50' : '#f44336' }}>
                          {result.success ? '✓' : '✗'} {result.status}
                        </span>
                      )}
                      {!isSkipped && !isAutoCompleted && isCurrent && !result && (
                        <span style={{ fontSize: '11px', marginLeft: '8px', color: '#2196f3' }}>
                          ⏳ Executing...
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>

            {planState?.plan?.outputType && (
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>
                Output: {planState.plan.outputType.toUpperCase()}
              </div>
            )}

            {!planState?.isExecuting && planState?.executionResults?.length === 0 && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={executePlan}
                  style={{
                    flex: 1,
                    padding: '8px 16px',
                    fontSize: '13px',
                    border: 'none',
                    borderRadius: '6px',
                    backgroundColor: '#2196f3',
                    color: 'white',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}
                >
                  ✓ Execute Plan
                </button>
                <button
                  onClick={cancelPlan}
                  style={{
                    padding: '8px 16px',
                    fontSize: '13px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    backgroundColor: '#fff',
                    color: '#666',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
            )}

            {!planState?.isExecuting && planState?.executionResults?.length > 0 && (
              <div style={{
                padding: '8px',
                backgroundColor: '#e8f5e9',
                borderRadius: '4px',
                fontSize: '12px',
                color: '#2e7d32',
                textAlign: 'center',
                fontWeight: '600'
              }}>
                ✅ Execution completed successfully
              </div>
            )}
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
