import fs from 'fs-extra';
import { getProjectPaths } from '../utils/paths.js';

// Minimal shape for .vof/config.json used by M2.5
export interface ElevenLabsProviderConfig {
    api_key: string;
    api_url?: string;
}

export interface VofConfig {
    providers?: {
        elevenlabs?: ElevenLabsProviderConfig;
    };
}

export async function loadConfig(projectRoot: string): Promise<VofConfig> {
    const paths = getProjectPaths(projectRoot);
    const configPath = paths.vof.config;

    if (!(await fs.pathExists(configPath))) {
        return {};
    }

    const data = await fs.readJson(configPath);
    // We keep validation light here; JSON Schema could be added later if needed
    return data as VofConfig;
}

export async function saveConfig(projectRoot: string, config: VofConfig): Promise<void> {
    const paths = getProjectPaths(projectRoot);
    await fs.ensureDir(paths.vof.dir);
    await fs.writeJson(paths.vof.config, config, { spaces: 2 });
}
