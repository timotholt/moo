import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Actor, Section, Content, Take } from '../../types/index.js';
import { readJsonl } from '../../utils/jsonl.js';

type ProjectContext = { projectRoot: string; paths: ReturnType<typeof import('../../utils/paths.js').getProjectPaths> };

interface BackfillResult {
  content_id: string;
  cue_id: string;
  actor_name: string;
  section_name: string;
  current_undecided: number;
  min_candidates: number;
  needed: number;
  generated: number;
  error?: string;
}

interface BackfillResponse {
  success: boolean;
  total_generated: number;
  items: BackfillResult[];
  errors: string[];
}

export function registerBatchRoutes(fastify: FastifyInstance, getProjectContext: () => ProjectContext | null) {
  /**
   * POST /api/batch/backfill-takes
   * 
   * For each cue that is not yet complete (all_approved = false):
   * - Count undecided takes (status = 'new')
   * - If undecided < min_candidates, generate (min_candidates - undecided) new takes
   * 
   * Query params:
   * - actor_id: optional, limit to specific actor
   * - section_id: optional, limit to specific section
   * - content_id: optional, limit to specific cue
   * - dry_run: if true, just return what would be generated without generating
   */
  fastify.post('/api/batch/backfill-takes', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;

    const query = request.query as { 
      actor_id?: string; 
      section_id?: string; 
      content_id?: string;
      dry_run?: string;
    };
    const filterActorId = query.actor_id;
    const filterSectionId = query.section_id;
    const filterContentId = query.content_id;
    const dryRun = query.dry_run === 'true';

    // Load all catalog data
    const actors = await readJsonl<Actor>(paths.catalog.actors);
    const sections = await readJsonl<Section>(paths.catalog.sections);
    const content = await readJsonl<Content>(paths.catalog.content);
    const takes = await readJsonl<Take>(paths.catalog.takes);

    // Build lookup maps
    const actorsById = new Map(actors.map(a => [a.id, a]));
    const sectionsById = new Map(sections.map(s => [s.id, s]));

    // Filter content to process
    let targetContent = content.filter(c => !c.all_approved); // Only incomplete cues
    
    if (filterContentId) {
      targetContent = targetContent.filter(c => c.id === filterContentId);
    }
    if (filterSectionId) {
      targetContent = targetContent.filter(c => c.section_id === filterSectionId);
    }
    if (filterActorId) {
      targetContent = targetContent.filter(c => c.actor_id === filterActorId);
    }

    const results: BackfillResult[] = [];
    const errors: string[] = [];
    let totalGenerated = 0;

    for (const cue of targetContent) {
      const actor = actorsById.get(cue.actor_id);
      const section = sectionsById.get(cue.section_id);
      
      if (!actor || !section) {
        errors.push(`Cue ${cue.cue_id}: Missing actor or section`);
        continue;
      }

      // Get min_candidates from section settings, falling back to actor settings
      // If section provider is 'inherit', use actor settings
      const sectionSettings = section.provider_settings;
      const actorSettings = actor.provider_settings?.[cue.content_type as keyof typeof actor.provider_settings];
      
      // Debug logging
      console.log(`[Backfill] Cue: ${cue.cue_id}`);
      console.log(`[Backfill]   Section provider: ${sectionSettings?.provider}`);
      console.log(`[Backfill]   Section min_candidates: ${sectionSettings?.min_candidates}`);
      console.log(`[Backfill]   Actor min_candidates: ${actorSettings?.min_candidates}`);
      
      const minCandidates = (sectionSettings?.provider !== 'inherit' && sectionSettings?.min_candidates)
        ? sectionSettings.min_candidates
        : (actorSettings?.min_candidates ?? 1);
      
      console.log(`[Backfill]   Resolved min_candidates: ${minCandidates}`);

      // Count undecided takes (status = 'new')
      const cueTakes = takes.filter(t => t.content_id === cue.id);
      const undecidedCount = cueTakes.filter(t => t.status === 'new').length;

      // Calculate how many to generate
      const needed = Math.max(0, minCandidates - undecidedCount);
      console.log(`[Backfill]   Undecided: ${undecidedCount}, Needed: ${needed}`);

      const result: BackfillResult = {
        content_id: cue.id,
        cue_id: cue.cue_id,
        actor_name: actor.display_name,
        section_name: section.name || section.content_type,
        current_undecided: undecidedCount,
        min_candidates: minCandidates,
        needed,
        generated: 0,
      };

      if (needed > 0 && !dryRun) {
        // Call the existing generate endpoint internally
        try {
          const generateResponse = await fastify.inject({
            method: 'POST',
            url: `/api/content/${cue.id}/generate`,
            payload: { count: needed },
          });

          if (generateResponse.statusCode === 200) {
            const generateResult = JSON.parse(generateResponse.body);
            result.generated = generateResult.takes?.length || 0;
            totalGenerated += result.generated;
          } else {
            const errorBody = JSON.parse(generateResponse.body);
            result.error = errorBody.error || `HTTP ${generateResponse.statusCode}`;
            errors.push(`${actor.display_name} → ${section.name || section.content_type} → ${cue.cue_id}: ${result.error}`);
          }
        } catch (err) {
          result.error = (err as Error).message;
          errors.push(`${actor.display_name} → ${section.name || section.content_type} → ${cue.cue_id}: ${result.error}`);
        }
      } else if (needed > 0 && dryRun) {
        result.generated = needed; // In dry run, report what would be generated
        totalGenerated += needed;
      }

      results.push(result);
    }

    const response: BackfillResponse = {
      success: errors.length === 0,
      total_generated: totalGenerated,
      items: results,
      errors,
    };

    return response;
  });

  /**
   * GET /api/batch/backfill-takes/preview
   * 
   * Preview what would be generated by backfill without actually generating.
   * Same logic as POST but always dry_run.
   */
  fastify.get('/api/batch/backfill-takes/preview', async (request: FastifyRequest, reply: FastifyReply) => {
    // Redirect to POST with dry_run=true
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }

    const query = request.query as { 
      actor_id?: string; 
      section_id?: string; 
      content_id?: string;
    };

    // Use inject to call the POST endpoint with dry_run
    const response = await fastify.inject({
      method: 'POST',
      url: '/api/batch/backfill-takes',
      query: { ...query, dry_run: 'true' },
    });

    reply.code(response.statusCode);
    return JSON.parse(response.body);
  });
}
