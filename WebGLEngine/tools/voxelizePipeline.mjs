// FILE: tools/voxelizePipeline.mjs
// The mesh -> .vox -> engine hook, made testable. cuda_voxelizer (Forceflow/cuda_voxelizer) turns a polygon mesh
// (.obj/.ply/.stl/.glb via trimesh2) into a MagicaVoxel .vox; this module builds the command, runs it (with an
// injectable spawn so the orchestration is unit-testable without a CUDA GPU), locates the output file, and - now that
// the engine can READ .vox via tools/voxParser.js - VALIDATES the result, returning the voxel count + grid dims so a
// malformed/empty voxelization is caught before anything ingests it.
//
// CLI flags (web-verified, Forceflow/cuda_voxelizer): -f <mesh>  -s <grid>  -o vox  [-solid]  [-cpu]
// Output: written next to the input (in cwd) as "<basename-without-ext>_<grid>.vox".
import { parseVox } from "./voxParser.js";
import _cp from "node:child_process";
import _fs from "node:fs";
import _path from "node:path";

// --- pure helpers (fully testable) ---

// argv for cuda_voxelizer.
function voxelizeArgs(meshPath, opts = {}) {
    const dim = (opts.dim | 0) || 256;
    const args = ["-f", meshPath, "-s", String(dim), "-o", "vox"];
    if (opts.solid) args.push("-solid");
    if (opts.cpu) args.push("-cpu");
    return args;
}

// The filename cuda_voxelizer writes for a given mesh + grid: "<base>_<grid>.vox" (extension stripped).
function expectedVoxName(meshPath, dim) {
    const base = String(meshPath).replace(/^.*[\\/]/, "").replace(/\.[^.]*$/, "");
    return base + "_" + ((dim | 0) || 256) + ".vox";
}

// Parse + sanity-check .vox bytes (ArrayBuffer / Uint8Array). Returns { ok, voxelCount, dims, models } or { ok:false }.
function validateVoxBytes(bytes) {
    const ab = bytes instanceof Uint8Array ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes;
    const r = parseVox(ab);
    if (!r || !r.ok) return { ok: false, error: (r && r.error) || "parse failed" };
    const voxelCount = r.models.reduce((n, m) => n + m.voxels.length, 0);
    const m0 = r.models[0] || { sizeX: 0, sizeY: 0, sizeZ: 0 };
    return { ok: voxelCount > 0, voxelCount, dims: { x: m0.sizeX, y: m0.sizeY, z: m0.sizeZ }, models: r.models.length, empty: voxelCount === 0 };
}

// --- file/process side (rig: needs the cuda_voxelizer binary + a CUDA GPU) ---

// Read + validate a .vox file on disk.
async function validateVoxFile(voxPath, deps = {}) {
    const fs = deps.fs || _fs;
    const buf = fs.readFileSync(voxPath);
    return validateVoxBytes(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
}

// Run cuda_voxelizer on a mesh. `deps.spawn` + `deps.fs` are injectable for testing. Resolves the produced .vox path.
function runCudaVoxelizer(cudaExe, meshPath, opts = {}, deps = {}) {
    return new Promise((resolve) => {
        const spawn = deps.spawn || _cp.spawn;
        const fs = deps.fs || _fs;
        const path = deps.path || _path;
        const dim = (opts.dim | 0) || 256;
        const outDir = opts.outDir || path.dirname(meshPath);
        const args = voxelizeArgs(meshPath, opts);
        let child;
        try { child = spawn(cudaExe, args, { cwd: outDir }); }
        catch (e) { return resolve({ ok: false, reason: "spawn failed: " + (e && e.message), args }); }
        let stderr = "";
        if (child.stderr) child.stderr.on("data", (d) => { stderr += d.toString(); });
        child.on("error", (err) => resolve({ ok: false, reason: err.message, args }));
        child.on("close", (code) => {
            const produced = path.join(outDir, expectedVoxName(meshPath, dim));
            if (fs.existsSync(produced)) resolve({ ok: true, voxPath: produced, tool: "cuda_voxelizer", exitCode: code, args, solid: !!opts.solid });
            else resolve({ ok: false, reason: "output missing (exit " + code + "); stderr=" + stderr.trim().slice(0, 240), args, exitCode: code });
        });
    });
}

// Full chain: voxelize the mesh, then validate the .vox. Returns the run result enriched with { voxelCount, dims, valid }.
async function meshToVox(cudaExe, meshPath, opts = {}, deps = {}) {
    const run = await runCudaVoxelizer(cudaExe, meshPath, opts, deps);
    if (!run.ok) return run;
    let v = null;
    try { v = await validateVoxFile(run.voxPath, deps); }
    catch (e) { v = { ok: false, error: "validate failed: " + (e && e.message) }; }
    return Object.assign({}, run, { valid: !!(v && v.ok), voxelCount: v && v.voxelCount, dims: v && v.dims, validateError: v && v.ok ? undefined : (v && v.error) });
}

export { voxelizeArgs, expectedVoxName, validateVoxBytes, validateVoxFile, runCudaVoxelizer, meshToVox };
