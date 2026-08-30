// WebGLEngine/tools/ship/ballistics-selfcheck.mjs -- v4205
//
// GATES physics/ballistics.mjs and the battleship3d.html cannon -- a projectile that actually FALLS.
//
// *** THE TREE HAD NO BALLISTICS, AND THE ONE PLACE ADVERTISING SOME WAS A LERP. *** battleship3d's cannon
// button says "arcing shell" and the code drew `lerpVectors(from,target,u)` with `Math.sin(u*Math.PI)*peak`
// on top -- `peak=14` and `dur=1.05` CONSTANT, so every shot took the same time and reached the same height
// whatever the range. ev/shots.js, the only other projectile system, has no gravity anywhere in it.
//
// *** SECTION 1 GRADES THE CLOSED FORM AGAINST THE INTEGRATOR, WHICH IS THE ONLY HONEST ANSWER KEY HERE. ***
// launchAngles() solves a quadratic in tan(theta); flyShell() integrates the motion step by step. They share
// no code. If the algebra is wrong the shell lands somewhere else, and the check is exactly that: fire at
// the solved angle and measure where it comes down.
//
// Run: node tools/ship/ballistics-selfcheck.mjs

import { GRAVITY, MIN_RANGE, launchAngles, maxRange, maxRangeDrag, reachable, positionAt, flightTime, apex,
         stepShell, flyShell, solveElevation, leadMoving, FUSE, fuseFires } from "../../physics/ballistics.mjs";
import { leadIntercept } from "../../physics/predict/predict.js";
import { codeOnly, noComments, prose } from "./sourceScan.mjs";
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const note = (m) => console.log("  ....  " + m);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");
const DEG = 180 / Math.PI;

// 1) *** THE CLOSED FORM, GRADED BY FIRING THE SHELL. ***
{
    const v = 100;
    for (const R of [50, 300, 700, 1000]) {
        const a = launchAngles(R, 0, v);
        ok(a !== null, `range ${R} m at ${v} m/s is reachable`);
        for (const which of ["flat", "lob"]) {
            const r = flyShell({ vx: v * Math.cos(a[which]), vy: v * Math.sin(a[which]) }, { dt: 1 / 4000 });
            ok(Math.abs(r.x - R) < 0.05,
                `${which} at ${(a[which] * DEG).toFixed(3)} deg lands at ${r.x.toFixed(3)} m, wanted ${R} (miss ${Math.abs(r.x - R).toExponential(1)} m)`);
        }
        // *** ON FLAT GROUND THE TWO ELEVATIONS SUM TO EXACTLY 90 DEGREES. *** A closed-form identity the
        // integrator knows nothing about, so it grades the algebra rather than the arithmetic.
        ok(Math.abs((a.flat + a.lob) * DEG - 90) < 1e-9,
            `and they sum to 90 deg exactly (${((a.flat + a.lob) * DEG).toFixed(9)}) -- complementary angles, on flat ground`);
    }
    // Max range is v^2/g, the roots meet there, and one metre further is unreachable at ANY elevation.
    const mr = maxRange(100);
    ok(Math.abs(mr - 100 * 100 / GRAVITY) < 1e-9, `max range at 100 m/s is v^2/g = ${mr.toFixed(4)} m`);
    const edge = launchAngles(mr * 0.999999, 0, 100);
    ok(edge !== null && Math.abs((edge.flat - edge.lob) * DEG) < 0.5,
        `at 99.9999% of max range the two roots have all but met: ${(edge.flat * DEG).toFixed(3)} and ${(edge.lob * DEG).toFixed(3)} deg`);
    ok(Math.abs((launchAngles(Math.floor(mr), 0, 100).flat - launchAngles(Math.floor(mr), 0, 100).lob) * DEG) < 3,
        "and a metre inside the envelope they are still only a couple of degrees apart");
    ok(launchAngles(mr + 1, 0, 100) === null, "one metre beyond it, NO elevation reaches -- null, not a shrug at 45 degrees");
    ok(launchAngles(mr * 0.999, 0, 100) !== null, "just inside it, a solution still exists");
    // Height difference is not optional. Firing uphill and downhill are different problems.
    const up = launchAngles(500, 200, 100), down = launchAngles(500, -200, 100), flat = launchAngles(500, 0, 100);
    ok(up.flat > flat.flat && flat.flat > down.flat,
        `uphill needs more elevation than flat, flat more than downhill: ${(up.flat * DEG).toFixed(2)} > ${(flat.flat * DEG).toFixed(2)} > ${(down.flat * DEG).toFixed(2)} deg`);
    for (const [rise, label] of [[50, "uphill"], [-200, "downhill"]]) {
        const a = launchAngles(500, rise, 100);
        const r = flyShell({ vx: 100 * Math.cos(a.flat), vy: 100 * Math.sin(a.flat) }, { dt: 1 / 4000, groundY: rise });
        ok(Math.abs(r.x - 500) < 0.05, `${label}: the solved angle lands at ${r.x.toFixed(3)} m on ground ${rise} m up`);
    }
    // *** THE NEAR-TANGENT CASE IS GENUINELY LESS PRECISE, AND SAYING SO BEATS A TOLERANCE THAT HIDES IT. ***
    // 500 m onto ground 200 m up has an apex of 200.004 m -- four millimetres of clearance. The trajectory is
    // almost parallel to the target plane where it crosses, so a tiny vertical error becomes a large
    // horizontal one. That is physics, not a defect. It is also the case whose interpolation blew up before
    // the clamp in flyShell: MEASURED at x = -6429 m and t = -82.47 s from a shell fired forwards.
    {
        const a = launchAngles(500, 200, 100);
        const r = flyShell({ vx: 100 * Math.cos(a.flat), vy: 100 * Math.sin(a.flat) }, { dt: 1 / 4000, groundY: 200 });
        ok(r.landed && r.t > 0 && r.x > 0, `the grazing shot lands forwards and in positive time: x=${r.x.toFixed(2)} m, t=${r.t.toFixed(3)} s`);
        ok(Math.abs(r.x - 500) < 5, `...within ${Math.abs(r.x - 500).toFixed(2)} m of the target, which is the honest precision when the apex clears by 4 mm`);
        ok(Math.abs(r.x - 500) > 0.05, "...and NOT within 5 cm, so this is a real tolerance and not a spare one");
    }
    ok(launchAngles(0, 0, 100) === null && launchAngles(-5, 0, 100) === null, "a zero or negative range is refused, not divided by");
    ok(launchAngles(100, 0, 0) === null, "and a zero muzzle velocity reaches nothing");
    // Apex and flight time agree with the integrator too.
    const a45 = Math.PI / 4;
    const sim = flyShell({ vx: 100 * Math.cos(a45), vy: 100 * Math.sin(a45) }, { dt: 1 / 4000 });
    ok(Math.abs(sim.apex - apex(100, a45)) < 0.01, `apex(): ${apex(100, a45).toFixed(3)} m vs simulated ${sim.apex.toFixed(3)}`);
    ok(Math.abs(sim.t - flightTime(sim.x, 100, a45)) < 1e-3, `flightTime(): ${flightTime(sim.x, 100, a45).toFixed(4)} s vs simulated ${sim.t.toFixed(4)}`);
    const p = positionAt(sim.t / 2, 100, a45);
    ok(Math.abs(p.y - apex(100, a45)) < 1e-6, "positionAt() puts the halfway point exactly at the apex -- the trajectory is symmetric in vacuum");
}

// 2) *** DRAG, AND WHAT IT COSTS THE CLOSED FORM. ***
{
    const v = 100, drag = 0.002;
    for (const R of [300, 700, 1000]) {
        const a = launchAngles(R, 0, v);
        const r = flyShell({ vx: v * Math.cos(a.flat), vy: v * Math.sin(a.flat) }, { dt: 1 / 2000, drag });
        const shortBy = R - r.x;
        ok(shortBy > 0.2 * R, `the vacuum angle for ${R} m lands ${shortBy.toFixed(0)} m short with drag -- ${(100 * shortBy / R).toFixed(1)}% of the range`);
    }
    // *** THE RIGHT ANSWER FOUND BY SIMULATION -- math/inverseSolve.mjs DOING THE JOB IT WAS BUILT FOR. ***
    for (const [R, prefer] of [[200, "flat"], [200, "lob"], [300, "flat"], [300, "lob"], [400, "flat"]]) {
        const s = solveElevation(R, 0, v, { drag, prefer, dt: 1 / 2000 });
        ok(s && s.ok, `drag solve ${R} m ${prefer}: ${(s.elevation * DEG).toFixed(3)} deg in ${s.iterations} iterations (seed ${(s.seed * DEG).toFixed(2)})`);
        const r = flyShell({ vx: v * Math.cos(s.elevation), vy: v * Math.sin(s.elevation) }, { dt: 1 / 2000, drag });
        ok(Math.abs(r.x - R) < 0.5, `...and firing it lands at ${r.x.toFixed(2)} m, ${Math.abs(r.x - R).toFixed(3)} m from the target`);
        ok(Math.abs(s.elevation - s.seed) > 1e-3, `...having moved ${Math.abs((s.elevation - s.seed) * DEG).toFixed(2)} deg off the vacuum seed`);
    }
    // *** AND IT REFUSES RATHER THAN LYING WHEN THE TARGET IS SIMPLY OUT OF REACH. ***
    const far = solveElevation(500, 0, v, { drag, prefer: "flat", dt: 1 / 2000 });
    ok(far && !far.ok, `500 m with drag: ok=false, "${far.why}", residual ${far.error.toFixed(1)} m`);
    // Two independent methods for the real envelope: golden section, and a brute sweep.
    const md = maxRangeDrag(v, { drag, dt: 1 / 2000 });
    let best = 0, bestA = 0;
    for (let d = 1; d <= 89; d += 0.25) { const a = d / DEG;
        const r = flyShell({ vx: v * Math.cos(a), vy: v * Math.sin(a) }, { dt: 1 / 2000, drag });
        if (r.landed && r.x > best) { best = r.x; bestA = a; } }
    ok(Math.abs(md.range - best) < 0.5, `maxRangeDrag ${md.range.toFixed(2)} m agrees with a brute sweep ${best.toFixed(2)} m`);
    ok(Math.abs((md.elevation - bestA) * DEG) < 0.5, `at ${(md.elevation * DEG).toFixed(2)} deg vs the sweep's ${(bestA * DEG).toFixed(2)} deg`);
    // *** THE OPTIMUM IS NOT 45 DEGREES ONCE THERE IS AIR. ***
    ok(md.elevation * DEG < 44, `and it is ${(md.elevation * DEG).toFixed(2)} deg, NOT 45 -- a shell that hangs longer loses more speed to drag`);
    ok(maxRangeDrag(v, { drag: 0 }).exact === true && Math.abs(maxRangeDrag(v, { drag: 0 }).elevation * DEG - 45) < 1e-9,
        "with no drag it returns the exact closed form at exactly 45 degrees");
    // The reachability question, which is the one an AI must ask FIRST.
    ok(reachable(400, 0, v, { drag, dt: 1 / 2000 }), "400 m is reachable with drag");
    ok(!reachable(500, 0, v, { drag, dt: 1 / 2000 }), "500 m is NOT");
    ok(reachable(500, 0, v, {}), "...while the vacuum formula says it is -- the shot an AI would confidently order and never land");
    note(`drag ${drag} takes ${(100 * (1 - md.range / maxRange(v))).toFixed(1)}% of this gun's reach: ${maxRange(v).toFixed(0)} m -> ${md.range.toFixed(0)} m`);
    // Drag must actually be quadratic: doubling speed should quadruple the deceleration.
    const dec = (sp) => { const a = stepShell({ x: 0, y: 0, vx: sp, vy: 0 }, 1e-4, { drag, gravity: 0 });
        return (sp - a.vx) / 1e-4; };
    ok(Math.abs(dec(200) / dec(100) - 4) < 0.02, `drag is QUADRATIC: doubling speed multiplies deceleration by ${(dec(200) / dec(100)).toFixed(3)}, not 2`);
    ok(stepShell({ x: 0, y: 0, vx: 100, vy: 0 }, 0.01, { drag: 0, gravity: 0 }).vx === 100, "and drag=0 is exactly vacuum, no residual damping");
}

// 3) *** THE MOVING SHOOTER -- THE GAP IN THE TREE'S EXISTING LEAD SOLVER. ***
{
    // physics/predict/predict.js takes the shooter as a stationary POINT. Correct for a fixed gun, wrong for
    // a ship -- and ev/shots.js adds the ship's velocity to every shot it fires while aiming with a plain
    // bearing to the target's CURRENT position.
    const shooterPos = [0, 0], shooterVel = [15, 0], targetPos = [0, 800], targetVel = [20, 0], speed = 300;
    const sol = leadMoving(shooterPos, shooterVel, targetPos, targetVel, speed);
    ok(sol !== null, `leadMoving finds an intercept at t=${sol.t.toFixed(4)} s`);
    // Fire it for real: the shell inherits the shooter's velocity, as EV shots do.
    const vx = shooterVel[0] + sol.dir[0] * speed, vy = shooterVel[1] + sol.dir[1] * speed;
    const miss = Math.hypot(shooterPos[0] + vx * sol.t - (targetPos[0] + targetVel[0] * sol.t),
                            shooterPos[1] + vy * sol.t - (targetPos[1] + targetVel[1] * sol.t));
    ok(miss < 1e-9, `and a shell inheriting the shooter's velocity meets the target to ${miss.toExponential(2)} m`);
    // *** THE OLD SOLVER, ON THE SAME PROBLEM, IS WRONG BY A MEASURABLE AMOUNT. ***
    const old = leadIntercept(shooterPos, targetPos, targetVel, speed);
    const ovx = shooterVel[0] + (old.aim[0] - shooterPos[0]) / Math.hypot(old.aim[0] - shooterPos[0], old.aim[1] - shooterPos[1]) * speed;
    const ovy = shooterVel[1] + (old.aim[1] - shooterPos[1]) / Math.hypot(old.aim[0] - shooterPos[0], old.aim[1] - shooterPos[1]) * speed;
    const oldMiss = Math.hypot(shooterPos[0] + ovx * old.t - (targetPos[0] + targetVel[0] * old.t),
                               shooterPos[1] + ovy * old.t - (targetPos[1] + targetVel[1] * old.t));
    ok(oldMiss > 10, `leadIntercept, which cannot be told the shooter is moving, misses by ${oldMiss.toFixed(2)} m on the same shot`);
    // With a STATIONARY shooter the two must agree exactly -- otherwise the new one is not a generalisation.
    const still = leadMoving(shooterPos, [0, 0], targetPos, targetVel, speed);
    const ref = leadIntercept(shooterPos, targetPos, targetVel, speed);
    ok(Math.abs(still.t - ref.t) < 1e-12,
        `with a stationary shooter leadMoving reduces EXACTLY to leadIntercept: t ${still.t} vs ${ref.t}`);
    ok(Math.hypot(still.aim[0] - ref.aim[0], still.aim[1] - ref.aim[1]) < 1e-9, "...and to the same aim point");
    // A target that outruns the shell has no solution, and saying so beats aiming somewhere.
    ok(leadMoving([0, 0], [0, 0], [100, 0], [500, 0], 50) === null, "a target faster than the shell yields null, not a wild aim point");
    ok(leadMoving([0, 0, 0], [0, 0, 0], [0, 0, 100], [10, 0, 0], 300) !== null, "and it works in 3D, which is what a naval or space gun needs");
}

// 4) *** FUSES: A SHELL IS ONE OBJECT THAT BECOMES PARTICLES AT A MOMENT IT DECIDES. ***
{
    ok(Object.values(FUSE).length === 4, `${Object.values(FUSE).length} fuse types: ${Object.values(FUSE).join(", ")}`);
    ok(fuseFires({ t: 3.1 }, FUSE.TIMED, { time: 3 }) && !fuseFires({ t: 2.9 }, FUSE.TIMED, { time: 3 }), "a timed fuse fires at its time");
    // *** ALTITUDE FIRES ON THE WAY DOWN, WHICH IS THE WHOLE POINT OF AN AIRBURST. ***
    ok(!fuseFires({ y: 50, vy: 40 }, FUSE.ALTITUDE, { altitude: 60 }), "an altitude fuse does NOT fire climbing through its height");
    ok(fuseFires({ y: 50, vy: -40 }, FUSE.ALTITUDE, { altitude: 60 }), "...and does fire descending through it -- a naive y>=alt test bursts on the wrong side of the target");
    ok(fuseFires({ y: -0.1, vy: -5 }, FUSE.IMPACT) && !fuseFires({ y: 10, vy: -5 }, FUSE.IMPACT), "impact fires at the ground and not above it");
    ok(fuseFires({ proximity: 20 }, FUSE.PROXIMITY, { distance: 15 }) && !fuseFires({ proximity: 20 }, FUSE.PROXIMITY, { distance: 25 }), "proximity fires inside its radius");
}

// 5) *** THE INTEGRATOR ITSELF. ***
{
    // Landing is interpolated to the ground plane, so the measured range must not depend on dt.
    const v = 100, a = Math.PI / 6;
    const ranges = [1 / 60, 1 / 240, 1 / 1000, 1 / 4000].map((dt) =>
        flyShell({ vx: v * Math.cos(a), vy: v * Math.sin(a) }, { dt }).x);
    const spread = Math.max(...ranges) - Math.min(...ranges);
    ok(spread < 2.0, `the landing point barely moves across dt from 1/60 to 1/4000: spread ${spread.toFixed(3)} m on ${ranges[0].toFixed(1)} m (${(100 * spread / ranges[0]).toFixed(3)}%)`);
    ok(spread > 0, "...but is not bit-identical, because it is an integrator and this tolerance is what that costs");
    const exact = v * v * Math.sin(2 * a) / GRAVITY;
    ok(Math.abs(ranges[3] - exact) < 0.05, `and the finest step agrees with the analytic range v^2 sin(2t)/g to ${Math.abs(ranges[3] - exact).toExponential(2)} m on ${exact.toFixed(1)} m`);
    ok(Math.abs(ranges[0] - exact) > Math.abs(ranges[3] - exact), "and a coarser step is measurably worse, so the agreement is the integrator's and not a coincidence");
    // A shot fired flat into the ground still terminates.
    ok(flyShell({ vx: 100, vy: 0 }, { dt: 1 / 240 }).landed, "a flat shot lands rather than looping forever");
    ok(flyShell({ vx: 0, vy: 100 }, { dt: 1 / 240 }).landed, "so does one fired straight up");
    ok(!flyShell({ vx: 100, vy: 0 }, { dt: 1 / 240, gravity: 0, maxTime: 0.5 }).landed, "with no gravity it never lands, and says so instead of pretending");
    const path = flyShell({ vx: 70, vy: 70 }, { dt: 1 / 100, keepPath: true }).path;
    ok(path.length > 10 && path.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), `keepPath returns ${path.length} finite samples`);
    ok(path[path.length - 1].y === 0, "and the last one sits exactly on the ground plane, not wherever the step ended");
}

// 6) *** THE BATTLESHIP CANNON IS A REAL SHELL NOW. ***
{
    const bs = read("battleship3d.html");
    const code = codeOnly(bs), quoted = noComments(bs);
    ok(/import \* as BALLISTICS from ["']\/physics\/ballistics\.mjs["']/.test(quoted),
        "battleship3d.html imports physics/ballistics.mjs");
    ok(/BALLISTICS\.launchAngles\(/.test(code) && /BALLISTICS\.stepShell\(/.test(code),
        "and its cannon calls launchAngles() and stepShell()");
    ok(!/lerpVectors\(from,\s*target,\s*u\)/.test(code), "the lerp-plus-sine-hump arc is gone");
    ok(!/const dur=1\.05,\s*peak=14/.test(code), "and so are the constant flight time and constant apex");
    ok(/const GUN_V=/.test(code), "a muzzle velocity exists, which is the knob a gun actually has");

    // *** THE THREE LINES THAT KEPT THIS PAGE BLACK SINCE IT WAS WRITTEN. ***
    ok(!/Object\.assign\(sbox\([^)]*\),\s*\{\s*position:/.test(code),
        "mkBridge no longer Object.assigns onto Object3D.position, which three.js has made read-only since r15x");
    ok(/isle1\.position\.set\(/.test(code) && /isle3\.position\.set\(/.test(code),
        "it uses .position.set() like every other mesh in the file");

    // The cannon's own numbers, with the page's own constants: the two roots must be tactically different.
    const V = 22, G = 9.80665, rise = -0.6;
    for (const R of [10, 20, 35]) {
        const a = launchAngles(R, rise, V, G);
        const lob = flyShell({ vx: V * Math.cos(a.lob), vy: V * Math.sin(a.lob) }, { dt: 1 / 2000, groundY: rise, gravity: G });
        const flat = flyShell({ vx: V * Math.cos(a.flat), vy: V * Math.sin(a.flat) }, { dt: 1 / 2000, groundY: rise, gravity: G });
        ok(Math.abs(lob.x - R) < 0.02 && Math.abs(flat.x - R) < 0.02, `cannon range ${R}: both roots land on the cell`);
        ok(lob.t > flat.t * 2 && lob.apex > flat.apex * 5,
            `and they are genuinely different shots: lob ${lob.t.toFixed(2)}s apex ${lob.apex.toFixed(1)} vs flat ${flat.t.toFixed(2)}s apex ${flat.apex.toFixed(1)}`);
    }
    // Flight time now varies with range, which is the thing that was constant before.
    const t = (R) => { const a = launchAngles(R, rise, V, G);
        return flyShell({ vx: V * Math.cos(a.flat), vy: V * Math.sin(a.flat) }, { dt: 1 / 2000, groundY: rise, gravity: G }).t; };
    ok(t(45) > t(4) * 5, `a far flat shot takes ${(t(45) / t(4)).toFixed(1)}x as long as a near one (${t(4).toFixed(2)}s -> ${t(45).toFixed(2)}s); both were 1.05s before`);
    ok(maxRange(V, rise, G) > 45 && maxRange(V, rise, G) < 60,
        `and the board fits inside the gun's envelope: max range ${maxRange(V, rise, G).toFixed(1)} board units`);
}

// 7) *** PURITY AND WIRING. ***
{
    const src = codeOnly(read("physics/ballistics.mjs"));
    ok(!/\bdocument\b|\bwindow\b|THREE\./.test(src), "physics/ballistics.mjs has no DOM and no three.js -- it is arithmetic");
    ok(!/Math\.random|Date\.now|performance\./.test(src), "and no clock and no randomness: the same shot gives the same answer");
    ok(/import \{ solve \} from ["']\.\.\/math\/inverseSolve\.mjs["']/.test(noComments(read("physics/ballistics.mjs"))),
        "it solves the drag case with math/inverseSolve.mjs rather than writing a second solver");
    ok(!/function solveLinear|function jacobian/.test(src), "and declares no solver of its own");
    const mainQ = noComments(read("main.js")), mainC = codeOnly(read("main.js"));
    ok(/import \{[^}]*launchAngles[^}]*\} from ["']\.\/physics\/ballistics\.mjs["']/.test(mainQ), "main.js imports it");
    ok(/window\.shells\s*=/.test(mainC), "and exposes window.shells");
    ok(/solveElevation|launchAngles/.test(mainC), "with the launch solution reachable from a console");
    note(`vacuum max range at 100 m/s: ${maxRange(100).toFixed(1)} m; with drag 0.002: ${maxRangeDrag(100, { drag: 0.002, dt: 1 / 2000 }).range.toFixed(1)} m`);
}

console.log(`ballistics-selfcheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
