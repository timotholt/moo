# MOO development setup

MOO is tested with Node `20.20.2` and pnpm `11.7.0`.

```sh
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm run verify
pnpm run dev:app
```

The local UI is `http://localhost:6001`; the API is `http://127.0.0.1:6000`.
Run these commands from the repository root. Development stores global settings
at `.moo-config.json` and managed projects at `projects/`. Packaged mode uses
native user-data storage; `MOO_DATA_DIR` can override it.

Before a real audio-generation run, verify the local audio tools:

```sh
pnpm run audio:preflight
```

`ffprobe` and `ffmpeg` are supplied by the FFmpeg package. MOO will surface a clear preflight warning or blocker if either is unavailable.

`pnpm run verify` enforces linting, a TypeScript build, and the Vitest suite. CI runs the same frozen-install verification plus the audio-tool check.

Build both runtime halves with:

```sh
pnpm run build:all
```

This creates ignored `dist/` TypeScript output and `dist-ui-solid/` browser
assets. The compiled entrypoint serves both halves in one process:

```sh
node dist/server.js
```

Open `http://127.0.0.1:6000`. Direct compiled execution enables production UI
hosting when `dist-ui-solid/index.html` is present. Static resources resolve
relative to `dist/server.js`, not the process working directory. An explicitly
enabled host returns a clear `503` for UI navigation if the build is missing,
while API routes remain available.

Development remains a two-process Vite/Fastify launch with hot reload on ports
6001 and 6000. `MOO_SERVE_UI=1` can explicitly enable the built UI from a source
launch, and `MOO_SERVE_UI=0` can explicitly disable production hosting. Run
`pnpm run verify:release` after `pnpm run build:all` to runtime-probe the compiled
single-process host and evaluate the remaining packaging prerequisites.

See [operator-guide.md](operator-guide.md) for day-to-day use and
[packaging-and-release.md](packaging-and-release.md) for the supported packaging
status and release checklist.
