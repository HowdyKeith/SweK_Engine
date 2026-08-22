// ===================================================================
// gpu/coralReef.js
// -------------------------------------------------------------------
// Voxel coral. The "ocean systems" build session tried to make coral
// with SDF / L-system / metaball point clouds drawn as gl.TRIANGLES —
// which produced vertex soup. In a voxel engine the right answer is
// voxels: each archetype is built as an explicit [[x,y,z,c],...] blueprint
// (the same format Gemini emits for creatures), fed through the proven
// buildVoxelMesh() culled-cube builder, then registered as a STATIC
// spawnable kind via assetLoader._createMesh — exactly the path the
// hardpoint turret/hull meshes use. Per-voxel palette colors survive,
// so coral is multi-coloured, blocky, and fits the world's look.
//
//   registerCoralKinds(assetLoader) -> ["coral_brain", "coral_staghorn", ...]
//   then any demo can ctx.spawnMesh("coral_brain", x, y, z, scale).
//
// Palette indices (gpu/voxelCreature.js CREATURE_PALETTE):
//   0 grey · 1 red · 2 orange · 3 yellow · 4 green · 5 cyan · 6 blue · 7 white
// ===================================================================

import { buildVoxelMesh } from "./voxelCreature.js";

// Small deterministic RNG so each kind is reproducible build-to-build.
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function addVoxel(set, list, x, y, z, c) {
    x |= 0; y |= 0; z |= 0;
    const k = x + "," + y + "," + z;
    if (set.has(k)) return;
    set.add(k);
    list.push([x, y, z, c]);
}

// ---- Brain / boulder coral: a solid rounded half-dome, base at y=0. ----
function genBrain(rng, color) {
    const set = new Set(), out = [];
    const rx = 3 + Math.round(rng()), ry = 2 + Math.round(rng() * 2), rz = 3 + Math.round(rng());
    for (let x = -rx; x <= rx; x++)
        for (let y = 0; y <= ry; y++)
            for (let z = -rz; z <= rz; z++) {
                const e = (x*x)/(rx*rx) + (y*y)/(ry*ry) + (z*z)/(rz*rz);
                if (e <= 1.0) {
                    // grooved colour: alternate ridges read as brain folds; top caps white
                    let c = color;
                    if (y >= ry - 1 && rng() < 0.35) c = 7;
                    else if (((x + z) & 1) === 0) c = color === 2 ? 3 : color; // hint of variation
                    addVoxel(set, out, x, y, z, c);
                }
            }
    return out;
}

// ---- Staghorn coral: deterministic branch walk, up + outward forks. ----
function genStaghorn(rng, color) {
    const set = new Set(), out = [];
    const grow = (x, y, z, dx, dz, len, depth) => {
        for (let i = 0; i < len; i++) {
            const c = (i >= len - 2) ? 7 : color;   // white tips
            addVoxel(set, out, x, y, z, c);
            y += 1;
            if (rng() < 0.45) x += dx;
            if (rng() < 0.45) z += dz;
            // fork
            if (depth > 0 && i > 1 && rng() < 0.4) {
                const ndx = rng() < 0.5 ? -1 : 1, ndz = rng() < 0.5 ? -1 : 1;
                grow(x, y, z, ndx, ndz, Math.max(2, len - i - 1), depth - 1);
            }
        }
    };
    const trunks = 2 + Math.round(rng() * 2);
    for (let t = 0; t < trunks; t++) {
        const ox = Math.round((rng() - 0.5) * 3), oz = Math.round((rng() - 0.5) * 3);
        grow(ox, 0, oz, rng() < 0.5 ? -1 : 1, rng() < 0.5 ? -1 : 1, 5 + Math.round(rng() * 3), 2);
    }
    return out;
}

// ---- Table coral: a stalk + a flat disc slab on top. ----
function genTable(rng, color) {
    const set = new Set(), out = [];
    const stalkH = 3 + Math.round(rng() * 2);
    for (let y = 0; y < stalkH; y++) {
        addVoxel(set, out, 0, y, 0, 0);  // grey stalk
        if (rng() < 0.4) addVoxel(set, out, (rng() < 0.5 ? 1 : -1), y, 0, 0);
    }
    const r = 3 + Math.round(rng());
    for (let x = -r; x <= r; x++)
        for (let z = -r; z <= r; z++)
            if (x*x + z*z <= r*r) {
                addVoxel(set, out, x, stalkH, z, color);
                if (rng() < 0.25) addVoxel(set, out, x, stalkH + 1, z, color === 3 ? 7 : color);
            }
    return out;
}

// ---- Finger / pillar coral: a cluster of tall thin columns. ----
function genPillar(rng, color) {
    const set = new Set(), out = [];
    const cols = 3 + Math.round(rng() * 2);
    for (let c = 0; c < cols; c++) {
        const ox = Math.round((rng() - 0.5) * 5), oz = Math.round((rng() - 0.5) * 5);
        const h = 4 + Math.round(rng() * 4);
        for (let y = 0; y < h; y++) {
            addVoxel(set, out, ox, y, oz, (y >= h - 1) ? 7 : color);  // white tip
        }
    }
    return out;
}

// ---- Fan / sea-whip coral: a thin vertical fan in the XY plane. ----
function genFan(rng, color) {
    const set = new Set(), out = [];
    const h = 5 + Math.round(rng() * 2), w = 4 + Math.round(rng());
    for (let y = 0; y <= h; y++) {
        const spread = Math.round((y / h) * w);   // widens upward
        for (let x = -spread; x <= spread; x++) {
            // lacy holes
            if (((x + y) % 3) === 0 && y > 1 && rng() < 0.6) continue;
            addVoxel(set, out, x, y, 0, (y >= h - 1) ? 7 : color);
            if (rng() < 0.15) addVoxel(set, out, x, y, 1, color);  // slight thickness
        }
    }
    return out;
}

// Archetype catalogue: kind name -> { gen, color seed, rng seed }
const ARCHETYPES = [
    { kind: "coral_brain",    gen: genBrain,    color: 2, seed: 0x10a },  // orange
    { kind: "coral_brain_red",gen: genBrain,    color: 1, seed: 0x10b },  // red
    { kind: "coral_staghorn", gen: genStaghorn, color: 5, seed: 0x20a },  // cyan
    { kind: "coral_table",    gen: genTable,    color: 3, seed: 0x30a },  // yellow top
    { kind: "coral_pillar",   gen: genPillar,   color: 1, seed: 0x40a },  // red fingers
    { kind: "coral_pillar_b", gen: genPillar,   color: 6, seed: 0x40b },  // blue fingers
    { kind: "coral_fan",      gen: genFan,      color: 3, seed: 0x50a },  // yellow fan
    { kind: "coral_fan_red",  gen: genFan,      color: 1, seed: 0x50b },  // red fan
];

export const CORAL_KINDS = ARCHETYPES.map(a => a.kind);

/**
 * Build + register all coral archetypes as static spawnable kinds.
 * Idempotent: kinds already in the cache are skipped.
 * @returns {string[]} kind names successfully registered (or already present)
 */
export function registerCoralKinds(assetLoader) {
    if (!assetLoader || !assetLoader.gl || !assetLoader.cache || !assetLoader._createMesh) {
        console.warn("[coralReef] asset loader unsupported; skipping coral registration");
        return [];
    }
    const done = [];
    for (const a of ARCHETYPES) {
        if (assetLoader.cache.get(a.kind)) { done.push(a.kind); continue; }
        try {
            const rng = mulberry32(a.seed);
            const voxels = a.gen(rng, a.color);
            if (!voxels.length) continue;
            const g = buildVoxelMesh(voxels);
            const mesh = assetLoader._createMesh(
                g.positions.buffer, g.indices.buffer, g.normals.buffer, g.colors.buffer,
                { name: a.kind, vertexCount: g.vertexCount, indexCount: g.indices.length,
                  hasNormals: true, hasColors: true }
            );
            if (mesh) {
                assetLoader.cache.set(a.kind, mesh);
                assetLoader._ollamaRequested?.add?.(a.kind);   // suppress auto-gen, like hardpoints
                done.push(a.kind);
            }
        } catch (e) {
            console.warn(`[coralReef] failed to build "${a.kind}":`, e?.message ?? e);
        }
    }
    console.log(`[coralReef] registered ${done.length} coral kinds: ${done.join(", ")}`);
    return done;
}
