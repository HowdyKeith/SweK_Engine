// engine/quadricDecimate-selfcheck.mjs
//
// v3126 -- THE THIRD CAPABILITY FOUND BUILT AND UNWIRED, AND THE FIRST TEST IT HAS EVER HAD.
//
// engine/quadricDecimate.js is round 197: Garland-Heckbert quadric error mesh simplification, pure CPU, no gate,
// no caller. It is the third of this shape in three rounds -- after render/SSAOPass.js (a better AO written 247
// rounds after the one in use) and fluid/multigridGPU.js (a finished GPU pressure solve). The orphan scan was
// built to find dead code and keeps finding FINISHED WORK instead.
//
// This one is fully provable here, because it touches no GPU at all -- zero references to gl, WebGL or device.
//
// THE TEST USES AN ANALYTIC SURFACE, which is what makes it a fidelity test rather than a smoke test. The input
// is a 32x32 grid sampled from y = sin(0.4x)cos(0.4y)*0.3, so for ANY output vertex the true surface height is
// computable from its x and z. "Did it reduce and not crash" would pass on a decimator that threw vertices
// anywhere; measuring deviation from a known surface is what distinguishes a quadric metric from vertex
// vandalism, and the error MUST grow with the reduction or the metric is not doing anything.
//
// ADOPTION PATH, since the point of finding this is using it: engine/InstanceLod.js is live and swaps meshes by
// distance, which requires pre-built LOD levels. This is the tool that builds them. Nothing here wires that up --
// generating LOD chains changes what the renderer draws, and that is a visual decision for the rig.

import { quadricDecimateSync } from "./quadricDecimate.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const N = 33;
const surf = (gx, gy) => Math.sin(gx * 0.4) * Math.cos(gy * 0.4) * 0.3;
const AMPLITUDE = 0.3;

function grid() {
    const pos = [], idx = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) pos.push(x / (N - 1) * 2 - 1, surf(x, y), y / (N - 1) * 2 - 1);
    for (let y = 0; y < N - 1; y++) for (let x = 0; x < N - 1; x++) {
        const a = y * N + x, b = a + 1, c = a + N, d = c + 1;
        idx.push(a, c, b, b, c, d);
    }
    return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}

/** Worst and mean distance from each output vertex to the true surface at its own (x, z). */
function deviation(out) {
    let worst = 0, sum = 0; const V = out.positions.length / 3;
    for (let i = 0; i < V; i++) {
        const X = out.positions[i * 3], Y = out.positions[i * 3 + 1], Z = out.positions[i * 3 + 2];
        const d = Math.abs(Y - surf((X + 1) / 2 * (N - 1), (Z + 1) / 2 * (N - 1)));
        worst = Math.max(worst, d); sum += d;
    }
    return { worst, mean: sum / V, verts: V };
}

const src = grid();
const runs = [0.5, 0.25, 0.1].map((r) => ({ r, out: quadricDecimateSync(src.positions, src.indices, { targetRatio: r }) }));

// ---- 1. IT REDUCES, AND THE OUTPUT IS A VALID MESH -------------------------------------------------------------
{
    const inTris = src.indices.length / 3;
    ok("!! decimation reduces the triangle count, monotonically with the target",
        runs.every((x) => x.out.indexCount / 3 < inTris) &&
        runs[0].out.indexCount > runs[1].out.indexCount && runs[1].out.indexCount > runs[2].out.indexCount,
        `${inTris} tris in -> ` + runs.map((x) => x.out.indexCount / 3).join(" / ") + " out at ratios 0.5 / 0.25 / 0.1");

    const broken = runs.filter((x) => {
        const maxV = x.out.positions.length / 3;
        for (let i = 0; i < x.out.indices.length; i++) if (x.out.indices[i] < 0 || x.out.indices[i] >= maxV) return true;
        return false;
    });
    ok("every output index is in range -- the result is a mesh, not a corrupt buffer",
        broken.length === 0,
        "an out-of-range index draws garbage or crashes the driver, and it is the failure a smoke test misses " +
        "because the function returned successfully");
}

// ---- 2. FIDELITY AGAINST A KNOWN SURFACE -- the part that tests the QUADRIC ------------------------------------
{
    const dev = runs.map((x) => ({ r: x.r, ...deviation(x.out) }));
    ok("!! vertices stay ON the analytic surface, not merely somewhere",
        dev.every((d) => d.worst < AMPLITUDE * 0.2),
        dev.map((d) => `ratio ${d.r}: worst ${d.worst.toFixed(5)} mean ${d.mean.toFixed(5)}`).join("  |  ") +
        `  (surface amplitude ${AMPLITUDE}). "It reduced and did not crash" would pass on a decimator that threw ` +
        "vertices anywhere; deviation from a surface whose height is known for every x,z is what separates a " +
        "quadric metric from vertex vandalism");

    ok("!! and the error GROWS with the reduction -- so the metric is actually doing something",
        dev[0].worst < dev[1].worst && dev[1].worst < dev[2].worst,
        dev.map((d) => d.worst.toFixed(5)).join(" < ") + " for 50% / 75% / 90% cuts. A metric that ignored geometry " +
        "would give error unrelated to how much was removed, so monotonicity is the evidence that the quadric is " +
        "choosing which edges to collapse rather than collapsing arbitrarily");
}

// ---- 3. WHY IT IS UNWIRED, AND WHAT WOULD WIRE IT --------------------------------------------------------------
{
    ok("this gate does NOT wire it into the renderer",
        true,
        "engine/InstanceLod.js is live and swaps meshes by distance, which needs pre-built LOD levels -- and this " +
        "is the tool that builds them, so the adoption path is real and short. It is not taken here because " +
        "generating LOD chains changes what gets drawn, and this box has no GPU to look at the result. Same call " +
        "as SSAOPass: prove the algorithm where it can be proven, leave the visual decision to the rig");
}

// ---- v3152: THE FINE-TO-COARSE MAP, WHICH THE DECIMATOR WAS COMPUTING AND DISCARDING ------------------------------
// `removed` is a FLAG. It says THAT a vertex is gone and never WHERE ITS DATA WENT -- so decimating silently
// destroyed every per-vertex signal on the fine mesh (baked AO, vertex colours, UVs, weights) and the caller
// got a coarse mesh with no way to learn what it lost. The parent link is now recorded at the collapse, and
// the finalize walks it into a TOTAL map.
//
// THE PARTIAL MAP WAS NOT ENOUGH, and that is the point: `remap` names a coarse index for a SURVIVOR and -1 for
// a collapsed vertex -- and THE VERTICES WHOSE DATA YOU MOST NEED TO MOVE ARE THE REMOVED ONES.
{
    const N = 18, pos = [], idx = [];
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
        const th = Math.PI * i / N, ph = 2 * Math.PI * j / N;
        pos.push(Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th));
    }
    const at = (i, j) => i * (N + 1) + j;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        idx.push(at(i, j), at(i + 1, j), at(i, j + 1));
        idx.push(at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
    }
    const P = new Float32Array(pos);
    const r = quadricDecimateSync(P, new Uint32Array(idx), { ratio: 0.5 });
    const f2c = r.fineToCoarse, nFine = P.length / 3;

    ok("!! the map is TOTAL -- every fine vertex names a coarse one",
        f2c instanceof Int32Array && f2c.length === nFine && Array.from(f2c).every((v) => v >= 0),
        nFine + " fine vertices, " + r.vertexCount + " coarse, no -1 entries. A PARTIAL map is useless for " +
        "carrying data, because the vertices whose data most needs moving are exactly the removed ones");

    ok("!! every entry is a valid coarse index",
        Array.from(f2c).every((v) => v < r.vertexCount),
        "an out-of-range index would index past the coarse arrays and either throw or read a neighbour's data, " +
        "which is worse because it looks like an answer");

    ok("!! and the map is ONTO -- every survivor is somebody's target",
        new Set(f2c).size === r.vertexCount,
        new Set(f2c).size + " of " + r.vertexCount + " coarse vertices reached. A survivor nothing maps to " +
        "would be a coarse vertex with NO data after any transfer -- a hole that averages to zero and reads " +
        "as a legitimate value");

    // *** THE DEMONSTRATION, WITH A CONTROL, BECAUSE WITHOUT ONE IT PROVES NOTHING. ***
    const sig = (x, y, z) => Math.sin(2 * x) + Math.cos(3 * y) + z;
    const fine = new Float32Array(nFine);
    for (let i = 0; i < nFine; i++) fine[i] = sig(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    const carry = (map) => {
        const acc = new Float64Array(r.vertexCount), cnt = new Uint32Array(r.vertexCount);
        for (let i = 0; i < nFine; i++) { acc[map[i]] += fine[i]; cnt[map[i]]++; }
        let w = 0;
        for (let c = 0; c < r.vertexCount; c++) {
            if (!cnt[c]) continue;
            w = Math.max(w, Math.abs(acc[c] / cnt[c] - sig(r.positions[c * 3], r.positions[c * 3 + 1], r.positions[c * 3 + 2])));
        }
        return w;
    };
    const real = carry(f2c);
    const shuf = Int32Array.from(f2c);
    for (let i = shuf.length - 1; i > 0; i--) { const j = (i * 7919) % (i + 1); const t = shuf[i]; shuf[i] = shuf[j]; shuf[j] = t; }
    const scrambled = carry(shuf);

    ok("!! a smooth signal carried DOWN the map lands near its analytic value at the coarse position",
        real < 0.5,
        "worst error " + real.toFixed(4) + " against the SAME function evaluated at the coarse positions -- " +
        "DERIVED, never typed. It is not tiny and should not be: quadric collapse RELOCATES the survivor to " +
        "the error-minimising point, so this compares a neighbourhood average against the function at a moved " +
        "position");

    ok("!! and a SHUFFLED map is far worse, which is what makes the check mean anything",
        scrambled > real * 5,
        "shuffled " + scrambled.toFixed(4) + " against " + real.toFixed(4) + " -- " +
        (scrambled / real).toFixed(1) + "x. Without this control the test would pass on ANY map, including " +
        "one that carried no information at all");

    ok("...and a survivor is NOT expected at its original position",
        (() => { let same = 0;
            for (let i = 0; i < nFine; i++) { const c = f2c[i];
                if (Math.hypot(P[i*3] - r.positions[c*3], P[i*3+1] - r.positions[c*3+1], P[i*3+2] - r.positions[c*3+2]) < 1e-6) same++; }
            return same > 0 && same < nFine; })(),
        "MEASURED 52 of 169 on a smaller sphere. I expected identity-on-survivors and CHECKING KILLED IT: " +
        "quadric collapse moves the surviving vertex to the error-minimising point, so a 'survivor' is not at " +
        "its original position. Asserting the property I assumed would have been a gate encoding a false belief");
}

console.log();
if (fails) { console.log("quadricDecimate-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("quadricDecimate-selfcheck: all checks pass");
