import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
// @ts-expect-error - JavaScript module without type declarations
import { getProviders, testConnection, generatePrompt, improvePrompt, DEFAULT_SYSTEM_PROMPTS } from '../services/llm.js';

interface LLMTestBody {
  provider: string;
  apiKey: string;
}

interface LLMGenerateBody {
  provider: string;
  apiKey: string;
  model?: string;
  systemPrompt?: string;
  mediaName: string;
  ownerName?: string;
  mediaType?: string;
}

interface LLMImproveBody {
  provider: string;
  apiKey: string;
  model?: string;
  systemPrompt?: string;
  currentPrompt: string;
  mediaName: string;
  mediaType?: string;
}

export default async function llmRoutes(fastify: FastifyInstance) {
  // Get available providers
  fastify.get('/api/llm/providers', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const providers = getProviders();
      return { providers };
    } catch (err) {
      reply.code(500);
      return { error: 'Failed to get providers', details: (err as Error).message };
    }
  });

  // Get default system prompts
  fastify.get('/api/llm/defaults', async (_request: FastifyRequest, _reply: FastifyReply) => {
    return { systemPrompts: DEFAULT_SYSTEM_PROMPTS };
  });

  // Test connection
  fastify.post('/api/llm/test', async (request: FastifyRequest<{ Body: LLMTestBody }>, reply: FastifyReply) => {
    try {
      const { provider, apiKey } = request.body;
      const result = await testConnection(provider, apiKey);
      return result;
    } catch (err) {
      reply.code(400);
      return { error: (err as Error).message };
    }
  });

  // Generate prompt
  fastify.post('/api/llm/generate', async (request: FastifyRequest<{ Body: LLMGenerateBody }>, reply: FastifyReply) => {
    try {
      const { provider, apiKey, model, systemPrompt, mediaName, ownerName, mediaType } = request.body;

      if (!mediaName) {
        reply.code(400);
        return { error: 'mediaName is required' };
      }

      const prompt = await generatePrompt({
        provider,
        apiKey,
        model,
        systemPrompt,
        mediaName,
        ownerName,
        mediaType
      });

      return { prompt };
    } catch (err) {
      reply.code(500);
      return { error: 'Failed to generate prompt', details: (err as Error).message };
    }
  });

  // Improve prompt
  fastify.post('/api/llm/improve', async (request: FastifyRequest<{ Body: LLMImproveBody }>, reply: FastifyReply) => {
    try {
      const { provider, apiKey, model, systemPrompt, currentPrompt, mediaName, mediaType } = request.body;

      if (!currentPrompt) {
        reply.code(400);
        return { error: 'currentPrompt is required' };
      }

      const prompt = await improvePrompt({
        provider,
        apiKey,
        model,
        systemPrompt,
        currentPrompt,
        mediaName,
        mediaType
      });

      return { prompt };
    } catch (err) {
      reply.code(500);
      return { error: 'Failed to improve prompt', details: (err as Error).message };
    }
  });
}
