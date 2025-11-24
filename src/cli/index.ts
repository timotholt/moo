#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { importActorsCommand } from './commands/import-actors.js';
import { importDialoguesCommand } from './commands/import-dialogues.js';
import { audioProbeCommand } from './commands/audio-probe.js';
import { audioNormalizeCommand } from './commands/audio-normalize.js';
import { audioTranscodeCommand } from './commands/audio-transcode.js';
import { audioHashCommand } from './commands/audio-hash.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try to read package.json to get version
let version = '0.0.0';
try {
    const pkgPath = join(__dirname, '../../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    version = pkg.version;
} catch {
    // ignore error in dev or if file not found
}

const program = new Command();

program
    .name('vof')
    .description('VO Foundry CLI - Local Voice-Over Production System')
    .version(version);

program
    .command('init')
    .description('Initialize a new VO Foundry project')
    .argument('<path>', 'Project directory path')
    .action((path) => {
        console.log(`Initializing project in ${path}...`);
        // TODO: Implement init logic
    });

program.addCommand(importActorsCommand);
program.addCommand(importDialoguesCommand);
program.addCommand(audioProbeCommand);
program.addCommand(audioNormalizeCommand);
program.addCommand(audioTranscodeCommand);
program.addCommand(audioHashCommand);

program
    .command('index')
    .command('rebuild')
    .description('Rebuild all derived indexes')
    .action(async () => {
        const { rebuildIndexesService } = await import('../services/indexing.js');
        await rebuildIndexesService(process.cwd());
    });

program.parse();
