# The snow stack on a real GPU (D3D12) -- what to run and what to send back

v4895 shipped a TAA kernel that was wrong on D3D12 and right on the Linux software adapter: it read its frame size as `u32(1.0 / invRes)`, D3D12's
reciprocal gave 23.999998 for 24, and the cut made the row stride 23. The rig's gate printed `worst 1.00e+6`, one number with nothing to compare with.
Since then every snow kernel-versus-twin comparison prints a **reading** line -- the worst difference, its limit, the margin between them and the adapter --
and `tools/ship/truncationGuard-selfcheck.mjs` looks for the bug's shape in the WGSL (none are left in the tree).

**Check the checkout first:** `git log -1` must name a commit that contains `render\snowGpuLive-selfcheck.mjs` (v4896 or later on the branch below). The first attempt (2026-10-22) ran on `ce1cca35`, a different branch, so `--only snowGpu` matched nothing and the native sweep never saw the snow gates.

Run on the Windows rig, from `WebGLEngine\`:

```bat
node tools\ship\realGpuRun.mjs --native --only render/ --out snow-native-d3d12.json
node tools\ship\realGpuRun.mjs --only snowGpu --out snow-browser-d3d12.json
```

The first runs the native gates under `render/` -- the nine snow kernel gates (`taaResolve`, `snowShading`, `aerial`, `skyBake`, `pcssShadow`, `snowFine`, `clipmapTerrain`, `deformRead`,
`toroidalDeform`) and the other render kernels -- on node-webgpu's default adapter -- D3D12 on Windows. The second runs the snow stack's SIX browser gates (`snowGpu`, `snowGpuField`, `snowGpuTaa`, `snowGpuLookA`, `snowGpuLookB`, `snowGpuLive` -- `--only snowGpu` matches all of them) in Chrome with the hardware flags; each holds the GPU's output to a CPU twin, so on a D3D12 adapter they are the first check of the snow frame against real hardware, and `snowGpuLive` prints the frame rate.

What to look at in each report, per gate: the `reading ...` lines under *measured*. A reading whose margin is under about 3x on the rig and well over 100x on the
software adapter is the next TAA bug; a gate that FAILs prints its own worst the same way. The browser report's last reading is the live loop's frame rate at 320x180
-- on the software adapter about 15 fps; on a GPU that number is the first honest look at what the frame graph costs.

Send back the two JSON files. Nothing in them is secret: adapter names, limits, verdicts, timings and the lines above.

## What the first run on the Windows rig read (2026-10-23, v4896, an Intel gen-9 on D3D12, driver 31.0.101.2137)

**Native (node-webgpu, D3D12): every snow kernel gate passes -- 14 exact, 2 quality, 2 timing.** The TAA bug is gone and the margin proves it: `taaResolve` worst 4.41e-6 against a limit of 1.00e-3, **226.7x** (v4895 printed `worst 1.00e+6`). The other readings sit at 5x to 33,000,000x, with four exceptions that are NOT hardware: `toroidalDeform`'s ice channel (1.0x and, with the rim wobble on, 1.4x) and berm channel (2.6x) read **the same to three digits on SwiftShader** (9.54e-7 / 3.58e-3 / 1.14e-4 against 9.54e-7 / 3.59e-3 / 1.14e-4), so the narrow margin is that kernel's tolerance sitting close to its single-precision floor, not a driver difference. They are the first place to look if a later driver moves.

**Browser: five of six snow gates pass; `snowGpuLive` failed, and it was the gate and not the frame loop.** The headless shell on this box reached the SOFTWARE adapter (`google`), so the report says `NO ADAPTER WAS SEEN`, and the loop ran at 0.4 fps (4 frames in nine seconds) where the gate demanded more than 20. It now waits for 12 frames and 4 footprints and reports the rate as a reading. THE FRAME RATE ON A REAL GPU IS STILL UNMEASURED: a headless browser on this rig does not get the GPU for WebGPU, so the only route to it is a native frame loop (see nextRounds `snow-native-frame-timing`).

The top-line verdict of the native report says `SOFTWARE ADAPTER (google swiftshader)` because one gate in the `render/` set (`denoiseCompile`) deliberately runs on SwiftShader; the snow gates in that report name `D3D12` in their own reading lines, and `denoiseDevice` and `denoiseTiming` ran on the Intel adapter natively.

## The frame rate on the GPU: the native frame loop (added after that run)

The browser route cannot reach the Windows rig's GPU, but node-webgpu can, so the snow frame graph is also timed natively. From `WebGLEngine\` on the rig (the clone that holds `render\snowFrameTiming.mjs`):

```bat
node tools\ship\takeSnowFrameTiming.mjs --out snow-frame-timing.json
```

It runs 2 warm-up frames and 30 timed frames at 320x180 and again at 1280x720, and prints one `reading snowFrame:` line a size: the LATENCY median/p95/min/max (encode plus the wait on the queue), the batched THROUGHPUT in ms a frame, and the encode-and-submit time alone, with the adapter's name. Send back `snow-frame-timing.json`. The first line it prints names the adapter; if it says `SOFTWARE`, the times are a CPU's and the run did not reach the GPU.

`render\snowFrameTiming-selfcheck.mjs` runs the same loop for three frames at 160x90 and is in the native sweep (`realGpuRun.mjs --native --only render/`), so the rig's native report carries its reading line too. What the timing is not: a GPU timestamp (node-webgpu offers none here), the present pass (no canvas), or a frame with footprints (the orbit stamps none). On the sandbox's software adapter a 160x90 frame costs about 170 ms.

## The first native frame timing (2026-10-23, ed626c4a, an Intel gen-9 on D3D12, driver 31.0.101.2137, 2 warm-up and 30 timed frames per size)

| size | latency median | p95 | min / max | throughput (batched) | encode + submit | GPU errors |
|---|---|---|---|---|---|---|
| 320x180 | **10.3 ms (97 fps)** | 13.8 ms | 9.5 / 24.7 ms | 7.7 ms a frame (129 fps) | ~2 ms | none |
| 1280x720 | **65.9 ms (15 fps)** | 77.8 ms | 60.2 / 112.6 ms | 58.5 ms a frame (17 fps) | ~1.3 ms | none |

What it says. The frame is GPU-bound (encoding is 1-2 ms of 10 to 66). The cost is not proportional to pixels: 16 times the pixels cost 6.4 times the time, which fits **about 6.6 ms a frame that does not depend on the picture size** (three 2048x2048 shadow passes, the deform step, the clipmap's vertex stage, the sky) **plus about 64 ms per megapixel**; at 1080p that predicts ~140 ms (7 fps) on this integrated GPU, at 960x540 ~40 ms (25 fps). Batching the submissions gains 11 to 25% over one frame at a time. The first 15 frames at 1280x720 ran at ~72 ms and the last 15 at ~61 ms, and 320x180 fell from 13.8 to 9.6 ms over its first eight: the GPU's clock was still ramping, so two warm-up frames timed the ramp. Warm-up is now ten frames and the line carries the first-half and last-half medians, so a ramp that is still going shows as a number. One hitch (24.7 ms against ~10) and one at 112.6 ms are single frames, not a trend.

The gate's own 160x90 run on the rig read 8.07 ms (latency) and 5.16 ms (throughput), which fits the same 6.6 ms floor plus a small picture. The same gate registers its adapter now; its first rig report had said `NO ADAPTER WAS SEEN` over a D3D12 reading.

## Where the frame's time goes, and the two knobs (added after the first frame timing)

The 2026-10-23 run said the frame is GPU-bound, about 6.6 ms of it independent of the picture and about 64 ms per megapixel. To see WHICH passes those are, the command now reads the GPU's own per-pass timestamps, and the shadow map size is a command option and a page parameter. From `WebGLEngine\` on the rig, in a clone that holds `render\presentScale-selfcheck.mjs`:

```bat
node tools\ship\takeSnowFrameTiming.mjs --passes --shadow-sweep --sizes 320x180,1280x720 --out snow-passes.json
node tools\ship\takeSnowFrameTiming.mjs --sizes 1280x720,960x540,640x360 --out snow-scale.json
```

The first prints, for each size at shadow maps of 2048, 1024 and 512, a `reading snowPasses:` line: the GPU milliseconds of deform, the three shadow cascades, the beauty pass and TAA (median over the frames each ran in), their sum, and the share of the wall-clock frame that sum is. The gap is queue time the timestamps do not see. The second times the same frame at three render sizes. On the sandbox's software adapter at 160x90 the beauty pass is ~100 of ~163 ms and the shadows ~38; the Intel gen-9's split is what the rig run will say, and it decides the defaults below.

The knobs. **Render scale:** `snow-gpu.html` has a slider (25 to 100%) and `?scale=0.75` in the address; the frame renders at that fraction of the canvas and the present pass reads it bilinearly (`render/presentScale-selfcheck.mjs` holds the filter to a CPU twin within one 8-bit level at five ratios, and the real page at `?scale=0.5` in `snowGpuLive-selfcheck`). **Shadow size:** `?shadow=1024` (512, 1024, 1536, 2048, 4096) in the address, or `--shadow-res` / `--shadow-sweep` on the command. NOTHING IS CHANGED BY DEFAULT: scale 100%, shadow 2048, the frame as before (the six older snow gates pass unchanged). Which default to ship, and whether the far cascades need the whole clipmap's vertex stage at all, waits for the rig's per-pass numbers.
