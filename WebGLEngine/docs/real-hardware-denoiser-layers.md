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

## Run it (Windows, on each GPU; from a command prompt)

A fresh clone of the branch, in a folder of its own (your verified clone is left alone):

```
cd /d %USERPROFILE%
git clone --branch claude/epic-cori-2hm1my --single-branch https://github.com/HowdyKeith/SweK_Engine.git SweK_Layers
cd SweK_Layers\WebGLEngine
set SWEK_WEBGPU=
npm install -g webgpu@0.6.2
node tools/denoiseLayers-selfcheck.mjs
node tools/denoiseLayers.mjs --size 512 --out render\denoise-layers-512.json
node tools/denoiseLayers.mjs --size 1024 --out render\denoise-layers-1024.json
```

`npm install -g webgpu@0.6.2` is the tree's pin since section 70; skip it if that GPU already has it (`npm ls -g webgpu`). On the second
GPU use other names (`--out render\denoise-layers-512-intel.json` and so on): the report files are never overwritten.

- The self-check must end `ALL PASS`. On a machine whose node-webgpu reaches the GPU it times on the GPU; its 16 x 16 run is
  only a smoke test.
- Each run prints the adapter on its first line. **If it says SOFTWARE ADAPTER, it did not reach the GPU**; stop and send that.
- Without `--out` a run writes `render/denoise-layers-<adapter>.json`, so a second size would be refused: give each run its own `--out`.
- On 0.6.2 the native runs compile with DXC on D3D12, which builds every set. A console on an older node-webgpu compiles with FXC, and
  the sets FXC cannot build are left out by name, as the compile gate does.

## What to send back

The `render/denoise-layers-*.json` files (commit them on the branch, or paste them). Each says:

- the fastest whole set and its slowest layers, with each layer's share of the time;
- per layer, every set's time and the set the aimed set took;
- the aimed set, its predicted gain, and the **measured** head to head;
- its image against the f64 network (it must be within 1e-3; the run exits 1 otherwise).

## What the rig found (2026-11-22)

No mixed set: on the GTX 1080 r18t, and on the Intel r57p, already runs every layer within 5% of the fastest other kernel, and the head to head
runs are level (0.99-1.07 x). The 1080's time is even across the layers; the Intel's is in the three hidden layers. `tools/ship/todo.mjs`'s
`denoiser-slow-layers` has the numbers.

## What happens next

If on a GPU the aimed set differs from the fastest whole set and wins its head to head, that mixed set is a candidate for the
page's table for that adapter (`PAGE_KERNELS_BY_ADAPTER` in `render/denoiseDevice.mjs`), to be registered and confirmed on
fresh timings before it replaces anything. `--aim r18t,r15,r15,r15,r15` times any mixed set you name against the fastest whole
set, the same way.

## Round 2026-11-22: is r57p the Intel's page set? (registered: `tools/denoiseKernelRound.mjs`)

Only on the **Intel** (it is the table's entry being asked about). In the same clone, after `git pull`:

```
cd /d %USERPROFILE%\SweK_Layers\WebGLEngine
git pull --ff-only origin claude/epic-cori-2hm1my
set SWEK_WEBGPU=
node tools/denoiseKernelRound-selfcheck.mjs
node tools/denoiseKernelRound.mjs --challenger r57p --repeats 5
```

- The self-check must end `ALL PASS` (it needs no GPU).
- The round opens `denoise.html` in Chrome on the GPU five times and presses its own **Time the network** with only r18u (the table's set) and r57p, then times the
  same two natively five times. It can take a while: five page ladders and five native ones.
- Its first line names the adapter and the page's key; it must say `Windows/intel/gen-9`. **If it says SOFTWARE ADAPTER it refuses**, and that is the thing to send.
- It writes `render/denoise-round-windows-intel-gen-9-r57p.json` and prints the decision. Commit and push that file (or paste it):

```
git add render\denoise-round-*.json
git commit -m "Denoiser kernel round from the Intel rig"
git push origin claude/epic-cori-2hm1my
```

The rule was written before any run (the tool's header): r57p takes the Intel's entry only if, IN THE PAGE, it is at least 1.02 x faster in median and faster in at least
4 of 5 repeats at every size of 512 or more (at least two sizes). The native figures are reported beside it and decide nothing.
