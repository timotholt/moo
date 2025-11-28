import { join } from 'path';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Actor, Content, Take } from '../../types/index.js';
import { readJsonl, appendJsonl, ensureJsonlFile, writeJsonlAll } from '../../utils/jsonl.js';
import { generateId } from '../../utils/ids.js';
import { validate } from '../../utils/validation.js';
import { getAudioProvider } from '../../services/provider-factory.js';

type ProjectContext = { projectRoot: string; paths: ReturnType<typeof import('../../utils/paths.js').getProjectPaths> };

export function registerContentRoutes(fastify: FastifyInstance, getProjectContext: () => ProjectContext) {
  fastify.get('/api/content', async (request: FastifyRequest) => {
    const { paths } = getProjectContext();
    const contentItems = await readJsonl<Content>(paths.catalog.content);

    const query = request.query as { actorId?: string; type?: string };
    const actorId = query.actorId;
    const type = query.type as Content['content_type'] | undefined;

    const filtered = contentItems.filter((c: Content) => {
      if (actorId && c.actor_id !== actorId) return false;
      if (type && c.content_type !== type) return false;
      return true;
    });

    return { content: filtered };
  });

  fastify.post('/api/content', async (request: FastifyRequest, reply: FastifyReply) => {
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

  fastify.put('/api/content/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
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

  fastify.delete('/api/content/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
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

  // Generate takes for a specific content item
  fastify.post('/api/content/:id/generate', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
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
      const nextFromExisting = maxExistingTakeNumber + 1;
      const nextFromContent = content.next_take_number ?? 1;
      let nextTakeNumber = Math.max(nextFromExisting, nextFromContent);

      // Compute the base filename in the same style as the UI's Filenames tab.
      const actorBase = (actor.base_filename || 'unknown').replace(/_+$/, '');
      const safeItemId = (content.item_id || 'untitled')
        .trim()
        .replace(/\s+/g, '_')
        .toLowerCase();
      const derivedBaseFilename = `${actorBase}_${content.content_type}_${safeItemId}`;
      const contentFilename = (content as Content & { filename?: string }).filename;
      const baseFilename = contentFilename && contentFilename.trim().length > 0
        ? contentFilename.trim()
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

          relativePath = join('actors', actor.id, 'dialogue', content.id, 'raw', filename);
          mediaDir = join(paths.media, 'actors', actor.id, 'dialogue', content.id, 'raw');

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
            duration_seconds: 60,
          });
          relativePath = join('actors', actor.id, 'music', content.id, 'raw', filename);
          mediaDir = join(paths.media, 'actors', actor.id, 'music', content.id, 'raw');
        } else if (content.content_type === 'sfx') {
          const sfxSettings = actor.provider_settings?.sfx;
          if (!sfxSettings || sfxSettings.provider !== 'elevenlabs') {
            reply.code(400);
            return { error: 'No ElevenLabs provider configured for sfx' };
          }

          buffer = await provider.generateSFX(textPrompt, {});

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

        const { probeAudio } = await import('../../services/audio/ffprobe.js');
        const { hashFile } = await import('../../services/audio/hash.js');
        
        const probeResult = await probeAudio(filePath);
        const hash = await hashFile(filePath);

        const primaryStream = probeResult.streams[0];
        const durationSec = probeResult.format.duration;
        const rawSampleRate = primaryStream?.sample_rate ? Number(primaryStream.sample_rate) : 44100;
        const rawChannels = primaryStream?.channels ?? 1;

        const now = new Date().toISOString();

        let generationParams: Record<string, unknown>;
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
}
