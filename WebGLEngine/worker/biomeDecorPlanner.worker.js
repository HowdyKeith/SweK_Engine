// FILE: worker/biomeDecorPlanner.worker.js
// VERSION: v1 - round 214
//
// Web Worker that plans biome-specific decoration placements without
// blocking the main thread. The MAIN-THREAD dispatcher splits the world
// region into tiles and posts each tile to a worker; workers compute
// {x, z, biome, kind, scale, yaw, rotMul} placement records and post
// them back. Main thread applies via router.exec(entity:spawnMesh).
//
// Workers receive everything they need to be SELF-CONTAINED:
//   • Region bounds
//   • biomeMap seed (so they can re-compute biomes locally)
//   • topY heightmap for the region (Int16Array, transferable)
//   • density + rules per biome
//
// Workers DO NOT touch world state. They only produce plans.
// The dispatcher applies them.
//
// Protocol:
//   IN:  { cmd: "plan", id, x0, z0, x1, z1, heightmap, hmStride, seed, density }
//   OUT: { id, placements: Float32Array, count }
//
// placements layout (per record, 8 floats):
//   [x, z, y, scale, yaw, kindIndex, biomeIndex, _reserved]

// =============================================================================
// Inline copy of the deterministic value-noise biome classifier from
// world/biomeMap.js. Kept inline so the worker has zero imports and can
// boot without resolving ESM paths (some browsers strict on worker
// import paths).
// =============================================================================

const BIOMES = ["tundra", "plains", "jungle", "mountains", "volcano", "swamp", "lake"];
// Kinds we know how to scatter, indexed for compact placement records
const KINDS = ["rock", "boulder", "tree_stump", "obelisk", "fauna_small"];

// v2830 -- THE WORLEY DECOR PATH. world/biomeSpawns.js was gated 13/13 in v2788 and its DECOR half was consumed
// by nothing: treeSpawner took the tree entries in v2825 and every {category:"decor"} plan was discarded.
//
// This worker is a MODULE worker ({type:"module"} in biomeDecorPool.js, and chunkMesher.worker.js already
// imports), so the table can be IMPORTED rather than copied. That matters: the inline BIOME_RULES below is a
// second decoration table, and two tables describing the same thing drift until they disagree about the world.
// Importing keeps ONE source for the Worley path while leaving the legacy single-axis path exactly as it was.
//
// The classifier switches WITH the table, deliberately: biomeSpawnPlan classifies with the same Worley
// classifier the terrain HEIGHT already uses when the flag is on, so decor and landscape agree about where a
// desert is. Mixing the Worley table with the single-axis classifier would scatter palms across tundra.
import { biomeSpawnPlan, BIOME_SPAWNS } from "../world/biomeSpawns.js";

// A stable index list for the Worley biomes. The worker posts its OWN kinds/biomes arrays back with every
// message, so the pool decodes using whichever table actually produced the records -- which is exactly what
// makes swapping the table safe without touching the decoder.
const WORLEY_BIOMES = Object.keys(BIOME_SPAWNS);

function _hash2d(x, z, seed) {
    let h = (x * 374761393) ^ (z * 668265263) ^ (seed * 982451653);
    h = (h ^ (h >>> 13)) * 1274126177;
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967295;
}
function _valueNoise2d(x, z, seed) {
    const x0 = Math.floor(x), x1 = x0 + 1;
    const z0 = Math.floor(z), z1 = z0 + 1;
    const fx = x - x0, fz = z - z0;
    const h00 = _hash2d(x0, z0, seed);
    const h01 = _hash2d(x0, z1, seed);
    const h10 = _hash2d(x1, z0, seed);
    const h11 = _hash2d(x1, z1, seed);
    const u = fx * fx * (3 - 2 * fx);
    const v = fz * fz * (3 - 2 * fz);
    return h00 * (1 - u) * (1 - v) + h10 * u * (1 - v) +
           h01 * (1 - u) * v       + h11 * u * v;
}
function _biomeAt(x, z, seed) {
    const macro = _valueNoise2d(x * 0.005,  z * 0.005,  seed);
    const micro = _valueNoise2d(x * 0.03 + 100, z * 0.03 + 100, seed);
    let t = 0.7 * macro + 0.3 * micro;
    t = Math.max(0, Math.min(1, (t - 0.5) * 3 + 0.5));
    if (t < 0.18)      return 0;   // tundra
    if (t < 0.42)      return 1;   // plains
    if (t < 0.62)      return 2;   // jungle
    if (t < 0.85)      return 3;   // mountains
    return 4;                       // volcano
}

// Round 289 — wetness overlay matching world/biomeMap.js#getWetness.
// Independent of the biome bucket so swamp/lake patches can be
// painted on top of plains/jungle. Same XOR-seed offset as the
// main-thread sampler so worker and main agree on which cells are
// wet — critical for visual consistency.
function _wetnessAt(x, z, seed) {
    return _valueNoise2d(x * 0.02 + 2500, z * 0.02 + 2500, seed ^ 0x5a5a5a5a);
}

// Effective biome index that overlays wetness on top of the base
// classification. Lake (wet > 0.85) and swamp (0.65 < wet < 0.85)
// only override on plains/jungle — tundra/mountains/volcano keep
// their own surface treatment.
function _effectiveBiome(x, z, seed) {
    const base = _biomeAt(x, z, seed);
    if (base !== 1 && base !== 2) return base;       // only plains/jungle wet
    const w = _wetnessAt(x, z, seed);
    if (w > 0.85) return 6;                          // lake
    if (w > 0.65) return 5;                          // swamp
    return base;
}

// Per-biome decoration probability (chance per columns, after density mul)
// and kind weights. Tundra: sparse. Jungle: dense (lots of stumps/rocks).
// Mountains: sparse boulders. Volcano: scattered obeliscs.
// Round 289 — swamp: heavy dead-tree (tree_stump) presence + boulders
// (water-worn rocks), no obeliscs. Lake: very sparse — only a few
// reed-clumps (fauna_small) at the edges. Decor that lands in actual
// water voxels gets skipped at placement time.
const BIOME_RULES = {
    0: { rate: 0.006, kindWeights: [3, 5, 0, 0, 2] },           // tundra
    1: { rate: 0.010, kindWeights: [4, 2, 3, 1, 4] },           // plains
    2: { rate: 0.025, kindWeights: [3, 4, 8, 0, 5] },           // jungle (DENSE)
    3: { rate: 0.012, kindWeights: [4, 8, 0, 1, 1] },           // mountains
    4: { rate: 0.014, kindWeights: [6, 4, 0, 3, 0] },           // volcano
    5: { rate: 0.018, kindWeights: [2, 5, 9, 0, 3], scaleMin: 1.1, scaleMax: 2.4 },  // swamp — DENSE dead trees + boulders, tall
    6: { rate: 0.004, kindWeights: [0, 0, 0, 0, 10], scaleMin: 0.4, scaleMax: 0.8 }, // lake — sparse, low fauna only (reed clumps)
};

function pickKind(weights, rand) {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rand * total;
    for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r <= 0) return i;
    }
    return weights.length - 1;
}

self.onmessage = (e) => {
    const msg = e.data;
    if (msg.cmd !== "plan") return;
    const { id, x0, z0, x1, z1, heightmap, hmStride, seed, density = 1.0, useWorley = false } = msg;
    const w = x1 - x0, d = z1 - z0;

    // Estimate upper bound on placements (rate × area × density)
    const maxRate = 0.03 * density;
    const upper = Math.ceil(w * d * maxRate) + 16;
    const buf = new Float32Array(upper * 8);
    let count = 0;

    // Seeded RNG so the same tile always produces the same scatter
    let rng = (seed ^ x0 ^ (z0 * 31)) >>> 0;
    const rand = () => {
        rng = (rng + 0x6D2B79F5) >>> 0;
        let t = rng;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    for (let zi = 0; zi < d; zi++) {
        const z = z0 + zi;
        for (let xi = 0; xi < w; xi++) {
            const x = x0 + xi;
            // Round 289 — wetness overlay can promote plains/jungle to
            // swamp (5) or lake (6); other biomes pass through.
            let biome, kindIdx, rule;

            if (useWorley) {
                // The TABLE decides both whether anything is here and what it is. A null plan is a SKIP -- the
                // nulls ARE the density -- and a tree plan belongs to treeSpawner, not here.
                const plan = biomeSpawnPlan(x, z, seed);
                if (!plan || plan.category !== "decor") continue;
                if (density < 1 && rand() > density) continue;      // the density slider still thins it
                kindIdx = KINDS.indexOf(plan.kind);
                if (kindIdx < 0) continue;                          // a kind this worker cannot encode is skipped, not guessed
                biome = WORLEY_BIOMES.indexOf(plan.biome);
                rule = null;
            } else {
                biome = _effectiveBiome(x, z, seed);
                rule  = BIOME_RULES[biome];
                const rate  = rule.rate * density;
                if (rand() > rate) continue;
                kindIdx = pickKind(rule.kindWeights, rand());
            }

            // Read top Y from the heightmap (clamped)
            const hmIdx = zi * hmStride + xi;
            const topY = heightmap[hmIdx];
            if (topY <= 0) continue;
            // Round 289 — per-rule scale range so swamp dead-trees are
            // tall+narrow and lake reeds are squat. Default kept at
            // (0.6 .. 1.8) to match the original distribution.
            const sMin = (rule && rule.scaleMin) ?? 0.6;
            const sMax = (rule && rule.scaleMax) ?? 1.8;
            const scale = sMin + rand() * (sMax - sMin);
            const yaw   = rand() * Math.PI * 2;
            if ((count + 1) * 8 > buf.length) break;
            const off = count * 8;
            buf[off + 0] = x;
            buf[off + 1] = z;
            buf[off + 2] = topY + 1;
            buf[off + 3] = scale;
            buf[off + 4] = yaw;
            buf[off + 5] = kindIdx;
            buf[off + 6] = biome;
            buf[off + 7] = 0;
            count++;
        }
    }

    self.postMessage({
        id,
        placements: buf,
        count,
        kinds:  KINDS,
        // post back the table that ACTUALLY produced these records, so the pool decodes with the right names
        biomes: useWorley ? WORLEY_BIOMES : BIOMES,
    }, [buf.buffer]);
};
