// WebGLEngine/tools/ship/meshPerf-selfcheck.mjs -- v2794
//
// Run: node tools/ship/meshPerf-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/bench/meshPerf.mjs -- the RLE-vs-greedy mesher comparison. What is gated is the HARNESS and the
// CORRECTNESS adjudication, never the clock: timings are machine-dependent, so asserting a speed threshold would
// be a flaky gate. What IS asserted: the independent face reference is sound, RLE's emitted surface matches that
// reference EXACTLY on every fixture, the two meshers are genuinely both being measured, and the documented
// design difference (greedy skips the invisible world floor, RLE emits it) still holds.

import { FIXTURES, makeArgs, referenceFaceCounts, surfaceArea, downwardArea, triangleCount, timeIt, compareOnFixture, runAll, report, S, H, chunkIndex } from "../bench/meshPerf.mjs";
import { meshChunk, PALETTE } from "../../world/chunkMesherCore.js";
import { meshChunkRLE } from "../../voxel/rleChunkMesh.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// 1. the independent reference is sound on a hand-checkable fixture: one isolated voxel -> 6 faces
{
    const v = new Uint8Array(S * S * H); v[chunkIndex(5, 20, 5)] = 1;
    const ref = referenceFaceCounts(v, {});
    ok("reference: a single isolated voxel has exactly 6 exposed faces", ref.total === 6, "total=" + ref.total);
    ok("reference: one face per direction", ["+x", "-x", "+y", "-y", "+z", "-z"].every((k) => ref[k] === 1));
}

// 2. reference on a flat slab: top+bottom = 2*S*S, sides = perimeter
{
    const v = new Uint8Array(S * S * H);
    for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) v[chunkIndex(x, 10, z)] = 1;   // 1-thick full layer
    const ref = referenceFaceCounts(v, {});   // no neighbours -> sides exposed
    ok("reference: full 1-thick layer has S*S up and S*S down", ref["+y"] === S * S && ref["-y"] === S * S);
    ok("reference: its four sides total 4*S", ref["+x"] + ref["-x"] + ref["+z"] + ref["-z"] === 4 * S, "sides=" + (ref["+x"] + ref["-x"] + ref["+z"] + ref["-z"]));
}

// 3. THE CORRECTNESS CLAIM: RLE's emitted surface == the independent reference, EXACTLY, on every fixture
{
    let allExact = true, detail = [];
    for (const name of Object.keys(FIXTURES)) {
        const voxels = FIXTURES[name](0), nb = FIXTURES[name](3);
        const args = makeArgs(voxels, nb);
        const ref = referenceFaceCounts(voxels, args.neighbors);
        const area = surfaceArea(meshChunkRLE({ ...args }).verts);
        if (Math.abs(area - ref.total) > 1e-6) { allExact = false; detail.push(`${name}: rle=${area} ref=${ref.total}`); }
    }
    ok("RLE emitted surface == independent reference on EVERY fixture", allExact, detail.join("  "));
}

// 4. DOCUMENTED DESIGN DIFFERENCE: greedy skips the invisible world floor; RLE emits it
{
    const args = makeArgs(FIXTURES.terrain(0), FIXTURES.terrain(3));
    const g = downwardArea(meshChunk({ ...args }).verts);
    const r = downwardArea(meshChunkRLE({ ...args }).verts);
    const ref = referenceFaceCounts(args.voxels, args.neighbors)["-y"];
    ok("greedy emits ZERO downward faces (skips the unseen world floor)", g === 0, "greedyFloor=" + g);
    ok("RLE emits the full floor, matching the reference", Math.abs(r - ref) < 1e-6, "rleFloor=" + r + " ref=" + ref);
    ok("=> RLE carries S*S extra invisible floor quads per chunk", ref === S * S, "extra=" + ref);
}

// 5. the harness genuinely measures BOTH meshers (not the same one twice)
{
    const args = makeArgs(FIXTURES.flat(), FIXTURES.flat());
    const gTris = triangleCount(meshChunk({ ...args }).verts);
    const rTris = triangleCount(meshChunkRLE({ ...args }).verts);
    ok("harness: the two meshers produce different tessellations (both really run)", gTris !== rTris, "greedy=" + gTris + " rle=" + rTris);
    const t = timeIt(() => meshChunk({ ...args }), 5, 2);
    ok("harness: timeIt returns finite positive median/min/max, min<=median<=max", t.median > 0 && isFinite(t.median) && t.min <= t.median && t.median <= t.max);
}

// 6. fixtures are deterministic (same seed -> identical voxels)
{
    const a = FIXTURES.terrain(0), b = FIXTURES.terrain(0);
    ok("fixtures: deterministic for a given seed", a.length === b.length && a.every((v, i) => v === b[i]));
    ok("fixtures: different seeds differ (neighbours aren't a copy)", !FIXTURES.terrain(0).every((v, i) => v === FIXTURES.terrain(3)[i]));
}

// 7. compareOnFixture returns the full row shape the report needs
{
    const row = compareOnFixture("flat", 3);
    ok("compareOnFixture: returns timings, tri counts, and the ref verdict", typeof row.greedyMs === "number" && typeof row.rleMs === "number" && typeof row.speedRatio === "number" && row.rleMatchesRef === true);
    ok("report: renders a table row per fixture", /fixture/.test(report([row])) && new RegExp(row.fixture).test(report([row])));
}

// 8. MEASURED RESULT (reported, never asserted -- machine-dependent)
{
    const rows = runAll(undefined, 15);
    console.log("\n    --- measured on this machine (CPU meshing only; excludes GPU upload/draw) ---");
    console.log("    " + report(rows).replace(/\n/g, "\n    "));
    const slower = rows.filter((r) => r.speedRatio > 1).length;
    console.log(`\n    RLE slower on ${slower}/${rows.length} fixtures; tri ratio (RLE/greedy): ` +
        rows.map((r) => `${r.fixture} ${(r.rleTris / Math.max(1, r.greedyTris)).toFixed(1)}x`).join("  "));
    ok("benchmark runs end-to-end across all fixtures", rows.length === Object.keys(FIXTURES).length && rows.every((r) => r.rleMatchesRef));
}

// --- v3069: EVERY FACE THIS CHUNK EMITS IS OWNED BY THIS CHUNK ------------------------------------------------
// v2794 reported "greedy exceeds the reference by 20 faces on terrain" and nothing was done for 270 versions.
// Broken out by DIRECTION and then by PLANE, it was two errors that mostly cancel:
//   * the slice loop never sampled the -1 | 0 boundary, so every -d face on the chunk's LOWER wall was missing
//   * and its last iteration emitted a -d face owned by the voxel at sliceMax -- one belonging to the NEIGHBOUR
// Every chunk omitted its own lower wall and drew its upper neighbour's instead. On terrain, -Z was missing 95
// at z=0 and gained 95 at z=16: NET ZERO, totals clean, invisible to every aggregate. -X was 30 missing / 50
// gained, and that leftover +20 is the only reason anyone noticed. AN AGGREGATE IS INVARIANT UNDER A SHIFT --
// the same lesson the axis-swap taught the volume cache. Counts cannot see geometry that MOVED.
{
    const S = 16, H = 64;
    for (const name of ["terrain", "flat", "cliff", "noise"]) {
        const voxels = FIXTURES[name](0);
        const args = makeArgs(voxels, FIXTURES[name](3));
        const ref = referenceFaceCounts(voxels, args.neighbors);
        const V = meshChunk({ ...args }).verts;

        const byDir = {}, outside = [];
        for (let t = 0; t < V.length / 9; t++) {
            const o = t * 9;
            const a = [V[o], V[o + 1], V[o + 2]], b = [V[o + 3], V[o + 4], V[o + 5]], c = [V[o + 6], V[o + 7], V[o + 8]];
            const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
            const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
            const L = Math.hypot(n[0], n[1], n[2]) || 1;
            const nn = n.map((q) => Math.round(q / L));
            const key = nn[0] === 1 ? "+x" : nn[0] === -1 ? "-x" : nn[1] === 1 ? "+y" : nn[1] === -1 ? "-y" : nn[2] === 1 ? "+z" : "-z";
            byDir[key] = (byDir[key] || 0) + 0.5 * L;
            // A -d quad sits ON its owner's plane; a +d quad sits on owner+1. Either way no vertex may leave the
            // chunk's own extent, which is what "emitted the neighbour's wall" looked like.
            for (const p2 of [a, b, c]) {
                if (p2[0] < 0 || p2[0] > S || p2[2] < 0 || p2[2] > S) outside.push(name + " vertex " + p2.join(","));
                if ((key === "-x" && p2[0] >= S) || (key === "-z" && p2[2] >= S)) outside.push(name + " " + key + " face at " + key[1] + "=" + p2[key === "-x" ? 0 : 2]);
            }
        }
        for (const d of ["+x", "-x", "+z", "-z", "+y"]) {
            ok("!! " + name + ": greedy " + d + " faces == the independent reference",
                (byDir[d] || 0) === ref[d], "greedy " + (byDir[d] || 0) + " vs ref " + ref[d]);
        }
        ok(name + ": no face is emitted outside this chunk", outside.length === 0, outside.slice(0, 2).join(" | "));
        ok(name + ": the world floor is STILL skipped -- the fix must not smuggle it back",
            (byDir["-y"] || 0) === 0, "256 invisible downward quads per chunk is what v2795 optimised away");
    }
}

console.log("meshPerf-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
