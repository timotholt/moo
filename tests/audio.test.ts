/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { probeAudio } from '../src/services/audio/ffprobe.js';
import { normalizeAudio } from '../src/services/audio/normalize.js';
import { transcodeAudio } from '../src/services/audio/transcode.js';
import * as childProcess from 'node:child_process';

// Mock child_process.execFile
vi.mock('node:child_process', () => ({
    execFile: vi.fn(),
}));

describe('M2 Audio Services (Unit Tests)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('probeAudio', () => {
        it('should parse ffprobe JSON output', async () => {
            const mockOutput = JSON.stringify({
                format: {
                    duration: '123.45',
                    size: '1024000',
                    bit_rate: '128000',
                },
                streams: [
                    {
                        codec_name: 'mp3',
                        sample_rate: '44100',
                        channels: 2,
                    },
                ],
            });

            vi.mocked(childProcess.execFile).mockImplementation((cmd, args, callback: any) => {
                callback(null, { stdout: mockOutput, stderr: '' });
                return {} as any;
            });

            const result = await probeAudio('/fake/path.mp3');

            expect(result.format.duration).toBe(123.45);
            expect(result.format.size).toBe(1024000);
            expect(result.format.bit_rate).toBe(128000);
            expect(result.streams).toHaveLength(1);
            expect(result.streams[0].codec_name).toBe('mp3');
        });
    });

    describe('normalizeAudio', () => {
        it('should call ffmpeg with correct normalization args', async () => {
            vi.mocked(childProcess.execFile).mockImplementation((cmd, args, callback: any) => {
                callback(null, { stdout: '', stderr: '' });
                return {} as any;
            });

            const result = await normalizeAudio('/input.wav', '/output.wav');

            expect(result).toBe('/output.wav');
            expect(childProcess.execFile).toHaveBeenCalledWith(
                'ffmpeg',
                expect.arrayContaining(['-i', '/input.wav', '-af', 'loudnorm=I=-23:LRA=7:TP=-2', '/output.wav']),
                expect.any(Function)
            );
        });
    });

    describe('transcodeAudio', () => {
        it('should call ffmpeg with correct transcode args', async () => {
            vi.mocked(childProcess.execFile).mockImplementation((cmd, args, callback: any) => {
                callback(null, { stdout: '', stderr: '' });
                return {} as any;
            });

            const result = await transcodeAudio('/input.wav', {
                codec: 'mp3',
                bitrate: '192k',
                outPath: '/output.mp3',
            });

            expect(result).toBe('/output.mp3');
            expect(childProcess.execFile).toHaveBeenCalledWith(
                'ffmpeg',
                expect.arrayContaining(['-i', '/input.wav', '-c:a', 'mp3', '-b:a', '192k', '/output.mp3']),
                expect.any(Function)
            );
        });
    });

    // Note: hashFile and verifyHash tests are skipped because they require
    // real filesystem operations. These should be tested with integration tests
    // that use temporary files, or with more sophisticated mocking.
});
