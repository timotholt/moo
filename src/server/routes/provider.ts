import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getAudioProvider } from '../../services/provider-factory.js';
import {
  getElevenLabsApiKey,
  getGenerationProviderSettings,
  listGenerationProviderSettings,
  setElevenLabsApiKey,
  setGenerationProviderSettings,
  type GenerationProviderSettings,
} from '../../services/global-config.js';

// In-memory cache for voice previews
const voicePreviewCache = new Map<string, string>();

type ProjectContext = { projectRoot: string; paths: ReturnType<typeof import('../../utils/paths.js').getProjectPaths> };

function validProviderId(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,79}$/.test(normalized) ? normalized : null;
}

function validateProviderSettingsBody(body: unknown): { settings?: GenerationProviderSettings; error?: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Settings body must be an object' };
  }

  const value = body as Record<string, unknown>;
  if (Object.keys(value).length === 0) {
    return { error: 'At least one provider setting is required' };
  }
  const allowedKeys = new Set(['api_key', 'enabled', 'model', 'config']);
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    return { error: `Unsupported settings field: ${unknownKeys.join(', ')}` };
  }

  if (value.api_key !== undefined && typeof value.api_key !== 'string') {
    return { error: 'api_key must be a string' };
  }
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') {
    return { error: 'enabled must be a boolean' };
  }
  if (value.model !== undefined && typeof value.model !== 'string') {
    return { error: 'model must be a string' };
  }
  if (value.config !== undefined && (!value.config || typeof value.config !== 'object' || Array.isArray(value.config))) {
    return { error: 'config must be an object' };
  }

  return { settings: value as GenerationProviderSettings };
}

export function registerProviderRoutes(fastify: FastifyInstance, getProjectContext: () => ProjectContext | null) {
  // MOO is local-only: the authoring UI intentionally receives full API keys.
  fastify.get('/api/generation/providers/settings', async () => ({
    providers: await listGenerationProviderSettings(),
  }));

  fastify.get('/api/generation/providers/:providerId/settings', async (request: FastifyRequest<{ Params: { providerId: string } }>, reply: FastifyReply) => {
    const providerId = validProviderId(request.params.providerId);
    if (!providerId) {
      reply.code(400);
      return { error: 'Provider ID must use letters, numbers, underscores, or hyphens' };
    }

    return { providerId, settings: await getGenerationProviderSettings(providerId) || {} };
  });

  fastify.put('/api/generation/providers/:providerId/settings', async (request: FastifyRequest<{ Params: { providerId: string }; Body: unknown }>, reply: FastifyReply) => {
    const providerId = validProviderId(request.params.providerId);
    if (!providerId) {
      reply.code(400);
      return { error: 'Provider ID must use letters, numbers, underscores, or hyphens' };
    }

    const validation = validateProviderSettingsBody(request.body);
    if (validation.error) {
      reply.code(400);
      return { error: validation.error };
    }

    await setGenerationProviderSettings(providerId, validation.settings!);
    return { providerId, settings: await getGenerationProviderSettings(providerId) || {} };
  });

  fastify.get('/api/voices', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const ctx = getProjectContext();
      if (!ctx) {
        reply.code(400);
        return { error: 'No project selected' };
      }
      const { projectRoot } = ctx;
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

  fastify.post('/api/voices/preview', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const ctx = getProjectContext();
      if (!ctx) {
        reply.code(400);
        return { error: 'No project selected' };
      }
      const { projectRoot } = ctx;
      const provider = await getAudioProvider(projectRoot);
      
      const body = request.body as {
        voice_id: string;
        text?: string;
        stability?: number;
        similarity_boost?: number;
        model_id?: string;
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
      const modelId = body.model_id || 'eleven_multilingual_v2';

      // Create cache key based on voice, settings, and model
      const cacheKey = `${body.voice_id}-${modelId}-${settings.stability}-${settings.similarity_boost}-${sampleText}`;
      
      // Check if we have cached audio
      let base64Audio = voicePreviewCache.get(cacheKey);
      
      if (!base64Audio) {
        // Generate new audio and cache it
        fastify.log.info(`Generating new voice preview for voice: ${body.voice_id} with model: ${modelId}`);
        const audioBuffer = await provider.generateDialogue(sampleText, body.voice_id, settings, modelId);
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

  // Get provider credits/usage (currently only ElevenLabs)
  fastify.get('/api/provider/credits', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const ctx = getProjectContext();
      if (!ctx) {
        reply.code(400);
        return { error: 'No project selected' };
      }
      const { projectRoot } = ctx;
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

  // Get saved ElevenLabs API key. MOO is a local-only authoring tool and its
  // Settings UI is intentionally allowed to display the configured key.
  fastify.get('/api/provider/api-key', async (_request: FastifyRequest, _reply: FastifyReply) => {
    const apiKey = await getElevenLabsApiKey();
    if (apiKey) {
      return { hasKey: true, apiKey };
    }
    return { hasKey: false };
  });

  // Save ElevenLabs API key
  fastify.post('/api/provider/api-key', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { apiKey?: string } | null;
    
    if (!body?.apiKey) {
      reply.code(400);
      return { error: 'API key is required' };
    }
    
    await setElevenLabsApiKey(body.apiKey);
    return { success: true };
  });

  // Test ElevenLabs API key
  fastify.post('/api/provider/test-key', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { apiKey?: string } | null;
      
      if (!body?.apiKey) {
        reply.code(400);
        return { success: false, error: 'API key is required' };
      }

      // Test the key by fetching user info
      const response = await fetch('https://api.elevenlabs.io/v1/user', {
        headers: {
          'xi-api-key': body.apiKey,
        },
      });

      if (response.ok) {
        const data = await response.json() as { subscription?: { tier?: string } };
        return { 
          success: true, 
          user: {
            subscription: data.subscription?.tier || 'unknown',
          }
        };
      } else {
        const errorText = await response.text();
        return { 
          success: false, 
          error: response.status === 401 ? 'Invalid API key' : errorText 
        };
      }
    } catch (err) {
      request.log.error(err);
      return { success: false, error: (err as Error).message };
    }
  });
}
