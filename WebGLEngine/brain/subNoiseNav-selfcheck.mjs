// WebGLEngine/brain/subNoiseNav-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/subNoiseNav-selfcheck.mjs      (about 20 s: arithmetic, the noise, the filter, and a few dozen real flights)
//
// THE MODULE OF THE ESTIMATE WITH NOISE (brain/subNoiseNav.mjs), held to its word before any seed of HELD14 is flown ("FOLLOW-UP 14" in brain/SUB_FIELD_NAV_WIP.md):
//   1  THE CONSTANTS   the observation interval, the filter's two numbers, the noise levels, the ten arms and their order, the designated arm, the sets (disjoint from every other navigation set)
//   2  THE NOISE       a standard normal draw that is a pure function of (seed, ship, observation, axis), mean 0 and standard deviation 1, no correlation across observations or axes, none repeated; observe()
//   3  THE FILTER      one Kalman step against an independent hand computation, a noiseless track held to a millimetre, a noisy track filtered below the difference's error, sigma 0 the control
//   4  THE ARMS        the names that parse (kf@s, diff@s and replan@s for any s of 0 or more), the fixed ones, and the ones that do not
//   5  THE FLIGHTS     the controls (exact, nominal and replan are subReactNav's flights; in react-none the noiseless diff and kf are the nominal arm's, which are flyHard's), the noise reaches the planner,
//                      the record, the velocity error (the filter's below the difference's, the difference's growing with sigma), determinism, unknown names throw
//
// SABOTAGE LOG (serial mutation pass of brain/subNoiseNav.mjs, one mutant per code line and operator, at most four of each operator on a line): 202 mutants; 148 red on the first pass and 54 survivors. Section 6 was added
//   (the noise stream pinned to six draws, a second hand-computed Kalman step with the covariance cross term, quantile exported and tested, a 2 s timeout, the replan count, the record's reached, chord, hit and left fields,
//   five noisy flights pinned) and the 54 were run again: 32 red, 22 left, and a row for one of the 22 (the quantile's cap, q above 1) was added after it, which kills it. 21 LEFT, said plainly, none of them a fault found:
//   EQUIVALENT (14): `seabed: 1000` -> 1001 (no flight is within hundreds of metres of it); the 1e-12 floor of sigma squared -> 1e-13 (not observable at the control's micrometre); the 1-tick floors of `every` and `obsTicks`
//   -> 2 (the registered intervals are 90 and 30 ticks); the initial `now = 0` and `tick = 0` -> 1 (both are rewritten at the top of the first tick); `i > 0` -> `i > 1` in the replan test (no multiple of 90 is 1);
//   `<` -> `<=` at an exact equality of two real numbers in `clear < minClear`, in `clear < 0` and in the hit lookup's `< 0`, and in the four edge tests of the region (x < x0, y < y0, x > x1, y > y1).
//   NOT REACHED, not equivalent (7): the no-route branch (`<` -> `<=` of N.BIG, `&&` -> `||`, `: false` -> `: true`: no scenario of this family has no route, and the DEV, HELD6 and control flights show none); the first
//   clearance's time 0 -> 1 (the least clearance never falls at the first tick); the hit lookup's depth argument (`-s.pos[2]` -> `[3]`) and its `< 0` -> `< 1` (the obstacle struck is the only one within a metre in every
//   fixture); and `x > x1 || y < y0` -> `&&` (no flight of 40 scenarios, 5 arms and 3 behaviours leaves through the east edge, the goal being inside it).
//   NOT CHECKED, said plainly: that the filter helps the planner (that is the study's test, C1 to C3); the module only holds that each belief is the one registered and that the controls are the flights they must be.
"use strict";
import * as NZ from "./subNoiseNav.mjs";
import * as R from "./subReactNav.mjs";
import * as H from "./subHardNav.mjs";
import * as AP from "./autopilotSub.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pilot = (s, t, c) => AP.decide(s, t, c);
const key = (r) => `${r.status}/${r.ticks}/${Number(r.path).toFixed(6)}`;
const msg = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
console.log("subNoiseNav-selfcheck -- the estimate with noise\n");

console.log("1. THE CONSTANTS");
{
    ok("!! observed once a second; the filter's acceleration noise is the stopping ship's own 0.5 m/s squared (subReactNav.STOP_ACCEL), the start velocity's standard deviation 1 m/s", NZ.OBS_S === 1 && NZ.SIGMA_A === 0.5 && NZ.SIGMA_A === R.STOP_ACCEL && NZ.V0 === 1);
    ok("!! the noise levels are 1.5, 3 and 6 m, frozen", same(NZ.SIGMAS, [1.5, 3, 6]) && Object.isFrozen(NZ.SIGMAS));
    ok("!! the three belief arms are named as the react study names them: the nominal arm any+predict+edge+yield, the exact estimate est+predict+edge+yield, the reference any+replan", NZ.NOMINAL === "any+predict+edge+yield" && NZ.EXACT === R.DESIGNATED && NZ.NOMINAL === R.NOMINAL_ARM && NZ.REFERENCE === "any+replan");
    ok("!! the ten arms, in order, frozen; the designated arm is kf@3", same(NZ.NOISE_ARMS, ["any+replan", "replan@3", "any+predict+edge+yield", "est+predict+edge+yield", "diff@1.5", "diff@3", "diff@6", "kf@1.5", "kf@3", "kf@6"]) && Object.isFrozen(NZ.NOISE_ARMS) && NZ.DESIGNATED === "kf@3" && NZ.NOISE_ARMS.includes(NZ.DESIGNATED));
    ok("!! HELD14 is seeds 14,001 to 14,060 (60) and the sets are dev (subHardNav's) and held14", NZ.HELD14.length === 60 && NZ.HELD14[0] === 14001 && NZ.HELD14[59] === 14060 && NZ.SETS.dev === H.HARD_SETS.dev && NZ.SETS.held14 === NZ.HELD14 && Object.isFrozen(NZ.HELD14));
    ok("!! no seed of HELD14 is one of the sets this series or main already read (subReactNav's HELD6, subHardNav's dev and held4)", !NZ.HELD14.some((s) => R.HELD6.includes(s) || H.HARD_SETS.dev.includes(s) || H.HARD_SETS.held4.includes(s)) && NZ.HELD14.every((s) => s > 14000));
}

console.log("\n2. THE NOISE");
{
    const g = NZ.gauss(14001, 2, 5, 1);
    ok("!! a draw is a pure function of (seed, ship, observation, axis): the same arguments give the same number, and changing any one changes it", NZ.gauss(14001, 2, 5, 1) === g && [NZ.gauss(14002, 2, 5, 1), NZ.gauss(14001, 3, 5, 1), NZ.gauss(14001, 2, 6, 1), NZ.gauss(14001, 2, 5, 0)].every((x) => x !== g));
    const N = 100000, xs = Array.from({ length: N }, (_, i) => NZ.gauss(14001, 1, i, 0)), mean = xs.reduce((a, b) => a + b, 0) / N, sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / N);
    ok("!! 100,000 draws are standard normal: mean within 0.02 of 0 and standard deviation within 3 percent of 1", Math.abs(mean) < 0.02 && Math.abs(sd - 1) < 0.03, `mean ${mean.toFixed(4)} sd ${sd.toFixed(4)}`);
    const ys = Array.from({ length: N }, (_, i) => NZ.gauss(14001, 1, i, 1)), cov = (a, b, lag) => { let s = 0, n = 0; for (let i = 0; i + lag < a.length; i++) { s += a[i] * b[i + lag]; n++; } return s / n; };
    ok("!! no correlation across observations (lag 1 and 2) or between the two axes: each within 0.02", Math.abs(cov(xs, xs, 1)) < 0.02 && Math.abs(cov(xs, xs, 2)) < 0.02 && Math.abs(cov(xs, ys, 0)) < 0.02, `lag1 ${cov(xs, xs, 1).toFixed(4)} axes ${cov(xs, ys, 0).toFixed(4)}`);
    ok("!! no two of 100,000 draws are equal, across observations", new Set(xs).size === N);
    const grid = []; for (let sd_ = 14001; sd_ < 14011; sd_++) for (let sh = 0; sh < 6; sh++) for (let o = 0; o < 10; o++) for (let ax = 0; ax < 2; ax++) grid.push(NZ.gauss(sd_, sh, o, ax));
    ok("!! ...nor across seeds, ships, observations and axes together (1,200 draws all distinct)", new Set(grid).size === grid.length && grid.length === 1200);
    const z = NZ.observe(14001, 2, 5, [10, -20], 3);
    ok("!! an observation is the true position plus sigma times the axis's draw (axis 0 for x, axis 1 for y); sigma 0 is the true position", near(z[0], 10 + 3 * NZ.gauss(14001, 2, 5, 0)) && near(z[1], -20 + 3 * NZ.gauss(14001, 2, 5, 1)) && same(NZ.observe(14001, 2, 5, [10, -20], 0), [10, -20]) && near(NZ.observe(14001, 2, 5, [0, 0], 6)[0], 2 * NZ.observe(14001, 2, 5, [0, 0], 3)[0]));
}

console.log("\n3. THE FILTER");
{
    const f0 = NZ.kfInit(5, 2, 3);
    ok("!! the filter starts from the first observation and the contact report's velocity, with variances sigma squared and V0 squared and no covariance between them", f0.p === 5 && f0.v === 2 && f0.a === 9 && f0.b === 0 && f0.c === 1);
    const f1 = NZ.kfStep({ p: 0, v: 1, a: 1, b: 0, c: 1 }, 2, 1, 0.5, 1);
    ok("!! one step against an independent hand computation: p = 1.6756756756756757, v = 1.364864864864865, the covariance 0.6756756756756757, 0.3648648648648649 and 0.839527027027027", near(f1.p, 1.6756756756756757) && near(f1.v, 1.364864864864865) && near(f1.a, 0.6756756756756757) && near(f1.b, 0.3648648648648649) && near(f1.c, 0.839527027027027));
    let f = NZ.kfInit(0, 0, 3);
    for (let k = 1; k <= 60; k++) f = NZ.kfStep(f, 1.5 * k, 1, NZ.SIGMA_A, 3);
    ok("!! on a noiseless constant-velocity track (1.5 m/s, observed exactly) the filter holds the truth to a millimetre: position and velocity after 60 observations", near(f.p, 90, 1e-3) && near(f.v, 1.5, 1e-3), `p ${f.p.toFixed(5)} v ${f.v.toFixed(5)}`);
    let g = NZ.kfInit(NZ.observe(1, 0, 0, [0, 0], 3)[0], 0, 3), e2 = 0, d2 = 0, n = 0;
    const obs = (k) => NZ.observe(1, 0, k, [1 * k, 0], 3)[0];
    for (let k = 1; k <= 4000; k++) { g = NZ.kfStep(g, obs(k), 1, NZ.SIGMA_A, 3); if (k >= 50) { e2 += (g.v - 1) ** 2; const dv = (obs(k) - obs(k - 3)) / 3; d2 += (dv - 1) ** 2; n++; } }
    ok("!! on a long noisy track of 1 m/s with sigma 3 the filter's velocity error is below the three-second difference's (sigma x 1.41 / 3 = 1.41 m/s per axis: the difference measured within 8 percent, the filter below 1.0)", Math.sqrt(e2 / n) < 1.0 && Math.abs(Math.sqrt(d2 / n) - 1.414) < 0.12 && Math.sqrt(e2 / n) < Math.sqrt(d2 / n), `filter ${Math.sqrt(e2 / n).toFixed(3)} difference ${Math.sqrt(d2 / n).toFixed(3)}`);
    const c0 = NZ.kfStep({ p: 0, v: 1, a: 4, b: 0, c: 1 }, 7, 1, 0.5, 0);
    ok("!! sigma 0 (the control): the observation is taken as the position to a micrometre, and the covariance stays finite", near(c0.p, 7, 1e-6) && Number.isFinite(c0.a) && Number.isFinite(c0.b) && Number.isFinite(c0.c) && c0.a >= 0 && c0.c > 0);
    const s = NZ.kfStep({ p: 0, v: 0, a: 2, b: 0.5, c: 1 }, 1, 2, 0.5, 2);
    ok("!! a longer interval spreads the covariance more before the update (dt 2 against dt 1: the predicted position variance grows)", NZ.kfStep({ p: 0, v: 0, a: 2, b: 0.5, c: 1 }, 0, 2, 0.5, 2).a > NZ.kfStep({ p: 0, v: 0, a: 2, b: 0.5, c: 1 }, 0, 1, 0.5, 2).a && Number.isFinite(s.p));
}

console.log("\n4. THE ARMS");
{
    const t = [["any+replan", "replan", 0], ["any+predict+edge+yield", "nominal", 0], ["est+predict+edge+yield", "exact", 0], ["kf@3", "kf", 3], ["kf@1.5", "kf", 1.5], ["kf@0", "kf", 0], ["diff@6", "diff", 6], ["diff@0.25", "diff", 0.25], ["replan@3", "replan-noisy", 3]];
    ok("!! each name parses to its kind and sigma: the three fixed ones, kf@s, diff@s and replan@s (the noisy replan is its own kind), any s of 0 or more", t.every(([n, k, s]) => { const a = NZ.parseArm(n); return a && a.kind === k && a.sigma === s; }), t.map(([n]) => n).join(" "));
    ok("!! a name that is none of them is null: an unknown kind, a missing or negative or malformed sigma, a trailing character", ["kf@", "kf@-1", "kf@3x", "diff", "replan@", "kf3", "foo", "", "any+predict", "KF@3", " kf@3"].every((n) => NZ.parseArm(n) === null) && NZ.parseArm(undefined) === null && NZ.parseArm(7) === null);
    ok("!! every one of the ten registered arms parses", NZ.NOISE_ARMS.every((n) => NZ.parseArm(n) !== null));
}

console.log("\n5. THE FLIGHTS");
{
    const t0 = Date.now(), seeds = [1, 2], bad = [];
    for (const seed of seeds) {
        const sc = H.hardScenario(seed, "hard-traffic");
        for (const b of R.BEHAVIOURS) {
            if (key(NZ.flyNoise(pilot, sc, NZ.EXACT, b)) !== key(R.flyReact(pilot, sc, R.DESIGNATED, b))) bad.push(`exact ${b} ${seed}`);
            if (key(NZ.flyNoise(pilot, sc, NZ.NOMINAL, b)) !== key(R.flyReact(pilot, sc, R.NOMINAL_ARM, b))) bad.push(`nominal ${b} ${seed}`);
            if (key(NZ.flyNoise(pilot, sc, NZ.REFERENCE, b)) !== key(R.flyReact(pilot, sc, "any+replan", b))) bad.push(`replan ${b} ${seed}`);
        }
    }
    ok("!! CONTROL: exact, nominal and any+replan are subReactNav's flights (status, ticks, path) in every behaviour on two scenarios", bad.length === 0, bad.join(", "));
    const bad2 = [];
    for (const seed of [1, 2, 3]) {
        const sc = H.hardScenario(seed, "hard-traffic"), nom = NZ.flyNoise(pilot, sc, NZ.NOMINAL, "react-none"), hh = H.flyHard(pilot, sc, NZ.NOMINAL);
        if (key(nom) !== key(hh)) bad2.push(`nominal vs flyHard ${seed}`);
        for (const a of ["diff@0", "kf@0"]) if (key(NZ.flyNoise(pilot, sc, a, "react-none")) !== key(nom)) bad2.push(`${a} ${seed}`);
    }
    ok("!! CONTROL: in react-none the noiseless diff@0 and kf@0 fly the nominal arm's flights, which are flyHard's (three scenarios)", bad2.length === 0, bad2.join(", "));
    const sc = H.hardScenario(3, "hard-traffic"), diffs = [1, 2, 3, 4, 5, 6].filter((sd) => { const s = H.hardScenario(sd, "hard-traffic"); return key(NZ.flyNoise(pilot, s, "diff@3", "react-stop")) !== key(NZ.flyNoise(pilot, s, NZ.EXACT, "react-stop")); });
    ok("!! the noise reaches the planner: diff@3 flies a different flight from the exact estimate on at least one of six scenarios in react-stop", diffs.length >= 1, `${diffs.length} of 6 differ`);
    const k = NZ.flyNoise(pilot, sc, "kf@3", "react-stop"), d3 = NZ.flyNoise(pilot, sc, "diff@3", "react-stop"), d6 = NZ.flyNoise(pilot, sc, "diff@6", "react-stop"), d15 = NZ.flyNoise(pilot, sc, "diff@1.5", "react-stop"), ex = NZ.flyNoise(pilot, sc, NZ.EXACT, "react-none");
    ok("!! the record is subReactNav's plus sigma, the filter kind and the velocity error: kf@3 carries sigma 3, filter kf, an error median and p90 with median at most p90", k.sigma === 3 && k.filter === "kf" && k.behaviour === "react-stop" && k.seed === 3 && Number.isFinite(k.velErrMedian) && k.velErrMedian <= k.velErrP90 && "status" in k && "ticks" in k && "path" in k && "minClearance" in k && "replans" in k);
    ok("!! the velocity error: the filter's is below the difference's at the same sigma, the difference's grows with sigma (1.5 < 3 < 6, the 6 about twice the 3), and exact in react-none is zero", k.velErrMedian < d3.velErrMedian && d15.velErrMedian < d3.velErrMedian && d3.velErrMedian < d6.velErrMedian && d6.velErrMedian / d3.velErrMedian > 1.6 && d6.velErrMedian / d3.velErrMedian < 2.4 && ex.velErrMedian < 1e-6 && ex.velErrP90 < 1e-6, `kf ${k.velErrMedian.toFixed(2)} diff 1.5/3/6 ${d15.velErrMedian.toFixed(2)}/${d3.velErrMedian.toFixed(2)}/${d6.velErrMedian.toFixed(2)}`);
    const nom = NZ.flyNoise(pilot, sc, NZ.NOMINAL, "react-stop"), rp = NZ.flyNoise(pilot, sc, "replan@3", "react-stop");
    ok("!! an arm with no velocity belief (the nominal arm, the replans) holds no velocity error: null, and the noisy replan records its sigma", nom.velErrMedian === null && nom.velErrP90 === null && rp.velErrMedian === null && rp.sigma === 3 && rp.filter === "replan-noisy" && nom.sigma === 0 && nom.filter === "nominal");
    ok("!! a flight twice is the same flight, noise included (no clock, no Math.random)", same(NZ.flyNoise(pilot, sc, "kf@3", "react-turn"), NZ.flyNoise(pilot, sc, "kf@3", "react-turn")) && same(NZ.flyNoise(pilot, sc, "diff@6", "react-stop"), d6));
    ok("!! an unknown arm or behaviour throws, naming it", /"nope"/.test(msg(() => NZ.flyNoise(pilot, sc, "nope", "react-stop"))) && /"kf@-1"/.test(msg(() => NZ.flyNoise(pilot, sc, "kf@-1", "react-stop"))) && /"react-nope"/.test(msg(() => NZ.flyNoise(pilot, sc, "kf@3", "react-nope"))));
    ok("!! a different scenario seed gives different noise, hence a different belief error (the same arm on two scenarios)", NZ.flyNoise(pilot, H.hardScenario(4, "hard-traffic"), "diff@3", "react-stop").velErrMedian !== d3.velErrMedian);
    console.log(`  ----  flights took ${Date.now() - t0} ms`);
}

console.log("\n6. PINS AND THE RECORD (added after the first mutation pass: 54 survivors, 36 of them here)");
{
    const t0 = Date.now(), cmp = (a, b, e) => Math.abs(a - b) <= e;
    const draws = [[[14001, 0, 0, 0], -0.6946798136668496], [[14001, 0, 0, 1], 1.4159240912843334], [[14001, 2, 5, 0], -0.44779937617596155], [[14060, 5, 259, 1], 0.5310762800970578], [[1, 1, 1, 1], -0.5446421825471519], [[0, 0, 0, 0], -0.39698664994676996]];
    ok("!! REGRESSION PIN: the noise stream is these numbers (the registered noise HELD14 will see; a generator that is statistically as good but another stream goes red, and so does a changed constant, shift, hash term or Box-Muller coefficient)", draws.every(([a, v]) => cmp(NZ.gauss(...a), v, 1e-12)));
    const f2 = NZ.kfStep({ p: 2, v: 0.5, a: 2, b: 0.3, c: 0.8 }, 4.2, 2, 0.5, 1.5);
    ok("!! a second hand computation with the covariance cross term not zero (dt 2, sigma 1.5, observation 4.2 against a prediction of 3): p 3.910196779964222, v 0.8091234347048302, the covariance 1.7066189624329153, 0.5796064400715562, 0.6817531305903398", cmp(f2.p, 3.910196779964222, 1e-12) && cmp(f2.v, 0.8091234347048302, 1e-12) && cmp(f2.a, 1.7066189624329153, 1e-12) && cmp(f2.b, 0.5796064400715562, 1e-12) && cmp(f2.c, 0.6817531305903398, 1e-12));
    const z0 = NZ.kfStep({ p: 1, v: 2, a: 0, b: 0, c: 0 }, 9, 1, 0, 0);
    ok("!! with no covariance, no process noise and sigma 0 the step is finite (the floor keeps it off 0/0): the gain is 0 and the prediction stands", z0.p === 3 && z0.v === 2 && Number.isFinite(z0.a) && Number.isFinite(z0.b) && Number.isFinite(z0.c));
    const xs = [5, 1, 3, 2, 4];
    ok("!! quantile is the sorted value at floor(q x (n - 1)): 5, 1, 3, 2, 4 -> median 3, minimum at 0, maximum at 1; 1 to 10 at 0.9 -> 9; 1, 2, 3, 4 at 0.5 -> 2; one value -> itself; none -> null; a q above 1 is held to the last value; the input is not reordered", NZ.quantile(xs, 0.5) === 3 && NZ.quantile(xs, 0) === 1 && NZ.quantile(xs, 1) === 5 && NZ.quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9) === 9 && NZ.quantile([1, 2, 3, 4], 0.5) === 2 && NZ.quantile([7], 0.9) === 7 && NZ.quantile([], 0.5) === null && same(xs, [5, 1, 3, 2, 4]) && NZ.quantile([10, 2, 33, 4], 1) === 33 && NZ.quantile([1, 2, 3], 2) === 3 && NZ.quantile([1, 2, 3, 4], 1.5) === 4);
    const sc1 = H.hardScenario(1, "hard-traffic"), to = NZ.flyNoise(pilot, sc1, "kf@3", "react-turn", { seconds: 2 });
    ok("!! a flight with a 2 s limit ends in a timeout after exactly 60 ticks and no replan (the loop runs `total` ticks, not one more)", to.status === "timeout" && to.ticks === 60 && to.replans === 0 && to.reached === false && to.t === null);
    const fl = (arm, seed, b) => NZ.flyNoise(pilot, H.hardScenario(seed, "hard-traffic"), arm, b), many = [fl("diff@3", 3, "react-stop"), fl("kf@3", 3, "react-stop"), fl("replan@3", 3, "react-stop"), fl("kf@6", 4, "react-turn"), fl("diff@1.5", 4, "react-turn"), fl(NZ.NOMINAL, 1, "react-none")];
    ok("!! the replans are the multiples of 90 ticks (3 s) the flight lived through, none at tick 0: floor((ticks - 1) / 90), on six flights of five arms", many.every((r) => r.replans === Math.floor((r.ticks - 1) / 90)), many.map((r) => `${r.replans}/${r.ticks}`).join(" "));
    const arr = fl("kf@3", 1, "react-turn"), shp = fl(NZ.REFERENCE, 1, "react-none"), brg = fl(NZ.NOMINAL, 1, "react-none"), lf = fl(NZ.EXACT, 2, "react-stop"), lf2 = fl("diff@3", 11, "react-stop");
    ok("!! a flight that arrives is reached with its time and no struck obstacle; a flight that collides is not reached, with the type it struck: a ship (any+replan, scenario 1, react-none) or a berg (the nominal arm, scenario 1)", arr.status === "reached" && arr.reached === true && near(arr.t, 147.66666666666666) && arr.hit === null && shp.status === "collided" && shp.reached === false && shp.hit === "ship" && brg.status === "collided" && brg.hit === "berg" && brg.reached === false && shp.t === null);
    ok("!! a flight that leaves the region says so, and is not reached: exact on scenario 2 in react-stop (3,047 ticks) and diff@3 on scenario 11 (2,615 ticks)", lf.status === "left" && lf.ticks === 3047 && lf.reached === false && lf.hit === null && lf2.status === "left" && lf2.ticks === 2615);
    const chord = (s) => { const x = H.hardScenario(s, "hard-traffic"); return Math.hypot(x.goal.x - x.start.x, x.goal.y - x.start.y); };
    ok("!! the record's chord is the straight line from the start to the goal (scenarios 1 and 2), and carries the scenario's own fields", near(arr.chord, chord(1)) && near(lf.chord, chord(2)) && arr.kind === sc1.kind && arr.seed === 1 && arr.gap === sc1.gapWidth && arr.minClearance > 0 && lf.noRoute === false);
    const golden = [["diff@3", 3, "react-stop", "reached", 4790, 444.987556, 1.62275183, 3.290326022, 43.386714], ["kf@3", 3, "react-stop", "reached", 4004, 372.200456, 0.555261784, 1.036109233, 22.893226], ["replan@3", 3, "react-stop", "reached", 3757, 370.028564, null, null, 19.600169], ["kf@6", 4, "react-turn", "reached", 3833, 354.735893, 0.731040029, 1.31860663, 21.404407], ["diff@1.5", 4, "react-turn", "reached", 3856, 354.42968, 0.87124685, 1.661436021, 24.987761]];
    ok("!! REGRESSION PIN: five noisy flights are these flights (status, ticks, path to a micrometre, the velocity error's median and 90th percentile to 1e-8, the least clearance to a micrometre): the registered behaviour of each belief, frozen", golden.every(([arm, seed, b, st, tk, pa, vm, vp, mc]) => { const r = fl(arm, seed, b); return r.status === st && r.ticks === tk && cmp(r.path, pa, 1e-6) && (vm === null ? r.velErrMedian === null && r.velErrP90 === null : cmp(r.velErrMedian, vm, 1e-8) && cmp(r.velErrP90, vp, 1e-8)) && cmp(r.minClearance, mc, 1e-6); }));
    console.log(`  ----  these rows took ${Date.now() - t0} ms`);
}

console.log(`\nsubNoiseNav-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
