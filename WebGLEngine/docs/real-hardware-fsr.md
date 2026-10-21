# Running the FSR and frame-generation gates on a real GPU (v4764)

Every device row in this tree -- FSR1/FSR2 as TSL, the frame generator, the optical flow, the pacer, the motion stage -- has
been measured on **SwiftShader**, a CPU rasteriser inside a headless Chromium. The parity rows and the quality rows hold
there; every time a gate prints is a software renderer's. `tools/ship/realGpuRun.mjs` runs the same gates on whatever GPU
the machine has and writes one report that says which GPU it was.

## Run it

From `WebGLEngine/`, with the repository's usual `npm install` done (it brings Playwright and its headless shell):

```
node tools/ship/realGpuRun.mjs --out real-gpu-run.json
```

- **Windows**: nothing more. This run launches its gates with `--enable-unsafe-webgpu --use-angle=d3d11`, the pair measured
  necessary and sufficient on a D3D12 machine (tools/ship/webgpuHarness.mjs, HARDWARE_ARGS), which reaches the GPU. An
  ordinary gate run on Windows adds `--use-webgpu-adapter=swiftshader` (LAUNCH_ARGS) since v4778 rig run 4, because the
  device rows were measured on SwiftShader; realGpuRun does not, so its report names the GPU.
- **Linux with a GPU**: if the report's first line says SOFTWARE ADAPTER, the browser fell back to SwiftShader. Try
  `SWEK_LAUNCH_ARGS="--enable-unsafe-webgpu --enable-features=Vulkan" node tools/ship/realGpuRun.mjs`.
- **macOS**: `--enable-unsafe-webgpu` (the default) reaches Metal.
- `--only fsrFrameGen` runs just the gates whose path contains that text.

On this box's SwiftShader, at v4764, the whole run took 8 min 25 s, all 39 gates green (exact 12, quality 24, timing 3); on a GPU it
should be shorter, which nobody here has measured. Nothing is sent anywhere; the report is a local JSON file.

## Read the report

Its first line is the verdict: **a real-hardware run on <adapter>**, or **SOFTWARE ADAPTER ... THIS IS NOT A REAL-HARDWARE
RUN**. A software run's times say nothing about a GPU. Then, per gate, its kind:

| kind | what its rows are | on a real GPU |
|---|---|---|
| **exact** | the device against a CPU mirror, backend against backend, bit for bit or to f32 | must hold. A red row is a bug on that GPU -- the report keeps the row's text |
| **quality** | dB against a truth frame, with a margin | should hold. A different GPU's f32 and rasterisation can move a figure by hundredths of a dB; a red row with a small miss is the margin, a large one is a finding |
| **timing** | what the GPU takes: the flow's cost, FSR3 on the browser's clock, pass timings | the point of the run. These are the numbers SwiftShader cannot give. A row that asserts SwiftShader's COST MODEL (fsrFlowCost, fsrFrameGenLayerCost, fsrFrameGenReach) is printed with its figures and "NOT ASSERTED on a hardware adapter" there, by decision at v4778: on a GTX 1080 a fixed cost of a few ms swallowed every proportion they hold |

The kinds are read from each gate's source (`categorize` in the runner: a gate that reads a clock is timing, one that grades
in dB is quality, the rest exact), and every FSR gate is in the run (`gateList`); `tools/ship/realGpuRun-selfcheck.mjs` holds
both.

## The denoiser (the denoiser arc, round 12)

The run also covers the learned path-tracer denoiser's two device gates (`render/learned-denoiser-preregistration.md`,
sections 35-37). To run just those:

```
node tools/ship/realGpuRun.mjs --only denoise --out real-gpu-denoise.json
```

The two gates are on the branch `claude/denoiser-device` (PR #23) until it merges. A checkout without them runs nothing:
the first rig run of this command printed `exact 0/0, quality 0/0, timing 0/0` and called it "NO ADAPTER WAS SEEN". The run
now says `*** NO GATE MATCHED --only "denoise": NOTHING RAN ***`, names the commit it ran on, and exits 1. If you see that,
check out the branch first:

```
git fetch origin claude/denoiser-device
git checkout claude/denoiser-device
```

The run's second line, `on <commit> <date> <subject>`, should then show this branch's latest commit.

- **`render/denoiseDevice-selfcheck.mjs`** (exact) holds round 11's network on the device to its CPU twin, cell for
  cell, and drives `denoise.html` in the browser. On a GPU its rows should hold. A conv cell the GPU fused is allowed (the
  twin's fused mirror); an unexplained one is a finding.
- **`render/denoiseTiming-selfcheck.mjs`** (timing) is what the run is for. It times one pass of the network and its kernel
  on a ladder of sizes, 64 x 64 up to a 1920 x 1080 frame, two ways:
  - natively, on node-webgpu's default adapter (on a Windows GPU box, the GPU through D3D12);
  - through the page's own "Time the network", in the browser.

  Each size gets a fresh device, a couple of untimed passes, then up to 30 timed ones. Per size its `----` lines give:
  - the median time and the 10th-90th percentiles, wall-clock from submit to the queue's done (no upload, no
    read-back);
  - the same span on the GPU's own clock, from timestamp queries where the device offers them (a browser may round
    those to 0.1 ms);
  - megapixels a second;
  - the split by layer and kernel.

  The ladder stops before a size whose pass would take over 1.5 s, so on SwiftShader only 64 x 64 runs. Its rows assert
  the timer, never the time: the first size measured, the device clock nested inside the wall clock, timestamps asked for
  where offered, and a timed pass writing the same image as an untimed one.

On this box's SwiftShader, 64 x 64 takes about 640 ms natively and 510 ms in the browser. Those are a CPU's figures, and
the report says so. The first GPU run, on an Intel gen-9 integrated GPU, took 35 ms natively and 37 ms in the browser at
64 x 64, and 0.52 s natively at 256 x 256, where the ladder stopped. Section 38 of the pre-registration reads it, and its report
is `render/denoise-rig-r12-intel-gen9.json`. The GTX 1080 took 4.3 ms at 64 x 64 and 0.98 s at 1024 x 1024 (1080p predicted
at 1.9 s), with the 81-logit head on the direct kernel taking two-thirds of every pass from 256 x 256 up -- section 40,
`render/denoise-rig-r12-gtx1080.json`.

The page itself has the same button: open `denoise.html` in your browser and press **Time the network**. It shows the
table for whatever adapter the browser hands it, and says so plainly when that adapter is software.

### Round 13: the fast kernel (pre-registration section 39)

The branch `claude/denoiser-kernel-speed` adds a third convolution kernel, `conv2dFastWgsl` in `brain/conv2d.mjs`. It adds
every number in the same order as round 12's, so it is held to the same CPU twin cell for cell, and it reads them from
faster places. Both gates now run both kernel sets:

- **The exact gate** holds both sets to the twin, cell for cell, natively and in the browser.
- **The timing gate** times both on one device a size, taking turns, and prints the speedup at every size both
  measured, for example `native: r13 against r12 at 256 x 256: N x as fast, on the device's clock`.

On each GPU, run once, on that branch:

```
node tools/ship/realGpuRun.mjs --only denoise --out real-gpu-denoise-r13.json
```

and send the JSON back. Section 39 fixes, before any GPU ran the fast kernel, what its numbers decide.

**What they decided (section 42).** Exactness held on both GPUs, natively and in the browser. In Chrome the fast kernel was
6.7 times as fast on the Intel gen-9 and 13 times on the GTX 1080, which measured a 1080p frame at 150 ms. Natively,
through node-webgpu, its 81-logit head ran hundreds of times slower than the same kernel in Chrome. Section 39's rule
needs every path, so the default stays round 12's kernels until a later round explains or removes that.

### Round 14: the native head, a rule for the page, and `k_apply` (pre-registration section 43)

The branch `claude/denoiser-round14` adds:
- **a head kernel** for the network's 81-logit last layer, with no tile and no barrier, writing its logits planar;
- **`k_apply_fast`**, which reads those logits coalesced and its 9 x 9 window from workgroup memory;
- **a third denoiser gate, `render/denoiseCompile-selfcheck.mjs`.** It times each kernel's pipeline build and pass
  natively, under the FXC compiler node-webgpu ships and under DXC where the machine has DXC's DLLs (it copies them
  beside `dawn.node` for that run only), and in Chrome. It reads Dawn's shader dump to say which compiler each run
  really used.

On each GPU, run once, on that branch:

```
node tools/ship/realGpuRun.mjs --only denoise --out real-gpu-denoise-r14.json
```

Expect it to take a while on the Intel: native FXC builds took minutes each in round 13, and each gate may now run 30
minutes. Send the JSON back. If the compile gate names dump files under your temp folder, they show what each compiler
made of each kernel, and are worth sending too.

### Round 15: the head and the kernel apply in one pass (pre-registration section 46)

The branch `claude/denoiser-round15` adds:
- **`k_head_apply`**, which computes each pixel's 81 logits and applies them in the same pass, so the logits are never
  stored -- at 1080p the pass allocates 1,115 MiB instead of 1,756;
- **a fourth kernel set, r15**, timed against the other three on the page and against r12 and r14 natively;
- **an order probe**: a head built so that only the order of its adds can change the image, run natively and in Chrome.

On each GPU, run once, on that branch:

```
node tools/ship/realGpuRun.mjs --only denoise --out real-gpu-denoise-r15.json
```

As in round 14 it may take half an hour or more on the Intel. Send the JSON back, and any dump files the compile gate
names.

### Round 16: the hidden layers, several pixels a thread (pre-registration section 54)

After round 15 the four hidden 3 x 3 layers are three quarters of a 1080p frame on the GTX 1080, and nine tenths of a
1024 x 1024 one on the Intel. The branch `claude/denoiser-round16` adds:
- **a pixel-tiled convolution kernel**, `conv2dTileWgsl` in `brain/conv2d.mjs`. Each thread computes several pixels, so
  every weight it reads feeds all of them. It adds every number in the same order as before, so it is held to the same
  CPU twin, cell for cell;
- **two kernel sets, r16a and r16b:** r15 with the hidden layers on the new kernel, at 2 pixels x 32 channels a thread
  and at 4 x 16;
- **ladders that time r12, r15, r16a and r16b**, natively and on the page. They print each new set's hidden layers
  against r15's;
- **two more kernels in the compile gate:** the new kernel at both configurations.

On each GPU, run once, on that branch:

```
git fetch origin claude/denoiser-round16
git checkout -B claude/denoiser-round16 FETCH_HEAD
node tools/ship/realGpuRun.mjs --only denoise --out real-gpu-denoise-r16.json
```

Send the JSON back. Section 54 fixes, before any GPU runs the new kernel, what its numbers decide.

**What happened (section 56).** On both GPUs every gate was stopped at the 30-minute cap, before it printed anything:
node-webgpu never finished building the new kernel. Before round 16 is run again, a short probe builds ten shapes of
the kernel, each in its own process and stopped at 3 minutes, natively and then in Chrome. On each GPU, on the same branch:

```
git fetch origin claude/denoiser-round16
git checkout -B claude/denoiser-round16 FETCH_HEAD
node tools/denoiseBuildProbe.mjs --out denoise-build-probe.json
```

It prints one line a shape as it goes, and takes at most about half an hour. Send `denoise-build-probe.json` back.
Section 56 fixes, before it runs, what its results may choose.

**The outcome (section 57).** No tile shape built at 32 inputs within 3 minutes on either GPU, so by section 56 both round-16
sets left the round, and the page and the default stay r15. The denoiser gates no longer build the tile kernel natively, so
`node tools/ship/realGpuRun.mjs --only denoise` runs as it did in round 15. To see whether Chrome builds and runs the tile
kernel on your GPU -- the first probes' Chrome half ran on SwiftShader by mistake -- run, on the same branch:

```
node tools/denoiseBuildProbe.mjs --browser-only --out denoise-build-probe-chrome.json
```


### Round 17: two questions, one probe (pre-registration section 59)

The branch `claude/denoiser-round17` asks two things in one probe:
- **(2) the tile idea once more,** with its weights read where they are used, timed at real sizes;
- **(3) the fast kernel written two other ways:** reading four tile channels at a time, and a block's taps and channels
  written out with its weights at constant offsets.

Every shape adds the same numbers in the same order. On each GPU:

```
git fetch origin claude/denoiser-round17
git checkout -B claude/denoiser-round17 FETCH_HEAD
cd WebGLEngine
node tools/denoiseBuildProbe.mjs --out denoise-build-probe-r17.json
```

Each shape builds once in its own process, stopped at 3 minutes, and is timed at 64, 256 and 1024 square, natively and then
in Chrome. Send back `denoise-build-probe-r17.json`. Section 59 fixes, before it runs, which shapes earn a full run.

**The outcome (section 60).** No shape qualified, so round 17 ends and the page and the default stay r15. Natively, both
written-out shapes crashed on both GPUs and all three tile shapes stopped at 3 minutes. The vec4 shape built, but in Chrome
at 1024 square it was slower than the fast kernel on the 1080. There is nothing more to run on this branch.

### Round 18: the page picks its kernels by GPU (pre-registration section 61)

The branch `claude/denoiser-round18` adds two kernel sets that only the page runs, in Chrome: round 17's 2 x 8 tile with
inline weights (r18t), and the fast kernel with a block written out (r18u). It also adds a table the page reads its set
from, keyed by platform, vendor and architecture. The table is empty until this run decides it. Natively, neither set is
built on D3D12, so the native gates time r12 and r15 alone; the native clock is no longer rounded to 65.5 µs. On
each GPU:

```
git fetch origin claude/denoiser-round18
git checkout -B claude/denoiser-round18 FETCH_HEAD
cd WebGLEngine
node tools/ship/realGpuRun.mjs --only denoise --out real-gpu-denoise-r18.json
```

Send back `real-gpu-denoise-r18.json`. Section 61 fixes, before it runs, which set the page takes on each GPU.

**The outcome (section 63).** In Chrome on Windows the page now runs r18u on the Intel gen-9 (1.52 x r15 at 1024 square) and
r18t on the GTX 1080 (1.09 x at 1080p). Every other GPU, platform and browser, and everything native, stays on r15. The
native clock is unrounded on both GPUs. There is nothing more to run on this branch.

### Round 19's probe: node-webgpu 0.6.2 and DXC (pre-registration section 64)

node-webgpu 0.6.2 is the first version to ship Microsoft's newer shader compiler, `dxcompiler.dll`, beside `dawn.node`,
with a Dawn built to prefer it. The tree stays pinned to 0.6.0. The probe runs 0.6.2 for one console, through
`SWEK_WEBGPU`, and leaves your global install alone. On each GPU, in the verified clone, from a command prompt:

```
cd WebGLEngine
npm install --no-audit --no-fund --prefix "%TEMP%\swek-webgpu-0.6.2" webgpu@0.6.2
set SWEK_WEBGPU=%TEMP%\swek-webgpu-0.6.2\node_modules\webgpu
node tools/ship/realGpuRun.mjs --only denoiseCompile --out real-gpu-denoise-dxc-0.6.2.json
node tools/denoiseBuildProbe.mjs --native-only --dxc on --out denoise-build-probe-dxc-0.6.2.json
set SWEK_WEBGPU=
```

- **If `npm install` fails, stop there.** `realGpuRun` refuses to start when `SWEK_WEBGPU` names nothing it can load,
  and says why.
- **The compile gate's first native line should name node-webgpu 0.6.2.** It runs each kernel three ways: as shipped,
  under `use_dxc`, and with `use_dxc` off. One line per way says how many kernels built and what their dumps say: DXIL is
  DXC, DXBC is FXC.
- **The build probe builds round 17's seven shapes under DXC.** FXC built two of them, crashed on two and stopped on
  three (section 60). r18t's kernel is one it stopped on, and r18u's one it crashed on.
- **Expect it to take a while on the Intel.** The "use_dxc off" runs are FXC, which took minutes there in rounds 13 to 15.
- **Send back both JSON files, and the dumps.** The compile gate's dumps are `%TEMP%\swek-denoise-dump-0.6.2-*.txt`.
  The build probe's report names its own. Section 64 fixes, before it runs, what they decide.

**The outcome (section 65).** On both GPUs 0.6.2 compiled with DXC as shipped, built every kernel exact, and built r18t's
and r18u's kernels in seconds. The fast head ran 2,024 times faster under DXC than under FXC on the Intel, and 404 times on
the 1080. The pin stays 0.6.0; round 19 below runs 0.6.2 the same way.

### Round 19: r18t and r18u natively under DXC, and a native table by adapter (pre-registration section 66)

Round 19 lets the native gates build and time r18t and r18u when the run compiles with DXC, and times r15 under FXC in the
same run, in a process of its own. Its rule may give each GPU a native set, for runs that compile with DXC only. The tree
stays pinned to 0.6.0, so this runs 0.6.2 for one console, as the probe did. On each GPU, in the verified clone of v4849:

```
cd WebGLEngine
npm install --no-audit --no-fund --prefix "%TEMP%\swek-webgpu-0.6.2" webgpu@0.6.2
set SWEK_WEBGPU=%TEMP%\swek-webgpu-0.6.2\node_modules\webgpu
node tools/ship/realGpuRun.mjs --only denoise --out real-gpu-denoise-r19.json
set SWEK_WEBGPU=
```

- **The `npm install` line changes nothing** if the probe's install is still there.
- **The first native lines name the adapter** and say the compiler, from the package, is DXC.
- **Expect the Intel to take a while.** The timing gate's FXC ladder builds r15's fused pass in about 16 s there, at every
  size.
- **Send back `real-gpu-denoise-r19.json`.** Section 66 fixes, before it runs, which set each GPU's native runs take.

**The outcome (section 67).** The Intel gen-9's native runs under DXC take r18u; the GTX 1080 has no entry, because r18t beat
r15 under DXC but not r15 under FXC. Both reports are committed as `render/denoise-rig-r19-*.json`.

### Round 20: the native caller (pre-registration section 68)

Round 20 gives section 67's table a caller: `tools/denoiseDevice.mjs --which` picks the set for this GPU and this package's
compiler, builds it, and runs one small pass. It writes nothing. On each GPU, in the verified clone:

```
cd WebGLEngine
node tools/denoiseDevice.mjs --which
set SWEK_WEBGPU=%TEMP%\swek-webgpu-0.6.2\node_modules\webgpu
node tools/denoiseDevice.mjs --which
set SWEK_WEBGPU=
```

- **The first run is the pinned 0.6.0 (FXC); the second is 0.6.2 (DXC).** Each prints three lines.
- **Section 68 predicts every line:** the Intel takes r15 under FXC and r18u under DXC; the 1080 takes r15 under both.
- **Send back the six lines from each GPU.**

**The outcome (section 68).** All four runs were the four predicted. The Intel's global node-webgpu was 0.6.1, not the pin.

### Round 21: the whole native sweep, to move the pin to 0.6.2 (pre-registration section 69)

Every gate that makes a node-webgpu device, once on the pin and once on 0.6.2, at one commit. The pin moves only if no gate is
worse on 0.6.2 on either GPU. The first line puts the Intel back on the pin. On each GPU, in the verified clone:

```
cd WebGLEngine
npm install -g webgpu@0.6.0
node tools/ship/realGpuRun.mjs --native --out native-sweep-0.6.0.json
set SWEK_WEBGPU=%TEMP%\swek-webgpu-0.6.2\node_modules\webgpu
node tools/ship/realGpuRun.mjs --native --out native-sweep-0.6.2.json
set SWEK_WEBGPU=
```

- **Don't commit between the two runs,** and run both from the same clone: the rule compares one commit's two sweeps.
- **The browser runs as in a verify**, not on the GPU's hardware flags; only the package differs.
- **Send back both JSON files from each GPU.**

**The outcome (section 70): the pin is node-webgpu 0.6.2.** No gate was worse on 0.6.2 on either GPU, and five gates red on
0.6.0 went green. On each GPU, once, from any console:

```
npm install -g webgpu@0.6.2
```

From then on the verified clone's native gates compile with DXC on D3D12, and `SWEK_WEBGPU` is not needed to reach 0.6.2.
A console that still has `SWEK_WEBGPU` set loads whatever it names: clear it with `set SWEK_WEBGPU=`.

### Round 22: the new pin's defaults, and round 16's shapes natively under DXC (pre-registration section 71)

On each GPU, with v4856 or later and `npm install -g webgpu@0.6.2` done, in the verified clone:

```
cd WebGLEngine
set SWEK_WEBGPU=
node tools/ship/realGpuRun.mjs --only denoise --out real-gpu-denoise-r22.json
node tools/denoiseDevice.mjs --which
node tools/denoiseBuildProbe.mjs --probe r16 --native-only --out denoise-probe-r16-native-dxc.json
```

- **No `SWEK_WEBGPU` this time:** the point is what the pin does by itself.
- **Section 71 predicts:** the Intel picks r18u and the 1080 r15; all ten round-16 shapes build and are exact on both; none is
  1.05 x faster than the fast kernel.
- **Send back both JSON files and the three `--which` lines from each GPU.**

**The outcome (section 72).** Both GPUs picked as predicted with nothing set: r18u on the Intel, r15 on the 1080, both under DXC
on node-webgpu 0.6.2. All ten of round 16's shapes built natively under DXC and were exact on both, so conv2d's round-16 rows no
longer stand aside on D3D12 under DXC -- only under FXC. On the Intel two shapes were 1.05 x faster than the fast kernel at 64 x 64,
which names round 23.

### Round 23: the Intel's two named shapes at frame sizes, twice (pre-registration section 73)

On each GPU, with v4859 or later, in the verified clone:

```
cd WebGLEngine
set SWEK_WEBGPU=
node tools/denoiseBuildProbe.mjs --probe r16 --native-only --sizes 64,256,1024 --out denoise-probe-r23-a.json
node tools/denoiseBuildProbe.mjs --probe r16 --native-only --sizes 64,256,1024 --out denoise-probe-r23-b.json
```

- **Twice, back to back,** from the same clone: the rule needs a shape's margin to hold in both runs.
- **Don't commit or pull between the two runs.**
- **Section 73 predicts:** neither named shape holds 1.05 x over the fast kernel at 256 and 1024 on the Intel; nothing holds on the 1080.
- **Send back both JSON files from each GPU.**

**The outcome (section 74).** On the Intel neither named shape held at 256 and 1024 in both runs. On the 1080, tile2-zero-32 --
r18t's kernel -- was 1.14 to 1.24 x the fast kernel at 256 and 1024 in both runs. That is reported, not acted on, and names
round 24.

### Round 24: the 1080's native entry, asked again without the FXC condition (pre-registration section 75)

On each GPU, with v4860 or later, in the verified clone:

```
cd WebGLEngine
set SWEK_WEBGPU=
node tools/ship/realGpuRun.mjs --only denoise --out denoise-rig-r24-a.json
node tools/ship/realGpuRun.mjs --only denoise --out denoise-rig-r24-b.json
```

- **Twice, back to back,** from the same clone: a set qualifies only when it holds in both runs.
- **Don't commit or pull between the two runs.**
- **Section 75 predicts:** r18t qualifies on the 1080 in both runs and becomes its native default; the Intel stays r18u.
- **Send back all four JSON files.**

**The outcome (section 76), read strictly: the 1080 keeps r15.** r18t beat r15 under DXC by 1.086 and 1.091 x at 1920 x 1080 on
the 1080, but both GPUs' second runs crashed with an access violation in a native child (the 1080's compile gate in its FXC mode,
the Intel's exact gate in the native caller), so a gate was red in each run b and no set qualified in both.

### Round 24b: the crash first, then the two runs again (pre-registration section 77)

On the 1080, in the verified clone with v4861 or later:

```
cd WebGLEngine
set SWEK_WEBGPU=
node render/denoiseCompile-selfcheck.mjs
node render/denoiseCompile-selfcheck.mjs
node render/denoiseCompile-selfcheck.mjs
```

On the Intel, the same three lines with `render/denoiseDevice-selfcheck.mjs`. Then, on each GPU:

```
node tools/ship/realGpuRun.mjs --only denoise --out denoise-rig-r24b-a.json
node tools/ship/realGpuRun.mjs --only denoise --out denoise-rig-r24b-b.json
```

- **Step 1 decides nothing:** it asks whether the crash happens in a gate run alone.
- **Don't commit or pull between runs.**
- **Section 77 predicts:** no crash; r18t qualifies on the 1080 in both runs; the Intel stays r18u.
- **Send back the step-1 console output and all four JSON files.**

**The outcome (section 78): the 1080's native default is r18t.** Neither gate crashed alone (three runs each), every gate was green
in all four runs, and r18t beat r15 under DXC on the 1080 by 1.080 and 1.068 x at 1920 x 1080. A native run on the 1080 under DXC
now takes r18t; the Intel keeps r18u. Nothing to install.

### Round 28: the denoiser's FXC paths retired (pre-registration section 87)

On each GPU, in the verified clone with v4871 or later:

```
cd WebGLEngine
set SWEK_WEBGPU=
node tools/ship/realGpuRun.mjs --only denoise --out denoise-rig-r28.json
node tools/denoiseDevice.mjs --which
```

- **What changed:** under FXC the compile gate builds only r12-tiled-3x3, as a control. The timing gate's FXC ladder is skipped.
  `SWEK_DENOISE_FXC=all` runs both as before.
- **Section 87 predicts:** every gate green; the "use_dxc off" group is r12-tiled-3x3 alone, exact and DXBC; the FXC ladder line
  says SKIP with section 87's reason; `--which` is r18u on the Intel and r18t on the 1080. The compile gate should drop to under
  200 s on the Intel and under 120 s on the 1080.
- **Send back the JSON file and the `--which` line from each GPU.**

### Round 31: the half-size chain timed at 1920 x 1080 (pre-registration section 93)

On each GPU, in a fresh clone of a commit carrying section 93:

```
cd WebGLEngine
set SWEK_WEBGPU=
node tools/ship/realGpuRun.mjs --only denoise --out denoise-rig-r31-a.json
node tools/ship/realGpuRun.mjs --only denoise --out denoise-rig-r31-b.json
```

- **What is new:** the denoise group now has a fourth gate, `render/denoiseUpscaleGPU-selfcheck.mjs`. On a GPU it times round
  30's chain at 1920 x 1080 against today's page, in two `section 93:` lines.
- **Section 93 predicts:** the chain is faster on both GPUs, by 1.4-3.0 x on the 1080 and 2.0-4.0 x on the Intel; every gate
  green; the fill uses fewer than its 96 rings.
- **Don't commit or pull between runs.**
- **Send back all four JSON files.**

**The outcome (section 94): the half-size chain is cheaper than today's page at 1080p on both GPUs.** 1.439 and 1.479 x on
the 1080, and 1.537 and 1.376 x on the Intel. Every gate was green, and the fill reached every pixel in 87 of its 96 rings. The
chain's own steps cost more than its network, so the next speed work is `denoise-halfres-fixed-costs`. By section 93's rule the
arc's next round is `denoise-fsr2-temporal`. Nothing to install.

### Round 33: the history on the device, timed at 1920 x 1080 (pre-registration section 97)

On each GPU, in a fresh clone of a commit carrying section 97:

```
cd WebGLEngine
set SWEK_WEBGPU=
node tools/ship/realGpuRun.mjs --only denoise --out denoise-rig-r33-a.json
node tools/ship/realGpuRun.mjs --only denoise --out denoise-rig-r33-b.json
```

- **What is new:** the chain gate also runs round 32's history on the GPU: first hits, the shift, the accumulation and the
  composite. Its section 6 checks them against the CPU, and on a GPU a `section 97:` line times them beside section 93's.
- **Section 97 predicts:** the chain with its history is faster than today's page, by 1.3-1.5 x on the 1080 and 1.25-1.55 x on
  the Intel; every gate green.
- **Don't commit or pull between runs.**
- **Send back all four JSON files.**

**The outcome so far (section 98): on the Intel the chain with its history is still cheaper than today's page.** It was 1.330
and 1.316 x, with every gate green, and the history's passes cost 83-86 ms. The 1080's run a was green at 1.405 x. Its run b
does not count: `render/denoiseTiming-selfcheck.mjs` died 17.7 s in, with no FAIL line. **The 1080 owes one run**, on a fresh
clone of this branch:

```
cd WebGLEngine
set SWEK_WEBGPU=
node render/denoiseTiming-selfcheck.mjs
node tools/ship/realGpuRun.mjs --only denoise --out denoise-rig-r33-b2.json
```

- **Send back the first line's console output and the JSON file.** The first line runs the timing gate alone. It reports where
  the gate dies and decides nothing.

## Send back

The JSON file. It holds the platform, the browser flags, every adapter seen, each gate's verdict, time, failing rows and
measured lines -- enough to compare against this box's SwiftShader figures row by row.
