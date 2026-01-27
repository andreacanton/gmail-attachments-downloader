# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Node.js script that uses the Gmail API to download email attachments and organize them into folders by sender and date.

## Commands

```bash
# Install dependencies
npm install

# Run the script
node index.js
```

## Setup Requirements

1. Create a Google Cloud project and enable the Gmail API
2. Download OAuth 2.0 credentials as `credentials.json` in the project root
3. On first run, authorize via the browser and paste the code when prompted
4. Token is stored in `token.json` for subsequent runs

## Architecture

Single-file script (`index.js`) using callback-based flow:

1. **OAuth2 Authentication**: Reads `credentials.json`, checks for cached `token.json`, prompts for authorization if needed
2. **Gmail API Client**: Uses `googleapis` library with readonly scope (`gmail.readonly`)
3. **Current State**: Currently only lists Gmail labels (quickstart example) - attachment downloading not yet implemented

## Important Files

- `credentials.json` - Google OAuth2 credentials (not in repo, user must create)
- `token.json` - Cached OAuth tokens (generated on first auth, gitignored)
