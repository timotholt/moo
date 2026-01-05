/**
 * LLM Service for AI-powered prompt generation and improvement
 * Supports Groq (default), with extensible provider architecture
 */

// Debug flag for this module
const DEBUG_LLM = false;

// Default system prompts optimized for ElevenLabs Eleven v3
// Based on: https://elevenlabs.io/docs/best-practices/prompting/eleven-v3
export const DEFAULT_SYSTEM_PROMPTS = {
  generate: `Generate a short dialogue line for text-to-speech. Output ONLY the spoken text with an optional [emotion] tag.

Format: [emotion] Spoken words here.

Examples:
- "hi angry" → [angry] You killed my dog!
- "greeting happy" → [happy] Hey there! So great to see you!
- "farewell sad" → [sad] I guess this is goodbye...
- "question curious" → [curious] Wait, what did you just say?
- "warning urgent" → [urgent] Get out of there NOW!

Output ONLY the dialogue line. No explanations. No instructions. Just the text to be spoken.`,

  improve: `Add [emotion] tags and emphasis to this text for text-to-speech.

Rules:
- Add [tag] before text for emotion: [angry], [happy], [whispers], [sighs], etc.
- Use CAPS for emphasis
- Use ... for pauses
- Keep it short and natural
- Do NOT change the meaning

Example:
Input: "I can't believe you did that"
Output: [shocked] I can't BELIEVE you did that!

Output ONLY the improved text. No explanations.`
};

// Provider configurations
const PROVIDERS = {
  groq: {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.1-8b-instant',
    models: [
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B (Fast)' },
      { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B (Quality)' },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
    ],
    signupUrl: 'https://console.groq.com/keys'
  }
};

/**
 * Get list of available providers
 */
export function getProviders() {
  return Object.entries(PROVIDERS).map(([id, config]) => ({
    id,
    name: config.name,
    models: config.models,
    defaultModel: config.defaultModel,
    signupUrl: config.signupUrl
  }));
}

/**
 * Test connection to LLM provider
 */
export async function testConnection(provider, apiKey) {
  const config = PROVIDERS[provider];
  if (!config) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  if (!apiKey) {
    throw new Error('API key is required');
  }

  try {
    const response = await fetch(`${config.baseUrl}/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `HTTP ${response.status}`);
    }

    return { success: true, message: 'Connection successful' };
  } catch (err) {
    if (DEBUG_LLM) {
      console.error('[LLM] Connection test failed:', err);
    }
    throw new Error(`Connection failed: ${err.message}`);
  }
}

/**
 * Call LLM API
 */
async function callLLM(provider, apiKey, model, systemPrompt, userPrompt) {
  const config = PROVIDERS[provider];
  if (!config) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  if (!apiKey) {
    throw new Error('API key is required');
  }

  const requestBody = {
    model: model || config.defaultModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.7,
    max_tokens: 500
  };

  if (DEBUG_LLM) {
    console.log('[LLM] Request:', { provider, model: requestBody.model, userPrompt });
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  const result = data.choices?.[0]?.message?.content?.trim();

  if (DEBUG_LLM) {
    console.log('[LLM] Response:', result);
  }

  return result;
}

/**
 * Generate a prompt from media context
 */
export async function generatePrompt({ provider, apiKey, model, systemPrompt, mediaName, ownerName, mediaType }) {
  const system = systemPrompt || DEFAULT_SYSTEM_PROMPTS.generate;
  
  const userPrompt = `Generate a voice-over prompt for:
- Item: "${mediaName}"
- Component: "${ownerName || 'Global'}"
- Type: ${mediaType || 'dialogue'}`;

  return callLLM(provider, apiKey, model, system, userPrompt);
}

/**
 * Improve an existing prompt
 */
export async function improvePrompt({ provider, apiKey, model, systemPrompt, currentPrompt, mediaName, mediaType }) {
  const system = systemPrompt || DEFAULT_SYSTEM_PROMPTS.improve;
  
  const userPrompt = `Improve this voice-over prompt for ${mediaType || 'dialogue'} item "${mediaName}":

"${currentPrompt}"`;

  return callLLM(provider, apiKey, model, system, userPrompt);
}
