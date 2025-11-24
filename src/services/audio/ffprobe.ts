import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Run ffprobe on an audio file and return parsed JSON metadata.
 * The function expects `ffprobe` to be available in the system PATH.
 * Throws if ffprobe exits with a non‑zero code.
 */
export async function probeAudio(filePath: string): Promise<{
    format: { duration: number; size: number; bit_rate: number };
    streams: Array<{ codec_name: string; sample_rate?: string; channels?: number }>;
}> {
    const args = ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath];
    const { stdout } = await execFileAsync('ffprobe', args);
    const data = JSON.parse(stdout);
    return {
        format: {
            duration: Number(data.format.duration),
            size: Number(data.format.size),
            bit_rate: Number(data.format.bit_rate),
        },
        streams: data.streams.map((s: { codec_name: string; sample_rate?: string; channels?: number }) => ({
            codec_name: s.codec_name,
            sample_rate: s.sample_rate,
            channels: s.channels,
        })),
    };
}
