# The snow stack on a real GPU (D3D12) -- what to run and what to send back

v4895 shipped a TAA kernel that was wrong on D3D12 and right on the Linux software adapter: it read its frame size as `u32(1.0 / invRes)`, D3D12's
reciprocal gave 23.999998 for 24, and the cut made the row stride 23. The rig's gate printed `worst 1.00e+6`, one number with nothing to compare with.
Since then every snow kernel-versus-twin comparison prints a **reading** line -- the worst difference, its limit, the margin between them and the adapter --
and `tools/ship/truncationGuard-selfcheck.mjs` looks for the bug's shape in the WGSL (none are left in the tree).

Run on the Windows rig, from `WebGLEngine\`:

```bat
node tools\ship\realGpuRun.mjs --native --only render/ --out snow-native-d3d12.json
node tools\ship\realGpuRun.mjs --only snowGpu --out snow-browser-d3d12.json
```

The first runs the native gates under `render/` -- the nine snow kernel gates (`taaResolve`, `snowShading`, `aerial`, `skyBake`, `pcssShadow`, `snowFine`, `clipmapTerrain`, `deformRead`,
`toroidalDeform`) and the other render kernels -- on node-webgpu's default adapter -- D3D12 on Windows. The second runs `render/snowGpu-selfcheck.mjs` in Chrome with the hardware flags.

What to look at in each report, per gate: the `reading ...` lines under *measured*. A reading whose margin is under about 3x on the rig and well over 100x on the
software adapter is the next TAA bug; a gate that FAILs prints its own worst the same way. The browser report's last reading is the live loop's frame rate at 320x180
-- on the software adapter about 15 fps; on a GPU that number is the first honest look at what the frame graph costs.

Send back the two JSON files. Nothing in them is secret: adapter names, limits, verdicts, timings and the lines above.
