import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'fs/promises';

/**
 * Compute SHA‑256 hash of a file and write it to `<file>.sha256`.
 * Returns the hex digest.
 */
export async function hashFile(filePath: string): Promise<string> {
    const data = await readFile(filePath);
    const hash = createHash('sha256').update(data).digest('hex');
    await writeFile(`${filePath}.sha256`, hash);
    return hash;
}

/**
 * Verify that the stored `<file>.sha256` matches the current file content.
 * Returns true if the hashes match, false otherwise.
 */
export async function verifyHash(filePath: string): Promise<boolean> {
    try {
        const stored = (await readFile(`${filePath}.sha256`, 'utf-8')).trim();
        const current = await hashFile(filePath);
        return stored === current;
    } catch {
        return false;
    }
}
