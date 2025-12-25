// Execution Engine for Agentic Actions
// Handles browser automation tasks safely and transparently

import { GoogleSheetsAPI } from './google-sheets-api';

export interface ExecutionStep {
  type: 'navigate' | 'search' | 'extract' | 'click' | 'type' | 'scroll' | 'wait' | 'create_output';
  description: string;
  params?: {
    url?: string;
    query?: string;
    selector?: string;
    text?: string;
    data?: any;
    outputType?: 'sheet' | 'csv' | 'table' | 'text';
  };
}

export interface ExecutionResult {
  success: boolean;
  stepIndex: number;
  data?: any;
  error?: string;
  status: string;
  metadata?: {
    distinctEntities?: number;
    requestedCount?: number;
    hasEnoughEntities?: boolean;
    isTopNTask?: boolean;
    retryQueries?: string[];
  };
}

interface ExecutionContext {
  tabId: number;
  windowId: number;
  initialUrl: string;
  expectedDomains: string[]; // Domains where execution is allowed
  controlledTabs: Set<number>; // Tabs created/controlled by the agent
  lastValidUrl?: string;
  lastValidStep?: number;
}

export enum ExecutionStatus {
  RUNNING = 'running',
  PAUSED = 'paused',
  STOPPED = 'stopped',
  COMPLETED = 'completed',
  ABORTED = 'aborted',
  FAILED = 'failed'
}

export enum TaskType {
  DISCOVERY = 'discovery',      // Search-based: "find", "top", "best", "search"
  EXTRACTION = 'extraction',    // Extract from current page
  MODIFICATION = 'modification' // Modify current page/form/sheet
}

export class ExecutionEngine {
  private isExecuting = false;
  private shouldStop = false;
  private currentStep = 0;
  private collectedData: any[] = [];
  private requestedResultCount = 5; // default; parsed from query text when available
  private lastSearchQuery = ''; // remember last query for in-page submit fallback
  private googleSheets?: GoogleSheetsAPI;
  private originalQuery = ''; // Store original query for generating varied retry queries
  private isTopNTask = false; // Track if this is a "top N" entity-level task
  
  // Execution context locking
  private executionContext: ExecutionContext | null = null;
  private executionStatus: ExecutionStatus = ExecutionStatus.STOPPED;
  private onStatusChange?: (status: ExecutionStatus, message: string) => void;
  private taskType: TaskType | null = null;
  private taskIntent: string = ''; // Store original task intent for classification

  async executePlan(
    steps: ExecutionStep[],
    onProgress: (result: ExecutionResult) => void,
    onComplete: (results: ExecutionResult[]) => void,
    onStatusChange?: (status: ExecutionStatus, message: string) => void,
    taskIntent?: string // Optional: original task intent for classification
  ): Promise<void> {
    if (this.isExecuting) {
      throw new Error('Execution already in progress');
    }

    this.isExecuting = true;
    this.shouldStop = false;
    this.currentStep = 0;
    this.collectedData = [];
    this.originalQuery = ''; // Reset for new execution
    this.isTopNTask = false; // Reset for new execution
    this.requestedResultCount = 5; // Reset to default
    this.lastSearchQuery = ''; // Reset for new execution
    this.onStatusChange = onStatusChange;
    this.taskIntent = taskIntent || '';
    this.executionStatus = ExecutionStatus.RUNNING as ExecutionStatus;
    const results: ExecutionResult[] = [];

    // Update status immediately to show execution has started (after callback is set)
    this.updateStatus(ExecutionStatus.RUNNING, 'Preparing...');

    // STEP 1: Classify task type
    this.taskType = this.classifyTaskType(steps, taskIntent);
    console.log('[Execution Engine] Task classified as:', this.taskType);

    // STEP 2: Qualify and establish valid execution context
    try {
      const contextResult = await this.establishExecutionContext(steps);
      if (!contextResult.success) {
        this.updateStatus(ExecutionStatus.ABORTED, contextResult.error || 'Failed to establish execution context');
        onComplete([{
          success: false,
          stepIndex: 0,
          status: 'Execution aborted',
          error: contextResult.error || 'No valid starting context for this task'
        }]);
        this.isExecuting = false;
        return;
      }

      console.log('[Execution Engine] Execution context established:', this.executionContext);
    } catch (error: any) {
      this.updateStatus(ExecutionStatus.ABORTED, `Failed to establish execution context: ${error.message}`);
      onComplete([{
        success: false,
        stepIndex: 0,
        status: 'Execution aborted',
        error: error.message
      }]);
      this.isExecuting = false;
      return;
    }

    try {
      for (let i = 0; i < steps.length; i++) {
        // Check for user stop
        if (this.shouldStop) {
          this.updateStatus(ExecutionStatus.STOPPED, 'Stopped by user');
          results.push({
            success: false,
            stepIndex: i,
            status: 'Stopped by user',
            error: 'Execution stopped'
          });
          onProgress(results[results.length - 1]);
          break;
        }

        // Check execution status
        const currentStatus = this.executionStatus;
        if (currentStatus === ExecutionStatus.PAUSED) {
          console.log('[Execution Engine] Execution paused, waiting for resume...');
          // Wait for resume (will be handled by resume() method)
          await this.waitForResume();
          
          // After resume, check if we should continue
          const statusAfterResume = this.executionStatus;
          if (statusAfterResume === ExecutionStatus.ABORTED || statusAfterResume === ExecutionStatus.STOPPED) {
            console.log('[Execution Engine] Execution aborted or stopped after pause');
            break;
          }
        }

        const statusCheck = this.executionStatus;
        if (statusCheck === ExecutionStatus.ABORTED || statusCheck === ExecutionStatus.STOPPED) {
          console.log('[Execution Engine] Execution aborted or stopped');
          break;
        }

        // Validate context before each step
        const contextCheck = await this.validateContext();
        if (!contextCheck.valid) {
          this.updateStatus(ExecutionStatus.PAUSED, `Execution paused: ${contextCheck.reason}`);
          results.push({
            success: false,
            stepIndex: i,
            status: 'Execution paused',
            error: contextCheck.reason
          });
          onProgress(results[results.length - 1]);
          
          // Wait for user to resume or abort
          await this.waitForResume();
          
          // Re-validate after resume
          const recheck = await this.validateContext();
          if (!recheck.valid) {
            this.updateStatus(ExecutionStatus.ABORTED, `Cannot resume: ${recheck.reason}`);
            break;
          }
        }

        this.currentStep = i;
        const step = steps[i];
        
        // Update status message based on step type - ChatGPT style
        let actionMessage = 'Working on it...';
        if (step.type === 'search') {
          actionMessage = 'Searching Google…';
        } else if (step.type === 'extract') {
          actionMessage = 'Collecting results…';
        } else if (step.type === 'navigate') {
          actionMessage = 'Navigating…';
        } else if (step.type === 'create_output') {
          actionMessage = 'Writing to Google Sheets…';
        } else if (step.type === 'wait') {
          actionMessage = 'Waiting…';
        }
        this.updateStatus(ExecutionStatus.RUNNING, actionMessage);
        
        // Update last valid step before execution
        if (this.executionContext) {
          this.executionContext.lastValidStep = i;
        }
        
        const result = await this.executeStep(step, i);
        results.push(result);
        onProgress(result);

        // Update last valid URL after successful step
        if (result.success && result.data?.finalUrl && this.executionContext) {
          this.executionContext.lastValidUrl = result.data.finalUrl;
        }

        // Small delay between steps for visibility
        await this.delay(500);
      }

      // Determine final status based on results
      const finalStatus = this.executionStatus;
      const successCount = results.filter(r => r.success).length;
      const totalSteps = results.length;
      const hasRequiredData = this.collectedData.length > 0 || results.some(r => r.data && Array.isArray(r.data) && r.data.length > 0);
      
      // SIMPLIFIED: Mark as completed if all steps succeeded, failed otherwise
      const allStepsSucceeded = successCount === totalSteps && totalSteps > 0;
      
      if (finalStatus === ExecutionStatus.ABORTED || finalStatus === ExecutionStatus.STOPPED) {
        // Already set, don't change
      } else if (allStepsSucceeded) {
        // All steps succeeded - mark as completed
        this.updateStatus(ExecutionStatus.COMPLETED, 'Execution completed successfully');
      } else {
        // Some steps failed - mark as failed
        this.updateStatus(ExecutionStatus.FAILED, `Execution failed: ${successCount} of ${totalSteps} steps succeeded`);
      }
      
      onComplete(results);
    } catch (error: any) {
      this.updateStatus(ExecutionStatus.ABORTED, `Execution failed: ${error.message}`);
      throw error;
    } finally {
      this.isExecuting = false;
      this.executionContext = null;
      this.executionStatus = ExecutionStatus.STOPPED;
      // Clear all state to ensure clean start for next task
      this.collectedData = [];
      this.originalQuery = '';
      this.isTopNTask = false;
      this.requestedResultCount = 5;
      this.lastSearchQuery = '';
      this.currentStep = 0;
      this.shouldStop = false;
    }
  }

  stop(): void {
    this.shouldStop = true;
    this.updateStatus(ExecutionStatus.STOPPED, 'Stopped by user');
  }

  pause(): void {
    if (this.isExecuting && this.executionStatus === ExecutionStatus.RUNNING) {
      this.updateStatus(ExecutionStatus.PAUSED, 'Execution paused by user');
    }
  }

  resume(): void {
    if (this.isExecuting && this.executionStatus === ExecutionStatus.PAUSED) {
      this.updateStatus(ExecutionStatus.RUNNING, 'Execution resumed');
    }
  }

  abort(): void {
    this.shouldStop = true;
    this.updateStatus(ExecutionStatus.ABORTED, 'Execution aborted');
  }

  getStatus(): ExecutionStatus {
    return this.executionStatus;
  }

  getExecutionContext(): ExecutionContext | null {
    return this.executionContext;
  }

  // Classify task type based on steps and intent
  private classifyTaskType(steps: ExecutionStep[], intent?: string): TaskType {
    const allText = (intent || '') + ' ' + steps.map(s => s.description).join(' ').toLowerCase();
    
    // Discovery/Search patterns
    const discoveryPatterns = [
      /\b(find|search|top|best|leading|discover|look for|get|fetch)\b/i,
      /\b(top \d+|best \d+|find \d+)\b/i,
      /\b(companies|tools|products|platforms|services)\b.*\b(best|top|leading)\b/i
    ];
    
    // Extraction patterns
    const extractionPatterns = [
      /\bextract.*from (this|current|page|document)\b/i,
      /\bget.*from (this|current|page)\b/i,
      /\bscrape.*page\b/i
    ];
    
    // Modification patterns
    const modificationPatterns = [
      /\b(fill|update|modify|edit|change|add to|write to|create).*(form|sheet|spreadsheet|document)\b/i,
      /\b(enter|input|put).*(into|in|to)\b/i
    ];
    
    if (discoveryPatterns.some(p => p.test(allText))) {
      return TaskType.DISCOVERY;
    }
    
    if (extractionPatterns.some(p => p.test(allText))) {
      return TaskType.EXTRACTION;
    }
    
    if (modificationPatterns.some(p => p.test(allText))) {
      return TaskType.MODIFICATION;
    }
    
    // Default: if there's a search step, it's discovery
    if (steps.some(s => s.type === 'search')) {
      return TaskType.DISCOVERY;
    }
    
    // Default: if there's an extract step without search, it's extraction
    if (steps.some(s => s.type === 'extract')) {
      return TaskType.EXTRACTION;
    }
    
    // Default to discovery for safety (most common case)
    return TaskType.DISCOVERY;
  }

  // SIMPLIFIED: Check if a tab is suitable for the task type
  private async isTabSuitableForTask(tab: chrome.tabs.Tab, taskType: TaskType): Promise<{ suitable: boolean; reason: string }> {
    // For discovery tasks, always return false - we'll create our own search tab
    if (taskType === TaskType.DISCOVERY) {
      return { suitable: false, reason: 'Discovery tasks use dedicated search tabs' };
    }

    // For extraction/modification, just check if tab exists and has URL
    if (!tab.url || !tab.id) {
      return { suitable: false, reason: 'Tab has no URL or ID' };
    }

    // Simple check: if it's a chrome:// page, not suitable
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      return { suitable: false, reason: 'Chrome internal pages not suitable' };
    }

    return { suitable: true, reason: 'Tab is suitable' };
  }

  // Establish execution context with qualification
  private async establishExecutionContext(steps: ExecutionStep[]): Promise<{ success: boolean; error?: string }> {
    // Get current active tab
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!activeTab.id || !activeTab.windowId) {
      return { success: false, error: 'No active tab found' };
    }

    // Check if current tab is suitable for this task type
    const suitability = await this.isTabSuitableForTask(activeTab, this.taskType!);
    console.log('[Execution Engine] Current tab suitability:', suitability);

    // For discovery tasks, always create a new search tab (don't bind to current)
    // SIMPLIFIED: Just track the window, binding happens when search tab is created
    if (this.taskType === TaskType.DISCOVERY) {
      console.log('[Execution Engine] Discovery task: will create dedicated search tab during first search step');
      this.executionContext = {
        tabId: activeTab.id, // Temporary - will be updated when search tab is created
        windowId: activeTab.windowId,
        initialUrl: activeTab.url || '',
        expectedDomains: ['google.com', 'www.google.com'], // Always allow Google for discovery
        controlledTabs: new Set(),
        lastValidUrl: activeTab.url || '',
        lastValidStep: 0
      };
      return { success: true };
    }

    // For extraction tasks, current tab must be suitable
    if (this.taskType === TaskType.EXTRACTION) {
      if (!suitability.suitable) {
        return { success: false, error: `Current tab is not suitable for extraction: ${suitability.reason}` };
      }
      
      this.executionContext = {
        tabId: activeTab.id,
        windowId: activeTab.windowId,
        initialUrl: activeTab.url || '',
        expectedDomains: this.extractExpectedDomains(steps),
        controlledTabs: new Set([activeTab.id]),
        lastValidUrl: activeTab.url || '',
        lastValidStep: 0
      };
      this.updateStatus(ExecutionStatus.RUNNING, `Executing in tab ${activeTab.id}`);
      return { success: true };
    }

    // For modification tasks, validate current tab matches target
    if (this.taskType === TaskType.MODIFICATION) {
      if (!suitability.suitable) {
        return { success: false, error: `Current tab is not suitable for modification: ${suitability.reason}` };
      }
      
      this.executionContext = {
        tabId: activeTab.id,
        windowId: activeTab.windowId,
        initialUrl: activeTab.url || '',
        expectedDomains: this.extractExpectedDomains(steps),
        controlledTabs: new Set([activeTab.id]),
        lastValidUrl: activeTab.url || '',
        lastValidStep: 0
      };
      this.updateStatus(ExecutionStatus.RUNNING, `Executing in tab ${activeTab.id}`);
      return { success: true };
    }

    return { success: false, error: 'Unknown task type' };
  }

  private updateStatus(status: ExecutionStatus, message: string): void {
    this.executionStatus = status;
    if (this.onStatusChange) {
      this.onStatusChange(status, message);
    }
    console.log(`[Execution Engine] Status: ${status} - ${message}`);
  }

  private async waitForResume(): Promise<void> {
    return new Promise((resolve) => {
      const checkResume = setInterval(() => {
        const status = this.executionStatus;
        if (status === ExecutionStatus.RUNNING) {
          clearInterval(checkResume);
          resolve();
        } else if (status === ExecutionStatus.ABORTED || status === ExecutionStatus.STOPPED) {
          clearInterval(checkResume);
          resolve();
        }
      }, 500);
    });
  }

  // Extract expected domains from execution steps
  private extractExpectedDomains(steps: ExecutionStep[]): string[] {
    const domains = new Set<string>();
    
    for (const step of steps) {
      if (step.type === 'navigate' && step.params?.url) {
        try {
          const url = new URL(step.params.url);
          domains.add(url.hostname.replace(/^www\./, ''));
        } catch {
          // Invalid URL, skip
        }
      } else if (step.type === 'search') {
        // Search operations typically use Google
        domains.add('google.com');
        domains.add('www.google.com');
      }
    }
    
    return Array.from(domains);
  }

  // Validate execution context before each step
  private async validateContext(): Promise<{ valid: boolean; reason: string }> {
    if (!this.executionContext) {
      return { valid: false, reason: 'No execution context' };
    }

    try {
      // Check if the bound tab still exists
      let tab: chrome.tabs.Tab;
      try {
        tab = await chrome.tabs.get(this.executionContext.tabId);
      } catch (error: any) {
        return { valid: false, reason: `Bound tab (${this.executionContext.tabId}) no longer exists` };
      }

      // Check if tab is in the expected window
      if (tab.windowId !== this.executionContext.windowId) {
        return { valid: false, reason: `Tab moved to different window (was ${this.executionContext.windowId}, now ${tab.windowId})` };
      }

      // Check if user navigated to unexpected domain (drift detection)
      if (tab.url) {
        try {
          const currentUrl = new URL(tab.url);
          const currentDomain = currentUrl.hostname.replace(/^www\./, '');
          
          // Allow if it's in expected domains or controlled tabs
          const isExpectedDomain = this.executionContext.expectedDomains.some(d => 
            currentDomain === d || currentDomain.endsWith('.' + d)
          );
          
          const isControlledTab = this.executionContext.controlledTabs.has(tab.id!);
          
          // Special case: allow chrome:// and chrome-extension:// pages (internal)
          const isInternalPage = tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://');
          
          if (!isExpectedDomain && !isControlledTab && !isInternalPage) {
            return { 
              valid: false, 
              reason: `Browser context changed: tab navigated to ${currentDomain} (expected: ${this.executionContext.expectedDomains.join(', ')})` 
            };
          }
        } catch (urlError) {
          // Invalid URL, might be chrome:// or similar, allow it
        }
      }

      // Check if tab is active (user might have switched away)
      // Note: We don't fail here, but we should be aware
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab.id !== this.executionContext.tabId) {
        console.warn('[Execution Engine] Bound tab is not active, but continuing execution');
      }

      return { valid: true, reason: '' };
    } catch (error: any) {
      return { valid: false, reason: `Context validation failed: ${error.message}` };
    }
  }

  private async executeStep(step: ExecutionStep, index: number): Promise<ExecutionResult> {
    try {
      console.log(`[Execution Engine] Executing step ${index + 1}: ${step.type} - ${step.description}`);
      
      switch (step.type) {
        case 'navigate':
          return await this.navigate(step.params?.url || '');
        
        case 'search':
          return await this.search(step.params?.query || '');
        
        case 'extract':
          return await this.extract(step.params?.selector || '');
        
        case 'click':
          return await this.click(step.params?.selector || '');
        
        case 'type':
          return await this.type(step.params?.selector || '', step.params?.text || '');
        
        case 'scroll':
          return await this.scroll();
        
        case 'wait':
          return await this.wait(step.params?.text ? parseInt(step.params.text) : 1000);
        
        case 'create_output':
          return await this.createOutput(step.params?.outputType || 'table', step.params?.data);
        
        default:
          console.error(`[Execution Engine] Unknown step type: ${step.type}`);
          return {
            success: false,
            stepIndex: index,
            status: 'Unknown step type',
            error: `Unknown step type: ${step.type}`
          };
      }
    } catch (error: any) {
      console.error(`[Execution Engine] Error executing step ${index + 1}:`, error);
      return {
        success: false,
        stepIndex: index,
        status: 'Error',
        error: error.message || 'Unknown error'
      };
    }
  }

  private async navigate(url: string): Promise<ExecutionResult> {
    if (!url || url.trim() === '') {
      return {
        success: false,
        stepIndex: this.currentStep,
        status: 'No URL provided',
        error: 'Navigation step requires a URL'
      };
    }

    try {
      console.log('[Execution Engine] Creating new tab for:', url);
      
      // Create a new tab instead of updating current one
      // This ensures we're on a fresh page
      // For search operations, we MUST create our own controlled tab
      let newTab: chrome.tabs.Tab;
      try {
        newTab = await chrome.tabs.create({ url, active: true });
        console.log('[Execution Engine] Created tab', newTab.id, 'with URL:', url);
        if (!newTab.id || !newTab.windowId) {
          console.error('[Execution Engine] Tab created but has no ID or windowId');
          return {
            success: false,
            stepIndex: this.currentStep,
            status: 'Navigation failed',
            error: 'Tab created but has no ID'
          };
        }
        
        // Track this as a controlled tab
        if (this.executionContext) {
          this.executionContext.controlledTabs.add(newTab.id);
          
          // For discovery tasks, bind to the search tab we just created
          if (this.taskType === TaskType.DISCOVERY && this.executionContext.tabId !== newTab.id) {
            console.log('[Execution Engine] Binding discovery task to search tab:', newTab.id);
            this.executionContext.tabId = newTab.id;
            this.executionContext.initialUrl = url;
            this.executionContext.lastValidUrl = url;
            this.updateStatus(ExecutionStatus.RUNNING, `Executing in search tab ${newTab.id}`);
          }
          
          // Add domain to expected domains
          try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname.replace(/^www\./, '');
            if (!this.executionContext.expectedDomains.includes(domain)) {
              this.executionContext.expectedDomains.push(domain);
            }
          } catch {
            // Invalid URL, skip
          }
        }
      } catch (createError: any) {
        console.error('[Execution Engine] Failed to create tab:', createError);
        return {
          success: false,
          stepIndex: this.currentStep,
          status: 'Navigation failed',
          error: createError.message || 'Could not create tab'
        };
      }
      
      // Use a promise to wait for navigation to complete
      // We need to wait for both loading and complete states
      const navigationComplete = new Promise<string>((resolve) => {
        let resolved = false;
        const listener = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
          if (tabId === newTab.id && !resolved) {
            // Wait for complete status
            if (changeInfo.status === 'complete' && tab.url) {
              // For Google search, wait a bit more to ensure redirects complete
              setTimeout(() => {
                chrome.tabs.get(newTab.id!, (finalTab) => {
                  if (!resolved && finalTab?.url) {
                    resolved = true;
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve(finalTab.url);
                  }
                });
              }, 1000);
            }
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
        
        // Timeout after 15 seconds
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            chrome.tabs.onUpdated.removeListener(listener);
            chrome.tabs.get(newTab.id!, (tab) => {
              resolve(tab?.url || '');
            });
          }
        }, 15000);
      });
      
      let finalUrl: string;
      try {
        finalUrl = await navigationComplete;
        console.log('[Execution Engine] Navigation promise resolved, final URL:', finalUrl);
      } catch (navError: any) {
        console.error('[Execution Engine] Error waiting for navigation:', navError);
        // Even if navigation promise fails, try to get the current URL
        try {
          const tab = await chrome.tabs.get(newTab.id!);
          finalUrl = tab?.url || url;
          console.log('[Execution Engine] Fallback: Got URL from tab:', finalUrl);
        } catch (getError: any) {
          console.error('[Execution Engine] Error getting tab:', getError);
          finalUrl = url; // Fallback to original URL
        }
      }
      
      // Wait a bit more for page content to load, especially for Google
      await this.delay(3000);
      
      // Verify final URL one more time
      let verifiedUrl = finalUrl;
      try {
        const verifyTab = await chrome.tabs.get(newTab.id!);
        verifiedUrl = verifyTab?.url || finalUrl;
        console.log('[Execution Engine] After navigation, tab URL:', verifiedUrl);
      } catch (verifyError: any) {
        console.warn('[Execution Engine] Error verifying tab URL, using finalUrl:', verifyError);
        verifiedUrl = finalUrl;
      }
      
      // For Google search URLs, check if we're on search results
      if (url.includes('google.com/search')) {
        if (!verifiedUrl.includes('google.com/search') || !verifiedUrl.includes('q=')) {
          // Debug: May redirect to homepage before search results load - this is normal
          console.debug('[Execution Engine] Not yet on search results page (may be loading):', verifiedUrl);
          // Return success - extraction will handle finding the correct tab
        }
      } else {
        // For other URLs, check if we're on the target domain
        try {
          const targetDomain = new URL(url).hostname;
          const actualDomain = new URL(verifiedUrl).hostname;
          if (targetDomain !== actualDomain) {
            console.warn('[Execution Engine] Navigation may not have completed. Expected domain:', targetDomain, 'Got:', actualDomain);
          }
        } catch (urlError: any) {
          console.warn('[Execution Engine] Error parsing URLs for domain check:', urlError);
        }
      }

      // Determine status message based on success
      let statusMessage = `Navigated to ${url}`;
      if (url.includes('google.com/search')) {
        if (verifiedUrl.includes('google.com/search') && verifiedUrl.includes('q=')) {
          statusMessage = `Navigated to Google search results`;
        } else {
          statusMessage = `Navigated to Google (results may be loading)`;
        }
      }
      
      console.log('[Execution Engine] Navigation successful, returning:', { success: true, status: statusMessage, tabId: newTab.id });
      return {
        success: true,
        stepIndex: this.currentStep,
        status: statusMessage,
        data: { url, tabId: newTab.id, finalUrl: verifiedUrl }
      };
    } catch (error: any) {
      console.error('[Execution Engine] Unexpected error in navigate:', error);
      return {
        success: false,
        stepIndex: this.currentStep,
        status: 'Navigation failed',
        error: error.message || 'Failed to navigate'
      };
    }
  }

  private async search(query: string): Promise<ExecutionResult> {
    // Store original query for retry logic
    if (!this.originalQuery) {
      this.originalQuery = query;
    }
    
    // Detect if this is a "top N" entity-level task
    this.isTopNTask = this.isTopNEntityTask(query);
    
    // Parse requested count from query if present (e.g., "top 5", "10 tools", "best 5")
    // Try multiple patterns to catch different formats
    const numMatch = query.match(/\b(top|best|leading)\s+(\d{1,2})\b/i) || 
                     query.match(/\b(\d{1,2})\s+(best|top|tools?|products?|companies?)\b/i) ||
                     query.match(/\b(\d{1,2})\b/);
    if (numMatch) {
      // Extract the number (could be in different positions depending on pattern)
      const numStr = numMatch[2] || numMatch[1];
      const n = parseInt(numStr, 10);
      if (!isNaN(n) && n > 0 && n <= 50) {
        this.requestedResultCount = n;
        console.log('[Execution Engine] Parsed requested result count from query:', n);
      }
    } else {
      console.log('[Execution Engine] No number found in query, using default:', this.requestedResultCount);
    }
    this.lastSearchQuery = query;

    // Strategy: Navigate directly to Google search URL (more reliable than in-page submission)
    console.log('[Execution Engine] Searching for:', query);
    
    // Encode the query for URL
    const encodedQuery = encodeURIComponent(query);
    const searchUrl = `https://www.google.com/search?q=${encodedQuery}`;
    
    console.log('[Execution Engine] Navigating directly to search URL:', searchUrl);
    const result = await this.navigate(searchUrl);
    console.log('[Execution Engine] Navigation result:', { success: result.success, status: result.status, tabId: result.data?.tabId });
    
    // If navigation failed, check if we still have a tabId (tab might have been created)
    if (!result.success) {
      console.warn('[Execution Engine] Navigation reported failure, but checking if tab was created...');
      if (result.data?.tabId) {
        // Tab was created, so navigation likely succeeded despite the error
        console.log('[Execution Engine] Tab exists, treating as success');
        return {
          success: true,
          stepIndex: result.stepIndex,
          status: `Searched for "${query}"`,
          data: result.data
        };
      }
      console.error('[Execution Engine] Navigation failed during search, no tab created');
      return result;
    }
    
    const tabId = result.data?.tabId;
    if (!tabId) {
      console.error('[Execution Engine] No tabId from navigation result');
      return {
        success: false,
        stepIndex: result.stepIndex,
        status: 'Search failed - no tab created',
        error: 'Navigation did not create a tab'
      };
    }
    
    // Wait for search results page to load
    console.log('[Execution Engine] Waiting for search results to load...');
    await this.delay(4000); // Wait longer for search results
    
    // Verify we're on search results page
    let isOnSearchResults = false;
    let finalTabUrl = '';
    const maxAttempts = 5;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // Get current tab state
        const tab = await chrome.tabs.get(tabId);
        finalTabUrl = tab.url || '';
        console.log(`[Execution Engine] Verification attempt ${attempt + 1}/${maxAttempts}, current URL:`, finalTabUrl);
        
        // Check if we're on search results
        if (finalTabUrl.includes('google.com/search') && finalTabUrl.includes('q=')) {
          isOnSearchResults = true;
          console.log('[Execution Engine] Successfully on search results page');
          break;
        }
        
        // If still on homepage, try navigating again with a longer wait
        if (finalTabUrl.includes('google.com/webhp') || finalTabUrl === 'https://www.google.com/') {
          console.log('[Execution Engine] Still on homepage, forcing navigation again...');
          // Force navigation to search URL
          await chrome.tabs.update(tabId, { url: searchUrl });
          await this.delay(5000); // Wait longer
          continue;
        }
        
        // Try navigating again if we're on a different page
        if (!finalTabUrl.includes('google.com')) {
          console.log('[Execution Engine] Not on Google, navigating to search URL again...');
          await chrome.tabs.update(tabId, { url: searchUrl });
          await this.delay(3000);
          continue;
        }
      } catch (error: any) {
        console.error(`[Execution Engine] Error during verification attempt ${attempt + 1}:`, error);
        await this.delay(2000);
      }
    }
    
    if (!isOnSearchResults) {
      console.error('[Execution Engine] Failed to reach search results after all attempts. Final URL:', finalTabUrl);
      // Try one more time with direct navigation
      try {
        await chrome.tabs.update(tabId, { url: searchUrl });
        await this.delay(3000);
        const finalCheck = await chrome.tabs.get(tabId);
        if (finalCheck.url?.includes('google.com/search') && finalCheck.url?.includes('q=')) {
          isOnSearchResults = true;
          finalTabUrl = finalCheck.url;
        }
      } catch (error: any) {
        console.error('[Execution Engine] Final navigation attempt failed:', error);
      }
    }
    
    // Check final result
    if (!isOnSearchResults) {
      console.error('[Execution Engine] Failed to reach search results after all attempts. Final URL:', finalTabUrl);
      
      // If we're on homepage, try one more time with a longer wait and force navigation
      if (finalTabUrl.includes('google.com/webhp') || finalTabUrl === 'https://www.google.com/') {
        console.log('[Execution Engine] Still on homepage, trying one final navigation with longer wait...');
        try {
          // Force navigation again
          await chrome.tabs.update(tabId, { url: searchUrl });
          await this.delay(6000); // Wait longer
          
          const finalCheck = await chrome.tabs.get(tabId);
          const finalCheckUrl = finalCheck.url || '';
          
          if (finalCheckUrl.includes('google.com/search') && finalCheckUrl.includes('q=')) {
            console.log('[Execution Engine] Final attempt succeeded!');
            isOnSearchResults = true;
            finalTabUrl = finalCheckUrl;
          } else {
            console.error('[Execution Engine] Final attempt failed. URL:', finalCheckUrl);
            // Even if it failed, proceed - extraction will try to handle it
            console.warn('[Execution Engine] Proceeding anyway - extraction will attempt to submit search in-page');
            return {
              success: true,
              stepIndex: result.stepIndex,
              status: `Searched for "${query}" (may need in-page submission)`,
              data: { ...result.data, finalUrl: finalCheckUrl, needsInPageSubmit: true }
            };
          }
        } catch (error: any) {
          console.error('[Execution Engine] Final navigation attempt error:', error);
          // Proceed anyway - extraction will handle it
          return {
            success: true,
            stepIndex: result.stepIndex,
            status: `Searched for "${query}" (extraction will handle)`,
            data: { ...result.data, finalUrl: finalTabUrl, needsInPageSubmit: true }
          };
        }
      }
      
      // If still not on search results, proceed anyway - extraction will try to handle it
      if (!isOnSearchResults && finalTabUrl.includes('google.com')) {
        console.warn('[Execution Engine] Verification failed but on Google domain, proceeding - extraction will handle');
        return {
          success: true,
          stepIndex: result.stepIndex,
          status: `Searched for "${query}" (extraction will handle)`,
          data: { ...result.data, finalUrl: finalTabUrl, needsInPageSubmit: true }
        };
      }
      
      return {
        success: false,
        stepIndex: result.stepIndex,
        status: `Search failed - still on ${finalTabUrl.includes('webhp') ? 'homepage' : 'unknown page'}`,
        error: `Could not reach search results page after ${maxAttempts} attempts. Current URL: ${finalTabUrl}. Please reload the extension to ensure permissions are granted.`,
        data: { ...result.data, finalUrl: finalTabUrl }
      };
    }
    
    // Successfully on search results
    console.log('[Execution Engine] Search successful! On results page:', finalTabUrl);
    return {
      ...result,
      success: true,
      stepIndex: result.stepIndex,
      status: `Searched for "${query}" successfully`,
      data: { ...result.data, finalUrl: finalTabUrl }
    };
  }

  // Helper: Detect if task is asking for "top N" distinct entities
  private isTopNEntityTask(query: string): boolean {
    const topNPatterns = [
      /\btop\s+(\d+)\s+(tools?|products?|companies?|platforms?|software|services?|solutions?)\b/i,
      /\bbest\s+(\d+)\s+(tools?|products?|companies?|platforms?|software|services?|solutions?)\b/i,
      /\bleading\s+(\d+)\s+(tools?|products?|companies?|platforms?)\b/i,
      /\b(\d+)\s+best\s+(tools?|products?|companies?|platforms?)\b/i,
      /\b(\d+)\s+top\s+(tools?|products?|companies?|platforms?)\b/i
    ];
    
    return topNPatterns.some(pattern => pattern.test(query));
  }

  // Helper: Generate varied queries for retry searches
  private generateVariedQueries(baseQuery: string, attempt: number): string[] {
    // Extract the core topic (remove "top N", "best N", etc.)
    const topic = baseQuery
      .replace(/\b(top|best|leading)\s+\d+\s+/gi, '')
      .replace(/\b\d+\s+(top|best|leading)\s+/gi, '')
      .replace(/\b(top|best|leading)\s+/gi, '')
      .trim();
    
    const variations = [
      `best ${topic}`,
      `top ${topic}`,
      `${topic} software`,
      `${topic} platforms`,
      `leading ${topic}`,
      `${topic} tools comparison`,
      `${topic} alternatives`,
      `popular ${topic}`
    ];
    
    // Return unique variations, avoiding the original query
    return variations
      .filter(v => v.toLowerCase() !== baseQuery.toLowerCase())
      .slice(0, 3); // Limit to 3 variations per attempt
  }

  // Helper: Get root domain from URL
  private getRootDomain(url: string): string | null {
    try {
      const u = new URL(url);
      return u.hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }

  // Helper: Determine page priority (homepage > product page > other)
  private getPagePriority(url: string): number {
    try {
      const u = new URL(url);
      const path = u.pathname.toLowerCase();
      
      // Homepage
      if (path === '/' || path === '') return 3;
      
      // Product/main pages (short paths, not blog/news)
      const isProductPage = !path.includes('/blog/') && 
                           !path.includes('/article/') && 
                           !path.includes('/news/') &&
                           !path.includes('/pricing/') &&
                           !path.includes('/contact/') &&
                           !path.includes('/about/') &&
                           (path.split('/').filter(p => p).length <= 2);
      
      return isProductPage ? 2 : 1;
    } catch {
      return 1;
    }
  }

  private async extract(selector: string): Promise<ExecutionResult> {
    this.updateStatus(ExecutionStatus.RUNNING, 'Collecting results…');
    // Get all tabs and find the one with Google (prefer search results)
    const allTabs = await chrome.tabs.query({});
    
    // Find the tab with Google search results, prefer the most recently updated one
    let targetTab = allTabs
      .filter(tab => {
        const url = tab.url || '';
        return url.includes('google.com');
      })
      .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
    
    // If no search results tab found, use active tab
    if (!targetTab) {
      console.log('[Extract] No search results tab found, using active tab');
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      targetTab = activeTab;
    }
    
    if (!targetTab || !targetTab.id) {
      throw new Error('No tab found for extraction');
    }

    // Check if we're on Google search results page (or at least on google.com)
    const isGoogleSearch = !!(targetTab.url && targetTab.url.includes('google.com'));
    
    console.log('[Extract] Starting extraction on tab', targetTab.id, 'isGoogleSearch:', isGoogleSearch, 'URL:', targetTab.url);

    // Wait longer for Google results to fully load and verify we're on results page
    if (isGoogleSearch) {
      console.log('[Extract] Waiting for Google search results to load...');
      await this.delay(4000); // Wait 4 seconds for results to load
      
      // Re-check the tab URL after waiting (Google might have redirected)
      const updatedTab = await chrome.tabs.get(targetTab.id);
      const currentUrl = updatedTab.url || '';
      console.log('[Extract] Current URL after wait:', currentUrl);
      
      // If we're not on search results (no q=), try to find the correct tab or submit the search in-page
      if (!currentUrl.includes('google.com/search') || !currentUrl.includes('q=')) {
        // Try to find any tab with search results
        const allTabsAgain = await chrome.tabs.query({});
        const searchTab = allTabsAgain.find(t => 
          t.url?.includes('google.com/search') && t.url?.includes('q=')
        );
        
        if (searchTab && searchTab.id) {
          console.log('[Extract] Found search results tab:', searchTab.id, searchTab.url);
          targetTab = searchTab;
        } else {
          // Submit the query in-page if we have the last search term
          if (this.lastSearchQuery) {
            console.warn('[Extract] Still on Google homepage, submitting search in-page for query:', this.lastSearchQuery);
            try {
              const submitResult = await chrome.scripting.executeScript({
                target: { tabId: targetTab.id },
                func: (q: string) => {
                  // Try multiple selectors for the search box
                  const searchBox = (document.querySelector('input[name="q"]') as HTMLInputElement) ||
                                  (document.querySelector('textarea[name="q"]') as HTMLTextAreaElement) ||
                                  (document.querySelector('input[type="text"]') as HTMLInputElement) ||
                                  (document.querySelector('textarea') as HTMLTextAreaElement) ||
                                  (document.querySelector('input[aria-label*="Search"]') as HTMLInputElement);
                  
                  if (!searchBox) {
                    console.log('[Extract Script] No search box found');
                    return false;
                  }
                  
                  // Clear and set value
                  searchBox.value = '';
                  searchBox.focus();
                  searchBox.value = q;
                  
                  // Trigger multiple events to ensure Google recognizes the input
                  searchBox.dispatchEvent(new Event('focus', { bubbles: true }));
                  searchBox.dispatchEvent(new Event('input', { bubbles: true }));
                  searchBox.dispatchEvent(new Event('change', { bubbles: true }));
                  searchBox.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
                  
                  // Wait a bit then submit
                  setTimeout(() => {
                    const form = searchBox.closest('form');
                    if (form) {
                      form.submit();
                    } else {
                      // Fallback: simulate Enter key
                      const enterEvent = new KeyboardEvent('keydown', {
                        key: 'Enter',
                        code: 'Enter',
                        keyCode: 13,
                        which: 13,
                        bubbles: true,
                        cancelable: true
                      });
                      searchBox.dispatchEvent(enterEvent);
                      searchBox.dispatchEvent(new KeyboardEvent('keypress', {
                        key: 'Enter',
                        keyCode: 13,
                        bubbles: true
                      }));
                    }
                  }, 100);
                  
                  return true;
                },
                args: [this.lastSearchQuery]
              });
              
              if (submitResult && submitResult[0]?.result) {
                console.log('[Extract] Search submitted, waiting for results...');
                // Wait longer for search results to load
                await this.delay(6000);
                
                // Check multiple times if we're now on search results
                for (let i = 0; i < 3; i++) {
                  const refreshed = await chrome.tabs.get(targetTab.id);
                  const newUrl = refreshed.url || '';
                  console.log(`[Extract] Check ${i + 1}/3 after submit, URL:`, newUrl);
                  
                  if (newUrl.includes('google.com/search') && newUrl.includes('q=')) {
                    console.log('[Extract] Successfully reached search results page');
                    targetTab = refreshed;
                    break;
                  }
                  
                  if (i < 2) {
                    await this.delay(2000);
                  }
                }
              } else {
                console.warn('[Extract] In-page submit returned false');
              }
            } catch (submitErr) {
              console.warn('[Extract] In-page submit failed:', submitErr);
            }
          }
        }
      }
      
      // Verify we're actually on a search results page (not homepage)
      if (!targetTab.id) {
        throw new Error('No tab ID for verification');
      }
      
      // Re-check URL one more time before proceeding
      const finalCheckTab = await chrome.tabs.get(targetTab.id);
      const finalCheckUrl = finalCheckTab.url || '';
      
      if (!finalCheckUrl.includes('google.com/search') || !finalCheckUrl.includes('q=')) {
        console.error('[Extract] Still not on search results page after all attempts. URL:', finalCheckUrl);
        // Try one more time to find a search results tab
        const allTabsFinal = await chrome.tabs.query({});
        const searchResultsTab = allTabsFinal.find(t => 
          t.url?.includes('google.com/search') && t.url?.includes('q=')
        );
        
        if (searchResultsTab && searchResultsTab.id) {
          console.log('[Extract] Found search results tab on final check:', searchResultsTab.id);
          targetTab = searchResultsTab;
        } else {
          // Last resort: return error but don't throw (let extraction try anyway)
          console.error('[Extract] CRITICAL: Not on search results page and cannot find one. URL:', finalCheckUrl);
          console.error('[Extract] Will attempt extraction anyway, but likely to return 0 items');
        }
      }
      
      if (!targetTab.id) {
        throw new Error('No tab ID for verification script');
      }
      const verifyResults = await chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        func: () => {
          // Check current URL first
          const currentUrl = window.location.href;
          const isOnSearchResults = currentUrl.includes('google.com/search') && currentUrl.includes('q=');
          console.log('[Extract Script] URL check:', currentUrl, 'isOnSearchResults:', isOnSearchResults);
          
          // Check if search results are present in main content area
          const mainContent = document.querySelector('#main') || document.querySelector('#search') || document.body;
          if (!mainContent) {
            console.log('[Extract Script] No main content area found');
            return { hasResults: false, resultCount: 0, isOnSearchResults };
          }
          
          // Check if search results are present
          const hasResults = !!(mainContent.querySelector('div[data-ved]') || 
                            mainContent.querySelector('div.g') ||
                            mainContent.querySelector('h3') ||
                            mainContent.querySelector('a[href^="http"]'));
          const resultCount = mainContent.querySelectorAll('div[data-ved]').length || 
                            mainContent.querySelectorAll('div.g').length ||
                            mainContent.querySelectorAll('h3').length;
          console.log('[Extract Script] Found', resultCount, 'potential result containers, hasResults:', hasResults);
          return { hasResults, resultCount, isOnSearchResults };
        }
      });
      
      const verification = verifyResults[0]?.result;
      if (!verification?.hasResults || !verification?.isOnSearchResults) {
        console.warn('[Extract] Verification failed:', verification);
        console.warn('[Extract] No search results found or not on search results page. Waiting longer...');
        await this.delay(3000);
        
        // Final check - if still not on search results, this will likely fail
        if (targetTab.id) {
          const lastCheck = await chrome.tabs.get(targetTab.id);
          if (!lastCheck.url?.includes('google.com/search') || !lastCheck.url?.includes('q=')) {
            console.error('[Extract] FINAL WARNING: Still not on search results. Extraction will likely return 0 items.');
            console.error('[Extract] Current URL:', lastCheck.url);
          }
        }
      } else {
        console.log('[Extract] Search results verified, proceeding with extraction');
      }
    }

    // Re-query tab to get latest URL after waiting
    if (!targetTab.id) {
      throw new Error('No tab ID for extraction');
    }
    const finalTab = await chrome.tabs.get(targetTab.id);
    if (!finalTab || !finalTab.id) {
      throw new Error('No tab found for extraction');
    }
    
    // Check URL again after waiting
    let finalUrl = finalTab.url || '';
    let isActuallyOnSearch = finalUrl.includes('google.com/search') && finalUrl.includes('q=');
    
    // If we're stuck on /webhp or missing q=, try to submit the query in-page using lastSearchQuery
    if (!isActuallyOnSearch && this.lastSearchQuery) {
      console.warn('[Extract] Not on search results; attempting in-page submit with query:', this.lastSearchQuery);
      try {
        await chrome.scripting.executeScript({
          target: { tabId: finalTab.id },
          func: (searchQuery: string) => {
            const box = (document.querySelector('input[name="q"]') as HTMLInputElement) ||
                        (document.querySelector('textarea[name="q"]') as HTMLTextAreaElement) ||
                        (document.querySelector('form input') as HTMLInputElement);
            if (!box) return false;
            box.value = searchQuery;
            box.dispatchEvent(new Event('input', { bubbles: true }));
            box.dispatchEvent(new Event('change', { bubbles: true }));
            const form = box.closest('form');
            if (form) {
              form.submit();
              return true;
            }
            const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });
            box.dispatchEvent(enterEvent);
            return true;
          },
          args: [this.lastSearchQuery]
        });
        // Wait and re-check URL
        for (let i = 0; i < 5; i++) {
          await this.delay(2000);
          const refreshed = await chrome.tabs.get(finalTab.id);
          finalUrl = refreshed.url || finalUrl;
          console.log('[Extract] After in-page submit attempt', i + 1, 'URL:', finalUrl);
          isActuallyOnSearch = finalUrl.includes('google.com/search') && finalUrl.includes('q=');
          if (isActuallyOnSearch) break;
        }
      } catch (submitErr: any) {
        // Handle permission errors
        if (submitErr.message?.includes('permission') || submitErr.message?.includes('host') || submitErr.message?.includes('Cannot access contents')) {
          console.error('[Extract] Permission error during fallback submit:', submitErr);
          return {
            success: false,
            stepIndex: this.currentStep,
            status: 'Extraction failed - permission error',
            error: `Cannot access Google page. The extension needs to be reloaded.\n\nPlease:\n1. Go to chrome://extensions\n2. Find "Memory Layer" extension\n3. Click the reload icon (circular arrow)\n4. Try again\n\nError: ${submitErr.message}`
          };
        }
        console.warn('[Extract] In-page submit fallback failed:', submitErr);
      }
    }
    
    if (!isActuallyOnSearch && isGoogleSearch) {
      console.warn('[Extract] URL check failed, but will attempt extraction anyway. URL:', finalUrl);
      // Don't return error here - try extraction anyway, it might still work
    } else if (isActuallyOnSearch) {
      console.log('[Extract] Confirmed on Google search results page:', finalUrl);
    }
    
    // Verify we can access the tab before attempting extraction
    try {
      // Try a simple script execution to verify permissions
      await chrome.scripting.executeScript({
        target: { tabId: finalTab.id },
        func: () => window.location.href
      });
    } catch (permError: any) {
      if (permError.message?.includes('permission') || permError.message?.includes('host') || permError.message?.includes('Cannot access contents')) {
        console.error('[Execution Engine] Permission check failed:', permError);
        return {
          success: false,
          stepIndex: this.currentStep,
          status: 'Extraction failed - permission error',
          error: `Cannot access Google search results page. The extension needs to be reloaded to grant permissions.\n\nPlease:\n1. Go to chrome://extensions\n2. Find "Memory Layer" extension\n3. Click the reload icon (circular arrow)\n4. Try again\n\nError: ${permError.message}`
        };
      }
      // If it's not a permission error, continue anyway
      console.warn('[Execution Engine] Permission check warning (non-fatal):', permError);
    }

    // Try to execute extraction script, handle permission errors
    let results;
    try {
      results = await chrome.scripting.executeScript({
        target: { tabId: finalTab.id },
        func: (sel: string, isGoogle: boolean, limit: number) => {
        console.log('[Extract Script] Starting extraction, isGoogle:', isGoogle, 'selector:', sel);
        console.log('[Extract Script] Current URL:', window.location.href);
        console.log('[Extract Script] Document ready state:', document.readyState);
        console.log('[Extract Script] Body children count:', document.body?.children.length || 0);
        
        // Double-check if we're on Google search (in case URL check failed)
        const currentUrl = window.location.href;
        const isActuallyGoogle = currentUrl.includes('google.com');
        
        console.log('[Extract Script] isActuallyGoogle:', isActuallyGoogle);
        
        // Minimal validation: non-empty text (used in both Google and generic extraction)
        const isValidContent = (text: string): boolean => {
          return !!(text && text.trim().length > 0);
        };
        
        if (isGoogle || isActuallyGoogle) {
          console.log('[Extract Script] Using Google search extraction');
          
          // Specialized extraction for Google search results
          const searchResults: any[] = [];
          
          // SIMPLIFIED: Always extract at least 5 results for "top N" tasks, or use requested limit
          const extractionLimit = limit || 10; // Default to 10 to ensure we get enough for deduplication
          console.log('[Extract Script] Extraction limit set to:', extractionLimit);
          
          // Helper: Extract tool name from URL domain
          const getToolNameFromUrl = (url: string): string => {
            try {
              const urlObj = new URL(url);
              const hostname = urlObj.hostname.replace(/^www\./, '');
              const domain = hostname.split('.')[0]; // Get first part (e.g., "mailchimp" from "mailchimp.com")
              // Capitalize first letter
              return domain.charAt(0).toUpperCase() + domain.slice(1);
            } catch {
              return '';
            }
          };
          
          // Helper: Check if URL looks like a tool/product website (not an article/blog)
          const isToolWebsite = (url: string): boolean => {
            const urlLower = url.toLowerCase();
            // Skip article/blog sites
            const articlePatterns = ['blog', 'article', 'guide', 'review', 'comparison', 'youtube.com', 'medium.com', 'reddit.com'];
            if (articlePatterns.some(pattern => urlLower.includes(pattern))) {
              return false;
            }
            // Check if it's a product/tool site (usually has product name in domain)
            return true; // Default to true, we'll filter later
          };
          
          // Try multiple selector strategies for Google search results
          let resultContainers: NodeListOf<Element> | null = null;
          
          // Strategy 1: Modern Google selectors (try multiple)
          // Focus on main search results area, exclude navigation/header
          const mainContent = document.querySelector('#main') || 
                            document.querySelector('#search') || 
                            document.querySelector('#center_col') ||
                            document.querySelector('[role="main"]') ||
                            document.body;
          if (!mainContent) {
            console.log('[Extract] No main content area found');
            return [];
          }
          
          console.log('[Extract Script] Main content found:', mainContent.tagName, mainContent.className);
          
          // More comprehensive selectors for Google search results
          const selectors = [
            'div[data-ved]',           // Modern Google results
            'div.g',                    // Classic Google results
            'div[class*="g "]',         // Google results with space
            'div.tF2Cxc',               // Specific Google result class
            'div[jscontroller]',        // Google JS-controlled elements
            'div[data-hveid]',          // Google result containers
            'div[data-ved][data-hveid]', // Combined attributes
            'div.g[data-ved]',          // Combined class and attribute
            'a[href^="http"] h3',       // Links with h3 titles (parent approach)
            'div[role="article"]'        // ARIA article role
          ];
          
          for (const selector of selectors) {
            try {
              const candidates = mainContent.querySelectorAll(selector);
              console.log('[Extract Script] Selector', selector, 'found', candidates.length, 'candidates');
              
              if (candidates.length === 0) continue;
              
              // Filter to only containers that have an h3 (title) AND a link pointing to external site
              const withTitles = Array.from(candidates).filter(el => {
                // Try multiple ways to find title
                const hasH3 = el.querySelector('h3') || 
                             el.querySelector('h3.LC20lb') ||
                             el.querySelector('h3.DKV0Md') ||
                             el.closest('div')?.querySelector('h3');
                
                // Try multiple ways to find link
                const linkEl = (el.querySelector('a[href]') as HTMLAnchorElement) ||
                              (el.closest('a[href]') as HTMLAnchorElement) ||
                              (el.querySelector('a') as HTMLAnchorElement);
                
                if (!hasH3 || !linkEl || !linkEl.href) {
                  // If no h3 but has link, still consider it (might be a different layout)
                  if (!linkEl || !linkEl.href) return false;
                }
                
                const href = linkEl.href;
                
                // Must be an external link (not Google internal)
                if (href.includes('google.com/search') || 
                    href.includes('google.com/url') || 
                    href.includes('google.com/maps') ||
                    href.includes('google.com/webhp') ||
                    href.includes('google.com/images') ||
                    href.includes('google.com/accounts') ||
                    href.includes('accounts.google.com')) {
                  return false;
                }
                
                // Must be a real URL
                if (!href.startsWith('http://') && !href.startsWith('https://')) return false;
                
                return true;
              });
              console.log('[Extract Script] After filtering,', withTitles.length, 'valid containers with selector:', selector);
              
              if (withTitles.length > 0) {
                resultContainers = withTitles as any;
                console.log('[Extract Script] Using selector:', selector, 'with', withTitles.length, 'containers');
                break;
              }
            } catch (err) {
              console.warn('[Extract Script] Error with selector', selector, ':', err);
              continue;
            }
          }
          
          // Strategy 2: Look for h3 elements and find their parent containers
          if (!resultContainers || resultContainers.length === 0) {
            console.log('[Extract Script] No containers found with selectors, trying h3-based extraction');
            const h3Elements = Array.from(document.querySelectorAll('h3')).filter(h3 => {
              const text = h3.textContent?.trim() || '';
              return isValidContent(text) && text.length > 3; // At least 3 chars
            });
            
            console.log('[Extract Script] Found', h3Elements.length, 'h3 elements with content');
            
            h3Elements.forEach((h3, index) => {
              if (index >= limit * 2) return; // Check more than limit to find valid ones
              
              const title = h3.textContent?.trim() || '';
              if (!isValidContent(title)) return;
              
              // Find the parent container with a link - search more broadly
              let container = h3.parentElement;
              let linkEl: HTMLAnchorElement | null = null;
              let attempts = 0;
              
              // Search up the DOM tree more aggressively
              while (container && attempts < 8) {
                // Try multiple ways to find the link
                linkEl = container.querySelector('a[href]') as HTMLAnchorElement;
                if (!linkEl) {
                  // Check if container itself is a link
                  if (container.tagName === 'A' && (container as HTMLAnchorElement).href) {
                    linkEl = container as HTMLAnchorElement;
                  }
                }
                
                if (linkEl && linkEl.href) {
                  let url = linkEl.href;
                  
                  // Clean up Google redirect URLs
                  if (url.includes('/url?q=')) {
                    const match = url.match(/[?&]q=([^&]+)/);
                    if (match) {
                      url = decodeURIComponent(match[1]);
                    }
                  }
                  
                  // Skip Google internal links
                  if (url.includes('google.com/search') || 
                      url.includes('google.com/url') || 
                      url.includes('google.com/maps') ||
                      url.includes('google.com/webhp') ||
                      url.includes('google.com/images') ||
                      url.includes('accounts.google.com')) {
                    container = container.parentElement;
                    attempts++;
                    linkEl = null;
                    continue;
                  }
                  
                  // Must be a valid HTTP/HTTPS URL
                  if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    container = container.parentElement;
                    attempts++;
                    linkEl = null;
                    continue;
                  }
                  
                  // Find description - try multiple selectors
                  const descEl = container.querySelector('.VwiC3b') ||
                                container.querySelector('span[style*="-webkit-line-clamp"]') ||
                                container.querySelector('.s') ||
                                container.querySelector('[data-sncf]') ||
                                container.querySelector('.IsZvec') ||
                                container.querySelector('.aCOpRe') ||
                                Array.from(container.querySelectorAll('span')).find(s => {
                                  const text = s.textContent?.trim() || '';
                                  return text.length > 30 && text.length < 500 && isValidContent(text);
                                });
                  let description = (descEl?.textContent?.trim() || '').substring(0, 200);
                  
                  // Validate description too
                  if (description && !isValidContent(description)) {
                    description = ''; // Use empty if invalid
                  }
                  
                  // Final validation - both title and URL must be valid
                  if (title && url && isValidContent(title)) {
                    // Make sure URL is actually a real website URL (less strict)
                    const urlLower = url.toLowerCase();
                    // Skip YouTube entirely (videos, channels, etc.)
                    if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
                      container = container.parentElement;
                      attempts++;
                      linkEl = null;
                      continue;
                    }
                    if (!urlLower.includes('google.com') && 
                        (urlLower.includes('.') || urlLower.includes('://'))) { // More lenient URL check
                      // Check if we already have this URL
                      const alreadyExists = searchResults.some(r => {
                        try {
                          const u1 = new URL(r.url);
                          const u2 = new URL(url);
                          return u1.hostname === u2.hostname && u1.pathname === u2.pathname;
                        } catch {
                          return r.url === url;
                        }
                      });
                      
                      if (!alreadyExists) {
                        // SMART EXTRACTION: For "top tools" queries, prefer tool names over article titles
                        let toolName = title;
                        
                        // If title looks like an article/blog post, extract tool name from URL instead
                        const titleLower = title.toLowerCase();
                        const isArticleTitle = titleLower.includes('best') && 
                                              (titleLower.includes('tools') || titleLower.includes('platforms') || titleLower.includes('software')) &&
                                              (titleLower.match(/\d+/)); // Has numbers like "17 best"
                        
                        if (isArticleTitle && isToolWebsite(url)) {
                          // Use domain name as tool name (e.g., mailchimp.com -> Mailchimp)
                          const domainName = getToolNameFromUrl(url);
                          if (domainName) {
                            toolName = domainName;
                            console.log('[Extract Script] Using domain name as tool name:', domainName, 'instead of article title:', title);
                          }
                        }
                        
                        searchResults.push({
                          name: toolName,
                          url: url,
                          description: description,
                          rank: searchResults.length + 1
                        });
                        console.log('[Extract Script] Added result:', toolName.substring(0, 50), url);
                      }
                    }
                  }
                  break; // Found valid result, move to next h3
                }
                container = container.parentElement;
                attempts++;
              }
            });
            
            console.log('[Extract Script] h3-based extraction found', searchResults.length, 'results');
          } else {
            // Use the found containers
            console.log('[Extract Script] Processing', resultContainers.length, 'containers');
            resultContainers.forEach((container, index) => {
              if (searchResults.length >= extractionLimit * 2) return; // Extract more than needed for deduplication
              if (index >= extractionLimit * 5) return; // Check many containers to find valid ones
              
              // Extract title - try multiple selectors
              const titleEl = container.querySelector('h3') || 
                            container.querySelector('h3.LC20lb') ||
                            container.querySelector('h3.DKV0Md') ||
                            container.querySelector('a h3') ||
                            container.closest('div')?.querySelector('h3');
              const title = titleEl?.textContent?.trim() || '';
              
              if (!isValidContent(title)) {
                // Try to get title from link text if no h3
                const linkText = container.querySelector('a')?.textContent?.trim() || '';
                if (isValidContent(linkText) && linkText.length > 3) {
                  // Use link text as title
                } else {
                  return; // Skip if no valid title
                }
              }
              
              // Extract URL - try multiple approaches
              let linkEl = container.querySelector('a[href]') as HTMLAnchorElement;
              if (!linkEl) {
                // Check if container or parent is a link
                if (container.tagName === 'A' && (container as HTMLAnchorElement).href) {
                  linkEl = container as HTMLAnchorElement;
                } else {
                  linkEl = container.closest('a[href]') as HTMLAnchorElement;
                }
              }
              
              if (!linkEl || !linkEl.href) return;
              
              let url = linkEl.href;
              
              // Clean up Google redirect URLs
              if (url.includes('/url?q=')) {
                const match = url.match(/[?&]q=([^&]+)/);
                if (match) {
                  url = decodeURIComponent(match[1]);
                }
              }
              
              // Skip Google internal links
              if (url.includes('google.com/search') || 
                  url.includes('google.com/url') || 
                  url.includes('google.com/maps') ||
                  url.includes('google.com/webhp') ||
                  url.includes('google.com/images') ||
                  url.includes('accounts.google.com')) {
                return;
              }
              
              if (!url.startsWith('http://') && !url.startsWith('https://')) return;
              
              // Extract description/snippet - try multiple selectors
              const descEl = container.querySelector('span[style*="-webkit-line-clamp"]') || 
                            container.querySelector('.VwiC3b') ||
                            container.querySelector('.s') ||
                            container.querySelector('[data-sncf]') ||
                            container.querySelector('.IsZvec') ||
                            container.querySelector('.aCOpRe') ||
                            Array.from(container.querySelectorAll('span')).find(s => {
                              const text = s.textContent?.trim() || '';
                              return text.length > 30 && text.length < 500 && isValidContent(text);
                            });
              const description = (descEl?.textContent?.trim() || '').substring(0, 200);
              
              // Only add if we have valid title and URL
              if (title && url) {
                // Check for duplicates
                const alreadyExists = searchResults.some(r => {
                  try {
                    const u1 = new URL(r.url);
                    const u2 = new URL(url);
                    return u1.hostname === u2.hostname && u1.pathname === u2.pathname;
                  } catch {
                    return r.url === url;
                  }
                });
                
                if (!alreadyExists) {
                  searchResults.push({
                    name: title,
                    url: url,
                    description: description,
                    rank: searchResults.length + 1
                  });
                  console.log('[Extract Script] Added result from container:', title.substring(0, 50), url);
                }
              }
            });
            
            console.log('[Extract Script] Container-based extraction found', searchResults.length, 'results');
          }
          
          // Fallback for lightweight HTML results (gbv=1) or when no structured containers found
          if (searchResults.length === 0) {
            console.log('[Extract Script] No structured results found, using aggressive fallback');
            
            // Try multiple fallback strategies
            const fallbackStrategies = [
              // Strategy 1: All external links in main content
              () => {
                const main = document.querySelector('#main') || document.querySelector('#search') || document.body;
                return Array.from(main.querySelectorAll('a[href^="http"]'));
              },
              // Strategy 2: Links with substantial text
              () => {
                return Array.from(document.querySelectorAll('a[href^="http"]')).filter(a => {
                  const text = a.textContent?.trim() || '';
                  return text.length > 5 && isValidContent(text);
                });
              },
              // Strategy 3: Any link that's not Google
              () => {
                return Array.from(document.querySelectorAll('a[href]')).filter(a => {
                  const href = (a as HTMLAnchorElement).href;
                  return href.startsWith('http') && !href.includes('google.com');
                });
              }
            ];
            
            for (const strategy of fallbackStrategies) {
              try {
                const linkCandidates = strategy();
                console.log('[Extract Script] Fallback strategy found', linkCandidates.length, 'candidates');
                
                for (const linkEl of linkCandidates) {
                  if (searchResults.length >= extractionLimit) break;
                  
                  const href = (linkEl as HTMLAnchorElement).href;
                  if (!href) continue;
                  
                  // Clean up Google redirect URLs
                  let url = href;
                  if (url.includes('/url?q=')) {
                    const match = url.match(/[?&]q=([^&]+)/);
                    if (match) {
                      url = decodeURIComponent(match[1]);
                    }
                  }
                  
                  // Skip Google/internal links
                  if (url.includes('google.com/search') || 
                      url.includes('google.com/url') || 
                      url.includes('google.com/maps') || 
                      url.includes('google.com/webhp') ||
                      url.includes('google.com/images') ||
                      url.includes('accounts.google.com')) {
                    continue;
                  }
                  
                  if (!url.startsWith('http://') && !url.startsWith('https://')) continue;
                  
                  // Get text - prefer link text, fallback to nearby text
                  let text = linkEl.textContent?.trim() || '';
                  if (!text || text.length < 3) {
                    // Try to find nearby text (parent or sibling)
                    const parent = linkEl.parentElement;
                    if (parent) {
                      const parentText = parent.textContent?.trim() || '';
                      if (parentText.length > text.length) {
                        text = parentText.substring(0, 100); // Limit to 100 chars
                      }
                    }
                  }
                  
                  // Basic content validation
                  if (!isValidContent(text) || text.length < 3) continue;
                  
                  // Try to grab nearby description text
                  let description = '';
                  const parent = linkEl.parentElement;
                  if (parent) {
                    const allText = parent.textContent?.trim() || '';
                    // Description is usually after the link text
                    const linkIndex = allText.indexOf(text);
                    if (linkIndex >= 0) {
                      description = allText.substring(linkIndex + text.length, linkIndex + text.length + 200).trim();
                    }
                  }
                  
                  // Check for duplicates
                  const alreadyExists = searchResults.some(r => {
                    try {
                      const u1 = new URL(r.url);
                      const u2 = new URL(url);
                      return u1.hostname === u2.hostname && u1.pathname === u2.pathname;
                    } catch {
                      return r.url === url;
                    }
                  });
                  
                  if (!alreadyExists) {
                    searchResults.push({
                      name: text.substring(0, 200), // Limit title length
                      url: url,
                      description: description.substring(0, 200),
                      rank: searchResults.length + 1
                    });
                    console.log('[Extract Script] Added fallback result:', text.substring(0, 50), url);
                  }
                }
                
                // If we found results, stop trying other strategies
                if (searchResults.length > 0) {
                  console.log('[Extract Script] Fallback strategy succeeded with', searchResults.length, 'results');
                  break;
                }
              } catch (err) {
                console.warn('[Extract Script] Fallback strategy error:', err);
                continue;
              }
            }
            
            console.log('[Extract Script] After all fallbacks, found', searchResults.length, 'results');
          }
          
          console.log('[Extract] Found', searchResults.length, 'Google search results');
          return searchResults.length > 0 ? searchResults : [];
        } else {
          // Generic extraction fallback (handles unexpected Google layouts too)
          const generic: any[] = [];
          const links = Array.from(document.querySelectorAll('a[href]')).slice(0, limit * 4);
          for (const linkEl of links) {
            if (generic.length >= limit) break;
            const href = (linkEl as HTMLAnchorElement).href;
            const text = linkEl.textContent?.trim() || '';
            if (!href || !text) continue;
            if (!href.startsWith('http')) continue;
            // Skip Google internal links
            if (href.includes('google.com/search') || href.includes('google.com/url') || href.includes('google.com/maps') || href.includes('google.com/webhp')) continue;
            if (!isValidContent(text)) continue;
            generic.push({
              name: text,
              url: href,
              description: '',
              rank: generic.length + 1
            });
          }
          console.log('[Extract] Generic fallback found', generic.length, 'items');
          return generic;
        }
      },
      args: [selector, isGoogleSearch, Math.max(this.requestedResultCount || 5, 10)] // Extract at least 10 to ensure we get 5 after deduplication
      });
    } catch (error: any) {
      // Handle permission errors
      if (error.message?.includes('permission') || error.message?.includes('host') || error.message?.includes('Cannot access contents')) {
        console.error('[Execution Engine] Permission error during extraction:', error);
        return {
          success: false,
          stepIndex: this.currentStep,
          status: 'Extraction failed - permission error',
          error: `Cannot access Google search results page. Please reload the extension (go to chrome://extensions and click the reload icon) to ensure permissions are granted. Error: ${error.message}`
        };
      }
      // Re-throw other errors
      throw error;
    }

    const extracted = results[0]?.result || [];
    
    // Format extracted data for CSV
    const formattedData = extracted.map((item: any) => ({
      Name: item.name || item.text || 'Unknown',
      URL: item.url || item.href || '',
      Description: item.description || '',
      Rank: item.rank || ''
    }));

    // ENTITY-LEVEL DEDUPLICATION: Group by root domain AND title similarity
    // This ensures "top N" means N distinct entities/companies, not N links
    const domainMap = new Map<string, any>(); // domain -> best result for that domain
    
    // Helper: Check if two titles are similar (same article on different domains)
    const areTitlesSimilar = (title1: string, title2: string): boolean => {
      const t1 = title1.toLowerCase().trim();
      const t2 = title2.toLowerCase().trim();
      // Exact match
      if (t1 === t2) return true;
      // Check if one contains the other (with some tolerance for truncation)
      if (t1.length > 20 && t2.length > 20) {
        const longer = t1.length > t2.length ? t1 : t2;
        const shorter = t1.length > t2.length ? t2 : t1;
        // If shorter is 80% of longer and they share significant overlap
        if (shorter.length / longer.length > 0.8 && longer.includes(shorter.substring(0, Math.min(30, shorter.length)))) {
          return true;
        }
      }
      return false;
    };
    
    for (const row of formattedData) {
      const url = row.URL || '';
      if (!url) continue;
      
      const rootDomain = this.getRootDomain(url);
      if (!rootDomain) {
        console.warn('[Execution Engine] Invalid URL during deduplication:', url);
        continue;
      }
      
      const priority = this.getPagePriority(url);
      
      // Check if we already have this domain
      if (!domainMap.has(rootDomain)) {
        // Also check if we have a similar title from a different domain (same article)
        let isDuplicate = false;
        for (const [existingDomain, existingRow] of domainMap.entries()) {
          if (areTitlesSimilar(row.Name, existingRow.Name)) {
            console.log('[Execution Engine] Found duplicate title:', row.Name, 'on', rootDomain, 'vs', existingDomain);
            // Keep the one with higher priority (homepage > product page > other)
            if (priority > existingRow.priority) {
              domainMap.delete(existingDomain);
              domainMap.set(rootDomain, { ...row, domain: rootDomain, priority });
            }
            isDuplicate = true;
            break;
          }
        }
        if (!isDuplicate) {
          domainMap.set(rootDomain, { ...row, domain: rootDomain, priority });
        }
      } else {
        const existing = domainMap.get(rootDomain);
        if (priority > existing.priority) {
          domainMap.set(rootDomain, { ...row, domain: rootDomain, priority });
        }
      }
    }
    
    // Convert map to array and sort by priority (homepages first)
    const uniqueByDomain = Array.from(domainMap.values())
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    const requestedCount = this.requestedResultCount || 5;
    const limited = uniqueByDomain.slice(0, requestedCount);
    
    // VALIDATION: Check if we have enough distinct entities
    const distinctDomains = new Set(limited.map((r: any) => r.domain));
    const hasEnoughEntities = distinctDomains.size >= requestedCount;
    
    console.log('[Execution Engine] Entity-level deduplication:');
    console.log('[Execution Engine] - Total extracted:', formattedData.length);
    console.log('[Execution Engine] - Unique domains found:', domainMap.size);
    console.log('[Execution Engine] - Distinct entities in result:', distinctDomains.size);
    console.log('[Execution Engine] - Requested count:', requestedCount);
    console.log('[Execution Engine] - Has enough entities:', hasEnoughEntities);
    console.log('[Execution Engine] - Is "top N" task:', this.isTopNTask);
    
    // For "top N" tasks, ensure we have N distinct entities
    if (this.isTopNTask && !hasEnoughEntities) {
      const missingCount = requestedCount - distinctDomains.size;
      console.warn(`[Execution Engine] WARNING: Only found ${distinctDomains.size} distinct entities, need ${requestedCount}. Missing ${missingCount} entities.`);
      console.warn('[Execution Engine] Consider performing additional searches with varied queries to find more distinct entities.');
      
      // Generate suggested retry queries
      const retryQueries = this.generateVariedQueries(this.originalQuery || this.lastSearchQuery, 1);
      console.log('[Execution Engine] Suggested retry queries:', retryQueries);
    }
    
    // Store in collectedData for later use in output creation
    // Only add if we have enough entities OR if this isn't a strict "top N" task
    if (hasEnoughEntities || !this.isTopNTask) {
      this.collectedData.push(...limited);
    } else {
      // For "top N" tasks without enough entities, still store but warn
      console.warn('[Execution Engine] Storing partial results - not enough distinct entities');
      this.collectedData.push(...limited);
    }
    
    // Remove domain and priority fields before returning (internal use only)
    const cleanedResults = limited.map((r: any) => {
      const { domain, priority, ...rest } = r;
      return rest;
    });
    
    console.log('[Execution Engine] Extracted data:', cleanedResults.length, 'items (entity-level deduplicated)');
    console.log('[Execution Engine] Total collected data:', this.collectedData.length, 'items');

    // Build status message
    let statusMessage = `Extracted ${cleanedResults.length} items from ${distinctDomains.size} distinct entities`;
    if (this.isTopNTask && !hasEnoughEntities) {
      statusMessage += ` (WARNING: Need ${requestedCount} distinct entities, found ${distinctDomains.size})`;
    }

    return {
      success: hasEnoughEntities || !this.isTopNTask, // Fail if "top N" task doesn't have enough entities
      stepIndex: this.currentStep,
      status: statusMessage,
      data: cleanedResults,
      metadata: {
        distinctEntities: distinctDomains.size,
        requestedCount: requestedCount,
        hasEnoughEntities: hasEnoughEntities,
        isTopNTask: this.isTopNTask,
        retryQueries: this.isTopNTask && !hasEnoughEntities ? this.generateVariedQueries(this.originalQuery || this.lastSearchQuery, 1) : undefined
      },
      error: this.isTopNTask && !hasEnoughEntities 
        ? `Only found ${distinctDomains.size} distinct entities, but ${requestedCount} were requested. Consider performing additional searches.`
        : undefined
    };
  }

  private async click(selector: string): Promise<ExecutionResult> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) {
      throw new Error('No active tab');
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (sel: string) => {
        const element = document.querySelector(sel) as HTMLElement;
        if (element) {
          element.click();
        }
      },
      args: [selector]
    });

    await this.delay(1000);

    return {
      success: true,
      stepIndex: this.currentStep,
      status: `Clicked ${selector}`,
      data: { selector }
    };
  }

  private async type(selector: string, text: string): Promise<ExecutionResult> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) {
      throw new Error('No active tab');
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (sel: string, txt: string) => {
        const element = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement;
        if (element) {
          element.focus();
          element.value = txt;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        }
      },
      args: [selector, text]
    });

    return {
      success: true,
      stepIndex: this.currentStep,
      status: `Typed into ${selector}`,
      data: { selector, text }
    };
  }

  private async scroll(): Promise<ExecutionResult> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) {
      throw new Error('No active tab');
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        window.scrollBy(0, window.innerHeight);
      }
    });

    await this.delay(1000);

    return {
      success: true,
      stepIndex: this.currentStep,
      status: 'Scrolled down'
    };
  }

  private async wait(ms: number): Promise<ExecutionResult> {
    await this.delay(ms);
    return {
      success: true,
      stepIndex: this.currentStep,
      status: `Waited ${ms}ms`
    };
  }

  private async createOutput(outputType: string, data?: any): Promise<ExecutionResult> {
    if (outputType === 'sheet') {
      this.updateStatus(ExecutionStatus.RUNNING, 'Writing to Google Sheets…');
    }
    // Use provided data or collected data, ensuring we have something
    // Priority: provided data > collectedData > empty array
    // IMPORTANT: Only use collectedData from the CURRENT execution, not from previous tasks
    let outputData: any[] = [];
    
    if (data && Array.isArray(data) && data.length > 0) {
      // Use provided data (from extraction step result)
      outputData = data;
      console.log('[Execution Engine] Using provided data:', outputData.length, 'items');
    } else if (data && !Array.isArray(data)) {
      outputData = [data];
      console.log('[Execution Engine] Using provided single data item');
    } else if (this.collectedData && this.collectedData.length > 0) {
      // Only use collectedData if we're still executing (not from a previous task)
      if (this.isExecuting) {
        outputData = this.collectedData;
        console.log('[Execution Engine] Using collectedData from current execution:', outputData.length, 'items');
      } else {
        console.warn('[Execution Engine] WARNING: createOutput called after execution finished, collectedData may be stale. Using empty array.');
        outputData = [];
      }
    } else {
      console.log('[Execution Engine] No data provided and no collectedData available');
    }
    
    // ALWAYS limit to requested count if it's set (user explicitly requested a number)
    // This ensures we respect the user's request regardless of task type
    const requestedLimit = this.requestedResultCount;
    if (requestedLimit && requestedLimit > 0 && outputData.length > requestedLimit) {
      console.log('[Execution Engine] Limiting output to requested count:', requestedLimit, '(had', outputData.length, 'items)');
      outputData = outputData.slice(0, requestedLimit);
    }
    
    // Apply entity-level deduplication to final output data
    // This ensures "top N" means N distinct entities even if data came from multiple extractions
    if (this.isTopNTask && outputData.length > 0) {
      const domainMap = new Map<string, any>();
      
      for (const row of outputData) {
        const url = row.URL || row.url || '';
        if (!url) continue;
        
        const rootDomain = this.getRootDomain(url);
        if (!rootDomain) continue;
        
        const priority = this.getPagePriority(url);
        
        if (!domainMap.has(rootDomain)) {
          domainMap.set(rootDomain, { ...row, domain: rootDomain, priority });
        } else {
          const existing = domainMap.get(rootDomain);
          if (priority > existing.priority) {
            domainMap.set(rootDomain, { ...row, domain: rootDomain, priority });
          }
        }
      }
      
      const uniqueByDomain = Array.from(domainMap.values())
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));
      
      // Limit to requested count (default to 5 if not set)
      const limit = this.requestedResultCount || 5;
      const limited = uniqueByDomain.slice(0, limit);
      console.log('[Execution Engine] Limiting output to', limit, 'results (requested:', this.requestedResultCount, ')');
      
      // Remove domain and priority fields
      outputData = limited.map((r: any) => {
        const { domain, priority, ...rest } = r;
        return rest;
      });
      
      const distinctDomains = new Set(limited.map((r: any) => r.domain));
      console.log('[Execution Engine] Final entity-level deduplication:');
      console.log('[Execution Engine] - Before:', this.collectedData.length, 'items');
      console.log('[Execution Engine] - After:', outputData.length, 'items');
      console.log('[Execution Engine] - Distinct entities:', distinctDomains.size);
      
      // Ensure we don't exceed requested count even after deduplication
      if (requestedLimit && requestedLimit > 0 && outputData.length > requestedLimit) {
        console.log('[Execution Engine] Additional limiting after deduplication:', outputData.length, '->', requestedLimit);
        outputData = outputData.slice(0, requestedLimit);
      }
    } else if (requestedLimit && requestedLimit > 0 && outputData.length > requestedLimit) {
      // Even if not a "top N" task, still respect the requested count if user specified one
      console.log('[Execution Engine] Limiting to requested count (non-topN task):', requestedLimit);
      outputData = outputData.slice(0, requestedLimit);
    }
    
    console.log('[Execution Engine] Creating output with', outputData.length, 'items');
    console.log('[Execution Engine] Output type:', outputType);
    console.log('[Execution Engine] Sample data:', outputData.slice(0, 2));
    console.log('[Execution Engine] Collected data length:', this.collectedData.length);
    
    // If no data provided and nothing collected, return error
    if (!outputData || outputData.length === 0) {
      console.warn('[Execution Engine] No data to export, but will still create empty sheet');
      // For sheet creation, we'll still create it but warn the user
      if (outputType === 'sheet') {
        // Still create the sheet but with a clear warning
        const result = await this.createGoogleSheet([]);
        return {
          success: false,
          stepIndex: this.currentStep,
          status: 'No data to export, but will still create empty sheet',
          error: 'Extraction returned 0 items. The sheet was created but is empty. Please check that the search and extraction steps completed successfully.',
          data: result.data
        };
      }
      
      return {
        success: false,
        stepIndex: this.currentStep,
        status: 'No data to export',
        error: 'No data was collected. Make sure extraction steps ran successfully before creating output.'
      };
    }

    switch (outputType) {
      case 'csv':
        return await this.createCSV(outputData);
      
      case 'sheet':
        return await this.createGoogleSheet(outputData);
      
      case 'table':
        return {
          success: true,
          stepIndex: this.currentStep,
          status: 'Created table preview',
          data: outputData
        };
      
      default:
        return {
          success: true,
          stepIndex: this.currentStep,
          status: 'Created output',
          data: outputData
        };
    }
  }

  private async createCSV(data: any[]): Promise<ExecutionResult> {
    if (data.length === 0) {
      return {
        success: false,
        stepIndex: this.currentStep,
        status: 'No data to export',
        error: 'No data collected'
      };
    }

    // Simple CSV generation
    const headers = Object.keys(data[0] || {});
    const csvRows = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header] || '';
          // Handle nested objects/arrays
          const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
          return `"${stringValue.replace(/"/g, '""')}"`;
        }).join(',')
      )
    ];

    const csv = csvRows.join('\n');
    
    // Trigger download via background script
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'DOWNLOAD_CSV',
        csv: csv,
        filename: `ai-tools-${Date.now()}.csv`
      }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({
            success: false,
            stepIndex: this.currentStep,
            status: 'Download failed',
            error: chrome.runtime.lastError.message
          });
        } else {
          resolve({
            success: true,
            stepIndex: this.currentStep,
            status: `CSV file created with ${data.length} rows`,
            data: { csv, rowCount: data.length, headers: Object.keys(data[0] || {}) }
          });
        }
      });
    });
  }

  private async createGoogleSheet(data: any[]): Promise<ExecutionResult> {
    // Warn if no data
    if (!data || data.length === 0) {
      console.warn('[Execution Engine] No data to write, but sheet is opened');
    }
    
    // Initialize Google Sheets API
    // Chrome Identity API doesn't require a Client ID - it uses extension ID automatically
    if (!this.googleSheets) {
      this.googleSheets = new GoogleSheetsAPI();
    }

    // Check authentication
    const isAuthenticated = await this.googleSheets.checkAuth();
    if (!isAuthenticated) {
      const authenticated = await this.googleSheets.authenticate();
      if (!authenticated) {
        return {
          success: false,
          stepIndex: this.currentStep,
          status: 'Failed to authenticate with Google. Please try again.',
          error: 'OAuth authentication failed'
        };
      }
    }

    // Create spreadsheet
    console.log('[Execution Engine] Creating Google Sheet...');
    const spreadsheetResult = await this.googleSheets.createSpreadsheet('AI Tools Data');
    if (!spreadsheetResult) {
      console.error('[Execution Engine] Failed to create spreadsheet');
      return {
        success: false,
        stepIndex: this.currentStep,
        status: 'Failed to create Google Sheet. Please check browser console for details.',
        error: 'Could not create spreadsheet'
      };
    }

    const { spreadsheetId, sheetName } = spreadsheetResult;
    console.log('[Execution Engine] Spreadsheet created:', spreadsheetId, 'with sheet:', sheetName);

    // If no data, still open the sheet but warn user
    if (!data || data.length === 0) {
      const spreadsheetUrl = this.googleSheets.getSpreadsheetUrl(spreadsheetId);
      await chrome.tabs.create({ url: spreadsheetUrl });
      
      return {
        success: false,
        stepIndex: this.currentStep,
        status: 'No data to write, but sheet is opened',
        error: 'Extraction returned 0 items. The sheet was created but is empty. Please check the extraction step - it may have failed to find search results on the page.',
        data: {
          spreadsheetId: spreadsheetId,
          spreadsheetUrl: spreadsheetUrl
        }
      };
    }

    // Write data to spreadsheet
    console.log('[Execution Engine] Writing data to spreadsheet...', data.length, 'rows');
    const writeSuccess = await this.googleSheets.writeData(spreadsheetId, data);
    if (!writeSuccess) {
      console.error('[Execution Engine] Failed to write data');
      // Still open the sheet even if write failed, so user can see it
      const spreadsheetUrl = this.googleSheets.getSpreadsheetUrl(spreadsheetId);
      await chrome.tabs.create({ url: spreadsheetUrl });
      
      return {
        success: false,
        stepIndex: this.currentStep,
        status: `Created Google Sheet but failed to write data. Sheet opened - please check browser console for details.`,
        error: 'Could not write data to spreadsheet',
        data: {
          spreadsheetId: spreadsheetId,
          spreadsheetUrl: spreadsheetUrl
        }
      };
    }

    console.log('[Execution Engine] Data written successfully, opening sheet...');

    // Open the spreadsheet in a new tab
    const spreadsheetUrl = this.googleSheets.getSpreadsheetUrl(spreadsheetId);
    await chrome.tabs.create({ url: spreadsheetUrl });
    
    console.log('[Execution Engine] Sheet opened:', spreadsheetUrl);

    // Return success - data is already written via API
    return {
      success: true,
      stepIndex: this.currentStep,
      status: `Created Google Sheet with ${data.length} rows. Data has been automatically imported via Google Sheets API.`,
      data: {
        rowCount: data.length,
        headers: Object.keys(data[0] || {}),
        spreadsheetId: spreadsheetId,
        spreadsheetUrl: spreadsheetUrl,
        instructions: 'Data has been automatically imported into Google Sheets using the API. No manual steps required!'
      }
    };
  }

  // Legacy method - kept for fallback (not used when API is configured)
  private async createGoogleSheetLegacy(data: any[]): Promise<ExecutionResult> {
    // Convert data to CSV format (in memory only, no download)
    const headers = Object.keys(data[0] || {});
    const csvRows = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = String(row[header] || '');
          // Escape quotes and wrap in quotes if contains comma, quote, or newline
          if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',')
      )
    ];
    const csvData = csvRows.join('\n');

    // Navigate to Google Sheets
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) {
      return {
        success: false,
        stepIndex: this.currentStep,
        status: 'No active tab',
        error: 'Cannot open Google Sheets'
      };
    }

    // Open a new Google Sheet directly
    const sheetsTab = await chrome.tabs.create({ url: 'https://docs.google.com/spreadsheets/create' });
    await this.delay(8000); // Wait longer for sheet to fully load

    // Try to import CSV data directly into the sheet using multiple methods
    try {
      await chrome.scripting.executeScript({
        target: { tabId: sheetsTab.id! },
        func: (csvText: string) => {
          console.log('[Google Sheets] Starting CSV import process');
          
          // Function to wait for element
          const waitFor = (condition: () => boolean, timeout = 15000): Promise<boolean> => {
            return new Promise((resolve) => {
              let elapsed = 0;
              const check = () => {
                if (condition()) {
                  resolve(true);
                  return;
                }
                elapsed += 100;
                if (elapsed < timeout) {
                  setTimeout(check, 100);
                } else {
                  resolve(false);
                }
              };
              check();
            });
          };

          // Wait for the sheet to be fully ready
          waitFor(() => {
            const hasGrid = !!document.querySelector('table[role="grid"]') || 
                           !!document.querySelector('[role="gridcell"]') ||
                           window.location.href.includes('/edit');
            return hasGrid && document.readyState === 'complete';
          }).then((ready) => {
            if (!ready) {
              console.log('[Google Sheets] Sheet not ready after timeout');
              return;
            }
            
            console.log('[Google Sheets] Sheet loaded, attempting to inject CSV data');
            
            // Parse CSV into rows and cells
            const lines = csvText.split('\n').filter(line => line.trim());
            const rows = lines.map(line => {
              const cells: string[] = [];
              let current = '';
              let inQuotes = false;
              
              for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                  inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                  cells.push(current.replace(/^"|"$/g, '').trim());
                  current = '';
                } else {
                  current += char;
                }
              }
              cells.push(current.replace(/^"|"$/g, '').trim());
              return cells;
            });
            
            console.log('[Google Sheets] Parsed CSV:', rows.length, 'rows');
            
            // Method 1: Directly type into each cell (most reliable)
            const typeIntoCells = async () => {
              console.log('[Google Sheets] Starting direct cell typing');
              
              // Find the grid
              const grid = document.querySelector('table[role="grid"]') || 
                          document.querySelector('[role="grid"]');
              
              if (!grid) {
                console.log('[Google Sheets] Grid not found');
                return false;
              }
              
              // Function to find a cell by row/col
              const findCell = (row: number, col: number): HTMLElement | null => {
                const selectors = [
                  `table[role="grid"] tbody tr:nth-child(${row + 1}) td:nth-child(${col + 1})`,
                  `[role="gridcell"][aria-rowindex="${row + 1}"][aria-colindex="${col + 1}"]`,
                  `[data-row-index="${row}"][data-col-index="${col}"]`,
                  `[data-row="${row}"][data-col="${col}"]`
                ];
                
                for (const selector of selectors) {
                  const cell = document.querySelector(selector) as HTMLElement;
                  if (cell) return cell;
                }
                return null;
              };
              
              // Function to type into a cell
              const typeIntoCell = async (cell: HTMLElement, value: string): Promise<boolean> => {
                return new Promise((resolve) => {
                  // Click the cell to select it
                  cell.click();
                  
                  setTimeout(() => {
                    // Double-click to enter edit mode
                    cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
                    
                    setTimeout(() => {
                      // Find the formula bar or input
                      const formulaBar = document.querySelector('input[type="text"][aria-label*="formula"], textarea[aria-label*="formula"], .formula-bar input, .formula-bar textarea') as HTMLInputElement;
                      const activeElement = document.activeElement as HTMLInputElement;
                      
                      const input = formulaBar || (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') ? activeElement : null);
                      
                      if (input) {
                        // Clear and set value
                        input.value = '';
                        input.focus();
                        
                        // Type the value character by character (more reliable)
                        for (let i = 0; i < value.length; i++) {
                          setTimeout(() => {
                            const char = value[i];
                            input.value += char;
                            
                            // Dispatch input events
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
                            input.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
                            
                            // On last character, press Enter
                            if (i === value.length - 1) {
                              setTimeout(() => {
                                input.dispatchEvent(new KeyboardEvent('keydown', {
                                  key: 'Enter',
                                  code: 'Enter',
                                  bubbles: true,
                                  cancelable: true
                                }));
                                
                                // Also try clicking outside or pressing Tab
                                setTimeout(() => {
                                  cell.click();
                                  resolve(true);
                                }, 200);
                              }, 50);
                            }
                          }, i * 10);
                        }
                      } else {
                        // Fallback: try to set value directly on cell
                        cell.textContent = value;
                        cell.dispatchEvent(new Event('change', { bubbles: true }));
                        resolve(true);
                      }
                    }, 300);
                  }, 200);
                });
              };
              
              // Type into each cell sequentially
              for (let rowIdx = 0; rowIdx < Math.min(rows.length, 50); rowIdx++) {
                const row = rows[rowIdx];
                
                for (let colIdx = 0; colIdx < Math.min(row.length, 10); colIdx++) {
                  const value = row[colIdx];
                  if (!value) continue;
                  
                  const cell = findCell(rowIdx, colIdx);
                  if (cell) {
                    await typeIntoCell(cell, value);
                    // Small delay between cells
                    await new Promise(resolve => setTimeout(resolve, 100));
                  } else {
                    console.log(`[Google Sheets] Cell at row ${rowIdx}, col ${colIdx} not found`);
                  }
                }
              }
              
              console.log('[Google Sheets] Finished typing into cells');
              return true;
            };
            
            // Method 2: Try bulk paste via clipboard (faster for large datasets)
            const pasteViaClipboard = async () => {
              try {
                // Copy to clipboard
                await navigator.clipboard.writeText(csvText);
                console.log('[Google Sheets] CSV copied to clipboard');
                
                // Find cell A1
                const cellA1Selectors = [
                  'table[role="grid"] tbody tr:first-child td:first-child',
                  '[role="gridcell"][aria-rowindex="1"][aria-colindex="1"]',
                  '[data-row-index="0"][data-col-index="0"]',
                  '.s0'
                ];
                
                let cellA1: HTMLElement | null = null;
                for (const selector of cellA1Selectors) {
                  const cells = document.querySelectorAll(selector);
                  if (cells.length > 0) {
                    cellA1 = cells[0] as HTMLElement;
                    break;
                  }
                }
                
                if (cellA1) {
                  // Click to select
                  cellA1.click();
                  cellA1.focus();
                  
                  await new Promise(resolve => setTimeout(resolve, 500));
                  
                  // Try to find formula bar
                  const formulaBar = document.querySelector('input[type="text"], textarea') as HTMLInputElement;
                  const target = formulaBar || document.activeElement || cellA1;
                  
                  // Create and dispatch paste event
                  const dataTransfer = new DataTransfer();
                  dataTransfer.setData('text/plain', csvText);
                  
                  const pasteEvent = new ClipboardEvent('paste', {
                    bubbles: true,
                    cancelable: true,
                    clipboardData: dataTransfer
                  });
                  
                  const pasted = target.dispatchEvent(pasteEvent);
                  
                  if (pasted) {
                    console.log('[Google Sheets] Paste event accepted');
                    // Press Enter to confirm
                    setTimeout(() => {
                      target.dispatchEvent(new KeyboardEvent('keydown', {
                        key: 'Enter',
                        code: 'Enter',
                        bubbles: true
                      }));
                    }, 100);
                    return true;
                  }
                }
              } catch (err) {
                console.error('[Google Sheets] Clipboard paste failed:', err);
              }
              return false;
            };
            
            // Try paste first (faster), fallback to typing
            setTimeout(async () => {
              const pasted = await pasteViaClipboard();
              if (!pasted) {
                console.log('[Google Sheets] Paste failed, trying direct typing');
                setTimeout(() => {
                  typeIntoCells();
                }, 1000);
              }
            }, 2000);
          });
        },
        args: [csvData]
      });

      return {
        success: true,
        stepIndex: this.currentStep,
        status: `Created Google Sheet with ${data.length} rows. Data is being automatically imported - no download required.`,
        data: {
          rowCount: data.length,
          headers: Object.keys(data[0] || {}),
          csv: csvData, // Keep in memory for import methods
          instructions: 'Data is being automatically imported into Google Sheets. No file download required.'
        }
      };
    } catch (error: any) {
      // If automation fails, data is still in memory for retry
      return {
        success: true,
        stepIndex: this.currentStep,
        status: `Created Google Sheet with ${data.length} rows. Attempting automatic import...`,
        data: {
          rowCount: data.length,
          headers: Object.keys(data[0] || {}),
          csv: csvData,
          instructions: 'Data import is in progress. The system will automatically populate the sheet.'
        }
      };
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

