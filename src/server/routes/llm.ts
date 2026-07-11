import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
// @ts-expect-error - JavaScript module without type declarations
import { getProviders, testConnection, generatePrompt, improvePrompt, DEFAULT_SYSTEM_PROMPTS } from '../services/llm.js';
import { getLLMSettings, setLLMSettings } from '../../services/global-config.js';

interface LLMTestBody {
  provider?: string;
  apiKey?: string;
}

interface LLMGenerateBody {
  mediaName: string;
  ownerName?: string;
  mediaType?: string;
}

interface LLMImproveBody {
  currentPrompt: string;
  mediaName: string;
  mediaType?: string;
}

export default async function llmRoutes(fastify: FastifyInstance) {
  fastify.get('/api/llm/settings', async () => {
    const settings = await getLLMSettings();
    return { settings: settings || { provider: 'groq', api_key: '', model: 'llama-3.1-8b-instant', system_prompts: {} } };
  });

  fastify.put('/api/llm/settings', async (request: FastifyRequest<{ Body: { provider?: string; api_key?: string; model?: string; system_prompts?: { generate?: string; improve?: string } } }>, reply: FastifyReply) => {
    const body = request.body;
    if (!body?.provider || body.api_key === undefined) {
      reply.code(400);
      return { error: 'provider and api_key are required' };
    }
    await setLLMSettings({ provider: body.provider, api_key: body.api_key, model: body.model, system_prompts: body.system_prompts });
    return { settings: await getLLMSettings() };
  });

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
      const saved = await getLLMSettings();
      const provider = request.body.provider || saved?.provider;
      const apiKey = request.body.apiKey || saved?.api_key;
      if (!provider || !apiKey) throw new Error('Configure an AI provider and API key in Settings first');
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
      const { mediaName, ownerName, mediaType } = request.body;
      const saved = await getLLMSettings();

      if (!mediaName) {
        reply.code(400);
        return { error: 'mediaName is required' };
      }
      if (!saved?.api_key) {
        reply.code(400);
        return { error: 'Configure an AI provider and API key in Settings first' };
      }

      const prompt = await generatePrompt({
        provider: saved.provider,
        apiKey: saved.api_key,
        model: saved.model,
        systemPrompt: saved.system_prompts?.generate,
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
      const { currentPrompt, mediaName, mediaType } = request.body;
      const saved = await getLLMSettings();

      if (!currentPrompt) {
        reply.code(400);
        return { error: 'currentPrompt is required' };
      }
      if (!saved?.api_key) {
        reply.code(400);
        return { error: 'Configure an AI provider and API key in Settings first' };
      }

      const prompt = await improvePrompt({
        provider: saved.provider,
        apiKey: saved.api_key,
        model: saved.model,
        systemPrompt: saved.system_prompts?.improve,
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
