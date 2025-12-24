// Execution Engine for Agentic Actions
// Handles browser automation tasks safely and transparently

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

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) {
      throw new Error('No active tab');
    }

    try {
      await chrome.tabs.update(tab.id, { url });
      await this.delay(2000); // Wait for page to load

      return {
        success: true,
        stepIndex: this.currentStep,
        status: `Navigated to ${url}`,
        data: { url }
      };
    } catch (error: any) {
      return {
        success: false,
        stepIndex: this.currentStep,
        status: 'Navigation failed',
        error: error.message || 'Failed to navigate'
      };
    }
  }

  private async search(query: string): Promise<ExecutionResult> {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    return await this.navigate(searchUrl);
  }

  private async extract(selector: string): Promise<ExecutionResult> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) {
      throw new Error('No active tab');
    }

    // Check if we're on Google search results page
    const isGoogleSearch = tab.url?.includes('google.com/search');

    // Wait a bit longer for Google results to load
    if (isGoogleSearch) {
      await this.delay(1000);
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (sel: string, isGoogle: boolean) => {
        if (isGoogle) {
          // Specialized extraction for Google search results
          const searchResults: any[] = [];
          
          // Try multiple selector strategies for Google search results
          let resultContainers: NodeListOf<Element> | null = null;
          
          // Strategy 1: Modern Google selectors (try multiple)
          const selectors = [
            'div[data-ved]',
            'div.g',
            'div[class*="g "]',
            'div.tF2Cxc',
            'div[jscontroller]',
            'div[data-sokoban-container]',
            'div[data-entityname]'
          ];
          
          for (const selector of selectors) {
            const candidates = document.querySelectorAll(selector);
            // Filter to only containers that have an h3 (title)
            const withTitles = Array.from(candidates).filter(el => el.querySelector('h3'));
            if (withTitles.length > 0) {
              resultContainers = withTitles as any;
              break;
            }
          }
          
          // Strategy 2: Look for h3 elements and find their parent containers
          if (!resultContainers || resultContainers.length === 0) {
            const h3Elements = document.querySelectorAll('h3');
            h3Elements.forEach((h3, index) => {
              if (index >= 10) return;
              
              // Find the parent container
              let container = h3.parentElement;
              while (container && !container.querySelector('a[href]')) {
                container = container.parentElement;
              }
              
              if (container) {
                const title = h3.textContent?.trim() || '';
                const linkEl = container.querySelector('a[href]') as HTMLAnchorElement;
                const url = linkEl?.href || '';
                
                // Find description - look for sibling spans or divs
                const descEl = container.querySelector('.VwiC3b') ||
                              container.querySelector('span[style*="-webkit-line-clamp"]') ||
                              container.querySelector('.s') ||
                              Array.from(container.querySelectorAll('span')).find(s => 
                                s.textContent && s.textContent.length > 50 && s.textContent.length < 500
                              );
                const description = descEl?.textContent?.trim() || '';
                
                if (title && url && !url.includes('google.com/search')) {
                  searchResults.push({
                    name: title,
                    url: url,
                    description: description,
                    rank: searchResults.length + 1
                  });
                }
              }
            });
          } else {
            // Use the found containers
            resultContainers.forEach((container, index) => {
              if (index >= 10) return; // Limit to top 10 results
              
              // Extract title
              const titleEl = container.querySelector('h3') || container.querySelector('a h3');
              const title = titleEl?.textContent?.trim() || '';
              
              // Extract URL
              const linkEl = container.querySelector('a[href]') as HTMLAnchorElement;
              let url = linkEl?.href || '';
              
              // Clean up Google redirect URLs
              if (url.startsWith('/url?q=')) {
                const match = url.match(/[?&]q=([^&]+)/);
                if (match) {
                  url = decodeURIComponent(match[1]);
                }
              }
              
              // Extract description/snippet
              const descEl = container.querySelector('span[style*="-webkit-line-clamp"]') || 
                            container.querySelector('.VwiC3b') ||
                            container.querySelector('.s') ||
                            container.querySelector('span:not([class])');
              const description = descEl?.textContent?.trim() || '';
              
              // Only add if we have at least a title and it's not a Google internal link
              if (title && url && !url.includes('google.com/search') && !url.includes('google.com/url')) {
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
          // Generic extraction using selector
          const elements = document.querySelectorAll(sel);
          return Array.from(elements).slice(0, 20).map((el, index) => {
            const link = el.querySelector('a') || (el.tagName === 'A' ? el : null);
            return {
              name: el.textContent?.trim() || `Item ${index + 1}`,
              url: (link as HTMLAnchorElement)?.href || '',
              description: el.textContent?.trim() || '',
              rank: index + 1
            };
          }).filter(item => item.name);
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
    // First create the CSV
    const csvResult = await this.createCSV(data);
    
    if (!csvResult.success) {
      return csvResult;
    }

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

    // Open a new Google Sheet directly (creates blank sheet)
    const sheetsTab = await chrome.tabs.create({ url: 'https://docs.google.com/spreadsheets/create' });
    await this.delay(5000); // Wait for sheet to fully load

    // Try to paste CSV data directly into the sheet
    try {
      await chrome.scripting.executeScript({
        target: { tabId: sheetsTab.id! },
        func: (csvText: string) => {
          // Function to wait for element
          const waitFor = (condition: () => boolean, timeout = 10000): Promise<boolean> => {
            return new Promise((resolve) => {
              const check = () => {
                if (condition()) {
                  resolve(true);
                  return;
                }
                if (timeout > 0) {
                  timeout -= 100;
                  setTimeout(check, 100);
                } else {
                  resolve(false);
                }
              };
              check();
            });
          };

          // Wait for the sheet grid to be ready
          waitFor(() => {
            return !!document.querySelector('table[role="grid"]') || 
                   !!document.querySelector('[role="gridcell"]') ||
                   !!document.querySelector('.grid-container') ||
                   window.location.href.includes('/edit');
          }).then(() => {
            console.log('[Google Sheets] Sheet loaded, attempting to paste CSV');
            
            // Find the first cell (A1) - try multiple selectors
            let firstCell: HTMLElement | null = null;
            const selectors = [
              'table[role="grid"] td:first-child',
              '[role="gridcell"]:first-of-type',
              '.s0',
              'div[data-row="0"][data-col="0"]',
              'table tbody tr:first-child td:first-child'
            ];
            
            for (const selector of selectors) {
              const cell = document.querySelector(selector) as HTMLElement;
              if (cell) {
                firstCell = cell;
                break;
              }
            }
            
            if (firstCell) {
              // Click and focus the first cell
              firstCell.click();
              firstCell.focus();
              
              // Wait a moment for focus
              setTimeout(() => {
                // Copy CSV to clipboard using Clipboard API
                navigator.clipboard.writeText(csvText).then(() => {
                  console.log('[Google Sheets] CSV copied to clipboard');
                  
                  // Simulate Ctrl+V paste
                  setTimeout(() => {
                    const pasteEvent = new KeyboardEvent('keydown', {
                      key: 'v',
                      code: 'KeyV',
                      ctrlKey: true,
                      bubbles: true,
                      cancelable: true
                    });
                    
                    firstCell!.dispatchEvent(pasteEvent);
                    firstCell!.dispatchEvent(new KeyboardEvent('keyup', {
                      key: 'v',
                      code: 'KeyV',
                      ctrlKey: true,
                      bubbles: true
                    }));
                    
                    // Also try execCommand as fallback
                    document.execCommand('paste');
                    
                    console.log('[Google Sheets] Paste command sent');
                  }, 300);
                }).catch(err => {
                  console.error('[Google Sheets] Clipboard write failed:', err);
                  // Fallback: store data for manual paste
                  (window as any).__memoryLayerCSV = csvText;
                  alert('CSV data is ready. Please paste it manually (Ctrl+V) into cell A1.');
                });
              }, 500);
            } else {
              console.log('[Google Sheets] Could not find first cell, storing data for manual paste');
              (window as any).__memoryLayerCSV = csvText;
            }
          });
        },
        args: [csvData]
      });

      return {
        success: true,
        stepIndex: this.currentStep,
        status: `CSV created with ${data.length} rows. Google Sheets opened. The CSV file has been downloaded - you can import it using File > Import in Google Sheets.`,
        data: {
          ...csvResult.data,
          instructions: 'The CSV file has been downloaded. In Google Sheets, go to File > Import > Upload, then select the downloaded CSV file.'
        }
      };
    } catch (error: any) {
      // If automation fails, at least we have the CSV
      return {
        success: true,
        stepIndex: this.currentStep,
        status: `CSV created with ${data.length} rows. Google Sheets opened. Import the downloaded CSV file using File > Import.`,
        data: {
          ...csvResult.data,
          instructions: 'Import the downloaded CSV file into Google Sheets using File > Import > Upload'
        }
      };
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

