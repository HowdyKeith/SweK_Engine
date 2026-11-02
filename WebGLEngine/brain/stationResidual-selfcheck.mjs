// WebGLEngine/brain/stationResidual-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/stationResidual-selfcheck.mjs      (about 5-10 s)
//
// THE GATE OF brain/stationResidual.mjs (Round 10 of brain/NEEDS_AND_LIMITS.md, registered first).
//   1 LAYOUT    8 inputs, 8 hidden, 1 output, 81 weights, the output weights and bias start EXACTLY zero, SCALE 100 m.
//   2 FEATURES  the eight features in the registered order on a fixture, clamped; the net's extra is 0 at the start, bounded to [-1, 1], moves with a hand-set output weight; the linear preference is a x depth + b x cluster clipped to [-1, 1].
//   3 CHOICE    (fixtures) with no preference the first nearest open feasible station is chosen, ties to the first; visited and infeasible stations are never chosen; none open gives null and a surface; a linear preference can override the distance and a weaker one cannot; the score is -distance + 100 x extra; a net's output changes the choice.
//   4 DIVES     nearest-first and the net at its zero start equal the tuned rule dive for dive on real dives; a trained-looking net changes a dive; stats count switches; pump, repair, cap and surfacing are the tuned rule's.
//   5 PURE      same inputs, same dive; the wrong weight count is refused; no clock, random or file.
// NOT CHECKED, said plainly: that any learned preference scores better (that is the experiment).
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
import * as U from "./tunedRule.mjs";
import * as S from "./stationResidual.mjs";
console.log("stationResidual-selfcheck -- the station-choice residual\n");
const code = fs.readFileSync(new URL("./stationResidual.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const R8 = { alpha: 0.001, low: 0.38036, high: 0.68938, ramp: 20, cap: 0.88615 };
const st0 = { pos: [0, 0, -12] };
const obsOf = (stations, o = {}) => ({ t: 100, r: { frac: 0.9, depth: 12, collapseDepth: 100, flood: 0, damage: 0, ...o }, stations: stations.map((s) => ({ visited: false, ...s })) });
const pick = (params, choice, stations, o = {}) => { const seat = S.stationSeat(params, choice)({ model: null, read: null }); return seat(st0, obsOf(stations, o)); };
const withOut = (bias, hid0) => { const w = S.startWeights(); w[S.OUT_START + S.N_W2] = bias; if (hid0 !== undefined) w[S.OUT_START] = hid0; return w; };

sec("1. LAYOUT");
{
    const w = S.startWeights();
    ok("!! 8 inputs, 8 hidden, 1 output, 8*8+8+8+1 = 81 weights, SCALE 100 m", S.N_IN === 8 && S.N_HID === 8 && S.N_WEIGHTS === 81 && w.length === 81 && S.SCALE === 100);
    ok("!! the output weights and bias (indices 72-80) start EXACTLY zero and the hidden layer does not", S.OUT_START === 72 && Array.from(w.slice(S.OUT_START)).every((x) => x === 0) && Array.from(w.slice(0, S.OUT_START - S.N_B1)).some((x) => x !== 0));
}
sec("2. FEATURES");
{
    const A = { x: 60, y: 80, depth: 20 }, B = { x: 200, y: 0, depth: 50 }, open = [A, B];
    const f = S.features(st0, obsOf([A, B], { collapseDepth: 100 }), 0.6, A, open, 100, true);
    ok("!! the eight features in order: distance/200, distance over the nearest's, depth/collapse, time left, filtered charge, is-current, open/4, nearest-other/200", f.length === 8 && [0.5, 0.25, 0.2, 1 - 100 / 600, 0.6, 1, 0.5, Math.hypot(140, 80) / 200].every((x, i) => Math.abs(f[i] - x) < 1e-9), J(f));
    const g = S.features(st0, obsOf([A], { collapseDepth: 100 }), 0.6, A, [A], 100, false);
    ok("!! with no other open station the last feature is 0; is-current is 0 when it was not the choice", g[7] === 0 && g[5] === 0 && g[6] === 0.25);
    const far = { x: 9999, y: 0, depth: 999 }, h = S.features(st0, obsOf([far], { collapseDepth: 100 }), 5, far, [far], 1, false);
    ok("!! the features are clamped (distance to 3, depth to 1.5, relative distance to 4/4)", h[0] === 3 && h[2] === 1.5 && h[1] === 1);
    ok("!! netExtra is exactly 0 at the zero start for any features", [f, g, h].every((x) => S.netExtra(S.startWeights(), x) === 0));
    ok("!! netExtra is bounded to [-1, 1] for huge weights and moves with a hand-set bias", [1e6, -1e6].every((v) => { const e = S.netExtra(new Float64Array(81).fill(v), f); return e >= -1 && e <= 1; }) && S.netExtra(withOut(2), f) > 0.9 && S.netExtra(withOut(-2), f) < -0.9);
    ok("!! an output WEIGHT (not only the bias) is read: the weight from hidden 0 changes the extra", S.netExtra(withOut(0, 3), f) !== 0);
    ok("!! linExtra is a x depth-fraction + b x cluster feature, clipped to [-1, 1]", Math.abs(S.linExtra({ a: 1, b: 0 }, f) - 0.2) < 1e-12 && Math.abs(S.linExtra({ a: 0, b: -1 }, f) - -Math.hypot(140, 80) / 200) < 1e-12 && S.linExtra({ a: 1, b: 1 }, [0, 0, 1.5, 0, 0, 0, 0, 3]) === 1 && S.linExtra({ a: -1, b: -1 }, [0, 0, 1.5, 0, 0, 0, 0, 3]) === -1);
}
sec("3. CHOICE");
{
    const near = { x: 50, y: 0, depth: 12 }, mid = { x: 0, y: 90, depth: 12 }, deep = { x: 80, y: 0, depth: 60 };
    ok("!! nearest-first (no preference) chooses the nearest open feasible station", pick(R8, null, [mid, near, deep]).station.x === 50 && pick(R8, {}, [mid, near, deep]).station.x === 50);
    ok("!! equal distances go to the FIRST in the list (the strict maximum), as needsTask.nearestFeasible", pick(R8, null, [{ x: 30, y: 40, depth: 12 }, { x: -30, y: -40, depth: 12 }]).station.x === 30 && pick(R8, null, [{ x: -30, y: -40, depth: 12 }, { x: 30, y: 40, depth: 12 }]).station.x === -30);
    ok("!! visited stations are never chosen; an infeasible one (too deep for the collapse depth) is never chosen", pick(R8, null, [{ ...near, visited: true }, mid]).station.y === 90 && pick(R8, null, [{ x: 10, y: 0, depth: 99 }, mid], { collapseDepth: 50 }).station.y === 90);
    const none = pick(R8, null, [{ ...near, visited: true }, { ...mid, visited: true }]);
    ok("!! with none open the station is null and the seat asks to surface", none.station === null && none.surface === true);
    ok("!! a linear preference for DEPTH (a = 1: +100 m x 0.6) overrides a 30 m distance gap (deep is 80 m away against 50 m)", pick(R8, { lin: { a: 1, b: 0 } }, [near, deep]).station.x === 80 && pick(R8, { lin: { a: 0.3, b: 0 } }, [near, deep]).station.x === 50);
    ok("!! a negative depth preference pushes away from the deep station even when it is nearer", pick(R8, { lin: { a: -1, b: 0 } }, [{ x: 50, y: 0, depth: 55 }, { x: 70, y: 0, depth: 12 }]).station.x === 70);
    ok("!! the score is -distance + 100 x extra: a net with a constant extra changes nothing, a net that rewards depth (hidden 2 reads depth) reaches the far deep station", pick(R8, { w: withOut(1.5) }, [mid, near, deep]).station.x === 50);
    const w = S.startWeights(); w.fill(0, 0, S.OUT_START); w[2 * S.N_IN + 2] = 1; w[S.OUT_START + 2] = 1;
    ok("!! a hand-wired net reading the depth feature (one hidden unit, positive output weight) prefers the deeper station like the linear preference", pick(R8, { w }, [near, deep]).station.x === 80, J(pick(R8, { w }, [near, deep]).station));
    ok("!! a wrong weight count is refused", (() => { try { S.stationSeat(R8, { w: new Float64Array(5) }); return false; } catch (e) { return /81 weights/.test(e.message); } })());
}
{
    const near = { x: 50, y: 0, depth: 12 }, far2 = { x: 400, y: 0, depth: 12 };
    const two = S.stationSeat(R8, null)({}); two(st0, obsOf([near], { frac: 0.9, flood: 0.01, damage: 0.2 })); const d2 = two(st0, obsOf([near], { frac: 0.05, flood: 0.01, damage: 0.2 }));
    ok("!! pump follows the FILTERED charge: after a 0.9 reading a raw 0.05 gauge does not switch the pump off (the average is still above 0.1)", d2.pump === true);
    const dive = S.stationSeat(R8, null)({})({ pos: [0, 0, -12] }, obsOf([near], { frac: 0.9, flood: 0.01, damage: 0.2 })), top = S.stationSeat(R8, null)({})({ pos: [0, 0, -1] }, obsOf([near], { frac: 0.9, flood: 0.01, damage: 0.2 }));
    ok("!! repair only at the surface (depth under RETURN_DEPTH) with damage and charge; the pump needs flooding", dive.repair === false && top.repair === true && dive.pump === true && S.stationSeat(R8, null)({})(st0, obsOf([near], { frac: 0.9, flood: 0, damage: 0 })).pump === false);
    const w = S.startWeights(); w.fill(0, 0, S.OUT_START); w[5] = 1; w[S.OUT_START] = 1;   // hidden 0 reads the is-current feature; output 1: +100 x tanh(tanh(1)) = about +64 m for the current choice
    const A2 = { x: 50, y: 0, depth: 12 }, B2 = { x: 60, y: 0, depth: 12 }, keep = S.stationSeat(R8, { w })({}), plain2 = S.stationSeat(R8, null)({});
    keep(st0, obsOf([A2, B2])); plain2(st0, obsOf([A2, B2]));
    const stNear = { pos: [56, 0, -12] };
    ok("!! the is-current feature gives the net a memory of its choice: a +64 m bonus keeps station A when B becomes 2 m nearer, where nearest-first switches", keep(stNear, obsOf([A2, B2])).station.x === 50 && plain2(stNear, obsOf([A2, B2])).station.x === 60);
    const sw = S.stationSeat(R8, null)({}); sw(st0, obsOf([A2, B2])); const first = sw.stats.switches; sw(stNear, obsOf([A2, B2]));
    ok("!! stats.switches counts changes from one chosen station to another: 0 after the first choice, 1 after a switch", first === 0 && sw.stats.switches === 1 && sw.stats.ticks === 2);
}
sec("4. DIVES");
{
    const sc = T.scenario(272, "far"), rule = T.fly(T.flyDecision(U.tunedSeat(R8, U.WIDE_BOUNDS)), sc, { gauge: T.GAUGE });
    const fp = (choice) => T.fly(T.flyDecision(S.stationSeat(R8, choice)), sc, { gauge: T.GAUGE }).fingerprint;
    ok("!! nearest-first and the net at its zero start equal the tuned rule dive for dive", fp(null) === rule.fingerprint && fp({ w: S.startWeights() }) === rule.fingerprint);
    const w = S.startWeights(); for (let i = S.OUT_START; i < S.N_WEIGHTS; i++) w[i] = 0.9 * Math.sin(3 + i);
    ok("!! a net with non-zero output weights flies a different dive; so does a linear preference", fp({ w }) !== rule.fingerprint && fp({ lin: { a: 1, b: -1 } }) !== rule.fingerprint);
    const log = []; T.fly((ctx) => { const seat = S.stationSeat(R8, { lin: { a: 1, b: -1 } })(ctx), p = T.flyDecision(() => seat)(ctx); return (st, obs, cur) => { const c = p(st, obs, cur); log.push(p.decision); return c; }; }, sc, { gauge: T.GAUGE });
    const ruleLog = []; T.fly((ctx) => { const p = T.flyDecision(U.tunedSeat(R8, U.WIDE_BOUNDS))(ctx); return (st, obs, cur) => { const c = p(st, obs, cur); ruleLog.push(p.decision); return c; }; }, sc, { gauge: T.GAUGE });
    ok("!! the cap is the tuned rule's on every tick whatever the preference (surfacing, pump and repair come from the same filter and trip)", log.every((d) => d.cap === U.normalise(R8, U.WIDE_BOUNDS).cap) && log.length > 100 && ruleLog.length > 100);
    const seat = S.stationSeat(R8, { lin: { a: 1, b: -1 } })({}); const o1 = obsOf([{ x: 50, y: 0, depth: 12 }, { x: 0, y: 90, depth: 40 }]);
    seat(st0, o1); seat(st0, o1); seat(st0, obsOf([{ x: 50, y: 0, depth: 12, visited: true }, { x: 0, y: 90, depth: 40 }]));
    ok("!! stats count ticks and station switches (a switch is a change from one chosen station to another)", seat.stats.ticks === 3 && seat.stats.switches >= 0 && S.stationSeat(R8, null)({}).stats.ticks === 0);
}
sec("5. PURE");
{
    const sc = T.scenario(281, "both"), w = S.startWeights(); for (let i = S.OUT_START; i < S.N_WEIGHTS; i++) w[i] = 0.5 * Math.cos(i);
    const a = T.fly(T.flyDecision(S.stationSeat(R8, { w })), sc, { gauge: T.GAUGE }), b = T.fly(T.flyDecision(S.stationSeat(R8, { w })), sc, { gauge: T.GAUGE });
    ok("!! the same weights on the same dive twice give the same fingerprint", a.fingerprint === b.fingerprint);
    ok("!! the file reads no clock, no random number and nothing from the disk", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
