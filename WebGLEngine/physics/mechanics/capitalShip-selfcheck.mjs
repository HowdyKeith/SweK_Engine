// WebGLEngine/physics/mechanics/capitalShip-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node physics/mechanics/capitalShip-selfcheck.mjs      (~2 s)
//
// THE CAPITAL SHIP, HELD TO CLOSED FORMS WHERE THERE ARE ANY AND SAID PLAINLY WHERE THERE ARE NONE. physics/mechanics/capitalShip.mjs is a hull, a row of hit spheres, eleven gun seats, three engine pods and a fictional cannon -- and EVERY NUMBER IN IT IS INVENTED (the
// module says so); what a gate can hold is that the numbers are consistent with each other and with the arithmetic they feed:
//
//   1  THE HULL        the mass is the fighters' own density (8 kg in 1.6 x 0.7 x 0.7 half-extents) times the hull's volume (24 x 4.5 x 4), to the nearest 100 kg: 4,400; the inertia is the box's closed form m/3 (b^2 + c^2) on each axis, to 1e-9 relative; the module's constants are frozen
//                      and the ship is frozen all the way down
//   2  THE AUTHORITY   the PD gains are the ones that make the angular-acceleration limit the controller's OWN limit (kp = maxAlpha / pi, kd = 2 sqrt(kp): critically damped), limitTorque() cuts each axis to I maxAlpha and hands a vector inside the limit back as the same numbers;
//                      flown through the real rigid body (rigidBody6dof.step) by the real autopilot (autopilot6dof.decide), a 45, 90 and 172 degree turn settles to 2 degrees in the times measured here (17, 20 and 23 s -- against 2.2 s for a fighter's 90 degrees), NEVER overshoots, and never
//                      asks for more than the limit (peak 25%, 50% and 95% of it)
//   3  THE ENGINES     three pods at the stern, a pod a third of the thrust, a count outside 0..3 clamped
//   4  THE SPHERES     twenty, named and numbered, each in the body frame as the table says; port and starboard are mirrors of each other and so are their seats; partCentres() carries every sphere by the body's position and attitude (identity, a shift, 90 degrees about +Z and about +X, checked by hand);
//                      the five hull spheres cover 73% of the hull's box (the corners are not covered, said plainly) and its axis from -23 to 22
//   5  THE SEATS       eleven: three main turrets (A and B forward, C aft) and eight point-defence mounts (three a side, two below); each sits in the part it is named for (inside it, and that part is a turret or a PD mount); the arcs, rests and slews are the table's; over 40,000 random directions
//                      EVERY ONE is reachable by some seat, the point-defence mounts alone reach every one, and the main battery reaches the fraction closed form gives -- (sin 1.45 + sin 0.05) / 2 = 0.5213 of them, the deck's side only -- with the aft turret reaching straight astern and the forward pair not
//   6  THE GUNS        every seat's gun is its kind's, frozen (the main shell 500 units/s, 1.5 a second, 160 rounds, 60 damage, 5 s; the PD round 1,100, 6, 900, 10, 1.6 s); and each of the eleven gunners, in vacuum (gravity 0), hits a target standing 150 units out along that seat's own rest direction
//   7  THE FRONT DOOR  the export list is pinned and the report lines say real numbers
//
// SABOTAGE LOG -- FORTY-SIX, each applied to physics/mechanics/capitalShip.mjs in a scratch worktree, the gate run, the worktree restored; every one red by name (the number is how many rows went red):
//   C1 the fighters' mass is 9 4 | C2 the inertia's x and y half-extents swapped 2 | C3 the hull is 10 across 4 | C4 1,000 hit points 1 | C5 a thrust of 2,000 2 | C6 four engine pods' worth 2
//   C7 an angular acceleration of 0.5 5 | C8 kp is the limit over 2 3 | C9 kd is sqrt(kp), not twice it 3 | C10 limitTorque does not cut a negative torque 1
//   C11 limitTorque uses the first axis's inertia for all 2 | C12 limitTorque lets through twice the limit 1 | C13 the aim radius is 3 1 | C14 thrustWith does not clamp 1 | C15 thrustWith divides by 4 1
//   C16 partCentres ignores the attitude 1 | C17 partCentres ignores the position 1 | C18 partCentres rotates the wrong way 1 | C19 the engines list is the PD mounts 1 | C20 the bow sphere at x = 16 2
//   C21 a turret has 100 hit points 1 | C22 a starboard PD mount has 50 2 | C23 starboard PD 1 on the port side 2 | C24 the bridge is 1.5 lower 1 | C25 the aft turret faces forward 3
//   C26 the main arcs 3.0 wide in yaw 1 | C27 the main barrels reach 1.6 up 2 | C28 the PD arcs a quarter circle 2 | C29 pd-p1 slews at 1 1 | C30 main-a slews at 1 1 | C31 the seat-part mapping is off by one 1
//   C32 a seat's gun is a copy of its kind's 2 | C33 the main shell at 400 1 | C34 the PD round at 3 a second 1 | C35 the PD magazine 600 1 | C36 the PD round does 20 1 | C37 a ventral mount faces up 1
//   C38 pd-p2 faces to starboard 2 | C39 main-a's mount 5 units forward of its turret 1 | C40 the wave-motion cannon charges for 8 s 1 | C41 the wave-motion cannon reaches 600 1
//   C42 the wave-motion cannon is not called invented 1 | C43 the report does not say the numbers are invented 1 | C44 the parts list is not frozen 1 | C45 the main gun's life is 3 1
//   C46 the ship's mass is not rounded to 100 4
// NONE WENT 0 RED. THE GATE'S OWN FIRST DRAFT WAS WRONG IN TWO PLACES THAT THE RUN FOUND, AND THE GATE WAS CORRECTED, NOT THE SHIP: the hull spheres cover 73% of the box, not the 77% a poorly mixed generator had said (a hand-rolled LCG gave 76.8% on the same points; the mulberry stream gives 72.7%), and they cover the axis from x = -23 to 22, not the box's whole 48 (the bow's last 2 units and the stern's 1 are bare). THE AUTHORITY WAS CHANGED BY THE FIRST MEASUREMENT: at 0.1 rad/s^2 a 90-degree turn took 32 s, longer than a fight's first act, so the limit is 0.25 (20 s).
"use strict";
import * as CS from "./capitalShip.mjs";
import * as RB from "./rigidBody6dof.mjs";
import * as GS from "./gunSeats.mjs";
import * as G from "./flightGuns.mjs";
import * as AP from "../../brain/autopilot6dof.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const near = (a, b, tol) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol);
const PI = Math.PI, SH = CS.createCapitalShip();
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const still = { pos: [0, 0, 0], vel: [0, 0, 0], q: [1, 0, 0, 0], w: [0, 0, 0] };

console.log("capitalShip-selfcheck -- a Yamato-like capital ship (every number invented)\n");

console.log("1. THE HULL");
{
    const { HALF: H, FIGHTER: Fi } = CS, density = Fi.mass / (Fi.half[0] * Fi.half[1] * Fi.half[2]), m = SH.mass, I = [m / 3 * (H[1] ** 2 + H[2] ** 2), m / 3 * (H[0] ** 2 + H[2] ** 2), m / 3 * (H[0] ** 2 + H[1] ** 2)];
    ok("!! the hull is 48 x 9 x 8 (half-extents 24, 4.5, 4) and its mass is the FIGHTERS' DENSITY times its volume to the nearest 100 kg (8 kg in 0.784 cubic units: 10.2 kg a cubic unit times 432 is 4,408 -> 4,400)", H.join() === "24,4.5,4" && SH.half === CS.HALF && SH.mass === 4400 && Math.abs(density * H[0] * H[1] * H[2] - 4408) < 1 && CS.MASS === 4400 && Fi.mass === 8 && Fi.half.join() === "1.6,0.7,0.7", `${density * H[0] * H[1] * H[2]}`);
    ok("!! the inertia is the box's closed form on each axis, m/3 (b^2 + c^2): [53,167, 868,267, 874,500] to 1e-9 relative, and it is the one rigidBody6dof.boxInertia gives", SH.I.every((v, i) => Math.abs(v - I[i]) / I[i] < 1e-9) && near(SH.I, RB.boxInertia({ m: 4400, hx: 24, hy: 4.5, hz: 4 }), 1e-6) && Math.abs(SH.I[0] - 53166.67) < 0.01, `${SH.I.map((v) => v.toFixed(0))}`);
    ok("the numbers the rest of the arithmetic hangs on are pinned: 1,500 hit points, 1,500 of thrust in three pods, an angular acceleration of 0.25 rad/s^2, an aim radius of 6; the module's constants and the ship are frozen all the way down", SH.hp === 1500 && CS.HIT_POINTS === 1500 && SH.thrustMax === 1500 && CS.ENGINE_PODS === 3 && SH.maxAlpha === 0.25 && SH.aimRadius === 6 && Object.isFrozen(SH) && Object.isFrozen(SH.parts) && Object.isFrozen(SH.parts[0]) && Object.isFrozen(SH.parts[0].center) && Object.isFrozen(SH.seats) && Object.isFrozen(SH.I) && Object.isFrozen(SH.engines) && Object.isFrozen(SH.seatPart) && Object.isFrozen(CS.HALF) && Object.isFrozen(CS.MAIN_GUN) && Object.isFrozen(CS.PD_GUN) && Object.isFrozen(CS.WAVE_GUN) && Object.isFrozen(CS.WAVE_GUN.muzzle) && Object.isFrozen(CS.FIGHTER));
}

console.log("\n2. THE AUTHORITY");
{
    ok("!! the gains make the limit the controller's own: kp = maxAlpha / pi = 0.0796 (so the largest error, pi radians, asks for exactly the angular acceleration the hull has), kd = 2 sqrt(kp) = 0.5642 (critical damping)", Math.abs(SH.kp - 0.25 / PI) < 1e-15 && Math.abs(SH.kd - 2 * Math.sqrt(0.25 / PI)) < 1e-15 && Math.abs(SH.kd - 0.5642) < 1e-3, `${SH.kp} ${SH.kd}`);
    const lim = SH.I.map((i) => i * SH.maxAlpha), inside = [0.5 * lim[0], -0.25 * lim[1], 0.99 * lim[2]], same = CS.limitTorque(SH, inside);
    ok("!! limitTorque cuts each axis to +-I maxAlpha (a torque three times the limit comes back AT the limit, with its sign, on every axis, and each axis on its own: one over the limit does not touch the others), and a vector inside the limit comes back as THE SAME NUMBERS", near(CS.limitTorque(SH, [3 * lim[0], -3 * lim[1], 3 * lim[2]]), [lim[0], -lim[1], lim[2]], 1e-9) && same.every((v, i) => Object.is(v, inside[i])) && near(CS.limitTorque(SH, [3 * lim[0], inside[1], inside[2]]), [lim[0], inside[1], inside[2]], 1e-9) && CS.limitTorque(SH, [0, 0, 0]).every((v) => v === 0) && Math.abs(lim[1] - 868267 * 0.25) < 1);
    const turn = (angle) => {
        let body = RB.createBody({ mass: SH.mass, I: [...SH.I], q: [1, 0, 0, 0] }), settled = null, maxOver = 0, peak = 0; const dt = 1 / 30, c = [Math.cos(angle), Math.sin(angle)];
        for (let i = 0; i < 30 * 60; i++) {
            const d = AP.decide(body, { pos: [c[0] * 1000, c[1] * 1000, 0], vel: [0, 0, 0] }, { kp: SH.kp, kd: SH.kd, thrustForce: 0, standoff: 1e9 }), tq = CS.limitTorque(SH, d.torqueBody);
            for (let k = 0; k < 3; k++) peak = Math.max(peak, Math.abs(tq[k]) / (SH.I[k] * SH.maxAlpha));
            const acc = RB.createAccumulator(); acc.torque = tq; body = RB.step(body, acc, dt);
            const f = RB.rotateByQuat(body.q, [1, 0, 0]), err = Math.acos(Math.max(-1, Math.min(1, f[0] * c[0] + f[1] * c[1])));
            if (err < 0.035 && settled === null) settled = (i + 1) * dt;
            maxOver = Math.max(maxOver, (angle > 0 ? Math.atan2(f[1], f[0]) - angle : angle - Math.atan2(f[1], f[0])));
        }
        return { settled, over: maxOver / angle, peak };
    };
    const t45 = turn(PI / 4), t90 = turn(PI / 2), t172 = turn(3.0), fighter = (() => { let body = RB.createBody({ mass: 8, I: RB.boxInertia({ m: 8, hx: 1.6, hy: 0.7, hz: 0.7 }), q: [1, 0, 0, 0] }), settled = null; for (let i = 0; i < 300; i++) { const d = AP.decide(body, { pos: [0, 1000, 0], vel: [0, 0, 0] }, { thrustForce: 0, standoff: 1e9 }), acc = RB.createAccumulator(); acc.torque = d.torqueBody; body = RB.step(body, acc, 1 / 30); const f = RB.rotateByQuat(body.q, [1, 0, 0]); if (Math.acos(Math.max(-1, Math.min(1, f[1]))) < 0.035 && settled === null) settled = (i + 1) / 30; } return settled; })();
    ok("!! FLOWN THROUGH THE REAL BODY AND THE REAL AUTOPILOT, with the ship's gains and the limit: a 45, 90 and 172 degree turn settles to 2 degrees in 17.2, 20.1 and 22.8 s, NEVER overshoots the target (0), and never asks for more than the limit (peaks of 25%, 50% and 95% of it, the PD's own demand: kp x error)", Math.abs(t45.settled - 17.2333) < 0.05 && Math.abs(t90.settled - 20.1333) < 0.05 && Math.abs(t172.settled - 22.8) < 0.05 && t45.over <= 0 && t90.over <= 0 && t172.over <= 0 && Math.abs(t45.peak - 0.25) < 1e-3 && Math.abs(t90.peak - 0.5) < 1e-3 && Math.abs(t172.peak - 0.955) < 5e-3, `${t45.settled}, ${t90.settled}, ${t172.settled} s; peaks ${t45.peak.toFixed(3)} ${t90.peak.toFixed(3)} ${t172.peak.toFixed(3)}`);
    ok("!! and it is a HULL WHOSE GUNNERS DO THE WORK: a fighter (the page's, mass 8, the autopilot's own gains) settles the same 90 degrees in 2.2 s -- the capital ship takes nine times as long", fighter !== null && Math.abs(fighter - 2.2333) < 0.05 && t90.settled > 8 * fighter, `${fighter} s vs ${t90.settled} s`);
}

console.log("\n3. THE ENGINES");
{
    const st = SH.parts.filter((p) => p.kind === "engine");
    ok("!! three engine pods at the stern (x = -23, y = -2.8, 0, +2.8), 100 hit points each, and `engines` lists their part ids", SH.engines.length === 3 && st.length === 3 && SH.engines.join() === st.map((p) => p.id).join() && st.every((p) => p.center[0] === -23 && p.hp === 100 && p.radius === 1.8) && st.map((p) => p.center[1]).join() === "-2.8,0,2.8" && st.map((p) => p.name).join() === "engine pod 1,engine pod 2,engine pod 3");
    ok("!! a pod is a third of the thrust: 3 running is 1,500, 2 is 1,000, 1 is 500, 0 is 0, and a count outside 0..3 is clamped (-1 is 0, 7 is 1,500, 2.4 rounds to 2)", [3, 2, 1, 0, -1, 7, 2.4].map((n) => CS.thrustWith(SH, n)).join() === "1500,1000,500,0,0,1500,1000");
}

console.log("\n4. THE SPHERES");
{
    const P = SH.parts, by = (n) => P.find((p) => p.name === n);
    ok("!! twenty hit spheres, numbered in order from 0, uniquely named, each a frozen { id, name, kind, center, radius, hp }: five hull, a bridge, three main turrets, three engine pods, six flank PD mounts and two ventral", P.length === 20 && P.every((p, i) => p.id === i) && new Set(P.map((p) => p.name)).size === 20 && ["hull", "bridge", "turret", "engine", "pd"].map((k) => P.filter((p) => p.kind === k).length).join() === "5,1,3,3,8" && P.every((p) => p.radius > 0 && p.center.length === 3 && (p.hp === null) === (p.kind === "hull" || p.kind === "bridge")));
    ok("!! the hull spheres run down the axis (x = 17, 9, 0, -9, -18, y = z = 0, radii 5.0, 5.2, 5.4, 5.2, 5.0), the bridge stands on top at (-3, 0, 6.5), the main turrets on the deck at (16, 0, 5.2), (9.5, 0, 5.2), (-14, 0, 5.2) with 120 hit points, a PD mount 60", [["bow", 17, 5.0], ["forward hull", 9, 5.2], ["midships", 0, 5.4], ["aft hull", -9, 5.2], ["stern", -18, 5.0]].every(([n, x, r]) => by(n).center[0] === x && by(n).center[1] === 0 && by(n).center[2] === 0 && by(n).radius === r) && near(by("bridge").center, [-3, 0, 6.5], 0) && near(by("main turret A").center, [16, 0, 5.2], 0) && near(by("main turret B").center, [9.5, 0, 5.2], 0) && near(by("main turret C").center, [-14, 0, 5.2], 0) && P.filter((p) => p.kind === "turret").every((p) => p.hp === 120) && P.filter((p) => p.kind === "pd").every((p) => p.hp === 60));
    ok("!! PORT AND STARBOARD ARE MIRRORS: each port PD sphere has the starboard one's x and z, its y negated, the same radius and hit points (three pairs), and the engine pods are symmetric about y = 0", [1, 2, 3].every((i) => { const a = by(`port PD ${i}`), b = by(`starboard PD ${i}`); return a.center[0] === b.center[0] && a.center[2] === b.center[2] && a.center[1] === -b.center[1] && a.radius === b.radius && a.hp === b.hp && a.center[1] > 0; }) && by("engine pod 1").center[1] === -by("engine pod 3").center[1]);
    const c0 = CS.partCentres(SH, still), shift = CS.partCentres(SH, { ...still, pos: [100, -50, 7] }), rz = CS.partCentres(SH, { ...still, pos: [10, 0, 0], q: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] }), rx = CS.partCentres(SH, { ...still, q: [Math.SQRT1_2, Math.SQRT1_2, 0, 0] });
    ok("!! partCentres carries every sphere by the body's position and attitude, by hand for all twenty: the identity body gives the table; a shift of (100, -50, 7) adds it; 90 degrees about +Z sends (x, y, z) to (-y, x, z) (plus the body's position); 90 degrees about +X sends it to (x, -z, y); radii and names unchanged",
        c0.every((c, i) => near(c.center, SH.parts[i].center, 1e-12) && c.radius === SH.parts[i].radius && c.name === SH.parts[i].name && c.part === i) && shift.every((c, i) => near(c.center, SH.parts[i].center.map((v, k) => v + [100, -50, 7][k]), 1e-9)) && rz.every((c, i) => { const [x, y, z] = SH.parts[i].center; return near(c.center, [10 - y, x, z], 1e-9); }) && rx.every((c, i) => { const [x, y, z] = SH.parts[i].center; return near(c.center, [x, -z, y], 1e-9); }));
    const rng = mulberry(9), hull = P.filter((p) => p.kind === "hull"); let inside = 0, N = 40000, axisOk = true;
    for (let i = 0; i < N; i++) { const q = [(2 * rng() - 1) * 24, (2 * rng() - 1) * 4.5, (2 * rng() - 1) * 4]; if (hull.some((p) => Math.hypot(q[0] - p.center[0], q[1] - p.center[1], q[2] - p.center[2]) <= p.radius)) inside++; }
    for (let x = -23; x <= 22; x += 0.25) if (!hull.some((p) => Math.hypot(x - p.center[0], p.center[1], p.center[2]) <= p.radius)) axisOk = false;
    ok("!! the five hull spheres cover the hull's axis from x = -23 to x = 22 without a gap and 73% of its box (the corners are not covered, nor the last 2 units of the bow and 1 of the stern -- a round that hits there and not a sphere goes through; said plainly)", axisOk && inside / N > 0.70 && inside / N < 0.76, `${(100 * inside / N).toFixed(1)}%`);
}

console.log("\n5. THE SEATS");
{
    const S = SH.seats, byId = (id) => S.find((s) => s.id === id), body = still;
    ok("!! eleven seats, uniquely named: main-a, main-b, main-c, pd-p1..3 (port), pd-s1..3 (starboard), pd-v1..2 (ventral), in that order, each a frozen gunSeats seat", S.length === 11 && S.map((s) => s.id).join() === "main-a,main-b,main-c,pd-p1,pd-p2,pd-p3,pd-s1,pd-s2,pd-s3,pd-v1,pd-v2" && S.every((s) => Object.isFrozen(s)) && SH.seatPart.length === 11);
    ok("!! EACH SEAT SITS IN THE PART IT IS NAMED FOR: the seat's mount is within 2.5 units of that sphere's centre, the three main turrets in the turret spheres and the eight PD mounts in the PD spheres, and the seat's name is its part's", S.every((s, k) => { const p = SH.parts[SH.seatPart[k]]; return p && Math.hypot(...s.mount.map((v, i) => v - p.center[i])) <= 2.5 && s.name === p.name; }) && SH.seatPart.slice(0, 3).every((id) => SH.parts[id].kind === "turret") && SH.seatPart.slice(3).every((id) => SH.parts[id].kind === "pd") && new Set(SH.seatPart).size === 11);
    ok("!! the rests and arcs are the table's: the forward pair rest along +X and the aft one along -X, all with yaw -2.6..2.6 (a 100-degree blind sector behind each) and pitch -0.05..1.45 above the deck; a port mount rests along +Y, a starboard one along -Y, a ventral one along -Z, every one a hemisphere (+-pi/2 on both axes); the slews are 0.5 and 0.4 rad/s for the main turrets and 3.0 and 2.5 for the PD", ["main-a", "main-b"].every((id) => near(byId(id).rest, [1, 0, 0], 1e-12)) && near(byId("main-c").rest, [-1, 0, 0], 1e-12) && S.slice(0, 3).every((s) => s.arc.yaw.join() === "-2.6,2.6" && s.arc.pitch.join() === "-0.05,1.45" && s.slew.yaw === 0.5 && s.slew.pitch === 0.4)
        && ["pd-p1", "pd-p2", "pd-p3"].every((id) => near(byId(id).rest, [0, 1, 0], 1e-12)) && ["pd-s1", "pd-s2", "pd-s3"].every((id) => near(byId(id).rest, [0, -1, 0], 1e-12)) && ["pd-v1", "pd-v2"].every((id) => near(byId(id).rest, [0, 0, -1], 1e-12)) && S.slice(3).every((s) => s.arc.yaw.join() === `${-PI / 2},${PI / 2}` && s.arc.pitch.join() === `${-PI / 2},${PI / 2}` && s.slew.yaw === 3 && s.slew.pitch === 2.5));
    ok("!! port and starboard seats are mirrors: the same x and z, y negated, the rest's y negated", [1, 2, 3].every((i) => { const a = byId(`pd-p${i}`), b = byId(`pd-s${i}`); return a.mount[0] === b.mount[0] && a.mount[2] === b.mount[2] && a.mount[1] === -b.mount[1] && a.rest[1] === -b.rest[1]; }));
    const rng = mulberry(5), N = 40000; let any = 0, pd = 0, main = 0, mainAft = 0;
    for (let i = 0; i < N; i++) {
        const z = 2 * rng() - 1, ph = 2 * PI * rng(), r = Math.sqrt(1 - z * z), d = [r * Math.cos(ph), r * Math.sin(ph), z], reach = S.map((s) => GS.reachOf(s, body, d).inArc);
        if (reach.some(Boolean)) any++; if (reach.slice(3).some(Boolean)) pd++; if (reach.slice(0, 3).some(Boolean)) main++;
    }
    const want = (Math.sin(1.45) + Math.sin(0.05)) / 2, astern = [-1, 0, 0], ahead = [1, 0, 0];
    ok("!! COVERAGE, over 40,000 random directions: EVERY ONE is reachable by some seat (no blind direction), the point-defence mounts alone reach every one, and the main battery reaches (sin 1.45 + sin 0.05) / 2 = 0.5213 of them (to 0.01) -- the deck's side only, the whole circle of azimuth between the three turrets' arcs", any === N && pd === N && Math.abs(main / N - want) < 0.01, `${any}/${N}, PD ${pd}, main ${(main / N).toFixed(4)} vs ${want.toFixed(4)}`);
    ok("!! the blind sectors are real: straight astern is reached by the aft turret and NOT by the forward pair (their arcs end 100 degrees short of it), straight ahead by the forward pair and not the aft turret, straight up by no main turret (the barrel stops at 83 degrees) and straight down by none (they fire above the deck) -- the PD mounts have them all", GS.reachOf(byId("main-c"), body, astern).inArc && !GS.reachOf(byId("main-a"), body, astern).inArc && !GS.reachOf(byId("main-b"), body, astern).inArc && GS.reachOf(byId("main-a"), body, ahead).inArc && !GS.reachOf(byId("main-c"), body, ahead).inArc && S.slice(0, 3).every((s) => !GS.reachOf(s, body, [0, 0, 1]).inArc && !GS.reachOf(s, body, [0, 0, -1]).inArc) && S.slice(3).some((s) => GS.reachOf(s, body, [0, 0, 1]).inArc) && S.slice(3).some((s) => GS.reachOf(s, body, [0, 0, -1]).inArc));
}

console.log("\n6. THE GUNS");
{
    const M = CS.MAIN_GUN, D = CS.PD_GUN, W = CS.WAVE_GUN;
    ok("!! the main shell is 500 units/s, 1.5 a second (a triple turret), 160 rounds, 5 s of life, 60 damage; the PD round 1,100, 6 a second, 900, 1.6 s, 10; the main turrets carry the MAIN gun and the eight others the PD gun (the same object, not a copy); the wave-motion cannon charges for 12 s, reaches 900, is 6 wide and does 400, from the bow at (25, 0, 0)", M.muzzleSpeed === 500 && M.rate === 1.5 && M.magazine === 160 && M.life === 5 && M.damage === 60 && D.muzzleSpeed === 1100 && D.rate === 6 && D.magazine === 900 && D.life === 1.6 && D.damage === 10 && SH.seats.slice(0, 3).every((s) => s.gun === M) && SH.seats.slice(3).every((s) => s.gun === D) && W.charge === 12 && W.range === 900 && W.beamRadius === 6 && W.damage === 400 && W.muzzle.join() === "25,0,0" && SH.waveGun === W && /invented/.test(W.name));
    // each gunner, in vacuum, hits a target standing 150 units out along its own rest direction
    const rows = SH.seats.map((seat) => {
        const dir = seat.rest, tpos = dir.map((v, i) => seat.mount[i] + v * 150), g = GS.handGunner({ delay: 0, sigma: 0, gravity: 0, maxRange: 300 }); let st = GS.createSeatState(seat), rounds = [], hits = 0;
        for (let i = 0; i < 120; i++) {
            const cmd = g(seat, st, still, [{ id: "t", pos: tpos, vel: [0, 0, 0], radius: 2 }], i / 30), out = GS.stepSeat(seat, st, still, cmd, 1 / 30, 1); st = out.state;
            const res = G.stepRounds([...rounds, ...out.rounds], 1 / 30, [{ id: 2, from: tpos, to: tpos, radius: 2 }], { g: 0, ground: null, life: seat.gun.life }); rounds = res.rounds; hits += res.hits.length;
        }
        return { id: seat.id, hits };
    });
    ok("!! EVERY SEAT'S GUNNER, in vacuum, HITS: a target 2 units across standing 150 units out along the seat's own rest direction is hit by all eleven (the rounds flown with g = 0 and no ground, as the arena flies them)", rows.every((r) => r.hits > 0), rows.map((r) => `${r.id}:${r.hits}`).join(" "));
}

console.log("\n7. THE FRONT DOOR");
{
    ok("!! the export list is pinned: AIM_RADIUS, ENGINE_PODS, FIGHTER, HALF, HIT_POINTS, MAIN_GUN, MASS, MAX_ALPHA, PD_GUN, THRUST_MAX, WAVE_GUN, createCapitalShip, limitTorque, partCentres, reportLines, thrustWith", Object.keys(CS).sort().join(",") === "AIM_RADIUS,ENGINE_PODS,FIGHTER,HALF,HIT_POINTS,MAIN_GUN,MASS,MAX_ALPHA,PD_GUN,THRUST_MAX,WAVE_GUN,createCapitalShip,limitTorque,partCentres,reportLines,thrustWith", Object.keys(CS).sort().join(","));
    const lines = CS.reportLines();
    ok("the report lines say real numbers and say that every number is invented", lines.length === 2 && lines.every((l) => !/NaN|undefined/.test(l)) && /every number invented/.test(lines[0]) && /48 units long, 4400 kg/.test(lines[1]) && /11 seats \(3 main turrets, 8 point-defence mounts\)/.test(lines[1]), lines[1]);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
