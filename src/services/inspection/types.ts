/** The shared metadata returned after inspecting generated media bytes. */
export interface MediaInspectionResult {
  /** The broad media family, allowing downstream review/publishing to stay provider-neutral. */
  mediaKind: 'audio' | 'image' | 'video';
  /** A lowercase container or file format identifier, for example `png` or `mp3`. */
  format: string;
  mimeType: string;
  byteLength: number;
}

/** Metadata that can be established from image bytes without rendering them. */
export interface ImageInspectionResult extends MediaInspectionResult {
  mediaKind: 'image';
  width: number;
  height: number;
  /**
   * True when the format declares an alpha channel. This says nothing about
   * whether any particular pixel is actually transparent.
   */
  hasAlphaChannel: boolean;
  /** Backward-compatible shorthand for alpha-channel capability, not pixel transparency. */
  hasAlpha: boolean;
}

/** Shape reserved for audio inspectors such as ffprobe-backed implementations. */
export interface AudioInspectionResult extends MediaInspectionResult {
  mediaKind: 'audio';
  durationSeconds?: number;
  sampleRate?: number;
  channels?: number;
}

/** Shape reserved for video inspectors. */
export interface VideoInspectionResult extends MediaInspectionResult {
  mediaKind: 'video';
  width?: number;
  height?: number;
  durationSeconds?: number;
  frameRate?: number;
}

export type InspectionResult =
  | AudioInspectionResult
  | ImageInspectionResult
  | VideoInspectionResult;
