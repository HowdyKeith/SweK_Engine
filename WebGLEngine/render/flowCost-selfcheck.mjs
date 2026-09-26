#!/usr/bin/env node
// WebGLEngine/render/flowCost-selfcheck.mjs -- v4748
//
// render/flowCost.mjs's count of what the optical flow reads, held to the reads render/opticalFlow.mjs's mirror makes
// (opticalFlowCPU's `tally`), and v4748's `refineRadius` held to what it is for: the levels below the coarsest refining
// the guess within a smaller window, the coarsest still searching the whole one. Measured here on a smoothed texture shifted
// by known amounts: which shifts each setting finds, against what it reads.
"use strict";
import { flowCostModel, pyramidSizes } from "./flowCost.mjs";
import { opticalFlowCPU } from "./opticalFlow.mjs";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const threw = (fn) => { try { fn(); return "no throw"; } catch (e) { return e.message; } };

console.log("\n1. WHAT IT REFUSES");
{
    const got = [threw(() => flowCostModel({ w: 0, h: 4 })), threw(() => flowCostModel({ w: 8, h: 8, block: 1 })), threw(() => flowCostModel({ w: 8, h: 8, refineRadius: 0 })),
                 threw(() => flowCostModel({ w: 8, h: 8, levels: 1.5 })), threw(() => opticalFlowCPU({ cur: new Float32Array(256), prev: new Float32Array(256), w: 8, h: 8, refineRadius: 2.5 }))];
    ok("an empty frame, a block under 2, and a radius or level count that is not a whole number are refused -- and opticalFlowCPU refuses a fractional refinement radius", got.every((m) => m !== "no throw"), got.map((m) => m.slice(0, 50)).join(" | "));
}

console.log("\n2. THE COUNT IS THE MIRROR'S");
let sd = 7; const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
{
    // odd sizes, every level's size rounded up, a block that does not divide the frame, and each option
    const w = 61, h = 45, img = () => Float32Array.from({ length: w * h * 4 }, () => rnd());
    const rows = [];
    for (const o of [{}, { refineRadius: 2 }, { refineRadius: 1 }, { searchRadius: 2, levels: 2 }, { block: 5, subpixel: false }, { levels: 6 }]) {
        const t = { scores: 0, reads: 0 }; opticalFlowCPU({ cur: img(), prev: img(), w, h, ...o, tally: t });
        const m = flowCostModel({ w, h, ...o }); rows.push({ o, t, m, same: t.reads === m.search && t.scores === m.perLevel.reduce((q, l) => q + l.blocks * l.scores, 0) });
    }
    ok(`*** the model's reads are opticalFlowCPU's, to the read, at ${w} x ${h} under six settings: ${rows.map((r) => `${JSON.stringify(r.o).replace(/"/g, "")} ${(r.m.search / 1e6).toFixed(3)}M`).join(", ")} ***`,
       rows.every((r) => r.same), rows.filter((r) => !r.same).map((r) => `${JSON.stringify(r.o)}: mirror ${r.t.reads}, model ${r.m.search}`).join("; ") || "every score, and the guess each level below the coarsest reads");
    ok("  ...and its pyramid is opticalFlowTsl's: a level every halving, rounded up, capped", JSON.stringify(pyramidSizes(61, 45, 3)) === "[[61,45],[31,23],[16,12]]" && pyramidSizes(3, 1, 9).length === 3);
    const cur = img(), prev = img(), a = opticalFlowCPU({ cur, prev, w, h }), b = opticalFlowCPU({ cur, prev, w, h, refineRadius: 4 });
    ok("  ...and a refinement radius left out is the search radius -- the flow bit for bit what it was", a.flow.every((v, i) => v === b.flow[i]) && a.conf.every((v, i) => v === b.conf[i]));
}

console.log("\n3. WHAT A SMALLER WINDOW BELOW THE COARSEST LEVEL COSTS: WHAT IT FINDS");
const W = 160, H = 96, TW = 512;
const tex = new Float32Array(TW * TW);
{ const raw = Float32Array.from({ length: TW * TW }, () => rnd());
  for (let y = 0; y < TW; y++) for (let x = 0; x < TW; x++) { let a = 0; for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) a += raw[((y + j + TW) % TW) * TW + ((x + i + TW) % TW)]; tex[y * TW + x] = a / 49; } }
const frame = (sx) => { const b = new Float32Array(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = tex[(y + 100) * TW + (x + 100 - sx)], i = (y * W + x) * 4; b[i] = b[i + 1] = b[i + 2] = v; b[i + 3] = 1; } return b; };
{
    // the share of interior blocks that return the shift to within 0.75 of a pixel
    const prev = frame(0), SHIFTS = [10, 14, 18], bw = Math.ceil(W / 8), found = {};
    const SET = { default: {}, refine2: { refineRadius: 2 }, refine1: { refineRadius: 1 }, radius2: { searchRadius: 2 } };
    for (const [nm, o] of Object.entries(SET)) {
        found[nm] = { cost: flowCostModel({ w: W, h: H, ...o }), at: {} };
        for (const s of SHIFTS) { const f = opticalFlowCPU({ cur: frame(s), prev, w: W, h: H, ...o }); let hit = 0, n = 0;
            for (let by = 1; by < Math.ceil(H / 8) - 1; by++) for (let bx = 5; bx < bw - 1; bx++) { n++; if (Math.abs(f.flow[(by * bw + bx) * 2] - s) < 0.75 && Math.abs(f.flow[(by * bw + bx) * 2 + 1]) < 0.75) hit++; }
            found[nm].at[s] = hit / n; }
        say(`${nm.padEnd(8)} ${(found[nm].cost.search / found.default.cost.search * 100).toFixed(0)}% of the reads, reach by the sum ${found[nm].cost.reach} px; found ${SHIFTS.map((s) => `${s} px ${(found[nm].at[s] * 100).toFixed(0)}%`).join(", ")}`);
    }
    const F = found, share = (k) => F[k].cost.search / F.default.cost.search;
    ok(`*** refining within 2 below the coarsest level finds what the full window finds -- ${(F.refine2.at[18] * 100).toFixed(0)}% of blocks at 18 px against ${(F.default.at[18] * 100).toFixed(0)}% -- for ${(share("refine2") * 100).toFixed(0)}% of the reads, and within 1 for ${(share("refine1") * 100).toFixed(0)}% ***`,
       F.refine2.at[18] >= F.default.at[18] - 0.03 && F.refine1.at[18] >= F.default.at[18] - 0.03 && share("refine2") < 0.6 && share("refine1") < 0.45,
       "what reaches far is the coarsest level's search -- a pixel there is four at full size -- and below it the guess is off by the coarser level's rounding, which a small window covers");
    ok(`  ...where the SAME cut made by shrinking every window (${(share("radius2") * 100).toFixed(0)}% of the reads) stops finding it at 14 px: ${(F.radius2.at[14] * 100).toFixed(0)}% of blocks, against ${(F.default.at[14] * 100).toFixed(0)}%`,
       F.radius2.at[14] < 0.5 && F.default.at[14] > 0.9 && F.radius2.at[10] > 0.9, "the coarsest level's window is the reach; the reach by the sum over levels, 14 px here, is not what is found");
    ok(`  ...and the sum over levels is a bound, not what is found: the full window's is ${F.default.cost.reach} px, and 18 px is where it still works here`, F.default.cost.reach === 28 && F.refine2.cost.reach === 22);
}

console.log("\n4. AT THE SIZES THAT MATTER");
{
    const at = (w, h, o = {}) => flowCostModel({ w, h, ...o });
    const page = at(960, 540), hd = at(1920, 1080), pageR = at(960, 540, { refineRadius: 2 });
    say(`fsr-three.html, 960 x 540: search ${(page.search / 1e6).toFixed(0)}M reads, pyramids ${(page.pyramid / 1e6).toFixed(1)}M, reconciliation ${(page.reconcile / 1e6).toFixed(1)}M -- ${(pageR.search / 1e6).toFixed(0)}M refining within 2; 1920 x 1080: ${(hd.total / 1e6).toFixed(0)}M`);
    ok(`the SEARCH is the flow's cost: ${(page.search / page.total * 100).toFixed(1)}% of its reads at 960 x 540, the pyramids and the reconciliation together ${((page.pyramid + page.reconcile) / page.total * 100).toFixed(1)}%`,
       page.search / page.total > 0.9, "over nine tenths: each block scores 84 to 88 candidates of 128 reads at every level, and the block grid is the same at every level");
}

// ---- v4748 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against render/flowCost.mjs: K1 the guess read not counted -> 1; K2 standing still not counted -> 1; K3 the vertex counted
// at every level -> 1; K4 the refinement radius at the coarsest level too -> 2; K5 the reach by the search radius at every
// level -> 1. Against render/opticalFlow.mjs, here and in render/opticalFlowTsl-selfcheck.mjs: O1 the refinement radius
// ignored -> 1, 2; O2 the refinement at the coarsest level and the search below it -> 2, 2.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a GPU's time, which reads are a model of and not a measure -- caches, the sampler and occupancy decide it; " +
    "fx/fsr/fsrFlowCost-selfcheck.mjs holds this device's time to the count's ratios. And motion larger than 18 pixels a frame, which " +
    "no setting here finds and FSR3 meets with a larger pyramid.");
process.exitCode = fails ? 1 : 0;
