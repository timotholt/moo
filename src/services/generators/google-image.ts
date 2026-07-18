import type {
  AssetGenerator,
  GeneratedAsset,
  GenerationRequest,
  ProviderCapabilities,
  ProviderOperation,
} from './types.js';
import { ProviderOutputStore } from '../provider-output-store.js';

const GOOGLE_GENERATIVE_LANGUAGE_URL = 'https://generativelanguage.googleapis.com/v1/models';
const DEFAULT_MODEL = 'gemini-3.1-flash-image';
const SUPPORTED_ASPECT_RATIOS = ['1:1', '3:4', '4:3', '16:9', '9:16'] as const;
const SUPPORTED_IMAGE_SIZES = new Set(['0.5K', '1K', '2K', '4K']);
const SAFETY_FINISH_REASONS = new Set([
  'SAFETY',
  'BLOCKLIST',
  'PROHIBITED_CONTENT',
  'IMAGE_SAFETY',
]);

type SupportedAspectRatio = (typeof SUPPORTED_ASPECT_RATIOS)[number];
type FetchImplementation = typeof globalThis.fetch;

interface GeminiInlineData {
  mimeType?: unknown;
  data?: unknown;
}

interface GeminiPart {
  inlineData?: GeminiInlineData;
  [key: string]: unknown;
}

interface GeminiCandidate {
  content?: {
    parts?: GeminiPart[];
  };
  finishReason?: unknown;
  safetyRatings?: unknown;
  citationMetadata?: unknown;
  groundingMetadata?: unknown;
  tokenCount?: unknown;
  [key: string]: unknown;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: unknown;
  usageMetadata?: unknown;
  responseId?: unknown;
  modelVersion?: unknown;
  [key: string]: unknown;
}

interface LocatedImage {
  candidate: GeminiCandidate;
  candidateIndex: number;
  data: string;
  mimeType: string;
}

/**
 * Synchronous Gemini image generation presented through MOO's provider-neutral
 * operation contract. Bytes are atomically staged inside the project before a
 * completed operation is returned.
 */
export class GoogleImageGenerator implements AssetGenerator {
  readonly providerId = 'google-image';

  private readonly outputStore: ProviderOutputStore;
  private readonly completedOperations = new Map<string, ProviderOperation>();
  private readonly inFlightSubmissions = new Map<string, Promise<ProviderOperation>>();

  constructor(
    private readonly apiKey: string,
    private readonly model = DEFAULT_MODEL,
    private readonly fetchImpl: FetchImplementation = globalThis.fetch,
    outputStore?: ProviderOutputStore,
  ) {
    if (!apiKey.trim()) {
      throw new Error('Google Gemini image generation requires an API key');
    }
    if (!model.trim()) {
      throw new Error('Google Gemini image generation requires a model');
    }
    if (!outputStore) {
      throw new Error('Google Gemini image generation requires project output storage');
    }
    this.outputStore = outputStore;
  }

  capabilities(): ProviderCapabilities {
    return {
      providerId: this.providerId,
      media: {
        image: {
          formats: ['png'],
          supportsTransparency: false,
        },
      },
    };
  }

  async submit(request: GenerationRequest): Promise<ProviderOperation> {
    this.validateRequest(request);

    const operationId = `${this.providerId}:${request.id}`;
    const completed = this.completedOperations.get(operationId);
    if (completed) {
      return completed;
    }

    const inFlight = this.inFlightSubmissions.get(operationId);
    if (inFlight) {
      return inFlight;
    }

    const submission = this.submitOnce(request, operationId);
    this.inFlightSubmissions.set(operationId, submission);
    try {
      return await submission;
    } finally {
      this.inFlightSubmissions.delete(operationId);
    }
  }

  async poll(operation: ProviderOperation): Promise<ProviderOperation> {
    this.assertOperation(operation);
    return this.completedOperations.get(operation.operationId) ?? operation;
  }

  async download(operation: ProviderOperation): Promise<GeneratedAsset> {
    this.assertOperation(operation);
    if (operation.status !== 'completed') {
      throw new Error(`Cannot download ${operation.status} operation ${operation.operationId}`);
    }

    const asset = await this.outputStore.download(operation.providerMetadata);

    return {
      bytes: Buffer.from(asset.bytes),
      mimeType: asset.mimeType,
      providerMetadata: { ...operation.providerMetadata },
    };
  }

  private async submitOnce(
    request: GenerationRequest,
    operationId: string,
  ): Promise<ProviderOperation> {
    try {
      const aspectRatio = resolveAspectRatio(request);
      const imageSize = resolveImageSize(request);
      const image: Record<string, string> = { aspectRatio };
      if (imageSize) {
        image.imageSize = imageSize;
      }

      const response = await this.fetchImpl(
        `${GOOGLE_GENERATIVE_LANGUAGE_URL}/${encodeURIComponent(this.model)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': this.apiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: request.prompt }] }],
            generationConfig: {
              responseModalities: ['IMAGE'],
              responseFormat: { image },
            },
          }),
        },
      );

      if (!response.ok) {
        throw new Error(await googleApiError(response));
      }

      const payload = await parseGeminiResponse(response);
      assertNotSafetyBlocked(payload);
      const locatedImage = locateImage(payload);
      const bytes = decodeBase64Image(locatedImage.data);
      const reference = await this.outputStore.stage({
        providerId: this.providerId,
        operationId,
        bytes,
        mimeType: locatedImage.mimeType,
      });
      const providerMetadata = this.outputStore.attach(
        buildProviderMetadata(
          request,
          payload,
          locatedImage,
          aspectRatio,
          imageSize,
          this.model,
        ),
        reference,
      );
      const operation: ProviderOperation = {
        providerId: this.providerId,
        operationId,
        requestId: request.id,
        status: 'completed',
        providerMetadata,
      };

      this.completedOperations.set(operationId, operation);
      return operation;
    } catch (error) {
      return {
        providerId: this.providerId,
        operationId,
        requestId: request.id,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private validateRequest(request: GenerationRequest): void {
    if (request.assetKind !== 'image') {
      throw new Error(`${this.providerId} does not support ${request.assetKind} generation`);
    }
    if (request.delivery?.transparency) {
      throw new Error(`${this.providerId} does not support transparent image generation`);
    }
  }

  private assertOperation(operation: ProviderOperation): void {
    if (operation.providerId !== this.providerId) {
      throw new Error(`Operation ${operation.operationId} does not belong to ${this.providerId}`);
    }
  }
}

function resolveAspectRatio(request: GenerationRequest): SupportedAspectRatio {
  const delivery = request.delivery;
  const requestedRatio = (delivery as { aspectRatio?: unknown } | undefined)?.aspectRatio;
  let explicitRatio: SupportedAspectRatio | undefined;

  if (requestedRatio !== undefined) {
    if (
      typeof requestedRatio !== 'string'
      || !SUPPORTED_ASPECT_RATIOS.includes(requestedRatio as SupportedAspectRatio)
    ) {
      throw new Error(
        `Google Gemini image generation does not support aspect ratio ${String(requestedRatio)}`,
      );
    }
    explicitRatio = requestedRatio as SupportedAspectRatio;
  }

  const width = delivery?.width;
  const height = delivery?.height;
  if (width === undefined && height === undefined) {
    return explicitRatio ?? '1:1';
  }
  if (
    width === undefined
    || height === undefined
    || !Number.isInteger(width)
    || !Number.isInteger(height)
    || width <= 0
    || height <= 0
  ) {
    throw new Error('Google Gemini image dimensions require positive integer width and height');
  }

  const inferredRatio = SUPPORTED_ASPECT_RATIOS.find((ratio) => {
    const [ratioWidth, ratioHeight] = ratio.split(':').map(Number);
    return width * ratioHeight === height * ratioWidth;
  });
  if (!inferredRatio) {
    throw new Error(
      `Google Gemini image dimensions ${width}x${height} do not match a supported aspect ratio`,
    );
  }
  if (explicitRatio && explicitRatio !== inferredRatio) {
    throw new Error(
      `Google Gemini image aspect ratio ${explicitRatio} conflicts with dimensions ${width}x${height}`,
    );
  }
  return inferredRatio;
}

function resolveImageSize(request: GenerationRequest): string | undefined {
  const imageSize = request.settings?.imageSize;
  return typeof imageSize === 'string' && SUPPORTED_IMAGE_SIZES.has(imageSize)
    ? imageSize
    : undefined;
}

async function googleApiError(response: Response): Promise<string> {
  let detail = '';
  try {
    const body = (await response.text()).trim();
    if (body) {
      try {
        const payload = JSON.parse(body) as {
          error?: { message?: unknown; status?: unknown };
        };
        const message = typeof payload.error?.message === 'string' ? payload.error.message : '';
        const status = typeof payload.error?.status === 'string' ? payload.error.status : '';
        detail = [status, message].filter(Boolean).join(': ') || body;
      } catch {
        detail = body;
      }
    }
  } catch {
    // The HTTP status is still enough to produce a useful terminal failure.
  }
  return `Google Gemini image API failed (${response.status}${response.statusText ? ` ${response.statusText}` : ''})${detail ? `: ${detail}` : ''}`;
}

async function parseGeminiResponse(response: Response): Promise<GeminiResponse> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Google Gemini image API returned malformed JSON');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Google Gemini image API returned a malformed response');
  }
  return payload as GeminiResponse;
}

function assertNotSafetyBlocked(payload: GeminiResponse): void {
  const promptFeedback = asRecord(payload.promptFeedback);
  const blockReason = promptFeedback && typeof promptFeedback.blockReason === 'string'
    ? promptFeedback.blockReason
    : undefined;
  if (blockReason && blockReason !== 'BLOCK_REASON_UNSPECIFIED') {
    throw new Error(`Google Gemini image generation was safety-blocked: ${blockReason}`);
  }

  const safetyFinishReason = payload.candidates
    ?.map((candidate) => candidate.finishReason)
    .find(
      (finishReason): finishReason is string =>
        typeof finishReason === 'string' && SAFETY_FINISH_REASONS.has(finishReason),
    );
  if (safetyFinishReason) {
    throw new Error(`Google Gemini image generation was safety-blocked: ${safetyFinishReason}`);
  }
}

function locateImage(payload: GeminiResponse): LocatedImage {
  if (!Array.isArray(payload.candidates)) {
    throw new Error('Google Gemini image API response did not contain candidates');
  }

  for (const [candidateIndex, candidate] of payload.candidates.entries()) {
    const parts = candidate.content?.parts;
    if (!Array.isArray(parts)) {
      continue;
    }
    for (const part of parts) {
      const inlineData = part.inlineData;
      if (
        inlineData
        && typeof inlineData.mimeType === 'string'
        && inlineData.mimeType.startsWith('image/')
        && typeof inlineData.data === 'string'
        && inlineData.data.length > 0
      ) {
        return {
          candidate,
          candidateIndex,
          data: inlineData.data,
          mimeType: inlineData.mimeType,
        };
      }
    }
  }

  const finishReasons = payload.candidates
    .map((candidate) => candidate.finishReason)
    .filter((reason): reason is string => typeof reason === 'string');
  const suffix = finishReasons.length > 0 ? ` (finish reason: ${finishReasons.join(', ')})` : '';
  throw new Error(`Google Gemini image API response did not contain image data${suffix}`);
}

function decodeBase64Image(data: string): Buffer {
  const normalized = data.trim();
  if (
    normalized.length === 0
    || normalized.length % 4 !== 0
    || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)
  ) {
    throw new Error('Google Gemini image API returned malformed base64 image data');
  }
  const bytes = Buffer.from(normalized, 'base64');
  if (bytes.length === 0) {
    throw new Error('Google Gemini image API returned empty image data');
  }
  return bytes;
}

function buildProviderMetadata(
  request: GenerationRequest,
  payload: GeminiResponse,
  locatedImage: LocatedImage,
  aspectRatio: SupportedAspectRatio,
  imageSize: string | undefined,
  model: string,
): Record<string, unknown> {
  const candidateMetadata: Record<string, unknown> = {
    index: locatedImage.candidateIndex,
  };
  for (const key of [
    'finishReason',
    'safetyRatings',
    'citationMetadata',
    'groundingMetadata',
    'tokenCount',
  ] as const) {
    const value = locatedImage.candidate[key];
    if (value !== undefined) {
      candidateMetadata[key] = value;
    }
  }

  const responseMetadata: Record<string, unknown> = {
    candidate: candidateMetadata,
  };
  for (const key of ['responseId', 'modelVersion', 'usageMetadata', 'promptFeedback'] as const) {
    const value = payload[key];
    if (value !== undefined) {
      responseMetadata[key] = value;
    }
  }

  return {
    provider: 'google-image',
    requestId: request.id,
    model,
    mimeType: locatedImage.mimeType,
    aspectRatio,
    ...(imageSize ? { imageSize } : {}),
    responseMetadata,
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
