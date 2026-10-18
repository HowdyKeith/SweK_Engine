// WebGLEngine/brain/autopilotSub-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/autopilotSub-selfcheck.mjs      (~4 s)
//
// THE HAND-WRITTEN SUBMARINE PILOT HELD TO ITS LAWS AND TO WHAT IT CAN DO. brain/autopilotSub.mjs is a cascade of memoryless PD loops; this gate holds each law to its sign and its closed form, and the whole to a measured capture:
//
//   1  THE LAWS     at the target and in trim every control is zero except the thrust, which is trim(target speed); each error drives its control the right way (a deeper target floods the tank and noses DOWN, a target to the
//                   right turns right, a slow vessel gets more thrust); the plane and rudder gains are scheduled by (2.5 / V)^2, clamped to [0.4, 4]; the pitch command is limited to +-0.3 rad and the climb rate asked for to +-1 m/s
//   2  NO MEMORY    decide() is a pure function of (state, target, current): the same arguments give the same answer however often they are asked, and it edits nothing it is handed; a non-finite target is read as 0
//   3  THE CAPTURES (measured; the numbers are this vessel's) from trim, a target 8 m deeper is held within 1 m by 60 s with no overshoot beyond 1.5 m; a 60-degree heading change is captured within 0.1 rad with the
//                   vessel level; a 1 m/s speed change is captured within 0.05 m/s; and the three at once
//   4  WHAT IT CANNOT DO, MEASURED  a vessel 0.5% heavy is held off its depth by a steady error (the header says so: no integrator) -- the error is positive, bounded, and shrinks as the tank gain is raised; below the planes' schedule
//                   floor (0.8 m/s) the vessel depth is the tank's job alone
//   5  THE SETS     it ends none of the 88 dives on TRAIN, HELD_OUT and BASELINE early
//
// SABOTAGE LOG -- SIXTEEN, each applied to brain/autopilotSub.mjs in place, the gate run, the file restored; every one red by name (the number is how many rows went red):
//   A1 depth sign flipped in the climb command 7 | A2 pitch-rate damping dropped 1 | A3 yaw sign flipped 4 | A4 the tank's climb-damping sign flipped (the bug this gate found in the autopilot's first draft) 2 | A5 ballast depth sign 3
//   A6 no gain schedule 1 | A7 schedule exponent 1 1 | A8 pitch limit removed 1 | A9 heading error not wrapped 1 | A10 thrust trim ignored 3 | A11 speed error sign 7 | A12 sideslip term dropped 1 | A13 climb-rate limit removed 1
//   A14 non-finite target not read as 0 1 | A15 control, no change 0 | A16 yaw-rate damping dropped 1
// A2, A12 and A14 went 0 red the first time: nothing held the rate terms, the rudder's sideslip term or the target sanitising to a closed form (the captures and the sets pass without a damper that a slow vessel does not
// need). The three rows that now hold them are the closed forms in section 1 and 2. THE REAL FINDING WAS A4 BEFORE IT WAS A SABOTAGE: the gate's first run failed three rows on the autopilot as written -- the tank's
// velocity term had the wrong sign (a rising vessel was made lighter, so it rose more), the vessel hunted +-4 m at 0.3 m/s, and a larger tank gain did NOT shrink the steady error. Fixing the sign took the TRAIN score
// from -0.6148 to -0.5741 and made the gate's claims true. A gate written from the header's claims found what a tuning sweep (which only compared scores) had averaged over.
"use strict";
import * as A from "./autopilotSub.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as T from "./subTask.mjs";

const KEYS = ["pitch", "yaw", "thrust", "ballast"];
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const m = S.createSubModel(), K = A.AUTOPILOT_SUB, fly = (state, target, secs, we = 0, cur = [0, 0, 0], opts = {}) => { let s = state; for (let i = 0; i < Math.round(secs / S.DT); i++) { const r = S.stepSub(m, s, A.decide(s, target, cur, opts), S.DT, cur, we); s = r.state; if (r.status !== "submerged") return { s, status: r.status }; } return { s, status: "submerged" }; };

console.log("autopilotSub-selfcheck -- the hand-written submarine pilot\n");

console.log("1. THE LAWS");
{
    const tg = { depth: 30, heading: 0, speed: 2.5 }, st = S.createState({ depth: 30, speed: 2.5 }), c0 = A.decide(st, tg);
    ok("!! at the target and in trim every control is zero except the thrust, which is trim(target speed) to 1e-12", Math.abs(c0.pitch) < 1e-12 && Math.abs(c0.yaw) < 1e-12 && Math.abs(c0.ballast) < 1e-12 && Math.abs(c0.thrust - S.trim(m, 2.5).thrust) < 1e-12, JSON.stringify(c0));
    const deeper = A.decide(st, { ...tg, depth: 38 }), shallower = A.decide(st, { ...tg, depth: 22 });
    ok("!! a DEEPER target floods the tank (ballast > 0) and noses DOWN (pitch < 0, once the vessel is level the pitch command is the climb it needs); a shallower target blows the tank and noses UP", deeper.ballast > 0 && deeper.pitch < 0 && shallower.ballast < 0 && shallower.pitch > 0, `${deeper.ballast.toFixed(3)} ${deeper.pitch.toFixed(3)} / ${shallower.ballast.toFixed(3)} ${shallower.pitch.toFixed(3)}`);
    ok("!! a target to the RIGHT turns right (yaw > 0), to the left turns left; a slow vessel gets MORE thrust than trim and a fast one less", A.decide(st, { ...tg, heading: 0.5 }).yaw > 0 && A.decide(st, { ...tg, heading: -0.5 }).yaw < 0 && A.decide(S.createState({ depth: 30, speed: 1.5 }), tg).thrust > c0.thrust && A.decide(S.createState({ depth: 30, speed: 3.5 }), tg).thrust < c0.thrust);
    const sched = (V) => A.guidance(S.createState({ speed: V }), tg).sched;
    ok("!! the gain schedule is (2.5 / V)^2 clamped to [0.4, 4]: 1 at 2.5 m/s, 4 at 1.25 and at 0.5 (the V floor is 0.8: 9.77 clamped to 4), 0.4 at 5 m/s (0.25 clamped up)", Math.abs(sched(2.5) - 1) < 1e-9 && Math.abs(sched(1.25) - 4) < 1e-9 && sched(0.5) === 4 && sched(5) === 0.4 && Math.abs(sched(3.5) - (2.5 / 3.5) ** 2) < 1e-9);
    const kq = (q) => A.decide(S.createState({ depth: 30, speed: 2.5, w: [0, -q, 0] }), tg).pitch, kr = (r) => A.decide(S.createState({ depth: 30, speed: 2.5, w: [0, 0, -r] }), tg).yaw;
    ok("!! the rate terms are DAMPERS with their closed forms (level, on target, schedule 1 at 2.5 m/s): a nose-up pitch rate of 0.05 rad/s commands pitch -kQ x 0.05, a right yaw rate of 0.05 commands yaw -kR x 0.05, both to 1e-12 and odd in the rate", Math.abs(kq(0.05) + K.kQ * 0.05) < 1e-12 && Math.abs(kq(-0.05) - K.kQ * 0.05) < 1e-12 && Math.abs(kr(0.05) + K.kR * 0.05) < 1e-12 && Math.abs(kr(-0.05) - K.kR * 0.05) < 1e-12, `${kq(0.05).toFixed(4)} ${kr(0.05).toFixed(4)}`);
    const slip = S.createState({ depth: 30, speed: 2.5 }); slip.vel = [2.5, -0.2, 0];
    const slipA = A.guidance(slip, tg).att.beta;
    ok("!! sideslip is driven to zero: a vessel slipping RIGHT (beta > 0) is commanded yaw = -kBeta x beta exactly (on heading, level, schedule 1 -- the rudder's own term, which the schedule does not multiply)", slipA > 0.05 && Math.abs(A.decide(slip, tg).yaw + K.kBeta * slipA) < 1e-12, `beta ${slipA.toFixed(4)} yaw ${A.decide(slip, tg).yaw.toFixed(4)}`);
    const g = A.guidance(S.createState({ depth: 30, speed: 2.5 }), { depth: 130, heading: 0, speed: 2.5 });
    ok("!! the climb rate asked for is limited to 1 m/s and the pitch command to 0.3 rad however far the target is: a target 100 m deeper asks for exactly -1 m/s and -0.3 rad at 2.5 m/s (-1/2.5 = -0.4, clamped)", g.vzCmd === -K.vzMax && g.pitchCmd === -K.maxPitch, `${g.vzCmd} ${g.pitchCmd}`);
    ok("the heading error is WRAPPED: a target at +3.5 rad is a turn of -2.78 rad to the left, not 3.5 to the right", Math.abs(A.guidance(st, { ...tg, heading: 3.5 }).headingErr - (3.5 - 2 * Math.PI)) < 1e-12 && A.decide(st, { ...tg, heading: 3.5 }).yaw < 0);
}

console.log("\n2. NO MEMORY");
{
    const tg = { depth: 22, heading: 0.7, speed: 3 }, st = S.createState({ depth: 31, speed: 2, pitch: 0.1, bank: 0.1, w: [0.01, 0.02, 0.01] }), snap = JSON.stringify(st), tsnap = JSON.stringify(tg);
    const a = A.decide(st, tg), b = A.decide(st, tg);
    ok("!! decide() is a pure function: the same arguments give the identical answer, and it edits neither the state nor the target", JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(st) === snap && JSON.stringify(tg) === tsnap);
    const nf = A.decide(st, { depth: NaN, heading: Infinity, speed: undefined }), zero = A.decide(st, { depth: 0, heading: 0, speed: 0 });
    ok("!! a non-finite target field is read as 0: depth NaN, heading Infinity and speed undefined give EXACTLY the controls of a target of depth 0, heading 0, speed 0", KEYS.every((k) => nf[k] === zero[k]), JSON.stringify(zero));
    ok("a non-finite target is read as 0 and the controls are finite and in range", Object.values(nf).every((v) => Number.isFinite(v) && Math.abs(v) <= 1), JSON.stringify(nf));
    ok("pilot(opts) is the contract brain/subTask.mjs flies: (state, target, current) -> the same controls decide() gives, and a current changes the water-relative speed it reads", JSON.stringify(A.pilot()(st, tg)) === JSON.stringify(a) && A.guidance(st, tg, [1, 0, 0]).V !== A.guidance(st, tg).V);
}

console.log("\n3. THE CAPTURES");
{
    const d = (target, secs, start = {}) => { const o = { depth: 0, max: 0, s: null }; let s = S.createState({ depth: 30, speed: 2.5, ...start, model: m }); let mx = -Infinity; for (let i = 0; i < Math.round(secs / S.DT); i++) { s = S.stepSub(m, s, A.decide(s, target), S.DT).state; mx = Math.max(mx, S.attitude(s).depth); } return { a: S.attitude(s), max: mx }; };
    const down = d({ depth: 38, heading: 0, speed: 2.5 }, 60);
    ok("!! from trim a target 8 m deeper is held within 1 m by 60 s with no overshoot beyond 1.5 m (the deepest point of the dive is at most 39.5 m)", Math.abs(down.a.depth - 38) < 1 && down.max < 39.5, `${down.a.depth.toFixed(3)} (deepest ${down.max.toFixed(3)})`);
    const turn = d({ depth: 30, heading: Math.PI / 3, speed: 2.5 }, 60);
    ok("!! a 60-degree heading change is captured within 0.1 rad by 60 s with the vessel level (pitch within 0.05, depth within 1.5 m)", Math.abs(turn.a.heading - Math.PI / 3) < 0.1 && Math.abs(turn.a.pitch) < 0.05 && Math.abs(turn.a.depth - 30) < 1.5, `${turn.a.heading.toFixed(3)} pitch ${turn.a.pitch.toFixed(3)} depth ${turn.a.depth.toFixed(2)}`);
    const sp = d({ depth: 30, heading: 0, speed: 3.5 }, 60);
    ok("!! a 1 m/s speed increase is captured within 0.05 m/s by 60 s", Math.abs(sp.a.speed - 3.5) < 0.05, `${sp.a.speed.toFixed(4)}`);
    const all3 = d({ depth: 36, heading: -0.8, speed: 3 }, 90);
    ok("!! all three at once: depth within 1 m, heading within 0.1 rad, speed within 0.1 m/s by 90 s", Math.abs(all3.a.depth - 36) < 1 && Math.abs(all3.a.heading + 0.8) < 0.1 && Math.abs(all3.a.speed - 3) < 0.1, `${all3.a.depth.toFixed(2)} ${all3.a.heading.toFixed(3)} ${all3.a.speed.toFixed(3)}`);
}

console.log("\n4. WHAT IT CANNOT DO, MEASURED");
{
    const tg = { depth: 30, heading: 0, speed: 2.5 }, err = (opts) => { const r = fly(S.createState({ depth: 30, speed: 2.5, model: m }), tg, 120, 0.005, [0, 0, 0], opts); return S.attitude(r.s).depth - 30; };
    const e1 = err({}), e2 = err({ kBalD: 0.12 }), e0 = err({ kBalD: 0, kBalV: 0 });
    ok("!! a vessel 0.5% heavy is held off its depth by a STEADY error (no integrator): deeper than asked, bounded under 6 m, SMALLER with the tank on than off, and smaller again with a larger tank gain (kBalD 0.12 for 0.03)", e1 > 0.5 && e1 < 6 && e2 > 0 && e2 < e1 && e1 < e0, `tank off ${e0.toFixed(3)} m; 0.03: ${e1.toFixed(3)} m; 0.12: ${e2.toFixed(3)} m`);
    const slow = fly(S.createState({ depth: 30, speed: 0.3, model: m }), { depth: 24, heading: 0, speed: 0.3 }, 200);
    const hunt = (() => { let s = slow.s, lo = Infinity, hi = -Infinity; for (let i = 0; i < 50 * 30; i++) { s = S.stepSub(m, s, A.decide(s, { depth: 24, heading: 0, speed: 0.3 }), S.DT).state; const d = S.attitude(s).depth; lo = Math.min(lo, d); hi = Math.max(hi, d); } return hi - lo; })();
    ok("!! below the planes' schedule floor the tank does the work: a vessel crawling at 0.3 m/s reaches a target 6 m shallower within 1 m by 200 s (it settles 0.3 m past it: the tank has no integrator either) and does not hunt: the next 50 s move it less than 0.1 m", slow.status === "submerged" && Math.abs(S.attitude(slow.s).depth - 24) < 1 && Math.abs(S.attitude(slow.s).depth - 24) > 0.05 && hunt < 0.1, `${S.attitude(slow.s).depth.toFixed(3)} (spread ${hunt.toFixed(4)} m over the next 50 s)`);
}

console.log("\n5. THE SETS");
{
    const r = [T.TRAIN_SET, T.HELD_OUT_SET, T.BASELINE_SET].map((set) => T.evaluate(A.pilot(), set));
    ok("!! it ends none of the 88 dives on TRAIN, HELD_OUT and BASELINE early (it is the baseline: it must finish the job it is graded on)", r.every((x) => x.crashed === 0) && r.reduce((n, x) => n + x.runs.length, 0) === 88, r.map((x) => x.score.toFixed(4)).join(" "));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
