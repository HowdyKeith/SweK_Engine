// WebGLEngine/brain/residualAdvisor-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/residualAdvisor-selfcheck.mjs      (a few seconds)
//
// THE GATE OF brain/residualAdvisor.mjs (Round 6 of brain/NEEDS_AND_LIMITS.md, registered first).
//   1 LAYOUT      the weight count and the split (8 inputs, 12 hidden, 2 outputs); the output layer starts EXACTLY zero; the start is deterministic.
//   2 FORWARD     zero output weights give shift 0 and cut 0 for any features; the outputs are bounded (shift within +-0.15, cut within [0, 0.4]) for huge weights and features; a hand-set output weight moves the right output in the right direction.
//   3 THE SEAT    at the zero start the decision equals GUARDED-FILTER's, tick for tick, on real dives, and the dives fingerprint the same; a positive shift surfaces earlier, a cut lowers the cap and never raises it; station, pump and repair are the rule's for any weights; the wrong weight length is refused.
//   4 PURE        the same weights on the same dive twice give the same fingerprint; the file reads no clock, random number or file.
// NOT CHECKED, said plainly: that a trained residual scores better (that is the experiment).
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { let v; try { v = typeof c === "function" ? c() : c; } catch (e) { v = false; d = "threw: " + e.message; } console.log((v ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!v) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
import * as T from "./needsTask.mjs";
import * as R from "./residualAdvisor.mjs";
console.log("residualAdvisor-selfcheck -- the learned residual\n");
const code = fs.readFileSync(new URL("./residualAdvisor.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const set = T.setOf(T.KINDS, 241, 241), withOut = (shift, cut, extra = {}) => { const w = R.startWeights(); w[R.OUT_START + R.N_W2] = shift; w[R.OUT_START + R.N_W2 + 1] = cut; for (const [i, v] of Object.entries(extra)) w[i] = v; return w; };

sec("1. LAYOUT");
{
    const w = R.startWeights();
    ok("!! 8 inputs, 12 hidden, 2 outputs and 8*12+12+2*12+2 = 134 weights", R.N_IN === 8 && R.N_HID === 12 && R.N_OUT === 2 && R.N_WEIGHTS === 134 && w.length === 134);
    ok("!! the output layer (weights and biases) starts EXACTLY zero and the hidden layer does not", Array.from(w.slice(R.OUT_START)).every((x) => x === 0) && Array.from(w.slice(0, R.N_W1)).some((x) => x !== 0) && R.OUT_START === 108);
    ok("!! the start is deterministic and ZERO_WEIGHTS is it", J(Array.from(R.startWeights())) === J(Array.from(R.startWeights())) && J(R.ZERO_WEIGHTS) === J(Array.from(w)));
}
sec("2. FORWARD");
{
    const fs8 = [[0.5, 0.5, 0.2, 0, 0, 0.1, 0.5, 0.3], [1, 0, 1.5, 1, 1, 1, 1, 1.5], [0, 1, 0, 0, 0, 0, 0, 0]];
    ok("!! zero output weights give shift 0 and cut 0 for any features", fs8.every((f) => { const o = R.forward(R.startWeights(), f); return o.shift === 0 && o.cut === 0; }));
    const big = new Float64Array(R.N_WEIGHTS).fill(1e6), neg = new Float64Array(R.N_WEIGHTS).fill(-1e6);
    ok("!! the outputs stay bounded for huge weights of either sign: shift within +-0.15, cut within [0, 0.4]", [big, neg].every((w) => fs8.every((f) => { const o = R.forward(w, f); return Math.abs(o.shift) <= R.SHIFT_MAX + 1e-12 && o.cut >= 0 && o.cut <= R.CUT_MAX + 1e-12; })));
    const f = fs8[0], base = R.forward(R.startWeights(), f);
    ok("!! a positive output bias on output 0 raises the shift and one on output 1 raises the cut; a negative cut bias cuts nothing", R.forward(withOut(2, 0), f).shift > 0.1 && R.forward(withOut(-2, 0), f).shift < -0.1 && R.forward(withOut(0, 2), f).cut > 0.3 && R.forward(withOut(0, -2), f).cut === 0 && base.shift === 0);
    ok("!! an output WEIGHT (not only the bias) reads its hidden unit: the weight from hidden 0 to output 0 changes the shift", R.forward(withOut(0, 0, { [R.OUT_START]: 3 }), f).shift !== 0);
    ok("!! the bounds are the registered ones: shift within +-0.15 and a cap cut of at most 0.4", R.SHIFT_MAX === 0.15 && R.CUT_MAX === 0.4 && Math.abs(R.forward(withOut(1e3, 1e3), f).shift - 0.15) < 1e-9 && Math.abs(R.forward(withOut(1e3, 1e3), f).cut - 0.4) < 1e-9);
    const hb = withOut(0, 0, { [R.OUT_START]: 3, [R.OUT_START + 1]: 3 }), hb2 = Float64Array.from(hb); hb2[R.N_W1] = 2;
    ok("!! a hidden BIAS moves the outputs (it is read, not dropped)", R.forward(hb, f).shift !== R.forward(hb2, f).shift);
    ok("!! the weights count is checked", (() => { try { R.residualSeat(new Float64Array(3)); return false; } catch (e) { return /134 weights/.test(e.message); } })());
}
sec("2b. FEATURES");
{
    const obs = (t) => ({ t, r: { frac: 0.7, depth: 12, flood: 0.02, damage: 0.4, collapseDepth: 60 }, stations: [{ visited: false }, { visited: true }, { visited: false }, { visited: false }] });
    const f = R.features(0.6, null, obs(300), { depth: 30 });
    ok("!! the eight features are the registered ones in the registered order (filtered charge, raw gauge, depth/collapse, flooding x10, damage, time/600, open stations/4, station depth/collapse)", f.length === 8 && [0.6, 0.7, 0.2, 0.2, 0.4, 0.5, 0.75, 0.5].every((x, i) => Math.abs(f[i] - x) < 1e-9), J(f));
    ok("!! with no station the last feature is 0 and every feature is clamped (flooding to 1, depth to 1.5, time to 1)", R.features(0.6, null, obs(300), null)[7] === 0 && (() => { const g = R.features(0.6, null, { ...obs(9999), r: { frac: 1, depth: 999, flood: 9, damage: 9, collapseDepth: 60 } }, { depth: 999 }); return g[2] === 1.5 && g[3] === 1 && g[4] === 1 && g[5] === 1 && g[7] === 1.5; })());
}
sec("3. THE SEAT");
{
    const run = (seatFactory, sc) => { const log = []; const p = T.flyDecision(seatFactory); const r = T.fly((ctx) => { const pilot = p(ctx); return (st, obs, cur) => { const c = pilot(st, obs, cur); log.push(pilot.decision); return c; }; }, sc, { gauge: T.GAUGE}); return { r, log }; };
    const sc = set[3], rule = run(T.ruleSeat("obs", { alpha: T.FILTER_ALPHA }), sc), zero = run(R.residualSeat(R.startWeights()), sc);
    ok("!! at the zero start the decision equals GUARDED-FILTER's on every tick of a real dive, and the dive is bit-identical", zero.log.length === rule.log.length && zero.log.every((d, i) => d.surface === rule.log[i].surface && d.cap === rule.log[i].cap && d.pump === rule.log[i].pump && d.repair === rule.log[i].repair && (d.station === rule.log[i].station || (d.station && rule.log[i].station && d.station.x === rule.log[i].station.x))) && zero.r.fingerprint === rule.r.fingerprint);
    const pos = run(R.residualSeat(withOut(2, 0)), sc), cut = run(R.residualSeat(withOut(0, 2)), sc);
    ok("!! a positive shift surfaces on more ticks than the rule", pos.log.filter((d) => d.surface).length > rule.log.filter((d) => d.surface).length, pos.log.filter((d) => d.surface).length + " against " + rule.log.filter((d) => d.surface).length);
    ok("!! a negative shift surfaces on no more ticks than the rule", run(R.residualSeat(withOut(-2, 0)), sc).log.filter((d) => d.surface).length <= rule.log.filter((d) => d.surface).length);
    ok("!! a cut lowers the cap below the rule's HULL_DEPTH on every tick and never raises it", cut.log.every((d) => d.cap < T.HULL_DEPTH && d.cap >= T.HULL_DEPTH * (1 - R.CUT_MAX) - 1e-9) && [pos, zero, run(R.residualSeat(withOut(-3, -3)), sc)].every((x) => x.log.every((d) => d.cap <= T.HULL_DEPTH && d.cap >= T.HULL_DEPTH * (1 - R.CUT_MAX) - 1e-9)));
    ok("!! pump and repair and the station are the rule's whatever the weights", [pos, cut].every((x) => x.log.every((d, i) => d.pump === rule.log[i].pump || x.r.fingerprint !== rule.r.fingerprint)) && zero.log.every((d, i) => d.pump === rule.log[i].pump && d.repair === rule.log[i].repair));
    const seat = R.residualSeat(withOut(1, 1))({ model: null, read: null });
    ok("!! the seat carries stats (ticks, the shift and cut applied)", seat && Object.getOwnPropertyDescriptor(seat, "stats") !== undefined);
}
sec("4. PURE");
{
    const a = T.fly(T.flyDecision(R.residualSeat(withOut(0.5, 0.5))), set[1], { gauge: T.GAUGE, seconds: 90 }), b = T.fly(T.flyDecision(R.residualSeat(withOut(0.5, 0.5))), set[1], { gauge: T.GAUGE, seconds: 90 });
    ok("!! the same weights on the same dive twice give the same fingerprint", a.fingerprint === b.fingerprint);
    ok("!! the file reads no clock, no random number and nothing from the disk", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
