// WebGLEngine/physics/mechanics/subModel6dof-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node physics/mechanics/subModel6dof-selfcheck.mjs      (~0.6 s)
//
// THE SUBMARINE HELD TO CLOSED FORMS, SIGNS AND ENDS. physics/mechanics/subModel6dof.mjs is a rigid body in water: this gate holds each force to the number a pencil gives and each control to the direction a pilot means.
//
//   1  CLOSED FORMS   a neutral vessel at rest stays at rest to 1e-9 m; a vessel 1% heavy starts to sink at (W e / virtual mass) -- the first tick's velocity; its terminal sink rate is the crossflow drag balance
//                     sqrt(2 W e / (rho Cd A)); full thrust tops out at maxSpeed() = sqrt(T / (0.5 rho Cd A)); trim(V) thrust holds V; a vessel drifting WITH a current feels no force and is carried by it exactly
//   2  THE SIGNS      pitch +1 raises the nose and the vessel climbs; yaw +1 turns the heading up (a right turn); ballast +1 sinks it and -1 raises it; thrust -1 backs it; rates() are positive in those senses
//   3  THE RIGHTING   the torque of a tilt at rest is W bg sin(tilt) exactly, about the right axis and the right way (a pitched-up vessel gets a nose-DOWN torque, a right bank a LEFT one); a tilted vessel rights itself
//   4  THE FINS       at a flow along the hull a deflection d gives a plane force 0.5 rho u^2 S CLa (d max) exactly; the rudder is the same fin on the other axis; the stall clips at 0.35 rad; backing reverses the sign of the
//                     deflection's effect; a fin is a damper (a pitch rate gives a force against it)
//   5  THE SURFACE    submerged() is 1 at z = -R, 0 at z = +R, 1/2 at the waterline; a hull wholly out of the water has only its weight, no drag, no thrust, no fin force
//   6  THE ENDS       broached (the CG above the surface), grounded (the hull's underside at the seabed), crushed (past the test depth, on a spec with the seabed deeper), lost (a non-finite state); stepSub() on an ended
//                     state returns it UNCHANGED (the same object); a step edits nothing it is handed
//   6b THE TANK       (v4901) the OPTIONAL ballast tank and drop weight: off by default and bit-identical when off; a pump rate, finite air, an emergency blow and a one-way drop weight, each on a fixture whose answer is worked out by hand,
//                     and the flood scenario (a leak the tank cannot trim out, which the drop weight can)
//   7  THE FRONT DOOR the export list is pinned; the report says real numbers
//
// SABOTAGE LOG -- FIFTEEN, each applied to physics/mechanics/subModel6dof.mjs in place, the gate run, the file restored (cmp against the saved original); every one red by name (the number is how many rows went red):
//   S1 centre of buoyancy below the CG 4 | S2 ballast sign flipped 3 | S3 pitch sign flipped 4 | S4 yaw sign flipped 3 | S5 no reversal of the fin's deflection when backing 1 | S6 no stall clip 2
//   S7 added mass dropped 1 | S8 axial drag linear in speed 3 | S9 submerged() always 1 2 | S9b the forces ignore the surface 1 | S10 broach threshold moved to z > 5 2
//   S11 the current ignored 1 | S12 Munk yaw moment sign flipped 1 | S13 no reverse-thrust penalty 1 | S14 an ended state is stepped again 1
// S7 went 0 red the first time AND S9 never applied: the S7 row computed its expected first-tick velocity from m.vmass, the very field the sabotage edited, so the two moved together (a gate that restates the thing it
// guards from the thing it guards) -- the pin "vmass is 7800 and the state carries it" now stands outside the field. S9's pattern was written for a function and the file has an arrow; the editor asserted the pattern
// was present and the shell hid the assertion with 2>/dev/null, so 0 red meant "never applied", not "not caught". Re-run with the pattern that exists, and stderr visible.
// TANK SABOTAGE LOG (v4901, section 6b) -- TWELVE, each applied in place, the gate run, the file restored; every one red by name (rows red in brackets):
//   T1 pump-rate cap dropped 3 | T2 air never spent 3 | T3 flooding spends air 1 | T4 emergency air cost same as a normal blow 1 | T5 emergency blow honoured without emergencyRate 1 | T6 release not one-way 1
//   T7 shed mass not applied to the weight 2 | T8 weight follows the command, not the tank level 1 | T9 stepSub does not advance the tank 1 | T10 a drop-weight-only model made dynamic 2
//   T11 release always present in sanitize() 1 | T12 a plain model given a tank 1
"use strict";
import * as S from "./subModel6dof.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const close = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const m = S.createSubModel(), sp = m.spec, RHO = S.WATER_DENSITY, W = m.weight;
const run = (state, ctl, secs, cur = [0, 0, 0], we = 0) => { let s = state, status = "submerged"; for (let i = 0; i < Math.round(secs / S.DT); i++) { const r = S.stepSub(m, s, ctl, S.DT, cur, we); s = r.state; status = r.status; if (status !== "submerged") break; } return { s, status, a: S.attitude(s, cur) }; };

console.log("subModel6dof-selfcheck -- a submarine held to closed forms\n");

console.log("1. CLOSED FORMS");
{
    const rest = run(S.createState({ speed: 0 }), {}, 60);
    ok("a neutral vessel at rest in still water stays at rest: 60 s, depth moves less than 1e-9 m and speed less than 1e-9", Math.abs(rest.a.depth - 30) < 1e-9 && rest.a.speed < 1e-9, `depth ${rest.a.depth}`);
    ok("!! the integrator is given the VIRTUAL mass, 1.3 times the real one (7800 kg for 6000), the state carries it, and the weight does not use it (6000 kg x g)", m.vmass === 7800 && S.createState({}).mass === 7800 && close(W, 6000 * S.GRAVITY, 1e-12), `${m.vmass}`);
    const e = 0.01, s0 = S.createState({ speed: 0 }), one = S.stepSub(m, s0, {}, S.DT, [0, 0, 0], e);
    ok("!! a vessel 1% heavy starts to sink at W e / virtual mass: the first tick's downward velocity is that acceleration times dt (the integrator is given the VIRTUAL mass, the weight the real one)", close(-one.state.vel[2], (W * e / m.vmass) * S.DT, 1e-6), `${(-one.state.vel[2]).toExponential(4)} vs ${((W * e / m.vmass) * S.DT).toExponential(4)}`);
    const sink = run(S.createState({ speed: 0, depth: 5 }), {}, 40, [0, 0, 0], e), vt = Math.sqrt(2 * W * e / (RHO * (sp.cdCross * m.sideArea + sp.finArea * sp.finLiftSlope * sp.finStall)));
    ok("!! its terminal sink rate is the heave-drag balance sqrt(2 W e / (rho (Cd A + S CLa stall))) to 1% -- the hull's crossflow drag PLUS the stern plane, which sees the flow end-on, is stalled and so is a flat plate (40 s: well past the 6 s time constant)", close(-sink.s.vel[2], vt, 0.01) && sink.status === "submerged", `${(-sink.s.vel[2]).toFixed(4)} vs ${vt.toFixed(4)} m/s at depth ${sink.a.depth.toFixed(1)}`);
    const top = run(S.createState({ speed: 0 }), { thrust: 1 }, 150);
    ok("!! full thrust tops out at maxSpeed() = sqrt(T / (0.5 rho Cd A)) to 1e-3", close(top.a.speed, S.maxSpeed(m), 1e-3), `${top.a.speed.toFixed(4)} vs ${S.maxSpeed(m).toFixed(4)}`);
    const t3 = S.trim(m, 3), hold = run(S.createState({ speed: 3 }), { thrust: t3.thrust }, 30);
    ok("!! trim(V) is the thrust that holds V: 3 m/s held for 30 s to 1e-5 m/s, level to 1e-6 m; and trim is feasible below the top speed, infeasible above it", close(hold.a.speed, 3, 1e-5) && Math.abs(hold.a.depth - 30) < 1e-6 && S.trim(m, 4).feasible && !S.trim(m, 5).feasible, `${hold.a.speed}`);
    const cur = [0.5, 0.2, 0], drift = run(S.createState({ speed: 0, heading: 0 }), {}, 30, cur);
    const sd = S.createState({ speed: 0 }); sd.vel = [0.5, 0.2, 0]; const carried = run(sd, {}, 30, cur);
    ok("!! a vessel moving WITH the current feels no force and is carried by it: 30 s moves it 15 m by 6 m to 1e-9, its water speed 0; and the same vessel at rest in the current is pushed toward it", Math.abs(carried.s.pos[0] - 15) < 1e-9 && Math.abs(carried.s.pos[1] - 6) < 1e-9 && carried.a.speed < 1e-9 && drift.s.vel[0] > 0.01, `${carried.s.pos[0]} ${carried.s.pos[1]}; at-rest vx ${drift.s.vel[0].toFixed(3)}`);
}

console.log("\n2. THE SIGNS");
{
    const t3 = S.trim(m, 3).thrust, base = { thrust: t3 };
    const up = run(S.createState({ speed: 3 }), { ...base, pitch: 1 }, 15), dn = run(S.createState({ speed: 3 }), { ...base, pitch: -1 }, 15);
    ok("!! pitch +1 raises the nose and the vessel CLIMBS (pitch attitude up, climb positive, depth falling); pitch -1 does the opposite", up.a.pitch > 0.2 && up.a.climb > 0.2 && up.a.depth < 30 && dn.a.pitch < -0.2 && dn.a.climb < -0.2 && dn.a.depth > 30, `+1: pitch ${up.a.pitch.toFixed(3)} climb ${up.a.climb.toFixed(3)}; -1: pitch ${dn.a.pitch.toFixed(3)}`);
    const rt = run(S.createState({ speed: 3 }), { ...base, yaw: 1 }, 15), lf = run(S.createState({ speed: 3 }), { ...base, yaw: -1 }, 15);
    ok("!! yaw +1 turns the heading UP (a right turn, heading is clockwise from above), yaw -1 turns it down; the vessel stays level", rt.a.heading > 0.5 && lf.a.heading < -0.5 && Math.abs(rt.a.pitch) < 0.02, `+1: ${rt.a.heading.toFixed(3)}; -1: ${lf.a.heading.toFixed(3)}`);
    const bs = run(S.createState({ speed: 0 }), { ballast: 1 }, 20), bu = run(S.createState({ speed: 0 }), { ballast: -1 }, 20);
    ok("!! ballast +1 floods the tank (heavier: it SINKS), ballast -1 blows it (it RISES), by the same amount either way (the 3% range: the first tick's acceleration is 0.03 W / virtual mass)", bs.a.depth > 32 && bu.a.depth < 28 && close(bs.a.depth - 30, 30 - bu.a.depth, 1e-9), `${bs.a.depth.toFixed(3)} / ${bu.a.depth.toFixed(3)}`);
    const a1 = S.stepSub(m, S.createState({ speed: 0 }), { ballast: 1 }, S.DT).state;
    ok("!! and the first tick is the closed form: downward velocity 0.03 W / virtual mass x dt", close(-a1.vel[2], (sp.ballastRange * W / m.vmass) * S.DT, 1e-6), `${(-a1.vel[2]).toExponential(4)}`);
    const back = run(S.createState({ speed: 0 }), { thrust: -1 }, 150), fwd = run(S.createState({ speed: 0 }), { thrust: 1 }, 150);
    ok("!! thrust +1 drives the vessel ahead (+x at heading 0), thrust -1 BACKS it (-x), at reverseFraction of the speed: sqrt(0.6) of the forward top speed", fwd.s.vel[0] > 4 && back.s.vel[0] < -3 && close(-back.s.vel[0] / fwd.s.vel[0], Math.sqrt(sp.reverseFraction), 1e-3), `fwd ${fwd.s.vel[0].toFixed(3)} back ${back.s.vel[0].toFixed(3)} ratio ${(-back.s.vel[0] / fwd.s.vel[0]).toFixed(4)} vs ${Math.sqrt(sp.reverseFraction).toFixed(4)}`);
    const r = S.rates(rt.s), rp = S.rates(up.s);
    ok("rates() are positive in the commanded sense: a right turn has yaw rate > 0 while it turns, a nose-up pitch has pitch rate > 0 while it pitches", S.rates(run(S.createState({ speed: 3 }), { ...base, yaw: 1 }, 2).s).yaw > 0 && S.rates(run(S.createState({ speed: 3 }), { ...base, pitch: 1 }, 2).s).pitch > 0, `${r.yaw.toFixed(3)} ${rp.pitch.toFixed(3)}`);
}

console.log("\n3. THE RIGHTING");
{
    const f = (state) => S.forcesAndMoments(m, state, {}).acc.torque;
    const th = 0.2, pitched = S.createState({ speed: 0, pitch: th }), banked = S.createState({ speed: 0, bank: th });
    const tp = f(pitched), tb = f(banked), expect = W * sp.bg * Math.sin(th);
    ok("!! the righting torque of a tilt at rest is W bg sin(tilt) EXACTLY: a pitch of 0.2 gives a nose-DOWN torque about +Y of that size (and nothing about the others), a right bank gives a LEFT-roll torque about X of that size negative", close(tp[1], expect, 1e-9) && Math.abs(tp[0]) < 1e-9 && Math.abs(tp[2]) < 1e-9 && close(tb[0], -expect, 1e-9) && Math.abs(tb[1]) < 1e-9, `${tp[1].toFixed(4)} / ${tb[0].toFixed(4)} vs ${expect.toFixed(4)}`);
    const p = run(S.createState({ speed: 0, pitch: 0.3 }), {}, 120), b = run(S.createState({ speed: 0, bank: 0.5 }), {}, 120);
    ok("a vessel tilted 0.3 rad in pitch (or 0.5 in bank) at rest rights itself with no pilot: after 120 s both are within 0.01 rad of level and still", Math.abs(p.a.pitch) < 0.01 && Math.abs(b.a.bank) < 0.01 && p.a.speed < 0.01, `${p.a.pitch.toFixed(4)} ${b.a.bank.toFixed(4)}`);
    const q = run(S.createState({ speed: 3, pitch: 0.1 }), { thrust: S.trim(m, 3).thrust }, 60), q1 = run(S.createState({ speed: 1, pitch: 0.1 }), { thrust: S.trim(m, 1).thrust }, 90);
    ok("!! the hull is Munk-unstable but the vessel is not: a 0.1 rad pitch disturbance dies out at 3 m/s (fins beat the hull moment) and at 1 m/s (the righting moment does), in 60 and 90 s", Math.abs(q.a.pitch) < 0.01 && Math.abs(q1.a.pitch) < 0.01, `${q.a.pitch.toFixed(4)} ${q1.a.pitch.toFixed(4)}`);
}

console.log("\n4. THE FINS");
{
    const V = 3, st = S.createState({ speed: V }), qS = 0.5 * RHO * V * V * sp.finArea * sp.finLiftSlope;
    const fp = (ctl, s = st) => S.forcesAndMoments(m, s, ctl).fins;
    const d = 0.5 * sp.finMax;   // a pitch of 0.5 sets the plane to -0.5 of its range: alpha = -0.2
    ok("!! at a flow along the hull a deflection d gives the plane force 0.5 rho u^2 S CLa (d finMax) EXACTLY (a pitch command of 0.5 = alpha -0.2 rad: a DOWNWARD force at the stern, which noses UP), and zero with no command", close(fp({ pitch: 0.5 }).plane, qS * -d, 1e-9) && Math.abs(fp({}).plane) < 1e-9, `${fp({ pitch: 0.5 }).plane.toFixed(4)} vs ${(qS * -d).toFixed(4)}`);
    ok("!! the rudder is the same fin on the other axis: yaw 0.5 gives the same force with the OTHER sign (+Y at the stern, which noses RIGHT), and the plane and rudder do not mix", close(fp({ yaw: 0.5 }).rudder, qS * d, 1e-9) && Math.abs(fp({ yaw: 0.5 }).plane) < 1e-9 && Math.abs(fp({ pitch: 0.5 }).rudder) < 1e-9);
    ok("!! the stall clips at finStall: pitch +1 (0.4 rad) gives the force of 0.35 rad, not 0.4; and the force is odd in the command", close(fp({ pitch: 1 }).plane, qS * -sp.finStall, 1e-9) && close(fp({ pitch: -1 }).plane, -fp({ pitch: 1 }).plane, 1e-12));
    const back = S.createState({ speed: 0 }); back.vel = [-V, 0, 0];
    ok("!! backing reverses the deflection's effect: at -3 m/s the same pitch command gives the OPPOSITE force (the flow is on the other face)", close(fp({ pitch: 0.5 }, back).plane, -fp({ pitch: 0.5 }).plane, 1e-9), `${fp({ pitch: 0.5 }, back).plane.toFixed(4)}`);
    const spin = S.createState({ speed: V, w: [0, 0.05, 0] });   // rotation about +Y: nose DOWN at 0.05 rad/s; the tail goes UP
    ok("!! a fin is a damper: a nose-down pitch rate carries the tail UP through the water, the plane sees the flow from above and pushes DOWN (the torque it makes opposes the rate)", fp({}, spin).plane < 0);
    const damp = S.forcesAndMoments(m, spin, {}).acc.torque[1], nospin = S.forcesAndMoments(m, st, {}).acc.torque[1];
    ok("!! and the total pitch torque of a nose-down rate opposes it (a negative torque about +Y, a nose-UP one, against the +0.05 rate)", damp < nospin, `${damp.toFixed(2)} vs ${nospin.toFixed(2)}`);
}

console.log("\n5. THE SURFACE");
{
    ok("!! submerged() is 1 at z = -R, 0 at z = +R, 1/2 at the waterline, and clamps beyond", S.submerged(m, -sp.radius) === 1 && S.submerged(m, sp.radius) === 0 && S.submerged(m, 0) === 0.5 && S.submerged(m, -50) === 1 && S.submerged(m, 50) === 0);
    const fl = run(S.createState({ speed: 0, depth: 20 }), { ballast: -1 }, 500), zEq = sp.radius * (2 * (1 - sp.ballastRange) - 1);
    ok("!! a vessel with the tank blown RISES AND FLOATS at the closed-form waterline: buoyancy W x submerged-fraction = W (1 - 0.03) puts the centre of gravity at depth R (2 (1 - 0.03) - 1) = 0.564 m, to 2 mm, still submerged", Math.abs(fl.a.depth - zEq) < 2e-3 && fl.status === "submerged", `${fl.a.depth.toFixed(4)} vs ${zEq.toFixed(4)}`);
    const out = S.createState({ pos: [0, 0, 3], speed: 3 }), fm = S.forcesAndMoments(m, out, { thrust: 1, pitch: 1, yaw: 1, ballast: 1 });
    ok("!! a hull wholly out of the water has only its weight: no thrust, no drag, no fin force, a net force of exactly -W(1 + 0.03 ballast) straight down", fm.thrust === 0 && fm.fins.plane === 0 && fm.fins.rudder === 0 && close(Math.hypot(...fm.acc.force), W * (1 + sp.ballastRange), 1e-9), `${Math.hypot(...fm.acc.force).toFixed(2)} vs ${(W * (1 + sp.ballastRange)).toFixed(2)}`);
}

console.log("\n6. THE ENDS");
{
    const t = (s) => S.classify(m, s).status;
    ok("!! broached = the centre of gravity above the surface; submerged at z = -0.01", t(S.createState({ pos: [0, 0, 0.01] })) === "broached" && t(S.createState({ pos: [0, 0, -0.01] })) === "submerged");
    ok("!! grounded = the hull's underside at the seabed: a level vessel at depth (seabed - R) touches, one 0.5 m above it does not; a nose-down vessel touches earlier (the half-length's share)", t(S.createState({ depth: sp.seabed - sp.radius })) === "grounded" && t(S.createState({ depth: sp.seabed - sp.radius - 0.5 })) === "submerged" && t(S.createState({ depth: sp.seabed - sp.radius - 0.5, pitch: -0.5 })) === "grounded");
    const deep = S.createSubModel({ ...sp, seabed: 400, crushDepth: 100 });
    ok("!! crushed = deeper than the test depth (on a spec whose seabed is below it): 101 m crushes, 99 m does not", S.classify(deep, S.createState({ depth: 101, model: deep })).status === "crushed" && S.classify(deep, S.createState({ depth: 99, model: deep })).status === "submerged");
    const bad = S.createState({}); bad.pos = [NaN, 0, -30];
    ok("!! a non-finite state is lost, and stepSub on it (or on any ended state) returns the SAME object, unchanged", t(bad) === "lost" && S.stepSub(m, bad, {}).state === bad && (() => { const g = S.createState({ pos: [0, 0, 1] }); return S.stepSub(m, g, { thrust: 1 }).state === g; })());
    const s0 = S.createState({ speed: 2 }), snap = JSON.stringify(s0), ctl = Object.freeze({ pitch: 0.3, yaw: 0.2, thrust: 0.5, ballast: 0.1 });
    S.stepSub(m, s0, ctl, S.DT, [0.1, 0, 0], 0.001);
    ok("a step edits nothing it is handed: the state is byte-identical afterwards (the controls were frozen and it did not throw)", JSON.stringify(s0) === snap);
    const mad = S.sanitize({ pitch: NaN, yaw: 9, thrust: -Infinity, ballast: "x" });
    ok("sanitize reads a NaN as 0 and clamps to [-1, 1] (thrust included: it reverses)", mad.pitch === 0 && mad.yaw === 1 && mad.thrust === 0 && mad.ballast === 0 && S.sanitize({ thrust: -5 }).thrust === -1);
}

console.log("\n6b. THE BALLAST TANK AND THE DROP WEIGHT (v4901) -- optional, off by default");
{
    const TK = (extra) => S.createSubModel(Object.freeze({ ...S.EXPLORER, ...extra }));
    const base = S.createSubModel(), c4 = { pitch: 0.1, yaw: -0.2, thrust: 0.5, ballast: 0.3 };
    const vert = (model, st, ctl, we) => S.forcesAndMoments(model, st, S.sanitize(ctl), [0, 0, 0], we).acc.force[2];   // the net vertical body force: level, so it is the world's
    const run = (model, ctl, n = 300, we = 0) => { let st = S.createState({ model, depth: 30, speed: 2 }); for (let i = 0; i < n; i++) { const r = S.stepSub(model, st, typeof ctl === "function" ? ctl(i) : ctl, S.DT, [0, 0, 0], we); st = r.state; } return st; };
    // --- OFF BY DEFAULT: the four-number contract, the state shape and the trajectory are exactly what they were
    const keys = Object.keys(S.sanitize({ pitch: 2, yaw: NaN, thrust: -3, ballast: 0.5 })).join(), a0 = run(base, c4), a1 = run(TK({ dropMass: 0.06 }), c4);
    ok("!! a pilot that sends four numbers gets back exactly four (blow and release appear only when sent), and a plain model's state has NO tank", keys === "pitch,yaw,thrust,ballast" && a0.tank === undefined &&
        Object.keys(S.sanitize({ ...c4, blow: 2, release: -1 })).join() === "pitch,yaw,thrust,ballast,blow,release" && S.sanitize({ blow: 9, release: -1 }).blow === 1 && S.sanitize({ blow: 9, release: -1 }).release === 0, keys);
    ok("!! a model with only a drop weight, never released, flies the SAME 300 ticks as the plain one, to the bit (its ballast stays the instant command of the header)",
        JSON.stringify([a1.pos, a1.vel, a1.q, a1.w]) === JSON.stringify([a0.pos, a0.vel, a0.q, a0.w]) && a1.tank && a1.tank.released === false && !S.dynamicTank(TK({ dropMass: 0.06 })) && S.dynamicTank(TK({ tankRate: 1 })),
        `z ${a1.pos[2].toFixed(6)} = ${a0.pos[2].toFixed(6)}`);
    // --- the pump rate: 0.25 level/s floods from 0 to +1 in exactly 4 s = 120 ticks, and no tick moves it further than rate x dt
    const slow = TK({ tankRate: 0.25 }); let tk = S.initialTank(slow), maxStep = 0, ticks = 0;
    while (tk.level < 1 - 1e-12 && ticks < 400) { const n = S.advanceTank(slow, tk, S.sanitize({ ballast: 1 }), S.DT); maxStep = Math.max(maxStep, n.level - tk.level); tk = n; ticks++; }
    ok("!! the pump rate bounds the tank: from neutral to full takes 4 s (120 ticks at 0.25/s), and no tick moves the level more than rate x dt", ticks === 120 && maxStep <= 0.25 * S.DT + 1e-12, `${ticks} ticks, largest step ${maxStep.toFixed(6)} (rate x dt ${(0.25 * S.DT).toFixed(6)})`);
    // --- air: a bottle of 1.0 blows the tank from 0 to -1 once; flooding is free; with none left the tank cannot go lower
    const air = TK({ tankRate: 100, airMax: 1 });
    let t = S.advanceTank(air, S.initialTank(air), S.sanitize({ ballast: -1 }), S.DT);
    const afterBlow = t; t = S.advanceTank(air, { level: 1, air: 0, released: false }, S.sanitize({ ballast: -1 }), S.DT);
    const flood = S.advanceTank(air, { level: -0.5, air: 0.2, released: false }, S.sanitize({ ballast: 1 }), S.DT);
    ok("!! a blow spends air one for one (0 to -1 spends 1.0 of a 1.0 bottle), flooding spends none, and a tank with no air left cannot be blown at all",
        Math.abs(afterBlow.level + 1) < 1e-12 && Math.abs(afterBlow.air) < 1e-12 && t.level === 1 && t.air === 0 && flood.air === 0.2 && flood.level > -0.5,
        `blow: level ${afterBlow.level}, air ${afterBlow.air}; empty bottle: level ${t.level}; flood: air ${flood.air}`);
    const half = S.advanceTank(TK({ tankRate: 100, airMax: 0.4 }), { level: 0, air: 0.4, released: false }, S.sanitize({ ballast: -1 }), S.DT);
    ok("  ...and a bottle that holds less than the blow asks for blows as far as the air reaches (0.4 of it: level -0.4)", Math.abs(half.level + 0.4) < 1e-12 && Math.abs(half.air) < 1e-12, `level ${half.level}, air ${half.air}`);
    // --- the emergency blow: faster than the normal rate, twice the air per unit, and only when the model has an emergencyRate
    const em = TK({ tankRate: 0.25, airMax: 4, emergencyRate: 1 });
    const slowBlow = S.advanceTank(em, { level: 0, air: 4, released: false }, S.sanitize({ ballast: -1 }), 1), hardBlow = S.advanceTank(em, { level: 0, air: 4, released: false }, S.sanitize({ ballast: 1, blow: 1 }), 1);
    const noEm = S.advanceTank(TK({ tankRate: 0.25, airMax: 4 }), { level: 0, air: 4, released: false }, S.sanitize({ ballast: 1, blow: 1 }), 1);
    ok("!! the emergency blow drives the tank to -1 at ITS rate whatever the ballast command says (-1.0 in a second against -0.25 normally), costs twice the air per level unit, and a model with no emergencyRate ignores it",
        Math.abs(slowBlow.level + 0.25) < 1e-12 && Math.abs(slowBlow.air - 3.75) < 1e-12 && Math.abs(hardBlow.level + 1) < 1e-12 && Math.abs(hardBlow.air - 2) < 1e-12 && noEm.level > 0,
        `normal: level ${slowBlow.level} air ${slowBlow.air}; emergency: level ${hardBlow.level} air ${hardBlow.air}; no emergencyRate: level ${noEm.level.toFixed(2)}`);
    // --- the drop weight: one-way, only with a dropMass, and only on release > 0.5
    const dw = TK({ dropMass: 0.06 });
    const r1 = S.advanceTank(dw, S.initialTank(dw), S.sanitize({ release: 1 }), S.DT), r2 = S.advanceTank(dw, r1, S.sanitize({ release: 0 }), S.DT), r3 = S.advanceTank(dw, S.initialTank(dw), S.sanitize({ release: 0.4 }), S.DT), r4 = S.advanceTank(TK({ tankRate: 1 }), S.initialTank(TK({ tankRate: 1 })), S.sanitize({ release: 1 }), S.DT);
    ok("!! the drop weight is one-way (released stays true after the command goes off), needs release above 0.5, and a model with no dropMass ignores it", r1.released === true && r2.released === true && r3.released === false && r4.released === false);
    // --- the weight follows the TANK, not the command, when the tank has dynamics: a pump of 0.1/s told +1 for 3 s has filled to 0.3 and the vessel weighs 1 + 0.03 x 0.3, and stepSub is what advances it
    const pm = TK({ tankRate: 0.1 }); let ps = S.createState({ model: pm, depth: 30, speed: 0 });
    for (let i = 0; i < 90; i++) ps = S.stepSub(pm, ps, { pitch: 0, yaw: 0, thrust: 0, ballast: 1 }, S.DT).state;
    const nowW = vert(pm, S.createState({ model: pm, depth: 30, speed: 0 }), { ballast: 1 }, 0);
    ok("!! with a pump rate the weight follows the TANK: after 3 s of +1 at 0.1/s the level is 0.3 (stepSub advanced it), the net vertical force is the weight at the LEVEL (-0.03 x 0.3 of it) and not at the command (-0.03 of it), and a state with no tank starts at level 0",
        Math.abs(ps.tank.level - 0.3) < 1e-9 && Math.abs(vert(pm, { ...S.createState({ model: pm, depth: 30, speed: 0 }), tank: ps.tank }, { ballast: 1 }, 0) + 0.03 * 0.3 * pm.weight) < 1e-6 && Math.abs(nowW) < 1e-6,
        `level ${ps.tank.level.toFixed(4)}; force at that level ${vert(pm, { ...S.createState({ model: pm, depth: 30, speed: 0 }), tank: ps.tank }, { ballast: 1 }, 0).toFixed(1)} N (instant would be ${(-0.03 * pm.weight).toFixed(1)}); fresh state ${nowW.toFixed(3)} N`);
    // --- THE FLOOD: a leak of 5% of the weight against a tank that can only trim 3% sinks the vessel whatever the pilot does with the ballast; the drop weight (6%) turns it around
    const fl = TK({ dropMass: 0.06 });
    const lvl = S.createState({ model: fl, depth: 30, speed: 0 });
    const leakBlown = vert(fl, lvl, { ballast: -1 }, 0.05), leakDropped = vert(fl, { ...lvl, tank: { level: 0, air: Infinity, released: true } }, { ballast: -1 }, 0.05);
    ok("!! THE FLOOD: a 5% leak with the tank fully blown still pulls DOWN (net " + leakBlown.toFixed(0) + " N: 5% leak less the 3% the tank can offset, times the weight), and the same vessel with its 6% drop weight shed pulls UP (net " + leakDropped.toFixed(0) + " N)",
        Math.abs(leakBlown - (-0.02 * fl.weight)) < 1e-6 && Math.abs(leakDropped - (0.04 * fl.weight)) < 1e-6 && leakBlown < 0 && leakDropped > 0, `weight ${fl.weight.toFixed(0)} N`);
    const sinkEnd = run(fl, { pitch: 0, yaw: 0, thrust: 0, ballast: -1 }, 900, 0.05), riseEnd = run(fl, (i) => ({ pitch: 0, yaw: 0, thrust: 0, ballast: -1, release: 1 }), 900, 0.05);
    ok("!! ...and flown for 30 s from 30 m: without the release the vessel is deeper than it started, with it the vessel is shallower", -sinkEnd.pos[2] > 30 && -riseEnd.pos[2] < 30, `depth after 30 s: ${(-sinkEnd.pos[2]).toFixed(1)} m (no release), ${(-riseEnd.pos[2]).toFixed(1)} m (released)`);
}

console.log("\n7. THE FRONT DOOR");
{
    const lines = S.reportLines();
    ok("!! the export list is pinned", Object.keys(S).sort().join(",") === "DT,EXPLORER,GRAVITY,WATER_DENSITY,advanceTank,attitude,attitudeQuat,classify,createState,createSubModel,dynamicTank,forcesAndMoments,hasTank,initialTank,maxSpeed,rates,reportLines,sanitize,stepSub,submerged,trim", Object.keys(S).sort().join(","));
    ok("the report says real numbers (no NaN, no undefined) and names the vessel: 6000 kg, a 4.5x m/s top speed", lines.length === 6 && lines.every((l) => !/NaN|undefined/.test(l)) && /6000 kg/.test(lines[0]) && /top speed 4\.5/.test(lines[5]), lines[5]);
    ok("EXPLORER is frozen all the way down in the numbers a caller could mutate", Object.isFrozen(S.EXPLORER) && Object.isFrozen(S.EXPLORER.inertia) && Object.isFrozen(S.EXPLORER.rotDamp));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
