import { join } from 'path';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Section, Take } from '../../types/index.js';
import { SectionSchema } from '../../shared/schemas/index.js';
import { readJsonl, appendJsonl, ensureJsonlFile, writeJsonlAll } from '../../utils/jsonl.js';
import { generateId } from '../../utils/ids.js';
import { validate } from '../../utils/validation.js';
import {
  readCatalog,
  saveSnapshot,
  snapshotMessageForSection,
  snapshotMessageForSectionUpdate
} from './snapshots.js';

type ProjectContext = { projectRoot: string; paths: ReturnType<typeof import('../../utils/paths.js').getProjectPaths> };

export function registerSectionRoutes(fastify: FastifyInstance, getProjectContext: () => ProjectContext | null) {
  fastify.get('/api/sections', async (_request: FastifyRequest, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;
    const sections = await readJsonl<Section>(paths.catalog.sections, SectionSchema);
    return { sections };
  });

  fastify.post('/api/sections', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;
    await ensureJsonlFile(paths.catalog.sections);

    const body = request.body as Partial<Section> | undefined;

    if (!body || !body.owner_type || !body.content_type) {
      reply.code(400);
      return { error: 'owner_type and content_type are required' };
    }

    if ((body.owner_type === 'actor' || body.owner_type === 'scene') && !body.owner_id) {
      reply.code(400);
      return { error: 'owner_id is required for actors and scenes' };
    }

    // Read catalog once and save snapshot
    const catalog = await readCatalog(paths);

    // Validate existence of owner
    if (body.owner_type === 'actor' && body.owner_id) {
      if (!catalog.actors.some(a => a.id === body.owner_id)) {
        reply.code(400);
        return { error: 'Actor not found', details: { owner_id: body.owner_id } };
      }
    } else if (body.owner_type === 'scene' && body.owner_id) {
      if (!catalog.scenes.some(s => s.id === body.owner_id)) {
        reply.code(400);
        return { error: 'Scene not found', details: { owner_id: body.owner_id } };
      }
    }

    // Validate existence of linked scene
    if (body.scene_id) {
      if (!catalog.scenes.some(s => s.id === body.scene_id)) {
        reply.code(400);
        return { error: 'Linked scene not found', details: { scene_id: body.scene_id } };
      }
    }

    const sectionName = body.name || body.content_type;

    console.log('[API] Creating section. Body:', JSON.stringify(body, null, 2));

    const snapshotMessage = snapshotMessageForSection(
      'create',
      body.owner_type as any,
      body.owner_id ?? null,
      sectionName,
      catalog
    );
    await saveSnapshot(paths, snapshotMessage, catalog);

    const now = new Date().toISOString();
    const section: Section = {
      id: generateId(),
      owner_type: body.owner_type as any,
      owner_id: body.owner_id ?? null,
      content_type: body.content_type as any,
      name: body.name || body.content_type,
      scene_id: body.scene_id || undefined,
      default_blocks: body.default_blocks || { [body.content_type]: { provider: 'inherit' } },
      section_complete: false,
      created_at: now,
      updated_at: now,
    };

    console.log('[API] Section object created:', JSON.stringify(section, null, 2));

    const validation = validate('section', section);
    if (!validation.valid) {
      console.error('[API] Validation failed:', JSON.stringify(validation.errors, null, 2));
      reply.code(400);
      return { error: 'Invalid section data', details: validation.errors };
    }

    await appendJsonl(paths.catalog.sections, section, SectionSchema);
    return { section };
  });

  fastify.put('/api/sections/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;

    const { id } = request.params;
    const body = request.body as Partial<Section>;

    if (!body) {
      reply.code(400);
      return { error: 'Request body is required' };
    }

    const catalog = await readCatalog(paths);
    const sectionIndex = catalog.sections.findIndex(s => s.id === id);

    if (sectionIndex === -1) {
      reply.code(404);
      return { error: 'Section not found' };
    }

    const currentSection = catalog.sections[sectionIndex];

    // Check for duplicate names within same owner/type
    if (body.name && body.name !== currentSection.name) {
      const duplicate = catalog.sections.find(s =>
        s.id !== id &&
        s.owner_type === currentSection.owner_type &&
        s.owner_id === currentSection.owner_id &&
        s.content_type === currentSection.content_type &&
        s.name === body.name
      );
      if (duplicate) {
        reply.code(400);
        return { error: 'A section with this name already exists for this owner and type' };
      }
    }

    const updatedSection: Section = {
      ...currentSection,
      ...body,
      id,
      updated_at: new Date().toISOString(),
    };

    // Save snapshot
    const currentName = currentSection.name || currentSection.content_type;
    const snapshotMessage = snapshotMessageForSectionUpdate(
      currentSection.owner_type as any,
      currentSection.owner_id ?? null,
      currentName,
      catalog,
      currentSection as unknown as Record<string, unknown>,
      updatedSection as unknown as Record<string, unknown>
    );
    await saveSnapshot(paths, snapshotMessage, catalog);

    // Validate
    const validation = validate('section', updatedSection);
    if (!validation.valid) {
      reply.code(400);
      return { error: 'Invalid section data', details: validation.errors };
    }

    catalog.sections[sectionIndex] = updatedSection;
    await writeJsonlAll(paths.catalog.sections, catalog.sections, SectionSchema);

    return { section: updatedSection };
  });

  fastify.delete('/api/sections/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;
    const { id } = request.params;

    const catalog = await readCatalog(paths);
    const section = catalog.sections.find(s => s.id === id);
    if (!section) {
      reply.code(404);
      return { error: 'Section not found' };
    }

    const sectionName = section.name || section.content_type;
    const snapshotMessage = snapshotMessageForSection('delete', section.owner_type as any, section.owner_id ?? null, sectionName, catalog);
    await saveSnapshot(paths, snapshotMessage, catalog);

    const remainingSections = catalog.sections.filter(s => s.id !== id);

    // Cascade delete content and takes
    const removedContent = catalog.content.filter(c => c.section_id === id);
    const removedContentIds = new Set(removedContent.map(c => c.id));
    const remainingContent = catalog.content.filter(c => c.section_id !== id);

    const takes = await readJsonl<Take>(paths.catalog.takes);
    const remainingTakes = takes.filter(t => !removedContentIds.has(t.content_id));

    await writeJsonlAll(paths.catalog.sections, remainingSections, SectionSchema);
    await writeJsonlAll(paths.catalog.content, remainingContent);
    await writeJsonlAll(paths.catalog.takes, remainingTakes);

    reply.code(204);
    return null;
  });
}
