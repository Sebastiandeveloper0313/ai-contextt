# Google Sheets API OAuth Setup Guide

This guide will help you set up OAuth authentication with Google Sheets API so the extension can automatically import data without manual pasting.

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Name it (e.g., "Memory Layer Extension")
4. Click "Create"
5. Wait for project creation to complete

## Step 2: Enable Google Sheets API

1. In your project, go to **APIs & Services** → **Library**
2. Search for "Google Sheets API"
3. Click on it and press **Enable**

## Step 3: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
3. If prompted, configure the OAuth consent screen first:
   - Choose **External** (unless you have Google Workspace)
   - Fill in:
     - App name: "Memory Layer"
     - User support email: Your email
     - Developer contact: Your email
   - Click **Save and Continue**
   - Add scopes: Search for "https://www.googleapis.com/auth/spreadsheets" and add it
   - Click **Save and Continue**
   - Add test users (your email) if needed
   - Click **Save and Continue**

4. Back to creating OAuth client ID:
   - Application type: **Web application** (NOT Chrome Extension - that's for a different flow)
   - Name: "Memory Layer Extension"
   - **Leave "Authorized JavaScript origins" and "Authorized redirect URIs" EMPTY**
   - Click **Create**

5. **IMPORTANT**: Copy the **Client ID** - you'll need this!

**Note:** When using Chrome's `chrome.identity` API (which we are), you do NOT need to add redirect URIs or JavaScript origins. Chrome handles OAuth automatically for extensions. The error you see is normal - just ignore those fields and use the Client ID.

## Step 4: Add Credentials to Extension

1. **Reload your extension** in Chrome (`chrome://extensions/` → click reload)
2. **Open the side panel** (click the extension icon)
3. **Scroll down** to find the "Google Sheets API Configuration" section
4. **Paste your Client ID** into the input field
5. **Click "Save"**

That's it! The extension will now use the Google Sheets API.

## Step 5: Test It

1. Try running a task that creates a Google Sheet
2. On first use, Chrome will prompt you to authenticate with Google
3. After authentication, data will automatically be imported into Google Sheets!

## Troubleshooting

**If you see "Invalid Origin" errors:**
- ✅ **This is normal!** Chrome extensions using `chrome.identity` don't need redirect URIs
- ✅ Just ignore those fields and use the Client ID
- ✅ The Chrome Identity API handles OAuth automatically

**If authentication fails:**
- Make sure you selected "Web application" (not "Chrome Extension") when creating credentials
- Make sure the Google Sheets API is enabled in your project
- Check that you copied the Client ID correctly (it should end with `.apps.googleusercontent.com`)

