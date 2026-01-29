import { describe, it, expect, mock, beforeEach, afterEach, spyOn } from "bun:test";
import type { gmail_v1 } from "googleapis";
import {
  extractAttachments,
  withRetry,
  searchMessages,
  getMessageAttachments,
  downloadAttachment,
} from "../gmail";

describe("extractAttachments", () => {
  it("returns empty array for undefined parts", () => {
    const result = extractAttachments(undefined, "msg123");
    expect(result).toEqual([]);
  });

  it("returns empty array for empty parts array", () => {
    const result = extractAttachments([], "msg123");
    expect(result).toEqual([]);
  });

  it("extracts single attachment from parts", () => {
    const parts: gmail_v1.Schema$MessagePart[] = [
      {
        filename: "document.pdf",
        mimeType: "application/pdf",
        body: {
          attachmentId: "att123",
          size: 1024,
        },
      },
    ];

    const result = extractAttachments(parts, "msg123");

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      attachmentId: "att123",
      filename: "document.pdf",
      mimeType: "application/pdf",
      size: 1024,
      messageId: "msg123",
    });
  });

  it("extracts multiple attachments from parts", () => {
    const parts: gmail_v1.Schema$MessagePart[] = [
      {
        filename: "file1.txt",
        mimeType: "text/plain",
        body: { attachmentId: "att1", size: 100 },
      },
      {
        filename: "file2.pdf",
        mimeType: "application/pdf",
        body: { attachmentId: "att2", size: 200 },
      },
    ];

    const result = extractAttachments(parts, "msg123");

    expect(result).toHaveLength(2);
    expect(result[0].filename).toBe("file1.txt");
    expect(result[1].filename).toBe("file2.pdf");
  });

  it("extracts attachments from nested multipart", () => {
    const parts: gmail_v1.Schema$MessagePart[] = [
      {
        mimeType: "multipart/alternative",
        parts: [
          {
            filename: "nested.doc",
            mimeType: "application/msword",
            body: { attachmentId: "att_nested", size: 500 },
          },
        ],
      },
      {
        filename: "top_level.pdf",
        mimeType: "application/pdf",
        body: { attachmentId: "att_top", size: 1000 },
      },
    ];

    const result = extractAttachments(parts, "msg123");

    expect(result).toHaveLength(2);
    expect(result.find((a) => a.filename === "nested.doc")).toBeDefined();
    expect(result.find((a) => a.filename === "top_level.pdf")).toBeDefined();
  });

  it("skips parts without attachmentId", () => {
    const parts: gmail_v1.Schema$MessagePart[] = [
      {
        filename: "inline.txt",
        mimeType: "text/plain",
        body: { size: 100 }, // No attachmentId
      },
      {
        filename: "attachment.pdf",
        mimeType: "application/pdf",
        body: { attachmentId: "att123", size: 200 },
      },
    ];

    const result = extractAttachments(parts, "msg123");

    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe("attachment.pdf");
  });

  it("skips parts with empty filename", () => {
    const parts: gmail_v1.Schema$MessagePart[] = [
      {
        filename: "",
        mimeType: "text/plain",
        body: { attachmentId: "att123", size: 100 },
      },
      {
        filename: "valid.pdf",
        mimeType: "application/pdf",
        body: { attachmentId: "att456", size: 200 },
      },
    ];

    const result = extractAttachments(parts, "msg123");

    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe("valid.pdf");
  });

  it("uses default mimeType when not provided", () => {
    const parts: gmail_v1.Schema$MessagePart[] = [
      {
        filename: "unknown.bin",
        body: { attachmentId: "att123", size: 100 },
      },
    ];

    const result = extractAttachments(parts, "msg123");

    expect(result).toHaveLength(1);
    expect(result[0].mimeType).toBe("application/octet-stream");
  });

  it("uses 0 as default size when not provided", () => {
    const parts: gmail_v1.Schema$MessagePart[] = [
      {
        filename: "file.txt",
        mimeType: "text/plain",
        body: { attachmentId: "att123" },
      },
    ];

    const result = extractAttachments(parts, "msg123");

    expect(result).toHaveLength(1);
    expect(result[0].size).toBe(0);
  });
});

describe("withRetry", () => {
  let mockConsoleWarn: ReturnType<typeof spyOn>;
  let mockSleep: ReturnType<typeof spyOn>;

  beforeEach(() => {
    mockConsoleWarn = spyOn(console, "warn").mockImplementation(() => {});
    mockSleep = spyOn(Bun, "sleep").mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    mockConsoleWarn.mockRestore();
    mockSleep.mockRestore();
  });

  it("returns result on first successful try", async () => {
    const operation = mock(() => Promise.resolve("success"));

    const result = await withRetry(operation, "test operation");

    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 rate limit error", async () => {
    let attempts = 0;
    const operation = mock(() => {
      attempts++;
      if (attempts === 1) {
        const error = new Error("Rate limited") as Error & { code: number };
        error.code = 429;
        return Promise.reject(error);
      }
      return Promise.resolve("success");
    });

    const result = await withRetry(operation, "test operation");

    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(2);
    expect(mockSleep).toHaveBeenCalled();
  });

  it("retries on 5xx server errors", async () => {
    let attempts = 0;
    const operation = mock(() => {
      attempts++;
      if (attempts === 1) {
        const error = new Error("Server error") as Error & { code: number };
        error.code = 500;
        return Promise.reject(error);
      }
      return Promise.resolve("success");
    });

    const result = await withRetry(operation, "test operation");

    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("retries on 503 service unavailable", async () => {
    let attempts = 0;
    const operation = mock(() => {
      attempts++;
      if (attempts === 1) {
        const error = new Error("Service unavailable") as Error & { code: number };
        error.code = 503;
        return Promise.reject(error);
      }
      return Promise.resolve("success");
    });

    const result = await withRetry(operation, "test operation");

    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 404 error", async () => {
    const error = new Error("Not found") as Error & { code: number };
    error.code = 404;
    const operation = mock(() => Promise.reject(error));

    await expect(withRetry(operation, "test operation")).rejects.toThrow(
      "test operation: Resource not found"
    );

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 400 bad request", async () => {
    const error = new Error("Bad request") as Error & { code: number };
    error.code = 400;
    const operation = mock(() => Promise.reject(error));

    await expect(withRetry(operation, "test operation")).rejects.toThrow(
      "test operation: Invalid request"
    );

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("throws after max retries exceeded", async () => {
    const error = new Error("Rate limited") as Error & { code: number };
    error.code = 429;
    const operation = mock(() => Promise.reject(error));

    await expect(withRetry(operation, "test operation", 3)).rejects.toThrow(
      "test operation: Failed after 3 attempts"
    );

    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("uses exponential backoff delays", async () => {
    const error = new Error("Rate limited") as Error & { code: number };
    error.code = 429;
    const operation = mock(() => Promise.reject(error));

    await expect(withRetry(operation, "test operation", 3)).rejects.toThrow();

    // With 3 retries (attempts 0, 1, 2), sleep is called after attempts 0, 1, 2 before giving up
    // But the last attempt doesn't sleep before throwing, so we get sleeps after attempts 0 and 1
    // Actually with the loop: attempt 0 fails -> sleep 1s, attempt 1 fails -> sleep 2s, attempt 2 fails -> throw
    // So 2 sleeps total (no sleep before first attempt, no sleep after last failed attempt)
    // Wait, looking at the code more carefully:
    // for attempt 0: try, fail with 429, sleep(1s), continue
    // for attempt 1: try, fail with 429, sleep(2s), continue
    // for attempt 2: try, fail with 429, sleep(4s), continue
    // then loop ends and throws
    // So it's actually 3 sleeps
    expect(mockSleep).toHaveBeenCalledTimes(3);
    expect(mockSleep).toHaveBeenNthCalledWith(1, 1000);
    expect(mockSleep).toHaveBeenNthCalledWith(2, 2000);
    expect(mockSleep).toHaveBeenNthCalledWith(3, 4000);
  });

  it("does not retry on unknown errors", async () => {
    const error = new Error("Unknown error");
    const operation = mock(() => Promise.reject(error));

    await expect(withRetry(operation, "test operation")).rejects.toThrow(
      "Unknown error"
    );

    expect(operation).toHaveBeenCalledTimes(1);
  });
});

describe("searchMessages", () => {
  it("returns message IDs from response", async () => {
    const mockList = mock(() =>
      Promise.resolve({
        data: {
          messages: [{ id: "msg1" }, { id: "msg2" }, { id: "msg3" }],
          nextPageToken: undefined,
        },
      })
    );

    const mockGmail = {
      users: {
        messages: {
          list: mockList,
        },
      },
    };

    // Mock the google.gmail function
    const { google } = await import("googleapis");
    const originalGmail = google.gmail;
    google.gmail = (() => mockGmail) as typeof google.gmail;

    try {
      const mockAuth = {} as any;
      const result = await searchMessages(mockAuth, "has:attachment");

      expect(result).toEqual(["msg1", "msg2", "msg3"]);
      expect(mockList).toHaveBeenCalled();
    } finally {
      google.gmail = originalGmail;
    }
  });

  it("handles pagination with multiple pages", async () => {
    let callCount = 0;
    const mockList = mock(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          data: {
            messages: [{ id: "msg1" }, { id: "msg2" }],
            nextPageToken: "token123",
          },
        });
      }
      return Promise.resolve({
        data: {
          messages: [{ id: "msg3" }],
          nextPageToken: undefined,
        },
      });
    });

    const mockGmail = {
      users: {
        messages: {
          list: mockList,
        },
      },
    };

    const { google } = await import("googleapis");
    const originalGmail = google.gmail;
    google.gmail = (() => mockGmail) as typeof google.gmail;

    try {
      const mockAuth = {} as any;
      const result = await searchMessages(mockAuth, "has:attachment");

      expect(result).toEqual(["msg1", "msg2", "msg3"]);
      expect(mockList).toHaveBeenCalledTimes(2);
    } finally {
      google.gmail = originalGmail;
    }
  });

  it("returns empty array when no messages found", async () => {
    const mockList = mock(() =>
      Promise.resolve({
        data: {
          messages: undefined,
          nextPageToken: undefined,
        },
      })
    );

    const mockGmail = {
      users: {
        messages: {
          list: mockList,
        },
      },
    };

    const { google } = await import("googleapis");
    const originalGmail = google.gmail;
    google.gmail = (() => mockGmail) as typeof google.gmail;

    try {
      const mockAuth = {} as any;
      const result = await searchMessages(mockAuth, "has:attachment");

      expect(result).toEqual([]);
    } finally {
      google.gmail = originalGmail;
    }
  });
});

describe("getMessageAttachments", () => {
  it("extracts attachments from multipart message", async () => {
    const mockGet = mock(() =>
      Promise.resolve({
        data: {
          payload: {
            parts: [
              {
                filename: "test.pdf",
                mimeType: "application/pdf",
                body: { attachmentId: "att123", size: 1024 },
              },
            ],
          },
        },
      })
    );

    const mockGmail = {
      users: {
        messages: {
          get: mockGet,
        },
      },
    };

    const { google } = await import("googleapis");
    const originalGmail = google.gmail;
    google.gmail = (() => mockGmail) as typeof google.gmail;

    try {
      const mockAuth = {} as any;
      const result = await getMessageAttachments(mockAuth, "msg123");

      expect(result).toHaveLength(1);
      expect(result[0].filename).toBe("test.pdf");
      expect(result[0].messageId).toBe("msg123");
    } finally {
      google.gmail = originalGmail;
    }
  });

  it("handles single-part message with attachment", async () => {
    const mockGet = mock(() =>
      Promise.resolve({
        data: {
          payload: {
            filename: "single.txt",
            mimeType: "text/plain",
            body: { attachmentId: "att456", size: 100 },
          },
        },
      })
    );

    const mockGmail = {
      users: {
        messages: {
          get: mockGet,
        },
      },
    };

    const { google } = await import("googleapis");
    const originalGmail = google.gmail;
    google.gmail = (() => mockGmail) as typeof google.gmail;

    try {
      const mockAuth = {} as any;
      const result = await getMessageAttachments(mockAuth, "msg123");

      expect(result).toHaveLength(1);
      expect(result[0].filename).toBe("single.txt");
      expect(result[0].attachmentId).toBe("att456");
    } finally {
      google.gmail = originalGmail;
    }
  });
});

describe("downloadAttachment", () => {
  it("decodes base64url data correctly", async () => {
    // "hello world" in base64url
    const base64urlData = "aGVsbG8gd29ybGQ";

    const mockGet = mock(() =>
      Promise.resolve({
        data: {
          data: base64urlData,
        },
      })
    );

    const mockGmail = {
      users: {
        messages: {
          attachments: {
            get: mockGet,
          },
        },
      },
    };

    const { google } = await import("googleapis");
    const originalGmail = google.gmail;
    google.gmail = (() => mockGmail) as typeof google.gmail;

    try {
      const mockAuth = {} as any;
      const result = await downloadAttachment(
        mockAuth,
        "msg123",
        "att456",
        "test.txt"
      );

      expect(result.filename).toBe("test.txt");
      expect(result.data.toString()).toBe("hello world");
    } finally {
      google.gmail = originalGmail;
    }
  });

  it("throws on missing data", async () => {
    const mockGet = mock(() =>
      Promise.resolve({
        data: {
          data: undefined,
        },
      })
    );

    const mockGmail = {
      users: {
        messages: {
          attachments: {
            get: mockGet,
          },
        },
      },
    };

    const { google } = await import("googleapis");
    const originalGmail = google.gmail;
    google.gmail = (() => mockGmail) as typeof google.gmail;

    try {
      const mockAuth = {} as any;
      await expect(
        downloadAttachment(mockAuth, "msg123", "att456", "test.txt")
      ).rejects.toThrow('No data in attachment "test.txt"');
    } finally {
      google.gmail = originalGmail;
    }
  });

  it("handles binary data with base64url encoding", async () => {
    // Binary data encoded as base64url
    const binaryBuffer = Buffer.from([0x00, 0x01, 0xff, 0xfe]);
    const base64urlData = binaryBuffer.toString("base64url");

    const mockGet = mock(() =>
      Promise.resolve({
        data: {
          data: base64urlData,
        },
      })
    );

    const mockGmail = {
      users: {
        messages: {
          attachments: {
            get: mockGet,
          },
        },
      },
    };

    const { google } = await import("googleapis");
    const originalGmail = google.gmail;
    google.gmail = (() => mockGmail) as typeof google.gmail;

    try {
      const mockAuth = {} as any;
      const result = await downloadAttachment(
        mockAuth,
        "msg123",
        "att456",
        "binary.bin"
      );

      expect(result.data).toEqual(binaryBuffer);
    } finally {
      google.gmail = originalGmail;
    }
  });
});
