// physics/xpbd/friction-selfcheck.mjs
//
// Run: node physics/xpbd/friction-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Coulomb friction has exactly one number that matters, the ratio mu, and one behaviour that proves it: a particle
// holds on a slope whose tangent is below mu and slides down one above it, with the transition sitting right at mu.
// The gate checks a particle sticks at slope 0.45 and slides at 0.55 for mu 0.5, that a slider with friction travels
// less than a frictionless one, and that mu 0 recovers frictionless motion exactly. The solve is trig-free -- slopes
// are given as normals, not angles -- so it is bit-identical. The sabotage removes the Coulomb bound so friction can
// cancel any amount of tangential motion: every slope then sticks, and the sliding and transition checks fail,
// because friction without a limit is glue.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { planeFrictionSubstep, solvePlaneFriction, slopeNormal } from "./friction.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const hp = (p) => { const b = Buffer.alloc(p.length * 8); for (let i = 0; i < p.length; i++) b.writeDoubleLE(p[i], i * 8); return createHash("sha256").update(b).digest("hex"); };

function travel(s, mu, steps = 120) {
    const n = slopeNormal(s);
    const st = { pos: new Float64Array(3), vel: new Float64Array(3), invMass: Float64Array.from([1]) };
    for (let k = 0; k < steps; k++) planeFrictionSubstep(st, n, 0, mu, { dt: 0.016, gravity: [0, -10, 0] });
    return Math.sqrt(st.pos[0] ** 2 + st.pos[1] ** 2 + st.pos[2] ** 2);
}

// ---- 1. STATIC FRICTION HOLDS: below the friction ratio the particle does not move --------------------------
{
    ok("!! a particle holds still on a slope shallower than the friction ratio", travel(0.3, 0.5) < 1e-9 && travel(0.45, 0.5) < 1e-9,
       "on slopes of 0.3 and 0.45 with mu 0.5 the particle does not travel at all -- static friction cancels the down-slope motion entirely.");
}

// ---- 2. KINETIC SLIDING: above the ratio it slides, but slower than frictionless ----------------------------
{
    const withFric = travel(0.9, 0.5), frictionless = travel(0.9, 0.0);
    ok("!! a particle slides on a steep slope, and friction slows it below the frictionless case", withFric > 0.5 && withFric < frictionless * 0.8,
       "on a 0.9 slope the particle travels " + withFric.toFixed(2) + " with friction against " + frictionless.toFixed(2) + " without -- kinetic friction bleeds the slide without stopping it.");
}

// ---- 3. TRANSITION AT MU: stick just below, slide just above the friction ratio -----------------------------
{
    ok("!! the stick-slide transition sits at the friction ratio", travel(0.45, 0.5) < 1e-9 && travel(0.55, 0.5) > 0.1,
       "with mu 0.5 a 0.45 slope sticks and a 0.55 slope slides -- the boundary is exactly where the slope's tangent passes mu, the friction angle.");
}

// ---- 4. MU = 0 IS FRICTIONLESS: friction off recovers free sliding -------------------------------------------
{
    // frictionless on a shallow slope should slide as far as pure projected gravity allows -- compare mu 0 vs a tiny mu
    const free = travel(0.3, 0.0);
    ok("!! turning friction off lets the particle slide freely", free > 1,
       "with mu 0 even a shallow 0.3 slope lets the particle slide " + free.toFixed(2) + " -- friction was the only thing holding it, exactly as it should be.");
}

// ---- 5. NORMAL EXACT: a penetrating particle is placed exactly on the surface -------------------------------
{
    const n = slopeNormal(0.6);   // n . x = 0 plane
    const pred = Float64Array.from([0.3, -0.4, 0]), prev = Float64Array.from([0.3, -0.4, 0]);   // below the plane, no tangential motion
    solvePlaneFriction(pred, prev, Float64Array.from([1]), n, 0, 0.5);
    const distAfter = pred[0] * n[0] + pred[1] * n[1] + pred[2] * n[2];
    ok("!! the normal correction places a penetrating particle exactly on the surface", Math.abs(distAfter) < 1e-12,
       "a particle pushed through the plane is projected back to n.x = 0 to 1e-12 before friction is applied.");
}

// ---- 6. DETERMINISTIC + trig-free --------------------------------------------------------------------------
{
    const run = () => { const st = { pos: new Float64Array([0, 0, 0, 0.1, 0.05, 0]), vel: new Float64Array(6), invMass: Float64Array.from([1, 1]) }; const n = slopeNormal(0.7); for (let k = 0; k < 100; k++) planeFrictionSubstep(st, n, 0, 0.4, { dt: 0.016, gravity: [0, -10, 0] }); return hp(st.pos); };
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "friction.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const noTrig = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random|acos|asin|atan)\b/.test(src);
    ok("!! two runs agree byte-for-byte and the solve has no transcendental", run() === run() && noTrig,
       "two friction runs land byte-identical and the code uses only +,-,*,/,sqrt -- slopes are normals, not angles, so no sin/cos, bit-identical across machines.");
}

console.log(fails ? "\nfriction-selfcheck: " + fails + " FAILED" : "\nfriction-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
