import { GenerationOperationSchema, CreateGenerationOperationSchema, UpdateGenerationOperationSchema } from '../shared/schemas/generation-operation.schema.js';
import type {
  CreateGenerationOperationInput,
  GenerationOperation,
  GenerationOperationStatus,
  UpdateGenerationOperationInput,
} from '../shared/schemas/generation-operation.schema.js';
import { getProjectPaths } from '../utils/paths.js';
import { generateId } from '../utils/ids.js';
import { ensureJsonlFile, readJsonl, writeJsonlAll } from '../utils/jsonl.js';

export interface ListGenerationOperationsOptions {
  generationJobId?: string;
  mediaId?: string;
  provider?: string;
  statuses?: GenerationOperationStatus[];
}

export interface RestartReconciliationOptions {
  generationJobId?: string;
}

/**
 * Canonical persistence for provider-side asynchronous work. It deliberately
 * does not submit, poll, or cancel remote operations; callers use it to resume
 * work after restart. Stopping a generation job only stops future submission,
 * so submitted/processing operations always remain reconcilable here.
 */
export class GenerationOperationStore {
  constructor(private readonly projectRoot: string) {}

  private get filePath(): string {
    return getProjectPaths(this.projectRoot).catalog.generationOperations;
  }

  async create(input: CreateGenerationOperationInput): Promise<GenerationOperation> {
    const validated = CreateGenerationOperationSchema.parse(input);
    const now = new Date().toISOString();
    const operation = GenerationOperationSchema.parse({
      ...validated,
      id: generateId(),
      status: validated.status ?? 'submitted',
      submitted_at: validated.submitted_at ?? now,
      created_at: now,
      updated_at: now,
    });
    const operations = await this.readAll();
    if (operations.some((existing) => existing.provider === operation.provider && existing.provider_operation_id === operation.provider_operation_id)) {
      throw new Error(`Provider operation already exists: ${operation.provider}/${operation.provider_operation_id}`);
    }
    operations.push(operation);
    await this.writeAll(operations);
    return operation;
  }

  async update(id: string, changes: UpdateGenerationOperationInput): Promise<GenerationOperation> {
    const validated = UpdateGenerationOperationSchema.parse(changes);
    const operations = await this.readAll();
    const index = operations.findIndex((operation) => operation.id === id);
    if (index < 0) throw new Error('Generation operation not found');

    const previous = operations[index];
    const now = new Date().toISOString();
    const status = validated.status ?? previous.status;
    const updated = GenerationOperationSchema.parse({
      ...previous,
      ...validated,
      status,
      completed_at: status === 'completed' ? validated.completed_at ?? previous.completed_at ?? now : undefined,
      failed_at: status === 'failed' ? validated.failed_at ?? previous.failed_at ?? now : undefined,
      error: status === 'failed' ? validated.error ?? previous.error : undefined,
      updated_at: now,
    });
    operations[index] = updated;
    await this.writeAll(operations);
    return updated;
  }

  async list(options: ListGenerationOperationsOptions = {}): Promise<GenerationOperation[]> {
    const operations = await this.readAll();
    return operations.filter((operation) => {
      if (options.generationJobId && operation.generation_job_id !== options.generationJobId) return false;
      if (options.mediaId && operation.media_id !== options.mediaId) return false;
      if (options.provider && operation.provider !== options.provider) return false;
      if (options.statuses && !options.statuses.includes(operation.status)) return false;
      return true;
    });
  }

  /** Operations to poll/download after a process restart. Terminal records are excluded. */
  async listForRestartReconciliation(options: RestartReconciliationOptions = {}): Promise<GenerationOperation[]> {
    return this.list({
      generationJobId: options.generationJobId,
      statuses: ['submitted', 'processing'],
    });
  }

  private async readAll(): Promise<GenerationOperation[]> {
    await ensureJsonlFile(this.filePath);
    return readJsonl(this.filePath, GenerationOperationSchema);
  }

  private async writeAll(operations: GenerationOperation[]): Promise<void> {
    await ensureJsonlFile(this.filePath);
    await writeJsonlAll(this.filePath, operations, GenerationOperationSchema);
  }
}
