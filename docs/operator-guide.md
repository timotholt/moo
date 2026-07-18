# MOO operator guide

## What MOO manages

MOO is a trusted, single-user authoring application. It manages generated
audio, images, video, and card compositions through the same lifecycle:
prompt, preflight, generation, technical inspection, human review, selection,
and publication.

The current local launch has two processes:

| Process       | Address                 | Responsibility                             |
| ------------- | ----------------------- | ------------------------------------------ |
| Solid/Vite UI | `http://localhost:6001` | Browser authoring interface                |
| Fastify API   | `http://127.0.0.1:6000` | Catalog, generation, media, and publishing |

Both bind locally. Keep the terminal running while using MOO.

## First launch

Install Node `20.20.2`, pnpm `11.7.0` (the declared engine accepts
`>=11.7.0 <12`), and FFmpeg. With Homebrew, FFmpeg can normally be installed
with `brew install ffmpeg`; verify the actual commands MOO uses with:

```sh
node --version
pnpm --version
ffmpeg -version
ffprobe -version
```

Then launch from the MOO repository root:

```sh
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm run dev:app
```

Open `http://localhost:6001`. If a port is occupied, stop the old MOO/Vite
process before relaunching; the ports are currently fixed in source/config.

## Provider setup

Open **Settings** and configure only the capabilities you intend to use.

| Setting            | Required for                                 | Optional otherwise |
| ------------------ | -------------------------------------------- | ------------------ |
| ElevenLabs API key | Dialogue, music, and sound-effect generation | Yes                |
| OpenAI API key     | OpenAI image generation and Sora video       | Yes                |
| Google AI API key  | Gemini image generation and Veo video        | Yes                |
| Groq API key       | Generate Prompt and Improve Prompt actions   | Yes                |

Groq is the only implemented prompt-improvement LLM provider. It is not
required for media generation; prompts can always be written and edited by
hand. OpenAI and Google keys used for media generation do not currently replace
the separate Groq prompt-assistance key.

There is no `.env` setup. A source-development launch writes provider and LLM
settings to:

```text
<MOO checkout>/.moo-config.json
```

Packaged mode stores the same file beneath the platform’s user-data directory
(`~/Library/Application Support/MOO` on macOS). The file contains plaintext
local credentials and the UI intentionally returns and displays them in full.
Treat it as trusted local storage and do not copy it into a release.

## Local tool setup

`ffprobe` is required to inspect generated audio and video. `ffmpeg` is used for
audio processing and is required by video preflight.

Transparent image output may additionally require `rembg`. MOO invokes the
command-line form:

```sh
rembg i input-file output-file
```

Install `rembg` using its upstream instructions and ensure that executable is
on the same `PATH` used to launch MOO. MOO does not install FFmpeg, model files,
or `rembg`. A provider result that already contains valid alpha does not need
background removal.

Before spending provider credits, use MOO’s request preflight. For the older
audio-only command-line proof, run:

```sh
pnpm run audio:preflight
```

## Media and card workflow

1. Create a project from the welcome screen.
2. Create the owner: actor, scene, global scope, or card.
3. Add a media request with the intended asset kind and delivery profile.
4. For a card, define typed slots and assign each slot to a matching media
   request. Portrait and landscape videos are separate requests.
5. Write the prompt or optionally use Groq to generate/improve it.
6. Run preflight and read the provider, capability, local-tool, and estimated
   cost result.
7. Generate candidates. Already-submitted provider work is harvested even if
   the job is cancelled; cancellation stops further submissions.
8. Inspect previews, approve or reject takes, and select an approved take as the
   deliverable.
9. Use **Finish Early** once the approved material is good enough. It avoids
   paying for candidates that human taste no longer needs.
10. For cards, render the deterministic SVG after every required slot has a
    selected approved take.
11. Choose **Publish Release**. Publication validates selected sources and card
    slots before creating an immutable export package.

## Data and backup locations

For source development, all paths below are relative to the checkout. Packaged
mode puts the same layout beneath the platform user-data directory.

```text
.moo-config.json                         provider and prompt-assistance keys
projects/
  <project-name>/
    .moo/
      config.json                        project identity/schema
      actors.jsonl
      cards.jsonl
      scenes.jsonl
      bins.jsonl
      media.jsonl
      takes.jsonl
      generation-jobs.jsonl
      generation-operations.jsonl        restart/recovery records
      releases.jsonl
      snapshots.jsonl
      redo-snapshots.jsonl
      indexes/                           rebuildable indexes
    defaults.json
    actors/                              generated actor-owned files
    cards/                               card source and rendered files
    scenes/                              generated scene-owned files
    global/                              generated global files
    exports/
      <release-id>/manifest.json         immutable publication manifest
```

Back up the whole project directory, not only `.moo/`: the catalog refers to
generated files outside that metadata directory. Back up `.moo-config.json`
separately only if retaining plaintext credentials is desired.

Deleting an entire project from the welcome screen removes that managed project
directory. Catalog-level deletes have snapshot behavior and may retain generated
files, but that is not a substitute for a backup.

## Troubleshooting

- `pnpm is unavailable`: install/activate Node 20.20.2, run
  `corepack enable`, then `corepack prepare pnpm@11.7.0 --activate` if your
  Corepack installation has not provisioned pnpm.
- UI opens but API calls fail: confirm `pnpm run dev:app` shows both processes
  and that `http://127.0.0.1:6000/api/health` returns `{"status":"ok"}`.
- Generation preflight reports FFmpeg/FFprobe missing: launch from a shell whose
  `PATH` includes both executables.
- Transparent image preflight reports background removal missing: install
  `rembg`, configure the background-removal provider, or use an image that
  already has valid alpha.
- A provider is unavailable: save its key in Settings, enable it, and choose a
  model supported by the requested asset kind.
