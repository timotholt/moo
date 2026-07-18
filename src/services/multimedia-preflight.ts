import type {
  AssetKind,
  GenerationRequest,
  ProviderCapabilities,
} from './generators/types.js';

export type PreflightStatus = 'ready' | 'warning' | 'blocked';

export interface PreflightCheck {
  code: string;
  status: PreflightStatus;
  message: string;
}

/** Availability must be supplied by the caller; this evaluator never probes the host. */
export interface LocalToolAvailability {
  ffprobe?: boolean;
  ffmpeg?: boolean;
  backgroundRemoval?: boolean;
}

export interface MultimediaPreflightInput {
  request: GenerationRequest;
  providerId: string;
  capabilities: ProviderCapabilities;
  credentialConfigured: boolean;
  tools?: LocalToolAvailability;
  candidateCount: number;
  /** A provider-specific estimate for one submitted generation operation. */
  perOperationCost?: number;
  currency?: string;
  /** Maximum spend permitted for this job, in the estimate currency. */
  jobBudget?: number;
  /** Enables transparency when the provider cannot create it natively. */
  transparencyPostprocessConfigured?: boolean;
}

export interface CostEstimate {
  providerRequests: number;
  perOperation?: number;
  maximumExposure?: number;
  currency?: string;
  known: boolean;
}

export interface MultimediaPreflightResult {
  status: PreflightStatus;
  checks: PreflightCheck[];
  estimate: CostEstimate;
}

const RATIO_TOLERANCE = 0.02;

function check(code: string, status: PreflightStatus, message: string): PreflightCheck {
  return { code, status, message };
}

function isPositive(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

function isNonNegative(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}

function needsFfprobe(kind: AssetKind): boolean {
  return kind === 'dialogue' || kind === 'music' || kind === 'sfx' || kind === 'video';
}

/**
 * Evaluates generation readiness without network, filesystem, or vendor-price
 * access. Blocked checks prevent submission; warnings preserve useful context.
 */
export function evaluateMultimediaPreflight(input: MultimediaPreflightInput): MultimediaPreflightResult {
  const { request, capabilities, providerId, tools = {} } = input;
  const checks: PreflightCheck[] = [];
  const capability = capabilities.media[request.assetKind];

  if (capabilities.providerId !== providerId) {
    checks.push(check('provider-id-mismatch', 'blocked', 'Selected provider does not match the supplied capabilities.'));
  }
  if (!input.credentialConfigured) {
    checks.push(check('credential-missing', 'blocked', `Credentials for ${providerId} are not configured.`));
  }
  if (!capability) {
    checks.push(check('unsupported-kind', 'blocked', `${providerId} does not support ${request.assetKind} generation.`));
  }
  if (!Number.isInteger(input.candidateCount) || input.candidateCount <= 0) {
    checks.push(check('candidate-count-invalid', 'blocked', 'Candidate count must be a positive whole number.'));
  }

  const delivery = request.delivery;
  if (request.assetKind === 'dialogue' && !request.settings?.voiceId) {
    checks.push(check('dialogue-voice-required', 'blocked', 'Dialogue generation requires a voice.'));
  }

  for (const [field, value] of [
    ['width', delivery?.width],
    ['height', delivery?.height],
    ['durationSeconds', delivery?.durationSeconds],
    ['frameRate', delivery?.frameRate],
  ] as const) {
    if (value !== undefined && !isPositive(value)) {
      checks.push(check(`invalid-${field}`, 'blocked', `${field} must be a positive number when specified.`));
    }
  }

  if (request.assetKind === 'video') {
    const aspectRatio = delivery?.aspectRatio;
    if (aspectRatio !== '16:9' && aspectRatio !== '9:16') {
      checks.push(check('video-aspect-ratio-required', 'blocked', 'Video requires an exact 16:9 or 9:16 aspect ratio.'));
    } else if (capability?.aspectRatios && !capability.aspectRatios.includes(aspectRatio)) {
      checks.push(check('video-aspect-ratio-unsupported', 'blocked', `${providerId} does not support ${aspectRatio} video.`));
    }
    const width = delivery?.width;
    const height = delivery?.height;
    if (isPositive(width) && isPositive(height) && aspectRatio) {
      const expected = aspectRatio === '16:9' ? 16 / 9 : 9 / 16;
      const actual = width / height;
      if (Math.abs(actual - expected) / expected > RATIO_TOLERANCE) {
        checks.push(check('video-dimensions-ratio-mismatch', 'blocked', 'Video dimensions do not match the requested aspect ratio.'));
      }
    }
  }

  if (delivery?.transparency) {
    const nativeTransparency = capability?.supportsTransparency === true;
    if (!nativeTransparency && !input.transparencyPostprocessConfigured) {
      checks.push(check('transparency-unavailable', 'blocked', 'Transparency requires native provider support or configured post-processing.'));
    }
    if (!nativeTransparency && input.transparencyPostprocessConfigured && !tools.backgroundRemoval) {
      checks.push(check('background-removal-unavailable', 'blocked', 'Configured transparency post-processing requires a background-removal tool.'));
    }
  }

  if (needsFfprobe(request.assetKind) && !tools.ffprobe) {
    checks.push(check('ffprobe-unavailable', 'blocked', 'FFprobe is required to inspect generated media.'));
  }
  if (request.assetKind === 'video' && !tools.ffmpeg) {
    checks.push(check('ffmpeg-unavailable', 'blocked', 'FFmpeg is required to process generated video.'));
  }

  const providerRequests = Number.isInteger(input.candidateCount) && input.candidateCount > 0
    ? input.candidateCount
    : 0;
  const estimateKnown = isNonNegative(input.perOperationCost) && Boolean(input.currency);
  const estimate: CostEstimate = {
    providerRequests,
    known: estimateKnown,
    ...(estimateKnown
      ? {
          perOperation: input.perOperationCost,
          maximumExposure: input.perOperationCost! * providerRequests,
          currency: input.currency,
        }
      : {}),
  };
  if (!estimateKnown) {
    checks.push(check('cost-estimate-unknown', 'warning', 'No complete per-operation cost estimate is available.'));
  }
  if (input.jobBudget !== undefined && (!Number.isFinite(input.jobBudget) || input.jobBudget < 0)) {
    checks.push(check('budget-invalid', 'blocked', 'Job budget must be a non-negative number.'));
  } else if (estimate.known && input.jobBudget !== undefined && estimate.maximumExposure! > input.jobBudget) {
    checks.push(check('budget-exceeded', 'blocked', 'Maximum estimated exposure exceeds the job budget.'));
  }

  const status: PreflightStatus = checks.some(({ status: value }) => value === 'blocked')
    ? 'blocked'
    : checks.some(({ status: value }) => value === 'warning') ? 'warning' : 'ready';
  return { status, checks, estimate };
}
