import fs from 'fs-extra';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { basename, dirname, join } from 'path';

import { z } from 'zod';

const DEBUG_JSONL = false;

export async function appendJsonl<T>(filePath: string, data: T, schema?: z.ZodSchema<T>): Promise<void> {
    if (schema) {
        schema.parse(data);
    }
    const line = JSON.stringify(data) + '\n';
    if (DEBUG_JSONL) {
        console.log('[jsonl] append', filePath);
    }
    await fs.appendFile(filePath, line, 'utf8');
}

export async function readJsonl<T>(filePath: string, schema?: z.ZodSchema<T>): Promise<T[]> {
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
                const parsed = JSON.parse(line);
                if (schema) {
                    results.push(schema.parse(parsed));
                } else {
                    results.push(parsed);
                }
            } catch (err) {
                // Skip malformed lines or handle error?
                // Spec says "fix malformed JSONL lines manually", so we might want to warn.
                console.warn(`Warning: Malformed or invalid JSONL line in ${filePath}: ${line}`);
                if (err instanceof z.ZodError) {
                    console.warn('Validation error:', JSON.stringify(err.format(), null, 2));
                }
            }
        }
    }

    return results;
}

export async function ensureJsonlFile(filePath: string): Promise<void> {
    await fs.ensureFile(filePath);
}

export async function writeJsonlAll<T>(filePath: string, items: T[], schema?: z.ZodSchema<T>): Promise<void> {
    await fs.ensureDir(dirname(filePath));
    if (schema) {
        items.forEach(item => schema.parse(item));
    }
    const content = items.map((item) => JSON.stringify(item)).join('\n') + (items.length ? '\n' : '');
    if (DEBUG_JSONL) {
        console.log('[jsonl] writeAll', filePath, 'items:', items.length);
    }
    // A write to a sibling file followed by rename is atomic on the local
    // filesystem. Readers therefore see either the old complete catalog or
    // the new complete catalog, never a file being truncated mid-write.
    const temporaryPath = join(
        dirname(filePath),
        `.${basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`,
    );
    try {
        await fs.writeFile(temporaryPath, content, 'utf8');
        await fs.rename(temporaryPath, filePath);
    } catch (error) {
        await fs.remove(temporaryPath).catch(() => undefined);
        throw error;
    }
}
