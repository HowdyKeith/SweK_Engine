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
