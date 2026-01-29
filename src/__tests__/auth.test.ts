import { describe, it, expect, mock, beforeEach, afterEach, spyOn } from "bun:test";
import type { Credentials } from "google-auth-library";
import {
  loadCredentials,
  loadCachedToken,
  saveToken,
  refreshTokenIfNeeded,
} from "../auth";

describe("loadCredentials", () => {
  let originalBunFile: typeof Bun.file;

  beforeEach(() => {
    originalBunFile = Bun.file;
  });

  afterEach(() => {
    (Bun as any).file = originalBunFile;
  });

  it("returns parsed credentials when file exists and is valid", async () => {
    const validCredentials = {
      installed: {
        client_id: "test-client-id",
        client_secret: "test-client-secret",
        redirect_uris: ["http://localhost"],
      },
    };

    (Bun as any).file = mock(() => ({
      exists: () => Promise.resolve(true),
      text: () => Promise.resolve(JSON.stringify(validCredentials)),
    }));

    const result = await loadCredentials();

    expect(result).toEqual(validCredentials);
  });

  it("throws descriptive error when file is missing", async () => {
    (Bun as any).file = mock(() => ({
      exists: () => Promise.resolve(false),
    }));

    await expect(loadCredentials()).rejects.toThrow(
      "Missing credentials.json"
    );
  });

  it("throws parse error for invalid JSON", async () => {
    (Bun as any).file = mock(() => ({
      exists: () => Promise.resolve(true),
      text: () => Promise.resolve("not valid json"),
    }));

    await expect(loadCredentials()).rejects.toThrow(
      "Failed to parse credentials.json"
    );
  });
});

describe("loadCachedToken", () => {
  let originalBunFile: typeof Bun.file;

  beforeEach(() => {
    originalBunFile = Bun.file;
  });

  afterEach(() => {
    (Bun as any).file = originalBunFile;
  });

  it("returns token when file exists and is valid", async () => {
    const validToken: Credentials = {
      access_token: "test-access-token",
      refresh_token: "test-refresh-token",
      expiry_date: Date.now() + 3600000,
    };

    (Bun as any).file = mock(() => ({
      exists: () => Promise.resolve(true),
      text: () => Promise.resolve(JSON.stringify(validToken)),
    }));

    const result = await loadCachedToken();

    expect(result).toEqual(validToken);
  });

  it("returns null when file is missing", async () => {
    (Bun as any).file = mock(() => ({
      exists: () => Promise.resolve(false),
    }));

    const result = await loadCachedToken();

    expect(result).toBeNull();
  });

  it("returns null for invalid JSON", async () => {
    (Bun as any).file = mock(() => ({
      exists: () => Promise.resolve(true),
      text: () => Promise.resolve("invalid json"),
    }));

    const result = await loadCachedToken();

    expect(result).toBeNull();
  });
});

describe("saveToken", () => {
  let originalBunWrite: typeof Bun.write;
  let mockConsoleLog: ReturnType<typeof spyOn>;

  beforeEach(() => {
    originalBunWrite = Bun.write;
    mockConsoleLog = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    (Bun as any).write = originalBunWrite;
    mockConsoleLog.mockRestore();
  });

  it("writes token to token.json", async () => {
    const mockWrite = mock(() => Promise.resolve(100));
    (Bun as any).write = mockWrite;

    const token: Credentials = {
      access_token: "test-token",
      refresh_token: "test-refresh",
      expiry_date: 1234567890,
    };

    await saveToken(token);

    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(mockWrite.mock.calls[0][0]).toBe("token.json");

    // Verify the written content is properly formatted JSON
    const writtenContent = mockWrite.mock.calls[0][1] as string;
    const parsedContent = JSON.parse(writtenContent);
    expect(parsedContent).toEqual(token);
  });

  it("logs success message after saving", async () => {
    (Bun as any).write = mock(() => Promise.resolve(100));

    const token: Credentials = {
      access_token: "test-token",
    };

    await saveToken(token);

    expect(mockConsoleLog).toHaveBeenCalledWith("Token saved to token.json");
  });
});

describe("refreshTokenIfNeeded", () => {
  let mockConsoleLog: ReturnType<typeof spyOn>;

  beforeEach(() => {
    mockConsoleLog = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
  });

  it("returns original token when not expired", async () => {
    const token: Credentials = {
      access_token: "valid-token",
      refresh_token: "refresh-token",
      expiry_date: Date.now() + 3600000, // 1 hour from now
    };

    const mockOAuth2Client = {
      setCredentials: mock(() => {}),
    };

    const result = await refreshTokenIfNeeded(mockOAuth2Client as any, token);

    expect(result).toEqual(token);
    expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith(token);
  });

  it("refreshes token when expiring within 5 minutes", async () => {
    // Save and restore Bun.write
    const originalBunWrite = Bun.write;
    (Bun as any).write = mock(() => Promise.resolve(100));

    try {
      const oldToken: Credentials = {
        access_token: "old-token",
        refresh_token: "refresh-token",
        expiry_date: Date.now() + 60000, // 1 minute from now (within 5 min buffer)
      };

      const newCredentials: Credentials = {
        access_token: "new-token",
        expiry_date: Date.now() + 3600000,
      };

      const mockOAuth2Client = {
        setCredentials: mock(() => {}),
        refreshAccessToken: mock(() =>
          Promise.resolve({ credentials: newCredentials })
        ),
      };

      const result = await refreshTokenIfNeeded(mockOAuth2Client as any, oldToken);

      expect(mockOAuth2Client.refreshAccessToken).toHaveBeenCalled();
      expect(result.access_token).toBe("new-token");
      // Should preserve the original refresh_token
      expect(result.refresh_token).toBe("refresh-token");
    } finally {
      (Bun as any).write = originalBunWrite;
    }
  });

  it("refreshes token when expired", async () => {
    const originalBunWrite = Bun.write;
    (Bun as any).write = mock(() => Promise.resolve(100));

    try {
      const oldToken: Credentials = {
        access_token: "old-token",
        refresh_token: "refresh-token",
        expiry_date: Date.now() - 60000, // Already expired
      };

      const newCredentials: Credentials = {
        access_token: "new-token",
        expiry_date: Date.now() + 3600000,
      };

      const mockOAuth2Client = {
        setCredentials: mock(() => {}),
        refreshAccessToken: mock(() =>
          Promise.resolve({ credentials: newCredentials })
        ),
      };

      const result = await refreshTokenIfNeeded(mockOAuth2Client as any, oldToken);

      expect(mockOAuth2Client.refreshAccessToken).toHaveBeenCalled();
      expect(result.access_token).toBe("new-token");
    } finally {
      (Bun as any).write = originalBunWrite;
    }
  });

  it("throws when token expired and no refresh_token available", async () => {
    const expiredToken: Credentials = {
      access_token: "old-token",
      // No refresh_token
      expiry_date: Date.now() - 60000, // Already expired
    };

    const mockOAuth2Client = {
      setCredentials: mock(() => {}),
    };

    await expect(
      refreshTokenIfNeeded(mockOAuth2Client as any, expiredToken)
    ).rejects.toThrow("Token expired and no refresh token available");
  });

  it("re-throws error when refresh fails", async () => {
    const oldToken: Credentials = {
      access_token: "old-token",
      refresh_token: "refresh-token",
      expiry_date: Date.now() - 60000,
    };

    const mockOAuth2Client = {
      setCredentials: mock(() => {}),
      refreshAccessToken: mock(() =>
        Promise.reject(new Error("Refresh failed"))
      ),
    };

    await expect(
      refreshTokenIfNeeded(mockOAuth2Client as any, oldToken)
    ).rejects.toThrow("Refresh failed");
  });

  it("returns token unchanged when no expiry_date", async () => {
    const token: Credentials = {
      access_token: "valid-token",
      refresh_token: "refresh-token",
      // No expiry_date
    };

    const mockOAuth2Client = {
      setCredentials: mock(() => {}),
    };

    const result = await refreshTokenIfNeeded(mockOAuth2Client as any, token);

    expect(result).toEqual(token);
  });
});
