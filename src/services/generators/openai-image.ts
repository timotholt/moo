import type {
  AssetGenerator,
  GeneratedAsset,
  GenerationRequest,
  ProviderCapabilities,
  ProviderOperation,
} from './types.js';
import { ProviderOutputStore } from '../provider-output-store.js';

const OPENAI_IMAGE_GENERATIONS_URL = 'https://api.openai.com/v1/images/generations';
const DEFAULT_MODEL = 'gpt-image-2';
const SUPPORTED_FORMATS = ['png', 'jpeg', 'webp'] as const;

type SupportedFormat = (typeof SUPPORTED_FORMATS)[number];
type FetchLike = typeof globalThis.fetch;

export interface OpenAIImageGeneratorOptions {
  apiKey: string;
  outputStore: ProviderOutputStore;
  model?: string;
  fetch?: FetchLike;
}

interface OpenAIImageResponse {
  created?: unknown;
  data?: unknown;
  usage?: unknown;
}

/**
 * OpenAI's image generation endpoint is synchronous. Returned bytes are
 * atomically staged inside the project before a completed operation is
 * exposed, making download recoverable after a process restart.
 */
export class OpenAIImageGenerator implements AssetGenerator {
  readonly providerId = 'openai-image';

  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetch: FetchLike;
  private readonly outputStore: ProviderOutputStore;

  constructor(options: OpenAIImageGeneratorOptions) {
    const apiKey = options.apiKey.trim();
    const model = (options.model ?? DEFAULT_MODEL).trim();
    if (!apiKey) throw new Error('OpenAI image generation requires an API key');
    if (!model) throw new Error('OpenAI image generation requires a model');

    this.apiKey = apiKey;
    this.model = model;
    this.fetch = options.fetch ?? globalThis.fetch;
    this.outputStore = options.outputStore;
  }

  capabilities(): ProviderCapabilities {
    return {
      providerId: this.providerId,
      media: {
        image: {
          formats: SUPPORTED_FORMATS,
          supportsTransparency: false,
        },
      },
    };
  }

  async submit(request: GenerationRequest): Promise<ProviderOperation> {
    this.assertSupportedRequest(request);

    const operationId = `${this.providerId}:${request.id}`;
    try {
      const outputFormat = this.resolveOutputFormat(request);
      const requestBody = this.buildRequestBody(request, outputFormat);
      const response = await this.fetch(OPENAI_IMAGE_GENERATIONS_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(await this.formatApiError(response));
      }

      const payload = await this.readJson(response);
      const bytes = this.extractImageBytes(payload);
      const reference = await this.outputStore.stage({
        providerId: this.providerId,
        operationId,
        bytes,
        mimeType: mimeTypeFor(outputFormat),
      });
      const providerMetadata = this.outputStore.attach(
        this.buildProviderMetadata(response, payload, request, outputFormat),
        reference,
      );

      return {
        providerId: this.providerId,
        operationId,
        requestId: request.id,
        status: 'completed',
        providerMetadata: { ...providerMetadata },
      };
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

  async poll(operation: ProviderOperation): Promise<ProviderOperation> {
    this.assertOperation(operation);
    return operation;
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

  private assertSupportedRequest(request: GenerationRequest): void {
    if (request.assetKind !== 'image') {
      throw new Error(`${this.providerId} does not support ${request.assetKind} generation`);
    }
    if (request.delivery?.transparency === true) {
      throw new Error(`${this.providerId} does not support transparent image generation`);
    }

    const { width, height } = request.delivery ?? {};
    if ((width === undefined) !== (height === undefined)) {
      throw new Error(`${this.providerId} image size requires both width and height`);
    }
    if (width !== undefined && (!Number.isInteger(width) || width <= 0)) {
      throw new Error(`${this.providerId} image width must be a positive integer`);
    }
    if (height !== undefined && (!Number.isInteger(height) || height <= 0)) {
      throw new Error(`${this.providerId} image height must be a positive integer`);
    }

    this.resolveOutputFormat(request);
  }

  private resolveOutputFormat(request: GenerationRequest): SupportedFormat {
    const deliveryFormat = request.delivery?.format;
    const settingsFormat = request.settings?.output_format;

    if (settingsFormat !== undefined && typeof settingsFormat !== 'string') {
      throw new Error(`${this.providerId} settings.output_format must be a string`);
    }
    if (
      deliveryFormat !== undefined
      && settingsFormat !== undefined
      && normalizeFormat(deliveryFormat) !== normalizeFormat(settingsFormat)
    ) {
      throw new Error(`${this.providerId} output_format conflicts with the requested delivery format`);
    }

    const format = normalizeFormat(settingsFormat ?? deliveryFormat ?? 'png');
    if (!isSupportedFormat(format)) {
      throw new Error(`${this.providerId} does not support ${format} image output`);
    }
    return format;
  }

  private buildRequestBody(
    request: GenerationRequest,
    outputFormat: SupportedFormat,
  ): Record<string, string> {
    const body: Record<string, string> = {
      model: this.model,
      prompt: request.prompt,
      output_format: outputFormat,
    };

    const { width, height } = request.delivery ?? {};
    if (width !== undefined && height !== undefined) {
      body.size = `${width}x${height}`;
    }

    const quality = request.settings?.quality;
    if (quality !== undefined) {
      if (typeof quality !== 'string' || !quality.trim()) {
        throw new Error(`${this.providerId} settings.quality must be a non-empty string`);
      }
      body.quality = quality;
    }

    return body;
  }

  private async formatApiError(response: Response): Promise<string> {
    const requestId = response.headers.get('x-request-id');
    let detail = '';
    try {
      const text = await response.text();
      if (text) {
        try {
          const parsed = JSON.parse(text) as { error?: { message?: unknown }; message?: unknown };
          const message = parsed.error?.message ?? parsed.message;
          detail = typeof message === 'string' && message.trim() ? `: ${message}` : `: ${text}`;
        } catch {
          detail = `: ${text}`;
        }
      }
    } catch {
      // Status information remains sufficient if the error body cannot be read.
    }
    const requestSuffix = requestId ? ` (request ${requestId})` : '';
    return `OpenAI image generation failed with HTTP ${response.status}${detail}${requestSuffix}`;
  }

  private async readJson(response: Response): Promise<OpenAIImageResponse> {
    try {
      const payload: unknown = await response.json();
      if (!isRecord(payload)) throw new Error('response body is not an object');
      return payload;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`OpenAI image generation returned invalid JSON: ${detail}`);
    }
  }

  private extractImageBytes(payload: OpenAIImageResponse): Buffer {
    if (!Array.isArray(payload.data) || payload.data.length === 0) {
      throw new Error('OpenAI image generation response is missing data[0].b64_json');
    }
    const first = payload.data[0];
    if (!isRecord(first) || typeof first.b64_json !== 'string') {
      throw new Error('OpenAI image generation response is missing data[0].b64_json');
    }
    return decodeBase64(first.b64_json);
  }

  private buildProviderMetadata(
    response: Response,
    payload: OpenAIImageResponse,
    request: GenerationRequest,
    outputFormat: SupportedFormat,
  ): Record<string, unknown> {
    const metadata: Record<string, unknown> = {
      provider: this.providerId,
      model: this.model,
      assetKind: request.assetKind,
      requestId: request.id,
      outputFormat,
    };
    const apiRequestId = response.headers.get('x-request-id');
    if (apiRequestId) metadata.apiRequestId = apiRequestId;
    if (typeof payload.created === 'number' && Number.isFinite(payload.created)) {
      metadata.created = payload.created;
    }
    if (isRecord(payload.usage)) metadata.usage = payload.usage;
    return metadata;
  }

  private assertOperation(operation: ProviderOperation): void {
    if (operation.providerId !== this.providerId) {
      throw new Error(`Operation ${operation.operationId} does not belong to ${this.providerId}`);
    }
  }
}

function normalizeFormat(format: string): string {
  return format.trim().toLowerCase();
}

function isSupportedFormat(format: string): format is SupportedFormat {
  return (SUPPORTED_FORMATS as readonly string[]).includes(format);
}

function mimeTypeFor(format: SupportedFormat): string {
  return format === 'jpeg' ? 'image/jpeg' : `image/${format}`;
}

function decodeBase64(value: string): Buffer {
  if (
    value.length === 0
    || value.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    throw new Error('OpenAI image generation returned invalid base64 image data');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length === 0) {
    throw new Error('OpenAI image generation returned empty image data');
  }
  return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
