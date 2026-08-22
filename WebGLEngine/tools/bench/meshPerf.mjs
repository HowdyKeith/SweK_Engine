// tools/bench/meshPerf.mjs
//
// RLE vs greedy mesher performance comparison (v2794). Times world/chunkMesherCore.js meshChunk (the live default
// greedy mesher) against voxel/rleChunkMesh.js meshChunkRLE (the ?rle=1 path) across fixture chunks, and -- the
// part that matters more than the clock -- adjudicates BOTH against an INDEPENDENT exposed-face reference so the
// comparison is apples-to-apples rather than "which one is faster at drawing a different surface".
//
// Honest scoping:
//   - Timings are CPU meshing only. They exclude GPU upload and draw cost, and they are machine-dependent, so
//     they are REPORTED, never asserted as a gate threshold.
//   - Geometry volume is reported alongside time, because a mesher that runs fast but emits twice the triangles
//     moves the cost to the GPU rather than removing it.
//
// Node-side tool. Import the meshers by path so this runs headless.

import { meshChunk, PALETTE } from "../../world/chunkMesherCore.js";
import { meshChunkRLE } from "../../voxel/rleChunkMesh.js";

export const S = 16, H = 64;
export const chunkIndex = (x, y, z) => x + S * (z + S * y);   // world/chunk.js order

// ---- fixtures: the shapes that stress each mesher differently -------------------------------------
export const FIXTURES = {
    // rolling terrain: the realistic case
    terrain: (seed = 0) => build((x, z) => Math.floor(18 + 6 * Math.sin((x + seed) * 0.3) * Math.cos((z + seed) * 0.25) + 3 * Math.sin((x + z) * 0.2))),
    // flat plain: greedy merges the whole top into a few quads -- greedy's best case
    flat: () => build(() => 12),
    // tall cliff: one big vertical step -- RLE's greedy vertical spans are built for this
    cliff: () => build((x) => (x < S / 2 ? 6 : 40)),
    // checkerboard columns: nothing merges anywhere -- worst case for both
    noise: () => build((x, z) => 8 + ((x * 7 + z * 13) % 11)),
};

function build(heightFn) {
    const v = new Uint8Array(S * S * H);
    for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) {
        const h = Math.max(1, Math.min(H - 1, Math.floor(heightFn(x, z))));
        for (let y = 0; y < h; y++) v[chunkIndex(x, y, z)] = (y === h - 1) ? 3 : (y >= h - 3 ? 2 : 1);
    }
    return v;
}

// neighbours on all four sides, offset so chunk borders are not artificially flush
export function makeArgs(voxels, neighborVoxels) {
    const neighbors = {};
    for (const d of ["-1,0", "1,0", "0,-1", "0,1"]) neighbors[d] = neighborVoxels;
    return { voxels, neighbors, size: S, height: H, cx: 0, cz: 0, skipWater: false, palette: PALETTE };
}

// ---- the INDEPENDENT oracle: exposed unit faces per direction, straight from readVoxel semantics ----
export function referenceFaceCounts(voxels, neighbors) {
    const read = (lx, ly, lz) => {
        if (ly < 0 || ly >= H) return 0;
        let dx = 0, dz = 0;
        if (lx < 0) { dx = -1; lx += S; } else if (lx >= S) { dx = 1; lx -= S; }
        if (lz < 0) { dz = -1; lz += S; } else if (lz >= S) { dz = 1; lz -= S; }
        const buf = (dx === 0 && dz === 0) ? voxels : (neighbors ? neighbors[dx + "," + dz] : null);
        return buf ? buf[lx + S * (lz + S * ly)] : 0;
    };
    const dirs = { "+x": [1, 0, 0], "-x": [-1, 0, 0], "+y": [0, 1, 0], "-y": [0, -1, 0], "+z": [0, 0, 1], "-z": [0, 0, -1] };
    const out = { total: 0 };
    for (const [k, [dx, dy, dz]] of Object.entries(dirs)) {
        let c = 0;
        for (let x = 0; x < S; x++) for (let y = 0; y < H; y++) for (let z = 0; z < S; z++) {
            if (read(x, y, z) === 0) continue;
            if (read(x + dx, y + dy, z + dz) === 0) c++;
        }
        out[k] = c; out.total += c;
    }
    return out;
}

// ---- geometry measurement from a mesher's non-indexed vert stream ----------------------------------
export function surfaceArea(verts) {
    let a = 0;
    for (let i = 0; i + 8 < verts.length; i += 9) {
        const ux = verts[i + 3] - verts[i], uy = verts[i + 4] - verts[i + 1], uz = verts[i + 5] - verts[i + 2];
        const vx = verts[i + 6] - verts[i], vy = verts[i + 7] - verts[i + 1], vz = verts[i + 8] - verts[i + 2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        a += 0.5 * Math.hypot(cx, cy, cz);
    }
    return a;
}
// area attributable to downward (-Y) faces -- the world-floor question the two meshers answer differently
export function downwardArea(verts) {
    let a = 0;
    for (let i = 0; i + 8 < verts.length; i += 9) {
        const ux = verts[i + 3] - verts[i], uy = verts[i + 4] - verts[i + 1], uz = verts[i + 5] - verts[i + 2];
        const vx = verts[i + 6] - verts[i], vy = verts[i + 7] - verts[i + 1], vz = verts[i + 8] - verts[i + 2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        const L = Math.hypot(cx, cy, cz) || 1;
        if (cy / L < -0.99) a += 0.5 * L;
    }
    return a;
}
export const triangleCount = (verts) => Math.floor(verts.length / 9);

// ---- timing: warm up, then take the MEDIAN of repeated runs (median resists a stray GC pause) -------
export function timeIt(fn, iters = 40, warmup = 8) {
    for (let i = 0; i < warmup; i++) fn();
    const samples = [];
    for (let i = 0; i < iters; i++) {
        const t0 = process.hrtime.bigint();
        fn();
        samples.push(Number(process.hrtime.bigint() - t0) / 1e6);   // ms
    }
    samples.sort((a, b) => a - b);
    return { median: samples[Math.floor(samples.length / 2)], min: samples[0], max: samples[samples.length - 1] };
}

// ---- the comparison ---------------------------------------------------------------------------------
export function compareOnFixture(name, iters = 40) {
    const voxels = FIXTURES[name](0);
    const neighborVoxels = FIXTURES[name](3);
    const args = makeArgs(voxels, neighborVoxels);
    const ref = referenceFaceCounts(voxels, args.neighbors);

    const g = meshChunk({ ...args });
    const r = meshChunkRLE({ ...args });
    // v2805 - also measure the v2795 OPTIMISED RLE path (world-floor skip + AO-preserving +-Y merge), because the
    // interesting comparison is no longer greedy-vs-RLE but greedy-vs-RLE-as-it-stands-today.
    const o = meshChunkRLE({ ...args, optimize: true });

    const gt = timeIt(() => meshChunk({ ...args }), iters);
    const rt = timeIt(() => meshChunkRLE({ ...args }), iters);
    const ot = timeIt(() => meshChunkRLE({ ...args, optimize: true }), iters);

    return {
        fixture: name,
        greedyMs: gt.median, rleMs: rt.median,
        speedRatio: gt.median > 0 ? rt.median / gt.median : NaN,   // >1 means RLE is slower
        rleOptMs: ot.median,
        greedyTris: triangleCount(g.verts), rleTris: triangleCount(r.verts), rleOptTris: triangleCount(o.verts),
        rleOptArea: surfaceArea(o.verts),
        greedyArea: surfaceArea(g.verts), rleArea: surfaceArea(r.verts),
        refArea: ref.total,
        greedyFloorArea: downwardArea(g.verts), rleFloorArea: downwardArea(r.verts), refFloorArea: ref["-y"],
        rleMatchesRef: Math.abs(surfaceArea(r.verts) - ref.total) < 1e-6,
        greedyMatchesRef: Math.abs(surfaceArea(g.verts) - ref.total) < 1e-6,
    };
}

export function runAll(fixtures = Object.keys(FIXTURES), iters = 40) {
    return fixtures.map((f) => compareOnFixture(f, iters));
}

export function report(rows) {
    const lines = [];
    lines.push("fixture    greedy ms   RLE ms   RLE/greedy   greedy tris   RLE tris   RLE=ref?");
    for (const r of rows) {
        lines.push(
            r.fixture.padEnd(10) +
            r.greedyMs.toFixed(3).padStart(9) + r.rleMs.toFixed(3).padStart(9) +
            (r.speedRatio.toFixed(2) + "x").padStart(13) +
            String(r.greedyTris).padStart(14) + String(r.rleTris).padStart(11) +
            (r.rleMatchesRef ? "  yes" : "   NO").padStart(11));
    }
    return lines.join("\n");
}

// ---- CLI: `node tools/bench/meshPerf.mjs [iters]` ---------------------------------------------------
// Main-module detection uses pathToFileURL (WINDOWS PATH LAW -- import.meta.url === `file://${argv[1]}` never
// matches on Windows and would silently disable this block).
import { pathToFileURL } from "node:url";
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const iters = parseInt(process.argv[2] || "40", 10);
    const rows = runAll(undefined, iters);
    console.log(report(rows));
    console.log("\nCPU meshing only -- excludes GPU upload and draw cost. Timings are machine-dependent.");
    for (const r of rows) {
        console.log(`${r.fixture}: RLE ${(r.rleTris / Math.max(1, r.greedyTris)).toFixed(1)}x the triangles; ` +
            `RLE surface ${r.rleMatchesRef ? "matches" : "DIFFERS FROM"} the independent reference; ` +
            `greedy skips ${r.refFloorArea} invisible floor quads that RLE emits.`);
    }
}
