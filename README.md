# Gmail Attachments Downloader

A CLI tool that downloads email attachments from Gmail and packages them into a ZIP file. Built with TypeScript and Bun runtime.

## Features

- Search emails using Gmail's powerful query syntax
- Download all attachments from matching emails
- Package attachments into a single ZIP file
- Automatic handling of duplicate filenames
- Progress display during download
- Retry logic for rate limits and transient errors

## Prerequisites

- [Bun](https://bun.sh/) runtime (v1.0 or later)
- A Google Cloud project with Gmail API enabled
- OAuth 2.0 credentials

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/andreacanton/gmail-attachments-downloader.git
   cd gmail-attachments-downloader
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

3. Set up Google Cloud credentials:
   - Go to the [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project (or select an existing one)
   - Enable the [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com)
   - Go to **APIs & Services > Credentials**
   - Click **Create Credentials > OAuth client ID**
   - Select **Desktop app** as the application type
   - Download the credentials and save as `credentials.json` in the project root

## Usage

```bash
bun run src/index.ts <query> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `<query>` | Gmail search query (required) |

### Options

| Option | Description |
|--------|-------------|
| `-o, --output <file>` | Output ZIP filename (default: `attachments.zip`) |
| `-h, --help` | Show help message |

### Examples

Download all attachments from a specific sender:
```bash
bun run src/index.ts "from:sender@example.com has:attachment"
```

Download attachments larger than 1MB:
```bash
bun run src/index.ts "has:attachment larger:1M" -o large-files.zip
```

Download invoice attachments from 2024:
```bash
bun run src/index.ts "subject:invoice has:attachment after:2024/01/01" --output invoices.zip
```

### Gmail Search Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `from:` | Sender email | `from:boss@company.com` |
| `to:` | Recipient email | `to:me@example.com` |
| `subject:` | Words in subject | `subject:meeting` |
| `has:attachment` | Has attachments | `has:attachment` |
| `filename:` | Attachment filename | `filename:pdf` |
| `larger:` | Size larger than | `larger:5M` |
| `smaller:` | Size smaller than | `smaller:1M` |
| `after:` | After date | `after:2024/01/01` |
| `before:` | Before date | `before:2024/12/31` |
| `is:unread` | Unread emails | `is:unread` |
| `label:` | Has label | `label:important` |

Combine operators for precise searches:
```bash
bun run src/index.ts "from:reports@company.com has:attachment filename:pdf after:2024/01/01"
```

## First Run

On first run, the tool will:

1. Open a URL in your terminal for Google authorization
2. Ask you to visit the URL and sign in with your Google account
3. Grant the app permission to read your emails (readonly access)
4. Paste the authorization code back into the terminal

After authorization, a `token.json` file is created to cache your credentials for future runs.

## Exit Codes

| Code | Description |
|------|-------------|
| 0 | Success |
| 1 | User error (missing query, invalid arguments) |
| 2 | Authentication error |
| 3 | Gmail API error |
| 4 | File system error |

## Troubleshooting

### "credentials.json not found"
Make sure you've downloaded your OAuth credentials from Google Cloud Console and saved them as `credentials.json` in the project root.

### "Invalid search query"
Check your Gmail query syntax. Test the query in Gmail's web interface first to verify it works.

### "Permission denied" when writing ZIP
Check that you have write permissions in the output directory.

### Rate limit errors
The tool automatically retries on rate limits with exponential backoff. If you're processing many emails, it may take longer due to API limits.

### Token expired
Delete `token.json` and run the tool again to re-authorize.

## Development

```bash
# Type check
bun run tsc --noEmit

# Run the tool
bun run src/index.ts "has:attachment" -o test.zip
```

## License

MIT
