// =============================================================================
// FILE: /world/birthTestBench.js
// ROUND: 207
// =============================================================================
//
// Test bench for the round 205 birth reveal modes. Lets you see each
// reveal animation without waiting for a full AI pipeline run.
//
// On first use, installs a simple cube asset ("test_birth_cube") via
// assetLoader.installOBJText so spawns short-circuit through
// BirthSpawner's cached-asset path (instant reveal, no Ollama/Trellis
// wait).
//
// Console API (wired to window in main.js):
//
//   window.testBirth("crater")     // spawn one cube at the camera-relative
//                                  // ground location, using crater mode
//
//   window.testBirthAll()          // spawn one of every mode in a row,
//                                  // spaced 10u apart
//
//   window.testBirthAt(mode, x, z) // spawn at explicit world coords
//
//   window.testBirthClear()        // wipe state so the cube asset can be
//                                  // reinstalled (used when iterating)
//
// Hooks:
//   - window.birthSpawner            — produced by main.js (round 203)
//   - window.assetLoader             — for installOBJText
//   - window.camera                  — for spawn-relative-to-view positioning
//   - window.world?._heightAt(x,z)   — for ground Y at spawn point
// =============================================================================

import { REVEAL_MODES } from "./birthSpawner.js";
import { installCarrierAssets } from "./carrierAssets.js";   // round 208

const TEST_ASSET_ID = "test_birth_cube";

// Simple anchored cube — 2 units tall, base at y=0. Anchor at base so
// the entity's Position.y can sit on the terrain surface and the cube
// rises upward (matches how kaiju assets are laid out).
const CUBE_OBJ = `# test_birth_cube — 2×2×2 unit cube anchored at bottom face
v -1 0 -1
v  1 0 -1
v  1 0  1
v -1 0  1
v -1 2 -1
v  1 2 -1
v  1 2  1
v -1 2  1
# bottom (CCW from below)
f 1 4 3 2
# top
f 5 6 7 8
# sides
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
`;

let _installed = false;
let _installPromise = null;

async function _ensureInstalled() {
    if (_installed) return true;
    if (_installPromise) return _installPromise;
    const al = (typeof window !== "undefined") ? window.assetLoader : null;
    if (!al?.installOBJText) {
        console.warn("[birthTestBench] window.assetLoader.installOBJText not available");
        return false;
    }
    _installPromise = (async () => {
        try {
            await al.installOBJText(TEST_ASSET_ID, CUBE_OBJ);
            // Round 208 — also install carrier assets so testBirthAll
            // exercises the carrier-driven modes too. Idempotent.
            await installCarrierAssets(al);
            _installed = true;
            console.log(`[birthTestBench] installed "${TEST_ASSET_ID}" + carrier assets`);
            return true;
        } catch (e) {
            console.warn("[birthTestBench] installOBJText threw:", e?.message || e);
            return false;
        } finally {
            _installPromise = null;
        }
    })();
    return _installPromise;
}

// Compute a spawn point in front of the camera at ground height. Falls
// back to (0, 5, 0) if camera is unavailable.
function _spawnPointInFrontOfCamera(distance = 25) {
    const cam = (typeof window !== "undefined") ? window.camera : null;
    if (!cam) return { x: 0, y: 5, z: 0 };
    const cx = cam.x ?? cam.position?.x ?? 0;
    const cz = cam.z ?? cam.position?.z ?? 0;
    const yaw = cam.yaw ?? 0;
    // Camera facing direction: +Z when yaw=0. Use sin/cos to project.
    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);
    const x = cx + fwdX * distance;
    const z = cz + fwdZ * distance;
    const w = (typeof window !== "undefined") ? window.world : null;
    let y = 5;
    if (w?._heightAt) {
        try { y = w._heightAt(x, z); } catch {}
    } else if (w?.heightAt) {
        try { y = w.heightAt(x, z); } catch {}
    }
    return { x, y, z };
}

export async function testBirth(mode = "scale", opts = {}) {
    const bs = (typeof window !== "undefined") ? window.birthSpawner : null;
    if (!bs?.request) {
        console.warn("[birthTestBench] window.birthSpawner not available");
        return null;
    }
    if (!REVEAL_MODES[mode]) {
        console.warn(`[birthTestBench] unknown mode "${mode}". Valid: ${Object.keys(REVEAL_MODES).join(", ")}`);
        return null;
    }
    await _ensureInstalled();
    const base = opts.at || _spawnPointInFrontOfCamera(opts.distance ?? 25);
    const spec = {
        assetId: TEST_ASSET_ID,
        kind:    opts.kind || "kaiju",
        x:       base.x + (opts.dx ?? 0),
        y:       base.y + (opts.dy ?? 0),
        z:       base.z + (opts.dz ?? 0),
        scale:   opts.scale ?? 2,
        mode,
    };
    console.log(`[birthTestBench] spawning "${mode}" at (${spec.x.toFixed(1)}, ${spec.y.toFixed(1)}, ${spec.z.toFixed(1)}) scale=${spec.scale}`);
    return bs.request(spec);
}

export async function testBirthAll(opts = {}) {
    const modes = Object.keys(REVEAL_MODES);
    const spacing = opts.spacing ?? 12;
    await _ensureInstalled();
    const base = opts.at || _spawnPointInFrontOfCamera(opts.distance ?? 35);
    const results = [];
    for (let i = 0; i < modes.length; i++) {
        const dx = (i - (modes.length - 1) / 2) * spacing;
        const spec = {
            assetId: TEST_ASSET_ID,
            kind:    opts.kind || "kaiju",
            x:       base.x + dx,
            y:       base.y,
            z:       base.z,
            scale:   opts.scale ?? 2,
            mode:    modes[i],
        };
        const p = window.birthSpawner.request(spec);
        results.push({ mode: modes[i], promise: p });
    }
    console.log(`[birthTestBench] spawned all ${modes.length} reveal modes spaced ${spacing}u apart along X axis`);
    console.log(`[birthTestBench] modes (left→right): ${modes.join(", ")}`);
    return results;
}

export async function testBirthAt(mode, x, z, opts = {}) {
    const w = (typeof window !== "undefined") ? window.world : null;
    let y = opts.y ?? 5;
    if (w?._heightAt) {
        try { y = w._heightAt(x, z); } catch {}
    }
    return testBirth(mode, { ...opts, at: { x, y, z } });
}

export function testBirthClear() {
    _installed = false;
    _installPromise = null;
    console.log("[birthTestBench] cleared install state — next call will reinstall the cube asset");
}

export function listRevealModes() {
    return Object.keys(REVEAL_MODES).map(m => ({
        mode: m,
        durMs: REVEAL_MODES[m].durMs,
        spawnOffset: REVEAL_MODES[m].spawnOffset({ x:0,y:0,z:0 }),
        effects: REVEAL_MODES[m].effects ? Object.keys(REVEAL_MODES[m].effects) : [],
    }));
}
