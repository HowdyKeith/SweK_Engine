#!/usr/bin/env node
// tools/ship/deviceGravity-selfcheck.mjs -- v4230
//
// Run: node tools/ship/deviceGravity-selfcheck.mjs      (pure -- no phone, no sensor, no browser)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES input/deviceGravity.mjs -- the half of shajidhasan/mobile-fluid-sim (MIT) worth taking.
//
// *** THE ARITHMETIC IS GATEABLE WITH NO PHONE IN THE ROOM, AND THAT IS WHY IT IS THE PART TO BUILD. ***
// Euler angles to a gravity vector has an exact answer that can be checked against a rotation matrix built a
// different way. Whether a particular handset reports what the spec says is a claim no gate here can settle,
// and section 8 says so rather than dressing the arithmetic up as device coverage.
import {
    EARTH_G, ACCEL_SIGN, gravityFromOrientation, gravityFromMotion, accelerometerSign,
    toScreenFrame, gravityVector, GravityFilter, ShakeDetector, DeviceGravity,
} from "../../input/deviceGravity.mjs";
import { codeOnly, noComments, proseHas } from "./sourceScan.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const R3 = (v) => (v ? "(" + v.map((n) => (Math.abs(n) < 1e-12 ? 0 : +n.toFixed(4))).join(", ") + ")" : "null");
console.log("deviceGravity-selfcheck -- which way is down, according to the phone\n");

// ---- 1. THE SOLVER IS REFUSED, AND THE TREE'S OWN IS BETTER -------------------------------------------------
console.log("1. *** THE FLIP SOLVER IN THAT REPO IS A DUPLICATE, AND THIS ROUND DOES NOT TAKE IT ***");
{
    const has = (p) => fs.existsSync(path.join(ROOT, p));
    ok("!! the tree already has FLIP, in 2D and 3D, gated", has("fluid/flip2d.mjs") && has("fluid/flip3d.mjs") &&
        has("fluid/flip2d-selfcheck.mjs") && has("fluid/flip3d-selfcheck.mjs"),
        "fluid/flip2d.mjs, flip3d.mjs, and a selfcheck for each");
    const page = fs.readFileSync(path.join(ROOT, "fluid-webgpu.html"), "utf8");
    ok("!! ...and on the GPU, with more of it than the repo being assessed has",
        /staggered MAC grid/.test(page) && /Jacobi pressure projection/.test(page) && /Gauss-Seidel/.test(page),
        "MAC grid, atomic P2G splat, Jacobi projection, red-black GS+SOR, RK2 advection, ST-FLIP");
    const src = fs.readFileSync(path.join(ROOT, "input", "deviceGravity.mjs"), "utf8");
    ok("...so the module says in writing that the solver is refused and why",
        proseHas(src, /solver in that repo is REFUSED/i) && proseHas(src, /fourth copy of a solved problem/));
    ok("!! ...and it imports no fluid code at all -- it produces a vector, it does not simulate",
        !/fluid\//.test(codeOnly(src)) && !/import .*(flip|multigrid)/i.test(codeOnly(src)));
}

// ---- 2. THE ITEM SAID "NO SENSOR". IT WAS WRONG, AND THE REAL GAP IS NARROWER -----------------------------
console.log("\n2. *** THE TILT ALREADY REACHES THE ENGINE. NOTHING TURNED IT INTO A DIRECTION. ***");
{
    const phone = fs.readFileSync(path.join(ROOT, "phone.html"), "utf8");
    ok("!! phone.html reads deviceorientation TWICE, so 'the tree has no sensor' was wrong",
        (phone.match(/addEventListener\("deviceorientation"/g) || []).length === 2,
        "onOrient (tilt to steer) and onPickerOrient (relay)");
    // ...and BOTH treat the angle as a button. noComments(), not codeOnly(): the assertion is about a
    // comparison against a literal threshold, and codeOnly would keep it -- but the message names below are
    // strings, and blanking those would make the second half of this check vacuous.
    ok("!! ...and the first one THRESHOLDS it into a UI control -- the angle is a button, not a direction",
        /gamma>12/.test(noComments(phone).replace(/\s/g, "")) && /send\("look",\{dir:"right"/.test(noComments(phone).replace(/\s/g, "")),
        'gamma > 12 -> send("look", {dir:"right"}) -- a deadzone and a rate, with no vector anywhere');
    ok("...while the second relays the raw angles at 30 Hz to main.js",
        /phone:picker:orient/.test(phone) && /alpha: ev\.alpha/.test(noComments(phone)));

    // The tilt work in physics/sph takes a number the code hands itself. THAT is what had no sensor.
    const tilt = fs.readFileSync(path.join(ROOT, "physics", "sph", "tiltPower.mjs"), "utf8");
    const wide = fs.readFileSync(path.join(ROOT, "physics", "sph", "wideTilt.mjs"), "utf8");
    ok("!! *** AND physics/sph's TILT WORK TAKES `deg` -- A NUMBER THE CODE HANDS ITSELF ***",
        /\bdeg\b/.test(codeOnly(tilt)) && /\bdeg\b/.test(codeOnly(wide)) &&
        !/deviceorientation|devicemotion/.test(tilt + wide),
        "transferRatio(deg), phaseSwing({deg}), wideTiltRun({deg}) -- no accelerometer has ever set one");
}

// ---- 3. THE DERIVATION, AGAINST A MATRIX BUILT A DIFFERENT WAY ---------------------------------------------
console.log("\n3. *** THE CLOSED FORM IS CHECKED AGAINST Rz.Rx.Ry BUILT NUMERICALLY, NOT AGAINST ITSELF ***");
{
    const D = Math.PI / 180;
    const mul = (A, B) => { const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i][j] += A[i][k] * B[k][j]; return C; };
    const Rz = (a) => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
    const Rx = (a) => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
    const Ry = (a) => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
    // R takes device -> earth; gravity is (0,0,-1) in earth; in device it is R^T (0,0,-1).
    const byMatrix = (al, be, ga) => {
        const R = mul(mul(Rz(al * D), Rx(be * D)), Ry(ga * D));
        return [0, 1, 2].map((i) => R[0][i] * 0 + R[1][i] * 0 + R[2][i] * -1);
    };
    // A deterministic LCG kept inside 2^31, because v4221's test data degenerated when a multiply went past 2^53.
    let s = 12345; const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let worst = 0, n = 0, unitWorst = 0;
    for (let i = 0; i < 20000; i++) {
        const al = rnd() * 360, be = rnd() * 360 - 180, ga = rnd() * 180 - 90;
        const a = gravityFromOrientation(al, be, ga); if (!a) continue;
        const b = byMatrix(al, be, ga);
        worst = Math.max(worst, Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
        unitWorst = Math.max(unitWorst, Math.abs(Math.hypot(a[0], a[1], a[2]) - 1));
        n++;
    }
    ok("!! *** THE CLOSED FORM MATCHES THE MATRIX TO MACHINE PRECISION OVER 20,000 ORIENTATIONS ***",
        worst < 1e-12 && n > 19000, `${n} orientations, worst component error ${worst.toExponential(3)}`);
    ok("!! ...and the result is a UNIT vector everywhere", unitWorst < 1e-12, `worst ||g|| - 1 = ${unitWorst.toExponential(3)}`);

    // Three cases a person can check by hand, which is what makes the formula reviewable.
    ok("!! flat on a table -> down is INTO the table, away from the screen",
        R3(gravityFromOrientation(0, 0, 0)) === "(0, 0, -1)", R3(gravityFromOrientation(0, 0, 0)));
    ok("!! held upright   -> down is toward the BOTTOM edge, so things fall down the screen",
        R3(gravityFromOrientation(0, 90, 0)) === "(0, -1, 0)", R3(gravityFromOrientation(0, 90, 0)));
    ok("!! rolled right   -> down is out of the RIGHT edge",
        R3(gravityFromOrientation(0, 0, 90)) === "(1, 0, 0)", R3(gravityFromOrientation(0, 0, 90)));
    ok("!! alpha cannot move gravity, and the formula does not contain it",
        R3(gravityFromOrientation(137, 30, 20)) === R3(gravityFromOrientation(0, 30, 20)),
        "spinning a level phone about the vertical does not change which way is down");
    ok("a sensor that has not read yet gives null rather than a confident 'flat'",
        gravityFromOrientation(0, null, 0) === null && gravityFromOrientation(0, NaN, 5) === null);
}

// ---- 4. THE SCREEN FRAME, WHERE MY FIRST DRAFT HAD THE SIGN BACKWARDS --------------------------------------
console.log("\n4. *** ALL FOUR SCREEN ORIENTATIONS MUST AGREE, AND THAT IS WHAT CAUGHT THE BUG ***");
{
    // The invariant: a phone held upright shows gravity straight down the screen NO MATTER how the content is
    // rotated within it. Device-frame down differs per orientation; screen-frame down does not.
    const cases = [
        ["portrait",        [0, -1, 0],   0],
        ["landscape (CCW)", [-1, 0, 0],  90],
        ["upside down",     [0,  1, 0], 180],
        ["landscape (CW)",  [1,  0, 0], 270],
    ];
    for (const [name, deviceDown, angle] of cases) {
        ok(`${name}: device ${R3(deviceDown)} at angle ${angle} -> screen (0, -1, 0)`,
            R3(toScreenFrame(deviceDown, angle)) === "(0, -1, 0)", R3(toScreenFrame(deviceDown, angle)));
    }
    // *** THIS IS THE CHECK THAT FOUND IT. *** My first draft rotated by -angle. I printed
    // toScreenFrame([0,-1,0], 90) -> [-1,0,0], saw plausible numbers and read past them. Only working a real
    // phone through -- rotate it counter-clockwise, its right edge points at the sky, so device-frame down is
    // (-1,0,0) and the person still sees gravity going down the screen -- shows that only +angle is right.
    ok("!! ...and -angle fails that invariant, which is why the four cases are here and not one",
        (() => { const a = -90 * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); const v = [-1, 0, 0];
                 return R3([v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]) !== "(0, -1, 0)"; })(),
        "the wrong sign sends landscape gravity UP the screen, and one test case cannot tell");
    ok("the screen normal is untouched, because content rotating in a screen does not move the screen",
        toScreenFrame([0, 0, -1], 90)[2] === -1);
    ok("a direction becomes m/s^2 for a solver's gravity term",
        R3(gravityVector([0, -1, 0])) === `(0, ${-EARTH_G}, 0)`.replace(`${-EARTH_G}`, (-EARTH_G).toFixed(4)) ||
        Math.abs(gravityVector([0, -1, 0])[1] + EARTH_G) < 1e-12, `${EARTH_G} m/s^2`);
}

// ---- 5. THE ACCELEROMETER SIGN, RESOLVED RATHER THAN GUESSED ----------------------------------------------
console.log("\n5. *** accelerationIncludingGravity's SIGN IS AMBIGUOUS ACROSS PLATFORMS. IT IS RESOLVED, NOT ASSUMED. ***");
{
    const flat = gravityFromOrientation(0, 0, 0);                 // (0,0,-1), unambiguous
    const w3c = { x: 0, y: 0, z: 9.81 };                          // proper acceleration, +Z at rest, per spec
    const ios = { x: 0, y: 0, z: -9.81 };                         // what iOS has historically reported
    ok("!! a W3C-convention sample is identified as such, from the orientation vector",
        accelerometerSign(w3c, flat) === ACCEL_SIGN.W3C);
    ok("!! ...and an iOS-convention sample as the other", accelerometerSign(ios, flat) === ACCEL_SIGN.IOS_LEGACY);
    ok("!! ...and once resolved, BOTH give the same down -- which is the whole payoff",
        R3(gravityFromMotion(w3c, ACCEL_SIGN.W3C)) === "(0, 0, -1)" &&
        R3(gravityFromMotion(ios, ACCEL_SIGN.IOS_LEGACY)) === "(0, 0, -1)");
    ok("!! an ambiguous sample -- the phone being moved, reading near perpendicular -- returns null",
        accelerometerSign({ x: 9.81, y: 0, z: 0 }, flat) === null,
        "a confident answer from a sample that cannot support one is worse than none");
    ok("...and so does a sample with no orientation to compare against", accelerometerSign(w3c, null) === null);
    const src = fs.readFileSync(path.join(ROOT, "input", "deviceGravity.mjs"), "utf8");
    ok("the ambiguity is documented rather than papered over",
        proseHas(src, /iOS has historically reported the opposite sign/) && proseHas(src, /does not pretend to/));
}

// ---- 6. THE FILTER IS dt-AWARE, WHICH A PER-FRAME ALPHA IS NOT ---------------------------------------------
console.log("\n6. smoothing that means the same thing at 30, 60 and 120 Hz");
{
    const settle = (hz) => {
        const f = new GravityFilter({ tau: 0.25 }), dt = 1 / hz;
        f.push([0, 0, -1], dt);
        for (let t = 0; t < 1; t += dt) f.push([1, 0, 0], dt);
        return f.value[0];
    };
    const [a30, a60, a120] = [settle(30), settle(60), settle(120)];
    const spread = Math.max(a30, a60, a120) - Math.min(a30, a60, a120);
    ok("!! one second of the same input lands in the same place at any frame rate",
        spread < 1e-3, `30/60/120 Hz -> ${a30.toFixed(5)} / ${a60.toFixed(5)} / ${a120.toFixed(5)}, spread ${spread.toExponential(2)}`);
    // The comparison that gives the number meaning: a naive per-frame alpha, which is what this is NOT.
    const naive = (hz) => { let x = 0; for (let i = 0; i < hz; i++) x += (1 - x) * 0.1; return x; };
    const nSpread = Math.max(naive(30), naive(60), naive(120)) - Math.min(naive(30), naive(60), naive(120));
    ok("!! ...where a per-frame alpha of 0.1 spans a range " + Math.round(nSpread / spread) + "x wider",
        nSpread > spread * 50, `${naive(30).toFixed(5)} / ${naive(60).toFixed(5)} / ${naive(120).toFixed(5)}, spread ${nSpread.toExponential(2)}`);
    const f = new GravityFilter();
    ok("the first reading is taken whole rather than smoothed from nothing", R3(f.push([1, 0, 0], 0.016)) === "(1, 0, 0)");
    ok("a null reading holds the last value instead of dropping it", R3(f.push(null, 0.016)) === "(1, 0, 0)");
    ok("...and the filtered vector stays unit length", Math.abs(Math.hypot(...f.push([0, 1, 0], 0.016)) - 1) < 1e-12);
}

// ---- 7. A SHAKE IS AN EVENT ---------------------------------------------------------------------------------
console.log("\n7. a shake is a gesture, not a slider");
{
    const flat = [0, 0, -1];
    const s = new ShakeDetector({ fire: 12, release: 6, refractoryMs: 400 });
    let fires = 0;
    for (let t = 0; t < 200; t += 10) fires += s.push({ x: 20, y: 0, z: -EARTH_G }, flat, t) ? 1 : 0;
    ok("!! held above the threshold for 200 ms, it fires ONCE, not twenty times", fires === 1, `${fires} fire(s)`);
    for (let t = 200; t < 400; t += 10) fires += s.push({ x: 2, y: 0, z: -EARTH_G }, flat, t) ? 1 : 0;
    ok("...and does not re-fire while the hand is still above the release threshold", fires === 1);
    fires += s.push({ x: 20, y: 0, z: -EARTH_G }, flat, 500) ? 1 : 0;
    ok("!! ...but a second shake, after relaxing and after the refractory window, does", fires === 2 && s.count === 2);
    // *** GRAVITY IS SUBTRACTED, WHICH IS THE DIFFERENCE BETWEEN A SHAKE AND A TILT. ***
    const t = new ShakeDetector({ fire: 12, release: 6 });
    const steep = [Math.SQRT1_2, 0, -Math.SQRT1_2];
    ok("!! a phone merely HELD at 45 degrees does not register as a shake",
        t.push({ x: EARTH_G * Math.SQRT1_2, y: 0, z: -EARTH_G * Math.SQRT1_2 }, steep, 0) === false && t.magnitude < 1e-9,
        `linear acceleration ${t.magnitude.toExponential(2)} -- accelerationIncludingGravity alone would read ${EARTH_G.toFixed(2)}`);
    let threw = false;
    try { new ShakeDetector({ fire: 5, release: 9 }); } catch { threw = true; }
    ok("!! a release above the fire threshold is REFUSED -- it would chatter every frame", threw);
}

// ---- 8. WIRED, AND WHAT IT IS NOT ---------------------------------------------------------------------------
console.log("\n8. wired to the relay that was already there");
{
    const main = fs.readFileSync(path.join(ROOT, "main.js"), "utf8");
    ok("!! main.js reads the SAME message as a direction, alongside the cursor it already drove",
        /_phoneGravity\.orientation\(/.test(codeOnly(main)) && /window\.phoneGravity = /.test(codeOnly(main)),
        "no new event, no new listener on the phone -- the pipe was already carrying it");
    ok("...and imports the module, so it is not a file only its own gate has ever run",
        /from "\.\/input\/deviceGravity\.mjs"/.test(main));
    const src = fs.readFileSync(path.join(ROOT, "input", "deviceGravity.mjs"), "utf8");
    ok("the module listens for nothing itself -- it is handed readings", !/addEventListener/.test(codeOnly(src)),
        "which is exactly why every number above could be checked with no phone in the room");
    ok("no DOM, no window, no navigator", !/\b(document|navigator)\b/.test(codeOnly(src)));
}

console.log("\n----  WHAT THIS DOES NOT CLAIM");
console.log("      THAT ANY OF IT HAS EVER SEEN A PHONE. There is no accelerometer in this sandbox and no");
console.log("      handset on the other end of the relay, so what is proven is the ARITHMETIC: that the Euler");
console.log("      angles the W3C spec describes become the right direction, checked against a rotation matrix");
console.log("      built independently. Whether a given handset reports what the spec says -- and the iOS");
console.log("      accelerometer sign is live evidence that they do not always -- is a rig question.");
console.log("      AND THE PERMISSION STORY IS UNEXERCISED: iOS needs DeviceMotionEvent.requestPermission()");
console.log("      from a user gesture and returns nothing at all over plain http. phone.html already handles");
console.log("      that for orientation; devicemotion has no caller yet, so nobody has asked for it.");
console.log("      NOTHING CONSUMES window.phoneGravity. It is published and idle: physics/sph's tilt work");
console.log("      still takes a `deg` the code hands itself, and pointing it at a real phone is another round.");

console.log("\ndeviceGravity-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
