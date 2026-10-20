// WebGLEngine/tools/ship/subDisturb-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/subDisturb-selfcheck.mjs      (~1.4 s)
//
// tools/subDisturb.mjs takes three kindnesses away from a pilot: exact senses, instant controls, still water. A robustness number measured through it is only worth what these rows make it worth, so they pin the knobs:
//   1  THE LEVELS   the table of levels is what the reports say it is
//   2  SENSORS      noise 0 hands the SAME state back; a noisy state is a copy (the original is untouched) whose depth, attitude, velocity and rates are off by gaussians with the sizes the level names (measured over 4000 draws,
//                   within 10%), zero mean, and repeatable from the seed
//   3  DELAY        a control reaches the actuators exactly `delayTicks` calls late, the first delayTicks answers are zero controls, delay 0 is the identity, and the delay line is emptied between dives
//   4  GUSTS        gust 0 is the scenario itself; a nominal scenario gains a current, a current scenario's current is multiplied (mean and amplitude), the original is not mutated
//   5  END TO END   level 0 flies bit for bit like no wrapper; each rougher level scores worse than the one before for the PD autopilot; the dive is repeatable
//
// SABOTAGE LOG -- each applied to tools/subDisturb.mjs in place, the gate run, the file restored (the number is how many rows went red):
//   D1 noise not scaled by the level 2 | D2 depth noise 1.3x 1 | D3 depth noise biased 1 | D4 velocity noise off 1 | D5 rate noise off 1 | D6 attitude noise off 1 | D7 quaternion not normalised 1 | D8 attitude noise 3x 1
//   D9 the input state mutated 5 | D10 zero noise copies the state 1 | D11 delay one tick short 3 | D12 delay line kept between dives 1 | D13 delay ignored 3 | D14 the first answers not zero 3 | D15 the same noise every dive 1
//   D16 the seed ignored 2 | D17 gust 0 copies 2 | D18 amplitude not scaled 2 | D19 mean not scaled 3 | D20 a nominal scenario gets no current 2 | D21 not frozen 1 | D22 a level changed 1
"use strict";
import * as D from "../subDisturb.mjs";
import * as S from "../../physics/mechanics/subModel6dof.mjs";
import * as T from "../../brain/subTask.mjs";
import * as AS from "../../brain/autopilotSub.mjs";
import { ACTUATORS } from "../../physics/mechanics/subActuators.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const std = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return { mean: m, sd: Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) }; };
const within = (got, want, tol = 0.1) => Math.abs(got - want) <= tol * want;

console.log("1. THE LEVELS");
ok("!! four levels: clean, good INS (x1, 3 ticks, gust 1), rough (x3, 6 ticks, gust 2), bad day (x5, 9 ticks, gust 3)", D.LEVELS.length === 4 && JSON.stringify(D.LEVELS.map((l) => [l.noise, l.delayTicks, l.gust])) === "[[0,0,0],[1,3,1],[3,6,2],[5,9,3]]" && D.LEVELS.every(Object.isFrozen));

console.log("\n2. SENSORS");
{
    const state = S.createState({ depth: 30, speed: 2, heading: 0.3, pitch: 0.05, bank: 0.02 }), copyOf = JSON.stringify(state), N = 4000;
    ok("!! noise 0 hands back the very same state (no copy, no change)", D.sense(state, 0, mulberry(1)) === state);
    const r = mulberry(7), draws = Array.from({ length: N }, () => D.sense(state, 2, r));
    ok("!! a noisy state is a copy: the original is untouched, the copy is a different object with the same keys", JSON.stringify(state) === copyOf && draws[0] !== state && Object.keys(draws[0]).sort().join() === Object.keys(state).sort().join());
    const a0 = S.attitude(state), A = draws.map((d) => S.attitude(d));
    const dz = std(draws.map((d) => d.pos[2] - state.pos[2])), dv = std(draws.map((d) => d.vel[0] - state.vel[0])), dw = std(draws.map((d) => d.w[1] - state.w[1])), dp = std(A.map((a) => a.pitch - a0.pitch));
    ok("!! depth noise at level x2 has a standard deviation of 0.2 m (0.1 m x 2) and no bias", within(dz.sd, 0.2) && Math.abs(dz.mean) < 0.02, `sd ${dz.sd.toFixed(3)} mean ${dz.mean.toFixed(3)}`);
    ok("!! velocity noise at x2 has a standard deviation of 0.06 m/s and no bias", within(dv.sd, 0.06) && Math.abs(dv.mean) < 0.006, `sd ${dv.sd.toFixed(4)}`);
    ok("!! rate noise at x2 has a standard deviation of 0.006 rad/s and no bias", within(dw.sd, 0.006) && Math.abs(dw.mean) < 0.0006, `sd ${dw.sd.toFixed(5)}`);
    ok("!! attitude noise at x2 is a small rotation of about 0.6 degrees per axis (pitch sd between 0.4 and 0.8 degrees), no bias, and the quaternion stays unit length", dp.sd > 0.4 * Math.PI / 180 && dp.sd < 0.8 * Math.PI / 180 && Math.abs(dp.mean) < 0.0006 && draws.every((d) => Math.abs(Math.hypot(...d.q) - 1) < 1e-9), `pitch sd ${(dp.sd * 180 / Math.PI).toFixed(3)} deg`);
    ok("!! the same seed gives the same noise and a different seed a different one", JSON.stringify(D.sense(state, 3, mulberry(5))) === JSON.stringify(D.sense(state, 3, mulberry(5))) && JSON.stringify(D.sense(state, 3, mulberry(5))) !== JSON.stringify(D.sense(state, 3, mulberry(6))));
    ok("!! noise scales with the level: x5 is five times x1 in the depth sd (4000 draws, within 10%)", (() => { const r1 = mulberry(3), r5 = mulberry(4); const s1 = std(Array.from({ length: N }, () => D.sense(state, 1, r1).pos[2])).sd, s5 = std(Array.from({ length: N }, () => D.sense(state, 5, r5).pos[2])).sd; return within(s5 / s1, 5); })());
}

console.log("\n3. DELAY");
{
    const tgt = { depth: 30, heading: 0, speed: 2 }, st = S.createState({ depth: 30 });
    const counter = () => { let n = 0; return () => ({ pitch: 0, yaw: 0, thrust: ++n / 100, ballast: 0 }); };
    const out = (lvl, calls, t = tgt, p = null) => { const w = p || D.disturbed(counter(), lvl, 1); return Array.from({ length: calls }, () => w(st, t, [0, 0, 0]).thrust); };
    const d3 = out({ noise: 0, delayTicks: 3 }, 8);
    ok("!! with a delay of 3 ticks the first three answers are zero controls and call k is answered with the pilot's call k-3", JSON.stringify(d3) === JSON.stringify([0, 0, 0, 0.01, 0.02, 0.03, 0.04, 0.05]), JSON.stringify(d3));
    ok("!! a delay of 0 is the identity (call k is answered with call k)", JSON.stringify(out({ noise: 0, delayTicks: 0 }, 4)) === JSON.stringify([0.01, 0.02, 0.03, 0.04]));
    const w = D.disturbed(counter(), { noise: 0, delayTicks: 2 }, 1), t2 = { ...tgt };
    const first = Array.from({ length: 4 }, () => w(st, tgt, [0, 0, 0]).thrust), second = Array.from({ length: 4 }, () => w(st, t2, [0, 0, 0]).thrust);
    ok("!! a NEW dive (a new target object) empties the delay line: the next dive starts with zero controls again, not with the last dive's controls", JSON.stringify(first.slice(0, 2)) === "[0,0]" && JSON.stringify(second.slice(0, 2)) === "[0,0]", JSON.stringify(first) + " " + JSON.stringify(second));
    ok("!! a delay line is per wrapper: two wrappers do not share it", (() => { const a = D.disturbed(counter(), { noise: 0, delayTicks: 1 }, 1), b = D.disturbed(counter(), { noise: 0, delayTicks: 1 }, 1); a(st, tgt, [0, 0, 0]); a(st, tgt, [0, 0, 0]); return b(st, tgt, [0, 0, 0]).thrust === 0; })());
    const noiseRun = (seed) => { const seen = []; const p = (q) => { seen.push(q.pos[2]); return { pitch: 0, yaw: 0, thrust: 0, ballast: 0 }; }; const w2 = D.disturbed(p, { noise: 2, delayTicks: 0 }, seed); const ta = { ...tgt }, tb = { ...tgt }; for (let i = 0; i < 3; i++) w2(st, ta, [0, 0, 0]); for (let i = 0; i < 3; i++) w2(st, tb, [0, 0, 0]); return seen; };
    const n1 = noiseRun(9), n2 = noiseRun(9), n3 = noiseRun(10);
    ok("!! the noise is re-seeded for every dive from the wrapper's seed: two wrappers with the same seed see identical noise over two dives; the second dive sees different noise from the first; another seed differs", n1.join() === n2.join() && n1.slice(0, 3).join() !== n1.slice(3).join() && n1.join() !== n3.join() && new Set(n1).size === 6);
}

console.log("\n4. GUSTS");
{
    const nom = T.scenario(11, "nominal"), cur = T.scenario(11, "current"), copyN = JSON.stringify(nom), copyC = JSON.stringify(cur);
    ok("!! gust 0 returns the scenario itself", D.gusty(nom, 0) === nom);
    const g = D.gusty(nom, 2);
    ok("!! a nominal scenario (no current) gains the current of the 'current' scenario of the same seed, multiplied by the gust (mean and amplitude), and everything else about it is unchanged", nom.current === null && g.current && g.current.mean.every((v, i) => Math.abs(v - 2 * cur.current.mean[i]) < 1e-12) && g.current.amp.every((v, i) => Math.abs(v - 2 * cur.current.amp[i]) < 1e-12) && g.seed === nom.seed && JSON.stringify(g.target) === JSON.stringify(nom.target) && JSON.stringify(g.start) === JSON.stringify(nom.start));
    const gc = D.gusty(cur, 3);
    ok("!! a 'current' scenario's own current is multiplied by the gust (x3), its frequencies and phases kept", gc.current.mean.every((v, i) => Math.abs(v - 3 * cur.current.mean[i]) < 1e-12) && gc.current.amp.every((v, i) => Math.abs(v - 3 * cur.current.amp[i]) < 1e-12) && JSON.stringify(gc.current.freq) === JSON.stringify(cur.current.freq) && JSON.stringify(gc.current.phase) === JSON.stringify(cur.current.phase));
    ok("!! the original scenarios are not mutated, and the gusty one is frozen", JSON.stringify(nom) === copyN && JSON.stringify(cur) === copyC && Object.isFrozen(g) && Object.isFrozen(g.current));
    ok("!! the water really moves harder: the speed of the current at t=7 s is larger for gust 3 than for gust 1 on the same scenario", (() => { const sp = (s) => Math.hypot(...T.currentAt(s.current, 7)); return sp(D.gusty(nom, 3)) > sp(D.gusty(nom, 1)) * 2; })());
    ok("gustySet maps a whole set and keeps its length and order", (() => { const set = [nom, cur], gs = D.gustySet(set, 1); return gs.length === 2 && gs[0].seed === 11 && gs[1].seed === 11 && gs[0].kind === "nominal" && gs[1].kind === "current"; })());
}

console.log("\n5. END TO END");
{
    const set = T.HELD_OUT_SET.filter((_, i) => i % 3 === 0), opts = { actuators: ACTUATORS };
    const plain = T.evaluate(AS.pilot(), set, opts), l0 = T.evaluate(D.disturbed(AS.pilot(), D.LEVELS[0], 1), D.gustySet(set, D.LEVELS[0].gust), opts);
    ok("!! level 0 flies EXACTLY like no wrapper (the same score and the same fingerprints, dive by dive)", plain.score === l0.score && plain.runs.every((r, i) => r.fingerprint === l0.runs[i].fingerprint));
    const sc = D.LEVELS.map((L) => T.evaluate(D.disturbed(AS.pilot(), L, 1), D.gustySet(set, L.gust), opts).score);
    ok("!! each rougher level scores worse than the one before for the PD autopilot", sc[0] > sc[1] && sc[1] > sc[2] && sc[2] > sc[3], sc.map((v) => v.toFixed(3)).join(" > "));
    const a = T.evaluate(D.disturbed(AS.pilot(), D.LEVELS[2], 4), D.gustySet(set, 2), opts), b = T.evaluate(D.disturbed(AS.pilot(), D.LEVELS[2], 4), D.gustySet(set, 2), opts), c = T.evaluate(D.disturbed(AS.pilot(), D.LEVELS[2], 5), D.gustySet(set, 2), opts);
    ok("!! a disturbed set is repeatable from its seed (same seed: same score; another seed: another score)", a.score === b.score && a.score !== c.score, `${a.score.toFixed(4)} ${c.score.toFixed(4)}`);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
