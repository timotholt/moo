import type { GenerationOperation } from '../shared/schemas/generation-operation.schema.js';
import { GenerationOperationStore } from './generation-operation-store.js';
import { GeneratorRegistry } from './generators/registry.js';
import type { GeneratedAsset, ProviderOperation } from './generators/types.js';

export interface ReconciliationTakeInput {
  operation: GenerationOperation;
  providerOperation: ProviderOperation;
  asset: GeneratedAsset;
}

/** Creates the durable local take record and returns its ID. */
export type CreateDownloadedTake = (input: ReconciliationTakeInput) => Promise<string>;

export interface GenerationReconcilerOptions {
  generationJobId?: string;
}

export interface ReconciliationOperationError {
  operationId: string;
  provider: string;
  message: string;
}

export interface ReconciliationSummary {
  eligible: number;
  polled: number;
  harvested: number;
  failed: number;
  errors: ReconciliationOperationError[];
}

/**
 * Resumes provider-side generation after a restart. It deliberately performs
 * only one poll per submitted/processing operation, leaving any continuing
 * work in the ledger for the next pass. A missing local generator is reported
 * without changing the remote operation's durable status.
 */
export class GenerationReconciler {
  constructor(
    private readonly operationStore: GenerationOperationStore,
    private readonly generators: GeneratorRegistry,
    private readonly createDownloadedTake: CreateDownloadedTake,
  ) {}

  async reconcile(options: GenerationReconcilerOptions = {}): Promise<ReconciliationSummary> {
    const operations = await this.operationStore.listForRestartReconciliation({
      generationJobId: options.generationJobId,
    });
    const summary: ReconciliationSummary = {
      eligible: operations.length,
      polled: 0,
      harvested: 0,
      failed: 0,
      errors: [],
    };

    for (const operation of operations) {
      const generator = this.generators.get(operation.provider);
      if (!generator) {
        summary.errors.push({
          operationId: operation.id,
          provider: operation.provider,
          message: `Generator "${operation.provider}" is not configured; provider work remains recoverable.`,
        });
        continue;
      }

      let providerOperation = this.toProviderOperation(operation);
      let persistedOperation = operation;

      if (operation.status === 'submitted' || operation.status === 'processing') {
        try {
          providerOperation = await generator.poll(providerOperation);
          summary.polled += 1;
          persistedOperation = await this.operationStore.update(operation.id, {
            status: providerOperation.status,
            provider_metadata: providerOperation.providerMetadata,
            error: providerOperation.error,
            last_polled_at: new Date().toISOString(),
          });
        } catch (error) {
          summary.errors.push({
            operationId: operation.id,
            provider: operation.provider,
            message: this.errorMessage(error),
          });
          continue;
        }
      }

      if (persistedOperation.status === 'failed') {
        summary.failed += 1;
        continue;
      }
      if (persistedOperation.status !== 'completed' || persistedOperation.downloaded_take_id) continue;

      try {
        const completedOperation = this.toProviderOperation(persistedOperation);
        const asset = await generator.download(completedOperation);
        const takeId = await this.createDownloadedTake({
          operation: persistedOperation,
          providerOperation: completedOperation,
          asset,
        });
        await this.operationStore.update(persistedOperation.id, { downloaded_take_id: takeId });
        summary.harvested += 1;
      } catch (error) {
        summary.errors.push({
          operationId: operation.id,
          provider: operation.provider,
          message: this.errorMessage(error),
        });
      }
    }

    return summary;
  }

  private toProviderOperation(operation: GenerationOperation): ProviderOperation {
    return {
      providerId: operation.provider,
      operationId: operation.provider_operation_id,
      requestId: operation.request_id,
      status: operation.status,
      providerMetadata: operation.provider_metadata,
      error: operation.error,
    };
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
