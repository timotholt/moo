import { describe, expect, it, vi } from 'vitest';

import { ProviderFamilyGenerator } from '../src/services/generators/provider-family.js';
import type {
  AssetGenerator,
  GeneratedAsset,
  ProviderOperation,
} from '../src/services/generators/types.js';

function operation(providerId: string, status: ProviderOperation['status'] = 'submitted'): ProviderOperation {
  return {
    providerId,
    operationId: `${providerId}-operation`,
    requestId: 'request-1',
    status,
    providerMetadata: { progress: 0 },
  };
}

function generator(
  providerId: string,
  kind: 'image' | 'video',
  asset: GeneratedAsset,
): AssetGenerator {
  return {
    providerId,
    capabilities: () => ({ providerId, media: { [kind]: { formats: kind === 'image' ? ['png'] : ['mp4'] } } }),
    submit: vi.fn().mockResolvedValue(operation(providerId)),
    poll: vi.fn().mockResolvedValue(operation(providerId, 'completed')),
    download: vi.fn().mockResolvedValue(asset),
  };
}

describe('ProviderFamilyGenerator', () => {
  it('merges capabilities and routes each request to its concrete adapter', async () => {
    const image = generator('openai-image', 'image', {
      bytes: Buffer.from('image'),
      mimeType: 'image/png',
      providerMetadata: {},
    });
    const video = generator('openai-video', 'video', {
      bytes: Buffer.from('video'),
      mimeType: 'video/mp4',
      providerMetadata: {},
    });
    const family = new ProviderFamilyGenerator('openai', [image, video]);

    expect(family.capabilities()).toMatchObject({
      providerId: 'openai',
      media: { image: { formats: ['png'] }, video: { formats: ['mp4'] } },
    });

    const submitted = await family.submit({
      id: 'request-1',
      assetKind: 'video',
      prompt: 'A portrait tracking shot',
    });
    expect(video.submit).toHaveBeenCalledOnce();
    expect(image.submit).not.toHaveBeenCalled();
    expect(submitted).toMatchObject({
      providerId: 'openai',
      providerMetadata: { moo_delegate_provider_id: 'openai-video' },
    });

    const completed = await family.poll(submitted);
    expect(video.poll).toHaveBeenCalledWith(expect.objectContaining({ providerId: 'openai-video' }));
    await expect(family.download(completed)).resolves.toMatchObject({ mimeType: 'video/mp4' });
    expect(video.download).toHaveBeenCalledWith(expect.objectContaining({ providerId: 'openai-video' }));
  });

  it('rejects ambiguous capability ownership and unroutable durable operations', async () => {
    const first = generator('first-image', 'image', { bytes: Buffer.alloc(0), mimeType: 'image/png', providerMetadata: {} });
    const second = generator('second-image', 'image', { bytes: Buffer.alloc(0), mimeType: 'image/png', providerMetadata: {} });
    expect(() => new ProviderFamilyGenerator('google', [first, second])).toThrow('multiple image delegates');

    const family = new ProviderFamilyGenerator('google', [first]);
    await expect(family.poll({
      providerId: 'google',
      operationId: 'lost-route',
      requestId: 'request-1',
      status: 'processing',
    })).rejects.toThrow('no concrete provider route');
  });
});
