import { Command } from 'commander';
import { transcodeAudio } from '../../services/audio/transcode.js';

export const audioTranscodeCommand = new Command()
    .command('audio transcode <input>')
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
