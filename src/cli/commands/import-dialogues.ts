import { Command } from 'commander';
import fs from 'fs-extra';
import { importContentService } from '../../services/importer.js';

export const importDialoguesCommand = new Command('content')
    .description('Import content items from a CSV file (v2 model)')
    .argument('<file>', 'Path to CSV file')
    .action(async (file) => {
        if (!fs.existsSync(file)) {
            console.error(`File not found: ${file}`);
            process.exit(1);
        }

        const projectRoot = process.cwd();
        const inputStream = fs.createReadStream(file);

        try {
            const count = await importContentService(projectRoot, inputStream);
            console.log(`Imported ${count} content items.`);
        } catch (error) {
            console.error('Import failed:', error);
            process.exit(1);
        }
    });
