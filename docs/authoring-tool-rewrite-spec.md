# MOO Authoring Tool Rewrite Specification

## Decision

MOO will become a local-first game-audio authoring tool. A MOO project is the source of truth for authored cues, generation settings, review decisions, selected deliverables, and publishable library manifests. Fireteam remains outside this repository; MOO will export a stable, game-agnostic release package.

## Product contract

An author can create or import a cue, generate or ingest candidate takes, review them, approve the required number of takes, select deliverables, and publish a versioned audio library without losing provenance.

```text
Cue definition -> generation job -> take review -> derived approval -> selection -> publish manifest
```

## Canonical V2 project layout

```text
project/
  .moo/
    config.json
    actors.jsonl
    scenes.jsonl
    bins.jsonl
    media.jsonl
    takes.jsonl
    generation-jobs.jsonl
    snapshots.jsonl
    redo-snapshots.jsonl
    indexes/
  actors/
  scenes/
  global/
  exports/
  defaults.json
```

`media.jsonl` is the canonical cue catalog. Legacy `catalog/content.jsonl`, `sections.jsonl`, and `content_id` records are migration inputs only and must not receive new writes.

## Core entities

### Cue (`Media`)

A cue is a durable authoring request, not an individual audio file. It has a stable ID, owner, bin, media type, name, prompt, default overrides, and game-facing fields added during the rewrite:

- `cue_key`: stable, human-readable game key.
- `tags`: searchable contextual labels.
- `variation_group`: variants that belong together.
- `locale`, `looping`, `mix_bus`, and `export_filename` where relevant.
- explicit selected approved take IDs.

### Take

A take is an immutable candidate file plus generation/import provenance. The status is review state only: `new`, `approved`, `rejected`, or `hidden`.

### Lifecycle

Lifecycle is derived from cue policy and take records. It is not edited as a free boolean.

| Status | Rule |
|---|---|
| `draft` | no takes |
| `review_needed` | takes exist but approved count is below target |
| `approved` | approved count meets target |
| `published` | cue has selected approved take(s) in a published release |
| `needs_attention` | missing source file, invalid data, or failed generation |

The existing `all_approved` flag becomes a compatibility projection and will be removed after migration.

## Generation contract

There is one persisted job model for single and batch generation. Jobs record requested cues, resolved settings, provider/model, attempts, outcomes, cost/usage metadata when available, and terminal state. Jobs must be idempotent per cue/request key and safe to retry.

## Review and publish contract

- Approval target is evaluated from `approval_count_default` and approved takes.
- Selection is explicit: an approved take is not automatically a published deliverable.
- Publishing creates `exports/<release-id>/audio/` plus `manifest.json` and a human-readable report.
- The manifest carries cue key, selected files, hashes, duration, format, tags, loop/mix intent, and provenance.

## Clean-start scope

MOO is being rebuilt without existing users, legacy projects, or audio libraries to preserve. New projects use only the V2 layout. Migration, legacy compatibility, and existing-file import are explicitly out of scope unless future requirements introduce them.

## Quality gates

- Project initialization, migration, generation, lifecycle calculation, export, and metadata recovery have automated tests.
- Tests use temporary directories outside the repository.
- ffmpeg-dependent tests skip clearly when unavailable and run in CI with ffmpeg installed.
- `npm run verify` is the supported local check; package-manager/runtime requirements are declared and reproducible.
