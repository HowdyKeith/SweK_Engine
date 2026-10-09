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
the report says so.

The page itself has the same button: open `denoise.html` in your browser and press **Time the network**. It shows the
table for whatever adapter the browser hands it, and says so plainly when that adapter is software.

## Send back

The JSON file. It holds the platform, the browser flags, every adapter seen, each gate's verdict, time, failing rows and
measured lines -- enough to compare against this box's SwiftShader figures row by row.
