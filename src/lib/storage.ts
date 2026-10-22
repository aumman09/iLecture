import { mkdir, writeFile, readFile, stat } from "fs/promises";
import path from "path";
import { env } from "./env";

// Local-disk storage for synced slide PDFs. Swap for S3 by re-implementing these 3 functions.
const root = () => path.resolve(process.cwd(), env.storageDir);

export async function saveFile(key: string, data: Buffer | Uint8Array) {
  const full = path.join(root(), key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
  return key;
}

export async function readStoredFile(key: string) {
  const full = path.join(root(), key);
  if (!full.startsWith(root())) throw new Error("Invalid path");
  return readFile(full);
}

export async function fileExists(key: string) {
  try {
    await stat(path.join(root(), key));
    return true;
  } catch {
    return false;
  }
}
