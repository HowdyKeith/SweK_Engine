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
}

console.log("\n2. THE COUNT IS THE MIRROR'S");
let sd = 7; const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
{
    // odd sizes, every level's size rounded up, a block that does not divide the frame, and each option
    const w = 61, h = 45, img = () => Float32Array.from({ length: w * h * 4 }, () => rnd());
    const rows = [];
    for (const o of [{}, { refineRadius: 2 }, { refineRadius: 1 }, { searchRadius: 2, levels: 2 }, { block: 5, subpixel: false }, { levels: 6 },
                     { grid: "level" }, { grid: "level", refineRadius: 2 }, { grid: "level", block: 5, levels: 4, subpixel: false }, { grid: "level", levels: 6 },
                     { grid: "level", seed: true }, { seed: true, refineRadius: 2 }, { grid: "level", stillGuess: true }, { stillGuess: true, levels: 4 }]) {
        // v4758: a seed is the motion field, (du, dv, valid, _) -- half of it valid, so both of the device's paths are counted
        const seed = o.seed ? Float32Array.from({ length: w * h * 4 }, (_, i) => (i % 4 === 2 ? (i % 8 === 2 ? 1 : 0) : (rnd() - 0.5) * 0.2)) : null;
        const t = { scores: 0, reads: 0 }; opticalFlowCPU({ cur: img(), prev: img(), w, h, ...o, seed, tally: t });
        const m = flowCostModel({ w, h, ...o }); rows.push({ o, t, m, same: t.reads === m.search && t.scores === m.perLevel.reduce((q, l) => q + l.blocks * l.scores, 0) });
    }
    ok(`*** the model's reads are opticalFlowCPU's, to the read, at ${w} x ${h} under fourteen settings, four of them v4753's grid, two v4758's seed and two v4759's standing still: ${rows.map((r) => `${JSON.stringify(r.o).replace(/"/g, "")} ${(r.m.search / 1e6).toFixed(3)}M`).join(", ")} ***`,
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
{
    const bil = (x, y) => { const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, g = (i, j) => tex[(((j % TW) + TW) % TW) * TW + (((i % TW) + TW) % TW)];
        return (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy; };
    const pic = (f) => { const b = new Float32Array(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = f(x + 0.5, y + 0.5), i = (y * W + x) * 4; b[i] = b[i + 1] = b[i + 2] = v; b[i + 3] = 1; } return b; };
    const GR = { block: {}, level: { grid: "level" } }, epe = {};
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
        say(`two motions, ${g} grid: ${st.inside[0]} of ${st.inside[1]} blocks away from the square's edge right, ${st.edge[0]} of ${st.edge[1]} within 16 pixels of it${o.grid ? `; a neighbour's guess taken at ${t.neighbours} blocks` : ""}`);
    }
    ok(`*** and where two motions meet it is right at more blocks, not fewer: ${two.level.edge[0]} of ${two.level.edge[1]} within 16 pixels of the square's edge against ${two.block.edge[0]}, and ${two.level.inside[0]} of ${two.level.inside[1]} away from it against ${two.block.inside[0]} ***`,
       two.level.edge[0] >= two.block.edge[0] + 5 && two.level.inside[0] >= two.block.inside[0],
       "a block whose parent straddles the edge takes its parent's neighbour on its own side, when that neighbour's guess explains it better");
    ok(`  ...and the neighbours' guesses are taken: at ${two.level.neighbours} blocks of the levels below the coarsest, on two motions`,
       two.level.neighbours > 5, "a population row -- what they are worth is the row above, which goes red with them sabotaged away (the log below)");
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
    for (const size of [16, 24]) for (const cn of ["still over 16", "16 over still"]) { const a = R[`${size} ${cn} without`], b = R[`${size} ${cn} with`];
        say(`a ${size} px square ${cn.replace("over", "px over a background moving").replace("16 px over a background moving still", "moving 16 px over a still background").replace("still px over a background moving 16", "standing still over a background moving 16 px")}: ${a.k} of ${a.n} of its blocks right without, ${b.k} with, ${((b.reads / a.reads - 1) * 100).toFixed(1)} % more reads`); }
    const A = (s, c, v) => R[`${s} ${c} ${v}`];
    ok(`*** a small thing that STANDS STILL over a moving background is found with standing still as a guess below the coarsest level -- ${A(16, "still over 16", "with").k} of ${A(16, "still over 16", "with").n} blocks at 16 px and ${A(24, "still over 16", "with").k} of ${A(24, "still over 16", "with").n} at 24, against ${A(16, "still over 16", "without").k} and ${A(24, "still over 16", "without").k} -- for ${((A(16, "still over 16", "with").reads / A(16, "still over 16", "without").reads - 1) * 100).toFixed(1)} % more reads ***`,
       A(16, "still over 16", "with").k === A(16, "still over 16", "with").n && A(24, "still over 16", "with").k === A(24, "still over 16", "with").n && A(16, "still over 16", "without").k === 0 && A(24, "still over 16", "without").k === 0,
       "at the coarse levels its blocks are mostly background and take the background's 16 px; the windows below reach 12 px back from that, and standing still is 16 away");
    ok(`  ...and one that MOVES 16 px over a still background is lost either way -- ${A(16, "16 over still", "with").k} and ${A(24, "16 over still", "with").k} of ${A(16, "16 over still", "with").n} and ${A(24, "16 over still", "with").n} blocks -- which only a window reaching 16 px at the level below the coarsest finds: +45 % of the reads at the same spacing, or at double spacing no more, and a zoom's error doubled (0.151 px to 0.350) -- measured on the mirror, not built`,
       A(16, "16 over still", "with").k === 0 && A(24, "16 over still", "with").k === 0, "its own motion was measured by no block at the coarse levels, and standing still is not it");
    // and where nothing is small, standing still changes nothing: the same shifts found, the same zoom
    // and where nothing is small it changes only the blocks the content entered the frame at, which have no right answer
    const prev = frame(0); let edgeOnly = true, changed = 0;
    for (const s2 of [10, 14, 18]) { const a = opticalFlowCPU({ cur: frame(s2), prev, w: W, h: H, grid: "level" }), b = opticalFlowCPU({ cur: frame(s2), prev, w: W, h: H, grid: "level", stillGuess: true });
        for (let q = 0; q < a.bw * a.bh; q++) if (a.flow[q * 2] !== b.flow[q * 2] || a.flow[q * 2 + 1] !== b.flow[q * 2 + 1]) { changed++; if (q % a.bw > Math.ceil(s2 / 8)) edgeOnly = false; } }
    ok(`  ...and on the uniform shifts of section 3, 10 to 18 px, it changes ${changed} blocks, every one within the shift of the frame's left edge -- where the content came in from outside and no answer is right -- and none that section 3 grades`,
       edgeOnly && changed > 0, "where a block's guess is right, standing still does not explain it better");
}

console.log("\n6. AT THE SIZES THAT MATTER");
{
    const at = (w, h, o = {}) => flowCostModel({ w, h, ...o });
    const page = at(960, 540), hd = at(1920, 1080), pageR = at(960, 540, { refineRadius: 2 }), pageL = at(960, 540, { grid: "level" }), pageLR = at(960, 540, { grid: "level", refineRadius: 2 });
    say(`fsr-three.html, 960 x 540: search ${(page.search / 1e6).toFixed(0)}M reads, pyramids ${(page.pyramid / 1e6).toFixed(1)}M, reconciliation ${(page.reconcile / 1e6).toFixed(1)}M -- ${(pageR.search / 1e6).toFixed(0)}M refining within 2; 1920 x 1080: ${(hd.total / 1e6).toFixed(0)}M`);
    say(`v4753, each level on its own grid at 960 x 540: search ${(pageL.search / 1e6).toFixed(0)}M, ${(pageLR.search / 1e6).toFixed(0)}M refining within 2`);
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
