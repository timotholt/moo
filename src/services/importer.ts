
import { parse } from 'csv-parse';
import { Readable } from 'stream';
import { getProjectPaths } from '../utils/paths.js';
import { generateId } from '../utils/ids.js';
import { appendJsonl, ensureJsonlFile } from '../utils/jsonl.js';
import { validate } from '../utils/validation.js';

export async function importActorsService(projectRoot: string, inputStream: Readable): Promise<number> {
    const paths = getProjectPaths(projectRoot);
    await ensureJsonlFile(paths.catalog.actors);

    const parser = inputStream.pipe(
        parse({
            columns: true,
            trim: true,
            skip_empty_lines: true,
        })
    );

    let count = 0;
    const now = new Date().toISOString();

    for await (const record of parser) {
        const baseFilenameSource: string = record.base_filename || record.display_name || '';
        const base_filename =
            record.base_filename ||
            baseFilenameSource
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '') + '_';

        const actor = {
            id: generateId(),
            display_name: record.display_name,
            base_filename,
            all_approved: false,
            provider_settings: {
                dialogue: {
                    provider: 'manual',
                },
                music: {
                    provider: 'manual',
                },
                sfx: {
                    provider: 'manual',
                },
            },
            aliases: record.aliases ? record.aliases.split(';').map((s: string) => s.trim()) : [],
            notes: record.notes || '',
            created_at: now,
            updated_at: now,
        };

        const validation = validate('actor', actor);
        if (!validation.valid) {
            console.error(`Invalid actor record: ${JSON.stringify(record)}`);
            console.error(validation.errors);
            continue;
        }

        await appendJsonl(paths.catalog.actors, actor);
        count++;
    }

    return count;
}
