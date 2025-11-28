import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getAudioProvider } from '../../services/provider-factory.js';
import { setElevenLabsApiKey, getElevenLabsApiKey } from '../../services/global-config.js';

// In-memory cache for voice previews
const voicePreviewCache = new Map<string, string>();

type ProjectContext = { projectRoot: string; paths: ReturnType<typeof import('../../utils/paths.js').getProjectPaths> };

export function registerProviderRoutes(fastify: FastifyInstance, getProjectContext: () => ProjectContext) {
  fastify.get('/api/voices', async (_request: FastifyRequest, reply: FastifyReply) => {
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

  fastify.post('/api/voices/preview', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { projectRoot } = getProjectContext();
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
  fastify.get('/api/provider/credits', async (request: FastifyRequest, _reply: FastifyReply) => {
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

  // Get saved ElevenLabs API key (masked)
  fastify.get('/api/provider/api-key', async (_request: FastifyRequest, _reply: FastifyReply) => {
    const apiKey = await getElevenLabsApiKey();
    if (apiKey) {
      // Return masked key for display
      const masked = apiKey.slice(0, 4) + '...' + apiKey.slice(-4);
      return { hasKey: true, masked };
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
