# MOO Rewrite Plan and Gap Register

## Phase 0 — Stabilize the foundation

| Gap | Impact | Resolution |
|---|---|---|
| Two competing data models | Resolved | V2 `media.jsonl` and derived cue lifecycle are the only live catalog/completion model |
| `moo init` is a TODO | High: no reliable CLI project creation | Implement shared initializer used by API and CLI |
| Project files are initialized inconsistently | High: missing jobs/redo/index directories | Centralize project layout creation |
| Credentials are split and a key was committed | Resolved in product | ElevenLabs and AI prompt settings use one local server config. Any key rotation remains an operator action. |
| pnpm/Node setup is not reproducible | Resolved | Node/pnpm versions are pinned in `.nvmrc` and `package.json`; bootstrap instructions use frozen lockfile installs |

## Phase 1 — Cue lifecycle and review truth

| Gap | Impact | Resolution |
|---|---|---|
| `all_approved` is manually toggled | Resolved | Completion is derived from take lifecycle and Finish Early; the legacy flag is removed from live media data |
| No selected deliverable state | Resolved | Explicit selected approved take references drive publishing |
| No rejection reason/review notes | Resolved | Takes persist a freeform review note and review timestamp; local-first MOO has no required reviewer identity |
| No review queue | Resolved | Server-derived queue prioritizes undecided takes, stalled cues, and untouched cues while honoring Finish Early |

## Phase 2 — Generation control plane

| Gap | Impact | Resolution |
|---|---|---|
| Two batch pathways | Resolved | Batch endpoints delegate to one persisted job service |
| Service batch supports dialogue only | Resolved | Dialogue, SFX, and music use the same job model |
| No retry/cancel/idempotency/cost control | Resolved operationally | Jobs deduplicate, stop on lifecycle completion, retry, cooperatively cancel, and show request/character/quota preflight estimates |
| Prompt improvement key is browser-local | Resolved | AI provider, key, model, and system prompts are stored in MOO's local server config and used server-side |

## Phase 3 — Library authoring and delivery

| Gap | Impact | Resolution |
|---|---|---|
| Cue identity is only a name/prompt | Resolved | Cue key, tags, variant group, locale, loop, mix, and export filename are catalog fields and manifest output |
| No exporter | Resolved | Versioned package/manifest exporter validates selected approved takes and publishes atomically |
| No release tracking | Resolved | Published releases are durable catalog records and visible in System → published releases |

## Phase 4 — Hardening

| Gap | Impact | Resolution |
|---|---|---|
| Failing generation tests | Resolved | Canonical lifecycle, cancellation, preflight, publishing, snapshots, and storage behavior have focused regression coverage |
| ffmpeg absent/implicit | Resolved locally | Per-cue preflight and `npm run audio:preflight` make required tooling explicit; CI setup can run the same command once CI is introduced |
| Snapshot scope excludes takes/files | Partial | Snapshots now include take catalog state; physical media file deletion remains irreversible and must be surfaced separately |
| Flat-file concurrent writes unguarded | Resolved locally | Same-directory atomic JSONL replacement plus per-project server write serialization protects local catalog mutations |

## Rewrite sequence

1. Canonical project initializer.
2. Derived lifecycle service and API response contract.
3. Selected takes and review annotations.
4. Unified persisted generation jobs.
5. Review queue and bulk operations.
6. Versioned exporter and manifest.
7. Hardened test/CI/release workflow.

## Current rewrite starting point

The first code slice introduces derived cue lifecycle as a read model. It does not mutate existing projects and lets the UI and generation service converge on one definition of completeness before the legacy flag is retired.
