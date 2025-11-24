import { Command } from 'commander';
import { normalizeAudio } from '../../services/audio/normalize.js';

export const audioNormalizeCommand = new Command()
    .command('audio normalize <input> [output]')
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
