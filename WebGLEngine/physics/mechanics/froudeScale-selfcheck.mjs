// WebGLEngine/physics/mechanics/froudeScale-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node physics/mechanics/froudeScale-selfcheck.mjs      (~0.8 s)
//
// A BIGGER AIRCRAFT THE EXISTING PILOTS FLY UNCHANGED, HELD TO THE TRAINER'S FLIGHT. physics/mechanics/froudeScale.mjs scales a flight-model spec by dynamic similarity and wraps a pilot to be shown the trainer's world. The claim is a strong one -- that
// a bomber at any scale, flown by the wrapped trainer pilot at a tick sqrt(s) longer, makes THE TRAINER'S FLIGHT, scaled -- and it is held by flying both:
//
//   1  THE LAW      similarity(s) is the table (length s, area s^2, mass s^3, inertia s^5, force s^3, moment s^4, speed and time sqrt(s), acceleration 1); scaleSpec multiplies exactly the lengths, areas, mass, inertia, thrust, fade speed, contact points
//                   and touchdown sink speed by the law and leaves every non-dimensional number alone (aspect ratios, lift slopes, deflections, incidence, stall); it is frozen, named, the identity at s = 1, and refuses a scale that is not a positive number
//   2  THE TRIM     the controls that hold level flight at sqrt(s) V are the trainer's at V: the same stick, throttle, pitch attitude and angle of attack to 1e-9 (a closed consequence of the law, solved here by the model's own Newton solve), and the top
//                   level speed is sqrt(s) times the trainer's
//   3  THE WRAPPER  scalePilot shows a pilot position / s, velocity / sqrt(s), spin x sqrt(s), mass / s^3, inertia / s^5, a target altitude / s and airspeed / sqrt(s) (the heading unchanged), a wind / sqrt(s), the attitude as it is, and passes the four
//                   controls through; at s = 1 it is the pilot itself; it edits nothing it is handed
//   4  THE FLIGHT   the bomber at s = 1.5, 2 and 4, stepped at sqrt(s) times the trainer's tick and flown by the wrapped PD autopilot through a mission of three legs (a turn, a climb, a slow-down), is the trainer's flight to 1e-9 m in the trainer's
//                   units over 20 s -- position, velocity, spin and attitude -- and so is the fruit fly's hand-weights pilot; with the SAME tick instead (no sqrt(s)) it is not (the negative control: the time scale is part of the law)
//   5  THE GROUND   an aircraft nobody flies falls and ends the flight at the scaled time: at s = 2 and 4 the zero pilot's crash is on the same tick as the trainer's, in the same status
//
// SABOTAGE LOG -- THIRTY-FIVE, each applied to physics/mechanics/froudeScale.mjs in a scratch worktree, the gate run, the worktree restored; every one red by name (the number is how many rows went red):
//   K1 speed scales as s in similarity 1 | K2 time scales as s in similarity 1 | K3 inertia s^4 in similarity 1 | K4 mass s^2 in scaleSpec 7 | K5 inertia s^3 in scaleSpec 4 | K6 wing span not scaled 3
//   K7 tail station not scaled 4 | K8 wing area x s, not s^2 6 | K9 tail area x s 6 | K10 rudder area x s 5 | K11 fuselage drag area x s 6 | K12 thrust x s^2 6 | K13 the engine's fade speed not scaled 5
//   K14 the thrust line not scaled 1 | K15 the wheels not scaled 2 | K16 the hull points not scaled 2 | K17 the touchdown sink speed not scaled 1 | K18 the wing aspect ratio scaled too 5
//   K19 the scaled spec keeps the trainer's name 1 | K20 the scaled spec not frozen 1 | K21 the pilot's position not scaled 3 | K22 the pilot's velocity divided by s 3
//   K23 the pilot's spin divided, not multiplied, by sqrt(s) 3 | K24 the pilot's mass not scaled 1 | K25 the pilot's inertia (a vector) /s^3 1 | K26 the pilot's inertia (I) not scaled 1
//   K27 the target altitude multiplied 3 | K28 the target airspeed divided by s 3 | K29 the wind divided by s 1 | K30 scalePilot wraps even at s = 1 1 | K31 the wrapper flips the pitch control 3
//   K32 the wrapper passes the wind unscaled 1 | K33 scaleModel builds the unscaled spec 5 | K34 a scale of 0 is accepted 1 | K35 the report says NaN 1
// K25 (the pilot's inertia, written as a vector under the name 'inertia') went 0 red the first time: every state the gate built is a rigid body, which names its inertia I -- a row now hands scaleState a plain state that names it inertia.
"use strict";
import * as S from "./froudeScale.mjs";
import * as F from "./flightModel6dof.mjs";
import * as AF from "../../brain/autopilotFlight.mjs";
import * as PF from "../../brain/pilotFlightPolicy.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const near = (a, b, tol) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol * Math.max(1, Math.abs(b[i])));
const mul = (a, k) => a.map((v) => v * k);
const T = F.TRAINER, tm = F.createFlightModel(T);

console.log("froudeScale-selfcheck -- a bigger aircraft the existing pilots fly unchanged\n");

console.log("1. THE LAW");
{
    const s = 3, k = Math.sqrt(s), law = S.similarity(s), sp = S.scaleSpec(T, s), A = T.airframe, B = sp.airframe;
    ok("!! similarity(s) is the table: length s, area s^2, volume and mass s^3, inertia s^5, force s^3, moment s^4, speed and time sqrt(s), angular rate 1/sqrt(s), acceleration 1 (gravity is g), altitude s",
        law.length === s && law.area === 9 && law.volume === 27 && law.mass === 27 && law.inertia === 243 && law.force === 27 && law.moment === 81 && Math.abs(law.speed - k) < 1e-15 && Math.abs(law.time - k) < 1e-15 && Math.abs(law.angularRate - 1 / k) < 1e-15 && law.acceleration === 1 && law.altitude === 3 && Object.isFrozen(law));
    ok("!! scaleSpec scales the LENGTHS by s (wing mount, tail station, thrust line, wheels, hull), the AREAS by s^2 (wing, tail, rudder, the fuselage's drag area), the MASS by s^3, the INERTIA by s^5, the THRUST by s^3, the engine's fade speed by sqrt(s) and the touchdown sink speed by sqrt(s)",
        B.wingSpanHalf === A.wingSpanHalf * 3 && B.tailMountX === A.tailMountX * 3 && sp.thrustPoint.every((v, i) => v === T.thrustPoint[i] * 3) && sp.wheels.every((p, i) => p.every((v, j) => v === T.wheels[i][j] * 3)) && sp.hull.every((p, i) => p.every((v, j) => v === T.hull[i][j] * 3))
        && B.wingArea === A.wingArea * 9 && B.tailArea === A.tailArea * 9 && B.rudderArea === A.rudderArea * 9 && sp.parasiteArea === T.parasiteArea * 9 && sp.mass === T.mass * 27 && sp.inertia.every((v, i) => v === T.inertia[i] * 243)
        && sp.thrustMax === T.thrustMax * 27 && Math.abs(sp.propSpeed - T.propSpeed * k) < 1e-12 && Math.abs(sp.touchdown.maxSink - T.touchdown.maxSink * k) < 1e-12);
    ok("!! and leaves every NON-DIMENSIONAL number alone: the aspect ratios, the lift slopes, the control deflections, the wing incidence, the stall (its angles) and the touchdown's bank and pitch limits",
        B.wingAspectRatio === A.wingAspectRatio && B.wingClAlpha === A.wingClAlpha && B.tailAspectRatio === A.tailAspectRatio && B.tailClAlpha === A.tailClAlpha && B.elevatorMaxDeflection === A.elevatorMaxDeflection && B.aileronMaxDeflection === A.aileronMaxDeflection && B.rudderMaxDeflection === A.rudderMaxDeflection
        && sp.wingIncidence === T.wingIncidence && sp.stall === T.stall && sp.touchdown.maxBank === T.touchdown.maxBank && sp.touchdown.minPitch === T.touchdown.minPitch && sp.touchdown.maxPitch === T.touchdown.maxPitch);
    const id = S.scaleSpec(T, 1);
    ok("the scaled spec is frozen all the way down (the spec, the airframe, the inertia, the points), is named for its scale ('trainer x3'), and at s = 1 is the trainer's own numbers", Object.isFrozen(sp) && Object.isFrozen(sp.airframe) && Object.isFrozen(sp.inertia) && Object.isFrozen(sp.hull[0]) && Object.isFrozen(sp.wheels) && sp.name === "trainer x3" && id.name === "trainer" && id.mass === T.mass && id.thrustMax === T.thrustMax && id.airframe.wingArea === A.wingArea);
    const bad = (x) => { try { S.scaleSpec(T, x); return null; } catch (e) { return e.message; } };
    ok("!! a scale that is not a positive finite number is refused, by name: 0, -2, NaN, Infinity, and the same from scaleState, scaleTarget, scaleWind, scalePilot and similarity", [0, -2, NaN, Infinity].every((x) => /positive finite/.test(bad(x) || "")) && [() => S.scaleState({ pos: [0, 0, 0], vel: [0, 0, 0], w: [0, 0, 0] }, 0), () => S.scaleTarget({ altitude: 1, airspeed: 1 }, -1), () => S.scaleWind([0, 0, 0], NaN), () => S.scalePilot(() => 0, 0), () => S.similarity(-3)].every((f) => { try { f(); return false; } catch (e) { return /positive finite/.test(e.message); } }));
}

console.log("\n2. THE TRIM");
{
    const rows = [];
    for (const s of [1.5, 2, 4]) { const m = S.scaleModel(tm, s), k = Math.sqrt(s); for (const v of [32, 40, 48]) { const a = F.trim(tm, v), b = F.trim(m, v * k); rows.push([s, v, a, b]); } }
    const worst = Math.max(...rows.map(([s, v, a, b]) => Math.max(Math.abs(a.pitch - b.pitch), Math.abs(a.throttle - b.throttle), Math.abs(a.pitchAttitude - b.pitchAttitude), Math.abs(a.alpha - b.alpha))));
    ok("!! the controls that hold level flight at sqrt(s) V are the TRAINER'S at V: at s = 1.5, 2 and 4 and V = 32, 40 and 48 m/s the stick, the throttle, the pitch attitude and the angle of attack agree to 1e-8 (the model's own Newton solve, run on each)", rows.every(([s, v, a, b]) => a.converged && b.converged && a.feasible && b.feasible) && worst < 1e-8, `worst ${worst.toExponential(2)}`);
    const top = F.maxLevelSpeed(tm), top2 = F.maxLevelSpeed(S.scaleModel(tm, 2), 40 * Math.SQRT2, 90 * Math.SQRT2), top4 = F.maxLevelSpeed(S.scaleModel(tm, 4), 40 * 2, 90 * 2);
    ok("!! the top level speed is sqrt(s) times the trainer's (52.8 m/s): 74.7 at s = 2 and 105.6 at s = 4, to 1e-3", Math.abs(top2 - top * Math.SQRT2) < 1e-3 && Math.abs(top4 - top * 2) < 1e-3, `${top.toFixed(2)} -> ${top2.toFixed(2)}, ${top4.toFixed(2)}`);
}

console.log("\n3. THE WRAPPER");
{
    const seen = []; const rec = (state, target, wind) => { seen.push({ state, target, wind }); return { pitch: 0.1, roll: -0.2, yaw: 0.3, throttle: 0.4 }; };
    const s = 4, k = 2, st = F.createState({ pos: [100, -200, 600], speed: 90, heading: 0.7, pitch: 0.1, bank: 0.2, w: [0.01, 0.02, -0.03], mass: 64000, inertia: [1300 * 1024, 1800 * 1024, 2700 * 1024] });
    const snapshot = JSON.stringify(st), tgt = { heading: 0.5, altitude: 800, airspeed: 100 }, tsnap = JSON.stringify(tgt), wind = [8, -4, 0], wsnap = JSON.stringify(wind);
    const out = S.scalePilot(rec, s)(st, tgt, wind), v = seen[0];
    ok("!! the pilot is SHOWN the trainer's world: position / s, velocity / sqrt(s), spin x sqrt(s), mass / s^3, inertia / s^5; the attitude (the quaternion) as it is", near(v.state.pos, mul(st.pos, 1 / s), 1e-15) && near(v.state.vel, mul(st.vel, 1 / k), 1e-15) && near(v.state.w, mul(st.w, k), 1e-15) && Math.abs(v.state.mass - 1000) < 1e-9 && near(v.state.I || v.state.inertia, [1300, 1800, 2700], 1e-12) && v.state.q.every((q, i) => q === st.q[i]));
    ok("!! the target is shown in the trainer's units -- altitude / s, airspeed / sqrt(s), the heading AS IT IS -- and so is the wind (/ sqrt(s)); the four controls come back untouched", v.target.altitude === 200 && v.target.airspeed === 50 && v.target.heading === 0.5 && near(v.wind, [4, -2, 0], 1e-15) && out.pitch === 0.1 && out.roll === -0.2 && out.yaw === 0.3 && out.throttle === 0.4);
    ok("it edits nothing it is handed (the state, the target and the wind are as they were), and at s = 1 the wrapper IS the pilot (the same function)", JSON.stringify(st) === snapshot && JSON.stringify(tgt) === tsnap && JSON.stringify(wind) === wsnap && S.scalePilot(rec, 1) === rec);
    const lazy = S.scalePilot(rec, 2)(st, tgt);
    const plain = S.scaleState({ pos: [8, 0, 0], vel: [0, 0, 0], w: [0, 0, 0], q: [1, 0, 0, 0], mass: 8000, inertia: [32, 64, 96] }, 2);
    ok("!! a state that names its inertia `inertia` (not the rigid body's `I`) has it divided by s^5 too: 32, 64, 96 at s = 2 is 1, 2, 3, and a state with neither carries neither", near(plain.inertia, [1, 2, 3], 1e-15) && !("I" in plain) && !("mass" in S.scaleState({ pos: [0, 0, 0], vel: [0, 0, 0], w: [0, 0, 0] }, 2)) && !("inertia" in S.scaleState({ pos: [0, 0, 0], vel: [0, 0, 0], w: [0, 0, 0] }, 2)));
    ok("a pilot called with no wind is shown still air", near(seen[1].wind, [0, 0, 0], 0) && lazy.throttle === 0.4);
    const trained = PF.pilotFor(PF.handWeights()), c1 = trained(F.createState({ pos: [0, 0, 300], speed: 45, heading: 0.3, bank: 0.1 }), tgt, [0, 0, 0]), c2 = S.scalePilot(trained, 1)(F.createState({ pos: [0, 0, 300], speed: 45, heading: 0.3, bank: 0.1 }), tgt, [0, 0, 0]);
    ok("a real pilot at s = 1 gives the same controls through the wrapper to the bit", c1.pitch === c2.pitch && c1.roll === c2.roll && c1.yaw === c2.yaw && c1.throttle === c2.throttle);
}

console.log("\n4. THE FLIGHT");
{
    const mission = (t) => (t < 7 ? { heading: 0.6, altitude: 300, airspeed: 45 } : t < 14 ? { heading: 0.6, altitude: 340, airspeed: 45 } : { heading: -0.3, altitude: 340, airspeed: 40 });
    const fly = (pilot, s, scaleTick = true, seconds = 20, stateOverride = null) => {
        const k = Math.sqrt(s), model = S.scaleModel(tm, s), dtT = 1 / 60, dtB = scaleTick ? dtT * k : dtT, pw = S.scalePilot(pilot, s);
        let st = F.createState({ pos: [0, 0, 300 * s], speed: 45 * k, heading: 0.1, pitch: 0.03, mass: model.mass, inertia: model.inertia });
        const T0 = F.createState({ pos: [0, 0, 300], speed: 45, heading: 0.1, pitch: 0.03 }); let tt = T0, worst = 0, worstQ = 0, maxAlt = 0, maxHdg = -9;
        const n = Math.round(seconds / dtT);
        for (let i = 0; i < n; i++) {
            const t = i * dtT, tgt = mission(t), tgtB = { heading: tgt.heading, altitude: tgt.altitude * s, airspeed: tgt.airspeed * k };
            tt = F.stepFlight(tm, tt, pilot(tt, tgt, [0, 0, 0]), dtT).state; st = F.stepFlight(model, st, pw(st, tgtB, [0, 0, 0]), dtB).state;
            const p = mul(st.pos, 1 / s), v = mul(st.vel, 1 / k), w = mul(st.w, k);
            worst = Math.max(worst, Math.hypot(tt.pos[0] - p[0], tt.pos[1] - p[1], tt.pos[2] - p[2]), Math.hypot(tt.vel[0] - v[0], tt.vel[1] - v[1], tt.vel[2] - v[2]), Math.hypot(tt.w[0] - w[0], tt.w[1] - w[1], tt.w[2] - w[2]));
            worstQ = Math.max(worstQ, ...tt.q.map((q, j) => Math.abs(q - st.q[j]))); maxAlt = Math.max(maxAlt, tt.pos[2]); maxHdg = Math.max(maxHdg, F.attitude(tt).heading);
        }
        return { worst, worstQ, final: tt.pos, alt: tt.pos[2], hdg: F.attitude(tt).heading, maxAlt, maxHdg };
    };
    for (const [pname, pilot] of [["the PD autopilot", AF.pilot], ["the fruit fly's hand weights", PF.pilotFor(PF.handWeights())]]) {
        const rs = [1.5, 2, 4].map((s) => [s, fly(pilot, s)]);
        ok(`!! ${pname} FLIES THE BOMBER'S FLIGHT AS THE TRAINER'S: at s = 1.5, 2 and 4, stepped at sqrt(s) times the tick, a mission of a turn, a climb and a slow-down for 20 s (trainer time) -- position, velocity and spin in the trainer's units agree to 1e-9 and the attitude quaternion to 1e-12`,
            rs.every(([, r]) => r.worst < 1e-9 && r.worstQ < 1e-12), rs.map(([s, r]) => `s${s}: ${r.worst.toExponential(1)}`).join(", "));
    }
    const ref = fly(AF.pilot, 2);
    ok("!! the mission is a flight and not two aircraft sitting still: the trainer climbs past 325 m, turns right past 0.55 rad toward the first heading and back left of 0.3 toward the last, and ends airborne with a finite state", ref.maxAlt > 325 && ref.maxHdg > 0.55 && ref.hdg < 0.3 && ref.final.every(Number.isFinite), `max altitude ${ref.maxAlt.toFixed(1)}, heading up to ${ref.maxHdg.toFixed(2)}, ends at ${ref.hdg.toFixed(2)}`);
    const wrong = fly(AF.pilot, 2, false);
    ok("!! THE TIME SCALE IS PART OF THE LAW: with the SAME tick (1/60 s, not sqrt(2) longer) the bomber is not the trainer's flight (by more than 0.01 m in the trainer's units)", wrong.worst > 0.01, `${wrong.worst.toExponential(2)}`);
}

console.log("\n5. THE GROUND");
{
    const zero = () => ({ pitch: 0, roll: 0, yaw: 0, throttle: 0 });
    const down = (s) => {
        const k = Math.sqrt(s), model = S.scaleModel(tm, s), dt = (1 / 60) * k; let st = F.createState({ pos: [0, 0, 120 * s], speed: 45 * k, heading: 0, mass: model.mass, inertia: model.inertia }), n = 0, status = "airborne";
        while (status === "airborne" && n < 20000) { const r = F.stepFlight(model, st, zero(), dt); st = r.state; status = r.status; n++; }
        return { n, status };
    };
    const a = down(1), b = down(2), c = down(4);
    ok("!! an aircraft nobody flies falls and the flight ends on the SAME TICK in the same status at s = 1, 2 and 4 (the ground is at the scaled height and the tick the scaled time)", a.status !== "airborne" && b.status === a.status && c.status === a.status && b.n === a.n && c.n === a.n, `${a.n} / ${b.n} / ${c.n} ticks, ${a.status}`);
}

console.log("\n6. THE FRONT DOOR");
{
    const lines = S.reportLines();
    ok("!! the export list is pinned: reportLines, scaleModel, scalePilot, scaleSpec, scaleState, scaleTarget, scaleWind, similarity", Object.keys(S).sort().join(",") === "reportLines,scaleModel,scalePilot,scaleSpec,scaleState,scaleTarget,scaleWind,similarity", Object.keys(S).sort().join(","));
    ok("the report lines say real numbers (no NaN, no undefined) and give the s = 4 bomber: 64,000 kg and thrust 256,000 N", lines.length === 2 && lines.every((l) => !/NaN|undefined/.test(l)) && /64000 kg/.test(lines[1]) && /256000 N/.test(lines[1]), lines[1]);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
