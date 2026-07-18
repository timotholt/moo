import type {
  MusicSettings,
  SFXSettings,
  VoiceSettings,
} from '../providers/provider-interface.js';

/** Every asset family MOO can request from a generator. */
export type AssetKind = 'dialogue' | 'music' | 'sfx' | 'image' | 'video';

export type ProviderOperationStatus = 'submitted' | 'processing' | 'completed' | 'failed';

export type VideoAspectRatio = '16:9' | '9:16';

/**
 * The requested delivery contract. A provider may support only a subset; the
 * registry uses capabilities to reject unsupported work before it is sent.
 */
export interface DeliveryRequirements {
  format?: string;
  width?: number;
  height?: number;
  aspectRatio?: VideoAspectRatio;
  durationSeconds?: number;
  frameRate?: number;
  transparency?: boolean;
}

/** Audio settings are deliberately preserved while generation is migrated. */
export interface GenerationSettings {
  voiceId?: string;
  voice?: VoiceSettings;
  music?: MusicSettings;
  sfx?: SFXSettings;
  [key: string]: unknown;
}

export interface GenerationRequest {
  /** Stable caller-owned ID, persisted with the future generation job. */
  id: string;
  assetKind: AssetKind;
  prompt: string;
  delivery?: DeliveryRequirements;
  settings?: GenerationSettings;
  metadata?: Record<string, unknown>;
}

export interface MediaCapability {
  formats?: readonly string[];
  aspectRatios?: readonly VideoAspectRatio[];
  supportsTransparency?: boolean;
  supportsDuration?: boolean;
  supportsFrameRate?: boolean;
}

export interface ProviderCapabilities {
  providerId: string;
  media: Partial<Record<AssetKind, MediaCapability>>;
  /** Optional provider services, not requirements of all generators. */
  voices?: boolean;
  quota?: boolean;
}

export interface ProviderOperation {
  providerId: string;
  operationId: string;
  requestId: string;
  status: ProviderOperationStatus;
  providerMetadata?: Record<string, unknown>;
  error?: string;
}

export interface GeneratedAsset {
  bytes: Buffer;
  mimeType: string;
  providerMetadata: Record<string, unknown>;
}

/**
 * Provider-neutral asynchronous generation contract. Synchronous providers
 * simply return a completed operation from submit().
 */
export interface AssetGenerator {
  readonly providerId: string;
  capabilities(): ProviderCapabilities;
  submit(request: GenerationRequest): Promise<ProviderOperation>;
  poll(operation: ProviderOperation): Promise<ProviderOperation>;
  download(operation: ProviderOperation): Promise<GeneratedAsset>;
}
