import { join } from 'path';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Actor, Content, Take, Section } from '../../types/index.js';
import { readJsonl, appendJsonl, ensureJsonlFile, writeJsonlAll } from '../../utils/jsonl.js';
import { generateId } from '../../utils/ids.js';
import { validate } from '../../utils/validation.js';
import { getAudioProvider } from '../../services/provider-factory.js';

type ProjectContext = { projectRoot: string; paths: ReturnType<typeof import('../../utils/paths.js').getProjectPaths> };

export function registerContentRoutes(fastify: FastifyInstance, getProjectContext: () => ProjectContext | null) {
  fastify.get('/api/content', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;
    const contentItems = await readJsonl<Content>(paths.catalog.content);

    const query = request.query as { actorId?: string; type?: string; sectionId?: string };
    const actorId = query.actorId;
    const type = query.type as Content['content_type'] | undefined;
    const sectionId = query.sectionId;

    const filtered = contentItems.filter((c: Content) => {
      if (actorId && c.actor_id !== actorId) return false;
      if (type && c.content_type !== type) return false;
      if (sectionId && c.section_id !== sectionId) return false;
      return true;
    });

    return { content: filtered };
  });

  fastify.post('/api/content', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;
    await ensureJsonlFile(paths.catalog.content);

    const body = request.body as {
      actor_id: string;
      content_type: Content['content_type'];
      section_id: string;
      cue_id: string;
      prompt?: string;
      tags?: string[];
    } | null;

    if (!body || !body.actor_id || !body.content_type || !body.section_id || !body.cue_id) {
      reply.code(400);
      return { error: 'actor_id, content_type, section_id, and cue_id are required' };
    }

    const now = new Date().toISOString();

    // Support batch creation by splitting comma-separated cue_ids
    const allCueIds = body.cue_id.split(',').map((id: string) => id.trim()).filter((id: string) => id.length > 0);
    
    if (allCueIds.length === 0) {
      reply.code(400);
      return { error: 'At least one valid cue_id is required' };
    }

    // Check for existing content and filter out duplicates
    const existingContent = await readJsonl<Content>(paths.catalog.content);
    const existingCueIds = new Set(
      existingContent
        .filter(c => c.actor_id === body.actor_id && c.content_type === body.content_type)
        .map(c => c.cue_id)
    );
    
    const cueIds = allCueIds.filter((id: string) => !existingCueIds.has(id));
    const duplicateIds = allCueIds.filter((id: string) => existingCueIds.has(id));
    
    if (cueIds.length === 0) {
      reply.code(400);
      return { error: 'All provided cue_ids already exist for this actor and content type', duplicates: duplicateIds };
    }

    const createdContent: Content[] = [];

    for (const cueId of cueIds) {
      // Default prompt to the individual cue_id (title-cased) if no custom prompt provided
      const defaultPrompt = cueId.charAt(0).toUpperCase() + cueId.slice(1);
      const content: Content = {
        id: generateId(),
        actor_id: body.actor_id,
        content_type: body.content_type,
        section_id: body.section_id,
        cue_id: cueId,
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
        return { error: `Invalid content for cue_id "${cueId}"`, details: validation.errors };
      }

      await appendJsonl(paths.catalog.content, content);
      createdContent.push(content);
    }

    // Return the first item for single creation, or array for batch
    const result: { content: Content | Content[]; duplicates_skipped?: string[]; message?: string } = cueIds.length === 1 ? { content: createdContent[0] } : { content: createdContent };
    
    // Include information about duplicates if any were skipped
    if (duplicateIds.length > 0) {
      result.duplicates_skipped = duplicateIds;
      result.message = `Created ${cueIds.length} items. Skipped ${duplicateIds.length} duplicates: ${duplicateIds.join(', ')}`;
    }
    
    return result;
  });

  fastify.put('/api/content/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;
    
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
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;

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
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { projectRoot, paths } = ctx;
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

      // Load section to get per-section provider settings
      const sectionsData = await readJsonl<Section>(paths.catalog.sections);
      const section = sectionsData.find(s => s.id === content.section_id);
      if (!section) {
        reply.code(404);
        return { error: 'Section not found for this content' };
      }

      // Get section settings, falling back to global defaults if 'inherit'
      let sectionSettings = section.provider_settings;
      if (!sectionSettings || sectionSettings.provider === 'inherit') {
        // Load global defaults
        const defaultsPath = join(paths.root, 'defaults.json');
        let globalDefaults: Record<string, Record<string, unknown>> = {
          dialogue: { provider: 'elevenlabs', stability: 0.5, similarity_boost: 0.75 },
          music: { provider: 'elevenlabs', duration_seconds: 30 },
          sfx: { provider: 'elevenlabs' },
        };
        try {
          const fs = await import('fs-extra').then(m => m.default);
          if (await fs.pathExists(defaultsPath)) {
            globalDefaults = await fs.readJson(defaultsPath);
          }
        } catch (err) {
          fastify.log.warn(err, 'Failed to load global defaults, using hardcoded values');
        }
        sectionSettings = globalDefaults[content.content_type] as Section['provider_settings'];
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

      // Compute the base filename used for all generated takes.
      // Pattern: actorname_{dialog|music|sfx}_cue_v001
      // - actor.base_filename is normalized to remove trailing underscores
      // - cue_id is normalized to lowercase with underscores for spaces
      // - content type is mapped to a short suffix (dialog, music, sfx)
      const actorBase = (actor.base_filename || 'unknown').replace(/_+$/, '');
      const safeCueId = (content.cue_id || 'untitled')
        .trim()
        .replace(/\s+/g, '_')
        .toLowerCase();

      let typeSuffix: string;
      if (content.content_type === 'dialogue') {
        typeSuffix = 'dialog';
      } else if (content.content_type === 'music') {
        typeSuffix = 'music';
      } else if (content.content_type === 'sfx') {
        typeSuffix = 'sfx';
      } else {
        typeSuffix = String(content.content_type || 'content');
      }

      const derivedBaseFilename = `${actorBase}_${typeSuffix}_${safeCueId}`;
      const contentFilename = (content as Content & { filename?: string }).filename;

      // If a custom filename is provided, use it; otherwise use the derived one.
      // In either case, normalize multiple underscores and trim leading/trailing underscores.
      const rawBase = contentFilename && contentFilename.trim().length > 0
        ? contentFilename.trim()
        : derivedBaseFilename;

      const baseFilename = rawBase
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');

      const generatedTakes: Take[] = [];

      // Capture dialogue settings we want to record on the take metadata
      let dialogSettingsForMetadata: { voice_id?: string; model_id?: string; stability?: number; similarity_boost?: number } | null = null;

      for (let i = 0; i < count; i++) {
        const textPrompt = content.prompt || content.cue_id || 'Hello';
        let buffer: Buffer;
        let relativePath: string;
        let mediaDir: string;

        const takeNumber = nextTakeNumber++;
        const paddedTake = String(takeNumber).padStart(3, '0');
        const filename = `${baseFilename}_v${paddedTake}.wav`;

        if (content.content_type === 'dialogue') {
          if (!sectionSettings || sectionSettings.provider !== 'elevenlabs') {
            reply.code(400);
            return { error: 'No ElevenLabs provider configured for dialogue in this section' };
          }
          if (!sectionSettings.voice_id) {
            reply.code(400);
            return { error: 'No voice selected for this section' };
          }

          buffer = await provider.generateDialogue(
            textPrompt,
            sectionSettings.voice_id,
            {
              stability: sectionSettings.stability,
              similarity_boost: sectionSettings.similarity_boost,
            },
            sectionSettings.model_id
          );

          relativePath = join('actors', actor.id, 'dialogue', content.id, 'raw', filename);
          mediaDir = join(paths.media, 'actors', actor.id, 'dialogue', content.id, 'raw');

          dialogSettingsForMetadata = {
            voice_id: sectionSettings.voice_id,
            model_id: sectionSettings.model_id,
            stability: sectionSettings.stability,
            similarity_boost: sectionSettings.similarity_boost,
          };
        } else if (content.content_type === 'music') {
          if (!sectionSettings || sectionSettings.provider !== 'elevenlabs') {
            reply.code(400);
            return { error: 'No ElevenLabs provider configured for music in this section' };
          }

          buffer = await provider.generateMusic(textPrompt, {
            duration_seconds: sectionSettings.duration_seconds || 30,
          });
          relativePath = join('actors', actor.id, 'music', content.id, 'raw', filename);
          mediaDir = join(paths.media, 'actors', actor.id, 'music', content.id, 'raw');
        } else if (content.content_type === 'sfx') {
          if (!sectionSettings || sectionSettings.provider !== 'elevenlabs') {
            reply.code(400);
            return { error: 'No ElevenLabs provider configured for sfx in this section' };
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
            model_id: dialogSettingsForMetadata.model_id,
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
