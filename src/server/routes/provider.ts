import { getAudioProvider } from '../../services/provider-factory.js';

// In-memory cache for voice previews
const voicePreviewCache = new Map<string, string>();

export function registerProviderRoutes(fastify: any, getProjectContext: any) {
  fastify.get('/api/voices', async (request: any, reply: any) => {
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

  fastify.post('/api/voices/preview', async (request: any, reply: any) => {
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

  // Get provider credits/usage (currently only ElevenLabs)
  fastify.get('/api/provider/credits', async (request: any, reply: any) => {
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
}
