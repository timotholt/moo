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

These artifacts now run as one production process:

```sh
node dist/server.js
```

The compiled Fastify server resolves `dist-ui-solid/` from its ESM module
location, serves built assets and safe client-side-route fallback on
`http://127.0.0.1:6000`, and keeps `/api/*` and `/media/*` ahead of that fallback.
The production-host inject suite proves index, hashed asset, API/media
precedence, missing-asset, traversal, non-GET, and missing-build behavior.

This is a source-built single-process application, not yet a self-contained
user distribution. It still depends on an installed Node runtime and
`node_modules`, and has no `.app`, signing, notarization, or clean-machine
packaging. The runtime path policy is ready for a wrapper: `MOO_PACKAGED=1`
uses native user-data storage and `MOO_DATA_DIR` provides an explicit override.

## Recommended macOS distribution path

The realistic first-class target is one signed `MOO.app` application bundle
delivered in a notarized DMG. A macOS `.app` is one user-facing launchable item,
although internally it contains an executable, UI resources, and optional tool
sidecars. This is more maintainable than claiming one self-contained Mach-O
file while the product depends on browser assets, writable project data,
FFmpeg, and Python-based background removal.

Implement the path in this order:

1. **Production web host (complete):** Fastify serves the built Solid assets and
   returns `index.html` only for safe client-side navigation while preserving
   `/api` and `/media` behavior.
2. **Stable runtime directories (complete in the server):** packaged launches
   use a user-writable Application Support/AppData/XDG directory, while
   templates and built UI resolve from application resources.
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
or download anything. It executes the compiled server’s real `buildServer`
entrypoint from outside the checkout and injects requests for index, a hashed
asset, SPA fallback, health, missing API, and missing media behavior. It exits
non-zero for release blockers and reports optional capabilities as warnings.

## Pre-1.0 release checklist

### Source and behavior

- [ ] Version and release notes identify the build as pre-1.0.
- [ ] `pnpm install --frozen-lockfile` succeeds with Node 20.20.2 and pnpm
      11.7.x.
- [ ] `pnpm run verify` passes.
- [ ] `pnpm run build:all` creates `dist/server.js`,
      `dist/cli/index.js`, `dist/templates/defaults.template.json`, and
      `dist-ui-solid/index.html`.
- [ ] `pnpm run audio:preflight` passes on the release builder.
- [ ] No `.moo-config.json`, `.env`, project data, generated media, or provider
      credentials are present in the artifact.

### Production application

- [x] One production entrypoint serves both API and Solid UI.
- [x] API and media routes are tested through that production entrypoint.
- [x] Packaged templates and static assets resolve without repository-relative
      paths.
- [x] Settings and projects use a user-writable macOS directory in packaged mode.
- [x] Restart recovery harvests previously submitted provider operations without
      duplicate paid submissions.
- [x] Cancellation stops new submissions but retains already-submitted results.

### Media authoring

- [ ] ElevenLabs audio generation passes preflight and a real smoke test.
- [ ] Enabled OpenAI/Google image and video providers pass real smoke tests.
- [x] `16:9` and `9:16` remain distinct assets through publication.
- [ ] FFmpeg/FFprobe availability and versions are visible to the operator.
- [ ] Required transparency either arrives with alpha or passes the configured
      `rembg` post-process and alpha validation.
- [x] Review, approval/rejection, selection, Finish Early, card rendering, and
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

1. There is no packaged application wrapper, signing/notarization pipeline,
   or clean-machine test.
2. FFmpeg/FFprobe and optional `rembg` are external commands with no distribution
   policy.
3. The CLI launcher targets compiled output but the repository does not produce
   or publish a standalone runtime containing Node and dependencies.
