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
| **timing** | what the GPU takes: the flow's cost, FSR3 on the browser's clock, pass timings | the point of the run. These are the numbers SwiftShader cannot give |

The kinds are read from each gate's source (`categorize` in the runner: a gate that reads a clock is timing, one that grades
in dB is quality, the rest exact), and every FSR gate is in the run (`gateList`); `tools/ship/realGpuRun-selfcheck.mjs` holds
both.

## Send back

The JSON file. It holds the platform, the browser flags, every adapter seen, each gate's verdict, time, failing rows and
measured lines -- enough to compare against this box's SwiftShader figures row by row.
