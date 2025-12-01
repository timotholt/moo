import { join } from 'path';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Section, Content, Take } from '../../types/index.js';
import { readJsonl, appendJsonl, ensureJsonlFile, writeJsonlAll } from '../../utils/jsonl.js';
import { generateId } from '../../utils/ids.js';
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
    const sections = await readJsonl<Section>(paths.catalog.sections);
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

    const body = request.body as {
      actor_id: string;
      content_type: 'dialogue' | 'music' | 'sfx';
      name?: string;
    };
    
    if (!body || !body.actor_id || !body.content_type) {
      reply.code(400);
      return { error: 'actor_id and content_type are required' };
    }

    // Read catalog once and save snapshot
    const catalog = await readCatalog(paths);
    const sectionName = body.name || body.content_type;
    await saveSnapshot(
      paths, 
      snapshotMessageForSection('create', body.actor_id, sectionName, catalog), 
      catalog
    );

    const now = new Date().toISOString();
    const section: Section = {
      id: generateId(),
      actor_id: body.actor_id,
      content_type: body.content_type,
      name: body.name,
      created_at: now,
      updated_at: now,
    };

    await appendJsonl(paths.catalog.sections, section);
    return { section };
  });

  fastify.put('/api/sections/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;
    
    const { id } = request.params as { id: string };
    const body = request.body as Partial<Section>;
    
    if (!body) {
      reply.code(400);
      return { error: 'Request body is required' };
    }

    // Read catalog once for snapshot and logic
    const catalog = await readCatalog(paths);
    const sectionIndex = catalog.sections.findIndex(s => s.id === id);
    
    if (sectionIndex === -1) {
      reply.code(404);
      return { error: 'Section not found' };
    }

    // Check for duplicate section names if name is being updated
    const currentSection = catalog.sections[sectionIndex];
    if (body.name) {
      const duplicateSection = catalog.sections.find(s => 
        s.id !== id && 
        s.actor_id === currentSection.actor_id && 
        s.name === body.name
      );
      
      if (duplicateSection) {
        reply.code(400);
        return { error: `A section with the name "${body.name}" already exists for this actor` };
      }
    }

    // Build the updated section first so we can diff
    const updatedSection: Section = {
      ...catalog.sections[sectionIndex],
      ...body,
      id, // Ensure ID doesn't change
      updated_at: new Date().toISOString(),
    };

    // Build descriptive message with diff and save snapshot
    const currentName = currentSection.name || currentSection.content_type;
    const snapshotMessage = snapshotMessageForSectionUpdate(
      currentSection.actor_id,
      currentName,
      catalog,
      currentSection as unknown as Record<string, unknown>,
      updatedSection as unknown as Record<string, unknown>
    );
    await saveSnapshot(paths, snapshotMessage, catalog);

    // Replace the section in the array and write back
    catalog.sections[sectionIndex] = updatedSection;
    await writeJsonlAll(paths.catalog.sections, catalog.sections);

    return { section: updatedSection };
  });

  fastify.delete('/api/sections/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;

    const { id } = request.params as { id: string };

    // Read catalog once for snapshot and logic
    const catalog = await readCatalog(paths);
    const section = catalog.sections.find(s => s.id === id);
    if (!section) {
      reply.code(404);
      return { error: 'Section not found' };
    }

    // Build descriptive message and save snapshot
    const sectionName = section.name || section.content_type;
    await saveSnapshot(
      paths, 
      snapshotMessageForSection('delete', section.actor_id, sectionName, catalog), 
      catalog
    );

    // Read takes separately (not in catalog)
    const takes = await readJsonl<Take>(paths.catalog.takes);

    // Remove section
    const remainingSections = catalog.sections.filter(s => s.id !== id);
    
    // Remove all content in this section
    const removedContent = catalog.content.filter(c => c.section_id === section.id);
    const removedContentIds = new Set(removedContent.map(c => c.id));
    const remainingContent = catalog.content.filter(c => !removedContentIds.has(c.id));
    
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
}
