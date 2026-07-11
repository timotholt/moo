# MOO development setup

MOO is tested with Node `20.20.2` and pnpm `11.7.0`.

```sh
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm run verify:runtime
pnpm run dev:app
```

The local UI is `http://localhost:6001`; the API is `http://127.0.0.1:6000`.

Before a real audio-generation run, verify the local audio tools:

```sh
pnpm run audio:preflight
```

`ffprobe` and `ffmpeg` are supplied by the FFmpeg package. MOO will surface a clear preflight warning or blocker if either is unavailable.

`pnpm run lint` is tracked cleanup work and is not yet part of the runtime gate; CI runs the same frozen-install, build, test, and audio-tool checks described above.
