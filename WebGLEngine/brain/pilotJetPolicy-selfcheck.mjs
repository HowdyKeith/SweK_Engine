// WebGLEngine/brain/pilotJetPolicy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/pilotJetPolicy-selfcheck.mjs      (~3.5 s)
//
// THE SIBLING GATE OF brain/pilotJetPolicy.mjs: the fruit fly's 34-neuron circuit as the JET's pilot, whose hand weights are the jet's fighting autopilot written through it. The network itself (the circuit, the forward pass, the weight layout) is the trainer's pilot's and is held by brain/pilotFlightPolicy-selfcheck.mjs; what this module adds is a
// reading of the jet's senses into eighteen numbers and a set of weights, and the claim worth a gate is the same one: THE WEIGHTS ARE THE AUTOPILOT, to float32 -- in the jet's whole envelope, and in a fight.
//
//   1  SHAPE                the network is the trainer's, not a copy of it (the very functions re-exported); the feature names differ from the trainer's at exactly five places; the jet's gains are the fighting pilot's; the limiter's neuron is the first the trainer's hand weights leave free
//   2  THE FEATURES         the fourteen the trainer's pilot reads are the trainer's, two with the wider clamp the jet needs; the other four are the schedule (twice), the upright-weighted angle of attack and pitch rate, and `upright`: each restated here from the guidance record; on trim they are the numbers the header says; the trainer's feature function is not disturbed by this one
//   3  THE HAND WEIGHTS     34 non-zero (the trainer's 30 and the limiter's 4) at the values the laws make them; over 1,500 random states (any attitude, 70 to 190 m/s, 300 to 8,000 m, spinning, in a wind, any target, including a climb at 86 m/s) the four controls are the autopilot's to 2e-6; the limiter neuron is the limiter, to the bit of the formula
//   4  THE FLIGHT           the 24 jet fights fly the same fights as the hand pilot (every hit, round, status and tick; a score difference of exactly 0); the cruise gains written the same way fly the cruise pilot's altitude step; the trainer's gains write the trainer's weights
//   5  THE FRONT DOOR
//
// SABOTAGE LOG -- TWENTY-SEVEN, each applied to brain/pilotJetPolicy.mjs in a scratch tree, the gate run, the tree discarded; every one red by name (the number is how many rows went red):
//   JP01 the bank compensation not scheduled 5 | JP02 the climb pull always scheduled 1 | JP03 the climb pull never scheduled 5 | JP04 the speed error clamped at 60 m/s 1 | JP05 the climb rate clamped at 60 m/s 3 |
//   JP06 the angle of attack not weighted by upright 3 | JP07 the angle of attack scale 0.1 5 | JP08 the pitch rate not weighted by upright 3 | JP09 the pitch rate scale 0.25 4 | JP10 the upright feature is 1 3 |
//   JP11 the pitch rate has the wrong sign 6 | JP12 no schedule 5 | JP13 the features ignore the gains' flags 5 | JP14 the limiter reads the angle of attack at half scale 5 | JP15 the limiter without the lead's gain 4 |
//   JP16 the limiter without kAlpha in the limit 6 | JP17 the limiter adds stick 5 | JP18 a limiter written for every gain set 2 | JP19 the limiter on the throttle's second neuron 8 | JP20 the pilot ignores its gains 1 |
//   JP21 the features read the trainer's airframe 5 | JP22 a feature name not changed 1 | JP23 the jet's gains are the cruise gains 3 | JP24 forward is a wrapper 1 | JP25 the report says undefined 1 |
//   JP26 the climb clamp upper bound only 3 | JP27 the speed-error scale 20 5
//   WHAT THE FIRST RUNS FOUND, in the rows and in the module: (1) THE TRAINER'S CLAMPS ARE WRONG FOR A JET: the first random-state row (1,500 states) found 0.52 of throttle wrong in a climb of 86 m/s -- the trainer's climb-rate feature is clamped at 60 m/s of climb and its speed-error feature at 60 m/s of error, far outside what a 45 m/s aircraft does and inside what a jet does -- so features 10 and 11 carry wider clamps (24 and 40) and the steep-climb row exists because of it
//   (JP04, JP05 and JP26 are its mutants); (2) the pitch rate of the state is MINUS the body y rate, which the limiter row had backwards on its first run; (3) the cruise-gains flight ends 5e-2 m from the hand pilot's after 40 s (float32 weights, integrated), not 1e-3; (4) the climb-pull row first asked a state with no climb error for a scheduled climb error (a factor of 3 on zero); (5) a NaN is read as 0 but an infinity is CLAMPED to the feature's bound (12 for the pitch rate), as the trainer's features do.
"use strict";
import * as PJ from "./pilotJetPolicy.mjs";
import * as PF from "./pilotFlightPolicy.mjs";
import * as AF from "./autopilotFlight.mjs";
import * as JF from "./jetFight.mjs";
import * as D from "./dogfightTask.mjs";
import * as F from "../physics/mechanics/flightModel6dof.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const KEYS = ["pitch", "roll", "yaw", "throttle"];
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const jet = AF.jetModel(), G = AF.AUTOPILOT_JET_FIGHT, GC = AF.AUTOPILOT_JET;
const jetState = (o) => F.createState({ mass: jet.mass, inertia: jet.inertia, ...o });
const level = (V, alt, o = {}) => jetState({ pos: [0, 0, alt], speed: V, pitch: F.trim(jet, V, { altitude: alt }).pitchAttitude, ...o });
const gdOf = (s, t, wind = [0, 0, 0], gains = G) => AF.guidance(s, t, wind, { ...gains, model: jet });

console.log("pilotJetPolicy-selfcheck -- the fruit fly's circuit as the jet's pilot\n");

console.log("1. SHAPE");
{
    ok("!! THE NETWORK IS THE TRAINER'S PILOT'S, RE-EXPORTED AND NOT COPIED: 18 features, 34 neurons, 313 synapses, 4 outputs, 1,099 weights; forward, layersOf, zeroWeights, perturb and mutate are the very functions of pilotFlightPolicy (so the circuit's gate holds them here too)", PJ.FEATURES === 18 && PJ.HIDDEN === 34 && PJ.REC_EDGES === 313 && PJ.OUTPUTS === 4 && PJ.WEIGHT_COUNT === 1099 && PJ.REC_STEPS === 3 && PJ.forward === PF.forward && PJ.layersOf === PF.layersOf && PJ.zeroWeights === PF.zeroWeights && PJ.perturb === PF.perturb && PJ.mutate === PF.mutate && PJ.OUTPUT_NAMES === PF.OUTPUT_NAMES);
    const diff = PF.FEATURE_NAMES.map((n, i) => (PJ.FEATURE_NAMES[i] !== n ? i : -1)).filter((i) => i >= 0);
    ok("!! THE FEATURE NAMES DIFFER FROM THE TRAINER'S AT EXACTLY FIVE PLACES (3, 4, 12, 13 and 14: the scheduled bank compensation and climb pull, the upright-weighted angle of attack and pitch rate, and `upright`) and are frozen, so a weight file for one layout can be refused for the other by its names", diff.join() === "3,4,12,13,14" && PJ.FEATURE_NAMES.length === 18 && Object.isFrozen(PJ.FEATURE_NAMES) && PJ.FEATURE_NAMES[3] === "bankCompScheduled" && PJ.FEATURE_NAMES[4] === "climbErrScheduled" && PJ.FEATURE_NAMES[12] === "alphaUpright" && PJ.FEATURE_NAMES[13] === "pitchRateUpright" && PJ.FEATURE_NAMES[14] === "upright");
    ok("the jet's gains are the fighting pilot's (the very object), and the limiter's neuron is the ninth: the first the trainer's hand weights leave free (they use a pair of channels for each of the four outputs)", PJ.JET_GAINS === AF.AUTOPILOT_JET_FIGHT && PJ.LIMITER_NEURON === 8 && PF.handWeights().slice(8 * 18, 9 * 18).every((v) => v === 0));
}

console.log("\n2. THE FEATURES");
{
    const rnd = mulberry(99), states = [];
    for (let i = 0; i < 300; i++) { const alt = 300 + rnd() * 7000; states.push([jetState({ pos: [0, 0, alt], speed: 70 + rnd() * 120, pitch: rnd() * 1.2 - 0.6, bank: rnd() * 6 - 3, heading: rnd() * 6 - 3, gamma: rnd() - 0.5, w: [rnd() * 2 - 1, rnd() - 0.5, rnd() - 0.5] }), { altitude: alt + rnd() * 1000 - 500, heading: rnd() * 6 - 3, airspeed: 80 + rnd() * 100 }, [rnd() * 30 - 15, rnd() * 30 - 15, rnd() * 6 - 3]]); }
    let bad = [];
    for (const [s, t, wv] of states) {
        const gd = gdOf(s, t, wv), x = PJ.featuresFrom(gd), y = PF.featuresFrom(gd), sc = AF.gainSchedule(gd, { ...AF.AUTOPILOT_FLIGHT, ...G });
        for (const i of [0, 1, 2, 5, 6, 7, 8, 9, 15, 16, 17]) if (x[i] !== y[i]) bad.push("f" + i);
        if (x[3] !== y[3] * sc) bad.push("f3");
        if (x[4] !== y[4] * sc) bad.push("f4");
        if (x[10] !== clamp(gd.speedErr / 10, -24, 24)) bad.push("f10");
        if (x[11] !== clamp(gd.climb / 5, -40, 40)) bad.push("f11");
        if (x[12] !== clamp(gd.upright * gd.att.alpha / 0.2, -8, 8)) bad.push("f12");
        if (x[13] !== clamp(gd.upright * gd.rates.pitch / 0.5, -12, 12)) bad.push("f13");
        if (x[14] !== gd.upright) bad.push("f14");
        if (x.length !== 18 || !x.every(Number.isFinite)) bad.push("shape");
    }
    ok("!! 300 RANDOM JET STATES (any attitude, 70 to 190 m/s, 300 to 7,300 m, spinning, in a wind): features 0, 1, 2, 5-9 and 15-17 are the trainer's to the bit; 3 and 4 are the trainer's times the gain schedule; 10 and 11 are the speed error / 10 and the climb rate / 5 with the jet's wider clamps (24 and 40); 12, 13 and 14 are upright x alpha / 0.2, upright x pitch rate / 0.5 and upright -- each restated here from the guidance record", bad.length === 0, bad.slice(0, 5).join(" "));
    const trimmed = PJ.features(level(140, 3000), { altitude: 3000, heading: 0, airspeed: 140 });
    ok("!! ON TRIM, ON TARGET, AT 140 M/S AND 3,000 M: feature 0 is 1, feature 1 the trim stick (0.118) and 2 the trim throttle (0.513); every error feature is 0 (to 1e-3: the trim table is interpolated), `upright` is 1, and the angle of attack over 0.2 is the 0.0104 rad of a jet at that speed in that air", trimmed[0] === 1 && near(trimmed[1], F.trim(jet, 140, { altitude: 3000 }).pitch, 3e-3) && near(trimmed[2], F.trim(jet, 140, { altitude: 3000 }).throttle, 3e-3) && [3, 4, 5, 6, 7, 8, 10, 11, 13, 15, 17].every((i) => Math.abs(trimmed[i]) < 1e-3) && trimmed[14] === 1 && trimmed[12] > 0.03 && trimmed[12] < 0.2, `stick ${trimmed[1].toFixed(4)}, throttle ${trimmed[2].toFixed(4)}, alpha/0.2 ${trimmed[12].toFixed(4)}`);
    const banked = (eas) => { const alt = 0, V = eas, s = jetState({ pos: [0, 0, alt], speed: V, pitch: 0.05, bank: 1.0 }); return gdOf(s, { altitude: alt + 100, heading: 0, airspeed: V }); };
    const g70 = banked(70), g140 = banked(140), g200 = banked(200);
    ok("!! THE SCHEDULE IS IN FEATURES 3 AND 4: the same bank flown at 70, 140 and 200 m/s at sea level gives a feature 3 that is the trainer's times 3 (the schedule's ceiling), 1 and 0.49 -- so it falls as the dynamic pressure rises -- and a gain set that does not schedule the climb (the cruise gains with the flag off) leaves feature 4 as the trainer's", [g70, g140, g200].every((g, i) => near(PJ.featuresFrom(g)[3], PF.featuresFrom(g)[3] * [3, 1, 0.49][i], 1e-9)) && PJ.featuresFrom(g70)[3] > PJ.featuresFrom(g140)[3] && PJ.featuresFrom(g140)[3] > PJ.featuresFrom(g200)[3]
        && PJ.featuresFrom(g70, { ...G, scheduleClimb: false })[4] === PF.featuresFrom(g70)[4] && near(PJ.featuresFrom(g70, G)[4], PF.featuresFrom(g70)[4] * 3, 1e-9) && g70.climbErr !== 0);
    const inv = gdOf(jetState({ pos: [0, 0, 3000], speed: 140, bank: 3.0, pitch: 0.2, w: [0, 0.3, 0] }), { altitude: 3100, heading: 0, airspeed: 140 }), xi = PJ.featuresFrom(inv);
    ok("!! UPRIGHT TAKES THE PULL OUT TOGETHER: an inverted jet (bank 3.0 rad) has `upright` 0, and so features 1, 3, 4, 12 and 13 are all exactly 0 (the stick, the bank compensation, the climb pull, and the limiter's two inputs) while the pitch rate over 0.5 (feature 5) and the angle of attack's unweighted trainer reading are not", inv.upright === 0 && xi[14] === 0 && [1, 3, 4, 12, 13].every((i) => xi[i] === 0) && Math.abs(xi[5]) > 0.3);
    const gd = gdOf(level(150, 2000, { bank: 0.5 }), { altitude: 2300, heading: 0.5, airspeed: 150 }), before = JSON.stringify(PF.featuresFrom(gd));
    PJ.featuresFrom(gd); PJ.featuresFrom(gd, GC);
    ok("the trainer's feature function is not disturbed by the jet's (nothing is shared or edited in place): the trainer's eighteen numbers for the same record are the same before and after, bit for bit, and are a fresh array each call", JSON.stringify(PF.featuresFrom(gd)) === before && PF.featuresFrom(gd) !== PF.featuresFrom(gd) && PJ.featuresFrom(gd) !== PJ.featuresFrom(gd));
    const nan = PJ.featuresFrom({ ...gd, att: { ...gd.att, alpha: NaN }, rates: { ...gd.rates, pitch: Infinity }, speedErr: NaN, climb: NaN });
    ok("a NaN or an infinity in the record gives finite features (the same rule as the trainer's: a NaN is read as 0, an infinity is clamped to the feature's bound -- 12 for the pitch rate)", nan.length === 18 && nan.every(Number.isFinite) && nan[10] === 0 && nan[11] === 0 && nan[12] === 0 && nan[13] === 12);
}

console.log("\n3. THE HAND WEIGHTS ARE THE AUTOPILOT");
{
    const w = PJ.handWeights(), pf = PF.handWeights(G), nz = []; w.forEach((v, i) => { if (v !== 0) nz.push(i); });
    const row = 8 * 18, outBase = 18 * 34 + 34 + 313;
    ok("!! 34 NON-ZERO WEIGHTS: the trainer's hand weights with the jet's gains (30: 22 in the first layer, 8 out) and the limiter's four -- three into neuron 8 (0.2 kAlpha = 2.4 on the upright angle of attack, 0.5 lead kAlpha = 3 on the upright pitch rate, -limit kAlpha = -1.56 on `upright`) and one out of it into the pitch (-1) -- and nothing else", nz.length === 34 && w.every((v, i) => (i >= row && i < row + 18) || i === outBase + 8 ? true : v === pf[i]) && near(w[row + 12], 2.4, 1e-6) && near(w[row + 13], 3, 1e-6) && near(w[row + 14], -1.56, 1e-6) && w[outBase + 8] === -1 && w[row + 12 - 1] === 0 && nz.filter((i) => i >= row && i < row + 18).join() === `${row + 12},${row + 13},${row + 14}`);
    ok("...and the trainer's own gains write the trainer's own weights (no limiter in them): handWeights(AUTOPILOT_FLIGHT) is PF.handWeights() to the bit, 30 non-zero; the cruise gains write a limiter with the cruise pilot's numbers (0.13 and 12 and a lead of 0.5 s, the same) and a bank compensation of 0.3", JSON.stringify(Array.from(PJ.handWeights(AF.AUTOPILOT_FLIGHT))) === JSON.stringify(Array.from(PF.handWeights())) && PJ.handWeights(AF.AUTOPILOT_FLIGHT).filter((v) => v !== 0).length === 30 && near(PJ.handWeights(GC)[3], 0.3, 1e-6) && near(PJ.handWeights(GC)[row + 14], -1.56, 1e-6));
    const hand = PJ.pilotFor(w), rnd = mulberry(4242); let worst = 0, worstAt = "";
    for (let i = 0; i < 1500; i++) {
        const alt = 300 + rnd() * 7700;
        const st = jetState({ pos: [0, 0, alt], speed: 70 + rnd() * 120, heading: rnd() * 6 - 3, pitch: rnd() * 1.2 - 0.6, bank: rnd() * 6.2 - 3.1, gamma: rnd() - 0.5, w: [rnd() * 2 - 1, rnd() - 0.5, rnd() - 0.5] });
        const tg = { altitude: alt + rnd() * 1000 - 500, heading: rnd() * 6 - 3, airspeed: 80 + rnd() * 100 }, wv = [rnd() * 30 - 15, rnd() * 30 - 15, rnd() * 6 - 3];
        const a = AF.decide(st, tg, wv, { ...G, model: jet }).controls, b = hand(st, tg, wv);
        for (const k of KEYS) if (Math.abs(a[k] - b[k]) > worst) { worst = Math.abs(a[k] - b[k]); worstAt = `${k} #${i}`; }
    }
    ok("!! OVER 1,500 RANDOM JET STATES (any attitude, 70 to 190 m/s, 300 to 8,000 m, spinning, a wind of up to 15 m/s, any target within 500 m and 100 m/s of the jet's own) THE NETWORK'S FOUR CONTROLS ARE THE AUTOPILOT'S TO 2e-6 (float32 weights)", worst < 2e-6, `worst ${worst.toExponential(2)} (${worstAt})`);
    const lim = (alpha, q) => { const s = jetState({ pos: [0, 0, 2000], speed: 120, pitch: alpha, bank: 0 }); s.w = [0, -q, 0]; return s; };   // the pitch rate is minus the body y rate
    const T0 = { altitude: 2000, heading: 0, airspeed: 120 };
    const withL = (s) => hand(s, T0).pitch, noL = (s) => PJ.pilotFor(PJ.handWeights({ ...G, alphaLimit: 0 }))(s, T0).pitch;
    const s1 = lim(0.25, 0), s2 = lim(0.05, 0), s3 = lim(0.08, 0.4);
    ok("!! THE LIMITER NEURON IS THE LIMITER: at an angle of attack of 0.25 rad the network takes 12 x (0.25 - 0.13) = 1.44 off the stick (so the pitch is -1, the clamp, against the same network without the limiter at +something), at 0.05 it takes nothing (the two networks give the same pitch to the bit), and at 0.08 rad with a pitch rate of 0.4 rad/s it takes 12 (0.08 + 0.5 x 0.4 - 0.13) = 1.8", withL(s1) === -1 && noL(s1) > withL(s1) && noL(s2) === withL(s2) && AF.decide(s3, T0, [0, 0, 0], { ...G, model: jet }).controls.pitch === -1 && withL(s3) === -1, `${withL(s1)} vs ${noL(s1).toFixed(3)} without; ${withL(s2).toFixed(4)} = ${noL(s2).toFixed(4)}`);
    const steep = jetState({ pos: [0, 0, 5287], speed: 184, pitch: 0.9, gamma: 0.45 }), ts = { altitude: 5700, heading: 0.38, airspeed: 150 };
    const cs = AF.decide(steep, ts, [0, 0, 0], { ...G, model: jet }), nets = hand(steep, ts);
    ok("!! A STEEP CLIMB AT 86 M/S IS THE ROW THE TRAINER'S CLAMPS WOULD FAIL (the first run of this gate found 0.52 of throttle wrong here): the climb feature is 17.2, not the trainer's 12, and the throttle is the autopilot's to 2e-6", cs.guidance.climb > 70 && PJ.featuresFrom(cs.guidance)[11] > 14 && near(nets.throttle, cs.controls.throttle, 2e-6) && PF.pilotFor(PF.handWeights(G))(steep, ts).throttle !== nets.throttle, `climb ${cs.guidance.climb.toFixed(1)} m/s: ${nets.throttle.toFixed(4)} = ${cs.controls.throttle.toFixed(4)}`);
}

console.log("\n4. THE FLIGHT IS THE SAME FLIGHT");
{
    const hand = PJ.pilotFor(PJ.handWeights());
    let same = 0, worstScore = 0; const ends = new Set();
    for (const sc of JF.JET_FIGHT_SET) {
        const a = JF.duel(AF.jetFightPilot, sc), b = JF.duel(hand, sc);
        if (["dealt", "taken", "fired", "firedB", "statusA", "statusB", "ticks", "killedB", "firstHit"].every((k) => a[k] === b[k])) same++;
        worstScore = Math.max(worstScore, Math.abs(a.score - b.score)); ends.add(a.statusB);
    }
    ok("!! THE 24 JET FIGHTS: the network with the hand weights in seat A flies every one the hand pilot flies -- every hit dealt and taken, every round, the status of both aircraft, the tick the fight ended on and the time of the first hit identical -- and the score differs by exactly 0 (a hit is a metre; the float32 weights move the aircraft by micrometres)", same === 24 && worstScore === 0 && ends.has("destroyed") && ends.has("airborne"), `${same} of 24, score difference ${worstScore}`);
    const step = (pilot, gains) => { const s0 = level(140, 2000), tg = { altitude: 2200, heading: 0.6, airspeed: 150 }; let s = s0, n = 0; const dt = 1 / 30; for (let i = 0; i < 1200; i++) { const c = pilot(s, tg, [0, 0, 0]); s = F.stepFlight(jet, s, c, dt, [0, 0, 0]).state; n++; } return s; };
    const a = step(AF.jetPilot), b = step(PJ.pilotFor(PJ.handWeights(GC), GC), GC);
    ok("!! THE CRUISE GAINS WRITTEN THE SAME WAY FLY THE CRUISE PILOT'S FLIGHT: a 200 m climb and a 34-degree turn in 40 s, the network of handWeights(AUTOPILOT_JET) with features made from the same gains ends within 0.2 m of the hand pilot's end point after 1,200 ticks (float32 weights move a control by 4e-7 and 40 seconds of flight integrate that to centimetres: the fights, in which a hit is a metre, are identical above; the weights and the features are made from ONE set of gains)", Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]) < 0.2 && Math.abs(a.pos[2] - 2200) < 2, `${Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]).toExponential(2)} m apart, altitude ${a.pos[2].toFixed(2)}`);
    const mixed = step(PJ.pilotFor(PJ.handWeights(GC), G), G);
    ok("...and weights made from one set of gains read through the features of another are NOT the autopilot of either (they end more than 5 m from the cruise pilot's end point): the pairing is part of the pilot", Math.hypot(a.pos[0] - mixed.pos[0], a.pos[1] - mixed.pos[1], a.pos[2] - mixed.pos[2]) > 5, `${Math.hypot(a.pos[0] - mixed.pos[0], a.pos[1] - mixed.pos[1], a.pos[2] - mixed.pos[2]).toFixed(1)} m`);
    const zero = JF.duel(PJ.pilotFor(PJ.zeroWeights()), JF.scenario(1, "tail"));
    ok("the zero weights output nothing and the jet falls: a fight flown with them ends with A on the ground (crashed or touchdown) and its hit points taken", (zero.statusA === "crashed" || zero.statusA === "touchdown") && zero.fired === 0 && D.sideScore({ hits: 0, taken: 0, status: zero.statusA }, JF.JET_GUN, 60, null) === -1);
}

console.log("\n5. THE FRONT DOOR");
{
    const L = PJ.reportLines();
    ok("!! the report names the module, the circuit's 34 neurons and 313 synapses, the 1,099 weights and the 34 that are not zero, and no line says NaN or undefined", L.length === 3 && /pilotJetPolicy/.test(L[0]) && /34 neurons, 313 synapses/.test(L[0]) && /1099 weights/.test(L[0]) && /34 of 1099 non-zero/.test(L[1]) && !L.some((l) => /NaN|undefined/.test(l)), L[1]);
    ok("the export list is pinned", Object.keys(PJ).sort().join(",") === "FEATURES,FEATURE_NAMES,HIDDEN,JET_GAINS,LIMITER_NEURON,OUTPUTS,OUTPUT_NAMES,REC_EDGES,REC_STEPS,WEIGHT_COUNT,features,featuresFrom,forward,handWeights,layersOf,mutate,perturb,pilotFor,reportLines,zeroWeights", Object.keys(PJ).sort().join(","));
}

console.log(fails ? `\npilotJetPolicy-selfcheck: ${fails} FAILED` : "\npilotJetPolicy-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
