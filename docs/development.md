# MOO development setup

MOO is tested with Node `24.14.0` and pnpm `11.7.0`.

```sh
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm run verify
pnpm run dev:app
```

The local UI is `http://localhost:6001`; the API is `http://127.0.0.1:6000`.
Run these commands from the repository root. Global settings are currently
stored at `.moo-config.json` and managed projects at `projects/`, both relative
to the process working directory.

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
assets. It does not create a production application: `dist/server.js` currently
serves only API and media routes, not the Solid build. Run
`pnpm run verify:release` to evaluate that and the other packaging prerequisites.

See [operator-guide.md](operator-guide.md) for day-to-day use and
[packaging-and-release.md](packaging-and-release.md) for the supported packaging
status and release checklist.
