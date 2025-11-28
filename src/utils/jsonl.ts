import fs from 'fs-extra';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

const DEBUG_JSONL = false;

export async function appendJsonl<T>(filePath: string, data: T): Promise<void> {
    const line = JSON.stringify(data) + '\n';
    if (DEBUG_JSONL) {
        console.log('[jsonl] append', filePath);
    }
    await fs.appendFile(filePath, line, 'utf8');
}

export async function readJsonl<T>(filePath: string): Promise<T[]> {
    const results: T[] = [];
    if (!fs.existsSync(filePath)) return results;

    const fileStream = createReadStream(filePath);
    const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity,
    });

    for await (const line of rl) {
        if (line.trim()) {
            try {
                results.push(JSON.parse(line));
            } catch {
                // Skip malformed lines or handle error?
                // Spec says "fix malformed JSONL lines manually", so we might want to warn.
                console.warn(`Warning: Malformed JSONL line in ${filePath}: ${line}`);
            }
        }
    }

    return results;
}

export async function ensureJsonlFile(filePath: string): Promise<void> {
    await fs.ensureFile(filePath);
}

export async function writeJsonlAll<T>(filePath: string, items: T[]): Promise<void> {
    await fs.ensureFile(filePath);
    const content = items.map((item) => JSON.stringify(item)).join('\n') + (items.length ? '\n' : '');
    if (DEBUG_JSONL) {
        console.log('[jsonl] writeAll', filePath, 'items:', items.length);
    }
    await fs.writeFile(filePath, content, 'utf8');
}
