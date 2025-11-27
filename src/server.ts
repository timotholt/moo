import Fastify from 'fastify';
import path, { join } from 'path';
import { fileURLToPath } from 'url';
import { getProjectPaths } from './utils/paths.js';
import { appendJsonl, ensureJsonlFile, readJsonl } from './utils/jsonl.js';
import type { Actor, Content, Take, GenerationJob, Section } from './types/index.js';
import { runBatchGeneration } from './services/generation.js';
import { generateId } from './utils/ids.js';
import { validate } from './utils/validation.js';
import { getAudioProvider } from './services/provider-factory.js';

const __filename = fileURLToPath(import.meta.url);

const fastify = Fastify({
  logger: false,
});

function getProjectRoot(): string {
  return process.cwd();
}

fastify.get('/api/health', async () => {
  return { status: 'ok' };
});

fastify.get('/api/actors', async () => {
  const projectRoot = getProjectRoot();
  const paths = getProjectPaths(projectRoot);
  const actors = await readJsonl<Actor>(paths.catalog.actors);
  return { actors };
});

fastify.post('/api/actors', async (request, reply) => {
  const projectRoot = getProjectRoot();
  const paths = getProjectPaths(projectRoot);
  await ensureJsonlFile(paths.catalog.actors);

  const body = request.body as Partial<Actor> | undefined;
  const now = new Date().toISOString();

  // Load global defaults
  const defaultsPath = join(paths.root, 'defaults.json');
  let globalDefaults: Record<string, Record<string, unknown>> = {
    dialogue: { provider: 'elevenlabs', batch_generate: 1, approval_count_default: 1, stability: 0.5, similarity_boost: 0.75 },
    music: { provider: 'elevenlabs', batch_generate: 1, approval_count_default: 1 },
    sfx: { provider: 'elevenlabs', batch_generate: 1, approval_count_default: 1 },
  };

  try {
    const fs = await import('fs-extra').then(m => m.default);
    if (await fs.pathExists(defaultsPath)) {
      globalDefaults = await fs.readJson(defaultsPath);
    }
  } catch (err) {
    fastify.log.warn(err, 'Failed to load global defaults, using hardcoded values');
  }

  const actor: Actor = {
    id: generateId(),
    display_name: body?.display_name ?? 'New Actor',
    base_filename:
      body?.base_filename ??
      `${(body?.display_name ?? 'actor')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')}_`,
    all_approved: false,
    provider_settings:
      (body?.provider_settings as Actor['provider_settings']) ?? globalDefaults,
    notes: body?.notes ?? '',
    created_at: now,
    updated_at: now,
  };

  const validation = validate('actor', actor);
  if (!validation.valid) {
    reply.code(400);
    return { error: 'Invalid actor', details: validation.errors };
  }

  await appendJsonl(paths.catalog.actors, actor);
  return { actor };
});

fastify.put('/api/actors/:id', async (request, reply) => {
  const projectRoot = getProjectRoot();
  const paths = getProjectPaths(projectRoot);
  
  const { id } = request.params as { id: string };
  const body = request.body as Partial<Actor>;
  
  if (!body) {
    reply.code(400);
    return { error: 'Request body is required' };
  }

  const actors = await readJsonl<Actor>(paths.catalog.actors);
  const actorIndex = actors.findIndex(a => a.id === id);
  
  if (actorIndex === -1) {
    reply.code(404);
    return { error: 'Actor not found' };
  }

  // Update the actor with new data
  const updatedActor: Actor = {
    ...actors[actorIndex],
    ...body,
    id, // Ensure ID doesn't change
    updated_at: new Date().toISOString(),
  };

  // Validate the updated actor
  const validation = validate('actor', updatedActor);
  if (!validation.valid) {
    reply.code(400);
    return { error: 'Invalid actor data', details: validation.errors };
  }

  // Replace the actor in the array
  actors[actorIndex] = updatedActor;

  // Write back to file
  await ensureJsonlFile(paths.catalog.actors);
  await import('fs-extra').then(async (fsMod) => {
    const fs = fsMod.default;
    await fs.writeFile(
      paths.catalog.actors,
      actors.map((a) => JSON.stringify(a)).join('\n') + (actors.length ? '\n' : ''),
      'utf8',
    );
  });

  return { actor: updatedActor };
});

fastify.delete('/api/actors/:id', async (request, reply) => {
  const projectRoot = getProjectRoot();
  const paths = getProjectPaths(projectRoot);

  const { id } = request.params as { id: string };

  const actors = await readJsonl<Actor>(paths.catalog.actors);
  const contentItems = await readJsonl<Content>(paths.catalog.content);
  const takes = await readJsonl<Take>(paths.catalog.takes);

  const remainingActors = actors.filter((a) => a.id !== id);
  const removedContent = contentItems.filter((c) => c.actor_id === id);
  const removedContentIds = new Set(removedContent.map((c) => c.id));
  const remainingContent = contentItems.filter((c) => c.actor_id !== id);
  const remainingTakes = takes.filter((t) => !removedContentIds.has(t.content_id));

  await ensureJsonlFile(paths.catalog.actors);
  await ensureJsonlFile(paths.catalog.content);
  await ensureJsonlFile(paths.catalog.takes);

  await fastify.log.debug?.({ id }, 'Deleting actor and related content/takes');

  await fastify.log.debug?.({ remainingActors: remainingActors.length }, 'Actors after delete');

  await import('fs-extra').then(async (fsMod) => {
    const fs = fsMod.default;
    await fs.writeFile(
      paths.catalog.actors,
      remainingActors.map((a) => JSON.stringify(a)).join('\n') + (remainingActors.length ? '\n' : ''),
      'utf8',
    );
    await fs.writeFile(
      paths.catalog.content,
      remainingContent.map((c) => JSON.stringify(c)).join('\n') + (remainingContent.length ? '\n' : ''),
      'utf8',
    );
    await fs.writeFile(
      paths.catalog.takes,
      remainingTakes.map((t) => JSON.stringify(t)).join('\n') + (remainingTakes.length ? '\n' : ''),
      'utf8',
    );
  });

  reply.code(204);
  return null;
});

fastify.get('/api/content', async (request) => {
  const projectRoot = getProjectRoot();
  const paths = getProjectPaths(projectRoot);
  const contentItems = await readJsonl<Content>(paths.catalog.content);

  const query = request.query as { actorId?: string; type?: string };
  const actorId = query.actorId;
  const type = query.type as Content['content_type'] | undefined;

  const filtered = contentItems.filter((c) => {
    if (actorId && c.actor_id !== actorId) return false;
    if (type && c.content_type !== type) return false;
    return true;
  });

  return { content: filtered };
});

fastify.post('/api/content', async (request, reply) => {
  const projectRoot = getProjectRoot();
  const paths = getProjectPaths(projectRoot);
  await ensureJsonlFile(paths.catalog.content);

  const body = request.body as {
    actor_id: string;
    content_type: Content['content_type'];
    item_id: string;
    prompt?: string;
    tags?: string[];
  } | null;

  if (!body || !body.actor_id || !body.content_type || !body.item_id) {
    reply.code(400);
    return { error: 'actor_id, content_type, and item_id are required' };
  }

  const now = new Date().toISOString();

  // Support batch creation by splitting comma-separated item_ids
  const allItemIds = body.item_id.split(',').map(id => id.trim()).filter(id => id.length > 0);
  
  if (allItemIds.length === 0) {
    reply.code(400);
    return { error: 'At least one valid item_id is required' };
  }

  // Check for existing content and filter out duplicates
  const existingContent = await readJsonl<Content>(paths.catalog.content);
  const existingItemIds = new Set(
    existingContent
      .filter(c => c.actor_id === body.actor_id && c.content_type === body.content_type)
      .map(c => c.item_id)
  );
  
  const itemIds = allItemIds.filter(id => !existingItemIds.has(id));
  const duplicateIds = allItemIds.filter(id => existingItemIds.has(id));
  
  if (itemIds.length === 0) {
    reply.code(400);
    return { error: 'All provided item_ids already exist for this actor and content type', duplicates: duplicateIds };
  }

  const createdContent: Content[] = [];

  for (const itemId of itemIds) {
    const content: Content = {
      id: generateId(),
      actor_id: body.actor_id,
      content_type: body.content_type,
      item_id: itemId,
      prompt: body.prompt || '',
      complete: false,
      all_approved: false,
      tags: body.tags ?? [],
      created_at: now,
      updated_at: now,
    };

    const validation = validate('content', content);
    if (!validation.valid) {
      reply.code(400);
      return { error: `Invalid content for item_id "${itemId}"`, details: validation.errors };
    }

    await appendJsonl(paths.catalog.content, content);
    createdContent.push(content);
  }

  // Return the first item for single creation, or array for batch
  const result: { content: Content | Content[]; duplicates_skipped?: string[]; message?: string } = itemIds.length === 1 ? { content: createdContent[0] } : { content: createdContent };
  
  // Include information about duplicates if any were skipped
  if (duplicateIds.length > 0) {
    result.duplicates_skipped = duplicateIds;
    result.message = `Created ${itemIds.length} items. Skipped ${duplicateIds.length} duplicates: ${duplicateIds.join(', ')}`;
  }
  
  return result;
});

fastify.delete('/api/content/:id', async (request, reply) => {
  const projectRoot = getProjectRoot();
  const paths = getProjectPaths(projectRoot);

  const { id } = request.params as { id: string };

  const contentItems = await readJsonl<Content>(paths.catalog.content);
  const takes = await readJsonl<Take>(paths.catalog.takes);

  const remainingContent = contentItems.filter((c) => c.id !== id);
  const remainingTakes = takes.filter((t) => t.content_id !== id);

  await ensureJsonlFile(paths.catalog.content);
  await ensureJsonlFile(paths.catalog.takes);

  await import('fs-extra').then(async (fsMod) => {
    const fs = fsMod.default;
    await fs.writeFile(
      paths.catalog.content,
      remainingContent.map((c) => JSON.stringify(c)).join('\n') + (remainingContent.length ? '\n' : ''),
      'utf8',
    );
    await fs.writeFile(
      paths.catalog.takes,
      remainingTakes.map((t) => JSON.stringify(t)).join('\n') + (remainingTakes.length ? '\n' : ''),
      'utf8',
    );
  });

  reply.code(204);
  return null;
});

fastify.get('/api/takes', async (request) => {
  const projectRoot = getProjectRoot();
  const paths = getProjectPaths(projectRoot);
  const takes = await readJsonl<Take>(paths.catalog.takes);

  const query = request.query as { contentId?: string };
  const contentId = query.contentId;

  const filtered = contentId ? takes.filter((t) => t.content_id === contentId) : takes;

  return { takes: filtered };
});

fastify.get('/api/voices', async (request, reply) => {
  try {
    const projectRoot = getProjectRoot();
    const provider = await getAudioProvider(projectRoot);
    const voices = await provider.getVoices();
    return { voices };
  } catch (error) {
    fastify.log.error(error);
    reply.code(500);
    
    // Pass through specific error details for better client-side handling
    let errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('missing_permissions') || errorMessage.includes('voices_read')) {
      errorMessage = 'ElevenLabs API key is missing voices_read permission';
    }
    
    return { error: 'Failed to fetch voices', details: errorMessage };
  }
});

// In-memory cache for voice previews
const voicePreviewCache = new Map<string, string>();

fastify.post('/api/voices/preview', async (request, reply) => {
  try {
    const projectRoot = getProjectRoot();
    const provider = await getAudioProvider(projectRoot);
    
    const body = request.body as {
      voice_id: string;
      text?: string;
      stability?: number;
      similarity_boost?: number;
    };

    if (!body.voice_id) {
      reply.code(400);
      return { error: 'voice_id is required' };
    }

    const sampleText = body.text || "The quick brown fox jumps over the lazy dog!";
    const settings = {
      stability: body.stability || 0.5,
      similarity_boost: body.similarity_boost || 0.75
    };

    // Create cache key based on voice and settings
    const cacheKey = `${body.voice_id}-${settings.stability}-${settings.similarity_boost}-${sampleText}`;
    
    // Check if we have cached audio
    let base64Audio = voicePreviewCache.get(cacheKey);
    
    if (!base64Audio) {
      // Generate new audio and cache it
      fastify.log.info(`Generating new voice preview for voice: ${body.voice_id}`);
      const audioBuffer = await provider.generateDialogue(sampleText, body.voice_id, settings);
      base64Audio = audioBuffer.toString('base64');
      voicePreviewCache.set(cacheKey, base64Audio);
    } else {
      fastify.log.info(`Using cached voice preview for voice: ${body.voice_id}`);
    }
    
    return { 
      audio: base64Audio,
      format: 'mp3',
      text: sampleText
    };
  } catch (error) {
    fastify.log.error(error);
    reply.code(500);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { error: 'Failed to generate voice preview', details: errorMessage };
  }
});

fastify.get('/api/sections', async () => {
  const projectRoot = getProjectRoot();
  const paths = getProjectPaths(projectRoot);
  const sections = await readJsonl<Section>(paths.catalog.sections);
  return { sections };
});

fastify.post('/api/sections', async (request, reply) => {
  const projectRoot = getProjectRoot();
  const paths = getProjectPaths(projectRoot);
  await ensureJsonlFile(paths.catalog.sections);

  const body = request.body as {
    actor_id: string;
    content_type: 'dialogue' | 'music' | 'sfx';
    name?: string;
  };
  
  if (!body || !body.actor_id || !body.content_type) {
    reply.code(400);
    return { error: 'actor_id and content_type are required' };
  }

  const now = new Date().toISOString();
  const section: Section = {
    id: `${body.actor_id}-${body.content_type}`,
    actor_id: body.actor_id,
    content_type: body.content_type,
    name: body.name,
    created_at: now,
    updated_at: now,
  };

  await appendJsonl(paths.catalog.sections, section);
  return { section };
});

fastify.put('/api/sections/:id', async (request, reply) => {
  const projectRoot = getProjectRoot();
  const paths = getProjectPaths(projectRoot);
  
  const { id } = request.params as { id: string };
  const body = request.body as Partial<Section>;
  
  if (!body) {
    reply.code(400);
    return { error: 'Request body is required' };
  }

  const sections = await readJsonl<Section>(paths.catalog.sections);
  const sectionIndex = sections.findIndex(s => s.id === id);
  
  if (sectionIndex === -1) {
    reply.code(404);
    return { error: 'Section not found' };
  }

  // Check for duplicate section names if name is being updated
  if (body.name) {
    const currentSection = sections[sectionIndex];
    const duplicateSection = sections.find(s => 
      s.id !== id && 
      s.actor_id === currentSection.actor_id && 
      s.name === body.name
    );
    
    if (duplicateSection) {
      reply.code(400);
      return { error: `A section with the name "${body.name}" already exists for this actor` };
    }
  }

  // Update the section with new data
  const updatedSection: Section = {
    ...sections[sectionIndex],
    ...body,
    id, // Ensure ID doesn't change
    updated_at: new Date().toISOString(),
  };

  // Replace the section in the array
  sections[sectionIndex] = updatedSection;

  // Write back to file
  await ensureJsonlFile(paths.catalog.sections);
  await import('fs-extra').then(async (fsMod) => {
    const fs = fsMod.default;
    await fs.writeFile(
      paths.catalog.sections,
      sections.map((s) => JSON.stringify(s)).join('\n') + (sections.length ? '\n' : ''),
      'utf8',
    );
  });

  return { section: updatedSection };
});

fastify.delete('/api/sections/:id', async (request, reply) => {
  const projectRoot = getProjectRoot();
  const paths = getProjectPaths(projectRoot);

  const { id } = request.params as { id: string };

  const sections = await readJsonl<Section>(paths.catalog.sections);
  const contentItems = await readJsonl<Content>(paths.catalog.content);
  const takes = await readJsonl<Take>(paths.catalog.takes);

  // Find the section to get actor_id and content_type
  const section = sections.find(s => s.id === id);
  if (!section) {
    reply.code(404);
    return { error: 'Section not found' };
  }

  // Remove section
  const remainingSections = sections.filter(s => s.id !== id);
  
  // Remove all content in this section
  const removedContent = contentItems.filter(c => 
    c.actor_id === section.actor_id && c.content_type === section.content_type
  );
  const removedContentIds = new Set(removedContent.map(c => c.id));
  const remainingContent = contentItems.filter(c => !removedContentIds.has(c.id));
  
  // Remove all takes for removed content
  const remainingTakes = takes.filter(t => !removedContentIds.has(t.content_id));

  await ensureJsonlFile(paths.catalog.sections);
  await ensureJsonlFile(paths.catalog.content);
  await ensureJsonlFile(paths.catalog.takes);

  await import('fs-extra').then(async (fsMod) => {
    const fs = fsMod.default;
    await fs.writeFile(
      paths.catalog.sections,
      remainingSections.map(s => JSON.stringify(s)).join('\n') + (remainingSections.length ? '\n' : ''),
      'utf8',
    );
    await fs.writeFile(
      paths.catalog.content,
      remainingContent.map(c => JSON.stringify(c)).join('\n') + (remainingContent.length ? '\n' : ''),
      'utf8',
    );
    await fs.writeFile(
      paths.catalog.takes,
      remainingTakes.map(t => JSON.stringify(t)).join('\n') + (remainingTakes.length ? '\n' : ''),
      'utf8',
    );
  });

  reply.code(204);
  return null;
});

fastify.put('/api/content/:id', async (request, reply) => {
  const projectRoot = getProjectRoot();
  const paths = getProjectPaths(projectRoot);
  
  const { id } = request.params as { id: string };
  const body = request.body as Partial<Content>;
  
  if (!body) {
    reply.code(400);
    return { error: 'Request body is required' };
  }

  const contentItems = await readJsonl<Content>(paths.catalog.content);
  const contentIndex = contentItems.findIndex(c => c.id === id);
  
  if (contentIndex === -1) {
    reply.code(404);
    return { error: 'Content not found' };
  }

  // Update the content with new data
  const updatedContent: Content = {
    ...contentItems[contentIndex],
    ...body,
    id, // Ensure ID doesn't change
    updated_at: new Date().toISOString(),
  };

  // Validate the updated content
  const validation = validate('content', updatedContent);
  if (!validation.valid) {
    reply.code(400);
    return { error: 'Invalid content data', details: validation.errors };
  }

  // Replace the content in the array
  contentItems[contentIndex] = updatedContent;

  // Write back to file
  await ensureJsonlFile(paths.catalog.content);
  await import('fs-extra').then(async (fsMod) => {
    const fs = fsMod.default;
    await fs.writeFile(
      paths.catalog.content,
      contentItems.map(c => JSON.stringify(c)).join('\n') + (contentItems.length ? '\n' : ''),
      'utf8',
    );
  });

  return { content: updatedContent };
});

fastify.put('/api/takes/:id', async (request, reply) => {
  const projectRoot = getProjectRoot();
  const paths = getProjectPaths(projectRoot);
  
  const { id } = request.params as { id: string };
  const body = request.body as Partial<Take>;
  
  if (!body) {
    reply.code(400);
    return { error: 'Request body is required' };
  }

  const takes = await readJsonl<Take>(paths.catalog.takes);
  const takeIndex = takes.findIndex(t => t.id === id);
  
  if (takeIndex === -1) {
    reply.code(404);
    return { error: 'Take not found' };
  }

  // Update the take with new data
  const updatedTake: Take = {
    ...takes[takeIndex],
    ...body,
    id, // Ensure ID doesn't change
    updated_at: new Date().toISOString(),
  };

  // Replace the take in the array
  takes[takeIndex] = updatedTake;

  // Write back to file
  await ensureJsonlFile(paths.catalog.takes);
  await import('fs-extra').then(async (fsMod) => {
    const fs = fsMod.default;
    await fs.writeFile(
      paths.catalog.takes,
      takes.map(t => JSON.stringify(t)).join('\n') + (takes.length ? '\n' : ''),
      'utf8',
    );
  });

  return { take: updatedTake };
});

fastify.get('/api/jobs', async () => {
  const projectRoot = getProjectRoot();
  const paths = getProjectPaths(projectRoot);
  const jobs = await readJsonl<GenerationJob>(paths.catalog.generationJobs);
  return { jobs };
});

// Global defaults endpoints
fastify.get('/api/defaults', async () => {
  const projectRoot = getProjectRoot();
  const paths = getProjectPaths(projectRoot);
  const defaultsPath = join(paths.root, 'defaults.json');
  
  try {
    const fs = await import('fs-extra').then(m => m.default);
    
    if (await fs.pathExists(defaultsPath)) {
      const defaults = await fs.readJson(defaultsPath);
      return { defaults };
    } else {
      // Return hardcoded defaults if no file exists
      const defaults = {
        dialogue: { 
          provider: 'elevenlabs', 
          batch_generate: 1, 
          approval_count_default: 1, 
          stability: 0.5, 
          similarity_boost: 0.75 
        },
        music: { 
          provider: 'elevenlabs', 
          batch_generate: 1, 
          approval_count_default: 1 
        },
        sfx: { 
          provider: 'elevenlabs', 
          batch_generate: 1, 
          approval_count_default: 1 
        }
      };
      return { defaults };
    }
  } catch (err) {
    fastify.log.error(err, 'Failed to read defaults');
    throw new Error('Failed to read defaults');
  }
});

fastify.put('/api/defaults/:contentType', async (request, reply) => {
  const projectRoot = getProjectRoot();
  const paths = getProjectPaths(projectRoot);
  const defaultsPath = join(paths.root, 'defaults.json');
  const contentType = (request.params as { contentType: string }).contentType as 'dialogue' | 'music' | 'sfx';
  const body = request.body as Record<string, unknown>;

  if (!['dialogue', 'music', 'sfx'].includes(contentType)) {
    return reply.status(400).send({ error: 'Invalid content type' });
  }

  try {
    const fs = await import('fs-extra').then(m => m.default);
    
    // Read existing defaults or create new ones
    let defaults: Record<string, Record<string, unknown>> = {};
    if (await fs.pathExists(defaultsPath)) {
      defaults = await fs.readJson(defaultsPath);
    } else {
      defaults = {
        dialogue: { 
          provider: 'elevenlabs', 
          batch_generate: 1, 
          approval_count_default: 1, 
          stability: 0.5, 
          similarity_boost: 0.75 
        },
        music: { 
          provider: 'elevenlabs', 
          batch_generate: 1, 
          approval_count_default: 1 
        },
        sfx: { 
          provider: 'elevenlabs', 
          batch_generate: 1, 
          approval_count_default: 1 
        }
      };
    }

    // Update the specific content type
    defaults[contentType] = { ...defaults[contentType], ...body };

    // Write back to file
    await fs.writeJson(defaultsPath, defaults, { spaces: 2 });

    return { defaults };
  } catch (err) {
    fastify.log.error(err, 'Failed to update defaults');
    throw new Error('Failed to update defaults');
  }
});

fastify.post('/api/generation/batch', async (request, reply) => {
  const projectRoot = getProjectRoot();
  const body = request.body as {
    actorId?: string;
    contentType?: 'dialogue' | 'music' | 'sfx';
    dryRun?: boolean;
  } | undefined;

  try {
    const { job } = await runBatchGeneration(projectRoot, {
      actorId: body?.actorId,
      contentType: body?.contentType,
      dryRun: !!body?.dryRun,
    });

    return { job };
  } catch (err) {
    request.log.error(err);
    reply.code(500);
    return { error: (err as Error).message };
  }
});

async function start() {
  try {
    const port = 3000;
    const host = '127.0.0.1';
    await fastify.listen({ port, host });
    console.log(`VOF API server listening on http://${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

// When this module is executed directly (e.g. via `tsx src/server.ts` or `pnpm dev`),
// start the Fastify server immediately.
void start();

export { fastify, start };
