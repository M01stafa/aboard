import { createSHA256 } from "hash-wasm";

/**
 * Computes the SHA-256 hex digest of a Blob or File using streaming chunks via hash-wasm.
 * Avoids loading large files (e.g. 50 MB - 200 MB PDFs) entirely into memory.
 */
export async function computeBlobSha256(blob: Blob): Promise<string> {
  const hasher = await createSHA256();
  hasher.init();

  const stream = blob.stream();
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        hasher.update(value);
      }
    }
  } finally {
    reader.releaseLock();
  }

  return hasher.digest("hex");
}
