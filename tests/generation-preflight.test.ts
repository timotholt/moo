import { describe, expect, it } from 'vitest';
import { estimateGenerationSpend, summarizePreflight } from '../src/services/generation-preflight.js';

describe('generation preflight', () => {
  it('blocks generation only on blocking prerequisites, not metadata warnings', () => {
    expect(summarizePreflight([
      { id: 'provider', status: 'ready', message: 'configured' },
      { id: 'ffmpeg', status: 'warning', message: 'missing' },
    ])).toMatchObject({ ready: true });
    expect(summarizePreflight([
      { id: 'provider', status: 'blocked', message: 'missing key' },
    ])).toMatchObject({ ready: false });
  });

  it('estimates only the next required dialogue calls and honors Finish Early', () => {
    const base = {
      mediaType: 'dialogue' as const, prompt: 'Hold the line.', approvalTarget: 3, minCandidates: 2, takes: [],
    };
    expect(estimateGenerationSpend(base)).toMatchObject({ takes_to_generate: 3, provider_requests: 3, estimated_characters: 42 });
    expect(estimateGenerationSpend({ ...base, completionOverride: true, takes: [{ status: 'approved' }] as any })).toMatchObject({ takes_to_generate: 0, estimated_characters: 0 });
  });
});
