# MOO Rewrite Plan and Gap Register

## Phase 0 — Stabilize the foundation

| Gap | Impact | Resolution |
|---|---|---|
| Two competing data models | High: catalog writes/readers disagree | Declare V2 canonical; add migration; stop legacy writes |
| `moo init` is a TODO | High: no reliable CLI project creation | Implement shared initializer used by API and CLI |
| Project files are initialized inconsistently | High: missing jobs/redo/index directories | Centralize project layout creation |
| Credentials are split and a key was committed | Critical | Rotate key; remove tracked secret; use one local credential mechanism |
| pnpm/Node setup is not reproducible | Medium | Pin supported package manager and Node version |

## Phase 1 — Cue lifecycle and review truth

| Gap | Impact | Resolution |
|---|---|---|
| `all_approved` is manually toggled | High: completion can lie | Derive lifecycle from approved takes and policy |
| No selected deliverable state | High: approved does not mean shippable | Add selected take references per cue |
| No rejection reason/review notes | Medium | Add review annotations and reviewer timestamps |
| No review queue | High: slow daily workflow | Build a keyboard-first filtered review queue |

## Phase 2 — Generation control plane

| Gap | Impact | Resolution |
|---|---|---|
| Two batch pathways | High: divergent behavior | Replace with one persisted job service |
| Service batch supports dialogue only | High: incomplete product promise | Support dialogue, SFX, and music via the same job model |
| No retry/cancel/idempotency/cost control | High: unsafe spend and duplicate takes | Add job states, request keys, estimates, retries, cancellation |
| Prompt improvement key is browser-local | Medium | Keep secrets server-local; store only provider selection/preferences in UI |

## Phase 3 — Library authoring and delivery

| Gap | Impact | Resolution |
|---|---|---|
| Cue identity is only a name/prompt | High: cannot map cleanly to a game | Add cue keys, tags, variant groups, locale, loop and mix intent |
| No import/reconciliation flow | High: cannot manage human-created assets safely | Add file/folder import, metadata scan, missing/orphan reporting |
| No exporter | High: no usable game library artifact | Produce versioned audio packages and manifests |
| No release tracking | Medium | Track published release and selected take provenance |

## Phase 4 — Hardening

| Gap | Impact | Resolution |
|---|---|---|
| Failing generation tests | High | Test the canonical lifecycle/job workflow, not legacy expectations |
| ffmpeg absent/implicit | Medium | Add startup preflight and CI provisioning |
| Snapshot scope excludes takes/files | High | Expand undo policy; distinguish catalog undo from irreversible file operations |
| Flat-file concurrent writes unguarded | Medium | Add project write lock and atomic write/rename operations |

## Rewrite sequence

1. Canonical project initializer and V2 migration report.
2. Derived lifecycle service and API response contract.
3. Selected takes and review annotations.
4. Unified persisted generation jobs.
5. Review queue and bulk operations.
6. Import/reconcile and metadata recovery.
7. Versioned exporter and manifest.
8. Hardened test/CI/release workflow.

## Current rewrite starting point

The first code slice introduces derived cue lifecycle as a read model. It does not mutate existing projects and lets the UI and generation service converge on one definition of completeness before the legacy flag is retired.
