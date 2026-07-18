import type { AudioProvider } from '../providers/provider-interface.js';
import type {
  AssetGenerator,
  GeneratedAsset,
  GenerationRequest,
  ProviderCapabilities,
  ProviderOperation,
} from './types.js';

const AUDIO_MIME_TYPE = 'audio/mpeg';

/**
 * Compatibility adapter for the existing synchronous AudioProvider. It makes
 * the audio request during submit(), retains the bytes in memory, and reports
 * an immediately-completed operation. A persisted job layer can later retain
 * the operation metadata without changing this adapter's public contract.
 */
export class ElevenLabsGeneratorAdapter implements AssetGenerator {
  readonly providerId: string;
  private readonly completedAssets = new Map<string, GeneratedAsset>();

  constructor(private readonly audioProvider: AudioProvider, providerId = 'elevenlabs') {
    this.providerId = providerId;
  }

  capabilities(): ProviderCapabilities {
    return {
      providerId: this.providerId,
      media: {
        dialogue: { formats: ['mp3'] },
        music: { formats: ['mp3'], supportsDuration: true },
        sfx: { formats: ['mp3'], supportsDuration: true },
      },
      voices: true,
      quota: true,
    };
  }

  async submit(request: GenerationRequest): Promise<ProviderOperation> {
    if (!this.capabilities().media[request.assetKind]) {
      throw new Error(`${this.providerId} does not support ${request.assetKind} generation`);
    }

    const operationId = `${this.providerId}:${request.id}`;
    try {
      const bytes = await this.generate(request);
      this.completedAssets.set(operationId, {
        bytes,
        mimeType: AUDIO_MIME_TYPE,
        providerMetadata: {
          provider: this.providerId,
          assetKind: request.assetKind,
          requestId: request.id,
        },
      });
      return {
        providerId: this.providerId,
        operationId,
        requestId: request.id,
        status: 'completed',
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
    const asset = this.completedAssets.get(operation.operationId);
    if (!asset) {
      throw new Error(`No generated asset is available for ${operation.operationId}`);
    }
    return asset;
  }

  private async generate(request: GenerationRequest): Promise<Buffer> {
    switch (request.assetKind) {
      case 'dialogue': {
        const voiceId = request.settings?.voiceId;
        if (!voiceId) {
          throw new Error('ElevenLabs dialogue generation requires settings.voiceId');
        }
        return this.audioProvider.generateDialogue(
          request.prompt,
          voiceId,
          request.settings?.voice,
          typeof request.settings?.modelId === 'string' ? request.settings.modelId : undefined,
        );
      }
      case 'music':
        return this.audioProvider.generateMusic(request.prompt, request.settings?.music);
      case 'sfx':
        return this.audioProvider.generateSFX(request.prompt, request.settings?.sfx);
      case 'image':
      case 'video':
        throw new Error(`${this.providerId} does not support ${request.assetKind} generation`);
    }
  }

  private assertOperation(operation: ProviderOperation): void {
    if (operation.providerId !== this.providerId) {
      throw new Error(`Operation ${operation.operationId} does not belong to ${this.providerId}`);
    }
  }
}
