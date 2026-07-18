import { describe, expect, it } from 'vitest';

import { FFprobeInspectionError, inspectWithFFprobe, type FFprobeRunner } from '../src/services/inspection/ffprobe-inspector.js';

function runner(output: unknown): FFprobeRunner {
  return { run: async () => ({ stdout: typeof output === 'string' ? output : JSON.stringify(output) }) };
}

const audioOutput = {
  format: { format_name: 'mp3', duration: '1.25', size: '1234', bit_rate: '128000' },
  streams: [{ codec_type: 'audio', codec_name: 'mp3', sample_rate: '44100', channels: 2 }],
};

describe('inspectWithFFprobe', () => {
  it('inspects audio with codec, container, bitrate, and audio facts', async () => {
    await expect(inspectWithFFprobe('/tmp/take.mp3', { runner: runner(audioOutput) })).resolves.toMatchObject({
      mediaKind: 'audio', format: 'mp3', mimeType: 'audio/mpeg', byteLength: 1234, durationSeconds: 1.25,
      sampleRate: 44100, channels: 2, codec: 'mp3', container: 'mp3', bitrate: 128000, audioTrackCount: 1,
    });
  });

  it('inspects landscape video and parses rational fps', async () => {
    const output = {
      format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '3', size: '100', bit_rate: '900000' },
      streams: [{ codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, r_frame_rate: '30000/1001' }],
    };
    const result = await inspectWithFFprobe('/tmp/landscape.mp4', { runner: runner(output) });
    expect(result).toMatchObject({ mediaKind: 'video', width: 1920, height: 1080, codec: 'h264', audioTrackCount: 0 });
    expect(result.mediaKind === 'video' && result.frameRate).toBeCloseTo(29.97002997);
  });

  it('inspects portrait video with an audio track', async () => {
    const output = {
      format: { format_name: 'mp4', duration: '5', size: '200', bit_rate: '800000' },
      streams: [
        { codec_type: 'video', codec_name: 'h265', width: 1080, height: 1920, avg_frame_rate: '24/1' },
        { codec_type: 'audio', codec_name: 'aac', sample_rate: '48000', channels: 2 },
      ],
    };
    await expect(inspectWithFFprobe('/tmp/portrait.mp4', { runner: runner(output) })).resolves.toMatchObject({
      mediaKind: 'video', width: 1080, height: 1920, frameRate: 24, audioTrackCount: 1,
    });
  });

  it('rejects malformed JSON and missing streams with actionable errors', async () => {
    await expect(inspectWithFFprobe('/tmp/bad', { runner: runner('{') })).rejects.toThrow('malformed JSON');
    await expect(inspectWithFFprobe('/tmp/empty', { runner: runner({ format: audioOutput.format, streams: [] }) })).rejects.toThrow('no streams');
  });

  it('rejects invalid numeric fields', async () => {
    const output = { ...audioOutput, format: { ...audioOutput.format, duration: 'NaN' } };
    await expect(inspectWithFFprobe('/tmp/bad-duration', { runner: runner(output) })).rejects.toBeInstanceOf(FFprobeInspectionError);
  });
});
