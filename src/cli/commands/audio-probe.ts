import { Command } from 'commander';
import { probeAudio } from '../../services/audio/ffprobe.js';

export const audioProbeCommand = new Command()
    .command('audio probe <file>')
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
