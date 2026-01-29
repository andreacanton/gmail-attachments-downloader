import { describe, it, expect, mock, spyOn } from "bun:test";
import { deduplicateFilenames, createZip, type FileEntry } from "../zip";

describe("deduplicateFilenames", () => {
  it("returns files unchanged when no duplicates", () => {
    const files: FileEntry[] = [
      { filename: "file1.txt", data: Buffer.from("data1") },
      { filename: "file2.txt", data: Buffer.from("data2") },
      { filename: "file3.pdf", data: Buffer.from("data3") },
    ];

    const result = deduplicateFilenames(files);

    expect(result).toHaveLength(3);
    expect(result[0].filename).toBe("file1.txt");
    expect(result[1].filename).toBe("file2.txt");
    expect(result[2].filename).toBe("file3.pdf");
  });

  it("appends _1 to second occurrence of duplicate", () => {
    const files: FileEntry[] = [
      { filename: "file.txt", data: Buffer.from("data1") },
      { filename: "file.txt", data: Buffer.from("data2") },
    ];

    const result = deduplicateFilenames(files);

    expect(result).toHaveLength(2);
    expect(result[0].filename).toBe("file.txt");
    expect(result[1].filename).toBe("file_1.txt");
  });

  it("appends _1, _2, etc for multiple duplicates", () => {
    const files: FileEntry[] = [
      { filename: "doc.pdf", data: Buffer.from("data1") },
      { filename: "doc.pdf", data: Buffer.from("data2") },
      { filename: "doc.pdf", data: Buffer.from("data3") },
      { filename: "doc.pdf", data: Buffer.from("data4") },
    ];

    const result = deduplicateFilenames(files);

    expect(result).toHaveLength(4);
    expect(result[0].filename).toBe("doc.pdf");
    expect(result[1].filename).toBe("doc_1.pdf");
    expect(result[2].filename).toBe("doc_2.pdf");
    expect(result[3].filename).toBe("doc_3.pdf");
  });

  it("handles files without extensions", () => {
    const files: FileEntry[] = [
      { filename: "README", data: Buffer.from("data1") },
      { filename: "README", data: Buffer.from("data2") },
      { filename: "Makefile", data: Buffer.from("data3") },
    ];

    const result = deduplicateFilenames(files);

    expect(result).toHaveLength(3);
    expect(result[0].filename).toBe("README");
    expect(result[1].filename).toBe("README_1");
    expect(result[2].filename).toBe("Makefile");
  });

  it("handles files with multiple dots (e.g., file.tar.gz)", () => {
    const files: FileEntry[] = [
      { filename: "archive.tar.gz", data: Buffer.from("data1") },
      { filename: "archive.tar.gz", data: Buffer.from("data2") },
    ];

    const result = deduplicateFilenames(files);

    expect(result).toHaveLength(2);
    expect(result[0].filename).toBe("archive.tar.gz");
    // Note: current implementation uses lastIndexOf so it splits at last dot
    expect(result[1].filename).toBe("archive.tar_1.gz");
  });

  it("handles empty array", () => {
    const files: FileEntry[] = [];
    const result = deduplicateFilenames(files);
    expect(result).toHaveLength(0);
  });

  it("handles mixed duplicates and unique files", () => {
    const files: FileEntry[] = [
      { filename: "a.txt", data: Buffer.from("1") },
      { filename: "b.txt", data: Buffer.from("2") },
      { filename: "a.txt", data: Buffer.from("3") },
      { filename: "c.txt", data: Buffer.from("4") },
      { filename: "a.txt", data: Buffer.from("5") },
    ];

    const result = deduplicateFilenames(files);

    expect(result).toHaveLength(5);
    expect(result[0].filename).toBe("a.txt");
    expect(result[1].filename).toBe("b.txt");
    expect(result[2].filename).toBe("a_1.txt");
    expect(result[3].filename).toBe("c.txt");
    expect(result[4].filename).toBe("a_2.txt");
  });
});

describe("createZip", () => {
  it("creates a valid ZIP buffer with files", async () => {
    const files: FileEntry[] = [
      { filename: "test.txt", data: Buffer.from("hello world") },
    ];

    const result = await createZip(files);

    // ZIP files start with PK signature (0x504B)
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toBe(0x50); // 'P'
    expect(result[1]).toBe(0x4b); // 'K'
  });

  it("creates ZIP with multiple files", async () => {
    const files: FileEntry[] = [
      { filename: "file1.txt", data: Buffer.from("content1") },
      { filename: "file2.txt", data: Buffer.from("content2") },
      { filename: "file3.txt", data: Buffer.from("content3") },
    ];

    const result = await createZip(files);

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it("handles duplicate filenames by deduplicating", async () => {
    const files: FileEntry[] = [
      { filename: "same.txt", data: Buffer.from("first") },
      { filename: "same.txt", data: Buffer.from("second") },
    ];

    // This should not throw - deduplication handles it
    const result = await createZip(files);

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it("creates ZIP with empty file array", async () => {
    const files: FileEntry[] = [];

    const result = await createZip(files);

    // Empty ZIP is still a valid ZIP file
    expect(result).toBeInstanceOf(Buffer);
  });

  it("handles binary data correctly", async () => {
    // Create binary data with all byte values
    const binaryData = Buffer.alloc(256);
    for (let i = 0; i < 256; i++) {
      binaryData[i] = i;
    }

    const files: FileEntry[] = [
      { filename: "binary.bin", data: binaryData },
    ];

    const result = await createZip(files);

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });
});
