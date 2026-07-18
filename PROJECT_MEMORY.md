# MOO project memory

## Purpose

MOO (Media Output Organizer) is a local-first multimedia authoring tool built around prompt -> generation -> candidate review/approval -> selection -> publication. The end state supports audio, transparent images, `16:9` and `9:16` video, and first-class CCG cards with deterministic composition. Game integration is out of scope for the current MOO work.

## Runtime

- Repository: `https://github.com/timotholt/moo`
- Local checkout: `/Users/timotholt/Projects/moo`
- Package manager: pnpm (`pnpm-lock.yaml`)
- API: `pnpm run dev:api` (or `pnpm run dev`) starts `src/server.ts`, a Fastify server at `http://127.0.0.1:6000`.
- UI: `pnpm run dev:ui` starts Vite using `vite.solid.config.mjs`.
- UI: Vite runs at `http://127.0.0.1:6001` and proxies API/media requests to port 6000. Full local app: `pnpm run dev:app` runs API and UI concurrently.
- Build/test checks: `pnpm run verify` (lint, TypeScript build, Vitest tests).

## Persistence model

MOO currently uses filesystem data, not SQLite or another database.

- The server treats its working directory as the app root and discovers projects under `<cwd>/projects`.
- A valid project has a `.moo/` directory.
- Project catalog/metadata is intended under `<project>/.moo/`: `config.json`, `actors.jsonl`, `scenes.jsonl`, `bins.jsonl`, `media.jsonl`, `takes.jsonl`, and `snapshots.jsonl`.
- Project defaults are `<project>/defaults.json`.
- Generated media is stored under project-root folders: `actors/`, `scenes/`, `global/`, and `exports/`.
- The checked-in sample data is older/legacy-shaped (`catalog/*.jsonl`, `projects/test/*`) and does not fully match the V2 `.moo/` path convention.
- Generation jobs and history are also represented as JSONL in the legacy sample/catalog layout.
- Durable provider operations use `<project>/.moo/generation-operations.jsonl` so submitted asynchronous work can be reconciled after restart.
- Global ElevenLabs credentials are read from `<app cwd>/.moo-config.json`; project-specific provider configuration is read from `<project>/.moo/config.json`.

## Current implementation facts

- Project creation is implemented by the API and initializes the V2 `.moo/` JSONL files, media folders, config, and defaults.
- The CLI `moo init <path>` and API project creation both use the canonical V2 project initializer.
- Take review decisions persist `status_changed_at` and `reviewed_at`; expanded take details provide a persistent local-first `review_note`.
- System → review queue is server-derived from cue lifecycle and excludes cues that meet their target or were finished early.
- MOO is clean-start only: live media has no legacy `all_approved` flag. Completion is derived from takes plus `completion_override` (Finish Early).
- Cancellation means stop submitting new provider work. Any provider operation already submitted is allowed to finish and must be harvested; MOO does not relabel remote paid work as cancelled.
- Prompt-improvement provider settings (including Groq keys) are stored in the same local server config as ElevenLabs and displayed in Settings; they are not browser-local.
- Local setup is pinned by `.nvmrc` and `packageManager`; use `pnpm install --frozen-lockfile` and `pnpm run audio:preflight`.
- The API keeps the selected project only in server process memory; it is not persisted across restarts.
- Removing a take, cue, bin, actor, or scene deletes catalog records only; generated source audio is retained on disk. Take removal creates a snapshot, so its catalog record can be restored. Irreversible file cleanup is deliberately a separate future action.
- The intended catalog source is JSONL. The flat-file spec also describes embedded audio metadata as a recovery/portability layer, but this should be verified against the active code before relying on it.

## Working assumptions

When extending MOO, preserve project-local portability and keep all game integration separate.

Current rewrite scope starts clean: there are no existing users, legacy project data, or audio files that must be migrated or imported. Do not spend implementation effort on compatibility, migration tooling, or existing-file ingestion unless that scope changes later.

Do not read, edit, stage, restore, or otherwise touch `/Users/timotholt/Projects/fireteam` or MOO's tracked `projects/fireteam/` paths. They are outside the authorized MOO rewrite scope. Do not touch CruelDeal unless the user explicitly requests it.

The multimedia end-state specification and nine-milestone implementation program live in `docs/multimedia-authoring-end-state.md`.

## Collaboration preference

- At the end of every implementation milestone, report the recommended next model and reasoning effort before continuing.
- Default to `gpt-5.6-terra` at `low` for bounded UI, test, documentation, and mechanical work; use `gpt-5.6-terra` at `medium` for generation, migration, reconciliation, and other cross-cutting contract changes.
