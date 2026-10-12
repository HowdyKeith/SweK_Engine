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

## Send back

The JSON file. It holds the platform, the browser flags, every adapter seen, each gate's verdict, time, failing rows and
measured lines -- enough to compare against this box's SwiftShader figures row by row.
