// WebGLEngine/physics/mechanics/subNeeds-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node physics/mechanics/subNeeds-selfcheck.mjs      (~3 s)
//
// NEEDS AND LIMITS FOR THE SUBMARINE (physics/mechanics/subNeeds.mjs and brain/needsPilot.mjs; the design and the pass/fail were written first, in brain/NEEDS_AND_LIMITS.md, and the rows below are that list):
//   1  UNTOUCHED   a vessel with needs null is bit-identical to stepSub over 600 ticks; the `unlimited` class changes no number of the physics
//   2  POWER       the formula (hotel + |T u| / efficiency), the cube law (the hydrodynamic part at twice the speed is eight times, to 1%), a monotone charge that never leaves [0, capacity]
//   3  EMPTY       at 0 the applied thrust is 0 whatever the command, the boat coasts to under a quarter of its speed in 60 s, the ballast still moves it
//   4  REFILL      battery at 0.5 m yes and 1.5 m no; snorkel at 3.5 m yes (exposed) and 5 m no; air-independent never; capped at capacity; exact per-tick gain
//   5  PRESSURE    strain = depth / collapse; no damage under 0.8; damage grows over it; the collapse depth falls monotonically with damage; a boat at damage 0.6 is crushed at a depth an undamaged one survives; a tank-scale crush depth is honoured
//   6  LEAK        none at damage 0; more with depth and with damage; capped at 15%; a leaking boat sinks against a sound one
//   7  INJURE      adds, clamps to 1, ignores NaN, negatives and strings, never edits its argument
//   8  THE TRIP    needsPilot: the hysteresis, the surface flag for a battery and the snorkel depth for a snorkel, a hull that never refills passes through untouched; and a closed loop on the real physics: a battery boat at 25% surfaces, charges to 90%, dives back
// WHAT IT DOES NOT CLAIM: that the numbers are a real boat's (tank-scale), that a pilot is better or worse with needs (piece 3, registered first), a pump or a repair.
//
// SABOTAGE LOG -- TWENTY-THREE, each applied in place to physics/mechanics/subNeeds.mjs (N1-N18) or brain/needsPilot.mjs (N19-N22), the gate run, the file restored (md5-identical); rows red in brackets:
//   N1 power without the efficiency 2 | N2 no hotel load 5 | N3 a dead screw still pushing 2 | N4 refilling at depth and not at the surface 2 | N5 the snorkel never exposed 3 | N6 no capacity cap 1 | N7 the charge able to go negative 1 | N8 damage costing a quarter, not a half, of the collapse depth 3 |
//   N9 the step's strain ignoring the tank-scale crush depth 1 and N9b the collapse test ignoring it 1 | N10 damage creeping and healing at any depth 1 | N11 the leak ignoring depth 2 | N12 the leak ignoring damage 8 | N13 the flooding uncapped 1 | N14 injure unclamped 1 | N15 injure taking negatives 1 |
//   N16 the collapse ignoring damage 3 | N17 needs null not passed through 1 | N19 no hysteresis in the trip 3 | N20 a battery boat never asking to surface 2 | N21 the snorkel depth overriding a shallower task 1 | N22 a hull that never refills still taking the trip 1.
//   N18 the `unlimited` class draining: 0 RED, EQUIVALENT -- its charge is Infinity and Infinity - w x dt is Infinity, so `limited = true` changes nothing observable; the flag stays as the statement of intent.
//   FIRST RUNS WENT 0 RED for N7, N9, N10 and N11 (and the first N11 read green on `b > a`: two equal leaks differ in the last digit by float noise; the row wants a margin now): the rows for a boat with 5 J left, the step's strain, a damaged hull held shallow
//   (which would heal under N10) and the leak's margins were written because of them. The first version of the loop capped the refill speed at 1 m/s and the battery boat never surfaced: the planes are too weak at that speed (measured); the cap is gone and the header of brain/needsPilot.mjs says so.
"use strict";
import * as S from "./subModel6dof.mjs";
import * as N from "./subNeeds.mjs";
import * as AS from "../../brain/autopilotSub.mjs";
import * as SP from "../../brain/surfacePilot.mjs";
import * as FL from "../../brain/floodTask.mjs";
import * as NP from "../../brain/needsPilot.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, t = 1e-6) => Math.abs(a - b) <= t * Math.max(1, Math.abs(b));
const M = S.createSubModel(S.EXPLORER), DEEP = S.createSubModel(Object.freeze({ ...S.EXPLORER, seabed: 400 })), DT = S.DT;
const F = FL.FLOOD_SPEC, TANKM = S.createSubModel(Object.freeze({ ...S.EXPLORER, tankRate: F.tankRate, airMax: F.airMax, emergencyRate: F.emergencyRate, emergencyAirCost: F.emergencyAirCost, dropMass: F.dropMass }));
const drag = (v) => 0.5 * S.WATER_DENSITY * M.spec.cdAxial * M.frontalArea * v * Math.abs(v);

console.log("subNeeds-selfcheck -- energy that only the surface refills, and a hull that feels the pressure\n");

console.log("1. UNTOUCHED");
{
    const p = AS.pilot(), tgt = { depth: 30, heading: 0.2, speed: 2 };
    let a = S.createState({ depth: 25, speed: 1.5, model: M }), b = S.createState({ depth: 25, speed: 1.5, model: M }), c = S.createState({ depth: 25, speed: 1.5, model: M }), same = true, same2 = true, nd = N.initialNeeds("unlimited");
    for (let i = 0; i < 600; i++) {
        const cmd = p(a, tgt, [0, 0, 0]), ra = S.stepSub(M, a, cmd, DT), rb = N.stepNeeds(M, b, null, p(b, tgt, [0, 0, 0]), DT), rc = N.stepNeeds(M, c, nd, p(c, tgt, [0, 0, 0]), DT);
        if (JSON.stringify(ra.state) !== JSON.stringify(rb.state) || ra.status !== rb.status || rb.needs !== null) same = false;
        if (JSON.stringify(ra.state) !== JSON.stringify(rc.state)) same2 = false;
        a = ra.state; b = rb.state; c = rc.state; nd = rc.needs;
    }
    ok("!! a vessel with needs null is bit-identical to S.stepSub for 600 ticks (state and status), and says needs null", same);
    ok("!! the `unlimited` class changes no number of the physics (600 ticks bit-identical to stepSub) and the charge stays Infinity", same2 && nd.energy === Infinity);
}

console.log("\n2. POWER");
{
    const t2 = 2, thr = drag(t2), pw = N.power(thr, t2);
    ok("!! power is the hotel load plus |thrust x speed| over the efficiency: 2 m/s at the trim thrust", near(pw, N.POWER.hotelW + Math.abs(thr * t2) / N.POWER.efficiency, 1e-12) && N.power(0, 3) === N.POWER.hotelW && N.power(-100, 2) === N.POWER.hotelW + 400, `${pw.toFixed(1)} W`);
    const hy = (v) => N.power(drag(v), v) - N.POWER.hotelW;
    ok("!! the hydrodynamic part goes as the CUBE of the speed: at twice the speed it is eight times (within 1%)", Math.abs(hy(4) / hy(2) - 8) < 0.08 && Math.abs(hy(3) / hy(1.5) - 8) < 0.08, `${(hy(4) / hy(2)).toFixed(3)}`);
    const p = AS.pilot(); let st = S.createState({ depth: 30, speed: 2, model: M }), nd = N.initialNeeds("battery"), mono = true, inRange = true, prev = nd.energy, w0 = 0;
    for (let i = 0; i < 9000; i++) { const r = N.stepNeeds(M, st, nd, p(st, { depth: 30, heading: 0, speed: 2 }, [0, 0, 0]), DT); st = r.state; nd = r.needs; if (nd.energy > prev + 1e-9) mono = false; if (nd.energy < 0 || nd.energy > N.CLASSES.battery.capacityJ) inRange = false; prev = nd.energy; w0 = r.watts; }
    ok("!! at 30 m and 2 m/s for 300 s the charge falls monotonically, stays inside [0, capacity], and the draw is the formula's (about 2.5 kW)", mono && inRange && nd.energy < N.CLASSES.battery.capacityJ * 0.8 && w0 > 2000 && w0 < 3000, `${(nd.energy / 1e6).toFixed(3)} MJ left, ${w0.toFixed(0)} W`);
}

console.log("\n3. EMPTY");
{
    let st = S.createState({ depth: 30, speed: 2, model: M }), nd = { ...N.initialNeeds("battery"), energy: 0 }, thrustOk = true; const cmd = { pitch: 0, yaw: 0, thrust: 1, ballast: 0 };
    for (let i = 0; i < 1800; i++) { const r = N.stepNeeds(M, st, nd, cmd, DT); st = r.state; nd = r.needs; if (r.thrustApplied !== 0) thrustOk = false; }
    const k = 0.5 * S.WATER_DENSITY * M.spec.cdAxial * M.frontalArea / M.vmass, coast = 1 / (1 / 2 + k * 60);   // quadratic drag: 1/v = 1/v0 + k t
    ok("!! at charge 0 the thrust applied is 0 whatever the command (full ahead asked), and the boat coasts as quadratic drag says it must: 2 m/s falls to 0.62 m/s in 60 s (1/v = 1/v0 + k t, within 3%)", thrustOk && Math.abs(S.attitude(st).speed - coast) < 0.03 * coast && coast < 0.7, `${S.attitude(st).speed.toFixed(3)} m/s, the formula ${coast.toFixed(3)}`);
    const z = (ballast) => { let s2 = S.createState({ depth: 30, speed: 0, model: M }), n2 = { ...N.initialNeeds("battery"), energy: 0 }; for (let i = 0; i < 300; i++) { const r = N.stepNeeds(M, s2, n2, { pitch: 0, yaw: 0, thrust: 0, ballast }, DT); s2 = r.state; n2 = r.needs; } return -s2.pos[2]; };
    const nearly = N.stepNeeds(M, S.createState({ depth: 30, speed: 2, model: M }), { ...N.initialNeeds("battery"), energy: 5 }, cmd, DT);
    ok("!! a boat with 5 J left, full ahead, ends the tick at exactly 0 J (the charge is clamped, it never goes negative) and the next tick's thrust is 0", nearly.needs.energy === 0 && N.stepNeeds(M, nearly.state, nearly.needs, cmd, DT).thrustApplied === 0 && nearly.thrustApplied > 0, `${nearly.needs.energy} J`);
    ok("!! with no charge the ballast still works (the pump is not charged for, said): flooded the boat is deeper after 10 s than blown", z(1) > z(-1) + 0.05, `${z(1).toFixed(3)} m against ${z(-1).toFixed(3)} m`);
    let s3 = S.createState({ depth: 30, speed: 2, model: M }), n3 = { ...N.initialNeeds("unlimited") }; for (let i = 0; i < 600; i++) { const r = N.stepNeeds(M, s3, n3, cmd, DT); s3 = r.state; }
    ok("  an unlimited boat never goes dead: full ahead for 20 s keeps its speed", S.attitude(s3).speed > 3.5);
}

console.log("\n4. REFILL");
{
    const at = (cls, depth, e0) => { const st = S.createState({ depth, speed: 0, model: M }), nd = { ...N.initialNeeds(cls), energy: e0 }, r = N.stepNeeds(M, st, nd, { pitch: 0, yaw: 0, thrust: 0, ballast: 0 }, DT); return { gain: r.needs.energy - e0, r }; };
    const b05 = at("battery", 0.5, 1e6), b15 = at("battery", 1.5, 1e6), s35 = at("snorkel", 3.5, 1e6), s5 = at("snorkel", 5, 1e6), ai = at("airIndependent", 0.5, 1e6);
    const net = (N.CLASSES.battery.chargeW - N.POWER.hotelW) * DT, idle = -N.POWER.hotelW * DT;
    ok("!! a battery boat charges at the surface (0.5 m: chargeW less the hotel load, per tick, exactly) and does not at 1.5 m (only the hotel load leaves)", near(b05.gain, net, 1e-6) && b05.r.charging && !b05.r.exposed && near(b15.gain, idle, 1e-6) && !b15.r.charging, `${b05.gain.toFixed(3)} and ${b15.gain.toFixed(3)} J a tick`);
    ok("!! a snorkel boat charges at 3.5 m and is EXPOSED there, and not at 5 m", near(s35.gain, net, 1e-6) && s35.r.charging && s35.r.exposed === true && near(s5.gain, idle, 1e-6) && !s5.r.charging && !s5.r.exposed);
    ok("!! an air-independent boat never refills, even at the surface; it has four times the capacity", near(ai.gain, idle, 1e-6) && !ai.r.charging && N.CLASSES.airIndependent.capacityJ === 4 * N.CLASSES.battery.capacityJ);
    const cap = N.CLASSES.battery.capacityJ, top = at("battery", 0.5, cap - 1);
    ok("  the charge is capped at the capacity (one joule short charges one joule)", top.r.needs.energy === cap);
    ok("  refillAt answers by class and depth; an unknown class refills nowhere", N.refillAt("battery", 0.7).ok && !N.refillAt("battery", 0.71).ok && N.refillAt("snorkel", 4).exposed && !N.refillAt("nobody", 0).ok && !N.refillAt("unlimited", 0).ok);
}

console.log("\n5. PRESSURE");
{
    ok("!! the collapse depth falls monotonically with damage (100 m sound, 50 m at 1, 70 m at 0.6) and strain is depth over it", N.collapseDepth(M, 0) === 100 && N.collapseDepth(M, 1) === 50 && near(N.collapseDepth(M, 0.6), 70, 1e-12) && [0, 0.2, 0.4, 0.6, 0.8, 1].every((d, k, a) => k === 0 || N.collapseDepth(M, d) < N.collapseDepth(M, a[k - 1])) && near(N.strainOf(M, 35, 0.6), 0.5, 1e-12) && N.strainOf(M, -3, 0) === 0);
    const hold = (depth, secs, nd0) => { let st = S.createState({ depth, speed: 1, model: DEEP }), nd = nd0, p = AS.pilot(); for (let i = 0; i < secs * 30; i++) { const r = N.stepNeeds(DEEP, st, nd, p(st, { depth, heading: 0, speed: 1 }, [0, 0, 0]), DT); st = r.state; nd = r.needs; if (r.status !== "submerged") return { r, nd }; } return { nd }; };
    const sh = hold(60, 60, N.initialNeeds("unlimited")), dp = hold(90, 60, N.initialNeeds("unlimited"));
    ok("!! no damage under the yield strain (60 m: 0.6 of 100), and over it damage grows (90 m for 60 s: strain 0.9, about 0.06)", sh.nd.damage === 0 && dp.nd.damage > 0.04 && dp.nd.damage < 0.08, `${sh.nd.damage} and ${dp.nd.damage.toFixed(4)}`);
    ok("!! the strain the STEP uses is the hull's own: held at 50 m for 60 s a tank-scale hull (crush 60 m: strain 0.83, over the yield) takes damage and the 100 m hull takes none", hold(50, 60, N.initialNeeds("unlimited", { crushDepth: 60 })).nd.damage > 0 && hold(50, 60, N.initialNeeds("unlimited")).nd.damage === 0);
    ok("!! a damaged hull held shallow stays exactly as damaged (depth under the yield strain neither heals nor wears it: 0.3 at 30 m for 60 s is still 0.3)", hold(30, 60, { ...N.initialNeeds("unlimited"), damage: 0.3 }).nd.damage === 0.3);
    const rd = (damage) => { const st = S.createState({ depth: 75, speed: 0, model: DEEP }); return N.stepNeeds(DEEP, st, { ...N.initialNeeds("unlimited"), damage }, { pitch: 0, yaw: 0, thrust: 0, ballast: 0 }, DT).status; };
    ok("!! at 75 m the SOUND hull is submerged and a boat at damage 0.6 (collapse 70 m) is crushed: damage lowers the depth a hull survives", rd(0) === "submerged" && rd(0.6) === "crushed" && rd(0.3) === "submerged", `${rd(0)} / ${rd(0.3)} / ${rd(0.6)}`);
    const tn = N.initialNeeds("battery", { crushDepth: 60 }), st45 = S.createState({ depth: 45, speed: 0, model: M });
    ok("!! a tank-scale hull (crush 60 m) is honoured: 0.75 strain at 45 m, collapse 60 m sound and 42 m at damage 0.6; a bad crush depth throws", near(N.readings(M, tn, st45).strain, 0.75, 1e-9) && near(N.readings(M, { ...tn, damage: 0.6 }, st45).collapseDepth, 42, 1e-9) && [0, -5, NaN, "x"].every((c) => { try { N.initialNeeds("battery", { crushDepth: c }); return false; } catch { return true; } }) && N.readings(M, N.initialNeeds("battery"), st45).collapseDepth === 100);
    const crushAt = (needs0) => N.stepNeeds(DEEP, S.createState({ depth: 65, speed: 0, model: DEEP }), needs0, { pitch: 0, yaw: 0, thrust: 0, ballast: 0 }, DT).status;
    ok("!! the STEP honours a tank-scale crush depth: at 65 m a hull of crush 60 m is crushed and the model's 100 m hull is not", crushAt(N.initialNeeds("unlimited", { crushDepth: 60 })) === "crushed" && crushAt(N.initialNeeds("unlimited")) === "submerged");
    ok("  the readings carry the pressure (rho g depth), the charge fraction and whether it can refill here", near(N.readings(M, N.initialNeeds("battery"), st45).pressure, S.WATER_DENSITY * S.GRAVITY * 45, 1e-9) && N.readings(M, N.initialNeeds("battery"), st45).frac === 1 && N.readings(M, N.initialNeeds("battery"), S.createState({ depth: 0.4, speed: 0, model: M })).canRefill === true);
}

console.log("\n6. LEAK");
{
    const flood = (depth, damage, secs) => { let st = S.createState({ depth, speed: 0, model: DEEP }), nd = { ...N.initialNeeds("unlimited"), damage }; for (let i = 0; i < secs * 30; i++) { const r = N.stepNeeds(DEEP, st, nd, { pitch: 0, yaw: 0, thrust: 0, ballast: 0 }, DT); if (r.status !== "submerged") break; st = r.state; nd = r.needs; } return nd.flood; };
    const f0 = flood(60, 0, 60), a = flood(30, 0.3, 20), b = flood(60, 0.3, 20), c = flood(50, 0.3, 20), d = flood(50, 0.6, 20);   // every depth inside the damaged hull's collapse depth (85 and 70 m)
    // a margin and not a bare `>`: two equal leaks differ in the last digit by float noise (a mutant that ignored the depth read green on `b > a`)
    ok("!! no leak at damage 0; the leak rises with depth (30 m < 60 m at damage 0.3) and with damage (0.3 < 0.6 at 50 m)", f0 === 0 && b > 2 * a && a > 0 && d > 1.5 * c && c > 0, `0, ${a.toExponential(2)} < ${b.toExponential(2)}; ${c.toExponential(2)} < ${d.toExponential(2)}`);
    const big = (() => { let nd = { ...N.initialNeeds("unlimited"), damage: 1, flood: 0.149 }, st = S.createState({ depth: 45, speed: 0, model: DEEP }); for (let i = 0; i < 300; i++) { const r = N.stepNeeds(DEEP, st, nd, { pitch: 0, yaw: 0, thrust: 0, ballast: 0 }, DT); if (r.status !== "submerged") break; st = r.state; nd = r.needs; } return nd.flood; })();
    ok("  the flooding is capped at 15% of the weight", big === N.HULL.floodMax && N.HULL.floodMax === 0.15, `${big}`);
    const sink = (damage) => { let st = S.createState({ depth: 40, speed: 0, model: DEEP }), nd = { ...N.initialNeeds("unlimited"), damage }; for (let i = 0; i < 1800; i++) { const r = N.stepNeeds(DEEP, st, nd, { pitch: 0, yaw: 0, thrust: 0, ballast: 0 }, DT); if (r.status !== "submerged") return -r.state.pos[2]; st = r.state; nd = r.needs; } return -st.pos[2]; };
    ok("!! a leaking boat sinks against a sound one: from 40 m with every command at zero, the sound boat is within 1 m of 40 m after 60 s and the damaged one (0.5) is over 10 m deeper", Math.abs(sink(0) - 40) < 1 && sink(0.5) > sink(0) + 10, `${sink(0).toFixed(1)} m against ${sink(0.5).toFixed(1)} m`);
}

console.log("\n7. INJURE");
{
    const n0 = N.initialNeeds("battery"), n1 = N.injure(n0, 0.3), n2 = N.injure(n1, 0.9);
    ok("!! injure adds the damage, clamps to 1, never edits its argument, and ignores NaN, negative, infinite and string amounts (an infinite amount is not an amount the caller meant)", n1.damage === 0.3 && n2.damage === 1 && n0.damage === 0 && n1 !== n0 && [NaN, -1, -Infinity, Infinity, "0.5", undefined, null].every((a) => N.injure(n1, a).damage === 0.3));
}

console.log("\n8. THE TRIP");
{
    ok("  the trip's numbers are pinned (REFILL): it goes under 30% and returns over 90%, a snorkel boat flies to three quarters of its mast depth, and a target with no speed is given 1.5 m/s", NP.REFILL.low === 0.3 && NP.REFILL.high === 0.9 && NP.REFILL.snorkelFraction === 0.75 && NP.REFILL.speed === 1.5 && Object.isFrozen(NP.REFILL));
    const calls = [], inner = (st, t) => { calls.push(t); return { pitch: 0, yaw: 0, thrust: 0, ballast: 0 }; };
    let r = { frac: 0.5, refills: true, refillDepth: 0.7 };
    const p = NP.wrap(inner, { read: () => r }), t0 = { depth: 20, heading: 0, speed: 2 };
    p({}, t0); const task = calls.at(-1) === t0 && p.refilling === false;
    r = { ...r, frac: 0.25 }; p({}, t0); const surf = calls.at(-1).surface === true && calls.at(-1).depth === 20 && p.refilling === true;
    r = { ...r, frac: 0.5 }; p({}, t0); const held = p.refilling === true && calls.at(-1).surface === true;
    r = { ...r, frac: 0.95 }; p({}, t0); const back = p.refilling === false && calls.at(-1) === t0;
    ok("!! the trip has hysteresis: above low it flies the task (the very target object), under low (0.3) it asks to SURFACE, at 0.5 on the way up it is still refilling, over high (0.9) it returns to the task", task && surf && held && back, `task ${task} surface ${surf} held ${held} back ${back}`);
    r = { frac: 0.1, refills: true, refillDepth: 4 }; p({}, { depth: 20, heading: 0, speed: 2 }); const sn = calls.at(-1);
    ok("!! a snorkel boat does not surface: it flies to three quarters of its snorkel depth (3 m) and keeps the task's speed; a task shallower than that is left alone", sn.surface === undefined && sn.depth === 3 && sn.speed === 2 && (p({}, { depth: 2, heading: 0, speed: 2 }), calls.at(-1).depth === 2));
    r = { frac: 0.01, refills: false, refillDepth: -Infinity }; const tz = { depth: 20, heading: 0, speed: 2 }; p({}, tz);
    ok("!! a hull that never refills (air-independent, unlimited) is the wrapped pilot, the very same target, whatever the charge; bad arguments throw", calls.at(-1) === tz && p.refilling === false && [[() => NP.wrap(null, { read: () => 0 })], [() => NP.wrap(inner, {})], [() => NP.wrap(inner, { read: () => 0, low: 0.9, high: 0.3 })], [() => NP.wrap(inner, { read: () => 0, low: -1, high: 0.5 })]].every(([f]) => { try { f(); return false; } catch { return true; } }));
    // the closed loop on the real physics: a battery boat at 25% on the tank model with the surfacing pilot underneath
    const loop = (cls) => {
        let st = { ...S.createState({ depth: 20, speed: 2, model: TANKM }), tank: { ...S.initialTank(TANKM), level: 0 } }, nd = { ...N.initialNeeds(cls), energy: 0.25 * N.CLASSES[cls].capacityJ };
        const pilot = NP.wrap(SP.wrap(AS.pilot(), { model: TANKM }), { read: () => N.readings(TANKM, nd, st) }), tg = { depth: 20, heading: 0, speed: 2 };
        let minD = 99, full = null, back = null, status = "submerged", exposed = false;
        for (let i = 0; i < 900 * 30; i++) { const rr = N.stepNeeds(TANKM, st, nd, pilot(st, tg, [0, 0, 0]), DT); st = rr.state; nd = rr.needs; status = rr.status; if (status !== "submerged") break; if (rr.charging && rr.exposed) exposed = true; const d = -st.pos[2]; minD = Math.min(minD, d); if (full === null && nd.energy >= 0.9 * N.CLASSES[cls].capacityJ) full = i / 30; if (full !== null && back === null && d > 15) back = i / 30; }
        return { minD, full, back, status, exposed };
    };
    const lb = loop("battery"), ls = loop("snorkel");
    ok("!! on the real physics a battery boat at 25% climbs to the surface (centre under 0.8 m), charges to 90%, and dives back to its 20 m task, without ending", lb.minD < 0.8 && lb.full !== null && lb.back !== null && lb.back > lb.full && lb.status === "submerged", `surfaced to ${lb.minD.toFixed(2)} m, 90% at ${lb.full && lb.full.toFixed(0)} s, back at depth by ${lb.back && lb.back.toFixed(0)} s`);
    ok("!! a snorkel boat does the same without breaking the surface (its centre never above 1 m, charging at a mast depth of 4 m or less), EXPOSED while it charges", ls.minD > 1 && ls.minD < 4 && ls.exposed && ls.full !== null && ls.back !== null && ls.status === "submerged", `${ls.minD.toFixed(2)} m, exposed ${ls.exposed}, 90% at ${ls.full && ls.full.toFixed(0)} s`);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
