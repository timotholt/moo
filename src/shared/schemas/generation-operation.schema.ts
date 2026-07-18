import { z } from 'zod';
import { IdSchema, TimestampSchema } from './common.schema.js';

/**
 * A persisted provider-side generation operation.  This is deliberately
 * independent from the current audio generation runner: future adapters can
 * submit work, resume polling after a restart, and attach a downloaded take.
 */
export const GenerationAssetKindSchema = z.enum(['dialogue', 'music', 'sfx', 'image', 'video']);
export const GenerationOperationStatusSchema = z.enum(['submitted', 'processing', 'completed', 'failed']);
export const VideoAspectRatioSchema = z.enum(['16:9', '9:16']);

export const RequestedDeliveryProfileSchema = z.object({
  /** A provider-facing named profile, e.g. "social-vertical" or "hd". */
  name: z.string().min(1).max(120).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration_sec: z.number().positive().optional(),
  fps: z.number().positive().optional(),
  format: z.string().min(1).max(32).optional(),
  /** Image alpha is part of the durable delivery contract and recovery path. */
  transparency: z.boolean().optional(),
  /** Required for video so the requested orientation is durable and testable. */
  video_aspect_ratio: VideoAspectRatioSchema.optional(),
}).strict();

export const GenerationOperationSchema = z.object({
  id: IdSchema,
  generation_job_id: IdSchema,
  media_id: IdSchema,
  asset_kind: GenerationAssetKindSchema,
  request_id: IdSchema,
  /** Provider names remain open so new adapters do not require schema churn. */
  provider: z.string().min(1).max(80),
  provider_operation_id: z.string().min(1).max(255),
  provider_metadata: z.record(z.string(), z.unknown()).optional(),
  status: GenerationOperationStatusSchema,
  progress: z.number().min(0).max(1).optional(),
  requested_delivery_profile: RequestedDeliveryProfileSchema.optional(),
  submitted_at: TimestampSchema,
  last_polled_at: TimestampSchema.optional(),
  completed_at: TimestampSchema.optional(),
  failed_at: TimestampSchema.optional(),
  error: z.string().min(1).max(4000).optional(),
  downloaded_take_id: IdSchema.optional(),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
}).strict().superRefine((operation, context) => {
  if (operation.status === 'completed' && !operation.completed_at) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['completed_at'],
      message: 'Completed operations require completed_at.',
    });
  }
  if (operation.status === 'failed' && !operation.failed_at) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['failed_at'],
      message: 'Failed operations require failed_at.',
    });
  }
  if (operation.status !== 'failed' && operation.error) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['error'],
      message: 'Only failed operations may have an error.',
    });
  }
});

export const CreateGenerationOperationSchema = z.object({
  generation_job_id: IdSchema,
  media_id: IdSchema,
  asset_kind: GenerationAssetKindSchema,
  request_id: IdSchema,
  provider: z.string().min(1).max(80),
  provider_operation_id: z.string().min(1).max(255),
  provider_metadata: z.record(z.string(), z.unknown()).optional(),
  requested_delivery_profile: RequestedDeliveryProfileSchema.optional(),
  submitted_at: TimestampSchema.optional(),
  status: GenerationOperationStatusSchema.optional(),
  progress: z.number().min(0).max(1).optional(),
  error: z.string().min(1).max(4000).optional(),
}).strict();

export const UpdateGenerationOperationSchema = z.object({
  status: GenerationOperationStatusSchema.optional(),
  progress: z.number().min(0).max(1).optional(),
  last_polled_at: TimestampSchema.optional(),
  completed_at: TimestampSchema.optional(),
  failed_at: TimestampSchema.optional(),
  error: z.string().min(1).max(4000).optional(),
  provider_metadata: z.record(z.string(), z.unknown()).optional(),
  downloaded_take_id: IdSchema.optional(),
}).strict();

export type GenerationAssetKind = z.infer<typeof GenerationAssetKindSchema>;
export type GenerationOperationStatus = z.infer<typeof GenerationOperationStatusSchema>;
export type VideoAspectRatio = z.infer<typeof VideoAspectRatioSchema>;
export type RequestedDeliveryProfile = z.infer<typeof RequestedDeliveryProfileSchema>;
export type GenerationOperation = z.infer<typeof GenerationOperationSchema>;
export type CreateGenerationOperationInput = z.infer<typeof CreateGenerationOperationSchema>;
export type UpdateGenerationOperationInput = z.infer<typeof UpdateGenerationOperationSchema>;
