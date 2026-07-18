import type {
  AssetGenerator,
  GeneratedAsset,
  GenerationRequest,
  ProviderCapabilities,
  ProviderOperation,
  ProviderOperationStatus,
  VideoAspectRatio,
} from './types.js';

const OPENAI_VIDEOS_URL = 'https://api.openai.com/v1/videos';
const DEFAULT_MODEL = 'sora-2';
const DEFAULT_DURATION_SECONDS = 4;
const SUPPORTED_DURATIONS = new Set([4, 8, 12, 16, 20]);

type Fetch = typeof globalThis.fetch;

export interface OpenAIVideoGeneratorOptions {
  apiKey: string;
  model?: string;
  fetch?: Fetch;
}

interface VideoProfile {
  aspectRatio: VideoAspectRatio;
  width: number;
  height: number;
  size: string;
}

const VIDEO_PROFILES: readonly VideoProfile[] = [
  { aspectRatio: '16:9', width: 1280, height: 720, size: '1280x720' },
  { aspectRatio: '9:16', width: 720, height: 1280, size: '720x1280' },
  { aspectRatio: '16:9', width: 1920, height: 1080, size: '1920x1080' },
  { aspectRatio: '9:16', width: 1080, height: 1920, size: '1080x1920' },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function errorMessage(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  return readString(value, 'message') ?? readString(value, 'code');
}

async function readJson(response: Response, context: string): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error(`OpenAI ${context} returned malformed JSON`);
  }
  if (!isRecord(value)) {
    throw new Error(`OpenAI ${context} returned a malformed response`);
  }
  return value;
}

async function assertSuccessfulJson(
  response: Response,
  context: string,
): Promise<Record<string, unknown>> {
  const body = await readJson(response, context);
  if (!response.ok) {
    const message = errorMessage(body.error) ?? errorMessage(body) ?? response.statusText;
    throw new Error(`OpenAI ${context} failed (${response.status}): ${message}`);
  }
  return body;
}

function mapStatus(status: string): ProviderOperationStatus {
  switch (status) {
    case 'queued':
      return 'submitted';
    case 'in_progress':
      return 'processing';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      throw new Error(`OpenAI video response contained unsupported status "${status}"`);
  }
}

function supports1080p(model: string): boolean {
  return model === 'sora-2-pro' || model.startsWith('sora-2-pro-');
}

function resolveProfile(request: GenerationRequest, model: string): VideoProfile {
  const delivery = request.delivery;
  const width = delivery?.width;
  const height = delivery?.height;

  if ((width === undefined) !== (height === undefined)) {
    throw new Error('OpenAI video generation requires both delivery.width and delivery.height');
  }

  let profile: VideoProfile | undefined;
  if (width !== undefined && height !== undefined) {
    profile = VIDEO_PROFILES.find((candidate) => (
      candidate.width === width && candidate.height === height
    ));
    if (!profile) {
      throw new Error(`OpenAI video generation does not support dimensions ${width}x${height}`);
    }
  } else {
    const aspectRatio = delivery?.aspectRatio ?? '16:9';
    profile = VIDEO_PROFILES.find((candidate) => (
      candidate.aspectRatio === aspectRatio && candidate.height <= 1280
    ));
  }

  if (!profile) {
    throw new Error(`OpenAI video generation does not support aspect ratio ${delivery?.aspectRatio}`);
  }
  if (delivery?.aspectRatio && profile.aspectRatio !== delivery.aspectRatio) {
    throw new Error(
      `OpenAI video dimensions ${profile.size} do not match aspect ratio ${delivery.aspectRatio}`,
    );
  }
  if (profile.height >= 1080 && profile.width >= 1080 && !supports1080p(model)) {
    throw new Error(`OpenAI video model ${model} does not support 1080p generation`);
  }
  return profile;
}

function validateRequest(request: GenerationRequest, model: string): {
  profile: VideoProfile;
  durationSeconds: number;
} {
  if (request.assetKind !== 'video') {
    throw new Error(`openai-video does not support ${request.assetKind} generation`);
  }
  if (request.prompt.trim().length === 0) {
    throw new Error('OpenAI video generation requires a non-empty prompt');
  }
  if (request.delivery?.format && request.delivery.format.toLowerCase() !== 'mp4') {
    throw new Error(`OpenAI video generation does not support format ${request.delivery.format}`);
  }
  if (request.delivery?.frameRate !== undefined) {
    throw new Error('OpenAI video generation does not support a requested frame rate');
  }
  if (request.delivery?.transparency) {
    throw new Error('OpenAI video generation does not support transparency');
  }

  const durationSeconds = request.delivery?.durationSeconds ?? DEFAULT_DURATION_SECONDS;
  if (!Number.isInteger(durationSeconds) || !SUPPORTED_DURATIONS.has(durationSeconds)) {
    throw new Error('OpenAI video duration must be one of 4, 8, 12, 16, or 20 seconds');
  }

  return {
    profile: resolveProfile(request, model),
    durationSeconds,
  };
}

function responseMetadata(
  body: Record<string, unknown>,
  response: Response,
  existing: Record<string, unknown> = {},
): Record<string, unknown> {
  const metadata: Record<string, unknown> = { ...existing };
  for (const key of ['progress', 'model', 'size', 'seconds'] as const) {
    const value = body[key];
    if (typeof value === 'string' || typeof value === 'number') {
      metadata[key] = value;
    }
  }
  const requestId = response.headers.get('x-request-id');
  if (requestId) {
    metadata.openaiRequestId = requestId;
  }
  return metadata;
}

/**
 * OpenAI's asynchronous Sora video API exposed through MOO's provider-neutral
 * operation contract.
 */
export class OpenAIVideoGenerator implements AssetGenerator {
  readonly providerId = 'openai-video';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetch: Fetch;

  constructor(options: OpenAIVideoGeneratorOptions) {
    if (options.apiKey.trim().length === 0) {
      throw new Error('OpenAI video generation requires an API key');
    }
    if (options.model !== undefined && options.model.trim().length === 0) {
      throw new Error('OpenAI video generation requires a non-empty model');
    }
    this.apiKey = options.apiKey;
    this.model = options.model ?? DEFAULT_MODEL;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  capabilities(): ProviderCapabilities {
    return {
      providerId: this.providerId,
      media: {
        video: {
          formats: ['mp4'],
          aspectRatios: ['16:9', '9:16'],
          supportsDuration: true,
        },
      },
    };
  }

  async submit(request: GenerationRequest): Promise<ProviderOperation> {
    const { profile, durationSeconds } = validateRequest(request, this.model);
    const response = await this.fetch(OPENAI_VIDEOS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        prompt: request.prompt,
        size: profile.size,
        seconds: durationSeconds,
      }),
    });
    const body = await assertSuccessfulJson(response, 'video submission');
    return this.toOperation(body, response, request.id);
  }

  async poll(operation: ProviderOperation): Promise<ProviderOperation> {
    this.assertOperation(operation);
    const response = await this.fetch(
      `${OPENAI_VIDEOS_URL}/${encodeURIComponent(operation.operationId)}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}` },
      },
    );
    const body = await assertSuccessfulJson(response, 'video status');
    return this.toOperation(body, response, operation.requestId, operation.providerMetadata);
  }

  async download(operation: ProviderOperation): Promise<GeneratedAsset> {
    this.assertOperation(operation);
    if (operation.status !== 'completed') {
      throw new Error(`Cannot download ${operation.status} operation ${operation.operationId}`);
    }

    const response = await this.fetch(
      `${OPENAI_VIDEOS_URL}/${encodeURIComponent(operation.operationId)}/content`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}` },
      },
    );
    if (!response.ok) {
      let message = response.statusText;
      try {
        const body = await readJson(response, 'video download');
        message = errorMessage(body.error) ?? errorMessage(body) ?? message;
      } catch {
        // The content endpoint can return a non-JSON proxy error.
      }
      throw new Error(`OpenAI video download failed (${response.status}): ${message}`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    const providerMetadata = { ...operation.providerMetadata };
    const requestId = response.headers.get('x-request-id');
    if (requestId) {
      providerMetadata.downloadOpenaiRequestId = requestId;
    }
    return {
      bytes,
      mimeType: 'video/mp4',
      providerMetadata,
    };
  }

  private toOperation(
    body: Record<string, unknown>,
    response: Response,
    requestId: string,
    existingMetadata: Record<string, unknown> = {},
  ): ProviderOperation {
    const operationId = readString(body, 'id');
    const providerStatus = readString(body, 'status');
    if (!operationId || !providerStatus) {
      throw new Error('OpenAI video response is missing id or status');
    }

    const status = mapStatus(providerStatus);
    const operation: ProviderOperation = {
      providerId: this.providerId,
      operationId,
      requestId,
      status,
      providerMetadata: responseMetadata(body, response, existingMetadata),
    };
    if (status === 'failed') {
      operation.error = errorMessage(body.error) ?? 'OpenAI video generation failed';
    }
    return operation;
  }

  private assertOperation(operation: ProviderOperation): void {
    if (operation.providerId !== this.providerId) {
      throw new Error(`Operation ${operation.operationId} does not belong to ${this.providerId}`);
    }
    if (operation.operationId.trim().length === 0) {
      throw new Error('OpenAI video operation ID cannot be empty');
    }
  }
}
