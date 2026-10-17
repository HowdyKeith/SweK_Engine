// WebGLEngine/physics/mechanics/bomber-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node physics/mechanics/bomber-selfcheck.mjs      (~0.3 s)
//
// THE BOMBER, HELD TO ITS LAYOUT AND TO ITS FLIGHT. physics/mechanics/bomber.mjs is a B-29-style layout (a hull of spheres, four engines, five gun seats) on the trainer's flight enlarged by similarity. What is held:
//
//   1  THE SCALE   the metres of the real aircraft become the bomber's by k = s x 10.6 / 43.05 (0.4925 at s = 2, 0.9849 at s = 4); the span is 10.6 s, the length 30.2 k; the mass and thrust are the similarity law's; the default is s = 2 and the reason (the
//                  slowest steady speed 30 sqrt(s)) is in the numbers; the object is frozen; a scale that is not a positive number is refused
//   2  THE HULL    seventeen spheres -- six of fuselage, six of wing, four engines and a fin -- every centre the layout's metres times k and every radius too, the wings and engines mirrored about the centre line to the bit, the engines with 8 hit points and
//                  nothing else with any, every sphere inside the wings' span and the aircraft's length; partCentres() carries them by the state's position and attitude (identity, a heading of 90 degrees, inverted)
//   3  THE SEATS   five gun seats at the layout's mounts, the two upper ones resting UP and the two lower ones DOWN with a hemisphere each, the tail resting AFT with a +-0.6 rad cone, all on the twin gun (30 rounds a second, 800 rounds); over 2,000 random
//                  directions every one is reachable by some seat, a direction above the horizon by no lower seat and below by no upper one; the tail reaches the rear cone and nothing forward; and the number of seats that can answer a fighter in each of
//                  six directions is pinned (behind and above: forward-upper, aft-upper and the tail; behind and below: the two lower and the tail; ahead and above, abeam and above: the two upper; straight down: the two lower; dead ahead and level: none of the tail)
//   4  THE ENGINES modelFor(n) is the same airframe with n/4 of the thrust, cached, clamped to 0..4: the throttle that holds the cruise speed is 4/n times the four-engine throttle (to 1e-6) -- feasible with 4, 3 and 2 engines and not with 1 or 0 --
//                  and flown by the wrapped autopilot for 60 s the bomber holds its altitude within 2 m and its speed within 0.2 m/s on four engines, ends more than 50 m low and slower on two, and more than 120 m low on one (the autopilot's throttle law has no
//                  memory, so a lost engine is a SAG and not a hunt for the speed)
//   5  THE HIT     a round fired at the bomber from dead astern reaches the tail cone, from above and ahead the forward fuselage or a sphere over it, from abeam an engine or the wing root -- the part the hit names is the nearest sphere on the round's path --
//                  and a round of the bomber's own does not hit its own spheres
//
// SABOTAGE LOG -- THIRTY-SIX, each applied to physics/mechanics/bomber.mjs in a scratch worktree, the gate run, the worktree restored; every one red by name (the number is how many rows went red):
//   BM1 metresOf inverted 2 | BM2 the span does not scale 2 | BM3 the length does not scale 1 | BM4 the default scale 4 7 | BM5 60 hit points becomes 40 1 | BM6 engine hit points 5 2
//   BM7 the cruise scales as s, not sqrt(s) 3 | BM8 the altitude does not scale 1 | BM9 part centres unscaled 7 | BM10 part radii unscaled 4 | BM11 the nose moved 0.5 m 3
//   BM12 the right wing tip not the left's mirror 1 | BM13 every part has the engines' hit points 1 | BM14 the engines list the wings 1 | BM15 seat mounts unscaled 1 | BM16 seat reach unscaled 1
//   BM17 the seats fire the fighters' single gun 1 | BM18 the twin gun fires 15 a second 1 | BM19 the magazine 300 1 | BM20 the forward upper seat rests down 3 | BM21 the tail cone twice as wide in yaw 1
//   BM22 the forward lower seat slews twice as fast 1 | BM23 the aft lower seat missing 1 | BM24 every model has the full thrust 4 | BM25 modelFor builds a new model every time 1 | BM26 modelFor does not clamp 1
//   BM27 modelFor does not round 1 | BM28 partCentres ignores the attitude 2 | BM29 partCentres ignores the position 4 | BM30 partCentres drops the names 4 | BM31 a part not frozen 1
//   BM32 the bomber not frozen 1 | BM33 the report says NaN 1 | BM34 a cruise speed asked for is ignored 1 | BM35 an altitude asked for is ignored 1 | BM36 the four-engine model is not the model 1
// TWO WENT 0 RED THE FIRST TIME: BM30 (partCentres drops the names) CRASHED the gate (a part looked up by name was undefined) -- the lookups now fall back to an all-NaN part so the row fails by name; BM34 (a cruise speed asked for is ignored) was a SYNTAX ERROR in the sabotage itself (&& and ?? mixed) and was rewritten, not the gate.
"use strict";
import * as B from "./bomber.mjs";
import * as F from "./flightModel6dof.mjs";
import * as G from "./flightGuns.mjs";
import * as GS from "./gunSeats.mjs";
import * as SC from "./froudeScale.mjs";
import * as AF from "../../brain/autopilotFlight.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const near = (a, b, tol) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol);
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const PI = Math.PI, ID = [1, 0, 0, 0];

console.log("bomber-selfcheck -- a B-29-style bomber on the trainer's flight, enlarged\n");

console.log("1. THE SCALE");
{
    const b = B.createBomber(), b4 = B.createBomber({ scale: 4 }), k2 = 2 * 10.6 / 43.05, k4 = 4 * 10.6 / 43.05;
    ok("!! the real aircraft's metres become the bomber's by k = s x 10.6 / 43.05: 0.4925 at s = 2 and 0.9849 at s = 4 (metresOf), and the span is 10.6 s and the length 30.2 k (21.2 m and 14.9 m at s = 2; 42.4 and 29.7 at s = 4)",
        Math.abs(B.metresOf(2) - k2) < 1e-15 && Math.abs(B.metresOf(4) - k4) < 1e-15 && Math.abs(b.k - k2) < 1e-15 && Math.abs(b.span - 21.2) < 1e-12 && Math.abs(b.length - 30.2 * k2) < 1e-12 && Math.abs(b4.span - 42.4) < 1e-12 && Math.abs(b4.length - 30.2 * k4) < 1e-12, `${b.span} x ${b.length.toFixed(2)}, ${b4.span} x ${b4.length.toFixed(2)}`);
    ok("!! the default is scale 2 (8,000 kg, thrust 32,000 N, 60 hit points), and the flight is the trainer's by similarity: the mass is 1,000 s^3 and the thrust 4,000 s^3 at any scale (64,000 kg and 256,000 N at s = 4)", b.scale === 2 && b.spec.mass === 8000 && b.spec.thrustMax === 32000 && b.hp === 60 && b4.spec.mass === 64000 && b4.spec.thrustMax === 256000 && b.law.speed === Math.SQRT2 && b.model.spec === b.spec && B.DEFAULT_SCALE === 2 && B.ENGINES === 4 && B.HIT_POINTS === 60 && B.ENGINE_HIT_POINTS === 8);
    ok("!! the CRUISE is the slowest steady speed the autopilot holds, 30 sqrt(s) plus 2%: 43.3 m/s at s = 2 (a fighter at its top speed of 52.8 closes on it by 9.5 m/s) and 61.2 at s = 4 (past the fighter's top speed: it cannot be caught level); the altitude is 250 s",
        Math.abs(b.cruiseSpeed - 30 * Math.SQRT2 * 1.02) < 1e-12 && Math.abs(b4.cruiseSpeed - 60 * 1.02) < 1e-12 && b.cruiseSpeed < 52.8 && b4.cruiseSpeed > 52.8 && b.altitude === 500 && b4.altitude === 1000 && B.createBomber({ speed: 50, altitude: 700 }).cruiseSpeed === 50 && B.createBomber({ altitude: 700 }).altitude === 700, `${b.cruiseSpeed.toFixed(2)} / ${b4.cruiseSpeed.toFixed(2)}`);
    const bad = (x) => { try { B.createBomber({ scale: x }); return null; } catch (e) { return e.message; } };
    ok("the bomber is frozen (the object, the parts, the seats' list), and a scale that is not a positive finite number is refused by name", Object.isFrozen(b) && Object.isFrozen(b.parts) && Object.isFrozen(b.parts[0]) && Object.isFrozen(b.parts[0].center) && Object.isFrozen(b.seats) && Object.isFrozen(b.engines) && [0, -1, NaN].every((x) => /positive finite/.test(bad(x) || "")));
}

console.log("\n2. THE HULL");
{
    const b = B.createBomber(), k = b.k, kinds = (kind) => b.parts.filter((p) => p.kind === kind), nose = b.parts.find((p) => p.name === "nose");
    ok("!! seventeen spheres: six of fuselage, six of wing, four engines and the fin, numbered from 0 in order; the nose is at 11.5 k forward with a radius of 2 k; every radius is positive", b.parts.length === 17 && kinds("fuselage").length === 6 && kinds("wing").length === 6 && kinds("engine").length === 4 && kinds("fin").length === 1 && b.parts.every((p, i) => p.id === i && p.radius > 0) && near(nose.center, [11.5 * k, 0, 0], 1e-12) && Math.abs(nose.radius - 2.0 * k) < 1e-12);
    const mirror = b.parts.filter((p) => p.center[1] > 1e-9).every((p) => b.parts.some((q) => q.center[1] === -p.center[1] && q.center[0] === p.center[0] && q.center[2] === p.center[2] && q.radius === p.radius));
    ok("!! the wings and the engines are MIRRORED about the centre line to the bit: every sphere left of it (+Y) has a twin the same distance right of it with the same station, height and radius, and the fuselage and fin sit on the line", mirror && b.parts.filter((p) => p.kind === "wing" || p.kind === "engine").filter((p) => p.center[1] > 1e-9).length === 5 && b.parts.filter((p) => p.kind === "fuselage" || p.kind === "fin").every((p) => p.center[1] === 0));
    ok("!! the engines have 8 hit points each and nothing else has any; engines() lists their four ids; every sphere is inside the wings' span (half of 43.05 k) and the aircraft's length (the nose and tail cone within 30.2 k of one another)", b.parts.filter((p) => p.kind === "engine").every((p) => p.hp === 8) && b.parts.filter((p) => p.kind !== "engine").every((p) => p.hp === null) && b.engines.join() === "12,13,14,15" && b.parts.every((p) => Math.abs(p.center[1]) + p.radius <= 21.525 * k + 1e-9) && Math.max(...b.parts.map((p) => p.center[0] + p.radius)) - Math.min(...b.parts.map((p) => p.center[0] - p.radius)) <= 30.2 * k + 1e-9);
    const idc = B.partCentres(b, { pos: [100, 200, 300], q: ID }), gone = { center: [NaN, NaN, NaN], radius: NaN, kind: null, part: null }, nz = idc.find((p) => p.name === "nose") || gone;
    ok("partCentres carries each sphere by the state: at the identity the centre is the position plus the body-frame centre; each entry names its part, kind and radius", idc.length === 17 && near(nz.center, [100 + 11.5 * k, 200, 300], 1e-12) && nz.kind === "fuselage" && nz.radius === nose.radius && nz.part === nose.id);
    const turned = F.createState({ pos: [0, 0, 300], speed: 45, heading: PI / 2 }), tc = B.partCentres(b, turned), left = tc.find((p) => p.name === "left wing tip") || gone;
    ok("!! a heading of 90 degrees (the nose to world -Y) puts the nose at -11.5 k in Y and the LEFT wing tip (+Y in the body, 0.5 k AFT of the centre of mass) at (17.5 k, +0.5 k) in the world", near((tc.find((p) => p.name === "nose") || gone).center, [0, -11.5 * k, 300], 1e-9) && near(left.center, [17.5 * k, 0.5 * k, 300 + 0.6 * k], 1e-9), `${left.center.map((v) => v.toFixed(2))}`);
    const inv = F.createState({ pos: [0, 0, 300], speed: 45, heading: 0, bank: PI }), ic = B.partCentres(b, inv).find((p) => p.name === "fin") || gone;
    ok("!! inverted, the fin (4.4 k ABOVE the centre of mass) hangs 4.4 k BELOW it", Math.abs(ic.center[2] - (300 - 4.4 * k)) < 1e-9 && Math.abs(ic.center[1]) < 1e-9, `${ic.center.map((v) => v.toFixed(3))}`);
    const b4 = B.createBomber({ scale: 4 });
    ok("the layout scales: at s = 4 every centre and radius is twice the s = 2 bomber's", b4.parts.every((p, i) => near(p.center, b.parts[i].center.map((v) => v * 2), 1e-12) && Math.abs(p.radius - b.parts[i].radius * 2) < 1e-12));
}

console.log("\n3. THE SEATS");
{
    const b = B.createBomber(), k = b.k, by = (id) => b.seats.find((s) => s.id === id), still = { pos: [0, 0, 300], vel: [0, 0, 0], q: ID, w: [0, 0, 0] };
    ok("!! five seats -- forward upper, forward lower, aft upper, aft lower, tail -- at the layout's mounts times k (the forward upper at (6.5, 0, 1.9) k and the tail at (-14.8, 0, 0.5) k), each a gunSeats seat on the TWIN GUN (30 rounds a second, 800 rounds, 300 m/s) with a reach of 1.2 k",
        b.seats.map((s) => s.id).join() === "fwd-upper,fwd-lower,aft-upper,aft-lower,tail" && near(by("fwd-upper").mount, [6.5 * k, 0, 1.9 * k], 1e-12) && near(by("tail").mount, [-14.8 * k, 0, 0.5 * k], 1e-12) && b.seats.every((s) => s.gun.rate === 30 && s.gun.magazine === 800 && s.gun.muzzleSpeed === 300 && Math.abs(s.reach - 1.2 * k) < 1e-12 && Object.isFrozen(s)) && B.TURRET_GUN.rate === 30 && Object.isFrozen(B.TURRET_GUN));
    ok("!! the two UPPER seats rest UP and the two LOWER seats rest DOWN, each with a hemisphere (yaw and pitch +-90 degrees), and the tail rests AFT with a cone of +-0.6 rad; the turrets slew at 1.2 rad/s in yaw and 1.0 in pitch, the tail at 1.4 and 1.2",
        near(by("fwd-upper").rest, [0, 0, 1], 1e-12) && near(by("aft-upper").rest, [0, 0, 1], 1e-12) && near(by("fwd-lower").rest, [0, 0, -1], 1e-12) && near(by("aft-lower").rest, [0, 0, -1], 1e-12) && near(by("tail").rest, [-1, 0, 0], 1e-12)
        && ["fwd-upper", "fwd-lower", "aft-upper", "aft-lower"].every((id) => by(id).arc.yaw[0] === -PI / 2 && by(id).arc.yaw[1] === PI / 2 && by(id).arc.pitch[1] === PI / 2 && by(id).slew.yaw === 1.2 && by(id).slew.pitch === 1.0) && by("tail").arc.yaw[1] === 0.6 && by("tail").arc.pitch[0] === -0.6 && by("tail").slew.yaw === 1.4 && by("tail").slew.pitch === 1.2);
    const reach = (d) => b.seats.filter((s) => GS.reachOf(s, still, d).inArc).map((s) => s.id).join();
    const rng = mulberry(9); let uncovered = 0, lowerUp = 0, upperDown = 0, n = 0, tailFwd = 0, tailRear = 0;
    for (let i = 0; i < 2000; i++) {
        const d = [rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1], m = Math.hypot(...d); if (m < 0.2 || Math.abs(d[2] / m) < 0.01) continue; const u = d.map((v) => v / m); n++;
        const who = b.seats.filter((s) => GS.reachOf(s, still, u).inArc).map((s) => s.id);
        if (!who.length) uncovered++;
        if (u[2] > 0 && who.some((id) => id === "fwd-lower" || id === "aft-lower")) lowerUp++;
        if (u[2] < 0 && who.some((id) => id === "fwd-upper" || id === "aft-upper")) upperDown++;
        if (u[0] > 0 && who.includes("tail")) tailFwd++;
        if (u[0] < -0.9 && Math.abs(u[1]) < 0.3 && Math.abs(u[2]) < 0.3 && !who.includes("tail")) tailRear++;
    }
    ok("!! over 2,000 random directions EVERY ONE is reachable by some seat (the two hemispheres between them are the whole sky), no direction above the horizon is reachable by a lower seat and none below it by an upper one, the tail never reaches a direction with a forward component, and it always reaches the cone astern",
        n > 1900 && uncovered === 0 && lowerUp === 0 && upperDown === 0 && tailFwd === 0 && tailRear === 0, `${n} directions, ${uncovered} uncovered, ${lowerUp} lower-up, ${upperDown} upper-down, ${tailFwd} tail-forward`);
    ok("!! WHO CAN ANSWER A FIGHTER: behind and above -- the forward upper, the aft upper and the tail; behind and below -- the two lower and the tail; ahead and above -- the two upper; abeam and above -- the two upper; straight down -- the two lower; 40 degrees above astern -- the two upper and not the tail (its cone is +-0.6 rad = 34 degrees)",
        reach([-1, 0, 0.3]) === "fwd-upper,aft-upper,tail" && reach([-1, 0, -0.3]) === "fwd-lower,aft-lower,tail" && reach([1, 0, 0.3]) === "fwd-upper,aft-upper" && reach([0, 1, 0.3]) === "fwd-upper,aft-upper" && reach([0, 0, -1]) === "fwd-lower,aft-lower" && reach([-1, 0, 0.84]) === "fwd-upper,aft-upper",
        [[-1, 0, 0.3], [-1, 0, -0.3], [1, 0, 0.3], [0, 0, -1]].map((d) => reach(d)).join(" | "));
}

console.log("\n4. THE ENGINES");
{
    const b = B.createBomber(), m = (n) => b.modelFor(n);
    ok("!! modelFor(n) is the same airframe with n/4 of the thrust (8,000 N each at s = 2), the same object each time it is asked, clamped to 0..4 (5 is 4, -1 is 0) and rounded (2.6 is 3), and modelFor(4) is the model itself", m(4) === b.model && m(3).spec.thrustMax === 24000 && m(2).spec.thrustMax === 16000 && m(1).spec.thrustMax === 8000 && m(0).spec.thrustMax === 0 && m(2) === m(2) && m(5) === m(4) && m(-1) === m(0) && m(2.6) === m(3) && m(2).spec.mass === b.spec.mass && m(2).spec.airframe === b.spec.airframe);
    const tr = (n) => F.trim(m(n), b.cruiseSpeed);
    ok("!! the throttle that holds the cruise speed on n engines is 4/n times the four-engine throttle (0.397), to 1e-6, for 3 and 2 engines -- FEASIBLE with 4, 3 and 2 engines and NOT with 1 (it would need 1.59) or 0",
        tr(4).feasible && tr(3).feasible && tr(2).feasible && !tr(1).feasible && !tr(0).feasible && Math.abs(tr(3).throttle - tr(4).throttle * 4 / 3) < 1e-6 && Math.abs(tr(2).throttle - tr(4).throttle * 2) < 1e-6 && Math.abs(tr(1).throttle - tr(4).throttle * 4) < 1e-6 && Math.abs(tr(4).throttle - 0.397) < 5e-4, `${[4, 3, 2, 1].map((n) => tr(n).throttle.toFixed(3)).join(" ")}`);
    const fly = (n, seconds = 60) => {
        const model = b.modelFor(n), pilot = SC.scalePilot(AF.pilot, b.scale); let st = F.createState({ pos: [0, 0, b.altitude], speed: b.cruiseSpeed, heading: 0, pitch: 0.16, mass: model.mass, inertia: model.inertia }), status = "airborne";
        for (let i = 0; i < seconds * 30 && status === "airborne"; i++) { const r = F.stepFlight(model, st, pilot(st, { heading: 0, altitude: b.altitude, airspeed: b.cruiseSpeed }, [0, 0, 0]), 1 / 30); st = r.state; status = r.status; }
        return { status, alt: st.pos[2], v: F.attitude(st).airspeed };
    };
    const r4 = fly(4), r2 = fly(2), r1 = fly(1);
    ok("!! FLOWN for 60 s by the wrapped autopilot at cruise: on four engines the bomber holds its altitude within 2 m and its speed within 0.2 m/s of the target; on two it ends more than 50 m low and 2 m/s slow, still flying; on one more than 120 m low (a lost engine is a sag: the autopilot's throttle law has no memory)",
        r4.status === "airborne" && Math.abs(r4.alt - b.altitude) < 2 && Math.abs(r4.v - b.cruiseSpeed) < 0.2 && r2.status === "airborne" && b.altitude - r2.alt > 50 && b.cruiseSpeed - r2.v > 2 && r1.status === "airborne" && b.altitude - r1.alt > 120, `4: ${r4.alt.toFixed(1)} m ${r4.v.toFixed(2)} m/s | 2: ${r2.alt.toFixed(1)} m ${r2.v.toFixed(2)} | 1: ${r1.alt.toFixed(1)} m`);
}

console.log("\n5. THE HIT");
{
    const b = B.createBomber(), st = F.createState({ pos: [0, 0, 300], speed: 43, heading: 0 }), dt = 0.2;   // a round goes 60 m in a tick of 0.2 s: the whole aircraft in one sweep
    const targets = (id) => B.partCentres(b, st).map((p) => ({ id, part: p.name, from: p.center, to: p.center, radius: p.radius }));
    const shoot = (from, dir, owner = 1) => G.stepRounds([{ pos: from, vel: dir.map((v) => v * 300), age: 0, owner }], dt, targets(2), { life: 5 });
    const astern = shoot([-30, 0, 300], [1, 0, 0]), ahead = shoot([30, 0, 300], [-1, 0, 0]), above = shoot([2, 0, 330], [0, 0, -1]), abeam = shoot([2.5 * b.k, 40, 300], [0, -1, 0]);
    ok("!! a round from dead ASTERN reaches the tail cone (the nearest sphere on its path), from dead AHEAD the nose, from straight ABOVE a sphere on the centre line over the fuselage, and from abeam at the engine station an engine -- the hit names the part",
        astern.hits.length === 1 && astern.hits[0].part === "tail cone" && ahead.hits.length === 1 && ahead.hits[0].part === "nose" && above.hits.length === 1 && b.parts.find((p) => p.name === above.hits[0].part).center[1] === 0 && abeam.hits.length === 1 && b.parts.find((p) => p.name === abeam.hits[0].part).kind === "engine" && abeam.hits[0].target === 2,
        `${astern.hits[0] && astern.hits[0].part} | ${ahead.hits[0] && ahead.hits[0].part} | ${above.hits[0] && above.hits[0].part} | ${abeam.hits[0] && abeam.hits[0].part}`);
    const own = shoot([-30, 0, 300], [1, 0, 0], 2);
    ok("!! a round of the bomber's own (owner 2, the id on every one of its spheres) passes through them all: no hit, and the round survives", own.hits.length === 0 && own.rounds.length === 1);
}

console.log("\n6. THE FRONT DOOR");
{
    const lines = B.reportLines();
    ok("!! the export list is pinned: B29, DEFAULT_SCALE, ENGINES, ENGINE_HIT_POINTS, HIT_POINTS, TRAINER_SPAN, TURRET_GUN, createBomber, metresOf, modelWith, partCentres, reportLines", Object.keys(B).sort().join(",") === "B29,DEFAULT_SCALE,ENGINES,ENGINE_HIT_POINTS,HIT_POINTS,TRAINER_SPAN,TURRET_GUN,createBomber,metresOf,modelWith,partCentres,reportLines", Object.keys(B).sort().join(","));
    ok("the report lines say real numbers (no NaN, no undefined), the s = 2 bomber's span, mass and cruise, its seats by name, and that the fighters cannot catch the B-29's own span", lines.length === 2 && lines.every((l) => !/NaN|undefined/.test(l)) && /21\.2 m span/.test(lines[1]) && /8000 kg/.test(lines[1]) && /tail/.test(lines[1]) && /cannot catch/.test(lines[1]), lines[1].slice(0, 160));
    ok("modelWith is modelFor", B.modelWith(B.createBomber(), 3).spec.thrustMax === 24000 && Object.isFrozen(B.B29) && B.B29.span === 43.05 && B.TRAINER_SPAN === 10.6);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
