import type {
  AssetGenerator,
  GeneratedAsset,
  GenerationRequest,
  ProviderCapabilities,
  ProviderOperation,
  VideoAspectRatio,
} from './types.js';

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'veo-3.1-generate-preview';
const SUPPORTED_DURATIONS = new Set([4, 6, 8]);
const SUPPORTED_RESOLUTIONS = new Set(['720p', '1080p']);

type Fetch = typeof globalThis.fetch;
type VideoResolution = '720p' | '1080p';

interface GoogleOperationResponse {
  name?: unknown;
  done?: unknown;
  error?: unknown;
  response?: unknown;
}

export interface GoogleVideoGeneratorOptions {
  model?: string;
  fetch?: Fetch;
}

/**
 * Google Veo adapter using Gemini's long-running prediction REST API.
 *
 * Provider operation names are stored verbatim because they are the durable
 * handle required to resume polling after a MOO restart.
 */
export class GoogleVideoGenerator implements AssetGenerator {
  readonly providerId = 'google-video';
  private readonly model: string;
  private readonly fetch: Fetch;

  constructor(
    private readonly apiKey: string,
    options: GoogleVideoGeneratorOptions = {},
  ) {
    if (!apiKey.trim()) {
      throw new Error('Google Veo requires an API key');
    }
    this.model = normalizeModel(options.model ?? DEFAULT_MODEL);
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  capabilities(): ProviderCapabilities {
    return {
      providerId: this.providerId,
      media: {
        video: {
          formats: ['video/mp4'],
          aspectRatios: ['16:9', '9:16'],
          supportsDuration: true,
          supportsFrameRate: false,
        },
      },
    };
  }

  async submit(request: GenerationRequest): Promise<ProviderOperation> {
    const parameters = this.validateRequest(request);
    const response = await this.fetch(
      `${GEMINI_API_BASE_URL}/models/${encodeURIComponent(this.model)}:predictLongRunning`,
      {
        method: 'POST',
        headers: this.headers(true),
        body: JSON.stringify({
          instances: [{ prompt: request.prompt }],
          parameters,
        }),
      },
    );
    const payload = await parseJsonResponse(response, 'submit Veo generation');
    const operationId = stringField(payload.name);
    if (!operationId) {
      throw new Error('Google Veo submit response did not include an operation name');
    }

    return {
      providerId: this.providerId,
      operationId,
      requestId: request.id,
      status: 'submitted',
      providerMetadata: {
        model: this.model,
        aspectRatio: parameters.aspectRatio,
        durationSeconds: parameters.durationSeconds,
        resolution: parameters.resolution,
      },
    };
  }

  async poll(operation: ProviderOperation): Promise<ProviderOperation> {
    this.assertOperation(operation);
    const operationPath = operation.operationId.replace(/^\/+/, '').replace(/^v1beta\//, '');
    const response = await this.fetch(`${GEMINI_API_BASE_URL}/${operationPath}`, {
      method: 'GET',
      headers: this.headers(false),
    });
    const payload = await parseJsonResponse(response, `poll Veo operation ${operation.operationId}`);

    if (payload.done === false || payload.done === undefined) {
      return { ...operation, status: 'processing' };
    }
    if (payload.done !== true) {
      throw new Error(`Google Veo operation ${operation.operationId} returned an invalid done value`);
    }

    if (payload.error !== undefined) {
      return {
        ...operation,
        status: 'failed',
        error: providerError(payload.error),
      };
    }

    const videoUri = generatedVideoUri(payload.response);
    if (!videoUri) {
      throw new Error(`Google Veo operation ${operation.operationId} completed without a video URI`);
    }

    return {
      ...operation,
      status: 'completed',
      providerMetadata: {
        ...operation.providerMetadata,
        videoUri,
      },
      error: undefined,
    };
  }

  async download(operation: ProviderOperation): Promise<GeneratedAsset> {
    this.assertOperation(operation);
    if (operation.status !== 'completed') {
      throw new Error(`Cannot download ${operation.status} operation ${operation.operationId}`);
    }
    const videoUri = stringField(operation.providerMetadata?.videoUri);
    if (!videoUri) {
      throw new Error(`Google Veo operation ${operation.operationId} has no video URI`);
    }

    const response = await this.fetch(videoUri, {
      method: 'GET',
      headers: this.headers(false),
      redirect: 'follow',
    });
    if (!response.ok) {
      throw await httpError(response, `download Veo operation ${operation.operationId}`);
    }

    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      mimeType: 'video/mp4',
      providerMetadata: {
        ...operation.providerMetadata,
        provider: this.providerId,
        operationId: operation.operationId,
      },
    };
  }

  private validateRequest(request: GenerationRequest): {
    aspectRatio: VideoAspectRatio;
    durationSeconds: string;
    resolution: VideoResolution;
  } {
    if (request.assetKind !== 'video') {
      throw new Error(`${this.providerId} does not support ${request.assetKind} generation`);
    }

    const aspectRatio = request.delivery?.aspectRatio;
    if (aspectRatio !== '16:9' && aspectRatio !== '9:16') {
      throw new Error('Google Veo requires an aspect ratio of 16:9 or 9:16');
    }

    const durationSeconds = request.delivery?.durationSeconds;
    if (typeof durationSeconds !== 'number' || !SUPPORTED_DURATIONS.has(durationSeconds)) {
      throw new Error('Google Veo duration must be 4, 6, or 8 seconds');
    }

    const requestedResolution = request.settings?.resolution ?? '720p';
    if (typeof requestedResolution !== 'string' || !SUPPORTED_RESOLUTIONS.has(requestedResolution)) {
      throw new Error('Google Veo resolution must be 720p or 1080p');
    }
    const resolution = requestedResolution as VideoResolution;
    if (resolution === '1080p' && durationSeconds !== 8) {
      throw new Error('Google Veo 1080p generation requires an 8-second duration');
    }

    return {
      aspectRatio,
      durationSeconds: String(durationSeconds),
      resolution,
    };
  }

  private headers(json: boolean): Record<string, string> {
    return {
      'x-goog-api-key': this.apiKey,
      ...(json ? { 'content-type': 'application/json' } : {}),
    };
  }

  private assertOperation(operation: ProviderOperation): void {
    if (operation.providerId !== this.providerId) {
      throw new Error(`Operation ${operation.operationId} does not belong to ${this.providerId}`);
    }
  }
}

function normalizeModel(model: string): string {
  const normalized = model.trim().replace(/^models\//, '');
  if (!normalized) {
    throw new Error('Google Veo requires a model');
  }
  return normalized;
}

async function parseJsonResponse(response: Response, action: string): Promise<GoogleOperationResponse> {
  if (!response.ok) {
    throw await httpError(response, action);
  }
  const body = await response.text();
  if (!body) {
    throw new Error(`Google API returned an empty response while attempting to ${action}`);
  }
  try {
    const parsed: unknown = JSON.parse(body);
    if (!isRecord(parsed)) {
      throw new Error('response was not an object');
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Google API returned malformed JSON while attempting to ${action}: ${message}`);
  }
}

async function httpError(response: Response, action: string): Promise<Error> {
  const body = await response.text();
  let detail = body.trim();
  if (detail) {
    try {
      const parsed: unknown = JSON.parse(detail);
      if (isRecord(parsed) && isRecord(parsed.error) && stringField(parsed.error.message)) {
        detail = stringField(parsed.error.message) as string;
      }
    } catch {
      // Preserve non-JSON provider response text.
    }
  }
  return new Error(
    `Google API failed to ${action}: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ''}`,
  );
}

function generatedVideoUri(response: unknown): string | undefined {
  if (!isRecord(response)) return undefined;
  const generateVideoResponse = response.generateVideoResponse;
  if (!isRecord(generateVideoResponse) || !Array.isArray(generateVideoResponse.generatedSamples)) {
    return undefined;
  }
  const sample = generateVideoResponse.generatedSamples[0];
  if (!isRecord(sample) || !isRecord(sample.video)) return undefined;
  return stringField(sample.video.uri);
}

function providerError(error: unknown): string {
  if (isRecord(error)) {
    const message = stringField(error.message);
    if (message) return message;
    const status = stringField(error.status);
    if (status) return status;
  }
  if (typeof error === 'string' && error) return error;
  return 'Google Veo generation failed';
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
