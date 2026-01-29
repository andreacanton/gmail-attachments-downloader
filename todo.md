# Gmail Attachments Downloader - Task List

## Phase 1: Project Setup

### T1.1 - Update package.json
- **Difficulty:** simple
- **Dependencies:** none
- **Description:** Update package.json with ES modules, new dependencies, and scripts
- **Acceptance Checks:**
  - [x] `"type": "module"` is set
  - [x] `jszip` added to dependencies
  - [x] `typescript`, `@types/node`, `bun-types` added to devDependencies
  - [x] `"start": "bun run src/index.ts"` script added
  - [x] `bun install` completes without errors

### T1.2 - Create tsconfig.json
- **Difficulty:** simple
- **Dependencies:** none
- **Description:** Create TypeScript configuration for Bun runtime
- **Acceptance Checks:**
  - [x] File exists at project root
  - [x] Configured for ES modules output
  - [x] Strict mode enabled
  - [x] Bun types included

### T1.3 - Create src folder structure
- **Difficulty:** simple
- **Dependencies:** none
- **Description:** Create the src directory with empty TypeScript files
- **Acceptance Checks:**
  - [x] `src/` directory exists
  - [x] `src/index.ts` exists
  - [x] `src/auth.ts` exists
  - [x] `src/gmail.ts` exists
  - [x] `src/zip.ts` exists

---

## Phase 2: Authentication

### T2.1 - Implement OAuth2 credential loading
- **Difficulty:** simple
- **Dependencies:** T1.1, T1.3
- **Description:** Read and parse credentials.json using Bun.file()
- **Acceptance Checks:**
  - [x] Function reads `credentials.json` with `Bun.file()`
  - [x] Returns parsed OAuth2 client config
  - [x] Throws descriptive error if file missing
  - [x] Throws descriptive error if JSON is malformed

### T2.2 - Implement token caching
- **Difficulty:** medium
- **Dependencies:** T2.1
- **Description:** Load existing token.json or save new token after auth
- **Acceptance Checks:**
  - [x] Loads token from `token.json` if exists
  - [x] Saves new token with `Bun.write()` after authorization
  - [x] Returns null/undefined if no cached token (not an error)

### T2.3 - Implement OAuth2 authorization flow
- **Difficulty:** medium
- **Dependencies:** T2.1, T2.2
- **Description:** Generate auth URL, prompt user, exchange code for token
- **Acceptance Checks:**
  - [x] Generates correct authorization URL with gmail.readonly scope
  - [x] Prints URL to console for user
  - [x] Uses `prompt()` to get authorization code
  - [x] Exchanges code for token via Google API
  - [x] Saves token via T2.2 function

### T2.4 - Implement token refresh handling
- **Difficulty:** medium
- **Dependencies:** T2.2, T2.3
- **Description:** Detect expired tokens and refresh or re-authorize
- **Acceptance Checks:**
  - [x] Detects expired token before API calls
  - [x] Attempts automatic refresh if refresh_token available
  - [x] Falls back to full re-auth if refresh fails
  - [x] Updates cached token after refresh

### T2.5 - Create main authorize() function
- **Difficulty:** simple
- **Dependencies:** T2.1, T2.2, T2.3, T2.4
- **Description:** Export single async function that returns authenticated OAuth2 client
- **Acceptance Checks:**
  - [x] Exported async function `authorize()`
  - [x] Returns configured `OAuth2Client` instance
  - [x] Uses cached token if valid
  - [x] Triggers auth flow if no valid token

---

## Phase 3: Gmail API Operations

### T3.1 - Implement searchMessages()
- **Difficulty:** medium
- **Dependencies:** T2.5
- **Description:** Search Gmail with query string, return all matching message IDs with pagination
- **Acceptance Checks:**
  - [x] Accepts auth client and query string
  - [x] Calls `gmail.users.messages.list()` with query
  - [x] Handles pagination via `nextPageToken`
  - [x] Returns array of message IDs
  - [x] Handles empty results gracefully

### T3.2 - Implement getMessageAttachments()
- **Difficulty:** medium
- **Dependencies:** T2.5
- **Description:** Get attachment metadata from a single message
- **Acceptance Checks:**
  - [x] Fetches full message via `gmail.users.messages.get()`
  - [x] Recursively parses MIME parts to find attachments
  - [x] Returns array of `{attachmentId, filename, mimeType, size, messageId}`
  - [x] Handles messages with no attachments (returns empty array)
  - [x] Handles nested/multipart messages

### T3.3 - Implement downloadAttachment()
- **Difficulty:** medium
- **Dependencies:** T2.5
- **Description:** Download single attachment and return decoded buffer
- **Acceptance Checks:**
  - [x] Calls `gmail.users.messages.attachments.get()`
  - [x] Decodes base64url data to Buffer
  - [x] Returns `{filename, data}` object
  - [x] Handles large attachments without memory issues

### T3.4 - Implement API error handling
- **Difficulty:** difficult
- **Dependencies:** T3.1, T3.2, T3.3
- **Description:** Add retry logic and error handling for all Gmail API calls
- **Acceptance Checks:**
  - [x] Catches and retries on 429 (rate limit) with exponential backoff
  - [x] Catches and retries on 5xx errors (max 3 attempts)
  - [x] Handles 404 (message deleted) gracefully - skip and warn
  - [x] Handles invalid query syntax - exit with helpful message
  - [x] All errors include context (messageId, attachmentId, etc.)

---

## Phase 4: ZIP Creation

### T4.1 - Implement createZip()
- **Difficulty:** simple
- **Dependencies:** T1.1
- **Description:** Create ZIP archive from array of file objects
- **Acceptance Checks:**
  - [x] Accepts array of `{filename, data}` objects
  - [x] Creates ZIP using JSZip
  - [x] Returns ZIP as Buffer

### T4.2 - Implement duplicate filename handling
- **Difficulty:** simple
- **Dependencies:** T4.1
- **Description:** Rename duplicate filenames by appending counter
- **Acceptance Checks:**
  - [x] Detects duplicate filenames
  - [x] Renames duplicates as `name_1.ext`, `name_2.ext`, etc.
  - [x] Preserves file extension
  - [x] Works with files without extensions

### T4.3 - Implement writeZipToFile()
- **Difficulty:** simple
- **Dependencies:** T4.1
- **Description:** Write ZIP buffer to disk with error handling
- **Acceptance Checks:**
  - [x] Writes ZIP to specified path with `Bun.write()`
  - [x] Handles "file exists" - overwrite with warning
  - [x] Handles permission errors - exit with message
  - [x] Handles disk full - exit with message
  - [x] Returns final file path

---

## Phase 5: CLI Interface

### T5.1 - Implement argument parsing
- **Difficulty:** simple
- **Dependencies:** T1.3
- **Description:** Parse CLI arguments for query and output file
- **Acceptance Checks:**
  - [ ] Parses positional argument as search query
  - [ ] Parses `-o` / `--output` for output filename
  - [ ] Default output filename is `attachments.zip`
  - [ ] Validates query is provided

### T5.2 - Implement help display
- **Difficulty:** simple
- **Dependencies:** T5.1
- **Description:** Show usage information with `-h` / `--help`
- **Acceptance Checks:**
  - [ ] `-h` and `--help` trigger help display
  - [ ] Shows usage syntax
  - [ ] Shows available options
  - [ ] Shows example commands
  - [ ] Exits with code 0 after help

### T5.3 - Implement progress display
- **Difficulty:** medium
- **Dependencies:** T3.1, T3.2, T3.3
- **Description:** Show progress during scanning and downloading
- **Acceptance Checks:**
  - [ ] Shows "Searching for messages..." during search
  - [ ] Shows "Found X messages with Y attachments"
  - [ ] Shows download progress: "Downloading [X/Y]: filename"
  - [ ] Shows final summary: "Created output.zip with X files (Y MB)"

### T5.4 - Implement main orchestration
- **Difficulty:** medium
- **Dependencies:** T2.5, T3.1, T3.2, T3.3, T4.1, T4.2, T4.3, T5.1, T5.3
- **Description:** Wire everything together in main() function
- **Acceptance Checks:**
  - [ ] Parses arguments
  - [ ] Authenticates
  - [ ] Searches messages
  - [ ] Collects all attachments
  - [ ] Downloads all attachments
  - [ ] Creates and writes ZIP
  - [ ] Displays progress throughout
  - [ ] Exits with code 0 on success

### T5.5 - Implement error reporting and exit codes
- **Difficulty:** simple
- **Dependencies:** T5.4
- **Description:** Proper error messages and exit codes for all failure modes
- **Acceptance Checks:**
  - [ ] Exit code 0 on success
  - [ ] Exit code 1 on user error (missing query, bad args)
  - [ ] Exit code 2 on auth error
  - [ ] Exit code 3 on API error
  - [ ] Exit code 4 on file system error
  - [ ] All errors print to stderr

---

## Phase 6: Testing & Documentation

### T6.1 - Manual end-to-end test
- **Difficulty:** simple
- **Dependencies:** T5.4, external (credentials.json)
- **Description:** Test complete flow with real Gmail account
- **Acceptance Checks:**
  - [ ] Fresh auth flow works (delete token.json, re-authorize)
  - [ ] Cached token flow works
  - [ ] Search returns expected results
  - [ ] ZIP contains correct attachments
  - [ ] Attachments are not corrupted (can open them)

### T6.2 - Test edge cases
- **Difficulty:** medium
- **Dependencies:** T6.1
- **Description:** Test error handling and edge cases
- **Acceptance Checks:**
  - [ ] Query with no results shows appropriate message
  - [ ] Query with messages but no attachments handled
  - [ ] Very large attachment (>10MB) downloads correctly
  - [ ] Duplicate filenames renamed correctly
  - [ ] Invalid query shows helpful error

### T6.3 - Update README.md
- **Difficulty:** simple
- **Dependencies:** T6.1
- **Description:** Update documentation with new usage instructions
- **Acceptance Checks:**
  - [ ] Installation instructions updated for Bun
  - [ ] Usage examples included
  - [ ] All CLI options documented
  - [ ] Troubleshooting section for common errors

---

## Summary

| Phase | Description | Tasks | Done | Remaining |
|-------|-------------|-------|------|-----------|
| 1 | Project Setup | 3 | 3 | 0 |
| 2 | Authentication | 5 | 5 | 0 |
| 3 | Gmail API Operations | 4 | 4 | 0 |
| 4 | ZIP Creation | 3 | 3 | 0 |
| 5 | CLI Interface | 5 | 0 | 5 |
| 6 | Testing & Documentation | 3 | 0 | 3 |
| **Total** | | **23** | **15** | **8** |

### Progress: 15/23 tasks complete (65%)

### Next Task: T5.1 - Implement argument parsing
- Dependencies met (T1.3 complete)
- Simple difficulty
