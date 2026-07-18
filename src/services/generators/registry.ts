import type { AssetGenerator, AssetKind } from './types.js';

/** Small dependency-injected registry; live generation is not wired to it yet. */
export class GeneratorRegistry {
  private readonly generators = new Map<string, AssetGenerator>();

  constructor(generators: Iterable<AssetGenerator> = []) {
    for (const generator of generators) {
      this.register(generator);
    }
  }

  register(generator: AssetGenerator): void {
    this.generators.set(generator.providerId, generator);
  }

  get(providerId: string): AssetGenerator | undefined {
    return this.generators.get(providerId);
  }

  supports(providerId: string, assetKind: AssetKind): boolean {
    return Boolean(this.get(providerId)?.capabilities().media[assetKind]);
  }

  list(): AssetGenerator[] {
    return Array.from(this.generators.values());
  }
}
