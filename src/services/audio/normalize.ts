import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, extname, join, dirname } from 'path';

const execFileAsync = promisify(execFile);

/**
 * Normalize audio loudness to -23 LUFS using ffmpeg.
 * If `outputPath` is omitted, a new file is created next to the input with
 * `.normalized` inserted before the extension.
 */
export async function normalizeAudio(
    inputPath: string,
    outputPath?: string
): Promise<string> {
    const out = outputPath ??
        join(
            dirname(inputPath),
            `${basename(inputPath, extname(inputPath))}.normalized${extname(inputPath)}`
        );
    const args = ['-i', inputPath, '-af', 'loudnorm=I=-23:LRA=7:TP=-2', out];
    await execFileAsync('ffmpeg', args);
    return out;
}
