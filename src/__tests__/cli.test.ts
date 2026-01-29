import { describe, it, expect, mock, beforeEach, afterEach, spyOn } from "bun:test";
import { parseArgs, formatBytes } from "../index";

describe("parseArgs", () => {
  let mockExit: ReturnType<typeof spyOn>;
  let mockConsoleError: ReturnType<typeof spyOn>;

  beforeEach(() => {
    // Mock process.exit to prevent test from actually exiting
    mockExit = spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    mockConsoleError = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });

  it("returns query with default output when only query provided", () => {
    const result = parseArgs(["from:test@example.com"]);

    expect(result.query).toBe("from:test@example.com");
    expect(result.output).toBe("attachments.zip");
    expect(result.help).toBe(false);
  });

  it("sets custom output with -o flag", () => {
    const result = parseArgs(["query", "-o", "custom.zip"]);

    expect(result.query).toBe("query");
    expect(result.output).toBe("custom.zip");
    expect(result.help).toBe(false);
  });

  it("sets custom output with --output flag", () => {
    const result = parseArgs(["query", "--output", "myfile.zip"]);

    expect(result.query).toBe("query");
    expect(result.output).toBe("myfile.zip");
    expect(result.help).toBe(false);
  });

  it("sets help flag with -h", () => {
    const result = parseArgs(["-h"]);

    expect(result.help).toBe(true);
  });

  it("sets help flag with --help", () => {
    const result = parseArgs(["--help"]);

    expect(result.help).toBe(true);
  });

  it("returns empty query when no arguments provided", () => {
    const result = parseArgs([]);

    expect(result.query).toBe("");
    expect(result.output).toBe("attachments.zip");
    expect(result.help).toBe(false);
  });

  it("handles query before options", () => {
    const result = parseArgs(["has:attachment", "-o", "out.zip"]);

    expect(result.query).toBe("has:attachment");
    expect(result.output).toBe("out.zip");
  });

  it("handles query after options", () => {
    const result = parseArgs(["-o", "out.zip", "has:attachment"]);

    expect(result.query).toBe("has:attachment");
    expect(result.output).toBe("out.zip");
  });

  it("handles help with other arguments", () => {
    const result = parseArgs(["query", "-h", "-o", "file.zip"]);

    expect(result.help).toBe(true);
    expect(result.query).toBe("query");
    expect(result.output).toBe("file.zip");
  });

  it("exits with error when -o has no value", () => {
    expect(() => parseArgs(["-o"])).toThrow("process.exit called");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("exits with error for unknown option", () => {
    expect(() => parseArgs(["--unknown"])).toThrow("process.exit called");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("handles complex query strings", () => {
    const complexQuery = "from:sender@test.com has:attachment larger:1M after:2024/01/01";
    const result = parseArgs([complexQuery]);

    expect(result.query).toBe(complexQuery);
  });
});

describe("formatBytes", () => {
  it("formats 0 bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats bytes under 1KB", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(1)).toBe("1 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("formats exactly 1KB", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
  });

  it("formats KB values", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(10240)).toBe("10.0 KB");
  });

  it("formats exactly 1MB", () => {
    expect(formatBytes(1048576)).toBe("1.0 MB");
  });

  it("formats MB values", () => {
    expect(formatBytes(1572864)).toBe("1.5 MB");
    expect(formatBytes(5242880)).toBe("5.0 MB");
    expect(formatBytes(10485760)).toBe("10.0 MB");
  });

  it("formats large MB values", () => {
    expect(formatBytes(104857600)).toBe("100.0 MB");
    expect(formatBytes(1073741824)).toBe("1024.0 MB");
  });

  it("handles boundary values correctly", () => {
    // Just under 1KB
    expect(formatBytes(1023)).toBe("1023 B");
    // Just under 1MB
    expect(formatBytes(1048575)).toBe("1024.0 KB");
  });
});
