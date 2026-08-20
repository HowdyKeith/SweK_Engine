#!/usr/bin/env node
// Rig-side mesh -> .vox chain.  Usage:  node tools/mesh-to-vox.mjs <mesh.obj|.ply|.stl> [dim] [--solid] [--exe <path>]
//
// Runs cuda_voxelizer on the mesh, locates the produced .vox, and validates it with the engine's own parser - printing
// the voxel count + grid dims so you can confirm the voxelization before it goes into the engine. Needs cuda_voxelizer
// on PATH (or pass --exe) and a CUDA GPU. Exits 0 on a valid .vox, 1 on failure, 2 on bad arguments.
import { meshToVox } from "./voxelizePipeline.mjs";

const argv = process.argv.slice(2);
const mesh = argv.find((a) => !a.startsWith("--") && !/^\d+$/.test(a));
const dim = parseInt(argv.find((a) => /^\d+$/.test(a)) || "256", 10);
const solid = argv.includes("--solid");
const exeIdx = argv.indexOf("--exe");
const exe = exeIdx >= 0 ? argv[exeIdx + 1] : (process.platform === "win32" ? "cuda_voxelizer.exe" : "cuda_voxelizer");

if (!mesh) { console.error("usage: node tools/mesh-to-vox.mjs <mesh> [dim] [--solid] [--exe <path>]"); process.exit(2); }

console.log("voxelizing " + mesh + " @ " + dim + (solid ? " (solid)" : "") + " via " + exe + " ...");
const r = await meshToVox(exe, mesh, { dim, solid });
if (!r.ok) { console.error("FAILED: " + r.reason); process.exit(1); }
if (!r.valid) { console.error("voxelized to " + r.voxPath + " but it didn't validate: " + r.validateError); process.exit(1); }
console.log("OK  " + r.voxPath);
console.log("    " + r.voxelCount + " voxels, grid " + r.dims.x + "x" + r.dims.y + "x" + r.dims.z + ", tool " + r.tool);
process.exit(0);
