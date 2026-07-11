import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Take } from '../types/index.js';

const execFileAsync = promisify(execFile);

export type PreflightCheck = {
  id: 'provider' | 'voice' | 'ffprobe' | 'ffmpeg' | 'quota';
  status: 'ready' | 'warning' | 'blocked';
  message: string;
};

export async function hasCommand(command: string): Promise<boolean> {
  try {
    await execFileAsync(command, ['-version']);
    return true;
  } catch {
    return false;
  }
}

export function summarizePreflight(checks: PreflightCheck[]) {
  return {
    ready: checks.every((check) => check.status !== 'blocked'),
    checks,
  };
}

export function estimateGenerationSpend(input: {
  mediaType: 'dialogue' | 'music' | 'sfx';
  prompt: string;
  approvalTarget: number;
  minCandidates: number;
  takes: Take[];
  completionOverride?: boolean;
}) {
  const approved = input.takes.filter((take) => take.status === 'approved').length;
  const undecided = input.takes.filter((take) => take.status === 'new').length;
  const complete = input.completionOverride === true && approved > 0 || approved >= Math.max(1, input.approvalTarget);
  const takesToGenerate = complete ? 0 : Math.max(0, Math.max(input.minCandidates, input.approvalTarget - approved) - undecided);
  const estimatedCharacters = input.mediaType === 'dialogue'
    ? input.prompt.trim().length * takesToGenerate
    : null;
  return { takes_to_generate: takesToGenerate, provider_requests: takesToGenerate, estimated_characters: estimatedCharacters };
}
