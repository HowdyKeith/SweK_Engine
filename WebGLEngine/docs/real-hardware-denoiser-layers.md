# The denoiser's slowest layers on a real GPU, and a kernel set aimed at them (2026-11-21)

`denoise.html` shows each layer of the network's time on the card. In this tree that has only ever run on **SwiftShader**,
a CPU, where the hidden 3 x 3 layers (L1 to L3) are the heaviest at about 22-24% each and r18t's kernels win every layer.
A GPU may rank them differently. `tools/denoiseLayers.mjs` measures it where it runs:

1. every kernel set this adapter and compiler can build (the tree's `TIMED_SETS`, less what `nativeSetsFor` and the adapter's
   features rule out), each layer timed on the GPU's own clock, the sets taking turns;
2. an **aimed set**: per layer, the set that ran that layer fastest -- a mixed set, one set a layer. A layer only moves off the
   fastest whole set's kernel to a *different* kernel that is at least 5% faster (a margin chosen here, so that noise between
   two near-equal kernels does not make a mixed set out of nothing);
3. the aimed set built, its image checked against the f64 network on the CPU, then timed head to head against the fastest
   whole set, taking turns.

It writes one JSON report and never overwrites one. Nothing is sent anywhere.

## Run it (Windows, on each GPU; from a command prompt in the verified clone)

```
cd WebGLEngine
git pull --ff-only origin claude/epic-cori-2hm1my
node tools/denoiseLayers-selfcheck.mjs
node tools/denoiseLayers.mjs --size 512
node tools/denoiseLayers.mjs --size 1024
```

- The self-check must end `ALL PASS`. On a machine whose node-webgpu reaches the GPU it times on the GPU; its 16 x 16 run is
  only a smoke test.
- Each run prints the adapter on its first line. **If it says SOFTWARE ADAPTER, it did not reach the GPU**; stop and send that.
- Each run writes `render/denoise-layers-<adapter>.json`. A second run of the same size needs `--out` with another name
  (it refuses to overwrite): for example `--out render/denoise-layers-<adapter>-1024.json`.
- **Under FXC** (node-webgpu 0.6.0 as pinned) the sets FXC cannot build are left out by name, as the compile gate does. To time
  them too, run the same two commands under node-webgpu 0.6.2's DXC, as round 19 did:

```
npm install --no-audit --no-fund --prefix "%TEMP%\swek-webgpu-0.6.2" webgpu@0.6.2
set SWEK_WEBGPU=%TEMP%\swek-webgpu-0.6.2\node_modules\webgpu
node tools/denoiseLayers.mjs --size 512 --out render/denoise-layers-dxc-512.json
set SWEK_WEBGPU=
```

## What to send back

The `render/denoise-layers-*.json` files (commit them on the branch, or paste them). Each says:

- the fastest whole set and its slowest layers, with each layer's share of the time;
- per layer, every set's time and the set the aimed set took;
- the aimed set, its predicted gain, and the **measured** head to head;
- its image against the f64 network (it must be within 1e-3; the run exits 1 otherwise).

## What happens next

If on a GPU the aimed set differs from the fastest whole set and wins its head to head, that mixed set is a candidate for the
page's table for that adapter (`PAGE_KERNELS_BY_ADAPTER` in `render/denoiseDevice.mjs`), to be registered and confirmed on
fresh timings before it replaces anything. `--aim r18t,r15,r15,r15,r15` times any mixed set you name against the fastest whole
set, the same way.
