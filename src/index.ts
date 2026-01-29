// Gmail Attachments Downloader - Main entry point
import { authorize } from "./auth";
import {
  searchMessages,
  getMessageAttachments,
  downloadAttachment,
  type AttachmentInfo,
} from "./gmail";
import { createZip, writeZipToFile, type FileEntry } from "./zip";

// Exit codes (T5.5)
const EXIT_SUCCESS = 0;
const EXIT_USER_ERROR = 1;
const EXIT_AUTH_ERROR = 2;
const EXIT_API_ERROR = 3;
const EXIT_FS_ERROR = 4;

// T5.1 - Argument parsing
interface ParsedArgs {
  query: string;
  output: string;
  help: boolean;
}

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    query: "",
    output: "attachments.zip",
    help: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === "-h" || arg === "--help") {
      result.help = true;
      i++;
    } else if (arg === "-o" || arg === "--output") {
      if (i + 1 >= args.length) {
        console.error("Error: -o/--output requires a filename argument");
        process.exit(EXIT_USER_ERROR);
      }
      result.output = args[i + 1];
      i += 2;
    } else if (arg.startsWith("-")) {
      console.error(`Error: Unknown option "${arg}"`);
      process.exit(EXIT_USER_ERROR);
    } else {
      // Positional argument is the query
      result.query = arg;
      i++;
    }
  }

  return result;
}

// T5.2 - Help display
function showHelp(): void {
  console.log(`
Gmail Attachments Downloader

Usage: bun run src/index.ts <query> [options]

Arguments:
  <query>              Gmail search query (required)

Options:
  -o, --output <file>  Output ZIP filename (default: attachments.zip)
  -h, --help           Show this help message

Examples:
  bun run src/index.ts "from:example@gmail.com has:attachment"
  bun run src/index.ts "has:attachment larger:1M" -o large-files.zip
  bun run src/index.ts "subject:invoice has:attachment" --output invoices.zip

Query Syntax:
  Gmail search operators work here. Common ones:
  - from:sender@email.com    Emails from specific sender
  - has:attachment           Emails with attachments
  - larger:5M                Attachments larger than 5MB
  - after:2024/01/01         Emails after a date
  - subject:keyword          Emails with keyword in subject
`);
}

// T5.3 - Progress display helpers
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// T5.4 - Main orchestration
async function main(): Promise<void> {
  // Parse arguments
  const args = parseArgs(process.argv.slice(2));

  // Handle help
  if (args.help) {
    showHelp();
    process.exit(EXIT_SUCCESS);
  }

  // Validate query is provided
  if (!args.query) {
    console.error("Error: Search query is required");
    console.error("Run with --help for usage information");
    process.exit(EXIT_USER_ERROR);
  }

  // Step 1: Authenticate
  console.log("Authenticating...");
  let auth;
  try {
    auth = await authorize();
  } catch (error) {
    console.error("Authentication failed:", (error as Error).message);
    process.exit(EXIT_AUTH_ERROR);
  }

  // Step 2: Search messages
  console.log(`Searching for messages matching: "${args.query}"`);
  let messageIds: string[];
  try {
    messageIds = await searchMessages(auth, args.query);
  } catch (error) {
    const msg = (error as Error).message;
    if (msg.includes("Invalid request")) {
      console.error("Invalid search query:", msg);
      process.exit(EXIT_USER_ERROR);
    }
    console.error("Search failed:", msg);
    process.exit(EXIT_API_ERROR);
  }

  if (messageIds.length === 0) {
    console.log("No messages found matching your query.");
    process.exit(EXIT_SUCCESS);
  }

  console.log(`Found ${messageIds.length} message(s)`);

  if (messageIds.length > 100) {
    console.log(
      "Warning: Large number of messages found. Auto-limiting at 100 messages.",
    );
    messageIds = messageIds.slice(0, 100);
  }

  // Step 3: Collect attachment metadata
  console.log("Scanning messages for attachments...");
  const allAttachments: AttachmentInfo[] = [];

  for (let i = 0; i < messageIds.length; i++) {
    const messageId = messageIds[i];
    try {
      const attachments = await getMessageAttachments(auth, messageId);
      allAttachments.push(...attachments);
      // Progress indicator every 10 messages
      if ((i + 1) % 10 === 0 || i === messageIds.length - 1) {
        process.stdout.write(
          `\rScanned ${i + 1}/${messageIds.length} messages`,
        );
      }
    } catch (error) {
      const msg = (error as Error).message;
      if (msg.includes("not found") || msg.includes("deleted")) {
        console.warn(
          `\nWarning: Message ${messageId} was not found (may have been deleted), skipping`,
        );
        continue;
      }
      console.error(
        `\nFailed to get attachments from message ${messageId}:`,
        msg,
      );
      process.exit(EXIT_API_ERROR);
    }
  }
  console.log(); // New line after progress

  if (allAttachments.length === 0) {
    console.log("No attachments found in matching messages.");
    process.exit(EXIT_SUCCESS);
  }

  const totalSize = allAttachments.reduce((sum, a) => sum + a.size, 0);
  console.log(
    `Found ${allAttachments.length} attachment(s) (${formatBytes(totalSize)} total)`,
  );

  // Step 4: Download attachments
  console.log("Downloading attachments...");
  const files: FileEntry[] = [];

  for (let i = 0; i < allAttachments.length; i++) {
    const att = allAttachments[i];
    process.stdout.write(
      `\rDownloading [${i + 1}/${allAttachments.length}]: ${att.filename}`,
    );
    // Clear the rest of the line (for shorter filenames after longer ones)
    process.stdout.write("\x1b[K");

    try {
      const file = await downloadAttachment(
        auth,
        att.messageId,
        att.attachmentId,
        att.filename,
      );
      files.push(file);
    } catch (error) {
      const msg = (error as Error).message;
      if (msg.includes("not found") || msg.includes("deleted")) {
        console.warn(
          `\nWarning: Attachment ${att.filename} was not found, skipping`,
        );
        continue;
      }
      console.error(`\nFailed to download ${att.filename}:`, msg);
      process.exit(EXIT_API_ERROR);
    }
  }
  console.log(); // New line after progress

  // Step 5: Create ZIP
  console.log("Creating ZIP archive...");
  const zipBuffer = await createZip(files);

  // Step 6: Write ZIP to disk
  try {
    const outputPath = await writeZipToFile(zipBuffer, args.output);
    console.log(
      `\nCreated ${outputPath} with ${files.length} file(s) (${formatBytes(zipBuffer.length)})`,
    );
  } catch (error) {
    console.error("Failed to write ZIP file:", (error as Error).message);
    process.exit(EXIT_FS_ERROR);
  }

  process.exit(EXIT_SUCCESS);
}

// Run main
main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(EXIT_API_ERROR);
});
