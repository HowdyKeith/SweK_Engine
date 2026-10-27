// WebGLEngine/brain/pilotNeedsCircuit-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/pilotNeedsCircuit-selfcheck.mjs      (~8 s -- to be restated at ship)
//
// THE GATE OF brain/pilotNeedsCircuit.mjs: the piece 4 pilot of the survey run, registered in brain/NEEDS_AND_LIMITS.md ("Round 3", "Amendment 1", "Amendment 2") before it was written. Nothing is trained here; this holds the code the training will use.
//   1  CONSTANTS   21 features, 7 outputs, one reservoir step a second (30 ticks), 6 global + 5 per station, the scales, the cap residual, the surfacing gain 10, the switch gain 2 (Amendment 2), all frozen where they are records.
//   2  FEATURES    worked by hand on a state with a known heading and an observation with known readings: the six global numbers (charge, strain over 1.2, damage, flood x 10, depth/60, time/600), the five of a station (distance/200, cos and sin of the relative bearing, depth/60, visited), a missing station as zeros, clipping to
//                  [-1, 1] on every one, a bearing that wraps past pi, and the WITHHELD variant zeroing the first four and nothing else.
//   3  THE DECODE  with the input weights zeroed the cells stay silent and the outputs are the output bias exactly, so every branch is driven by a chosen residual: the surfacing score 10 (threshold - charge) + o0, the station argmax of -distance/200 + o_k (infeasible and visited stations never chosen, ties to the first), the cap
//                  0.9 + 0.05 o4, the pump and the repair at the rule value + 2 o (either way), the fixed last call, and that the decision reads the OBSERVATION's charge (the gauge), never the true one.
//   4  THE CIRCUIT the reservoir steps once a second and the outputs are HELD in between (29 held, the 30th calls updates); a pulse is remembered by the wiring and decays (persist), and not at all with NO STATE; the state starts at zero for every pilot made; the weights layout is 21 x inputs + cells + 1 + 7 x outputs + 7 (2,452 on the fly's
//                  heading loop); mutate changes 1 to 4 numbers, keeps sigma in [0, 1] and leaves its argument alone.
//   5  THE START   with every output at zero the pilot IS GUARDED-OBS, decision for decision and run for run (fingerprints and scores equal on four scenarios, one with the noisy gauge), which is what lets training start from the best stateless rule.
// NOT CHECKED, said plainly: that a trained pilot does anything useful (that is the experiment); the reservoir's numerical agreement with brain/pilotSubCircuitState.mjs beyond the structure shared (its own gate holds that).
//
// SABOTAGE LOG, 38 mutants of brain/pilotNeedsCircuit.mjs (each applied in place, this gate run, the file restored md5-identical; reds in brackets): the charge feature inverted [2], the strain cap [1], the flood scale [1], the time scale [1], visited inverted [2], cos and sin swapped [2], the bearing's dy sign [1+], the heading
// ignored in the bearing [1], no clipping [1], four needs features become five [3], 31 ticks a step [2], the surfacing gain [1], o0's sign [1], the station score's distance sign [3], visited stations allowed [3], the feasibility test dropped [2], ties to the last [1], the cap residual 0.5 [2], the switch gain 1 [3], the repair rule reversed [3], no last call [3], persistence
// ignored [1], sigma unclamped [1], ONE state shared by every pilot made [7], the true reading used instead of the observation's [2], the readout unclamped [1], the output bias ignored [5], the readout's row offset [2], the cell bias ignored [1], mutate touching 10 numbers [1] or the argument in place [1], the withheld variant off [2], the input gain [2].
// FIRST RUNS WENT 0 RED for four, and the rows were written because of them: sigma's clamp inside the update (only mutate clamped it), the readout's clamp, the readout's row offset (only output 0 had been read) and the cell bias (all zero in the other rows). A fifth was an EQUIVALENT and was deleted rather than kept: the wrap of the relative bearing (cos and sin are periodic, so wrapping changes nothing the features
// can see). Two registered clips are unreachable and said so: the cap residual's lower clip of 0.6 (the residual reaches 0.85 at most).
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as T from "./needsTask.mjs";
import * as P from "./pilotNeedsCircuit.mjs";
import * as L from "../tools/ship/trainSubState.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const near = (a, b, tol) => Math.abs(a - b) <= tol, J = JSON.stringify;
console.log("pilotNeedsCircuit-selfcheck -- the piece 4 pilot of the survey run\n");

const M = T.model(), cx = L.loadCircuit();
const cell = (i, nt = "Exc") => ({ id: i, layer: i, nt });
// a six-cell fixture: 0 -> 1 -> 2 -> 3 (a chain), 3 -> 4, 4 -> 5; cells 0 and 1 take the features, cells 0 and 5 give the outputs (cell 0 is both)
const FIXC = { neurons: [0, 1, 2, 3, 4, 5].map((i) => cell(i)), edges: [[0, 1, 3, 1], [1, 2, 4, 1], [2, 3, 2, 1], [3, 4, 5, 1], [4, 5, 1, 1]], io: { inputs: [0, 1], outputs: [0, 5] } };
const ctxOf = () => ({ model: M, read: () => { throw new Error("the seat must not read the true state"); } });
const stateAt = (x, y, depth, heading = 0) => { const s = S.createState({ depth, speed: 2, heading, model: M }); s.pos[0] = x; s.pos[1] = y; return { ...s, tank: S.initialTank(M) }; };
const q = (x, y, depth, visited = false) => ({ x, y, depth, visited });
const obsOf = (o = {}) => ({ t: 0, stations: [q(50, 0, 20)], ...o, r: { frac: 0.8, depth: 20, flood: 0, damage: 0, collapseDepth: 60, ...(o.r || {}) } });

sec("1. THE CONSTANTS");
ok("!! 21 features (6 global + 3 stations x 5), 7 outputs, one reservoir step every 30 ticks, 4 needs features", P.FEATURES === 21 && P.OUTPUTS === 7 && P.STEP_TICKS === 30 && P.GLOBALS === 6 && P.PER_STATION === 5 && P.GLOBALS + 3 * P.PER_STATION === P.FEATURES && P.NEEDS_FEATURES === 4);
ok("!! the scales are the registered ones (depth 60, time 600, distance 200, flood 10, strain at most 1.2), the cap residual 0.9 + 0.05 o clipped to [0.6, 0.95], the surfacing gain 10, the station scale 200 and the switch gain 2 (Amendment 2), the records frozen", P.SCALE.depth === 60 && P.SCALE.time === 600 && P.SCALE.dist === 200 && P.SCALE.flood === 10 && P.SCALE.strainMax === 1.2 && P.CAP_RESIDUAL.base === 0.9 && P.CAP_RESIDUAL.per === 0.05 && P.CAP_RESIDUAL.lo === 0.6 && P.CAP_RESIDUAL.hi === 0.95 && P.SURFACE_GAIN === 10 && P.STATION_SCALE === 200 && P.SWITCH_GAIN === 2 && Object.isFrozen(P.SCALE) && Object.isFrozen(P.CAP_RESIDUAL));

sec("2. THE FEATURES");
{
    const st = stateAt(0, 0, 30, 0), obs = obsOf({ t: 150, r: { frac: 0.7, depth: 30, flood: 0.05, damage: 0.4, collapseDepth: 45 }, stations: [q(100, 0, 30), q(0, 100, 45, true)] }), x = P.featuresOf(st, obs);
    const want = [0.7, (30 / 45) / 1.2, 0.4, 0.5, 0.5, 0.25, 0.5, 1, 0, 0.5, 0, 0.5, 0, -1, 0.75, 1, 0, 0, 0, 0, 0];
    ok("!! the 21 features of a worked state (heading 0, charge 0.7, depth 30 of a collapse at 45, flood 0.05, damage 0.4, t 150, a station 100 m dead ahead at 30 m and a visited one 100 m abeam to starboard at 45 m, the third absent)", x.length === 21 && want.every((v, i) => near(x[i], v, 1e-9)), x.map((v) => v.toFixed(3)).join(" "));
    const wrap = P.featuresOf(stateAt(0, 0, 30, 3.0), obsOf({ stations: [q(Math.cos(-3.0) * 50, -Math.sin(-3.0) * 50 * -1, 30)] }));
    const big = P.featuresOf(st, obsOf({ t: 900, r: { frac: 0.7, depth: 600, flood: 9, damage: 2, collapseDepth: 45 }, stations: [q(1000, 0, 600)] }));
    ok("!! every feature is clipped to [-1, 1]: a strain of 13, a flood of 9, a damage of 2, a depth of 600, a time of 900 and a station 1000 m away at 600 m read at most 1", big.every((v) => v >= -1 && v <= 1) && near(big[1], 1, 1e-9) && big[3] === 1 && big[2] === 1 && big[4] === 1 && big[5] === 1 && big[6] === 1 && big[9] === 1);
    const rel = (h, bx, by) => { const f = P.featuresOf(stateAt(0, 0, 30, h), obsOf({ stations: [q(bx, by, 30)] })); return Math.atan2(f[8], f[7]); };
    ok("!! the relative bearing wraps: a station dead ahead reads 0 whatever the heading is made of; a heading of 3.0 rad with a station at bearing -3.0 rad reads +0.283 (2 pi - 6) and not -6", near(rel(0, 100, 0), 0, 1e-9) && near(rel(3.0, Math.cos(-3.0) * 100, -Math.sin(-3.0) * 100), 2 * Math.PI - 6, 1e-6), `${rel(3.0, Math.cos(-3.0) * 100, -Math.sin(-3.0) * 100).toFixed(4)}`);
    const wh = P.featuresOf(st, obs, undefined, { withheld: true });
    ok("!! the WITHHELD variant zeroes exactly the first four features (charge, strain, damage, flood) and no other", [0, 1, 2, 3].every((i) => wh[i] === 0) && [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].every((i) => wh[i] === x[i]));
    ok("!! a missing station reads zeros in all five of its slots, and the third station is read from its own slots (index 16..20)", [16, 17, 18, 19, 20].every((i) => x[i] === 0) && P.featuresOf(st, obsOf({ stations: [q(1, 1, 1), q(2, 2, 2), q(100, 0, 30, true)] }))[20] === 1);
}

sec("3. THE DECODE (input weights zeroed: the outputs are the output bias exactly)");
{
    const pol = P.createNeedsPolicy(FIXC, "fix"), mk = (y) => { const w = pol.handWeights(); for (let i = 0; i < pol.offsets.B; i++) w[i] = 0; for (let o = 0; o < 7; o++) w[pol.offsets.B2 + o] = y[o] || 0; return pol.seatFor(w)(ctxOf()); };
    const st = stateAt(0, 0, 20), sf = (y, o) => mk(y)(st, obsOf(o));
    ok("!! the surfacing score is 10 (threshold(depth) - charge) + o0: at 20 m (threshold 0.3) and a charge of 0.33 the rule alone stays down, o0 = +1 surfaces (0.7 > 0), o0 = -1 at a charge of 0.25 does NOT surface (-0.5)", sf([], { r: { frac: 0.33 } }).surface === false && sf([1], { r: { frac: 0.33 } }).surface === true && sf([], { r: { frac: 0.25 } }).surface === true && sf([-1], { r: { frac: 0.25 } }).surface === false);
    ok("!! the surfacing threshold is a function of the DEPTH: at 1 m (threshold 0.55) a charge of 0.5 surfaces and 0.6 does not, and the charge read is the OBSERVATION's (the seat never touches the true state: ctx.read throws)", sf([], { r: { frac: 0.5, depth: 1 } }).surface === true && sf([], { r: { frac: 0.6, depth: 1 } }).surface === false);
    const A = q(50, 0, 20), B = q(100, 0, 20), C = q(5, 0, 58), V = q(1, 1, 20, true);
    ok("!! the station is the argmax of -distance/200 + o_k: the nearer wins at zero residual; o2 = +0.5 makes the farther one (-0.5 + 0.5 = 0 against -0.25) win; o1 = +1 on the nearer keeps it", sf([], { stations: [A, B] }).station === A && sf([0, 0, 0.5], { stations: [A, B] }).station === B && sf([0, 1, 0.5], { stations: [A, B] }).station === A);
    ok("!! an infeasible station (58 m on a collapse at 60) and a visited one are never chosen, whatever the residual; none left -> no station and the decision is to surface; ties go to the first", sf([0, 1, 1, 1], { stations: [C, V] }).station === null && sf([0, 1, 1, 1], { stations: [C, V] }).surface === true && sf([0, 1, 1, 1], { stations: [C, B, V] }).station === B && sf([0, 0, 0], { stations: [q(50, 0, 20), q(-50, 0, 20)] }).station.x === 50);
    ok("!! the cap is 0.9 + 0.05 o4: 0.9 at zero, 0.95 at +1, 0.85 at -1", near(sf([], {}).cap, 0.9, 1e-12) && near(sf([0, 0, 0, 0, 1], {}).cap, 0.95, 1e-12) && near(sf([0, 0, 0, 0, -1], {}).cap, 0.85, 1e-12));
    ok("!! the pump is the rule (flood over 0.001 and charge over 0.1) plus 2 o5 either way: off with no flood, ON with no flood at o5 = +1, ON with flood at zero, OFF with flood at o5 = -1, and the rule's charge floor holds at zero", sf([], {}).pump === false && sf([0, 0, 0, 0, 0, 1], {}).pump === true && sf([], { r: { flood: 0.01 } }).pump === true && sf([0, 0, 0, 0, 0, -1], { r: { flood: 0.01 } }).pump === false && sf([], { r: { flood: 0.01, frac: 0.05 } }).pump === false);
    const surf = stateAt(0, 0, 1);
    ok("!! the repair is the rule (at the surface, damaged, charge over 0.1) plus 2 o6 either way: ON at the surface when damaged, OFF when o6 = -1, OFF at depth, ON at depth at o6 = +1", mk([])(surf, obsOf({ r: { depth: 1, damage: 0.2 } })).repair === true && mk([0, 0, 0, 0, 0, 0, -1])(surf, obsOf({ r: { depth: 1, damage: 0.2 } })).repair === false && sf([], { r: { damage: 0.2 } }).repair === false && sf([0, 0, 0, 0, 0, 0, 1], { r: { damage: 0.2 } }).repair === true);
    ok("!! the fixed last call forces the surface whatever the outputs (t 590 at 0 m depth): o0 = -1 does not stop it", mk([-1])(stateAt(0, 0, 0.5), obsOf({ t: 590, r: { depth: 0.5, frac: 0.9 }, stations: [A] })).surface === true);
}

sec("4. THE CIRCUIT");
{
    const pol = P.createNeedsPolicy(FIXC, "fix"), W = pol.handWeights(), clean = () => { const w = Float32Array.from(W); for (let i = 0; i < pol.offsets.B; i++) w[i] = 0; for (let i = 0; i < 6; i++) w[pol.offsets.B + i] = 0; return w; };
    ok("!! the weights layout: 21 x inputs + cells + 1 + 7 x outputs + 7 (fixture 21 x 2 + 6 + 1 + 7 x 2 + 7 = 70; the fly's heading loop 2,452)", pol.WEIGHT_COUNT === 70 && pol.offsets.B === 42 && pol.offsets.SIGMA === 48 && pol.offsets.W2 === 49 && pol.offsets.B2 === 63 && P.createNeedsPolicy(cx, "cx").WEIGHT_COUNT === 2452 && P.createNeedsPolicy(cx, "cx").handWeights().length === 2452);
    // feature 0 (the charge) -> input cell 0 (which is also output cell 0); readout 0 reads output cell 0
    const w = clean(); w[0 * 21 + 0] = 1; w[pol.offsets.W2 + 0 * 2 + 0] = 1; w[pol.offsets.SIGMA] = 1;
    const seat = pol.seatFor(w)(ctxOf()), st = stateAt(0, 0, 20), ys = [];
    for (let i = 0; i < 61; i++) { seat(st, obsOf({ r: { frac: i < 30 ? 0.2 : i < 60 ? 0.4 : 0.9 } })); ys.push(seat.outputs[0]); }
    ok("!! the reservoir steps ONCE A SECOND and the outputs are HELD in between: o0 reads the charge of the first call (0.2) for 30 calls, the charge of the 31st (0.4) for the next 30, then the 61st (0.9); three updates in 61 calls", near(ys[0], 0.2, 1e-6) && ys.slice(0, 30).every((v) => v === ys[0]) && near(ys[30], 0.4, 1e-6) && ys.slice(30, 60).every((v) => v === ys[30]) && near(ys[60], 0.9, 1e-6) && seat.steps === 3, `${ys[0].toFixed(3)} ${ys[30].toFixed(3)} ${ys[60].toFixed(3)}`);
    // memory: a pulse into cell 0 at step 0, nothing after; readout from cell 5 (output 1), five links down the chain
    const wm = clean(); wm[0 * 21 + 0] = 1; wm[pol.offsets.W2 + 0 * 2 + 1] = 1; wm[pol.offsets.SIGMA] = 1;
    const run = (persist) => { const sp = P.createNeedsPolicy(FIXC, "fix", { persist }).stepper(wm), xs = new Float64Array(21), out = []; xs[0] = 1; for (let t = 0; t < 8; t++) { out.push(sp.step(xs)[0]); xs[0] = 0; } return out; };
    const mem = run(true), none = run(false);
    ok("!! the wiring REMEMBERS a pulse: the signal fed into cell 0 at step 0 reaches output cell 5 five steps later (a delay of five links) and not before; with NO STATE it never arrives", mem.slice(0, 5).every((v) => v === 0) && mem[5] > 0 && none.every((v) => v === 0), `${mem.map((v) => v.toFixed(2)).join(" ")}`);
    const w2 = clean(); w2[0 * 21 + 0] = 1; w2[pol.offsets.W2 + 0 * 2 + 0] = 1; w2[pol.offsets.SIGMA] = 0.5;
    const spA = P.createNeedsPolicy(FIXC, "fix").stepper(w2), spB = P.createNeedsPolicy(FIXC, "fix").stepper(w2), xs = new Float64Array(21); xs[0] = 1; spA.step(xs); spA.step(xs);
    const fresh = spB.step(xs)[0], seatA = pol.seatFor(w2)(ctxOf()), seatB = pol.seatFor(w2)(ctxOf()); seatA(stateAt(0, 0, 20), obsOf({ r: { frac: 0.9 } }));
    ok("!! the state starts at ZERO for every pilot made: a second stepper (or seat) built from the same weights is not changed by the first one's history", near(fresh, 1, 1e-6) && (seatB(stateAt(0, 0, 20), obsOf({ r: { frac: 0.9 } })), seatB.outputs[0] === seatA.outputs[0]));
    const wi = clean(); wi[0 * 21 + 0] = 1; wi[0 * 21 + 4] = 1; wi[pol.offsets.W2 + 0 * 2 + 0] = 1;
    const norm = pol.seatFor(wi)(ctxOf()), wd = P.createNeedsPolicy(FIXC, "fix", { withheld: true }).seatFor(wi)(ctxOf()), stA = stateAt(0, 0, 20), ob = obsOf({ r: { frac: 0.5, depth: 30, collapseDepth: 60 } });
    norm(stA, ob); wd(stA, ob);
    ok("!! the WITHHELD pilot is blind to the charge (feature 0 reads 0) and still sees the depth (feature 4): o0 = charge + depth/60 = 1.0 for the normal pilot and 0.5 for the withheld one", near(norm.outputs[0], 1.0, 1e-6) && near(wd.outputs[0], 0.5, 1e-6), `${norm.outputs[0].toFixed(3)} / ${wd.outputs[0].toFixed(3)}`);
    // the readout's own wiring: output o reads output cell j with W_out[o][j] (row-major, NO per row), the bias of the cell and the output bias are added, and the output is clamped to [-1, 1]
    const wr = clean(); wr[0 * 21 + 0] = 1; wr[pol.offsets.W2 + 2 * 2 + 1] = 1; wr[pol.offsets.B + 5] = 0.3; wr[pol.offsets.B2 + 3] = -0.4;
    const yr = pol.stepper(wr).step(Float64Array.from([1, ...new Array(20).fill(0)]));
    ok("!! the readout is row-major and adds the cell bias and the output bias: W_out[2][1] reads output cell 5 (bias 0.3, silent) -> o2 = 0.3, nothing leaks into o0, o1, o4, o5, o6, and b_out[3] = -0.4 gives o3", near(yr[2], 0.3, 1e-6) && near(yr[3], -0.4, 1e-6) && [0, 1, 4, 5, 6].every((o) => yr[o] === 0), [...yr].map((v) => v.toFixed(2)).join(" "));
    const wl = clean(); wl[0 * 21 + 0] = 1; wl[pol.offsets.W2 + 0 * 2 + 0] = 50; wl[pol.offsets.B2 + 1] = -70;
    const yl = pol.stepper(wl).step(Float64Array.from([1, ...new Array(20).fill(0)]));
    ok("!! the outputs are clamped to [-1, 1] (a readout of 50 and a bias of -70 read +1 and -1)", yl[0] === 1 && yl[1] === -1);
    const sg = (v) => { const w = clean(); w[0 * 21 + 0] = 1; w[pol.offsets.W2 + 1 * 2 + 1] = 1; w[pol.offsets.SIGMA] = v; const sp = pol.stepper(w), x = new Float64Array(21); x[0] = 1; const out = []; for (let t = 0; t < 7; t++) { out.push(sp.step(x)[1]); x[0] = 0; } return out; };
    ok("!! sigma is clamped to [0, 1] inside the update: a trained value of 1.5 acts as 1 (the chain's pulse arrives whole) and -0.5 as 0 (it never arrives)", near(sg(1.5)[5], sg(1)[5], 1e-9) && sg(1)[5] > 0 && sg(-0.5).every((v) => v === 0));
    const wc = P.createNeedsPolicy(FIXC, "fix"), a = wc.handWeights(), rng = (() => { let s = 12345; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })(), m = wc.mutate(a, 0.3, rng), diff = [...m].filter((v, i) => v !== a[i]).length;
    ok("!! mutate changes 1 to 4 numbers (more only by the sigma clamp), leaves its argument alone, and keeps sigma in [0, 1] even when pushed far", diff >= 1 && diff <= 5 && J([...a]) === J([...wc.handWeights()]) && (() => { let w = a; for (let i = 0; i < 400; i++) w = wc.mutate(w, 5, rng); return w[wc.offsets.SIGMA] >= 0 && w[wc.offsets.SIGMA] <= 1; })());
}

sec("5. THE START: ALL OUTPUTS ZERO IS GUARDED-OBS");
{
    const pol = P.createNeedsPolicy(cx, "cx"), w = pol.handWeights(), cases = [["far", 503, null], ["both", 501, T.GAUGE], ["deep", 502, null], ["plain", 501, T.GAUGE]], bad = [];
    for (const [kind, seed, gauge] of cases) { const a = T.fly(pol.pilotFor(w), T.scenario(seed, kind), { gauge }), b = T.fly(T.GUARDED_OBS, T.scenario(seed, kind), { gauge }); if (a.fingerprint !== b.fingerprint || a.score !== b.score) bad.push(`${kind}:${seed}${gauge ? "+gauge" : ""}`); }
    ok("!! the untrained pilot (the real circuit, hand weights, readout at zero) is GUARDED-OBS run for run: same fingerprints and scores on far 503, both 501 with the noisy gauge, deep 502 and plain 501 with the noisy gauge", bad.length === 0, bad.join(", "));
    const ns = P.createNeedsPolicy(cx, "cx", { persist: false }), wh = P.createNeedsPolicy(cx, "cx", { withheld: true }), c = T.scenario(503, "far");
    ok("!! the NO STATE and WITHHELD variants start as the same rule (a zero readout leaves nothing to differ)", T.fly(ns.pilotFor(ns.handWeights()), c).fingerprint === T.fly(T.GUARDED_OBS, c).fingerprint && T.fly(wh.pilotFor(wh.handWeights()), c).fingerprint === T.fly(T.GUARDED_OBS, c).fingerprint);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
process.exit(fails ? 1 : 0);
