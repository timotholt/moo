import fs from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(resolve(process.cwd(), 'src/ui-solid/components/SettingsDialog.jsx'), 'utf8');

describe('SettingsDialog generation provider settings', () => {
  it('uses the generic local provider API for all supported generation providers', () => {
    expect(source).toContain("id: 'elevenlabs'");
    expect(source).toContain("id: 'openai'");
    expect(source).toContain("id: 'google'");
    expect(source).toContain("id: 'background-removal'");
    expect(source).toContain("'/api/generation/providers/settings'");
    expect(source).toContain('`/api/generation/providers/${providerId}/settings`');
  });

  it('configures independent image/video models and local transparency tooling', () => {
    expect(source).toContain("key: 'image_model'");
    expect(source).toContain("key: 'video_model'");
    expect(source).toContain("key: 'executable'");
    expect(source).toContain('config: settings.config || {}');
  });

  it('keeps full local keys in the form, with intentional independent reveal controls', () => {
    expect(source).toContain('api_key: settings.api_key');
    expect(source).toContain('providerKeyVisibility');
    expect(source).toContain('Show ${provider.name} API key');
  });

  it('remains a SolidJS component without React', () => {
    expect(source).toContain("from 'solid-js'");
    expect(source).not.toMatch(/from ['"]react['"]/i);
  });
});
