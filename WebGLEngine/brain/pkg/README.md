# swek-brain: the cell manager as a standalone exe

The GPU/CPU brain (`brain/esPilot.mjs`) owns a share of a system's hostiles by rendezvous hashing, ticks them, and broadcasts. It is already a tandem process -- its own OS process talking to the room bus over HTTP `fetch`. This folder packages that process as a single-file executable per box.

## Why this is safe (and why now)

The cell manager is **owner-authoritative**: it is the one truth for the NPCs it owns, it broadcasts their state + intent, and every other peer extrapolates and gets re-anchored on the next packet (the EVE/Destiny "evolve from initial conditions" model). Nobody reconciles against the owner's exact float bits. So the exe can run on a **different JS engine** (Bun's JSC vs the browsers' V8) and it does not matter that their floating point differs -- there is no lockstep to desync. If you had chosen lockstep replication, mixing engines would break on the first tick; owner-authority is exactly what licenses this.

## What compiles

Only the cell manager's pure subtree: `esPilot -> esAuthority, combat, flightModel, esTactics, presence`. `tools/ship/bun-audit.mjs` walks that transitive import graph and fails if a `require`, native `.node` addon, `child_process`, `worker_threads`, `cluster`, `dgram`, or `process.binding/dlopen` ever creeps in -- the things `bun build --compile` cannot carry. It is wired into the ship ritual, so the owner path stays compile-clean by construction. Everything that does **not** pair with Bun (Windows launchers, the KPop PowerShell shim, the cscript/VBS mailer, the main server's fs + routes) is not in this subtree and stays in Node.

## Build

```
bash brain/pkg/build-brain.sh          # run from the WebGLEngine root
```

Cross-compiles from one host into `brain/pkg/dist/`:

| file | target | box |
|------|--------|-----|
| `swek-brain.exe` | bun-windows-x64 | Galaxina |
| `swek-brain-mac` | bun-darwin-x64 | Stellar Atlas |
| `swek-brain-mac-arm` | bun-darwin-arm64 | Apple-silicon peer |
| `swek-brain-linux` | bun-linux-x64 | linux peer |

No Node or Bun install is needed on the target machine; the runtime is embedded.

## Run

Config is read from the environment at run time, so one binary serves any cell:

```
SYSTEM=128 ROOM=default URLBASE=http://192.168.10.40:8787 swek-brain.exe
```

For the EVE-style "one owner per system" layout, spawn one per system (each takes its fair share by hashing, so two owners in the same room automatically split the wing). `BRAIN_BACKEND=cpu` on a GPU-less box (Stellar Atlas) is the clean fit; keep any real GPU-compute path native and in Node on Galaxina and let the exe own CPU cells.

## Measure before believing "faster"

Bun's reliable wins are cold start, single-file deploy, and spawn cost. The steady-state tick loop (JSC vs V8) can go either way -- so measure it on the actual box:

```
node brain/pkg/tick-bench.mjs
bun  brain/pkg/tick-bench.mjs
```

It reports ticks/sec, microseconds/tick, and how many NPCs one owner sustains at 30 fps before you need a second. Compare the two runtimes; that number, not a blog post, decides whether the exe is a speed win on top of the portability win.
