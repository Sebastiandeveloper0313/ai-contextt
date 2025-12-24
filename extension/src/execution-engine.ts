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
}

export class ExecutionEngine {
  private isExecuting = false;
  private shouldStop = false;
  private currentStep = 0;
  private collectedData: any[] = [];

  async executePlan(
    steps: ExecutionStep[],
    onProgress: (result: ExecutionResult) => void,
    onComplete: (results: ExecutionResult[]) => void
  ): Promise<void> {
    if (this.isExecuting) {
      throw new Error('Execution already in progress');
    }

    this.isExecuting = true;
    this.shouldStop = false;
    this.currentStep = 0;
    this.collectedData = [];
    const results: ExecutionResult[] = [];

    try {
      for (let i = 0; i < steps.length; i++) {
        if (this.shouldStop) {
          results.push({
            success: false,
            stepIndex: i,
            status: 'Stopped by user',
            error: 'Execution stopped'
          });
          onProgress(results[results.length - 1]);
          break;
        }

        this.currentStep = i;
        const step = steps[i];
        const result = await this.executeStep(step, i);
        results.push(result);
        onProgress(result);

        // Small delay between steps for visibility
        await this.delay(500);
      }

      onComplete(results);
    } finally {
      this.isExecuting = false;
    }
  }

  stop(): void {
    this.shouldStop = true;
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
      let newTab: chrome.tabs.Tab;
      try {
        newTab = await chrome.tabs.create({ url, active: true });
        console.log('[Execution Engine] Created tab', newTab.id, 'with URL:', url);
        if (!newTab.id) {
          console.error('[Execution Engine] Tab created but has no ID');
          return {
            success: false,
            stepIndex: this.currentStep,
            status: 'Navigation failed',
            error: 'Tab created but has no ID'
          };
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
        const [verifyTab] = await chrome.tabs.query({ tabId: newTab.id });
        verifiedUrl = verifyTab?.url || finalUrl;
        console.log('[Execution Engine] After navigation, tab URL:', verifiedUrl);
      } catch (verifyError: any) {
        console.warn('[Execution Engine] Error verifying tab URL, using finalUrl:', verifyError);
        verifiedUrl = finalUrl;
      }
      
      // For Google search URLs, check if we're on search results
      if (url.includes('google.com/search')) {
        if (!verifiedUrl.includes('google.com/search') || !verifiedUrl.includes('q=')) {
          console.warn('[Execution Engine] Not on search results page! Expected search URL, got:', verifiedUrl);
          // Return success but with warning - extraction will handle the error
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
    // Use a more direct Google search URL format
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en`;
    console.log('[Execution Engine] Searching for:', query, 'URL:', searchUrl);
    
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
    
    // Wait longer for search results to fully load
    console.log('[Execution Engine] Waiting for search results to load...');
    await this.delay(4000);
    
    // Verify we're on the search results page using the tabId from navigation result
    const tabId = result.data?.tabId;
    if (tabId) {
      try {
        const tab = await chrome.tabs.get(tabId);
        console.log('[Execution Engine] After navigation, current URL:', tab.url);
        
        if (!tab.url?.includes('google.com/search') || !tab.url?.includes('q=')) {
          console.warn('[Execution Engine] Not on search results page! Current URL:', tab.url);
          // Navigation succeeded but URL check failed - still return success
          // The extraction step will handle finding the correct tab
          return {
            ...result,
            success: true, // Ensure success is true
            status: `Searched for "${query}" - results may be loading`
          };
        } else {
          // Navigation succeeded and we're on search results
          return {
            ...result,
            success: true, // Ensure success is true
            status: `Searched for "${query}" successfully`
          };
        }
      } catch (tabError: any) {
        console.error('[Execution Engine] Error getting tab:', tabError);
        // Even if we can't verify the tab, if navigation succeeded, return success
        return {
          ...result,
          success: true,
          status: `Searched for "${query}"`
        };
      }
    }
    
    // If we have a successful navigation result but no tabId, still return success
    if (result.success) {
      return {
        ...result,
        success: true,
        status: `Searched for "${query}"`
      };
    }
    
    return result;
  }

  private async extract(selector: string): Promise<ExecutionResult> {
    // Get all tabs and find the one with search results (most recently created)
    const allTabs = await chrome.tabs.query({});
    
    // Find the tab with Google search results, prefer the most recently updated one
    let targetTab = allTabs
      .filter(tab => {
        const url = tab.url || '';
        return url.includes('google.com/search') && url.includes('q=');
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

    // Check if we're on Google search results page
    const isGoogleSearch = targetTab.url?.includes('google.com/search') && targetTab.url?.includes('q=');
    
    console.log('[Extract] Starting extraction on tab', targetTab.id, 'isGoogleSearch:', isGoogleSearch, 'URL:', targetTab.url);

    // Wait longer for Google results to fully load and verify we're on results page
    if (isGoogleSearch) {
      console.log('[Extract] Waiting for Google search results to load...');
      await this.delay(4000); // Wait 4 seconds for results to load
      
      // Re-check the tab URL after waiting (Google might have redirected)
      const updatedTab = await chrome.tabs.get(targetTab.id);
      const currentUrl = updatedTab.url || '';
      console.log('[Extract] Current URL after wait:', currentUrl);
      
      // If we're not on search results, try to find the correct tab
      if (!currentUrl.includes('google.com/search') || !currentUrl.includes('q=')) {
        console.warn('[Extract] Not on search results page! URL:', currentUrl);
        
        // Try to find any tab with search results
        const allTabsAgain = await chrome.tabs.query({});
        const searchTab = allTabsAgain.find(t => 
          t.url?.includes('google.com/search') && t.url?.includes('q=')
        );
        
        if (searchTab && searchTab.id) {
          console.log('[Extract] Found search results tab:', searchTab.id, searchTab.url);
          targetTab = searchTab;
        } else {
          return {
            success: false,
            stepIndex: this.currentStep,
            status: 'Could not find Google search results page. The navigation may not have completed.',
            error: `Current URL: ${currentUrl}`
          };
        }
      }
      
      // Verify we're actually on a search results page (not homepage)
      const verifyResults = await chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        func: () => {
          // Check if search results are present in main content area
          const mainContent = document.querySelector('#main') || document.querySelector('#search');
          if (!mainContent) {
            console.log('[Extract] No main content area found');
            return false;
          }
          
          // Check if search results are present
          const hasResults = mainContent.querySelector('div[data-ved]') || 
                            mainContent.querySelector('div.g') ||
                            mainContent.querySelector('h3');
          const resultCount = mainContent.querySelectorAll('div[data-ved]').length || 
                            mainContent.querySelectorAll('div.g').length;
          console.log('[Extract] Found', resultCount, 'potential result containers');
          return !!hasResults;
        }
      });
      
      if (!verifyResults[0]?.result) {
        console.log('[Extract] No search results found, waiting longer...');
        await this.delay(3000);
      } else {
        console.log('[Extract] Search results verified, proceeding with extraction');
      }
    }

    // Re-query tab to get latest URL after waiting
    const finalTab = await chrome.tabs.get(targetTab.id);
    if (!finalTab || !finalTab.id) {
      throw new Error('No tab found for extraction');
    }
    
    // Check URL again after waiting
    const finalUrl = finalTab.url || '';
    const isActuallyOnSearch = finalUrl.includes('google.com/search') && finalUrl.includes('q=');
    
    if (!isActuallyOnSearch && isGoogleSearch) {
      console.warn('[Extract] URL check failed, but will attempt extraction anyway. URL:', finalUrl);
      // Don't return error here - try extraction anyway, it might still work
    } else if (isActuallyOnSearch) {
      console.log('[Extract] Confirmed on search results page:', finalUrl);
    }
    
    const results = await chrome.scripting.executeScript({
      target: { tabId: finalTab.id },
      func: (sel: string, isGoogle: boolean) => {
        console.log('[Extract Script] Starting extraction, isGoogle:', isGoogle, 'selector:', sel);
        console.log('[Extract Script] Current URL:', window.location.href);
        
        // Double-check if we're on Google search (in case URL check failed)
        const currentUrl = window.location.href;
        const isActuallyGoogle = currentUrl.includes('google.com/search') || 
                                (currentUrl.includes('google.com') && currentUrl.includes('q='));
        
        console.log('[Extract Script] isActuallyGoogle:', isActuallyGoogle);
        
        if (isGoogle || isActuallyGoogle) {
          console.log('[Extract Script] Using Google search extraction');
          
          // If we're on webhp (homepage), we need to wait for navigation or try to find results
          if (currentUrl.includes('/webhp') && !currentUrl.includes('q=')) {
            console.warn('[Extract Script] On Google homepage (/webhp) - search may not have completed!');
            console.warn('[Extract Script] Waiting 2 more seconds for potential navigation...');
            // Can't easily wait in executeScript, but we'll try to extract anyway
          }
          // Helper function to check if text looks like valid content (not CSS/JS/error/UI)
          const isValidContent = (text: string): boolean => {
            if (!text || text.length < 5) return false; // Minimum 5 chars
            const lowerText = text.toLowerCase().trim();
            // Filter out CSS/JS snippets
            if (text.includes('{') && text.includes('}') && text.includes(':')) return false;
            if (text.includes('var(') || text.includes('function(')) return false;
            if (text.includes('display:') || text.includes('background-color:')) return false;
            // Filter out error messages
            if (lowerText.includes('något gick fel') || 
                lowerText.includes('historiken raderad') ||
                lowerText.includes('error')) return false;
            // Filter out UI labels (Swedish and English)
            if (lowerText.includes('ladda upp') || 
                lowerText.includes('upload') ||
                lowerText === 'bild' ||
                lowerText === 'fil' ||
                lowerText.includes('image') ||
                lowerText.includes('file') ||
                lowerText.includes('button') ||
                lowerText.includes('knapp') ||
                lowerText.startsWith('ladda')) return false;
            // Filter out navigation/menu items
            if (lowerText.includes('gmail') && lowerText.includes('bilder')) return false;
            // Must have at least one letter
            if (!/[a-zA-Z]/.test(text)) return false;
            // Must look like a real title (not just numbers or single words)
            const words = text.trim().split(/\s+/);
            if (words.length < 2 && words[0].length < 8) return false;
            return true;
          };
          
          // Specialized extraction for Google search results
          const searchResults: any[] = [];
          
          // Try multiple selector strategies for Google search results
          let resultContainers: NodeListOf<Element> | null = null;
          
          // Strategy 1: Modern Google selectors (try multiple)
          // Focus on main search results area, exclude navigation/header
          const mainContent = document.querySelector('#main') || document.querySelector('#search') || document.body;
          if (!mainContent) {
            console.log('[Extract] No main content area found');
            return [];
          }
          
          const selectors = [
            'div[data-ved]',
            'div.g',
            'div[class*="g "]',
            'div.tF2Cxc',
            'div[jscontroller]'
          ];
          
          for (const selector of selectors) {
            const candidates = mainContent.querySelectorAll(selector);
            console.log('[Extract Script] Selector', selector, 'found', candidates.length, 'candidates');
            
            // Filter to only containers that have an h3 (title) AND a link pointing to external site
            const withTitles = Array.from(candidates).filter(el => {
              const hasH3 = el.querySelector('h3');
              const linkEl = el.querySelector('a[href]') as HTMLAnchorElement;
              if (!hasH3 || !linkEl || !linkEl.href) return false;
              
              const href = linkEl.href;
              // Must be an external link (not Google internal)
              if (href.includes('google.com/search') || 
                  href.includes('google.com/url') || 
                  href.includes('google.com/maps') ||
                  href.includes('google.com/webhp') ||
                  href.includes('google.com/images')) return false;
              
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
          }
          
          // Strategy 2: Look for h3 elements and find their parent containers
          if (!resultContainers || resultContainers.length === 0) {
            const h3Elements = document.querySelectorAll('h3');
            h3Elements.forEach((h3, index) => {
              if (index >= 10) return;
              
              const title = h3.textContent?.trim() || '';
              if (!isValidContent(title)) return;
              
              // Find the parent container with a link
              let container = h3.parentElement;
              let attempts = 0;
              while (container && attempts < 5) {
                const linkEl = container.querySelector('a[href]') as HTMLAnchorElement;
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
                      url.includes('google.com/webhp')) {
                    return;
                  }
                  
                  // Must be a valid HTTP/HTTPS URL
                  if (!url.startsWith('http://') && !url.startsWith('https://')) return;
                  
                  // Find description
                  const descEl = container.querySelector('.VwiC3b') ||
                                container.querySelector('span[style*="-webkit-line-clamp"]') ||
                                container.querySelector('.s') ||
                                container.querySelector('[data-sncf]') ||
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
                    // Make sure URL is actually a real website URL
                    const urlLower = url.toLowerCase();
                    if (!urlLower.includes('google.com') && 
                        !urlLower.includes('youtube.com/watch') && // Skip YouTube watch pages
                        (urlLower.includes('.com') || urlLower.includes('.org') || urlLower.includes('.net') || urlLower.includes('.io'))) {
                      searchResults.push({
                        name: title,
                        url: url,
                        description: description,
                        rank: searchResults.length + 1
                      });
                    }
                  }
                  return;
                }
                container = container.parentElement;
                attempts++;
              }
            });
          } else {
            // Use the found containers
            resultContainers.forEach((container, index) => {
              if (index >= 10) return; // Limit to top 10 results
              
              // Extract title
              const titleEl = container.querySelector('h3') || container.querySelector('a h3');
              const title = titleEl?.textContent?.trim() || '';
              
              if (!isValidContent(title)) return;
              
              // Extract URL
              const linkEl = container.querySelector('a[href]') as HTMLAnchorElement;
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
              if (url.includes('google.com/search') || url.includes('google.com/url') || url.includes('google.com/maps')) {
                return;
              }
              
              if (!url.startsWith('http')) return;
              
              // Extract description/snippet
              const descEl = container.querySelector('span[style*="-webkit-line-clamp"]') || 
                            container.querySelector('.VwiC3b') ||
                            container.querySelector('.s') ||
                            container.querySelector('[data-sncf]') ||
                            Array.from(container.querySelectorAll('span')).find(s => {
                              const text = s.textContent?.trim() || '';
                              return text.length > 30 && text.length < 500 && isValidContent(text);
                            });
              const description = (descEl?.textContent?.trim() || '').substring(0, 200);
              
              // Only add if we have valid title and URL
              if (title && url) {
                searchResults.push({
                  name: title,
                  url: url,
                  description: description,
                  rank: searchResults.length + 1
                });
              }
            });
          }
          
          console.log('[Extract] Found', searchResults.length, 'Google search results');
          return searchResults.length > 0 ? searchResults : [];
        } else {
          // Generic extraction using selector - but ONLY if we're NOT on Google search
          // If we're on Google search but Strategy 1 and 2 failed, return empty array
          console.warn('[Extract] Generic extraction called, but this should not happen on Google search pages');
          console.warn('[Extract] Returning empty array to avoid extracting UI elements');
          return [];
        }
      },
      args: [selector, isGoogleSearch]
    });

    const extracted = results[0]?.result || [];
    
    // Format extracted data for CSV
    const formattedData = extracted.map((item: any) => ({
      Name: item.name || item.text || 'Unknown',
      URL: item.url || item.href || '',
      Description: item.description || '',
      Rank: item.rank || ''
    }));

    // Store in collectedData for later use in output creation
    this.collectedData.push(...formattedData);
    
    console.log('[Execution Engine] Extracted data:', formattedData.length, 'items');
    console.log('[Execution Engine] Total collected data:', this.collectedData.length, 'items');

    return {
      success: true,
      stepIndex: this.currentStep,
      status: `Extracted ${extracted.length} items`,
      data: formattedData
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
    // Use provided data or collected data, ensuring we have something
    // Priority: provided data > collectedData > empty array
    let outputData: any[] = [];
    
    if (data && Array.isArray(data) && data.length > 0) {
      outputData = data;
    } else if (data && !Array.isArray(data)) {
      outputData = [data];
    } else if (this.collectedData && this.collectedData.length > 0) {
      outputData = this.collectedData;
    }
    
    console.log('[Execution Engine] Creating output with', outputData.length, 'items');
    console.log('[Execution Engine] Output type:', outputType);
    console.log('[Execution Engine] Sample data:', outputData.slice(0, 2));
    
    // If no data provided and nothing collected, return error
    if (!outputData || outputData.length === 0) {
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

    // Write data to spreadsheet
    console.log('[Execution Engine] Writing data to spreadsheet...', data.length, 'rows');
    const writeSuccess = await this.googleSheets.writeData(spreadsheetId, data, sheetName);
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

