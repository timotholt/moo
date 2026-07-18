import { execFile as nodeExecFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { AudioInspectionResult, VideoInspectionResult } from './types.js';

const execFileAsync = promisify(nodeExecFile);

export class FFprobeInspectionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'FFprobeInspectionError';
  }
}

export interface FFprobeRunner {
  run(command: string, args: readonly string[]): Promise<{ stdout: string }>;
}

export interface FFprobeInspectionOptions {
  runner?: FFprobeRunner;
}

export interface FFprobeAudioInspection extends AudioInspectionResult {
  codec: string;
  container: string;
  bitrate: number;
  audioTrackCount: number;
}

export interface FFprobeVideoInspection extends VideoInspectionResult {
  codec: string;
  container: string;
  bitrate: number;
  audioTrackCount: number;
}

export type FFprobeInspectionResult = FFprobeAudioInspection | FFprobeVideoInspection;

interface FFprobeStream {
  codec_type?: unknown;
  codec_name?: unknown;
  width?: unknown;
  height?: unknown;
  r_frame_rate?: unknown;
  avg_frame_rate?: unknown;
  sample_rate?: unknown;
  channels?: unknown;
}

interface FFprobeOutput {
  format?: {
    duration?: unknown;
    format_name?: unknown;
    bit_rate?: unknown;
    size?: unknown;
  };
  streams?: unknown;
}

const defaultRunner: FFprobeRunner = {
  async run(command, args) {
    const { stdout } = await execFileAsync(command, [...args]);
    return { stdout: String(stdout) };
  },
};

/** Inspect an audio or video file through ffprobe without coupling to a provider. */
export async function inspectWithFFprobe(
  filePath: string,
  { runner = defaultRunner }: FFprobeInspectionOptions = {},
): Promise<FFprobeInspectionResult> {
  let stdout: string;
  try {
    ({ stdout } = await runner.run('ffprobe', [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]));
  } catch (cause) {
    throw new FFprobeInspectionError(`ffprobe failed to inspect ${filePath}`, { cause });
  }

  const output = parseOutput(stdout);
  const streams = readStreams(output);
  const videoStream = streams.find((stream) => stream.codec_type === 'video');
  const audioStreams = streams.filter((stream) => stream.codec_type === 'audio');

  if (videoStream) {
    return inspectVideo(output, videoStream, audioStreams.length);
  }
  if (audioStreams.length > 0) {
    return inspectAudio(output, audioStreams);
  }
  throw new FFprobeInspectionError('ffprobe output has no audio or video streams');
}

function parseOutput(stdout: string): FFprobeOutput {
  try {
    const output: unknown = JSON.parse(stdout);
    if (!isRecord(output)) throw new Error('top-level JSON value is not an object');
    return output as FFprobeOutput;
  } catch (cause) {
    throw new FFprobeInspectionError('ffprobe returned malformed JSON', { cause });
  }
}

function readStreams(output: FFprobeOutput): FFprobeStream[] {
  if (!Array.isArray(output.streams) || output.streams.length === 0) {
    throw new FFprobeInspectionError('ffprobe output has no streams');
  }
  return output.streams.map((stream, index) => {
    if (!isRecord(stream)) throw new FFprobeInspectionError(`ffprobe stream ${index} is invalid`);
    return stream as FFprobeStream;
  });
}

function inspectVideo(output: FFprobeOutput, stream: FFprobeStream, audioTrackCount: number): FFprobeVideoInspection {
  return {
    mediaKind: 'video',
    format: container(output),
    mimeType: videoMimeType(output),
    byteLength: byteLength(output),
    durationSeconds: duration(output),
    width: positiveInteger(stream.width, 'video width'),
    height: positiveInteger(stream.height, 'video height'),
    frameRate: preferredFrameRate(stream),
    codec: nonEmptyString(stream.codec_name, 'video codec'),
    container: container(output),
    bitrate: nonNegativeNumber(output.format?.bit_rate, 'bitrate'),
    audioTrackCount,
  };
}

function inspectAudio(output: FFprobeOutput, streams: FFprobeStream[]): FFprobeAudioInspection {
  const stream = streams[0];
  return {
    mediaKind: 'audio',
    format: container(output),
    mimeType: audioMimeType(output),
    byteLength: byteLength(output),
    durationSeconds: duration(output),
    sampleRate: positiveInteger(stream.sample_rate, 'audio sample rate'),
    channels: positiveInteger(stream.channels, 'audio channels'),
    codec: nonEmptyString(stream.codec_name, 'audio codec'),
    container: container(output),
    bitrate: nonNegativeNumber(output.format?.bit_rate, 'bitrate'),
    audioTrackCount: streams.length,
  };
}

function container(output: FFprobeOutput): string {
  return nonEmptyString(output.format?.format_name, 'container').split(',')[0].toLowerCase();
}

function duration(output: FFprobeOutput): number {
  return positiveNumber(output.format?.duration, 'duration');
}

function byteLength(output: FFprobeOutput): number {
  return nonNegativeNumber(output.format?.size, 'file size');
}

function rationalFrameRate(value: unknown): number {
  const text = nonEmptyString(value, 'frame rate');
  const [numeratorText, denominatorText, ...rest] = text.split('/');
  if (rest.length > 0 || numeratorText === undefined || denominatorText === undefined) {
    throw new FFprobeInspectionError(`frame rate must be a rational number, received ${text}`);
  }
  const numerator = Number(numeratorText);
  const denominator = Number(denominatorText);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || numerator <= 0 || denominator <= 0) {
    throw new FFprobeInspectionError(`frame rate must be a positive finite rational number, received ${text}`);
  }
  const frameRate = numerator / denominator;
  if (!Number.isFinite(frameRate) || frameRate <= 0) {
    throw new FFprobeInspectionError(`frame rate must resolve to a positive finite number, received ${text}`);
  }
  return frameRate;
}

function preferredFrameRate(stream: FFprobeStream): number {
  try {
    return rationalFrameRate(stream.avg_frame_rate);
  } catch (error) {
    if (!(error instanceof FFprobeInspectionError) || stream.r_frame_rate === undefined) throw error;
    return rationalFrameRate(stream.r_frame_rate);
  }
}

function positiveInteger(value: unknown, field: string): number {
  const number = positiveNumber(value, field);
  if (!Number.isInteger(number)) throw new FFprobeInspectionError(`${field} must be an integer`);
  return number;
}

function positiveNumber(value: unknown, field: string): number {
  const number = numeric(value, field);
  if (number <= 0) throw new FFprobeInspectionError(`${field} must be greater than zero`);
  return number;
}

function nonNegativeNumber(value: unknown, field: string): number {
  const number = numeric(value, field);
  if (number < 0) throw new FFprobeInspectionError(`${field} must not be negative`);
  return number;
}

function numeric(value: unknown, field: string): number {
  const number = typeof value === 'number' || typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(number)) throw new FFprobeInspectionError(`${field} must be a finite number`);
  return number;
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new FFprobeInspectionError(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function audioMimeType(output: FFprobeOutput): string {
  const name = container(output);
  return name === 'mp3' ? 'audio/mpeg' : name === 'wav' ? 'audio/wav' : `audio/${name}`;
}

function videoMimeType(output: FFprobeOutput): string {
  const name = container(output);
  return name === 'mov' ? 'video/quicktime' : 'video/mp4';
}
