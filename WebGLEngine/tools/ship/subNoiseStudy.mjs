// WebGLEngine/tools/ship/subNoiseStudy.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "FOLLOW-UP 14" in brain/SUB_FIELD_NAV_WIP.md, the gate is tools/ship/subNoiseStudy-selfcheck.mjs)
//
// THE STUDY OF THE ESTIMATE WITH NOISE: flies hard-traffic scenarios (brain/subHardNav.mjs) with reacting ships (brain/subReactNav.mjs) under ten arms (brain/subNoiseNav.mjs: the nominal belief, FOLLOW-UP 6's
// exact estimate, the naive two-point difference and a constant-velocity Kalman filter of ships observed once a second with an error of 1.5, 3 and 6 m, and the plain replan with exact and with noisy positions)
// and reads the registered verdict (C1 to C3) and the predictions E1 to E9.
//   node tools/ship/subNoiseStudy.mjs --set dev [--seeds N]               DEV (seeds 1 to 30 of each behaviour): the sanity run; not a result
//   node tools/ship/subNoiseStudy.mjs --set held14 [--seeds N] [--write]   HELD14, seeds 14001 to 14060, READ ONCE; --write puts every flight in brain/subNoiseHeld14.jsonl (and refuses a second write)
// Pure apart from the file --write puts down. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as H from "../../brain/subHardNav.mjs";
import * as R from "../../brain/subReactNav.mjs";
import * as NZ from "../../brain/subNoiseNav.mjs";
import * as AP from "../../brain/autopilotSub.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const OUT = "brain/subNoiseHeld14.jsonl", SETS = NZ.SETS, CONTROL_SEEDS = Object.freeze([1, 2, 3, 4, 5]);
export const THRESH = Object.freeze({ gain: 9, cost: 3, noiseGap: 5, plus: 5, within: 5, replanMin: 50 });
export const pilot = (s, t, c) => AP.decide(s, t, c);

/** The median of a list (the mean of the two middle values when the count is even); NaN for an empty list. */
export function median(xs) {
    if (!xs.length) return NaN;
    const a = xs.slice().sort((p, q) => p - q), m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
/** The exact two-sided sign test p of `gained` and `lost` (ties dropped): twice the smaller tail of a fair coin, at most 1; 1 for no flights that differ. */
export function signP(gained, lost) {
    const n = gained + lost; if (!n) return 1;
    let tail = 0, c = 1; const k = Math.min(gained, lost);
    for (let i = 0; i <= k; i++) { tail += c; c = (c * (n - i)) / (i + 1); }
    return Math.min(1, (2 * tail) / 2 ** n);
}
/** { behaviour: { arm: { n, reached, rate, collided, shipHits, left, timeout, other, medianTime (arrivals), medianClearance, velErrMedian, velErrP90 (the median over the flights that hold a velocity belief) } } } */
export function summarize(runs) {
    const cells = {};
    for (const b of R.BEHAVIOURS) for (const arm of NZ.NOISE_ARMS) {
        const rs = runs.filter((r) => r.behaviour === b && r.arm === arm);
        if (!rs.length) continue;
        const count = (s) => rs.filter((r) => r.status === s).length, done = rs.filter((r) => r.reached), ve = (k) => median(rs.filter((r) => Number.isFinite(r[k])).map((r) => r[k]));
        (cells[b] || (cells[b] = {}))[arm] = { n: rs.length, reached: done.length, rate: done.length / rs.length, collided: count("collided"), shipHits: rs.filter((r) => r.status === "collided" && r.hit === "ship").length, left: count("left"),
            timeout: count("timeout"), other: rs.filter((r) => !["reached", "collided", "left", "timeout"].includes(r.status)).length, medianTime: median(done.map((r) => r.t)), medianClearance: median(rs.map((r) => r.minClearance)), velErrMedian: ve("velErrMedian"), velErrP90: ve("velErrP90") };
    }
    return { cells };
}
/** Paired by seed: the flights `a` reaches and `b` does not (gained), the reverse (lost), and the sign test p. Runs of one behaviour. */
export function paired(runs, behaviour, a, b) {
    const by = (arm) => new Map(runs.filter((r) => r.behaviour === behaviour && r.arm === arm).map((r) => [r.seed, r.reached]));
    const A = by(a), B = by(b); let gained = 0, lost = 0;
    for (const [seed, ra] of A) if (B.has(seed)) { if (ra && !B.get(seed)) gained++; else if (!ra && B.get(seed)) lost++; }
    return { gained, lost, p: signP(gained, lost) };
}
/**
 * The verdict and E1 to E9 (brain/SUB_FIELD_NAV_WIP.md, "FOLLOW-UP 14"). The designated arm (NZ.DESIGNATED, kf@3) against the nominal arm (NZ.NOMINAL). C1: in react-stop it reaches at least THRESH.gain (9) more. C2: in react-none it reaches at
 * least the nominal arm's count minus THRESH.cost (3). C3: in react-stop diff@3 reaches at least THRESH.noiseGap (5) fewer than kf@3. SUPPORTED iff C1, C2 and C3; PARTLY SUPPORTED iff C1 and one of C2, C3 misses; NOT SUPPORTED otherwise.
 * `controls` is the control check (true when it held). E5: diff@6 reaches fewer than the nominal arm in react-stop. E6: kf@6 reaches at least THRESH.plus (5) more than it. E7: replan@3 reaches at least THRESH.replanMin (50) in react-stop.
 * E8: in react-turn kf@3 is within THRESH.within (5) of the nominal arm either way. E9: the verdict is SUPPORTED. A missing cell is a miss, never a throw.
 */
export function judge(sum, controls) {
    const c = sum.cells, at = (b, arm) => (c[b] || {})[arm], D = NZ.DESIGNATED, NM = NZ.NOMINAL, T = THRESH;
    const reached = (b, arm) => (at(b, arm) ? at(b, arm).reached : NaN);
    const c1 = reached("react-stop", D) - reached("react-stop", NM) >= T.gain, c2 = reached("react-none", D) >= reached("react-none", NM) - T.cost, c3 = reached("react-stop", "diff@3") <= reached("react-stop", D) - T.noiseGap;
    const verdict = c1 && c2 && c3 ? "SUPPORTED" : c1 && (c2 || c3) ? "PARTLY SUPPORTED" : "NOT SUPPORTED";
    return { c1, c2, c3, verdict, e1: !!controls, e2: c1, e3: c2, e4: c3, e5: reached("react-stop", "diff@6") < reached("react-stop", NM), e6: reached("react-stop", "kf@6") - reached("react-stop", NM) >= T.plus,
        e7: reached("react-stop", "replan@3") >= T.replanMin, e8: Math.abs(reached("react-turn", D) - reached("react-turn", NM)) <= T.within, e9: verdict === "SUPPORTED" };
}
const pct = (v) => (Number.isFinite(v) ? (100 * v).toFixed(0) + "%" : "n/a");
const f2s = (v) => (Number.isFinite(v) ? v.toFixed(2) : "n/a");
export function table(sum, title) {
    const lines = [title, "behaviour   arm                    | reached      | collided (ships) left timeout other | median time (s) | vel error median / p90 (m/s)"];
    for (const b of R.BEHAVIOURS) for (const arm of NZ.NOISE_ARMS) {
        const x = (sum.cells[b] || {})[arm]; if (!x) continue;
        lines.push(`${b.padEnd(11)} ${arm.padEnd(22)} | ${(`${x.reached}/${x.n} ${pct(x.rate)}`).padEnd(12)} | ${String(x.collided).padStart(8)} (${String(x.shipHits).padStart(2)}) ${String(x.left).padStart(4)} ${String(x.timeout).padStart(7)} ${String(x.other).padStart(5)} | ${f2s(x.medianTime).padStart(15)} | ${f2s(x.velErrMedian)} / ${f2s(x.velErrP90)}`);
    }
    return lines.join("\n");
}
export function verdictText(j) {
    const yn = (v) => (v ? "HELD" : "MISSED"), T = THRESH, D = NZ.DESIGNATED, nm = NZ.NOMINAL;
    return [`C1 ${D} reaches at least ${T.gain} more than ${nm} in react-stop ${yn(j.c1)}; C2 it reaches at least ${nm}'s count minus ${T.cost} in react-none ${yn(j.c2)}; C3 diff@3 reaches at least ${T.noiseGap} fewer than ${D} in react-stop ${yn(j.c3)} => ${j.verdict}`,
        `E1 the controls hold (the noiseless arms are the nominal arm's flights in react-none, and exact is subReactNav's estimating arm): ${yn(j.e1)}`, `E2 C1: ${yn(j.e2)}`, `E3 C2: ${yn(j.e3)}`, `E4 C3: ${yn(j.e4)}`,
        `E5 diff@6 reaches fewer than ${nm} in react-stop: ${yn(j.e5)}`, `E6 kf@6 reaches at least ${T.plus} more than ${nm} in react-stop: ${yn(j.e6)}`, `E7 replan@3 reaches at least ${T.replanMin} of 60 in react-stop: ${yn(j.e7)}`,
        `E8 in react-turn ${D} is within ${T.within} of ${nm} either way: ${yn(j.e8)}`, `E9 the verdict is SUPPORTED: ${yn(j.e9)}`].join("\n");
}
const key = (r) => `${r.status}/${r.ticks}/${Number(r.path).toFixed(6)}`;
/**
 * The controls (E1; the registered checks 1 and 2) on CONTROL_SEEDS: in react-none the noiseless diff@0 and kf@0 fly the nominal arm's flights, which are flyHard's; and `exact` is subReactNav's estimating arm, flight for flight,
 * in each behaviour. { ok, checked, bad: [names] }. The flights are the arguments' so a gate can hand it broken ones.
 */
export function controlCheck(fly = NZ.flyNoise, flyReact = R.flyReact, flyHard = H.flyHard) {
    const bad = []; let checked = 0;
    for (const seed of CONTROL_SEEDS) {
        const sc = H.hardScenario(seed, "hard-traffic"), nom = fly(pilot, sc, NZ.NOMINAL, "react-none"), hh = flyHard(pilot, sc, NZ.NOMINAL);
        checked++; if (key(nom) !== key(hh)) bad.push(`nominal vs flyHard ${seed}`);
        for (const arm of ["diff@0", "kf@0"]) { checked++; if (key(fly(pilot, sc, arm, "react-none")) !== key(nom)) bad.push(`${arm} ${seed}`); }
        for (const b of R.BEHAVIOURS) { checked++; if (key(fly(pilot, sc, NZ.EXACT, b)) !== key(flyReact(pilot, sc, R.DESIGNATED, b))) bad.push(`exact ${b} ${seed}`); }
    }
    return { ok: bad.length === 0, checked, bad };
}
/** The command as a function: returns the exit code (0 fine, 2 a bad argument). `io` is for the gate: { out, err, writeFile, exists, fly, controls }. */
export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync, exists = io.exists || ((f) => fs.existsSync(f)), fly = io.fly || NZ.flyNoise, controls = io.controls || (() => controlCheck());
    const o = { set: "dev", seeds: null, write: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--write") o.write = true;
        else if (a === "--set") { o.set = argv[++i]; if (!SETS[o.set]) { err(`subNoiseStudy: --set needs one of ${Object.keys(SETS).join(", ")}`); return 2; } }
        else if (a === "--seeds") { const v = Number(argv[++i]); if (!Number.isInteger(v) || v <= 0) { err("subNoiseStudy: --seeds needs a positive whole number"); return 2; } o.seeds = v; }
        else { err(`subNoiseStudy: unknown argument ${JSON.stringify(a)}`); return 2; }
    }
    if (o.write && o.set !== "held14") { err("subNoiseStudy: --write goes with --set held14 only"); return 2; }
    if (o.write && exists(path.join(ENG, OUT))) { err(`subNoiseStudy: ${OUT} exists: HELD14 is read once and is not flown again`); return 2; }
    const seeds = o.seeds ? SETS[o.set].slice(0, o.seeds) : SETS[o.set], runs = [];
    out(`${o.set.toUpperCase()} set: ${seeds.length} scenarios of hard-traffic x ${R.BEHAVIOURS.length} ship behaviours, ${NZ.NOISE_ARMS.length} arms, ships observed every ${NZ.OBS_S} s`);
    for (const seed of seeds) { const sc = H.hardScenario(seed, "hard-traffic"); for (const b of R.BEHAVIOURS) for (const arm of NZ.NOISE_ARMS) runs.push(fly(pilot, sc, arm, b)); }
    const sum = summarize(runs), ctl = controls(), j = judge(sum, ctl.ok);
    out(""); out(table(sum, `margin ladder ${H.MARGIN_LADDER.join(", ")} m, ${H.SECONDS_HARD} s a flight, edge +${H.EDGE_EXTRA} m, yield ${H.YIELD_SPEED} m/s, filter: acceleration noise ${NZ.SIGMA_A} m/s2, start velocity sd ${NZ.V0} m/s, sigma ${NZ.SIGMAS.join(", ")} m`));
    out(""); out(`controls: ${ctl.ok ? "every control flight is the flight it must be" : "NOT HELD " + ctl.bad.join(", ")} (${ctl.checked} flights)`);
    out("paired against the nominal belief and against any+replan, gained / lost (exact sign test p; labelled post hoc):");
    for (const b of R.BEHAVIOURS) for (const arm of NZ.NOISE_ARMS) {
        if (!(sum.cells[b] || {})[arm]) continue;
        const pn = paired(runs, b, arm, NZ.NOMINAL), pr = paired(runs, b, arm, NZ.REFERENCE);
        out(`  ${b.padEnd(11)} ${arm.padEnd(22)} vs nominal ${String(pn.gained).padStart(2)}/${String(pn.lost).padStart(2)} (p ${pn.p.toFixed(3)})   vs any+replan ${String(pr.gained).padStart(2)}/${String(pr.lost).padStart(2)} (p ${pr.p.toFixed(3)})`);
    }
    out(""); out(verdictText(j));
    if (o.write) { writeFile(path.join(ENG, OUT), runs.map((r) => JSON.stringify({ set: o.set, ...r })).join("\n") + "\n"); out(`wrote ${runs.length} flights to ${OUT}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
