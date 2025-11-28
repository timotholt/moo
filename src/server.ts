import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { getProjectPaths } from './utils/paths.js';
import { registerActorRoutes } from './server/routes/actors.js';
import { registerContentRoutes } from './server/routes/content.js';
import { registerTakeRoutes } from './server/routes/takes.js';
import { registerSectionRoutes } from './server/routes/sections.js';
import { registerDefaultsRoutes } from './server/routes/defaults.js';
import { registerProviderRoutes } from './server/routes/provider.js';
import { registerGenerationRoutes } from './server/routes/generation.js';

const fastify = Fastify({
  logger: false,
});

// Serve media files statically
const projectRoot = process.cwd();
const paths = getProjectPaths(projectRoot);
fastify.register(fastifyStatic, {
  root: paths.media,
  prefix: '/media/',
  decorateReply: false,
});

function getProjectRoot(): string {
  return process.cwd();
}

function getProjectContext() {
  const projectRoot = getProjectRoot();
  const paths = getProjectPaths(projectRoot);
  return { projectRoot, paths };
}

fastify.get('/api/health', async () => {
  return { status: 'ok' };
});

// Register all route modules
registerActorRoutes(fastify, getProjectContext);
registerContentRoutes(fastify, getProjectContext);
registerTakeRoutes(fastify, getProjectContext);
registerSectionRoutes(fastify, getProjectContext);
registerDefaultsRoutes(fastify, getProjectContext);
registerProviderRoutes(fastify, getProjectContext);
registerGenerationRoutes(fastify, getProjectContext);

fastify.get('/api/content', async (request) => {
  const { paths } = getProjectContext();
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
  const { paths } = getProjectContext();
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
    // Default prompt to the individual item_id (title-cased) if no custom prompt provided
    const defaultPrompt = itemId.charAt(0).toUpperCase() + itemId.slice(1);
    const content: Content = {
      id: generateId(),
      actor_id: body.actor_id,
      content_type: body.content_type,
      item_id: itemId,
      prompt: body.prompt || defaultPrompt,
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
  const { paths } = getProjectContext();

  const { id } = request.params as { id: string };

  const contentItems = await readJsonl<Content>(paths.catalog.content);
  const takes = await readJsonl<Take>(paths.catalog.takes);

  const remainingContent = contentItems.filter((c) => c.id !== id);
  const remainingTakes = takes.filter((t) => t.content_id !== id);

  await ensureJsonlFile(paths.catalog.content);
  await ensureJsonlFile(paths.catalog.takes);

  await writeJsonlAll(paths.catalog.content, remainingContent);
  await writeJsonlAll(paths.catalog.takes, remainingTakes);

  reply.code(204);
  return null;
});

fastify.get('/api/takes', async (request) => {
  const { paths } = getProjectContext();
  const takes = await readJsonl<Take>(paths.catalog.takes);

  const query = request.query as { contentId?: string };
  const contentId = query.contentId;

  const filtered = contentId ? takes.filter((t) => t.content_id === contentId) : takes;

  return { takes: filtered };
});

fastify.get('/api/voices', async (request, reply) => {
  try {
    const { projectRoot } = getProjectContext();
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
    const { projectRoot } = getProjectContext();
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
  const { paths } = getProjectContext();
  const sections = await readJsonl<Section>(paths.catalog.sections);
  return { sections };
});

fastify.post('/api/sections', async (request, reply) => {
  const { paths } = getProjectContext();
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
  const { paths } = getProjectContext();
  
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
  await writeJsonlAll(paths.catalog.sections, sections);

  return { section: updatedSection };
});

fastify.delete('/api/sections/:id', async (request, reply) => {
  const { paths } = getProjectContext();

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

  await writeJsonlAll(paths.catalog.sections, remainingSections);
  await writeJsonlAll(paths.catalog.content, remainingContent);
  await writeJsonlAll(paths.catalog.takes, remainingTakes);

  reply.code(204);
  return null;
});

fastify.put('/api/content/:id', async (request, reply) => {
  const { paths } = getProjectContext();
  
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
  await writeJsonlAll(paths.catalog.content, contentItems);

  return { content: updatedContent };
});

fastify.put('/api/takes/:id', async (request, reply) => {
  const { paths } = getProjectContext();
  
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
  const now = new Date().toISOString();
  const updatedTake: Take = {
    ...takes[takeIndex],
    ...body,
    id, // Ensure ID doesn't change
    // Track when status changed
    status_changed_at: body.status && body.status !== takes[takeIndex].status ? now : takes[takeIndex].status_changed_at,
    updated_at: now,
  };

  // Replace the take in the array
  takes[takeIndex] = updatedTake;

  // Write back to file
  await writeJsonlAll(paths.catalog.takes, takes);

  return { take: updatedTake };
});

// Delete a take
fastify.delete('/api/takes/:id', async (request, reply) => {
  const { paths } = getProjectContext();
  
  const { id } = request.params as { id: string };

  const takes = await readJsonl<Take>(paths.catalog.takes);
  const takeIndex = takes.findIndex(t => t.id === id);
  
  if (takeIndex === -1) {
    reply.code(404);
    return { error: 'Take not found' };
  }

  const deletedTake = takes[takeIndex];
  
  // Remove the take from the array
  takes.splice(takeIndex, 1);

  // Write back to file
  await ensureJsonlFile(paths.catalog.takes);
  await writeJsonlAll(paths.catalog.takes, takes);

  const fsMod = await import('fs-extra');
  const fs = fsMod.default;

  // Optionally delete the audio file
  try {
    const filePath = join(paths.media, deletedTake.path);
    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath);
    }
  } catch (err) {
    // Log but don't fail if file deletion fails
    console.error('Failed to delete audio file:', err);
  }

  reply.code(204);
  return;
});

fastify.get('/api/jobs', async () => {
  const { paths } = getProjectContext();
  const jobs = await readJsonl<GenerationJob>(paths.catalog.generationJobs);
  return { jobs };
});

// Get provider credits/usage (currently only ElevenLabs)
fastify.get('/api/provider/credits', async (request, reply) => {
  try {
    const { projectRoot } = getProjectContext();
    const provider = await getAudioProvider(projectRoot);
    const quota = await provider.getQuota();

    // ElevenLabs quota is in characters. Approximate remaining credits
    // as remaining characters for now.
    const remaining = Math.max(0, quota.character_limit - quota.character_count);

    return {
      provider: 'elevenlabs',
      character_count: quota.character_count,
      character_limit: quota.character_limit,
      remaining_credits: remaining,
      raw: quota,
    };
  } catch (err) {
    request.log.error(err);
    // If we can't get credits, return a graceful fallback instead of 500
    // so the UI can show "credits unavailable" without logging errors.
    return {
      provider: 'elevenlabs',
      character_count: 0,
      character_limit: 0,
      remaining_credits: null,
      error: (err as Error).message,
    };
  }
});

// Global defaults endpoints
fastify.get('/api/defaults', async (request, reply) => {
  const { paths } = getProjectContext();
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
    // Return structured 500 error so clients can handle it consistently
    reply.code(500);
    return { error: 'Failed to read defaults', details: (err as Error).message };
  }
});

fastify.put('/api/defaults/:contentType', async (request, reply) => {
  const { paths } = getProjectContext();
  const defaultsPath = join(paths.root, 'defaults.json');
  const contentType = (request.params as { contentType: string }).contentType as 'dialogue' | 'music' | 'sfx';
  const body = request.body as Record<string, unknown>;

  if (!['dialogue', 'music', 'sfx'].includes(contentType)) {
    reply.code(400);
    return { error: 'Invalid content type' };
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
    reply.code(500);
    return { error: 'Failed to update defaults', details: (err as Error).message };
  }
});

fastify.post('/api/generation/batch', async (request, reply) => {
  const { projectRoot } = getProjectContext();
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

// Generate takes for a specific content item
fastify.post('/api/content/:id/generate', async (request, reply) => {
  const { projectRoot, paths } = getProjectContext();
  const { id } = request.params as { id: string };
  const body = request.body as { count?: number } | undefined;
  const count = body?.count || 1;

  try {
    // Load content and actor
    const contentItems = await readJsonl<Content>(paths.catalog.content);
    const content = contentItems.find(c => c.id === id);
    if (!content) {
      reply.code(404);
      return { error: 'Content not found' };
    }

    const actors = await readJsonl<Actor>(paths.catalog.actors);
    const actor = actors.find(a => a.id === content.actor_id);
    if (!actor) {
      reply.code(404);
      return { error: 'Actor not found' };
    }

    const provider = await getAudioProvider(projectRoot);
    await ensureJsonlFile(paths.catalog.takes);
    const existingTakes = await readJsonl<Take>(paths.catalog.takes);
    const takesForContent = existingTakes.filter(t => t.content_id === content.id);
    
    // Determine the next take number to use.
    // We never reuse numbers, even if some takes are deleted.
    const maxExistingTakeNumber = takesForContent.reduce((max, t) => Math.max(max, t.take_number), 0);
    const nextFromExisting = maxExistingTakeNumber + 1; // next after any existing takes
    const nextFromContent = content.next_take_number ?? 1; // persisted next number, if any
    let nextTakeNumber = Math.max(nextFromExisting, nextFromContent);

    // Compute the base filename in the same style as the UI's Filenames tab.
    // Prefer an explicitly stored filename; otherwise, derive from actor base, content type, and a safe item_id.
    const actorBase = (actor.base_filename || 'unknown').replace(/_+$/, '');
    const safeItemId = (content.item_id || 'untitled')
      .trim()
      .replace(/\s+/g, '_')
      .toLowerCase();
    const derivedBaseFilename = `${actorBase}_${content.content_type}_${safeItemId}`;
    const baseFilename = (content as any).filename && (content as any).filename.trim().length > 0
      ? (content as any).filename.trim()
      : derivedBaseFilename;

    const generatedTakes: Take[] = [];

    // Capture dialogue settings we want to record on the take metadata
    let dialogSettingsForMetadata: { voice_id?: string; stability?: number; similarity_boost?: number } | null = null;

    for (let i = 0; i < count; i++) {
      const textPrompt = content.prompt || content.item_id || 'Hello';
      let buffer: Buffer;
      let relativePath: string;
      let mediaDir: string;

      const takeNumber = nextTakeNumber++;
      const paddedTake = String(takeNumber).padStart(3, '0');
      const filename = `${baseFilename}_take_${paddedTake}.wav`;

      if (content.content_type === 'dialogue') {
        const providerSettings = actor.provider_settings?.dialogue;
        if (!providerSettings || providerSettings.provider !== 'elevenlabs') {
          reply.code(400);
          return { error: 'No ElevenLabs provider configured for dialogue' };
        }
        if (!providerSettings.voice_id) {
          reply.code(400);
          return { error: 'No voice selected for this actor' };
        }

        buffer = await provider.generateDialogue(
          textPrompt,
          providerSettings.voice_id,
          {
            stability: providerSettings.stability,
            similarity_boost: providerSettings.similarity_boost,
          }
        );

        // Store relative path from media root for URL serving (dialogue)
        relativePath = join('actors', actor.id, 'dialogue', content.id, 'raw', filename);
        mediaDir = join(paths.media, 'actors', actor.id, 'dialogue', content.id, 'raw');

        // Save settings for generation_params metadata
        dialogSettingsForMetadata = {
          voice_id: providerSettings.voice_id,
          stability: providerSettings.stability,
          similarity_boost: providerSettings.similarity_boost,
        };
      } else if (content.content_type === 'music') {
        const musicSettings = actor.provider_settings?.music;
        if (!musicSettings || musicSettings.provider !== 'elevenlabs') {
          reply.code(400);
          return { error: 'No ElevenLabs provider configured for music' };
        }

        buffer = await provider.generateMusic(textPrompt, {
          duration_seconds: 60, // TODO: make configurable per content/actor
        });
        // Store relative path from media root for URL serving (music)
        relativePath = join('actors', actor.id, 'music', content.id, 'raw', filename);
        mediaDir = join(paths.media, 'actors', actor.id, 'music', content.id, 'raw');
      } else if (content.content_type === 'sfx') {
        const sfxSettings = actor.provider_settings?.sfx;
        if (!sfxSettings || sfxSettings.provider !== 'elevenlabs') {
          reply.code(400);
          return { error: 'No ElevenLabs provider configured for sfx' };
        }

        buffer = await provider.generateSFX(textPrompt, {
          // For now, use simple defaults; can be extended with duration / influence later.
        } as any);

        // Store relative path from media root for URL serving (sfx)
        relativePath = join('actors', actor.id, 'sfx', content.id, 'raw', filename);
        mediaDir = join(paths.media, 'actors', actor.id, 'sfx', content.id, 'raw');
      } else {
        reply.code(400);
        return { error: `Generation not supported for content type "${content.content_type}"` };
      }

      const filePath = join(mediaDir, filename);

      await import('fs-extra').then(async (fsMod) => {
        const fs = fsMod.default;
        await fs.ensureDir(mediaDir);
        await fs.writeFile(filePath, buffer);
      });

      const { probeAudio } = await import('./services/audio/ffprobe.js');
      const { hashFile } = await import('./services/audio/hash.js');
      
      const probeResult = await probeAudio(filePath);
      const hash = await hashFile(filePath);

      const primaryStream = probeResult.streams[0];
      const durationSec = probeResult.format.duration;
      const rawSampleRate = primaryStream?.sample_rate ? Number(primaryStream.sample_rate) : 44100;
      const rawChannels = primaryStream?.channels ?? 1;

      const now = new Date().toISOString();

      // Generation params differ for dialogue vs music vs sfx
      let generationParams: any;
      if (content.content_type === 'dialogue' && dialogSettingsForMetadata) {
        generationParams = {
          provider: 'elevenlabs',
          voice_id: dialogSettingsForMetadata.voice_id,
          stability: dialogSettingsForMetadata.stability,
          similarity_boost: dialogSettingsForMetadata.similarity_boost,
          prompt: textPrompt,
          generated_at: now,
        };
      } else if (content.content_type === 'music') {
        generationParams = {
          provider: 'elevenlabs',
          model_id: 'music_v1',
          prompt: textPrompt,
          generated_at: now,
        };
      } else if (content.content_type === 'sfx') {
        generationParams = {
          provider: 'elevenlabs',
          type: 'sfx',
          prompt: textPrompt,
          generated_at: now,
        };
      } else {
        generationParams = {
          provider: 'elevenlabs',
          prompt: textPrompt,
          generated_at: now,
        };
      }

      const take: Take = {
        id: generateId(),
        content_id: content.id,
        take_number: takeNumber,
        filename,
        status: 'new',
        path: relativePath,
        hash_sha256: hash,
        duration_sec: durationSec,
        format: 'wav',
        sample_rate: rawSampleRate === 48000 ? 48000 : 44100,
        bit_depth: 16,
        channels: rawChannels === 2 ? 2 : 1,
        lufs_integrated: 0,
        peak_dbfs: 0,
        generated_by: 'elevenlabs',
        generation_params: generationParams,
        created_at: now,
        updated_at: now,
      };

      await appendJsonl(paths.catalog.takes, take);
      generatedTakes.push(take);
    }

    // Update content's next_take_number to prevent reuse of deleted take numbers
    const contentIndex = contentItems.findIndex(c => c.id === id);
    if (contentIndex !== -1) {
      contentItems[contentIndex] = {
        ...contentItems[contentIndex],
        next_take_number: nextTakeNumber,
        updated_at: new Date().toISOString(),
      };
      await writeJsonlAll(paths.catalog.content, contentItems);
    }

    return { takes: generatedTakes };
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
