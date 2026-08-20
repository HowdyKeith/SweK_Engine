// FILE: /ai-bridge/meshGenStatus.cjs
// ---------------------------------------------------------------------------
// v475 — readiness detection for the "AI MODELS — per-task picker" pipeline
// tools section. Extracted from server.js so it's unit-testable.
//
// Two generator schemas are supported:
//   * ComfyUI-node generators (the way this rig actually does image-to-3D):
//       { comfyNodeDir: "ComfyUI-Trellis2-main", outputExt: ".glb" }
//     → "found" when <comfyRoot>/ComfyUI/custom_nodes/<comfyNodeDir> exists.
//       (Invoking it also needs ComfyUI online — surfaced separately.)
//   * Standalone-repo generators (legacy): { repoDir, python, argsTemplate }
//       → "found" when the repo + entrypoint (+ optional python) exist.
//
// The old defaults listed standalone repos with repoDir:null, so every
// image-to-3D generator the user had installed *as a ComfyUI node* reported
// not-found — hence the panel showing only mesh2vox ready (1 of N).
// ---------------------------------------------------------------------------
const fs   = require("fs");
const path = require("path");

function meshGeneratorStatus(comfyRoot, generators, existsSync = fs.existsSync) {
    const out = {};
    for (const [name, gen] of Object.entries(generators || {})) {
        if (gen && gen.comfyNodeDir) {
            const dir = path.join(comfyRoot, "ComfyUI", "custom_nodes", gen.comfyNodeDir);
            out[name] = existsSync(dir)
                ? { found: true, kind: "comfy-node", repoDir: dir, outputExt: gen.outputExt,
                    reason: "ComfyUI node installed — start ComfyUI to invoke" }
                : { found: false, kind: "comfy-node",
                    reason: `custom_nodes/${gen.comfyNodeDir} not found — install via the Install panel` };
            continue;
        }
        const repo = gen && gen.repoDir;
        const py   = gen && gen.python;
        const entrypoint = (gen && gen.argsTemplate && gen.argsTemplate[0] && repo)
            ? path.join(repo, gen.argsTemplate[0]) : null;
        if (!repo || !existsSync(repo)) {
            out[name] = { found: false, reason: "repoDir not configured or missing" };
        } else if (entrypoint && !existsSync(entrypoint)) {
            out[name] = { found: false, reason: `entrypoint ${gen.argsTemplate[0]} not found in ${repo}` };
        } else if (py && !existsSync(py)) {
            out[name] = { found: false, reason: `python interpreter not found: ${py}` };
        } else {
            out[name] = { found: true, repoDir: repo, python: py ?? `conda(${gen.conda})`,
                          outputExt: gen.outputExt, argsTemplate: gen.argsTemplate };
        }
    }
    return out;
}

module.exports = { meshGeneratorStatus };
