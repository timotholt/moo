# MOO Multimedia Authoring End State

## Purpose and product boundary

MOO is a local-first authoring system for creating, reviewing, approving, publishing, and tracing game-ready media. It supports audio, transparent still images, video, and collectible-card-game (CCG) assets through one candidate-review lifecycle.

MOO is not a game runtime, a card-rules editor, or a generic digital-asset manager. It produces approved, reproducible media packages that a game project consumes. MOO does not read from, write to, or couple itself to a game repository.

The end state supports:

- Audio: dialogue, music, and sound effects.
- Images: illustrations, icons, and isolated subjects that require transparency.
- Video: landscape (`16:9`) and portrait (`9:16`) deliverables.
- CCG cards: first-class card ownership, named media slots, and deterministic card-face composition.

Every generated asset is a candidate until a human approves it. A request is complete when its completion policy is satisfied; an author can explicitly finish early once human taste has enough acceptable material.

## Canonical entities

The model separates an authoring request from each generated candidate and from the published result.

| Entity | Responsibility |
| --- | --- |
| Project | Local MOO workspace, provider settings, catalogs, defaults, output locations, and lifecycle policy. |
| Owner | A named source of media: actor, scene, global scope, or card. |
| Card | A CCG entity with stable ID, gameplay-facing metadata, asset slots, and composition definition. |
| Asset request | The canonical instruction to produce one kind of deliverable for an owner. It includes prompt, delivery profile, provider selection, inherited defaults, and completion policy. |
| Generation job | MOO-managed work item that may submit one or more provider operations and records queue, cancellation, retry, cost, and recovery state. |
| Provider operation | One durable operation at an external provider. It has a provider operation ID and may be synchronous or asynchronous. |
| Candidate | One downloaded and inspected generated asset, historically called a take. It preserves prompt, resolved settings, provider result, review state, and local file reference. |
| Review | Human decision and note for a candidate: approved, rejected, or undecided. |
| Selection | An approved candidate chosen as the current deliverable for an asset request or card slot. |
| Inspection | Measured technical facts and validation result for a candidate after download and normalization. |
| Publication | Immutable export manifest and copied/linked deliverables for a named release. |
| Snapshot | Restorable catalog state captured before a mutation; deleting catalog records must not silently delete generated media files. |

`AssetKind` is canonical: `dialogue`, `music`, `sfx`, `image`, or `video`. Delivery profiles are typed per kind rather than free-form prompt conventions. Video profile aspect ratios are exactly `16:9` and `9:16`.

## Unified provider-capability contract

Providers implement capabilities and operations, not audio-specific interfaces. The provider layer never decides approval, publication, or lifecycle completion.

```ts
type AssetKind = 'dialogue' | 'music' | 'sfx' | 'image' | 'video';

type OperationStatus =
  | 'submitted'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

interface ProviderCapabilities {
  provider: string;
  assetKinds: AssetKind[];
  synchronousKinds: AssetKind[];
  asynchronousKinds: AssetKind[];
  image?: { supportsNativeAlpha: boolean; supportsReferenceImages: boolean };
  video?: { aspectRatios: Array<'16:9' | '9:16'>; durationsSeconds: number[] };
}

interface GenerationRequest {
  assetRequestId: string;
  assetKind: AssetKind;
  prompt: string;
  provider: string;
  deliveryProfile: Record<string, unknown>;
  resolvedSettings: Record<string, unknown>;
}

interface ProviderOperation {
  providerOperationId: string;
  status: OperationStatus;
  progress?: number;
  providerMetadata: Record<string, unknown>;
}

interface GeneratedAsset {
  bytes: Buffer;
  mimeType: string;
  filenameHint?: string;
  providerMetadata: Record<string, unknown>;
}

interface AssetGenerator {
  capabilities(): ProviderCapabilities;
  submit(request: GenerationRequest): Promise<ProviderOperation>;
  poll(operation: ProviderOperation): Promise<ProviderOperation>;
  download(operation: ProviderOperation): Promise<GeneratedAsset>;
}
```

An immediately returned audio or image result is represented as a completed provider operation. Long-running video work stays durable in `submitted` or `processing` until it can be downloaded. MOO records the provider operation before moving on so a restart never loses externally submitted work.

## Job execution and cancellation

Generation jobs own MOO scheduling. They submit work only while active, persist every state transition, and collect completed results into candidates.

Cancellation is intentionally **stop submitting**, not provider cancellation:

1. Mark the MOO generation job as cancelling.
2. Do not submit another provider operation after the currently submitting operation has settled.
3. Do not ask the provider to cancel an already-submitted operation.
4. Continue polling and harvesting all submitted operations until each completes or definitively fails.
5. Mark the MOO job cancelled only after submitted work has been collected or terminally failed.

This preserves paid work, respects the author’s decision to stop spending on additional attempts, and makes cancellation behavior identical for audio, image, and video.

Retries create a new provider operation and retain the failed operation’s metadata. They never overwrite history. Completion policy is evaluated after each reviewed candidate: a request becomes complete when the minimum approved count is met or the author invokes Finish Early.

## Media inspection and post-processing

Generation bytes are never treated as ready merely because a provider reported success. Each candidate follows this pipeline:

```text
provider operation → download → secure local staging → inspect → normalize/post-process
                  → validate delivery profile → durable candidate → human review
```

Shared inspection records SHA-256 hash, byte size, MIME type, provider metadata, timestamps, and normalized filename.

Audio inspection uses FFprobe and records duration, codec, container, sample rate, channels, loudness where available, and peak/format validation. Optional normalization is explicit and provenance-preserving.

Image inspection records format, width, height, color mode/profile, alpha presence, and alpha coverage. PNG is the canonical output for assets requiring transparency.

Video inspection uses FFprobe and records width, height, duration, frame rate, codec/container, bitrate, audio-track facts, and poster-frame location. It validates the requested delivery profile rather than trusting a provider prompt. `16:9` and `9:16` are separate deliverables; MOO must not auto-crop one approved composition into the other.

Post-processing is a named, persisted stage. It may transcode, normalize, extract a poster image, or remove a background, but it must retain the original provider output and record the tool/version/settings used.

## Transparency policy

Transparency is a delivery requirement, not a prompt adjective.

An image profile may require `alpha: required`, `preferred`, or `forbidden`. For `required`:

1. Prefer a provider capability that produces native alpha.
2. Inspect the actual downloaded image for non-opaque pixels.
3. If alpha is absent, run the configured background-removal/segmentation post-process stage.
4. Normalize the result to PNG and validate alpha again.
5. Reject the candidate automatically as technically invalid if the requirement remains unmet, while retaining the original and diagnostic reason.

Prompts should still request an isolated subject and clean background to improve segmentation quality, but prompt language never substitutes for alpha validation. The author reviews the resulting cutout, including visual edge quality, before approval.

## Card ownership, slots, and composition

Cards are first-class owners; they are not actors or scenes with overloaded metadata. Each card has a stable ID and a fixed or project-configurable slot schema. A default CCG schema can include:

| Slot | Asset kind | Typical delivery profile |
| --- | --- | --- |
| illustration | image | opaque or art-directed transparency, card-art dimensions |
| unit_cutout | image | transparent PNG |
| icon | image | transparent PNG, small dimensions |
| summon_sfx | sfx | game audio profile |
| attack_sfx | sfx | game audio profile |
| defeat_sfx | sfx | game audio profile |
| promo_landscape | video | `16:9` |
| promo_portrait | video | `9:16` |

A slot points to one asset request, which has its own candidates, approvals, selection, and Finish Early override. Slots may share a selected candidate only when their delivery profiles are compatible; different orientations are distinct requests.

The final card face is deterministic composition, not a generated image. MOO combines approved artwork with versioned layout templates, typography, frames, costs, icons, rules text, and card metadata through SVG, Canvas, or HTML rendering. A layout render records template version, input IDs/hashes, and output hash so gameplay/balance edits can re-render a card without regenerating illustration.

## Review and authoring interface

All asset kinds share the same candidate list, review decisions, selection, notes, batch operations, keyboard controls, and completion state. The preview renderer is kind-specific:

- Audio: playback, waveform where available, duration, and technical facts.
- Image: checkerboard alpha background, zoom, dimensions, and alpha validation result.
- Video: native playback, poster frame, orientation badge, duration, dimensions, and audio-track facts.
- Card: deterministic rendered face plus direct links to the selected source slots.

The interface surfaces technical invalidity separately from human rejection. An approved candidate is not publishable until its delivery-profile validation succeeds.

## Mixed-media publishing

Publishing creates an immutable release directory and manifest. It validates selection and technical readiness of every required request or card slot before copying/processing release files.

```text
release/
  manifest.json
  audio/
  images/
  video/
    landscape/
    portrait/
  cards/
    rendered/
    source-art/
```

The manifest includes release ID, asset request IDs, selected candidate IDs, owner/card/slot IDs, relative files, SHA-256 hashes, MIME types, delivery profiles, inspection results, provider/model metadata, prompt/settings provenance, composition template versions, and export timestamps. Publication is atomic: a release becomes visible only after all files and manifest validation complete.

## Credentials, preflight, and cost

Credentials are stored in MOO’s local server-side configuration and intentionally displayed in local Settings when the product is configured for a trusted single-user machine. They are never required in browser local storage.

Provider credentials are capability-scoped, for example ElevenLabs for audio, OpenAI for images/video, Google for images/video, and a configured background-removal service if needed. Optional providers remain disabled until their key and supported capabilities are present.

Before submission, preflight must:

- Validate provider key/configuration and requested capability.
- Validate the request’s model, resolution, duration, aspect ratio, voice/reference inputs, and delivery profile against provider capabilities.
- Confirm local tools such as FFmpeg/FFprobe and background-removal dependencies when the pipeline requires them.
- Estimate cost per operation and maximum batch exposure using provider-specific pricing metadata or clearly label an estimate unavailable.
- Apply project quota, per-job budget, and concurrency limits.
- Show exactly what will be submitted and the estimate before author confirmation.

Cost records attach to provider operations and are summed at job, request, card, project, and release levels. Estimates never masquerade as final provider billing.

## Restart recovery and reliability

All mutable catalog writes are serialized and atomic. Jobs, provider operations, candidate creation, reviews, selections, snapshots, and releases persist before a state transition is acknowledged.

On startup MOO reconciles non-terminal jobs:

1. Reload pending provider operations.
2. Poll each provider operation using persisted provider metadata.
3. Download completed work exactly once using an idempotency key/hash.
4. Resume post-processing and inspection from the first incomplete persisted stage.
5. Surface terminal failures with provider diagnostics and a retry path.

Restart recovery must not submit duplicate paid work. An operation with an unknown provider state remains recoverable and visible to the author instead of being silently discarded.

## Migration and compatibility stance

There are no production users, legacy projects, or pre-existing asset libraries that require migration. MOO may make a clean schema break while preserving the current audio authoring behavior in the new model.

Compatibility means:

- Existing audio concepts map directly to generic asset requests and candidates.
- Existing local data may be discarded during the refactor, with an explicit development-only reset path.
- Existing release tags remain historical artifacts; no attempt is made to maintain binary or file-schema compatibility.
- The public API and internal storage are versioned from the new multimedia schema forward.

## Implementation milestones

### 1. Generic generation control plane

Replace audio-specific generation interfaces with the provider-capability, provider-operation, and generated-asset contracts. Adapt ElevenLabs as a synchronous-completion provider without changing visible audio behavior.

Acceptance criteria:

- Audio generation, review, approval, selection, Finish Early, retry, and export continue to work.
- A fake synchronous provider and fake asynchronous provider pass contract tests.
- Generation persistence records every provider operation before polling/download.
- The core scheduler has no ElevenLabs, FFprobe, waveform, or image/video branching.

Technical debt removed: `AudioProvider`-only factory, audio-only job types, and provider assumptions embedded in scheduler code.

### 2. Durable asynchronous operations and recovery

Implement operation polling, idempotent downloads, startup reconciliation, and the stop-submitting cancellation policy.

Acceptance criteria:

- A queued fake video operation survives process restart and becomes one candidate after completion.
- Cancelling a job submits no new work but harvests every already-submitted operation.
- Retry histories and provider diagnostics are retained.
- No restart can submit an operation twice.

Technical debt removed: in-memory-only generation progress and cancellation paths that discard paid work.

### 3. Shared inspection and normalization pipeline

Move media validation out of generation into durable inspectors and post-processors.

Acceptance criteria:

- Audio, image, and video inspection contracts produce persisted technical facts.
- FFprobe failure is reported as a candidate validation failure, not an opaque job crash.
- Post-processing preserves original bytes and tool provenance.
- Publishing rejects selected candidates that fail required profile validation.

Technical debt removed: audio metadata assumptions in candidate creation and export.

### 4. Image generation and transparency pipeline

Add OpenAI and Google image adapters, native-alpha capability reporting, alpha inspection, and fallback background removal.

Acceptance criteria:

- A transparent-PNG request either produces a validated PNG or a visible technical failure.
- Provider capability preflight blocks unsupported transparency/model combinations.
- Image candidate review has checkerboard preview, zoom, dimensions, and alpha status.
- Cost estimates and provenance display provider/model/settings.

Technical debt removed: dormant image fields without an actual backend generation and validation path.

### 5. Video generation and orientation profiles

Add video adapters and durable provider operations for `16:9` and `9:16` delivery profiles.

Acceptance criteria:

- Both orientations submit, poll, recover, inspect, and review as distinct requests.
- FFprobe validates actual dimensions, duration, frame rate, codec, and audio track facts.
- Video preview displays playback, poster frame, and orientation.
- Cancellation preserves and harvests submitted video work.

Technical debt removed: prompt-only orientation expectations and media UI limited to audio playback.

### 6. Unified multimedia review workspace

Complete kind-specific previews while retaining one review, selection, batch, and completion system.

Acceptance criteria:

- Review notes, keyboard controls, bulk actions, selection, snapshots, and Finish Early work for every asset kind.
- Technically invalid candidates cannot be selected or published without an explicit, audited override policy.
- Filtering and queue progress work across mixed media.

Technical debt removed: audio-centric labels, waveform-only assumptions, and fragmented approval UX.

### 7. First-class cards and asset slots

Add card catalog entities, stable IDs, slot schemas, and per-slot asset requests.

Acceptance criteria:

- A card can own image, audio, and both video-orientation slots.
- Each slot has independent lifecycle, selection, provenance, and completion state.
- Card-specific defaults inherit predictably without corrupting actor/scene/global behavior.
- No game repository integration is needed for card fixtures or tests.

Technical debt removed: ownership constrained to actor/scene/global and unstructured card asset naming.

### 8. Deterministic card composition and mixed-media publication

Render card faces from approved source assets and publish complete, atomically validated releases.

Acceptance criteria:

- The same template version and selected inputs produce the same card output hash.
- A card can re-render after gameplay metadata changes without regenerating art.
- Release manifests include all selected audio, images, video, card outputs, and provenance.
- Missing required slots prevent publication with actionable errors.

Technical debt removed: image-model-generated card layouts, audio-only export layout, and incomplete release manifests.

### 9. Operations hardening and release readiness

Finish preflight, budgets, credentials UX, recovery tests, documentation, packaging, and end-to-end validation.

Acceptance criteria:

- Credential, capability, toolchain, budget, and cost preflight covers every enabled provider.
- Restart, provider failure, cancellation, retry, invalid media, and atomic publication have automated tests.
- A clean machine can run the documented launcher and verification gates.
- A release-quality sample project produces approved audio, transparent image, both video orientations, and a composed card package.

Technical debt removed: manual environment assumptions, incomplete cost controls, and unproven release workflows.

## Definition of done

MOO is complete for this scope when an author can create a card or other owner, generate audio, transparent imagery, and both video orientations through configured providers, review and approve candidates, finish early when sufficient material exists, recover safely after restart or cancellation, deterministically compose cards, and publish one verified mixed-media release with complete provenance and bounded cost.
