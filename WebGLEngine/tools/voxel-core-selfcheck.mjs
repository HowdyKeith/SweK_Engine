// FILE: tools/voxel-core-selfcheck.mjs
//
// Deterministic regression harness for the engine's PURE voxel core - the number-crunching that has no DOM/GL/threads and
// so can be checked headless under node. Three groups:
//
//   mesher   - world/chunkMesherCore.js: greedy face merging, neighbour-aware culling, AO range, water-skip, array shape.
//   attacks  - world/kaijuAttacks.js: every attack is well-formed; every kind/alt/king mapping resolves to a real attack.
//   biome    - world/biomeMap.js: assignments are in-set, all bands occur, and the same seed is reproducible.
//
// The mesher counts below are calibrated to the actual mesher contract: faces are emitted at slice boundaries 1..max, so a
// solid region touching the chunk's 0-planes leaves its near faces to the neighbour chunk (3 visible faces on a corner
// cube), while an interior voxel shows all 6. These aren't guesses - they're pinned so a future refactor that breaks
// merging or culling fails loudly.
//
// Run:  node tools/voxel-core-selfcheck.mjs      (exit 0 = all pass, 1 = a check failed, 2 = harness/import error)

import { meshChunk } from "../world/chunkMesherCore.js";
import { pathToFileURL } from "node:url";
import {
    KAIJU_ATTACKS, KIND_TO_ATTACK, KIND_TO_ATTACK_ALT, KIND_TO_ATTACK_ALT2,
    KING_ATTACK_OVERRIDES, getAttackForKind,
} from "../world/kaijuAttacks.js";
import { BiomeMap, BIOMES } from "../world/biomeMap.js";

const FAMILIES = new Set(["beam", "projectile", "aoe"]);
const num = (v) => typeof v === "number" && isFinite(v);

export function runVoxelCoreChecks() {
    const checks = [];
    const add = (group, name, ok, detail = "") => checks.push({ group, name, ok: !!ok, detail });

    // ---------------------------------------------------------------- MESHER
    {
        const S = 8, H = 8, vidx = (x, y, z) => x + S * (z + S * y);
        const vol = (fn) => { const b = new Uint8Array(S * S * H); for (let y = 0; y < H; y++) for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) b[vidx(x, y, z)] = fn(x, y, z) | 0; return b; };
        const mesh = (voxels, neighbors = {}, skipWater = false) => meshChunk({ voxels, neighbors, size: S, height: H, cx: 0, cz: 0, skipWater });
        const quads = (r) => r.verts.length / 18;

        const solid = vol(() => 1);
        const rs = mesh(solid);
        // v3074 -- THIS EXPECTED 3 AND 3 WAS THE BUG. A solid chunk with NO neighbours is exposed on +X, -X, +Z,
        // -Z and +Y: five merged quads, with -Y skipped because the world floor is never visible. The mesher
        // emitted only the three POSITIVE faces, because its slice loop never sampled the -1 | 0 boundary -- the
        // defect v3069 found and fixed. This assertion had encoded the defect as the expectation, so the fix
        // turned it red and the gate looked like the regression.
        //
        // The check directly below is what proves 5 is right rather than merely different: with four solid
        // neighbours the sides cull and it drops to 1. A mesher that invented faces would not cull.
        add("mesher", "solid cube: 5 merged quads -- four walls and a top, floor skipped", quads(rs) === 5, "got " + quads(rs));
        add("mesher", "solid cube produces no spurious slope geometry", rs.slopeVerts.length === 0);
        const rsn = mesh(solid, { "1,0": solid, "-1,0": solid, "0,1": solid, "0,-1": solid });
        add("mesher", "solid neighbours cull shared faces (cube+4nb -> 1 top)", quads(rsn) === 1, "got " + quads(rsn));

        const single = vol((x, y, z) => (x === 2 && y === 2 && z === 2) ? 1 : 0);
        const bar    = vol((x, y, z) => (y === 2 && z === 2 && (x === 2 || x === 3)) ? 1 : 0);
        const sep    = vol((x, y, z) => (y === 2 && z === 2 && (x === 2 || x === 4)) ? 1 : 0);
        add("mesher", "interior voxel emits all 6 faces", quads(mesh(single)) === 6, "got " + quads(mesh(single)));
        add("mesher", "adjacent pair culls the shared face + merges (bar -> 6)", quads(mesh(bar)) === 6, "got " + quads(mesh(bar)));
        add("mesher", "separated pair keeps every face (-> 12)", quads(mesh(sep)) === 12, "got " + quads(mesh(sep)));
        add("mesher", "merging beats naive: adjacent(6) < separated(12)", quads(mesh(bar)) < quads(mesh(sep)));

        const checker = vol((x, y, z) => ((x + y + z) & 1) ? 1 : 0);
        const rc = mesh(checker);
        add("mesher", "checkerboard exposes far more faces than a solid cube", quads(rc) > quads(rs));

        for (const [nm, r] of [["solid", rs], ["single", mesh(single)], ["checker", rc]]) {
            add("mesher", nm + ": 6 verts (18 floats) per quad", r.verts.length % 18 === 0, "len " + r.verts.length);
            add("mesher", nm + ": exactly one colour per vertex", r.cols.length === r.verts.length);
            add("mesher", nm + ": exactly one AO per vertex", r.aos.length === r.verts.length / 3);
            add("mesher", nm + ": every AO value within [0,1]", r.aos.every((v) => v >= 0 && v <= 1));
            add("mesher", nm + ": every colour channel within [0,1]", r.cols.every((v) => v >= 0 && v <= 1));
        }

        const water = vol((x, y, z) => (x === 2 && y === 2 && z === 2) ? 10 : 0);
        add("mesher", "skipWater drops water-only geometry", mesh(water, {}, true).verts.length === 0);
        add("mesher", "water IS meshed when not skipped", mesh(water, {}, false).verts.length > 0);
    }

    // ------------------------------------------------------------- ATTACKS
    {
        const names = Object.keys(KAIJU_ATTACKS);
        add("attacks", "registry is non-empty", names.length > 0, names.length + " attacks");

        const badFamily = [], badFields = [], badProj = [];
        for (const [name, a] of Object.entries(KAIJU_ATTACKS)) {
            if (!FAMILIES.has(a.family)) badFamily.push(name);
            const fieldsOk = num(a.cooldown) && a.cooldown > 0 && num(a.range) && a.range > 0
                && num(a.damage) && a.damage >= 0 && Array.isArray(a.color) && a.color.length === 3 && a.color.every(num);
            if (!fieldsOk) badFields.push(name);
            if (a.family === "projectile" && !(typeof a.projectileKind === "string" && a.projectileKind)) badProj.push(name);
        }
        add("attacks", "every attack has a valid family {beam,projectile,aoe}", badFamily.length === 0, badFamily.join(","));
        add("attacks", "every attack has cooldown/range/damage/color fields", badFields.length === 0, badFields.join(","));
        add("attacks", "every projectile attack names a projectileKind", badProj.length === 0, badProj.join(","));

        const resolves = (map, label) => {
            const bad = Object.entries(map).filter(([, v]) => !KAIJU_ATTACKS[v]).map(([k, v]) => k + "->" + v);
            add("attacks", label + " all resolve to real attacks", bad.length === 0, bad.join(","));
        };
        resolves(KIND_TO_ATTACK,      "KIND_TO_ATTACK");
        resolves(KIND_TO_ATTACK_ALT,  "KIND_TO_ATTACK_ALT");
        resolves(KIND_TO_ATTACK_ALT2, "KIND_TO_ATTACK_ALT2");
        resolves(KING_ATTACK_OVERRIDES, "KING_ATTACK_OVERRIDES");

        const badGet = Object.keys(KIND_TO_ATTACK).filter((k) => {
            const a = getAttackForKind(k);
            if (!a) return true;
            if (typeof a === "string") return !KAIJU_ATTACKS[a];
            return !FAMILIES.has(a.family);
        });
        add("attacks", "getAttackForKind resolves every kind", badGet.length === 0, badGet.join(","));
    }

    // --------------------------------------------------------------- BIOME
    {
        const bm = new BiomeMap({ seed: 1337 });
        const coords = [];
        for (let x = 0; x <= 2000; x += 53) for (let z = 0; z <= 2000; z += 53) coords.push([x, z]);
        const seen = new Set(); let outOfSet = 0;
        for (const [x, z] of coords) { const b = bm.getBiomeAt(x, z); if (!BIOMES.includes(b)) outOfSet++; seen.add(b); }
        add("biome", "every assignment is a known biome", outOfSet === 0, outOfSet + " out-of-set");
        add("biome", "all " + BIOMES.length + " biome bands occur across the map", seen.size === BIOMES.length, "saw " + [...seen].join(","));
        add("biome", "same coord returns the same biome", bm.getBiomeAt(123, 456) === bm.getBiomeAt(123, 456));

        const bm2 = new BiomeMap({ seed: 1337 });
        add("biome", "two instances with the same seed agree everywhere", coords.every(([x, z]) => bm.getBiomeAt(x, z) === bm2.getBiomeAt(x, z)));
        const bm3 = new BiomeMap({ seed: 9999 });
        add("biome", "a different seed changes the map", coords.slice(0, 500).some(([x, z]) => bm.getBiomeAt(x, z) !== bm3.getBiomeAt(x, z)));
    }

    const fails = checks.filter((c) => !c.ok);
    return { ok: fails.length === 0, total: checks.length, fails: fails.length, checks };
}

// ----- CLI -----
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    let res;
    try { res = runVoxelCoreChecks(); }
    catch (e) { console.error("voxel-core-selfcheck: harness error:", e && e.stack || e); process.exit(2); }
    const byGroup = {};
    for (const c of res.checks) (byGroup[c.group] = byGroup[c.group] || []).push(c);
    for (const [g, cs] of Object.entries(byGroup)) {
        const p = cs.filter((c) => c.ok).length;
        console.log(`\n[${g}] ${p}/${cs.length}`);
        for (const c of cs) console.log(`  ${c.ok ? "ok  " : "FAIL "}${c.name}${(!c.ok && c.detail) ? "  (" + c.detail + ")" : ""}`);
    }
    console.log(`\n${res.ok ? "VOXEL CORE OK" : "VOXEL CORE FAIL"} - ${res.total - res.fails}/${res.total}`);
    process.exit(res.ok ? 0 : 1);
}
