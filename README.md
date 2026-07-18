# MOO

MOO (Media Output Organizer) is a local-first authoring tool for generating,
reviewing, approving, selecting, and publishing game media. The current
pre-1.0 build supports audio, still images, `16:9`/`9:16` video, and
deterministically composed card assets.

MOO is an authoring tool, not a game runtime. It keeps its projects and exports
inside the MOO working directory and does not need access to a game repository.

## Launch locally

Requirements:

- macOS or Linux
- Node `24.14.0` (pinned in `.nvmrc`; `package.json` accepts Node 22.13–24)
- pnpm `11.7.0` (the declared engine accepts `>=11.7.0 <12`)
- `ffmpeg` and `ffprobe` on `PATH`
- `rembg` on `PATH` only when transparent output needs background removal

From the MOO checkout:

```sh
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm run dev:app
```

Open [http://localhost:6001](http://localhost:6001). The Solid UI runs on port
`6001` and proxies API/media requests to the local Fastify server on
`127.0.0.1:6000`.

Run MOO from its checkout directory. The current implementation resolves global
settings and its managed `projects/` directory from the process working
directory.

## Credentials

Configure credentials in the in-app Settings dialog:

| Credential | When it is needed                                      |
| ---------- | ------------------------------------------------------ |
| ElevenLabs | Audio generation                                       |
| OpenAI     | GPT Image or Sora image/video generation               |
| Google AI  | Gemini image or Veo video generation                   |
| Groq       | Optional prompt generation and prompt improvement only |

MOO does not currently load credentials from `.env`. Settings are written to
the local `<MOO checkout>/.moo-config.json` file, and the trusted single-user UI
intentionally displays saved keys in full. Do not commit that ignored file.

## Authoring loop

1. Create or open a MOO project.
2. Configure only the providers needed for that project.
3. Create actors, scenes, global media requests, or cards with typed asset slots.
4. Run preflight, review the cost estimate, and generate candidates.
5. Approve or reject candidates and select the approved deliverable.
6. Use **Finish Early** as soon as human taste has found enough good material.
7. Render card faces from selected approved slots, then publish an immutable
   release.

Published packages are written to
`projects/<project-name>/exports/<release-id>/` with a `manifest.json` and
kind-specific audio, image, video, and card directories.

## Verify the checkout

```sh
pnpm run verify
pnpm run audio:preflight
pnpm run build:all
pnpm run verify:release
```

`verify:release` is a packaging-readiness gate. It currently reports the known
production-hosting blocker: Fastify does not yet serve the built Solid assets,
so MOO is supported as a two-process development launch and is not yet a
single-executable distribution.

See the [operator guide](docs/operator-guide.md), [development guide](docs/development.md),
and [macOS packaging and release checklist](docs/packaging-and-release.md).
