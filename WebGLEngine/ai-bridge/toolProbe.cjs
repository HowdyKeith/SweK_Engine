// FILE: /ai-bridge/toolProbe.cjs
// ---------------------------------------------------------------------------
// v476 — candidate-location probing for the two OPTIONAL pipeline tools that
// aren't ComfyUI nodes and aren't pip packages:
//
//   cuda_voxelizer — a standalone compiled binary (Forceflow/cuda_voxelizer):
//                    cuda_voxelizer.exe on Windows. NOT a pip package, NOT a
//                    .pyd in site-packages. mesh→voxel rasterizer.
//   ultrashape     — a separate cloned repo (UltraShape-1.0) with main.py.
//                    Optional mesh-refinement pass. NOT a TRELLIS HF subfolder.
//
// Both are optional: mesh_to_vox already covers voxelization, and UltraShape
// is just polish. These helpers build the list of places worth checking so
// the panel can (a) auto-detect them if they're in an obvious spot and
// (b) tell the user exactly where it looked when they're absent.
// ---------------------------------------------------------------------------
const path = require("path");

function binaryCandidates(exeName, comfyRoot) {
    const c = [];
    if (comfyRoot) {
        c.push(
            path.join(comfyRoot, exeName),
            path.join(comfyRoot, "ComfyUI", "custom_nodes", "ComfyUI-Trellis2-main", exeName),
            path.join(comfyRoot, "ComfyUI", "custom_nodes", "ComfyUI-Trellis2-main", "bin", exeName),
            path.join(comfyRoot, "python_embeded", "Scripts", exeName),
            path.join(comfyRoot, "tools", exeName),
        );
    }
    c.push("C:\\VoxelBAK\\Tools\\cuda_voxelizer\\" + exeName,   // v479 — where tool-cuda-voxelizer installs it
           "C:\\VoxelBAK\\Tools\\" + exeName,
           "C:\\Tools\\" + exeName, "C:\\Program Files\\" + exeName);
    return c;
}

function ultrashapeCandidates(comfyRoot, configured) {
    const c = [];
    if (configured) c.push(configured);
    if (comfyRoot) {
        c.push(
            path.join(comfyRoot, "ComfyUI", "custom_nodes", "UltraShape-1.0"),
            path.join(comfyRoot, "ComfyUI", "custom_nodes", "ComfyUI-UltraShape"),
            path.join(comfyRoot, "..", "UltraShape-1.0"),
        );
    }
    c.push("C:\\AI\\UltraShape-1.0", "C:\\VoxelBAK\\UltraShape-1.0");
    return c;
}

// First candidate that exists (optionally requiring a child file, e.g. main.py).
function firstExisting(candidates, existsSync, childFile) {
    for (const p of candidates) {
        try {
            if (!existsSync(p)) continue;
            if (childFile && !existsSync(path.join(p, childFile))) continue;
            return p;
        } catch {}
    }
    return null;
}

// Trim a path list for a one-line "looked in: …" reason.
function shortList(candidates, n = 4) {
    return candidates.slice(0, n).join("  ·  ") + (candidates.length > n ? "  · …" : "");
}

module.exports = { binaryCandidates, ultrashapeCandidates, firstExisting, shortList };
