// ===================================================================
// gpu/seaCreatures.js
// -------------------------------------------------------------------
// Bespoke voxel meshes for the ocean ecosystem. The original "ocean
// systems" teardown (OCEAN_TEARDOWN.md, item #2) flagged that the demo
// approximated stingray / turtle / octopus with reused uniform-scale
// kinds (kaiju_water / wad_pickup_o2 / kaiju_underground) — which can't
// carry the right silhouette (a flat-wide ray can't be a squashed
// kaiju). The engine-native fix is the same path coral took: author each
// as an explicit [[x,y,z,c],...] voxel blueprint, run it through the
// proven buildVoxelMesh() culled-cube builder, register it as a STATIC
// spawnable kind via assetLoader._createMesh. Per-voxel palette colours
// survive, so they're blocky, multi-coloured, and fit the world's look.
//
//   registerSeaCreatureKinds(assetLoader) -> ["sea_ray","sea_turtle",…]
//   then any demo can ctx.spawnMesh("sea_ray", x, y, z, scale).
//
// Palette (gpu/voxelCreature.js CREATURE_PALETTE):
//   0 grey · 1 red · 2 orange · 3 yellow · 4 green · 5 cyan · 6 blue · 7 white
//
// Convention: built with up = +Y, head toward +Z. The demo rotates each
// by yaw about Y, so if a creature faces backwards in-app, flip its yaw
// by +PI at the spawn site (orientation is the one thing untestable here).
// ===================================================================

import { buildVoxelMesh } from "./voxelCreature.js";

function addVoxel(set, list, x, y, z, c) {
    x |= 0; y |= 0; z |= 0;
    const k = x + "," + y + "," + z;
    if (set.has(k)) return;
    set.add(k);
    list.push([x, y, z, c]);
}

// ---- Stingray: flat diamond body (thin in Y), wing-tips, head + tail. ----
// Nearly front/back symmetric so facing is forgiving; tail marks the rear.
function genStingray() {
    const set = new Set(), out = [];
    const rx = 6, rz = 5;
    for (let x = -rx; x <= rx; x++)
        for (let z = -rz; z <= rz; z++) {
            const e = Math.abs(x) / rx + Math.abs(z) / rz;   // diamond
            if (e > 1.0) continue;
            const thick = e < 0.35 ? 2 : 1;                  // thicker core, thin wings
            for (let y = 0; y < thick; y++) {
                const c = (Math.abs(x) > rx * 0.62) ? 0 : 6; // grey wingtips, blue disc
                addVoxel(set, out, x, y, z, c);
            }
            addVoxel(set, out, x, -1, z, 7);                 // white underside
        }
    addVoxel(set, out, 0, 2, rz - 1, 6);                     // head bump (+z)
    addVoxel(set, out, -1, 2, rz, 0); addVoxel(set, out, 1, 2, rz, 0); // eyes
    for (let i = 1; i <= 8; i++) addVoxel(set, out, 0, 0, -rz - i, i >= 7 ? 1 : 6); // tapering tail, red barb
    return out;
}

// ---- Sea turtle: domed green shell + yellow rim + scute pattern,
//      flat plastron underside, head poking forward, 4 flippers, tail. ----
function genTurtle() {
    const set = new Set(), out = [];
    const rx = 4, ry = 3, rz = 5;
    for (let x = -rx; x <= rx; x++)
        for (let y = 0; y <= ry; y++)
            for (let z = -rz; z <= rz; z++) {
                const e = (x * x) / (rx * rx) + (y * y) / (ry * ry) + (z * z) / (rz * rz);
                if (e > 1.0) continue;
                let c = 4;                                   // green shell
                if (e > 0.82) c = 3;                         // yellow rim
                else if (y >= ry - 1 && ((x + z) & 1) === 0) c = 0; // grey scutes on top
                addVoxel(set, out, x, y, z, c);
            }
    for (let x = -rx + 1; x <= rx - 1; x++)                  // plastron (flat underside)
        for (let z = -rz + 1; z <= rz - 1; z++)
            if (Math.abs(x) / rx + Math.abs(z) / rz <= 1) addVoxel(set, out, x, -1, z, 3);
    // head (+z)
    addVoxel(set, out, 0, 1, rz + 1, 4); addVoxel(set, out, 0, 1, rz + 2, 4); addVoxel(set, out, 0, 2, rz + 2, 4);
    addVoxel(set, out, -1, 2, rz + 2, 0); addVoxel(set, out, 1, 2, rz + 2, 0); // eyes
    // 4 flippers (front pair at +z longer, rear at -z), angling out + down
    for (const sx of [-1, 1]) {
        for (let i = 1; i <= 4; i++) addVoxel(set, out, sx * (rx - 1 + i), (i > 2 ? -1 : 0), 2, 4);
        for (let i = 1; i <= 3; i++) addVoxel(set, out, sx * (rx - 1 + i), (i > 2 ? -1 : 0), -3, 4);
    }
    addVoxel(set, out, 0, 0, -rz - 1, 4);                    // tail
    return out;
}

// ---- Octopus: bulbous red mantle (orange mottle), eyes, 8 radial arms
//      that dip off the mantle then splay along the floor, white suckers. ----
function genOctopus() {
    const set = new Set(), out = [];
    const r = 3;
    for (let x = -r; x <= r; x++)
        for (let y = 0; y <= r + 1; y++)
            for (let z = -r; z <= r; z++) {
                const e = (x * x) / (r * r) + (y * y) / ((r + 1) * (r + 1)) + (z * z) / (r * r);
                if (e > 1.0) continue;
                let c = 1;                                   // red mantle
                if (y >= r && ((x + z) & 1) === 0) c = 2;    // orange mottle on the dome
                addVoxel(set, out, x, y, z, c);
            }
    addVoxel(set, out, -1, r, r - 1, 7); addVoxel(set, out, 1, r, r - 1, 7); // eyes (front)
    const arms = 8;
    for (let a = 0; a < arms; a++) {
        const ang = (a / arms) * Math.PI * 2, dx = Math.cos(ang), dz = Math.sin(ang);
        let fx = dx * r, fz = dz * r, y = 0;
        for (let i = 0; i < 6; i++) {
            const x = Math.round(fx), z = Math.round(fz);
            addVoxel(set, out, x, y, z, (i >= 4) ? 2 : 1);   // arm, orange tip
            if (i % 2 === 0) addVoxel(set, out, x, y - 1, z, 7); // white sucker underside
            fx += dx; fz += dz;
            if (i < 2) y -= 1;                               // dip down off the mantle, then splay
        }
    }
    return out;
}

// ---- Octopus mantle only (no baked arms) — used by the Verlet-tentacle
//      octopus, whose 8 arms are live physics chains of `tentacle_seg`. ----
function genOctopusMantle() {
    const set = new Set(), out = [];
    const r = 3;
    for (let x = -r; x <= r; x++)
        for (let y = 0; y <= r + 1; y++)
            for (let z = -r; z <= r; z++) {
                const e = (x * x) / (r * r) + (y * y) / ((r + 1) * (r + 1)) + (z * z) / (r * r);
                if (e > 1.0) continue;
                let c = 1;
                if (y >= r && ((x + z) & 1) === 0) c = 2;
                addVoxel(set, out, x, y, z, c);
            }
    addVoxel(set, out, -1, r, r - 1, 7); addVoxel(set, out, 1, r, r - 1, 7); // eyes
    return out;
}

// ---- Tentacle segment: a small red/orange voxel ball used as one Verlet
//      node. Spawned per-node at a tapering scale to build an arm. ----
function genTentacleSeg() {
    const set = new Set(), out = [];
    const r = 2;
    for (let x = -r; x <= r; x++)
        for (let y = -r; y <= r; y++)
            for (let z = -r; z <= r; z++)
                if (x * x + y * y + z * z <= r * r + 1) addVoxel(set, out, x, y, z, ((x + y + z) & 1) ? 1 : 2);
    return out;
}

// ---- Kelp: a few tall green stalks that lean as they rise, with side
//      fronds + cyan tips. Tall (base at y=0) so it reads as a frond
//      column; the demo gives it a gentle tilt-sway each frame. ----
function genKelp() {
    const set = new Set(), out = [];
    const stalks = 3;
    for (let s = 0; s < stalks; s++) {
        let x = (s - 1) * 2, z = (s % 2) ? 1 : -1;
        const h = 9 + s * 2, dir = (s % 2) ? 1 : -1;
        for (let y = 0; y < h; y++) {
            addVoxel(set, out, x, y, z, (y >= h - 2) ? 5 : 4);   // green stalk, cyan tip
            if (y % 3 === 2) x += dir;                            // gentle lean
            if (y > 2 && y % 2 === 0) { addVoxel(set, out, x + 1, y, z, 4); addVoxel(set, out, x - 1, y, z, 4); } // fronds
        }
    }
    return out;
}

// ---- Jellyfish: translucent-read cyan bell (top dome) + white rim, with a
//      few tentacle strands hanging below. The demo gives it a vertical pulse
//      + slow drift. Built bell-up so +Y is the top of the bell. ----
function genJellyfish() {
    const set = new Set(), out = [];
    const r = 3;
    for (let x = -r; x <= r; x++)
        for (let z = -r; z <= r; z++)
            for (let y = 0; y <= r; y++) {
                const e = (x * x) / (r * r) + (z * z) / (r * r) + (y * y) / (r * r);
                if (e > 1.0) continue;
                addVoxel(set, out, x, y + r, z, (y <= 1) ? 7 : 5);   // bell y=r..2r, white rim / cyan dome
            }
    const strands = [[-2, -2], [2, -2], [-2, 2], [2, 2], [0, 0]];
    for (const [ax, az] of strands)
        for (let y = 0; y < 6; y++) addVoxel(set, out, ax, r - 1 - y, az, (y & 1) ? 5 : 7);   // hanging tentacles
    return out;
}

// ---- Shrimp: a tiny curved orange/red body with a tail fan + antennae.
//      Built small; spawned in a swarm at tiny scale near the floor. ----
function genShrimp() {
    const set = new Set(), out = [];
    for (let z = 0; z < 5; z++) {
        const y = Math.round(Math.sin(z * 0.6));
        addVoxel(set, out, 0, y, z, z < 1 ? 1 : 2);              // body (red head segment, orange rest)
        if (z > 0 && z < 4) addVoxel(set, out, 0, y + 1, z, 2);  // hump
    }
    addVoxel(set, out, -1, 0, -1, 1); addVoxel(set, out, 1, 0, -1, 1); addVoxel(set, out, 0, 1, -1, 1); // tail fan
    addVoxel(set, out, 0, 1, 5, 7); addVoxel(set, out, 0, 2, 6, 7);   // antennae (+Z head)
    return out;
}

// ---- Sea monkey: the novelty brine critter. Tiny white body, three-point
//      crown (yellow), little arms, and a 3-pronged cyan tail fan. Built small;
//      spawned as a schooling colony at tiny scale. Head toward +Z. ----
function genSeaMonkey() {
    const set = new Set(), out = [];
    for (let y = 0; y < 3; y++) addVoxel(set, out, 0, y, 0, 7);          // body (white)
    addVoxel(set, out, -1, 2, 0, 7); addVoxel(set, out, 1, 2, 0, 7);    // arms
    addVoxel(set, out, 0, 3, 0, 7);                                     // head
    addVoxel(set, out, 0, 4, 0, 3); addVoxel(set, out, -1, 4, 0, 3); addVoxel(set, out, 1, 4, 0, 3); // crown (yellow)
    addVoxel(set, out, 0, 3, 1, 6);                                     // eye (+Z)
    addVoxel(set, out, 0, 0, -1, 5); addVoxel(set, out, -1, 0, -1, 5); addVoxel(set, out, 1, 0, -1, 5); // 3-prong tail (cyan)
    return out;
}

const ARCHETYPES = [
    { kind: "sea_ray",            gen: genStingray },
    { kind: "sea_turtle",         gen: genTurtle },
    { kind: "sea_octopus",        gen: genOctopus },        // baked-arm (simple) octopus
    { kind: "sea_octopus_mantle", gen: genOctopusMantle },  // body for the Verlet octopus
    { kind: "tentacle_seg",       gen: genTentacleSeg },    // one Verlet arm node
    { kind: "sea_kelp",           gen: genKelp },
    { kind: "sea_jelly",          gen: genJellyfish },   // v1379
    { kind: "sea_shrimp",         gen: genShrimp },      // v1379
    { kind: "sea_monkey",         gen: genSeaMonkey },   // v1380
];

export const SEA_RAY = "sea_ray", SEA_TURTLE = "sea_turtle", SEA_OCTOPUS = "sea_octopus",
    SEA_OCTOPUS_MANTLE = "sea_octopus_mantle", TENTACLE_SEG = "tentacle_seg", SEA_KELP = "sea_kelp";
export const SEA_CREATURE_KINDS = ARCHETYPES.map(a => a.kind);

/**
 * Build + register the bespoke sea-creature/kelp kinds as static spawnable
 * meshes. Idempotent — kinds already cached are skipped.
 * @returns {string[]} kind names registered (or already present)
 */
export function registerSeaCreatureKinds(assetLoader) {
    if (!assetLoader || !assetLoader.gl || !assetLoader.cache || !assetLoader._createMesh) {
        console.warn("[seaCreatures] asset loader unsupported; skipping registration");
        return [];
    }
    const done = [];
    for (const a of ARCHETYPES) {
        if (assetLoader.cache.get(a.kind)) { done.push(a.kind); continue; }
        try {
            const voxels = a.gen();
            if (!voxels.length) continue;
            const g = buildVoxelMesh(voxels);
            const mesh = assetLoader._createMesh(
                g.positions.buffer, g.indices.buffer, g.normals.buffer, g.colors.buffer,
                { name: a.kind, vertexCount: g.vertexCount, indexCount: g.indices.length,
                  hasNormals: true, hasColors: true }
            );
            if (mesh) {
                assetLoader.cache.set(a.kind, mesh);
                assetLoader._ollamaRequested?.add?.(a.kind);   // suppress auto-gen, like coral/hardpoints
                done.push(a.kind);
            }
        } catch (e) {
            console.warn(`[seaCreatures] failed to build "${a.kind}":`, e?.message ?? e);
        }
    }
    console.log(`[seaCreatures] registered ${done.length} kinds: ${done.join(", ")}`);
    return done;
}
