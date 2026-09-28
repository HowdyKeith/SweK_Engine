#!/usr/bin/env node
// WebGLEngine/render/flowCost-selfcheck.mjs -- v4748
//
// render/flowCost.mjs's count of what the optical flow reads, held to the reads render/opticalFlow.mjs's mirror makes
// (opticalFlowCPU's `tally`), and v4748's `refineRadius` held to what it is for: the levels below the coarsest refining
// the guess within a smaller window, the coarsest still searching the whole one. Measured here on a smoothed texture shifted
// by known amounts: which shifts each setting finds, against what it reads. v4753's `grid: "level"` -- each level its own
// block grid, each block below the coarsest taking the best of four guesses -- held to the same count, and measured where
// the motion is not one shift: a zoom, a turn, and a square moving across a background moving the other way.
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
                 threw(() => flowCostModel({ w: 8, h: 8, levels: 1.5 })), threw(() => opticalFlowCPU({ cur: new Float32Array(256), prev: new Float32Array(256), w: 8, h: 8, refineRadius: 2.5 })),
                 threw(() => flowCostModel({ w: 8, h: 8, grid: "levels" })), threw(() => opticalFlowCPU({ cur: new Float32Array(256), prev: new Float32Array(256), w: 8, h: 8, grid: "coarse" }))];
    ok("an empty frame, a block under 2, and a radius or level count that is not a whole number are refused -- and opticalFlowCPU refuses a fractional refinement radius; both refuse a grid that is not \"block\" or \"level\"", got.every((m) => m !== "no throw"), got.map((m) => m.slice(0, 50)).join(" | "));
    // v4768: the retry's radius is the second window's, walked every second pixel -- odd, under 2 or fractional has no such walk
    const cf = { cur: new Float32Array(256), prev: new Float32Array(256), w: 8, h: 8 };
    const rg = [threw(() => flowCostModel({ w: 8, h: 8, retryRadius: 3 })), threw(() => flowCostModel({ w: 8, h: 8, retryRadius: 0 })), threw(() => flowCostModel({ w: 8, h: 8, retried: 4 })),
                threw(() => opticalFlowCPU({ ...cf, retryRadius: 5 })), threw(() => opticalFlowCPU({ ...cf, retryRadius: 6.5 })), threw(() => opticalFlowCPU({ ...cf, retryRadius: 8, retryRatio: 0 }))];
    ok("v4768: a retry radius that is odd, under 2 or fractional is refused by both, a ratio that is not positive by the mirror, and retried blocks counted without a radius by the model",
       rg.every((m) => m !== "no throw"), rg.map((m) => m.slice(0, 50)).join(" | "));
}

console.log("\n2. THE COUNT IS THE MIRROR'S");
let sd = 7; const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
{
    // odd sizes, every level's size rounded up, a block that does not divide the frame, and each option
    const w = 61, h = 45, img = () => Float32Array.from({ length: w * h * 4 }, () => rnd());
    let sd2 = 29; const img2 = () => Float32Array.from({ length: w * h * 4 }, () => (sd2 = (sd2 * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const rows = [];
    for (const o of [{}, { refineRadius: 2 }, { refineRadius: 1 }, { searchRadius: 2, levels: 2 }, { block: 5, subpixel: false }, { levels: 6 },
                     { grid: "level" }, { grid: "level", refineRadius: 2 }, { grid: "level", block: 5, levels: 4, subpixel: false }, { grid: "level", levels: 6 },
                     { grid: "level", seed: true }, { seed: true, refineRadius: 2 }, { grid: "level", stillGuess: true }, { stillGuess: true, levels: 4 },
                     { grid: "level", retryRadius: 8 }, { retryRadius: 4, refineRadius: 1, levels: 4 }, { grid: "level", retryRadius: 2, refineRadius: 2 }]) {
        // v4758: a seed is the motion field, (du, dv, valid, _) -- half of it valid, so both of the device's paths are counted
        const seed = o.seed ? Float32Array.from({ length: w * h * 4 }, (_, i) => (i % 4 === 2 ? (i % 8 === 2 ? 1 : 0) : (rnd() - 0.5) * 0.2)) : null;
        // v4768's rows draw their frames from a generator of their own, so the texture section 3 draws after them is the one it was
        const pic = o.retryRadius ? img2 : img, t = { scores: 0, reads: 0 }; opticalFlowCPU({ cur: pic(), prev: pic(), w, h, ...o, seed, tally: t });
        // v4768: which blocks retry is the frame's -- the model is handed the mirror's count of them and of the retries that won
        const m = flowCostModel({ w, h, ...o, retried: t.retried || 0, retryWon: t.retryWon || 0 });
        rows.push({ o, t, m, same: t.reads === m.search && t.scores === m.perLevel.reduce((q, l) => q + l.blocks * l.scores, 0) + m.retry.scores });
    }
    ok(`*** the model's reads are opticalFlowCPU's, to the read, at ${w} x ${h} under seventeen settings, four of them v4753's grid, two v4758's seed, two v4759's standing still and three v4768's retry: ${rows.map((r) => `${JSON.stringify(r.o).replace(/"/g, "")} ${(r.m.search / 1e6).toFixed(3)}M`).join(", ")} ***`,
       rows.every((r) => r.same), rows.filter((r) => !r.same).map((r) => `${JSON.stringify(r.o)}: mirror ${r.t.reads}, model ${r.m.search}`).join("; ") || "every score, and the guess each level below the coarsest reads");
    {   // v4768: the three retry settings each reach both of a retry's costs, and one of them the window that has nothing outside it
        const rr = rows.slice(-3);
        ok(`  ...and v4768's retry is in that count where it costs something: blocks retried ${rr.map((r) => r.t.retried || 0).join(", ")}, won ${rr.map((r) => r.t.retryWon || 0).join(", ")}; a second window of ${rr.map((r) => r.m.retry.coarse).join(", ")} scores`,
           rr[0].t.retried > 20 && rr[0].t.retryWon > 5 && rr[1].t.retried > 20 && rr[1].t.retryWon > 5 && rr[2].m.retry.coarse === 0 && !rr[2].t.retryWon && rr[0].m.retry.coarse === 81 - 25 && rr[1].m.retry.coarse === 25 - 1,
           "random frames, so most blocks are explained by nothing and retry. A radius of 2 about a window of 2 has no even offset outside it: nothing to search, and nothing won");
    }
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
    const SET = { default: {}, refine2: { refineRadius: 2 }, refine1: { refineRadius: 1 }, radius2: { searchRadius: 2 }, level: { grid: "level" }, levelR2: { grid: "level", refineRadius: 2 } };
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
    ok(`*** v4753: each level on its OWN grid finds the same shifts -- ${SHIFTS.map((s) => `${s} px ${(F.level.at[s] * 100).toFixed(0)}%`).join(", ")} against ${SHIFTS.map((s) => `${(F.default.at[s] * 100).toFixed(0)}%`).join(", ")} -- for ${(share("level") * 100).toFixed(0)}% of the reads, and refining within 2 for ${(share("levelR2") * 100).toFixed(0)}% ***`,
       SHIFTS.every((s) => F.level.at[s] >= F.default.at[s] - 0.01 && F.levelR2.at[s] >= F.default.at[s] - 0.01) && share("level") < 0.5 && share("levelR2") < 0.25,
       "a coarse level has a quarter of the blocks of the level below it, where the block grid searched every finest block at every level");
}

console.log("\n4. v4753: WHERE THE MOTION IS NOT ONE SHIFT -- a zoom, a turn, and two motions");
let at4 = null;     // v4768: section 6 reads the retry's figures on these frames from here
{
    const bil = (x, y) => { const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, g = (i, j) => tex[(((j % TW) + TW) % TW) * TW + (((i % TW) + TW) % TW)];
        return (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy; };
    const pic = (f) => { const b = new Float32Array(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = f(x + 0.5, y + 0.5), i = (y * W + x) * 4; b[i] = b[i + 1] = b[i + 2] = v; b[i + 3] = 1; } return b; };
    const GR = { block: {}, level: { grid: "level" }, retry: { grid: "level", retryRadius: 8 } }, epe = {};   // v4768's retry, reported in section 6
    // the end-point error at each interior block's centre, against the warp's own displacement there
    for (const [cn, ang, zoom] of [["zoom", 0, 1.08], ["turn", 6, 1.0]]) {
        const th = ang * Math.PI / 180, cx = W / 2, cy = H / 2;
        const back = (x, y) => { const dx = x - cx, dy = y - cy; return [(Math.cos(th) * dx + Math.sin(th) * dy) / zoom + cx, (-Math.sin(th) * dx + Math.cos(th) * dy) / zoom + cy]; };
        const prev = pic((x, y) => bil(x + 100, y + 100)), cur = pic((x, y) => { const [u, v] = back(x, y); return bil(u + 100, v + 100); });
        epe[cn] = {};
        for (const [g, o] of Object.entries(GR)) { const f = opticalFlowCPU({ cur, prev, w: W, h: H, ...o }); let e = 0, n = 0;
            for (let by = 1; by < f.bh - 1; by++) for (let bx = 1; bx < f.bw - 1; bx++) { const x = bx * 8 + 4, y = by * 8 + 4, [u, v] = back(x, y);
                e += Math.hypot(f.flow[(by * f.bw + bx) * 2] - (x - u), f.flow[(by * f.bw + bx) * 2 + 1] - (y - v)); n++; }
            epe[cn][g] = e / n; }
        say(`${cn}: mean end-point error at the block centres -- block grid ${epe[cn].block.toFixed(3)} px, level grid ${epe[cn].level.toFixed(3)}`);
    }
    ok(`*** the level grid follows motion that varies across the frame: a zoom of 8 % read to ${epe.zoom.level.toFixed(3)} px at the block centres, against ${epe.zoom.block.toFixed(3)} on the block grid, and a turn of 6 degrees to ${epe.turn.level.toFixed(3)} against ${epe.turn.block.toFixed(3)} ***`,
       epe.zoom.level < 0.25 && epe.turn.level < 0.25 && epe.zoom.block > 2 * epe.zoom.level && epe.turn.block > 2 * epe.turn.level,
       "the block grid's coarse patch starts at its block's corner and reaches 24 pixels right of it and below at the coarsest level, so it measured the motion 12 pixels away; the level grid's covers its own blocks");
    // two motions: a square of another texture moving (+10, +4) over the background moving (-5, 0); graded per block of
    // one motion, split by whether it is within 16 pixels of the square's edge
    const R0 = { x: 50, y: 24, w: 48, h: 40 }, FG = [10, 4], BG = [-5, 0], OFF = 257;
    const inR = (x, y, [dx, dy]) => x >= R0.x + dx && x < R0.x + R0.w + dx && y >= R0.y + dy && y < R0.y + R0.h + dy;
    const prev = pic((x, y) => inR(x, y, [0, 0]) ? bil(x + OFF, y + OFF) : bil(x + 100, y + 100));
    const cur = pic((x, y) => inR(x, y, FG) ? bil(x + OFF - FG[0], y + OFF - FG[1]) : bil(x + 100 - BG[0], y + 100 - BG[1]));
    const two = {};
    for (const [g, o] of Object.entries(GR)) { const t = { scores: 0, reads: 0, neighbours: 0 }, f = opticalFlowCPU({ cur, prev, w: W, h: H, ...o, tally: t }), st = { inside: [0, 0], edge: [0, 0] };
        for (let by = 1; by < f.bh - 1; by++) for (let bx = 1; bx < f.bw - 1; bx++) { let n = 0; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (inR(bx * 8 + x + 0.5, by * 8 + y + 0.5, FG)) n++;
            if (n !== 0 && n !== 64) continue;
            const cx = bx * 8 + 4, cy = by * 8 + 4, L = R0.x + FG[0], T = R0.y + FG[1], d = n ? Math.min(cx - L, L + R0.w - cx, cy - T, T + R0.h - cy) : Math.hypot(Math.max(L - cx, cx - L - R0.w, 0), Math.max(T - cy, cy - T - R0.h, 0));
            const want = n ? FG : BG, k = d < 16 ? "edge" : "inside";
            st[k][1]++; if (Math.hypot(f.flow[(by * f.bw + bx) * 2] - want[0], f.flow[(by * f.bw + bx) * 2 + 1] - want[1]) < 0.75) st[k][0]++; }
        two[g] = { ...st, neighbours: t.neighbours };
        if (g !== "retry") say(`two motions, ${g} grid: ${st.inside[0]} of ${st.inside[1]} blocks away from the square's edge right, ${st.edge[0]} of ${st.edge[1]} within 16 pixels of it${o.grid ? `; a neighbour's guess taken at ${t.neighbours} blocks` : ""}`);
    }
    ok(`*** and where two motions meet it is right at more blocks, not fewer: ${two.level.edge[0]} of ${two.level.edge[1]} within 16 pixels of the square's edge against ${two.block.edge[0]}, and ${two.level.inside[0]} of ${two.level.inside[1]} away from it against ${two.block.inside[0]} ***`,
       two.level.edge[0] >= two.block.edge[0] + 5 && two.level.inside[0] >= two.block.inside[0],
       "a block whose parent straddles the edge takes its parent's neighbour on its own side, when that neighbour's guess explains it better");
    ok(`  ...and the neighbours' guesses are taken: at ${two.level.neighbours} blocks of the levels below the coarsest, on two motions`,
       two.level.neighbours > 5, "a population row -- what they are worth is the row above, which goes red with them sabotaged away (the log below)");
    at4 = { epe, two };
}

console.log("\n5. v4759: A SMALL THING THAT MOVES OTHERWISE THAN WHAT IS BEHIND IT");
{
    // a square of another texture, 16 or 24 px, over a background -- one of them moving, the other still -- graded on the blocks
    // wholly inside the square, on the level grid at three levels, with standing still as a guess below the coarsest and without
    const SW = 192, SH = 128, texB = new Float32Array(TW * TW);
    { let s2 = 91; const r2 = () => (s2 = (s2 * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; const raw = Float32Array.from({ length: TW * TW }, () => r2());
      for (let y = 0; y < TW; y++) for (let x = 0; x < TW; x++) { let a = 0; for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) a += raw[((y + j + TW) % TW) * TW + ((x + i + TW) % TW)]; texB[y * TW + x] = a / 25; } }
    const at = (t, x, y) => t[((y % TW + TW) % TW) * TW + ((x % TW + TW) % TW)];
    const pic = (f) => { const b = new Float32Array(SW * SH * 4); for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) { const v = f(x, y), i = (y * SW + x) * 4; b[i] = b[i + 1] = b[i + 2] = v; b[i + 3] = 1; } return b; };
    const run = (size, fg, bg, o) => {
        const inR = (x, y, [dx, dy]) => x >= 80 + dx && x < 80 + size + dx && y >= 48 + dy && y < 48 + size + dy;
        const prev = pic((x, y) => inR(x, y, [0, 0]) ? at(texB, x + 300, y + 300) : at(tex, x + 100, y + 100));
        const cur = pic((x, y) => inR(x, y, fg) ? at(texB, x + 300 - fg[0], y + 300 - fg[1]) : at(tex, x + 100 - bg[0], y + 100 - bg[1]));
        const t = { scores: 0, reads: 0 }, f = opticalFlowCPU({ cur, prev, w: SW, h: SH, grid: "level", ...o, tally: t }); let k = 0, n = 0;
        for (let by = 1; by < f.bh - 1; by++) for (let bx = 1; bx < f.bw - 1; bx++) { let c = 0; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (inR(bx * 8 + x, by * 8 + y, fg)) c++;
            if (c !== 64) continue; n++; if (Math.hypot(f.flow[(by * f.bw + bx) * 2] - fg[0], f.flow[(by * f.bw + bx) * 2 + 1] - fg[1]) < 0.75) k++; }
        return { k, n, reads: t.reads };
    };
    const R = {};
    for (const size of [16, 24]) for (const [cn, fg, bg] of [["still over 16", [0, 0], [16, 0]], ["16 over still", [16, 4], [0, 0]]])
        for (const [vn, o] of [["without", {}], ["with", { stillGuess: true }]]) R[`${size} ${cn} ${vn}`] = run(size, fg, bg, o);
    // v4768: the retry, section 6's -- alone and with standing still, and on a square moving 24 px, past its reach
    for (const size of [16, 24]) for (const [cn, fg, bg] of [["still over 16", [0, 0], [16, 0]], ["16 over still", [16, 4], [0, 0]], ["24 over still", [24, -6], [0, 0]]])
        for (const [vn, o] of [["retry", { retryRadius: 8 }], ["retry+still", { retryRadius: 8, stillGuess: true }], ...(cn === "24 over still" ? [["without", {}]] : [])]) R[`${size} ${cn} ${vn}`] = run(size, fg, bg, o);
    for (const size of [16, 24]) for (const cn of ["still over 16", "16 over still"]) { const a = R[`${size} ${cn} without`], b = R[`${size} ${cn} with`];
        say(`a ${size} px square ${cn.replace("over", "px over a background moving").replace("16 px over a background moving still", "moving 16 px over a still background").replace("still px over a background moving 16", "standing still over a background moving 16 px")}: ${a.k} of ${a.n} of its blocks right without, ${b.k} with, ${((b.reads / a.reads - 1) * 100).toFixed(1)} % more reads`); }
    const A = (s, c, v) => R[`${s} ${c} ${v}`];
    ok(`*** a small thing that STANDS STILL over a moving background is found with standing still as a guess below the coarsest level -- ${A(16, "still over 16", "with").k} of ${A(16, "still over 16", "with").n} blocks at 16 px and ${A(24, "still over 16", "with").k} of ${A(24, "still over 16", "with").n} at 24, against ${A(16, "still over 16", "without").k} and ${A(24, "still over 16", "without").k} -- for ${((A(16, "still over 16", "with").reads / A(16, "still over 16", "without").reads - 1) * 100).toFixed(1)} % more reads ***`,
       A(16, "still over 16", "with").k === A(16, "still over 16", "with").n && A(24, "still over 16", "with").k === A(24, "still over 16", "with").n && A(16, "still over 16", "without").k === 0 && A(24, "still over 16", "without").k === 0,
       "at the coarse levels its blocks are mostly background and take the background's 16 px; the windows below reach 12 px back from that, and standing still is 16 away");
    ok(`  ...and one that MOVES 16 px over a still background is lost either way -- ${A(16, "16 over still", "with").k} and ${A(24, "16 over still", "with").k} of ${A(16, "16 over still", "with").n} and ${A(24, "16 over still", "with").n} blocks -- which only a window reaching 16 px at the level below the coarsest finds: +45 % of the reads at the same spacing, or at double spacing no more, and a zoom's error doubled (0.151 px to 0.350). v4768 built it for the blocks that need it: section 6`,
       A(16, "16 over still", "with").k === 0 && A(24, "16 over still", "with").k === 0, "its own motion was measured by no block at the coarse levels, and standing still is not it");
    // and where nothing is small, standing still changes nothing: the same shifts found, the same zoom
    // and where nothing is small it changes only the blocks the content entered the frame at, which have no right answer
    const prev = frame(0); let edgeOnly = true, changed = 0;
    for (const s2 of [10, 14, 18]) { const a = opticalFlowCPU({ cur: frame(s2), prev, w: W, h: H, grid: "level" }), b = opticalFlowCPU({ cur: frame(s2), prev, w: W, h: H, grid: "level", stillGuess: true });
        for (let q = 0; q < a.bw * a.bh; q++) if (a.flow[q * 2] !== b.flow[q * 2] || a.flow[q * 2 + 1] !== b.flow[q * 2 + 1]) { changed++; if (q % a.bw > Math.ceil(s2 / 8)) edgeOnly = false; } }
    ok(`  ...and on the uniform shifts of section 3, 10 to 18 px, it changes ${changed} blocks, every one within the shift of the frame's left edge -- where the content came in from outside and no answer is right -- and none that section 3 grades`,
       edgeOnly && changed > 0, "where a block's guess is right, standing still does not explain it better");

    console.log("\n6. v4768: THE BLOCKS THE WINDOW DID NOT EXPLAIN, SEARCHED AGAIN WIDER");
    for (const size of [16, 24]) for (const cn of ["16 over still", "still over 16", "24 over still"]) {
        const base = R[`${size} ${cn} without`], q = R[`${size} ${cn} retry`], qs = R[`${size} ${cn} retry+still`];
        say(`a ${size} px square, ${cn}: ${base.k} of ${base.n} of its blocks right without, ${q.k} retrying within 8, ${qs.k} retrying and standing still guessed -- ${((q.reads / base.reads - 1) * 100).toFixed(1)} % and ${((qs.reads / base.reads - 1) * 100).toFixed(1)} % more reads`); }
    const B = (s, c, v) => R[`${s} ${c} ${v}`];
    // the population: section 5's one texture is one texture, and the first draft's figures were its. Four pairs of textures, the
    // square at three placements against the block grid, moving three ways, 16 and 24 px -- graded on the blocks wholly on it
    const mkTex = (seed, k) => { let q = seed; const r = () => (q = (q * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff, raw = Float32Array.from({ length: TW * TW }, r), t = new Float32Array(TW * TW);
        for (let y = 0; y < TW; y++) for (let x = 0; x < TW; x++) { let a = 0; for (let j = -k; j <= k; j++) for (let i = -k; i <= k; i++) a += raw[((y + j + TW) % TW) * TW + ((x + i + TW) % TW)]; t[y * TW + x] = a / (2 * k + 1) ** 2; } return t; };
    const PAIRS = [[mkTex(7, 3), mkTex(91, 2)], [mkTex(1234, 3), mkTex(555, 2)], [mkTex(42, 2), mkTex(77, 3)], [mkTex(999, 3), mkTex(31, 1)]];
    const POP = {};
    for (const [vn, o] of [["without", {}], ["retry", { retryRadius: 8 }], ["retry 0.5", { retryRadius: 8, retryRatio: 0.5 }]]) {
        const p = POP[vn] = { 16: [0, 0], 24: [0, 0], bgWrong: 0, bgN: 0, reads: 0 };
        for (const [ta, tb] of PAIRS) for (const size of [16, 24]) for (const [ox, oy] of [[0, 0], [3, 5], [6, 2]]) for (const fg of [[16, 4], [12, -8], [-14, 6]]) {
            const X = 80 + ox, Y = 48 + oy, inR = (x, y, [dx, dy]) => x >= X + dx && x < X + size + dx && y >= Y + dy && y < Y + size + dy;
            const prev = pic((x, y) => inR(x, y, [0, 0]) ? at(tb, x + 300, y + 300) : at(ta, x + 100, y + 100)), cur = pic((x, y) => inR(x, y, fg) ? at(tb, x + 300 - fg[0], y + 300 - fg[1]) : at(ta, x + 100, y + 100));
            const t = { scores: 0, reads: 0 }, f = opticalFlowCPU({ cur, prev, w: SW, h: SH, grid: "level", ...o, tally: t }); p.reads += t.reads;
            for (let by = 1; by < f.bh - 1; by++) for (let bx = 1; bx < f.bw - 1; bx++) { let on = 0, near = 0;
                for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const a = inR(bx * 8 + x, by * 8 + y, fg); if (a) on++; if (a || inR(bx * 8 + x, by * 8 + y, [0, 0])) near++; }
                const vx = f.flow[(by * f.bw + bx) * 2], vy = f.flow[(by * f.bw + bx) * 2 + 1];
                if (on === 64) { p[size][1]++; if (Math.hypot(vx - fg[0], vy - fg[1]) < 0.75) p[size][0]++; } else if (!near) { p.bgN++; if (Math.hypot(vx, vy) >= 0.75) p.bgWrong++; } }
        }
        say(`${vn.padEnd(9)} over 72 scenes: 16 px squares' blocks right ${p[16][0]} of ${p[16][1]}, 24 px ${p[24][0]} of ${p[24][1]}; background blocks wrong ${p.bgWrong} of ${p.bgN}; ${vn === "without" ? "" : `${((p.reads / POP.without.reads - 1) * 100).toFixed(1)} % more reads`}`);
    }
    const Pw = POP.without, Pr = POP.retry, Ph = POP["retry 0.5"], more = (P) => (P.reads / Pw.reads - 1) * 100;
    ok(`*** a small thing that MOVES over a still background is found by retrying the blocks the window did not explain -- over 72 scenes ${Pr[24][0]} of ${Pr[24][1]} of the 24 px squares' blocks and ${Pr[16][0]} of ${Pr[16][1]} of the 16 px, against ${Pw[24][0]} and ${Pw[16][0]} -- for ${more(Pr).toFixed(1)} % more reads, and no background block made wrong ***`,
       Pr[24][0] >= 0.75 * Pr[24][1] && Pw[24][0] <= 0.35 * Pw[24][1] && Pr[16][0] >= 0.4 * Pr[16][1] && Pw[16][0] === 0 && Pr.bgWrong === 0 && more(Pr) < 6,
       "a block below the coarsest level whose best score is still more than 0.3 of its own texture energy searches 8 px about its guess, every second offset, and the eight about the winner -- a window reaching 16 px at level 1, paid for only by the blocks that retry. A 16 px square is a level-1 block's width, and half the time no level-1 block is mostly on it");
    ok(`  ...and the ratio is 0.3 because 0.5 strands blocks: ${Ph[24][0] + Ph[16][0]} of ${Ph[24][1] + Ph[16][1]} at 0.5 against ${Pr[24][0] + Pr[16][0]} at 0.3, for ${more(Ph).toFixed(1)} % and ${more(Pr).toFixed(1)} % more reads`,
       Pr[24][0] + Pr[16][0] >= Ph[24][0] + Ph[16][0] + 10, "the retry is about the guess: a level-1 block half on the square that a wrong offset explains to under half its energy keeps it at 0.5, and its children retry about the wrong offset");
    ok(`  ...and on section 5's one texture it finds v4759's still squares without standing still guessed -- ${B(16, "still over 16", "retry").k} of ${B(16, "still over 16", "retry").n} and ${B(24, "still over 16", "retry").k} of ${B(24, "still over 16", "retry").n} -- and with it all four squares: ${["16 over still", "still over 16"].flatMap((c) => [16, 24].map((z) => `${B(z, c, "retry+still").k}/${B(z, c, "retry+still").n}`)).join(", ")}`,
       ["16 over still", "still over 16"].every((c) => [16, 24].every((z) => B(z, c, "retry+still").k === B(z, c, "retry+still").n && B(z, c, "retry").k === B(z, c, "retry").n)),
       "a still square over a background moving 16 px is 16 px from its parent's answer, which a retry about that answer reaches at level 1: standing still is one score a block, and the retry up to 64 at the blocks that retry");
    ok(`  ...and NOT a square moving 24 px: ${B(16, "24 over still", "retry").k} of ${B(16, "24 over still", "retry").n} and ${B(24, "24 over still", "retry").k} of ${B(24, "24 over still", "retry").n} blocks, as without (${B(16, "24 over still", "without").k}, ${B(24, "24 over still", "without").k})`,
       B(16, "24 over still", "retry").k === 0 && B(24, "24 over still", "retry").k === 0,
       "24 px is 12 at level 1, past a retry radius of 8 about a guess of standing still; past that the coarsest level is what has to see it, and a small thing is mostly not what its coarse blocks see");
    let changedR = 0, edgeR = true, readsR = 0, reads0 = 0, retried = 0;
    for (const s2 of [10, 14, 18]) { const ta = { scores: 0, reads: 0 }, tb = { scores: 0, reads: 0 };
        const a = opticalFlowCPU({ cur: frame(s2), prev, w: W, h: H, grid: "level", tally: ta }), b = opticalFlowCPU({ cur: frame(s2), prev, w: W, h: H, grid: "level", retryRadius: 8, tally: tb });
        reads0 += ta.reads; readsR += tb.reads; retried += tb.retried || 0;
        for (let q = 0; q < a.bw * a.bh; q++) if (a.flow[q * 2] !== b.flow[q * 2] || a.flow[q * 2 + 1] !== b.flow[q * 2 + 1]) { changedR++; if (q % a.bw > Math.ceil(s2 / 8)) edgeR = false; } }
    ok(`  ...and on section 3's uniform shifts it changes ${changedR} blocks, every one within the shift of the frame's left edge, for ${((readsR / reads0 - 1) * 100).toFixed(1)} % more reads -- ${retried} blocks retried over the three`,
       edgeR && readsR / reads0 < 1.12, "the blocks the content came into the frame at are explained by nothing, so they are the ones that retry; elsewhere the window explains its block");
    const e4 = at4.epe, t4 = at4.two;
    ok(`  ...and where the motion varies across the frame it does no harm: a zoom of 8 % read to ${e4.zoom.retry.toFixed(3)} px against ${e4.zoom.level.toFixed(3)}, a turn of 6 degrees to ${e4.turn.retry.toFixed(3)} against ${e4.turn.level.toFixed(3)}, and two motions right at ${t4.retry.edge[0]} and ${t4.retry.inside[0]} blocks against ${t4.level.edge[0]} and ${t4.level.inside[0]} (section 4's frames)`,
       e4.zoom.retry <= e4.zoom.level + 0.01 && e4.turn.retry <= e4.turn.level + 0.01 && t4.retry.edge[0] >= t4.level.edge[0] && t4.retry.inside[0] >= t4.level.inside[0],
       "a retry only replaces the window's answer by a strictly better score, and the zoom's blocks are explained well enough by their window not to retry");
}

console.log("\n7. AT THE SIZES THAT MATTER");
{
    const at = (w, h, o = {}) => flowCostModel({ w, h, ...o });
    const page = at(960, 540), hd = at(1920, 1080), pageR = at(960, 540, { refineRadius: 2 }), pageL = at(960, 540, { grid: "level" }), pageLR = at(960, 540, { grid: "level", refineRadius: 2 });
    say(`fsr-three.html, 960 x 540: search ${(page.search / 1e6).toFixed(0)}M reads, pyramids ${(page.pyramid / 1e6).toFixed(1)}M, reconciliation ${(page.reconcile / 1e6).toFixed(1)}M -- ${(pageR.search / 1e6).toFixed(0)}M refining within 2; 1920 x 1080: ${(hd.total / 1e6).toFixed(0)}M`);
    say(`v4753, each level on its own grid at 960 x 540: search ${(pageL.search / 1e6).toFixed(0)}M, ${(pageLR.search / 1e6).toFixed(0)}M refining within 2`);
    const pageRT = at(960, 540, { grid: "level", retryRadius: 8 });
    say(`v4768, retrying within 8 on the level grid at 960 x 540: ${((pageRT.search - pageRT.retry.reads) / 1e6).toFixed(0)}M before any block retries -- the energy's two scores a block -- and at most ${(pageRT.retry.bound / 1e6).toFixed(0)}M more if every block below the coarsest retried and won; what a frame retries is its own: 3 to 10 % more on section 6's squares and shifts`);
    ok(`the SEARCH is the flow's cost: ${(page.search / page.total * 100).toFixed(1)}% of its reads at 960 x 540, the pyramids and the reconciliation together ${((page.pyramid + page.reconcile) / page.total * 100).toFixed(1)}%`,
       page.search / page.total > 0.9, "over nine tenths: each block scores 84 to 88 candidates of 128 reads at every level, and the block grid is the same at every level");
}

// ---- v4748 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against render/flowCost.mjs: K1 the guess read not counted -> 1; K2 standing still not counted -> 1; K3 the vertex counted
// at every level -> 1; K4 the refinement radius at the coarsest level too -> 2; K5 the reach by the search radius at every
// level -> 1. Against render/opticalFlow.mjs, here and in render/opticalFlowTsl-selfcheck.mjs: O1 the refinement radius
// ignored -> 1, 2; O2 the refinement at the coarsest level and the search below it -> 2, 2.
// v4753: the level grid's sabotages, here and in render/opticalFlowTsl-selfcheck.mjs, are logged in fx/fsr/fsrFlowGrid-selfcheck.mjs.
// v4758: the seed's sabotages are logged in fx/fsr/fsrFlowSeed-selfcheck.mjs.
// v4759: standing still's are logged in fx/fsr/fsrFlowStill-selfcheck.mjs.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a GPU's time, which reads are a model of and not a measure -- caches, the sampler and occupancy decide it; " +
    "fx/fsr/fsrFlowCost-selfcheck.mjs holds this device's time to the count's ratios. And motion larger than 18 pixels a frame, which " +
    "no setting here finds and FSR3 meets with a larger pyramid -- which the level grid makes cheap, and which a later round measures.");
process.exitCode = fails ? 1 : 0;
