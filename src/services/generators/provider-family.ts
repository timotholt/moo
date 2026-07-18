import type {
  AssetGenerator,
  AssetKind,
  GeneratedAsset,
  GenerationRequest,
  ProviderCapabilities,
  ProviderOperation,
} from './types.js';

const DELEGATE_PROVIDER_KEY = 'moo_delegate_provider_id';

/**
 * Presents several capability-specific adapters as one author-facing provider.
 *
 * OpenAI and Google each use one credential but expose different image and
 * video APIs. Durable operations retain the concrete adapter ID in metadata so
 * polling and download remain routable after a restart.
 */
export class ProviderFamilyGenerator implements AssetGenerator {
  private readonly delegates = new Map<string, AssetGenerator>();
  private readonly delegatesByKind = new Map<AssetKind, AssetGenerator>();

  constructor(
    readonly providerId: string,
    generators: Iterable<AssetGenerator>,
  ) {
    if (!providerId.trim()) throw new Error('Provider family ID is required');

    for (const generator of generators) {
      if (generator.providerId === providerId) {
        throw new Error(`Provider family delegate cannot reuse family ID "${providerId}"`);
      }
      if (this.delegates.has(generator.providerId)) {
        throw new Error(`Duplicate provider family delegate "${generator.providerId}"`);
      }
      this.delegates.set(generator.providerId, generator);

      for (const kind of Object.keys(generator.capabilities().media) as AssetKind[]) {
        if (this.delegatesByKind.has(kind)) {
          throw new Error(`Provider family "${providerId}" has multiple ${kind} delegates`);
        }
        this.delegatesByKind.set(kind, generator);
      }
    }
  }

  capabilities(): ProviderCapabilities {
    const media: ProviderCapabilities['media'] = {};
    let voices = false;
    let quota = false;

    for (const generator of this.delegates.values()) {
      const capabilities = generator.capabilities();
      Object.assign(media, capabilities.media);
      voices ||= capabilities.voices === true;
      quota ||= capabilities.quota === true;
    }

    return {
      providerId: this.providerId,
      media,
      ...(voices ? { voices: true } : {}),
      ...(quota ? { quota: true } : {}),
    };
  }

  async submit(request: GenerationRequest): Promise<ProviderOperation> {
    const delegate = this.delegatesByKind.get(request.assetKind);
    if (!delegate) {
      throw new Error(`${this.providerId} does not support ${request.assetKind} generation`);
    }
    return this.wrap(await delegate.submit(request), delegate.providerId);
  }

  async poll(operation: ProviderOperation): Promise<ProviderOperation> {
    const delegate = this.delegateForOperation(operation);
    return this.wrap(await delegate.poll(this.unwrap(operation, delegate.providerId)), delegate.providerId);
  }

  async download(operation: ProviderOperation): Promise<GeneratedAsset> {
    const delegate = this.delegateForOperation(operation);
    return delegate.download(this.unwrap(operation, delegate.providerId));
  }

  private delegateForOperation(operation: ProviderOperation): AssetGenerator {
    if (operation.providerId !== this.providerId) {
      throw new Error(`Operation provider "${operation.providerId}" does not match "${this.providerId}"`);
    }
    const delegateId = operation.providerMetadata?.[DELEGATE_PROVIDER_KEY];
    if (typeof delegateId !== 'string') {
      throw new Error(`Operation ${operation.operationId} has no concrete provider route`);
    }
    const delegate = this.delegates.get(delegateId);
    if (!delegate) {
      throw new Error(`Provider delegate "${delegateId}" is not configured`);
    }
    return delegate;
  }

  private wrap(operation: ProviderOperation, delegateId: string): ProviderOperation {
    return {
      ...operation,
      providerId: this.providerId,
      providerMetadata: {
        ...operation.providerMetadata,
        [DELEGATE_PROVIDER_KEY]: delegateId,
      },
    };
  }

  private unwrap(operation: ProviderOperation, delegateId: string): ProviderOperation {
    return {
      ...operation,
      providerId: delegateId,
    };
  }
}
