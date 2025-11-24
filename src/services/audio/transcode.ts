import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, basename, extname, join } from 'path';

const execFileAsync = promisify(execFile);

/**
 * Transcode an audio file to a target codec and bitrate using ffmpeg.
 * `options` must contain `codec` (e.g., 'mp3') and `bitrate` (e.g., '192k').
 * If `outPath` is omitted, a new file is created alongside the input with the appropriate extension.
 */
export async function transcodeAudio(
    inputPath: string,
    options: { codec: string; bitrate: string; outPath?: string }
): Promise<string> {
    const { codec, bitrate, outPath } = options;
    const output = outPath ?? join(dirname(inputPath), `${basename(inputPath, extname(inputPath))}.${codec}`);
    const args = ['-i', inputPath, '-c:a', codec, '-b:a', bitrate, output];
    await execFileAsync('ffmpeg', args);
    return output;
}
