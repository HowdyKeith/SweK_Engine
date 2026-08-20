# Running the ai-bridge under Bun

Bun is a faster, mostly Node-compatible runtime. The WebGL frontend doesn't care
what runs the bridge — this is purely about the `ai-bridge` Node server.

## TL;DR

- The bridge is written against standard Node APIs (`http`, `net`, `dgram`, `fs`,
  `os`, `crypto`) that Bun implements, so the core should run unchanged.
- Every optional/native-ish dependency is loaded **lazily and guarded** (try/catch),
  so if one fails under Bun the bridge still boots — that feature just degrades
  instead of crashing the whole server.
- The one feature most likely to misbehave under Bun is **Discord voice**
  (`@discordjs/voice` + opus/sodium/ffmpeg). If it doesn't load, everything else
  keeps working; run the bridge under Node when you need voice.

## How to switch runtime

1. Install Bun (https://bun.sh) and make sure `bun` is on PATH.
2. In the engine: Settings → **Runtime** → check **"Use Bun on boot"**. This writes
   `ai-bridge/use_bun.flag`.
3. Relaunch with `Start_Everything.bat` (it reads the flag and launches under Bun
   if `bun` is on PATH, else falls back to Node). `START_BUN.bat` always uses Bun.
4. First run on a Bun-only machine: the launcher now runs `bun install` to fetch
   deps (it picks `bun install` when the flag is set, or when npm isn't present).

## How to verify (on the rig)

After launching under Bun, open Settings → **Runtime**. It shows:
- which runtime is live (Bun vN / Node vN),
- a per-feature availability list (● loaded / ○ degraded),
- a warning if Discord voice is degraded.

Or hit the endpoint directly:

```
curl http://localhost:8787/runtime
```

The JSON includes `runtime`, `features` (each dep → {ok} or {ok:false,error}),
`degraded` (list of failed deps), and `voiceReady`.

### Manual smoke checklist

- [ ] Bridge boots, `/runtime` reports `runtime: "bun"`.
- [ ] Engine loads at http://localhost:8787 and renders.
- [ ] WebSocket multiplayer / spectator works (`ws`).
- [ ] HA features respond (`/ha/states`) — uses plain http, should be fine.
- [ ] Solar / RGB (`openrgb-sdk` over TCP) — check `/rgb/status`.
- [ ] mDNS discovery (`bonjour-service`, `dgram` multicast) — optional.
- [ ] MQTT / HA discovery (`mqtt`, `aedes`) — optional.
- [ ] Fallout 4 / Starfield connectors (`net`, `dgram`, `http`) — should be fine.
- [ ] **Discord voice** — the known risk. If `/runtime` shows `@discordjs/voice`
      degraded, keep voice on Node.

## Deep Discord-voice self-test (the real Bun check)

`/runtime` only proves the modules *require* without throwing. Voice can still
fail at the audio layer (opus encoder / encryption), which is the actual Bun risk.
For a definitive check:

- Settings → **Runtime** → **"Test Discord voice under this runtime"**, or:

```
curl http://localhost:8787/discord/voice/selftest
```

This parses `@discordjs/voice`'s dependency report into a structured verdict
(`opus`, `encryption`, `ffmpeg`) **and actually instantiates an AudioPlayer**, so
it exercises the audio runtime rather than just the imports. It returns `ready`
(opus + encryption + player all good), a plain-English `verdict`, and the raw
`report`. If `ready` is false under Bun, run the bridge under Node for voice — the
rest of the bridge is unaffected. (ffmpeg is reported separately; it's needed to
play WAV/TTS audio, not to join a channel.)

## What's guarded (won't crash the bridge if it fails to load)

`discord.js`, `@discordjs/voice`, `ffmpeg-static`, `libsodium-wrappers`,
`opusscript`, `openrgb-sdk`, `mqtt`, `aedes`, `bonjour-service`, `selfsigned`.

If any of these is missing or Bun-incompatible, the bridge logs it and disables
just that feature.
