import { z } from 'zod';
import {
  ActorSchema,
  SceneSchema,
  BinSchema,
  MediaSchema,
  TakeSchema,
  DefaultsSchema
} from '../../shared/schemas/index.js';

export async function fetchJson(path: string): Promise<any> {
  const res = await fetch(path);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request failed ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Actors
 */
export async function getActors() {
  const data = await fetchJson('/api/actors');
  return {
    actors: z.array(ActorSchema).parse(data.actors)
  };
}

export async function createActor(payload: any) {
  const res = await fetch('/api/actors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
  if (!res.ok) throw new Error(`Failed to create actor: ${await res.text()}`);
  const data = (await res.json()) as any;
  return {
    actor: ActorSchema.parse(data.actor),
    actors: data.actors ? z.array(ActorSchema).parse(data.actors) : undefined,
    duplicates_skipped: data.duplicates_skipped as string[] | undefined,
    message: data.message as string | undefined
  };
}

export async function updateActor(id: string, payload: any) {
  const res = await fetch(`/api/actors/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to update actor: ${await res.text()}`);
  const data = (await res.json()) as any;
  return { actor: ActorSchema.parse(data.actor) };
}

export async function deleteActor(id: string) {
  const res = await fetch(`/api/actors/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error(`Failed to delete actor`);
}

/**
 * Scenes
 */
export async function getScenes() {
  const data = await fetchJson('/api/scenes');
  return {
    scenes: z.array(SceneSchema).parse(data.scenes)
  };
}

export async function createScene(payload: any) {
  const res = await fetch('/api/scenes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to create scene`);
  const data = (await res.json()) as any;
  return { scene: SceneSchema.parse(data.scene) };
}

export async function updateScene(id: string, payload: any) {
  const res = await fetch(`/api/scenes/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to update scene`);
  const data = (await res.json()) as any;
  return { scene: SceneSchema.parse(data.scene) };
}

export async function deleteScene(id: string) {
  const res = await fetch(`/api/scenes/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error(`Failed to delete scene`);
}

/**
 * Bins
 */
export async function getBins() {
  const data = await fetchJson('/api/bins');
  return {
    bins: z.array(BinSchema).parse(data.bins)
  };
}

export async function createBin(payload: any) {
  const res = await fetch('/api/bins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to create bin`);
  const data = (await res.json()) as any;
  return { bin: BinSchema.parse(data.bin) };
}

export async function updateBin(id: string, payload: any) {
  const res = await fetch(`/api/bins/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to update bin`);
  const data = (await res.json()) as any;
  return { bin: BinSchema.parse(data.bin) };
}

export async function deleteBin(id: string) {
  const res = await fetch(`/api/bins/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error(`Failed to delete bin`);
}

/**
 * Media
 */
export async function getMedia(params: { ownerId?: string, ownerType?: string, type?: string, binId?: string } = {}) {
  const urlParams = new URLSearchParams();
  if (params.ownerId) urlParams.set('ownerId', params.ownerId);
  if (params.ownerType) urlParams.set('ownerType', params.ownerType);
  if (params.type) urlParams.set('type', params.type);
  if (params.binId) urlParams.set('binId', params.binId);

  const data = await fetchJson(`/api/media${urlParams.toString() ? '?' + urlParams : ''}`);
  return {
    media: z.array(MediaSchema).parse(data.media)
  };
}

export async function createMedia(payload: any) {
  const res = await fetch('/api/media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to create media`);
  const data = (await res.json()) as any;
  return {
    media: Array.isArray(data.media)
      ? z.array(MediaSchema).parse(data.media)
      : MediaSchema.parse(data.media),
    duplicates_skipped: data.duplicates_skipped as string[] | undefined,
    message: data.message as string | undefined
  };
}

export async function updateMedia(id: string, payload: any) {
  const res = await fetch(`/api/media/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to update media`);
  const data = (await res.json()) as any;
  return { media: MediaSchema.parse(data.media) };
}

export async function deleteMedia(id: string) {
  const res = await fetch(`/api/media/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error(`Failed to delete media`);
}

/**
 * Takes
 */
export async function getTakes(mediaId?: string) {
  const params = mediaId ? `?mediaId=${encodeURIComponent(mediaId)}` : '';
  const data = await fetchJson(`/api/takes${params}`);
  return {
    takes: z.array(TakeSchema).parse(data.takes)
  };
}

export async function updateTake(id: string, payload: any) {
  const res = await fetch(`/api/takes/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to update take`);
  const data = (await res.json()) as any;
  return { take: TakeSchema.parse(data.take) };
}

export async function deleteTake(id: string) {
  const res = await fetch(`/api/takes/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error(`Failed to delete take`);
}

export async function generateTakes(mediaId: string, count = 1) {
  const res = await fetch(`/api/media/${encodeURIComponent(mediaId)}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count }),
  });
  if (!res.ok) throw new Error(`Failed to generate takes`);
  const data = (await res.json()) as any;
  return {
    takes: z.array(TakeSchema).parse(data.takes)
  };
}

/**
 * Defaults
 */
export async function getGlobalDefaults() {
  const data = await fetchJson('/api/defaults');
  return {
    defaults: DefaultsSchema.parse(data.defaults)
  };
}

export async function updateGlobalDefaults(payload: any) {
  const res = await fetch('/api/defaults', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to update defaults`);
  const data = (await res.json()) as any;
  return { defaults: DefaultsSchema.parse(data.defaults) };
}

export async function updateMediaTypeDefaults(mediaType: string, settings: any) {
  const res = await fetch(`/api/defaults/${encodeURIComponent(mediaType)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(`Failed to update media type defaults`);
  const data = (await res.json()) as any;
  return { defaults: DefaultsSchema.parse(data.defaults) };
}

/**
 * Provider & Voices
 */
export function getProviderCredits() {
  return fetchJson('/api/provider/credits');
}

export async function getVoices() {
  return fetchJson('/api/voices');
}

export async function previewVoice(voiceId: string, text: string, stability?: number, similarityBoost?: number, modelId?: string) {
  const res = await fetch('/api/voices/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      voice_id: voiceId,
      text: text,
      stability,
      similarity_boost: similarityBoost,
      model_id: modelId
    }),
  });
  if (!res.ok) throw new Error(`Failed to preview voice`);
  return res.json();
}

/**
 * Projects
 */
export function getProjects() {
  return fetchJson('/api/projects');
}

export async function createProject(name: string) {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Failed to create project`);
  return res.json();
}

export async function deleteProject(name: string) {
  const res = await fetch(`/api/projects/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete project`);
  return res.json();
}

export async function copyProject(name: string, newName: string) {
  const res = await fetch(`/api/projects/${encodeURIComponent(name)}/copy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newName }),
  });
  if (!res.ok) throw new Error(`Failed to copy project`);
  return res.json();
}

export function getCurrentProject() {
  return fetchJson('/api/projects/current');
}

export async function switchProject(name: string) {
  const res = await fetch('/api/projects/switch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Failed to switch project`);
  return res.json();
}

/**
 * Batch operations
 */
export async function previewBackfillTakes(options: { ownerId?: string, ownerType?: string, binId?: string, mediaId?: string } = {}) {
  const params = new URLSearchParams();
  if (options.ownerId) params.set('owner_id', options.ownerId);
  if (options.ownerType) params.set('owner_type', options.ownerType);
  if (options.binId) params.set('bin_id', options.binId);
  if (options.mediaId) params.set('media_id', options.mediaId);

  return fetchJson(`/api/batch/backfill-takes/preview?${params}`);
}

export async function backfillTakes(options: { ownerId?: string, ownerType?: string, binId?: string, mediaId?: string } = {}) {
  const params = new URLSearchParams();
  if (options.ownerId) params.set('owner_id', options.ownerId);
  if (options.ownerType) params.set('owner_type', options.ownerType);
  if (options.binId) params.set('bin_id', options.binId);
  if (options.mediaId) params.set('media_id', options.mediaId);

  const res = await fetch(`/api/batch/backfill-takes?${params}`, { method: 'POST' });
  if (!res.ok) {
    const data = (await res.json()) as any;
    throw new Error(data.error || `Failed to backfill takes`);
  }
  return res.json();
}
