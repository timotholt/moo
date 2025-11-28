import type { VoiceSettings } from './provider-interface.js';
import { ElevenLabsCommonApi } from './elevenlabs-common.js';

// Default model - eleven_multilingual_v2 is a good balance of quality and compatibility
const DEFAULT_MODEL_ID = 'eleven_multilingual_v2';

export class ElevenLabsDialogApi {
  private common: ElevenLabsCommonApi;

  constructor(common: ElevenLabsCommonApi) {
    this.common = common;
  }

  async generateDialogue(
    text: string,
    voiceId: string,
    settings?: VoiceSettings,
    modelId?: string
  ): Promise<Buffer> {
    const path = `/text-to-speech/${voiceId}`;
    const effectiveModelId = modelId || DEFAULT_MODEL_ID;
    
    // v3 can cut off audio abruptly - add trailing ellipsis to create a natural pause
    let processedText = text;
    if (effectiveModelId === 'eleven_v3') {
      // Only add if text doesn't already end with punctuation that creates a pause
      const lastChar = text.trim().slice(-1);
      if (!['.', '!', '?', '…', ','].includes(lastChar)) {
        processedText = text.trim() + ' ...';
      }
    }

    const body = {
      text: processedText,
      model_id: effectiveModelId,
      voice_settings: settings || {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    };

    console.log('[ElevenLabsDialogApi] generateDialogue request:', { voiceId, modelId: body.model_id, textLength: processedText.length });

    return this.common.getAudio(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
}
