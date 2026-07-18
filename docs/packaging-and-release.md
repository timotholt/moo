# macOS packaging and release readiness

## Current support boundary

MOO `0.11.x` is a source-run pre-1.0 application. The verified local launch is
`pnpm run dev:app`, which starts a Vite UI on port 6001 and a Fastify API on port 6000.

The repository can produce both build halves:

```sh
pnpm run build:all
```

This emits:

```text
dist/                 compiled server, CLI, and services
dist-ui-solid/        browser HTML and hashed JavaScript assets
```

These artifacts are not yet one deployable application. The compiled Fastify
server does not register `@fastify/static`, serve `dist-ui-solid`, or provide an
SPA fallback. Starting `node dist/server.js` therefore starts only the API.
MOO must not be advertised as a working single executable until that production
hosting path is implemented and tested.

## Recommended macOS distribution path

The realistic first-class target is one signed `MOO.app` application bundle
delivered in a notarized DMG. A macOS `.app` is one user-facing launchable item,
although internally it contains an executable, UI resources, and optional tool
sidecars. This is more maintainable than claiming one self-contained Mach-O
file while the product depends on browser assets, writable project data,
FFmpeg, and Python-based background removal.

Implement the path in this order:

1. **Production web host:** make Fastify serve the built Solid assets and return
   `index.html` for client-side routes while keeping `/api` and `/media`
   behavior unchanged.
2. **Stable runtime directories:** stop deriving writable settings/projects from
   the executable’s current working directory. Resolve packaged read-only
   resources separately from a user-writable Application Support directory,
   such as `~/Library/Application Support/MOO/`.
3. **One application entrypoint:** start Fastify on loopback, wait for
   `/api/health`, open or embed the UI, and shut down cleanly. Enforce a
   single-instance policy or allocate ports safely.
4. **Bundle JavaScript:** bundle the production server entry and its runtime
   dependencies. Either:
   - use Electron for the window and package the server/UI as application
     resources; or
   - use a small native wrapper plus a Node Single Executable Application (SEA)
     server binary and the embedded/static Solid resources.
5. **Choose the tool policy:** bundle signed `ffmpeg`/`ffprobe` sidecars or make
   them an explicit system prerequisite. Treat `rembg` and its model data as an
   optional managed component; silently relying on a developer Python
   installation is not release-grade.
6. **Package and sign:** build universal or separate arm64/x64 artifacts,
   codesign every executable/sidecar, notarize the app, staple the ticket, and
   distribute in a signed DMG.
7. **Prove a clean-machine install:** launch without Node or pnpm installed,
   create a project, configure credentials, generate/review/select one asset,
   restart and recover, render a card, publish, and verify the manifest.

Electron is the shorter path to a polished client/server desktop product. Node
SEA is the leaner path to a literal server executable, but it still requires
custom asset embedding/extraction or static serving and does not solve the
external media-tool dependencies. Neither path is implemented in this
repository today.

## Release-readiness gate

Run from the repository root with the pinned Node version:

```sh
nvm use
pnpm run build:all
pnpm run verify
pnpm run audio:preflight
pnpm run verify:release
```

`verify:release` uses only Node built-ins and local commands; it does not install
or download anything. It exits non-zero for release blockers and reports
optional capabilities as warnings.

## Pre-1.0 release checklist

### Source and behavior

- [ ] Version and release notes identify the build as pre-1.0.
- [ ] `pnpm install --frozen-lockfile` succeeds with Node 24.14.0 and pnpm
      11.7.x.
- [ ] `pnpm run verify` passes.
- [ ] `pnpm run build:all` creates `dist/server.js`,
      `dist/cli/index.js`, and `dist-ui-solid/index.html`.
- [ ] `pnpm run audio:preflight` passes on the release builder.
- [ ] No `.moo-config.json`, `.env`, project data, generated media, or provider
      credentials are present in the artifact.

### Production application

- [ ] One production entrypoint serves both API and Solid UI.
- [ ] API and media routes are tested through that production entrypoint.
- [ ] Packaged templates and static assets resolve without repository-relative
      paths.
- [ ] Settings, projects, caches, and logs use a user-writable macOS directory.
- [ ] Restart recovery harvests previously submitted provider operations without
      duplicate paid submissions.
- [ ] Cancellation stops new submissions but retains already-submitted results.

### Media authoring

- [ ] ElevenLabs audio generation passes preflight and a real smoke test.
- [ ] Enabled OpenAI/Google image and video providers pass real smoke tests.
- [ ] `16:9` and `9:16` remain distinct assets through publication.
- [ ] FFmpeg/FFprobe availability and versions are visible to the operator.
- [ ] Required transparency either arrives with alpha or passes the configured
      `rembg` post-process and alpha validation.
- [ ] Review, approval/rejection, selection, Finish Early, card rendering, and
      release publication pass an end-to-end smoke test.

### macOS distribution

- [ ] Dependency/tool bundling policy is documented and implemented.
- [ ] arm64/x64 support matches the published system requirements.
- [ ] The app and every bundled executable are codesigned.
- [ ] Notarization succeeds and the ticket is stapled.
- [ ] Gatekeeper accepts the downloaded artifact on a clean Mac.
- [ ] Upgrade, backup, and uninstall behavior preserves author project data.
- [ ] A rollback artifact and release tag are retained.

## Known blockers at this milestone

1. Fastify does not serve the production Solid build.
2. Read-only application resources and writable user data are not separated;
   both are currently relative to `process.cwd()`.
3. There is no packaged application entrypoint, signing/notarization pipeline,
   or clean-machine test.
4. FFmpeg/FFprobe and optional `rembg` are external commands with no distribution
   policy.
5. The CLI launcher targets compiled output but the repository does not produce
   or publish a standalone runtime containing Node and dependencies.
