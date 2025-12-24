// Google Sheets API Integration with OAuth
// Uses Chrome Identity API for authentication
// Chrome Identity API automatically uses the extension's ID - no configuration needed!

export class GoogleSheetsAPI {
  private accessToken: string | null = null;
  private readonly SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
  private readonly API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

  // Authenticate using Chrome Identity API
  // Chrome automatically uses the extension's ID from manifest.json
  // No Client ID or user configuration required!
  async authenticate(): Promise<boolean> {
    return new Promise((resolve) => {
      chrome.identity.getAuthToken(
        {
          interactive: true,
          scopes: [this.SCOPES]
        },
        (token) => {
          if (chrome.runtime.lastError) {
            console.error('[Google Sheets] Auth error:', chrome.runtime.lastError);
            resolve(false);
            return;
          }
          this.accessToken = token;
          console.log('[Google Sheets] Authenticated successfully');
          resolve(true);
        }
      );
    });
  }

  // Check if already authenticated
  async checkAuth(): Promise<boolean> {
    return new Promise((resolve) => {
      chrome.identity.getAuthToken(
        {
          interactive: false,
          scopes: [this.SCOPES]
        },
        (token) => {
          if (chrome.runtime.lastError || !token) {
            resolve(false);
            return;
          }
          this.accessToken = token;
          resolve(true);
        }
      );
    });
  }

  // Create a new spreadsheet
  async createSpreadsheet(title: string): Promise<{ spreadsheetId: string; sheetName: string } | null> {
    if (!this.accessToken) {
      const authenticated = await this.authenticate();
      if (!authenticated) {
        return null;
      }
    }

    try {
      const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: {
            title: title
          },
          sheets: [{
            properties: {
              title: 'Sheet1'
            }
          }]
        })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[Google Sheets] Create error:', error);
        return null;
      }

      const data = await response.json();
      // Get the actual sheet name from the response
      const sheetName = data.sheets?.[0]?.properties?.title || 'Sheet1';
      console.log('[Google Sheets] Spreadsheet created with sheet name:', sheetName);
      return {
        spreadsheetId: data.spreadsheetId,
        sheetName: sheetName
      };
    } catch (error) {
      console.error('[Google Sheets] Create spreadsheet error:', error);
      return null;
    }
  }

  // Write data to a spreadsheet
  async writeData(spreadsheetId: string, data: any[]): Promise<boolean> {
    if (!this.accessToken) {
      const authenticated = await this.authenticate();
      if (!authenticated) {
        return false;
      }
    }

    if (data.length === 0) {
      return false;
    }

    // Convert data to rows
    const headers = Object.keys(data[0] || {});
    const rows = [
      headers, // Header row
      ...data.map(row => headers.map(header => String(row[header] || '')))
    ];

    try {
      console.log('[Google Sheets] Writing', rows.length, 'rows,', headers.length, 'columns to spreadsheet', spreadsheetId);
      
      // First, clear the sheet by writing empty values to A1:Z1000
      // Then append our data starting from A1
      // Use the update method with a simple A1 notation (no sheet name prefix)
      const range = 'A1';
      
      console.log('[Google Sheets] Using values.update with range:', range);
      
      // Use values.update API with just A1 (no sheet prefix)
      const url = `${this.API_BASE}/${spreadsheetId}/values/${range}?valueInputOption=RAW`;
      
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: rows
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Google Sheets] Write error:', response.status, errorText);
        
        // Try alternative: use append method
        console.log('[Google Sheets] Trying append method as fallback...');
        return await this.appendData(spreadsheetId, rows);
      }

      const result = await response.json();
      console.log('[Google Sheets] Data written successfully:', result);
      return true;
    } catch (error) {
      console.error('[Google Sheets] Write data error:', error);
      return false;
    }
  }

  // Append data using the append method (doesn't require range parsing)
  private async appendData(spreadsheetId: string, rows: string[][]): Promise<boolean> {
    try {
      console.log('[Google Sheets] Using append method...');
      // Append to Sheet1 starting from A1
      const url = `${this.API_BASE}/${spreadsheetId}/values/Sheet1!A1:append?valueInputOption=RAW&insertDataOption=OVERWRITE`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: rows
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Google Sheets] Append error:', response.status, errorText);
        return false;
      }

      const result = await response.json();
      console.log('[Google Sheets] Data appended successfully:', result);
      return true;
    } catch (error) {
      console.error('[Google Sheets] Append data error:', error);
      return false;
    }
  }


  // Get spreadsheet URL
  getSpreadsheetUrl(spreadsheetId: string): string {
    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  }

  // Revoke token (for logout)
  async revokeAuth(): Promise<void> {
    if (this.accessToken) {
      chrome.identity.removeCachedAuthToken({ token: this.accessToken }, () => {
        this.accessToken = null;
      });
    }
  }
}

