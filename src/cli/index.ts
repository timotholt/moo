#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { importActorsCommand } from './commands/import-actors.js';
import { importDialoguesCommand } from './commands/import-dialogues.js';
import { probeAudio } from '../services/audio/ffprobe.js';
import { normalizeAudio } from '../services/audio/normalize.js';
import { transcodeAudio } from '../services/audio/transcode.js';
import { hashFile, verifyHash } from '../services/audio/hash.js';

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

// Audio commands
const audioCommand = new Command('audio').description('Audio processing commands');

audioCommand
    .command('probe <file>')
    .description('Run ffprobe on an audio file and output JSON metadata')
    .action(async (file: string) => {
        try {
            const data = await probeAudio(file);
            console.log(JSON.stringify(data, null, 2));
        } catch (err) {
            console.error('Error probing audio:', err);
            process.exit(1);
        }
    });

audioCommand
    .command('normalize <input> [output]')
    .description('Normalize audio loudness to -23 LUFS using ffmpeg')
    .action(async (input: string, output?: string) => {
        try {
            const resultPath = await normalizeAudio(input, output);
            console.log(`Normalized audio written to ${resultPath}`);
        } catch (err) {
            console.error('Error normalizing audio:', err);
            process.exit(1);
        }
    });

audioCommand
    .command('transcode <input>')
    .description('Transcode audio to a target codec and bitrate')
    .option('-c, --codec <codec>', 'Target codec (e.g., mp3, aac)', 'mp3')
    .option('-b, --bitrate <bitrate>', 'Target bitrate (e.g., 192k)', '192k')
    .option('-o, --output <output>', 'Output file path')
    .action(async (input: string, options) => {
        try {
            const resultPath = await transcodeAudio(input, {
                codec: options.codec,
                bitrate: options.bitrate,
                outPath: options.output,
            });
            console.log(`Transcoded audio written to ${resultPath}`);
        } catch (err) {
            console.error('Error transcoding audio:', err);
            process.exit(1);
        }
    });

audioCommand
    .command('hash <file>')
    .description('Compute SHA-256 hash of a file and store in .sha256 (or verify existing)')
    .option('-v, --verify', 'Verify existing hash instead of computing')
    .action(async (file: string, options) => {
        try {
            if (options.verify) {
                const ok = await verifyHash(file);
                console.log(ok ? 'Hash matches' : 'Hash mismatch');
            } else {
                const hash = await hashFile(file);
                console.log(`SHA-256: ${hash}`);
            }
        } catch (err) {
            console.error('Error hashing file:', err);
            process.exit(1);
        }
    });

program.addCommand(audioCommand);

program
    .command('index')
    .command('rebuild')
    .description('Rebuild all derived indexes')
    .action(async () => {
        const { rebuildIndexesService } = await import('../services/indexing.js');
        await rebuildIndexesService(process.cwd());
    });

program.parse();
