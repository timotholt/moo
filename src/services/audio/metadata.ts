/**
 * Audio file metadata service
 * 
 * Multi-format support for embedding metadata in audio files.
 * Used for dual-write architecture: JSONL is primary cache, file metadata is backup.
 * 
 * Format support:
 * - WAV: RIFF INFO tags via wavefile library
 * - MP3: ID3 tags via ffmpeg  
 * - FLAC: Vorbis comments via ffmpeg
 * - Other: Best-effort via ffmpeg
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname, basename, join } from 'path';
import wavefile from 'wavefile';

const { WaveFile } = wavefile;
const execFileAsync = promisify(execFile);

const DEBUG_METADATA = false;

// ============================================================================
// Types
// ============================================================================

export type AudioFormat = 'wav' | 'mp3' | 'flac' | 'unknown';

/**
 * Metadata tags that can be embedded in audio files.
 * All values are strings.
 */
export interface VofoundryMetadata {
  // Core IDs
  id: string;                    // Take ID (UUID)
  content_id: string;            // Parent content/cue ID
  actor_id: string;              // Actor ID
  section_id: string;            // Section ID
  scene_id?: string;             // Scene ID (optional)
  
  // Human-readable fields (map to standard tags)
  cue_id: string;                // Cue identifier → title
  actor_name?: string;           // Actor display name → artist
  section_name?: string;         // Section name → album
  scene_name?: string;           // Scene name (e.g., "Act 1")
  content_type: string;          // dialogue | music | sfx → genre
  take_number: string;           // Take number → track
  status: string;                // new | approved | rejected | hidden
  prompt?: string;               // Generation prompt → comment
  
  // Generation metadata
  generated_by?: string;         // elevenlabs | manual | null
  voice_id?: string;             // Voice ID
  model_id?: string;             // Model ID
  stability?: string;            // Stability parameter
  similarity_boost?: string;     // Similarity boost parameter
  
  // Timestamps
  created_at: string;            // ISO timestamp
  updated_at: string;            // ISO timestamp
}

// ============================================================================
// Format Detection
// ============================================================================

/**
 * Detect audio format by reading magic bytes, not file extension.
 */
export async function detectFormat(filePath: string): Promise<AudioFormat> {
  try {
    const buffer = await readFile(filePath);
    return detectFormatFromBuffer(buffer);
  } catch {
    return 'unknown';
  }
}

/**
 * Detect audio format from buffer magic bytes.
 */
export function detectFormatFromBuffer(buffer: Buffer): AudioFormat {
  if (buffer.length < 12) return 'unknown';
  
  // WAV: RIFF....WAVE
  if (buffer.slice(0, 4).toString() === 'RIFF' && 
      buffer.slice(8, 12).toString() === 'WAVE') {
    return 'wav';
  }
  
  // FLAC: fLaC
  if (buffer.slice(0, 4).toString() === 'fLaC') {
    return 'flac';
  }
  
  // MP3: ID3 tag or frame sync
  if (buffer.slice(0, 3).toString() === 'ID3' ||
      (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0)) {
    return 'mp3';
  }
  
  return 'unknown';
}

// ============================================================================
// WAV Handler (wavefile + RIFF INFO tags)
// ============================================================================

/** RIFF INFO tag mappings for WAV files */
const WAV_TAG_MAP = {
  // Human-readable fields → standard RIFF tags
  cue_id: 'INAM',           // title
  actor_name: 'IART',       // artist
  section_name: 'IPRD',     // product/album
  scene_name: 'ISBJ',       // subject (scene name)
  content_type: 'IGNR',     // genre
  take_number: 'IPRT',      // track number
  prompt: 'ICMT',           // comment
  created_at: 'ICRD',       // date created
  voice_id: 'ISRC',         // source
  model_id: 'IENG',         // engineer
  status: 'IKEY',           // keywords (status:approved,etc)
  generated_by: 'ITCH',     // technician
} as const;

/** Reverse mapping for reading */
const WAV_TAG_REVERSE: Record<string, keyof typeof WAV_TAG_MAP> = {};
for (const [field, tag] of Object.entries(WAV_TAG_MAP)) {
  WAV_TAG_REVERSE[tag] = field as keyof typeof WAV_TAG_MAP;
}

/**
 * Read metadata from a WAV file using wavefile.
 */
async function readWavMetadata(filePath: string): Promise<Partial<VofoundryMetadata>> {
  const buffer = await readFile(filePath);
  const wav = new WaveFile(buffer);
  
  const metadata: Partial<VofoundryMetadata> = {};
  
  // Read standard RIFF INFO tags
  for (const [field, tag] of Object.entries(WAV_TAG_MAP)) {
    const value = wav.getTag(tag);
    if (value) {
      (metadata as Record<string, string>)[field] = value;
    }
  }
  
  // Read IDs from ICOP (copyright field stores JSON)
  const idsJson = wav.getTag('ICOP');
  if (idsJson) {
    try {
      const ids = JSON.parse(idsJson);
      if (ids.id) metadata.id = ids.id;
      if (ids.content_id) metadata.content_id = ids.content_id;
      if (ids.actor_id) metadata.actor_id = ids.actor_id;
      if (ids.section_id) metadata.section_id = ids.section_id;
      if (ids.scene_id) metadata.scene_id = ids.scene_id;
      if (ids.updated_at) metadata.updated_at = ids.updated_at;
      if (ids.stability) metadata.stability = ids.stability;
      if (ids.similarity_boost) metadata.similarity_boost = ids.similarity_boost;
    } catch {
      if (DEBUG_METADATA) {
        console.warn('[metadata] failed to parse WAV IDs JSON');
      }
    }
  }
  
  if (DEBUG_METADATA) {
    console.log('[metadata] read WAV metadata:', metadata);
  }
  
  return metadata;
}

/**
 * Write metadata to a WAV file using wavefile.
 */
async function writeWavMetadata(
  inputPath: string,
  outputPath: string,
  metadata: Partial<VofoundryMetadata>
): Promise<void> {
  const buffer = await readFile(inputPath);
  const wav = new WaveFile(buffer);
  
  // Write standard RIFF INFO tags
  for (const [field, tag] of Object.entries(WAV_TAG_MAP)) {
    const value = (metadata as Record<string, string | undefined>)[field];
    if (value !== undefined) {
      wav.setTag(tag, value);
    }
  }
  
  // Pack IDs into ICOP (copyright field)
  const ids: Record<string, string> = {};
  if (metadata.id) ids.id = metadata.id;
  if (metadata.content_id) ids.content_id = metadata.content_id;
  if (metadata.actor_id) ids.actor_id = metadata.actor_id;
  if (metadata.section_id) ids.section_id = metadata.section_id;
  if (metadata.scene_id) ids.scene_id = metadata.scene_id;
  if (metadata.updated_at) ids.updated_at = metadata.updated_at;
  if (metadata.stability) ids.stability = metadata.stability;
  if (metadata.similarity_boost) ids.similarity_boost = metadata.similarity_boost;
  
  if (Object.keys(ids).length > 0) {
    wav.setTag('ICOP', JSON.stringify(ids));
  }
  
  if (DEBUG_METADATA) {
    console.log('[metadata] writing WAV metadata');
  }
  
  // Write output
  await writeFile(outputPath, Buffer.from(wav.toBuffer()));
  
  if (DEBUG_METADATA) {
    console.log('[metadata] wrote WAV to:', outputPath);
  }
}

// ============================================================================
// MP3/FLAC Handler (ffmpeg)
// ============================================================================

/** Tag mappings for ffmpeg (MP3 ID3 / FLAC Vorbis) */
const FFMPEG_TAG_MAP = {
  cue_id: 'title',
  actor_name: 'artist',
  section_name: 'album',
  scene_name: 'album_artist',  // Use album_artist for scene
  content_type: 'genre',
  take_number: 'track',
  prompt: 'comment',
  created_at: 'date',
  voice_id: 'ISRC',
  model_id: 'encoded_by',
  status: 'VOFOUNDRY_STATUS',
  generated_by: 'VOFOUNDRY_GENERATED_BY',
  id: 'VOFOUNDRY_ID',
  content_id: 'VOFOUNDRY_CONTENT_ID',
  actor_id: 'VOFOUNDRY_ACTOR_ID',
  section_id: 'VOFOUNDRY_SECTION_ID',
  scene_id: 'VOFOUNDRY_SCENE_ID',
  updated_at: 'VOFOUNDRY_UPDATED_AT',
  stability: 'VOFOUNDRY_STABILITY',
  similarity_boost: 'VOFOUNDRY_SIMILARITY_BOOST',
} as const;

/** Reverse mapping for reading */
const FFMPEG_TAG_REVERSE: Record<string, string> = {};
for (const [field, tag] of Object.entries(FFMPEG_TAG_MAP)) {
  FFMPEG_TAG_REVERSE[tag.toLowerCase()] = field;
}

/**
 * Read metadata from MP3/FLAC using ffprobe.
 */
async function readFfmpegMetadata(filePath: string): Promise<Partial<VofoundryMetadata>> {
  const args = ['-v', 'quiet', '-print_format', 'json', '-show_format', filePath];
  const { stdout } = await execFileAsync('ffprobe', args);
  const data = JSON.parse(stdout);
  const tags = data.format?.tags || {};
  
  const metadata: Partial<VofoundryMetadata> = {};
  
  for (const [rawKey, value] of Object.entries(tags)) {
    const key = rawKey.toLowerCase();
    const field = FFMPEG_TAG_REVERSE[key];
    if (field) {
      (metadata as Record<string, string>)[field] = String(value);
    }
  }
  
  if (DEBUG_METADATA) {
    console.log('[metadata] read ffmpeg metadata:', metadata);
  }
  
  return metadata;
}

/**
 * Write metadata to MP3/FLAC using ffmpeg.
 */
async function writeFfmpegMetadata(
  inputPath: string,
  outputPath: string,
  metadata: Partial<VofoundryMetadata>
): Promise<void> {
  // Detect input format to preserve it (file extension may be wrong)
  const inputFormat = await detectFormat(inputPath);
  
  const metadataArgs: string[] = [];
  
  for (const [field, tag] of Object.entries(FFMPEG_TAG_MAP)) {
    const value = (metadata as Record<string, string | undefined>)[field];
    if (value !== undefined) {
      metadataArgs.push('-metadata', `${tag}=${value}`);
    }
  }
  
  if (metadataArgs.length === 0) {
    throw new Error('No metadata to write');
  }
  
  // Use temp file if in-place update
  const needsTempFile = inputPath === outputPath;
  const actualOutput = needsTempFile 
    ? join(dirname(outputPath), `.tmp_${basename(outputPath)}`)
    : outputPath;
  
  // Force output format to match input (prevents remuxing due to extension)
  const formatArgs: string[] = [];
  if (inputFormat === 'mp3') {
    formatArgs.push('-f', 'mp3');
  } else if (inputFormat === 'flac') {
    formatArgs.push('-f', 'flac');
  }
  
  const args = [
    '-i', inputPath,
    '-c', 'copy',
    ...metadataArgs,
    ...formatArgs,
    '-y',
    actualOutput
  ];
  
  if (DEBUG_METADATA) {
    console.log('[metadata] ffmpeg args:', args.join(' '));
  }
  
  try {
    await execFileAsync('ffmpeg', args);
    
    if (needsTempFile) {
      await rename(actualOutput, outputPath);
    }
    
    if (DEBUG_METADATA) {
      console.log('[metadata] wrote ffmpeg metadata to:', outputPath);
    }
  } catch (err) {
    if (needsTempFile) {
      try { await unlink(actualOutput); } catch { /* ignore */ }
    }
    throw err;
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Read metadata from an audio file.
 * Detects format automatically and uses appropriate handler.
 */
export async function readMetadata(filePath: string): Promise<Partial<VofoundryMetadata>> {
  const format = await detectFormat(filePath);
  
  if (DEBUG_METADATA) {
    console.log('[metadata] detected format:', format, 'for', filePath);
  }
  
  try {
    switch (format) {
      case 'wav':
        return await readWavMetadata(filePath);
      case 'mp3':
      case 'flac':
      default:
        return await readFfmpegMetadata(filePath);
    }
  } catch (err) {
    if (DEBUG_METADATA) {
      console.error('[metadata] failed to read:', filePath, err);
    }
    throw err;
  }
}

/**
 * Write metadata to an audio file.
 * Detects format automatically and uses appropriate handler.
 */
export async function writeMetadata(
  inputPath: string,
  outputPath: string,
  metadata: Partial<VofoundryMetadata>
): Promise<void> {
  const format = await detectFormat(inputPath);
  
  if (DEBUG_METADATA) {
    console.log('[metadata] writing to format:', format);
  }
  
  switch (format) {
    case 'wav':
      await writeWavMetadata(inputPath, outputPath, metadata);
      break;
    case 'mp3':
    case 'flac':
    default:
      await writeFfmpegMetadata(inputPath, outputPath, metadata);
      break;
  }
}

/**
 * Update metadata in-place, merging with existing.
 */
export async function updateMetadata(
  filePath: string,
  updates: Partial<VofoundryMetadata>
): Promise<void> {
  const existing = await readMetadata(filePath);
  const merged = { ...existing, ...updates };
  await writeMetadata(filePath, filePath, merged);
}

/**
 * Check if a file has VOFOUNDRY metadata.
 */
export async function hasVofoundryMetadata(filePath: string): Promise<boolean> {
  try {
    const metadata = await readMetadata(filePath);
    return metadata.id !== undefined;
  } catch {
    return false;
  }
}

/**
 * Build metadata from Take and Content records.
 */
export function buildMetadataFromTake(
  take: {
    id: string;
    content_id: string;
    take_number: number;
    status: string;
    created_at: string;
    updated_at: string;
    generated_by?: string | null;
    generation_params?: Record<string, unknown>;
  },
  content: {
    id: string;
    actor_id: string;
    section_id: string;
    content_type: string;
    cue_id: string;
    prompt?: string;
  },
  context?: {
    actor_name?: string;
    section_name?: string;
    scene_id?: string;
    scene_name?: string;
  }
): VofoundryMetadata {
  const genParams = take.generation_params || {};
  
  return {
    id: take.id,
    content_id: take.content_id,
    actor_id: content.actor_id,
    section_id: content.section_id,
    scene_id: context?.scene_id,
    content_type: content.content_type,
    cue_id: content.cue_id,
    actor_name: context?.actor_name,
    section_name: context?.section_name,
    scene_name: context?.scene_name,
    take_number: String(take.take_number),
    status: take.status,
    prompt: content.prompt,
    generated_by: take.generated_by || undefined,
    voice_id: genParams.voice_id as string | undefined,
    model_id: genParams.model_id as string | undefined,
    stability: genParams.stability !== undefined ? String(genParams.stability) : undefined,
    similarity_boost: genParams.similarity_boost !== undefined ? String(genParams.similarity_boost) : undefined,
    created_at: take.created_at,
    updated_at: take.updated_at,
  };
}
