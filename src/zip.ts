// ZIP file creation module
import JSZip from "jszip";
import { exists } from "node:fs/promises";

export interface FileEntry {
  filename: string;
  data: Buffer;
}

/**
 * Handles duplicate filenames by appending a counter
 * Example: "file.txt" becomes "file_1.txt", "file_2.txt", etc.
 * @param files - Array of file entries (may contain duplicate filenames)
 * @returns Array of file entries with unique filenames
 */
export function deduplicateFilenames(files: FileEntry[]): FileEntry[] {
  const seenNames = new Map<string, number>();
  const result: FileEntry[] = [];

  for (const file of files) {
    let finalName = file.filename;
    const count = seenNames.get(file.filename) ?? 0;

    if (count > 0) {
      // Split filename into name and extension
      const lastDotIndex = file.filename.lastIndexOf(".");
      if (lastDotIndex > 0) {
        // Has extension
        const name = file.filename.slice(0, lastDotIndex);
        const ext = file.filename.slice(lastDotIndex);
        finalName = `${name}_${count}${ext}`;
      } else {
        // No extension
        finalName = `${file.filename}_${count}`;
      }
    }

    seenNames.set(file.filename, count + 1);
    result.push({ filename: finalName, data: file.data });
  }

  return result;
}

/**
 * Creates a ZIP archive from an array of file objects
 * Automatically handles duplicate filenames
 * @param files - Array of {filename, data} objects to include in the ZIP
 * @returns ZIP archive as a Buffer
 */
export async function createZip(files: FileEntry[]): Promise<Buffer> {
  const zip = new JSZip();
  const uniqueFiles = deduplicateFilenames(files);

  for (const file of uniqueFiles) {
    zip.file(file.filename, file.data);
  }

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return buffer;
}

/**
 * Writes a ZIP buffer to disk
 * @param zipBuffer - The ZIP file as a Buffer
 * @param outputPath - The path to write the ZIP file to
 * @returns The final file path
 * @throws Error with descriptive message for permission or disk errors
 */
export async function writeZipToFile(
  zipBuffer: Buffer,
  outputPath: string
): Promise<string> {
  // Check if file exists and warn
  if (await exists(outputPath)) {
    console.warn(`Warning: Overwriting existing file: ${outputPath}`);
  }

  try {
    await Bun.write(outputPath, zipBuffer);
    return outputPath;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;

    if (err.code === "EACCES" || err.code === "EPERM") {
      throw new Error(
        `Permission denied: Cannot write to "${outputPath}". Check file/directory permissions.`
      );
    }

    if (err.code === "ENOSPC") {
      throw new Error(
        `Disk full: Not enough space to write "${outputPath}".`
      );
    }

    if (err.code === "EROFS") {
      throw new Error(
        `Read-only filesystem: Cannot write to "${outputPath}".`
      );
    }

    // Re-throw with context for other errors
    throw new Error(
      `Failed to write ZIP file to "${outputPath}": ${err.message}`
    );
  }
}
