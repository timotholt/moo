import { Command } from 'commander';
import fs from 'fs-extra';
import { importDialogService } from '../../services/importer.js';

export const importDialogCommand = new Command('import-dialog')
    .description('Import a dialogue script from a text file into a specific actor')
    .argument('<actor>', 'Actor ID, base_filename, or display name')
    .argument('<file>', 'Path to the text file')
    .option('-w, --wipe', 'Replace existing actor bins, media, and takes while retaining generated audio files')
    .action(async (actor, file, options) => {
        if (!fs.existsSync(file)) {
            console.error(`File not found: ${file}`);
            process.exit(1);
        }

        const projectRoot = process.cwd();

        try {
            console.log(`Starting import for actor: ${actor}...`);
            const { binsCount, mediaCount } = await importDialogService(projectRoot, actor, file, { wipe: options.wipe });
            console.log(`Import complete! Added ${binsCount} categories (bins) and ${mediaCount} dialogue lines.`);
        } catch (error: unknown) {
            console.error('Import failed:', error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });
