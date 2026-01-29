// Gmail API operations module
import { google, gmail_v1 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

export interface AttachmentInfo {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  messageId: string;
}

export interface AttachmentData {
  filename: string;
  data: Buffer;
}

// T3.4 - Retry wrapper with exponential backoff
async function withRetry<T>(
  operation: () => Promise<T>,
  context: string,
  maxRetries = 3
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: unknown) {
      lastError = error as Error;
      const statusCode = (error as { code?: number }).code;

      // Don't retry on 404 - message was deleted
      if (statusCode === 404) {
        throw new Error(`${context}: Resource not found (may have been deleted)`);
      }

      // Don't retry on 400 - bad request (invalid query syntax)
      if (statusCode === 400) {
        throw new Error(`${context}: Invalid request - ${(error as Error).message}`);
      }

      // Retry on 429 (rate limit) or 5xx (server errors)
      if (statusCode === 429 || (statusCode && statusCode >= 500)) {
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        console.warn(`${context}: Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await Bun.sleep(delay);
        continue;
      }

      // Unknown error, don't retry
      throw error;
    }
  }

  throw new Error(`${context}: Failed after ${maxRetries} attempts - ${lastError?.message}`);
}

// T3.1 - Search messages with pagination
export async function searchMessages(
  auth: OAuth2Client,
  query: string
): Promise<string[]> {
  const gmail = google.gmail({ version: "v1", auth });
  const messageIds: string[] = [];
  let pageToken: string | undefined;

  do {
    const response = await withRetry(
      () =>
        gmail.users.messages.list({
          userId: "me",
          q: query,
          pageToken,
          maxResults: 100,
        }),
      `Searching messages with query "${query}"`
    );

    const messages = response.data.messages || [];
    for (const message of messages) {
      if (message.id) {
        messageIds.push(message.id);
      }
    }

    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return messageIds;
}

// T3.2 - Helper to recursively extract attachments from MIME parts
function extractAttachments(
  parts: gmail_v1.Schema$MessagePart[] | undefined,
  messageId: string
): AttachmentInfo[] {
  const attachments: AttachmentInfo[] = [];

  if (!parts) return attachments;

  for (const part of parts) {
    // Check if this part is an attachment
    if (part.filename && part.filename.length > 0 && part.body?.attachmentId) {
      attachments.push({
        attachmentId: part.body.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType || "application/octet-stream",
        size: part.body.size || 0,
        messageId,
      });
    }

    // Recursively check nested parts (for multipart messages)
    if (part.parts) {
      attachments.push(...extractAttachments(part.parts, messageId));
    }
  }

  return attachments;
}

// T3.2 - Get attachment metadata from a message
export async function getMessageAttachments(
  auth: OAuth2Client,
  messageId: string
): Promise<AttachmentInfo[]> {
  const gmail = google.gmail({ version: "v1", auth });

  const response = await withRetry(
    () =>
      gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full",
      }),
    `Fetching message ${messageId}`
  );

  const message = response.data;

  // Handle single-part messages
  if (message.payload?.body?.attachmentId && message.payload.filename) {
    return [
      {
        attachmentId: message.payload.body.attachmentId,
        filename: message.payload.filename,
        mimeType: message.payload.mimeType || "application/octet-stream",
        size: message.payload.body.size || 0,
        messageId,
      },
    ];
  }

  // Handle multipart messages
  return extractAttachments(message.payload?.parts, messageId);
}

// T3.3 - Download a single attachment
export async function downloadAttachment(
  auth: OAuth2Client,
  messageId: string,
  attachmentId: string,
  filename: string
): Promise<AttachmentData> {
  const gmail = google.gmail({ version: "v1", auth });

  const response = await withRetry(
    () =>
      gmail.users.messages.attachments.get({
        userId: "me",
        messageId,
        id: attachmentId,
      }),
    `Downloading attachment "${filename}" from message ${messageId}`
  );

  const data = response.data.data;
  if (!data) {
    throw new Error(`No data in attachment "${filename}" from message ${messageId}`);
  }

  // Gmail API returns base64url encoded data
  const buffer = Buffer.from(data, "base64url");

  return {
    filename,
    data: buffer,
  };
}
