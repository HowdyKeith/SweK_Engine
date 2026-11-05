// WebGLEngine/tools/roundhouse/joltGyroImplicit-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/roundhouse/joltGyroImplicit-selfcheck.mjs      (~1.1 s)
//
// THE GATE OF tools/roundhouse/joltGyroImplicit.mjs (and its command, joltGyroImplicitRun.mjs): the implicit gyroscopic step
// in Jolt's wrapper, as physics/mechanics/SPINNING_BODY_WIP.md registers its third round -- and of the step itself
// (physics/mechanics/implicitGyro.mjs) and the wrapper that takes it (physics/jolt/joltLoader.js).
// *** NOTHING HERE STARTS THE COMMAND, AND SECTIONS 1 TO 5 FLY NO REGISTERED SPIN. *** Their miniature spins at 1 rad/s, a rate
// nobody registered, for a tenth of a second, and M1 about a STABLE axis. The command's guards are held as library functions
// and as the order of its source. Section 6 was written after the results file was committed unread and then read: it flies
// the registered round again through the library and holds it against the file.
//
//   1  THE REGISTRATION, AS CODE: the configurations; the second round's spins, window, lines and cube; C-box3d's spin; M1
//      the spinning body's own spin; C-repeat against the second round's committed J; what makes a run the registered one
//   2  THE STEP ON MADE-UP CASES: box3d's Jacobian against I + h (skew(w) I - skew(I w)) built here; the solve; the
//      rotations; equal moments and a principal-axis spin left alone; ONE STEP shrinks a stable wobble's invariant by
//      backward Euler's 1 / (1 + (Omega h)^2) where an explicit step grows it, and runs the unstable one at 1 / (1 - sigma h)
//   3  THE PLUMBING: the loader's default and where it takes the step; the wrapper takes the module's step, once a step, on
//      a real Jolt body; true is Jolt's own force and not the step; an equal-moment body skipped, bit for bit; C-box3d on
//      real box3d; the spinner's flags and substeps; the box3d and own spinners the spinning body's
//   4  THE ROUND ON A MINIATURE: every control and measurement in order; the readings the rule's; C-flag, C-box3d,
//      C-repeat and C-determinism able to fail; the results file's format
//   5  THE COMMAND: it never overwrites, refuses an option it does not know, and prints no score
//   6  THE VERDICT, AS CODE, FROM THE COMMITTED FILE: the file is the registered run; the controls, C-repeat against the second
//      round's committed file and C-determinism; M1, M2 and M3 by the rules written out again; backward Euler's shrinkage
//      against every end of JI's and box3d's, and where it fails; the predictions; the round flown again; the note's numbers
//
// SABOTAGE LOG (2026-11-03) -- each applied with the byte-safe runner against this gate, every file restored byte-identical (sha256); the
// number is the rows that went red, by name:
//   G1 a Jacobian entry's sign flipped 6 | G2 the residual's first term's sign flipped 7 | G3 the step explicit: no Newton solve 7 | G4 the step taken
//   in the world frame 2 | G5 rotateInv not the conjugate 1 | G6 equal moments within a tenth 1 | G7 the solve's sign flipped 6 | G8 the step taken
//   after Jolt's 3 | G9 the loader's default Jolt's own force again 9 | G10 the equal-moment skip removed 2 | G11 a sleeping body stepped 1 | G12 the
//   quaternion read in Jolt's order 5 | G13 true no longer Jolt's own force 7 | G14 a static body given the step 4 | G15 addShip dropping the setting 1
//   G16 the step over a quarter of dt 3 | G17 the spinner passing a key for the default 1 | G18 the substeps dropped 1 | G19 the world frame read as the
//   body's 1 | G20 the ship given Jolt's force 2 | G21 C-flag's static body made dynamic 4 | G22 C-box3d's tolerance at 1e-3 2 | G23 C-repeat ignoring
//   the growth 1 | G24 M3's twin the same spin 1 | G25 M1's twin the same spin 1 | G26 the end measured at the first step 1 | G27 the registered flag
//   without M1's axis 1 | G28 C-repeat run on any spins 2 | G29 the command never refusing an existing file 1 | G30 the command printing the result 1
//   G31 the command accepting any option 1
//   FOUND BY THEM: G12 went red, but not on the row written for it. The wrapper row turned its body a quarter-turn about y, and that turn read in
//   the wrong order is the right turn composed with a half-turn about the body's z -- a symmetry of the box -- so the step came out the same and the
//   row could not see it; the source row and C-undamped in the miniature caught it instead. The row now turns the body 0.5 rad about (1, 1, 1),
//   which no symmetry of the box undoes, and goes red for G12 and G4; the whole series was run again, and the counts above are that run's.
//   FOUND BEFORE THEM, while designing them: five rows that could not have gone red (see the note).
// SABOTAGE LOG, SECTION 6 (2026-11-03, after the verdict) -- the same runner against this gate, joltGyroDefault-selfcheck and spinningBody-selfcheck,
// with the committed results file, the note, the second round's or the spinning body's committed results, the second round's library, the loader or
// the step edited; every file restored byte-identical (sha256):
//   V1 the file's bytes moved past double precision (a trailing zero on JI's 5 rad/s end) 2 (the file's sha256 and serialize(), and the note's: the
//   number itself never moved) | V2 the file not flagged as the registered run 3 | V3 the file reading M1 as something else 5 | V4 the file's JI spin at
//   20 rad/s about the largest axis lost 6 | V5 the file's ship trace not the force-off one 5 | V6 the file's C-box3d off by 3.1e-6, past its tolerance 4
//   V7 the file's JE growth at 10 rad/s moved in its last digit 3 | V8 the file's last spin not flown twice alike 4 | V9 the file's JI end at 10 rad/s
//   about the largest axis twice backward Euler's 4 | V10 the file's JI end at 20 rad/s about the largest axis backward Euler's own 4 | V11 the file's M1
//   energy down 12.7% (P4 then wrong) 5 | V12 the file's box3d end at 5 rad/s about the largest axis moved 5 | V13 the note saying P3 wrong 1 | V14 the
//   note's ends table cell mistyped 1 | V15 the note's third verdict heading renamed 2 (the note's row and the predictions', which read the build record
//   up to it) | V16 the note's backward Euler numbers rounded 1 | V17 the build record not saying P7's list 1 | V18 the second round's committed J moved
//   in its last digit 4 (C-repeat and the round flown again here, that file's hash and the second round's note row) | V19 the spinning body's committed
//   box3d energy moved 6 (this gate's M1 and note rows, and four in spinningBody-selfcheck) | V20 the second round's kept line at three times the bound
//   8 | V21 the loader's default Jolt's own force again 11 | V22 the step's Newton correction added, not taken away 8
//   Every row of section 6 went red under at least one design, and none went 0 red.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import * as L from "./joltGyroImplicit.mjs";
import * as GD from "./joltGyroDefault.mjs";
import * as SB from "./spinningBody.mjs";
import * as IG from "../../physics/mechanics/implicitGyro.mjs";
import * as RB from "../../physics/mechanics/rigidBody6dof.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now(), J = JSON.stringify;
const guard = (n, e) => ok(`section ${n} ran without throwing`, false, String(e && e.stack || e).split("\n").slice(0, 2).join(" ").slice(0, 240));
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const rel = (a, b) => Math.hypot(...a.map((v, k) => v - b[k])) / Math.hypot(...b);
const lib = fs.readFileSync(path.join(HERE, "joltGyroImplicit.mjs"), "utf8"), loader = fs.readFileSync(path.join(ENG, "physics/jolt/joltLoader.js"), "utf8");
const FIX = [6.5, 0, 0, 0, 5, 0, 0, 0, 2.5];   // the fixture's inertia, row-major

console.log("1. THE REGISTRATION, AS CODE");
try {
    ok("!! the five configurations, in order: Jolt with the new default (no key) at one substep; Jolt's own force (true); the engine's own physics; reported, box3d at its four substeps and Jolt with neither",
        J(L.CONFIGS.map((c) => [c.id, c.engine, c.flag, c.substeps])) === J([["JI", "jolt", "default", 1], ["JE", "jolt", true, 1], ["OWN", "own", null, null], ["B3", "box3d", null, 4], ["J0", "jolt", false, 1]]) && Object.isFrozen(L.CONFIGS));
    ok("!! the spins, the window, the lines and the cube are the second round's own objects: 2, 5, 10 and 20 rad/s about x and z, 30 s at 1/60 s, lost past 10%, kept within twice Euler's bound",
        L.RATES === GD.RATES && L.AXES === GD.AXES && L.STABLE === GD.STABLE && L.CUBE === GD.CUBE && J(L.RATES) === J([2, 5, 10, 20]) && J(L.STABLE) === J({ T: 30, dt: 1 / 60, eps: 1e-5, lost: 0.10, kept: 2 }));
    ok("!! C-box3d's spin: (1, 2, 3) rad/s for one box3d substep of 1/240 s, agreeing to 1e-6, frozen", J(L.BOX3D_CHECK) === J({ w0: [1, 2, 3], h: 1 / 240, tol: 1e-6 }) && Object.isFrozen(L.BOX3D_CHECK));
    ok("!! M1 is the spinning body's own spin: about the intermediate axis by default, its 30 s at its 1/60 s, on the new default, read by its rule",
        /export async function defaultBody\(\{ axis = 1, T = SB\.SPIN\.T, dt = SB\.SPIN\.dt \} = \{\}\)/.test(lib) && /a = await spinOf\(CONFIGS\[0\], \{ w0, T, dt \}\)/.test(lib) && /reading: SB\.readingOf\(fit\)/.test(lib));
    ok("!! C-repeat holds JE against the second round's COMMITTED J (its results file, read), on the registered spins only",
        /JSON\.parse\(fs\.readFileSync\(GD\.DEFAULT_RESULTS, "utf8"\)\)\.m3\.filter\(\(e\) => e\.config === "J"\)/.test(lib) && /result\.repeat = result\.registered \? repeatControl\(/.test(lib));
    ok("!! a run is the registered one only with the registered rates, the 30 s window and M1 about the intermediate axis",
        /registered: JSON\.stringify\(rates\) === JSON\.stringify\(RATES\) && T === STABLE\.T && m1Axis === 1/.test(lib));
    // found while designing the sabotages: the miniature's twins would pass as true for one spin compared with itself
    ok("!! M1 and M3 fly every spin TWICE -- two separate spinOf() calls, compared by sameTrace() -- not one spin compared with itself",
        /a = await spinOf\(CONFIGS\[0\], \{ w0, T, dt \}\), b = await spinOf\(CONFIGS\[0\], \{ w0, T, dt \}\)/.test(lib) && /twin: SB\.sameTrace\(a\.trace, b\.trace\) \};/.test(lib) &&
        /a = await spinOf\(c, \{ w0, T, dt \}\), b = await spinOf\(c, \{ w0, T, dt \}\)/.test(lib) && /twin: SB\.sameTrace\(a\.trace, b\.trace\) \}\);/.test(lib));
} catch (e) { guard(1, e); }

console.log("\n2. THE STEP ON MADE-UP CASES (physics/mechanics/implicitGyro.mjs, no engine)");
try {
    // box3d's Jacobian, against I + h (skew(w) I - skew(I w)) built here by plain matrix products
    const I = [4, 0.3, -0.2, 0.3, 3, 0.1, -0.2, 0.1, 2], w = [0.7, -1.3, 2.1], h = 0.05;
    const mm = (A, B) => Array.from({ length: 9 }, (_, k) => { const r = Math.floor(k / 3), c = k % 3; return A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]; });
    const mv = (A, v) => [A[0] * v[0] + A[1] * v[1] + A[2] * v[2], A[3] * v[0] + A[4] * v[1] + A[5] * v[2], A[6] * v[0] + A[7] * v[1] + A[8] * v[2]];
    const skew = (a) => [0, -a[2], a[1], a[2], 0, -a[0], -a[1], a[0], 0];
    const Sw = mm(skew(w), I), SIw = skew(mv(I, w)), built = I.map((v, k) => v + h * (Sw[k] - SIw[k])), jac = IG.jacobian(I, w, h);
    ok("!! box3d's Jacobian, written row by row, IS I + h (skew(w) I - skew(I w)) built here from plain products -- all nine entries, on an inertia with every off-diagonal term",
        jac.every((v, k) => near(v, built[k], 1e-12)), `worst ${Math.max(...jac.map((v, k) => Math.abs(v - built[k]))).toExponential(1)}`);
    const A = [2, 1, 0, 1, 3, 1, 0, 1, 4], x = [1, -2, 3], b = mv(A, x), got = IG.solve3(A, b);
    ok("!! the solve gives back a known solution, and says so (null) when the matrix is singular", rel(got, x) < 1e-12 && IG.solve3([1, 2, 3, 2, 4, 6, 0, 1, 1], [1, 2, 3]) === null);
    const q = [Math.SQRT1_2, 0, 0, Math.SQRT1_2], v = [0.3, -0.4, 1.2];
    ok("!! the rotations: a quarter turn about z sends x to y, and rotateInv undoes rotate", rel(IG.rotate(q, [1, 0, 0]), [0, 1, 0]) < 1e-12 && rel(IG.rotateInv(q, IG.rotate(q, v)), v) < 1e-12);
    ok("!! equal moments are left alone, exactly -- isIsotropic says so, and the step changes nothing -- and so is a spin about a principal axis",
        IG.isIsotropic([2, 0, 0, 0, 2, 0, 0, 0, 2]) && !IG.isIsotropic([2, 0, 0, 0, 2, 0, 0, 0, 2.1]) && !IG.isIsotropic([2, 0.1, 0, 0.1, 2, 0, 0, 0, 2]) &&
        J(IG.stepBody([2, 0, 0, 0, 2, 0, 0, 0, 2], [1, 2, 3], 1 / 60)) === J([1, 2, 3]) && J(IG.stepBody(FIX, [0, 0, 20], 1 / 60)) === J([0, 0, 20]) && J(IG.stepBody(FIX, [10, 0, 0], 1 / 60)) === J([10, 0, 0]));
    // THE STABLE WOBBLE: about axis a with the wobble on b and c, Q = |q| w_b^2 + |p| w_c^2 is what the linearised motion keeps;
    // backward Euler divides it by 1 + (Omega h)^2 every step, an explicit step multiplies it by the same
    const inv = (wb, a) => { const bb = (a + 1) % 3, c = (a + 2) % 3, I3 = [FIX[0], FIX[4], FIX[8]], p = (I3[c] - I3[a]) / I3[bb], qq = (I3[a] - I3[bb]) / I3[c]; return Math.abs(qq) * wb[bb] ** 2 + Math.abs(p) * wb[c] ** 2; };
    const explicit = (wb, hh) => { const Iw = [FIX[0] * wb[0], FIX[4] * wb[1], FIX[8] * wb[2]], cr = [wb[1] * Iw[2] - wb[2] * Iw[1], wb[2] * Iw[0] - wb[0] * Iw[2], wb[0] * Iw[1] - wb[1] * Iw[0]]; return [wb[0] - hh * cr[0] / FIX[0], wb[1] - hh * cr[1] / FIX[4], wb[2] - hh * cr[2] / FIX[8]]; };
    const rows = [[0, 10], [2, 20], [0, 2]].map(([a, W]) => { const bb = (a + 1) % 3, c = (a + 2) % 3, I3 = [6.5, 5, 2.5], om2 = Math.abs(((I3[c] - I3[a]) / I3[bb]) * ((I3[a] - I3[bb]) / I3[c])) * W * W, hh = 1 / 60;
        const w0 = [0, 0, 0]; w0[a] = W; w0[bb] = 1e-6 * W; w0[c] = 0.7e-6 * W;
        return { a, W, implicitRatio: inv(IG.stepBody(FIX, w0, hh), a) / inv(w0, a), want: 1 / (1 + om2 * hh * hh), explicitRatio: inv(explicit(w0, hh), a) / inv(w0, a), grow: 1 + om2 * hh * hh }; });
    ok("!! ONE STEP shrinks a stable wobble's invariant by backward Euler's 1 / (1 + (Omega h)^2) -- about the largest axis at 10 rad/s, the smallest at 20 and the largest at 2 -- where an explicit step grows it by 1 + (Omega h)^2",
        rows.every((r) => near(r.implicitRatio / r.want, 1, 1e-6) && near(r.explicitRatio / r.grow, 1, 1e-6) && r.implicitRatio < 1), rows.map((r) => `${r.W}/${r.a}: ${r.implicitRatio.toFixed(6)} (${r.want.toFixed(6)})`).join(", "));
    // THE UNSTABLE ONE: about the intermediate axis the wobble along (1, sqrt(q / p)) grows at sigma, and backward Euler takes it to 1 / (1 - sigma h) a step
    const W = 2, hh = 1 / 60, p1 = (6.5 - 5) / 2.5, q1 = (5 - 2.5) / 6.5, sigma = W * Math.sqrt(p1 * q1), wb = [0, W, 0]; wb[2] = 1e-7 * W; wb[0] = 1e-7 * W * Math.sqrt(q1 / p1);
    const after = IG.stepBody(FIX, wb, hh), grew = Math.hypot(after[0], after[2]) / Math.hypot(wb[0], wb[2]);
    ok("!! ...and runs the intermediate axis's unstable wobble at backward Euler's 1 / (1 - sigma h) a step, sigma the spinning body's 0.960769/s",
        near(grew, 1 / (1 - sigma * hh), 1e-7) && sigma.toFixed(6) === "0.960769", `${grew.toFixed(8)} against ${(1 / (1 - sigma * hh)).toFixed(8)}`);
    // THE FRAME (found while designing the sabotages: every check above starts from the identity, where a step that ignored the
    // orientation would pass): a body turned a quarter-turn about y, wobbling about its largest axis, shrinks its invariant by the same factor
    const qy = [Math.SQRT1_2, 0, Math.SQRT1_2, 0], wbody = [10, 1e-5, 0.7e-5], wworld = IG.rotate(qy, wbody), stepped = IG.rotateInv(qy, IG.implicitGyroStep(FIX, qy, wworld, 1 / 60));
    const turnedRatio = inv(stepped, 0) / inv(wbody, 0);
    ok("!! the world-frame step is the body-frame step seen through the body's own orientation: turned a quarter-turn about y, the same wobble at 10 rad/s shrinks by the same 1 / (1 + (Omega h)^2)",
        near(turnedRatio, rows[0].want, 1e-6 * rows[0].want), `${turnedRatio.toFixed(6)} against ${rows[0].want.toFixed(6)}`);
    ok("!! the end over the start is the LAST reading's wobble over the first's: one that starts at 0.1, peaks at 0.5 and ends at 0.2 ends at 2 (found while designing the sabotages)",
        L.endOf([{ w: [1, 0.1, 0] }, { w: [1, 0.5, 0] }, { w: [1, 0.2, 0] }], 0) === 2 && L.endOf([{ w: [1, 0, 0.3] }, { w: [1, 0, 0.3] }], 0) === 1);
} catch (e) { guard(2, e); }

console.log("\n3. THE PLUMBING (real Jolt, real box3d; no spin here is registered)");
try {
    const sig = (loader.match(/^\s*addBox\(\{[^)]*\}\s*=\s*\{\}\)\s*\{/m) || [""])[0];
    ok("!! the loader's default is the implicit step, it takes the step BEFORE Jolt's, and only for awake dynamic bodies with the setting and unequal moments",
        /gyroscopic = "implicit" \}/.test(sig) && /step\(dt = 1 \/ 60, substeps = 1\) \{ this\._implicitGyro\(dt\); this\.j\.Step\(dt, substeps\); \}/.test(loader) &&
        /if \(r\.gyro !== "implicit" \|\| r\.I === null \|\| !this\.bi\.IsActive\(r\.id\)\) continue;/.test(loader) && /rec\.I = isIsotropic\(I\) \? null : I;/.test(loader) && /implicitGyroStep\(r\.I, \[qq\.GetW\(\), qq\.GetX\(\), qq\.GetY\(\), qq\.GetZ\(\)\], w, h\)/.test(loader));
    const flag = await L.flagControl();
    ok("!! C-flag on Jolt's own bodies: no flag gives the implicit step with Jolt's force off, true gives Jolt's own force, false neither, and a static body neither", flag.ok, J(flag.got));
    // THE WRAPPER TAKES THE MODULE'S STEP, ONCE A STEP: a default body of the fixture, a wobbling spin, one world step, against the module by hand
    const one = async (gyroscopic) => {
        const w = (await L.jolt()).createWorld({ gravity: [0, 0, 0] }), opts = { type: "dynamic", pos: [0, 0, 0], half: [0.5, 1, 1.5], density: 1, damping: 0 };
        if (gyroscopic !== undefined) opts.gyroscopic = gyroscopic;
        const i = w.addBox(opts); w.setDamping(i, 0, 0); w.setAngularVelocity(i, [1, 2, 3]);
        const v0 = w.readAngularVelocities(), w0 = [v0[i * 3], v0[i * 3 + 1], v0[i * 3 + 2]], inr = w.inertia(i), d = inr.diag, o = inr.off, I = [d[0], o[0], o[1], o[0], d[1], o[2], o[1], o[2], d[2]];
        w.step(1 / 60, 1); const v1 = w.readAngularVelocities(), got = [v1[i * 3], v1[i * 3 + 1], v1[i * 3 + 2]]; w.destroy();
        const once = IG.implicitGyroStep(I, [1, 0, 0, 0], w0, 1 / 60), twice = IG.implicitGyroStep(I, [1, 0, 0, 0], once, 1 / 60);
        return { got, offOnce: rel(got, once), offTwice: rel(got, twice), moved: rel(got, w0) };
    };
    const def = await one(), jolt = await one(true);
    ok("!! the wrapper takes the module's step on a real Jolt body, ONCE a step: from (1, 2, 3) rad/s one world step lands on the module's step to 1e-6, not on two of them, and well away from where it started",
        def.offOnce <= 1e-6 && def.offTwice > 1e-3 && def.moved > 1e-2, `once ${def.offOnce.toExponential(1)}, twice ${def.offTwice.toExponential(1)}, moved ${def.moved.toExponential(1)}`);
    ok("!! ...and a body passed true takes Jolt's own force and NOT the wrapper's step: it lands somewhere else", jolt.offOnce > 1e-4 && jolt.moved > 1e-2, `off the module's step by ${jolt.offOnce.toExponential(1)}`);
    // ...THROUGH THE BODY'S OWN ORIENTATION (found while designing the sabotages: from the identity a box's symmetry hides a quaternion read
    // in the wrong order): a body turned 0.5 rad about (1, 1, 1), one world step, against the module with that body's quaternion. G12 found
    // that the quarter-turn about y this row first used could not see that mistake either: read in the wrong order it is the right turn
    // composed with a half-turn about the body's z, a symmetry of the box. A generic turn has none.
    const turned = async () => {
        const w = (await L.jolt()).createWorld({ gravity: [0, 0, 0] }), i = w.addBox({ type: "dynamic", pos: [0, 0, 0], half: [0.5, 1, 1.5], density: 1, damping: 0 }), s = Math.sin(0.25) / Math.sqrt(3);
        w.setDamping(i, 0, 0); w.setTransform(i, [0, 0, 0], [s, s, s, Math.cos(0.25)]); w.setAngularVelocity(i, [1, 2, 3]);   // Jolt's order: x y z w
        const v0 = w.readAngularVelocities(), w0 = [v0[i * 3], v0[i * 3 + 1], v0[i * 3 + 2]], t = w.readTransforms(), q = [t[i * 7 + 6], t[i * 7 + 3], t[i * 7 + 4], t[i * 7 + 5]];
        const inr = w.inertia(i), d = inr.diag, o = inr.off, I = [d[0], o[0], o[1], o[0], d[1], o[2], o[1], o[2], d[2]];
        w.step(1 / 60, 1); const v1 = w.readAngularVelocities(), got = [v1[i * 3], v1[i * 3 + 1], v1[i * 3 + 2]]; w.destroy();
        return { off: rel(got, IG.implicitGyroStep(I, q, w0, 1 / 60)), offUnturned: rel(got, IG.implicitGyroStep(I, [1, 0, 0, 0], w0, 1 / 60)) };
    };
    const tn = await turned();
    ok("!! ...and on a body turned 0.5 rad about (1, 1, 1), the wrapper's step is the module's through that body's OWN orientation, to 1e-6 -- not the step an unturned body would take",
        tn.off <= 1e-6 && tn.offUnturned > 1e-4, `${tn.off.toExponential(1)} through its orientation, ${tn.offUnturned.toExponential(1)} as if unturned`);
    // AN EQUAL-MOMENT BODY IS SKIPPED: a cube with the default and one with false, ten seconds of a tilted spin, step for step
    const cube = async (gyroscopic) => { const sp = await L.joltSpinner({ w0: [0.6, 1.2, 1.8], ship: true, flag: gyroscopic }), tr = [sp.read()]; for (let k = 0; k < 600; k++) { sp.step(); tr.push(sp.read()); } sp.destroy(); return { tr, setting: sp.setting }; };
    const cd = await cube("default"), c0 = await cube(false);
    const jw = (await L.jolt()).createWorld({ gravity: [0, 0, 0] }), ci = jw.addShip({ x: 0, z: 0 }), fi = jw.addBox({ type: "dynamic", pos: [3, 0, 0], half: [0.5, 1, 1.5], density: 1 });
    const recs = [jw.bodies[ci].I, jw.bodies[fi].I]; jw.destroy();
    ok("!! an equal-moment body is skipped: a ship with the default has the setting but holds no inertia for the step, and flies 600 steps of a tilted spin to the bit as one with the force off",
        cd.setting === "implicit" && c0.setting === false && SB.sameTrace(cd.tr, c0.tr) && recs[0] === null && Array.isArray(recs[1]) && recs[1].length === 9);
    const b3 = await L.box3dControl();
    ok("!! C-box3d on real box3d: one box3d substep of 1/240 s from (1, 2, 3) rad/s lands on the module's step to 1e-6 -- and not on an explicit step", b3.ok && b3.off <= 1e-6 && b3.offExplicit > 1e-5 && b3.moved > 1e-3,
        `off ${b3.off.toExponential(1)}, explicit off ${b3.offExplicit.toExponential(1)}, moved ${b3.moved.toExponential(1)}`);
    const real = (await L.jolt()).createWorld({ gravity: [0, 0, 0] }), seen = [], subs = [];
    const spy = new Proxy(real, { get(t, k) {
        if (k === "addBox") return (o) => { seen.push({ ...o }); return t.addBox(o); };
        if (k === "step") return (dt, s) => { subs.push(s); return t.step(dt, s); };
        const fn = t[k]; return typeof fn === "function" ? fn.bind(t) : fn; } });
    const s1 = await L.joltSpinner({ w0: [1, 0, 0], makeWorld: () => spy }), s2 = await L.joltSpinner({ w0: [1, 0, 0], flag: true, makeWorld: () => spy }), s3 = await L.joltSpinner({ w0: [1, 0, 0], flag: false, substeps: 4, makeWorld: () => spy });
    s3.step(); real.destroy();
    ok("!! the spinner passes NO gyroscopic key for the default -- the loader's own default is what is measured -- and the flag itself otherwise; and the substeps reach the world's step",
        seen.length === 3 && !("gyroscopic" in seen[0]) && seen[1].gyroscopic === true && seen[2].gyroscopic === false && s1.setting === "implicit" && s2.setting === "jolt" && s3.setting === false && J(subs) === J([4]), J(seen.map((s) => s.gyroscopic)));
    const sp = await L.joltSpinner({ w0: [0.4, 1e-3, 0] }); for (let k = 0; k < 30; k++) sp.step(); const rr = sp.read(); sp.destroy();
    ok("!! the Jolt spinner reads the BODY frame: Jolt's world-frame angular velocity turned by the body's own quaternion, exactly, and after a turn the two differ (found while designing the sabotages)",
        J(rr.w) === J(RB.worldToBody(rr.q, rr.wWorld)) && J(rr.w) !== J(rr.wWorld) && near(rr.w[0], 0.4, 1e-3));
    const bx = await L.box3dSpinner({ w0: [0.4, 1e-3, 0] }), sb = await SB.spinner(SB.CONFIGS[0], { w0: [0.4, 1e-3, 0], dt: 1 / 60 });
    for (let k = 0; k < 30; k++) { bx.step(); sb.step(); }
    const rb = bx.read(), rs = sb.read(); bx.destroy(); sb.destroy();
    ok("!! the box3d spinner is the spinning body's C1 (its own loader, four substeps, undamped), to the bit", J(rb.w) === J(rs.w) && J(rb.q) === J(rs.q) && bx.backendId === "box3d");
} catch (e) { guard(3, e); }

console.log("\n4. THE ROUND ON A MINIATURE (1 rad/s for a tenth of a second, M1 about the stable largest axis)");
try {
    const r = await L.run({ rates: [1], T: 0.1, m1Axis: 0 }), m1 = r.m1 || {}, m2 = r.m2 || {}, m3 = r.m3 || [], jc = r.joltControls || [];
    ok("!! the round runs C-flag, C-box3d and C-key, then C-inertia and C-undamped on every Jolt configuration, then M1, M2 and M3 -- says it is not the registered run, and repeats nothing",
        r.registered === false && !r.stopped && r.flag.ok && !!r.box3d && r.box3d.ok && !!r.key && r.key.ok && J(jc.map((x) => x.config)) === J(["JI", "JE", "J0"]) && jc.every((x) => x.inertia.ok && x.undamped.ok) &&
        !!r.m1 && !!r.m2 && Array.isArray(r.m3) && !!r.repeat && r.repeat.ok === null, r.stopped || "");
    ok("!! M3 covers all five configurations at the rate, about both stable axes, each flown twice to the bit, each reading the rule's, with its end over its start",
        m3.length === 10 && J(m3.map((x) => x.config + x.axis)) === J(["JI0", "JI2", "JE0", "JE2", "OWN0", "OWN2", "B30", "B32", "J00", "J02"]) &&
        m3.every((x) => x.twin && x.reading === GD.stableReading(x, x.bound) && x.bound === GD.eulerBound(SB.fixtureBody().I, x.axis) && Number.isFinite(x.end) && x.end > 0));
    ok("!! M1 reports the default body's setting (the implicit step, Jolt's force off), reads by the spinning body's rule, and flies twice to the bit; M2 reports the ship's settings, the default and off",
        m1.setting === "implicit" && m1.joltFlag === false && m1.axis === 0 && !!m1.fit && m1.reading === SB.readingOf(m1.fit) && m1.twin === true && !!m1.invariants &&
        m2.setting === "implicit" && m2.settingOff === false && m2.steps === 6 && typeof m2.same === "boolean" && ["change", "changeOff", "apart"].every((k) => Number.isFinite(m2[k])));
    // C-FLAG CAN FAIL: a world that gives every body Jolt's own force -- the wrapper as it was -- stops the round before anything is read
    const jw = (await L.jolt()).createWorld({ gravity: [0, 0, 0] }), old = new Proxy(jw, { get(t, k) {
        if (k === "addBox") return (o) => t.addBox("gyroscopic" in o ? o : { ...o, gyroscopic: true });
        const fn = t[k]; return typeof fn === "function" ? fn.bind(t) : fn; } });
    const stopped = await L.run({ rates: [1], T: 0.1, m1Axis: 0, flagWorld: () => old });
    ok("!! C-flag can fail: handed a world whose default body comes back with Jolt's own force, the round says so and stops before any measurement",
        stopped.flag.ok === false && J(stopped.flag.got.default) === J(["jolt", true]) && /C-flag failed/.test(stopped.stopped || "") && !stopped.box3d && !stopped.m1 && !stopped.m3);
    const explicitStep = (I, q, w0, h) => { const Iw = [I[0] * w0[0], I[4] * w0[1], I[8] * w0[2]], cr = [w0[1] * Iw[2] - w0[2] * Iw[1], w0[2] * Iw[0] - w0[0] * Iw[2], w0[0] * Iw[1] - w0[1] * Iw[0]]; return [w0[0] - h * cr[0] / I[0], w0[1] - h * cr[1] / I[4], w0[2] - h * cr[2] / I[8]]; };
    const refused = await L.box3dControl({ step: explicitStep });
    ok("!! C-box3d can fail: handed an explicit step in place of the module's, box3d's substep refuses it", refused.ok === false && refused.off > 1e-5, `off ${refused.off.toExponential(1)}`);
    const committed = JSON.parse(fs.readFileSync(GD.DEFAULT_RESULTS, "utf8")).m3.filter((e) => e.config === "J"), mine = committed.map((e) => ({ ...e, config: "JE" }));
    const moved = mine.map((e, k) => (k === 3 ? { ...e, factor: e.factor * (1 + 1e-12) } : e));
    ok("!! C-repeat can tell: the second round's committed J passes as itself, and one growth moved in its twelfth digit is refused, by name",
        L.repeatControl(mine).ok === true && L.repeatControl(moved).ok === false && J(L.repeatControl(moved).off) === J(["5/2"]) && L.repeatControl(mine.slice(1)).ok === false);
    const x = await L.spinOf(L.CONFIGS[0], { w0: [1, 1e-5, 0], T: 0.1 }), y = await L.spinOf(L.CONFIGS[0], { w0: [1.001, 1e-5, 0], T: 0.1 }), z = await L.spinOf(L.CONFIGS[0], { w0: [1, 1e-5, 0], T: 0.1 });
    ok("!! C-determinism can tell: two spins on the new default a thousandth apart in rate are refused, and two of the same pass", !SB.sameTrace(x.trace, y.trace) && SB.sameTrace(x.trace, z.trace));
    const text = L.serialize(r);
    ok("  the results file's text: JSON.parse gives back the result exactly, and every array of numbers sits on one line",
        J(JSON.parse(text)) === J(r) && /"rates": \[[^\n\]]*\]/.test(text) && /"axis": \[[^\n\]]*\]/.test(text) && !/"rates": \[\n/.test(text));
} catch (e) { guard(4, e); }

console.log("\n5. THE COMMAND (never executed)");
try {
    const cmd = fs.readFileSync(path.join(HERE, "joltGyroImplicitRun.mjs"), "utf8"), code = cmd.replace(/\/\/.*$/gm, "");
    const atOpt = code.indexOf("unknown option"), atRefuse = code.indexOf("refuseExisting(results)"), atRun = code.indexOf("await run()");
    ok("!! the command refuses an option it does not know, then a results file that exists, before it runs the round, exiting 2 on either -- and refuseExisting() is the library's",
        atOpt > 0 && atRefuse > atOpt && atRun > atRefuse && /unknown option[^\n]*\); process\.exit\(2\);/.test(code) && /refuseExisting\(results\); if \(refused\) \{ console\.error\([^)]*\); process\.exit\(2\); \}/.test(code) &&
        /never overwritten/.test(L.refuseExisting("/any/r.json", () => true) || "") && L.refuseExisting("/any/r.json", () => false) === null && /from "\.\/joltGyroImplicit\.mjs"/.test(code));
    ok("  ...and it prints no score: the result goes to the file through serialize(), and the console says only where",
        !/\.reading|\.factor|\.m1\b|\.m2\b|\.m3\b|\.key\b|\.flag\b|\.box3d\b|\.repeat\b/.test(code) && /fs\.writeFileSync\(results, serialize\(result\)\)/.test(code) && /commit it before reading it/.test(code) && (code.match(/console\.log\(/g) || []).length === 1);
} catch (e) { guard(5, e); }

console.log("\n6. THE VERDICT, AS CODE, FROM THE COMMITTED FILE (physics/mechanics/joltGyroImplicitResults.json, committed unread at 6f2063d3)");
try {
    // Written AFTER the file was committed and read. Every number the note's verdict states from the file is re-derived here, every reading by
    // this gate's own statement of the rules; the whole registered round is flown again through the library (never the command) and held
    // against the file; and backward Euler's shrinkage -- the registration's own model -- is held against every end of JI's and box3d's.
    const text = fs.readFileSync(L.DEFAULT_RESULTS, "utf8"), R = JSON.parse(text), M3 = R.m3 || [], { I } = SB.fixtureBody();
    const sha = createHash("sha256").update(text).digest("hex"), th = (x) => x.toLocaleString("en-US"), e1 = (x) => x.toExponential(1), f4 = (x) => x.toFixed(4);
    const at = (c, W, a) => M3.find((e) => e.config === c && e.W === W && e.axis === a) || {};
    ok("!! the file is the registered run, committed unread at 6f2063d3 (sha256 1b3aea52, written at 15:08:03): the rates, axes, window, lines, cube and configurations the library's, flagged registered and not stopped, M1 about the intermediate axis, and its text serialize()'s",
        sha === "1b3aea526d8d02f8afa3ad3fe3f7f1436221f266f786d9fd1a360694cef515c1" && R.at.startsWith("2026-11-03T15:08:03") && R.registration === L.REGISTRATION && J(R.rates) === J(L.RATES) &&
        J(R.axes) === J(L.AXES) && J(R.stable) === J(L.STABLE) && J(R.cube) === J({ ...L.CUBE, axis: [...L.CUBE.axis] }) && J(R.configs) === J(L.CONFIGS.map((c) => ({ ...c }))) && R.registered === true &&
        R.T === 30 && R.dt === 1 / 60 && R.m1Axis === 1 && !("stopped" in R) && L.serialize(R) === text, sha.slice(0, 8) + " " + R.at);
    const key = await GD.keyControl(), jc = R.joltControls || [], off = (d) => d.map((v, k) => Math.abs(v / I[k] - 1));
    ok("!! the controls held, as the file records them and re-derived here: C-flag (no flag the implicit step with Jolt's force off, true Jolt's own, false and a static body neither); C-box3d 3.1e-8, an explicit step 3.2e-5 away; C-key 1.0000 and 1.4422 against Euler's bounds over 1,800 steps, the same measured again; C-inertia to 1e-7 and C-undamped exact on JI, JE and J0",
        R.flag.ok === true && J(R.flag.got) === J({ default: ["implicit", false], true: ["jolt", true], false: [false, false], static: [false, false] }) &&
        R.box3d.ok === true && R.box3d.off <= L.BOX3D_CHECK.tol && e1(R.box3d.off) === "3.1e-8" && e1(R.box3d.offExplicit) === "3.2e-5" &&
        R.key.ok === true && J(R.key.got.map((x) => [x.axis, x.steps])) === J([[0, 1800], [2, 1800]]) && R.key.got.every((x) => x.bound === GD.eulerBound(I, x.axis) && Math.abs(x.factor / x.bound - 1) <= 1e-3) && key.ok &&
        key.got.every((x, k) => near(x.factor, R.key.got[k].factor, 1e-12) && x.steps === R.key.got[k].steps && x.bound === R.key.got[k].bound && x.ok === R.key.got[k].ok) &&
        J(jc.map((x) => x.config)) === J(["JI", "JE", "J0"]) && jc.every((x) => x.inertia.ok && Math.max(...off(x.inertia.diag)) < 1e-7 && x.inertia.off.every((v) => v === 0) && x.undamped.ok && x.undamped.worst === 0),
        `box3d ${e1(R.box3d.off)}, Jolt's moments off by ${e1(Math.max(...off(jc[0].inertia.diag)))}`);
    // C-REPEAT, re-derived from the second round's committed file by this gate, on more of each spin than the library's own pick
    const gdR = JSON.parse(fs.readFileSync(GD.DEFAULT_RESULTS, "utf8")), was = gdR.m3.filter((e) => e.config === "J"), je = M3.filter((e) => e.config === "JE");
    const spin = (e) => J([e.W, e.axis, e.bound, e.factor, e.lostAt, e.reading, e.twin]);
    ok("!! C-repeat, as the file records it and re-derived here from the second round's committed file: JE's eight spins are its J -- rate, axis, bound, growth, loss time, reading and twin, number for number",
        R.repeat.ok === true && R.repeat.spins === 8 && J(R.repeat.off) === "[]" && je.length === 8 && was.length === 8 && je.every((e, k) => spin(e) === spin(was[k])), `${je.length} against ${was.length}`);
    ok("!! C-determinism: all 40 spins flew twice to the bit, and so did M1", M3.length === 40 && M3.every((e) => e.twin === true) && R.m1.twin === true);
    // the spinning body's rule, written out again from its registration; the second round's M1 and the spinning body's box3d, from their committed files
    const P = 2 * Math.sqrt(((5 - 2.5) * (6.5 - 5)) / (2.5 * 6.5)), m1 = R.m1 || {}, euler = (f) => f.crossed !== null && f.points >= 20 && f.r2 >= 0.999 && Math.abs(f.sigma / P - 1) <= 0.10;
    const pct = (s) => (s / P - 1) * 100, c1 = JSON.parse(fs.readFileSync(SB.DEFAULT_RESULTS, "utf8")).configs.find((c) => c.id === "C1"), inv = m1.invariants || {};
    const E = (-inv.energyChange * 100).toFixed(2), Lp = (inv.driftL * 100).toFixed(2), E1 = (-c1.invariants.energyChange * 100).toFixed(2), L1 = (c1.invariants.driftL * 100).toFixed(2);
    ok("!! M1: the default body has the implicit step (Jolt's force off) and reads Euler's equations by the spinning body's rule (written out here) and by readingOf(), +0.800% where the second round's Jolt force read -0.801%; its energy ended 5.72% down and its momentum's length strayed 2.90%, box3d's 1.30% and 0.65%; it flipped twice, as box3d did",
        m1.axis === 1 && m1.setting === "implicit" && m1.joltFlag === false && euler(m1.fit) && m1.reading === "Euler's equations" && SB.readingOf(m1.fit) === m1.reading &&
        pct(m1.fit.sigma).toFixed(3) === "0.800" && pct(gdR.m1.fit.sigma).toFixed(3) === "-0.801" && E === "5.72" && Lp === "2.90" && E1 === "1.30" && L1 === "0.65" && inv.flips === 2 && c1.invariants.flips === 2,
        `${m1.fit.sigma.toFixed(6)} (${pct(m1.fit.sigma).toFixed(3)}%)`);
    const m2 = R.m2 || {};
    ok("!! M2: the cube from addShip() has the setting \"implicit\" but equal moments, so the step skips it -- over 1,800 steps its angular velocity did not move at all, and its trace is the trace with the force off, to the bit; the second round's Jolt force moved it by 2.6e-5",
        m2.setting === "implicit" && m2.settingOff === false && m2.same === true && m2.change === 0 && m2.changeOff === 0 && m2.apart === 0 && m2.steps === 1800 && e1(gdR.m2.changeOn) === "2.6e-5");
    // M3's rule written out again: past 10% of the spin inside the window is lost; otherwise within twice Euler's bound is kept; otherwise drifting
    const rule = (e) => (e.lostAt !== null && e.lostAt <= 30 ? "lost" : e.factor <= 2 * e.bound ? "kept" : "drifting");
    const order = []; for (const c of ["JI", "JE", "OWN", "B3", "J0"]) for (const W of [2, 5, 10, 20]) for (const a of [0, 2]) order.push(c + W + "/" + a);
    const pat = (c) => M3.filter((e) => e.config === c).map((e) => e.reading).join(","), eight = Array(8).fill("kept").join();
    ok("!! M3's readings, re-derived by this gate's own statement of the rule and by stableReading(), are the file's, each against Euler's bound in closed form: JI kept all eight, and so did the engine's own physics, box3d and Jolt with neither; JE kept, kept, drifting, drifting, LOST, drifting, LOST, LOST, as in the second round",
        J(M3.map((e) => e.config + e.W + "/" + e.axis)) === J(order) && M3.every((e) => e.bound === GD.eulerBound(I, e.axis) && rule(e) === e.reading && GD.stableReading(e, e.bound) === e.reading) &&
        pat("JI") === eight && pat("OWN") === eight && pat("B3") === eight && pat("J0") === eight && pat("JE") === "kept,kept,drifting,drifting,lost,drifting,lost,lost" &&
        M3.filter((e) => e.config === "J0").every((e) => e.factor < 1.0001), ["JI", "JE"].map((c) => c + ": " + pat(c)).join(" | "));
    ok("!! the losses, from the file: only Jolt's own force loses a spin -- at 10 rad/s about the largest axis after 23.22 s, at 20 rad/s after 5.95 s (largest) and 8.97 s (smallest)",
        J(M3.filter((e) => e.lostAt !== null).map((e) => [e.config, e.W, e.axis, e.lostAt.toFixed(2)])) === J([["JE", 10, 0, "23.22"], ["JE", 20, 0, "5.95"], ["JE", 20, 2, "8.97"]]));
    // BACKWARD EULER'S SHRINKAGE: the step divides the wobble's size by sqrt(1 + (Omega h)^2) a step, Omega the wobble's own frequency. Over the window
    // the size is that times the wobble's own swing -- its start is the larger semi-axis about x (between sqrt(3)/2 and 1 of it) and the smaller about z
    // (between 1 and Euler's bound). The engine's own physics, which keeps the size, must sit in the swing alone.
    const omega = (a, W) => { const b = (a + 1) % 3, c = (a + 2) % 3; return W * Math.sqrt(Math.abs(((I[c] - I[a]) / I[b]) * ((I[a] - I[b]) / I[c]))); };
    const swing = (a) => { const b = (a + 1) % 3, c = (a + 2) % 3; return Math.sqrt(Math.abs(I[b] * (I[a] - I[b])) / Math.abs(I[c] * (I[a] - I[c]))); };
    const shrink = (e, sub) => { const h = 1 / 60 / sub, n = Math.round(30 / h); return Math.exp(-(n / 2) * Math.log(1 + (omega(e.axis, e.W) * h) ** 2)); };
    const inBand = (e, A) => { const [lo, hi] = e.axis === 0 ? [A * swing(0), A] : [A, A * swing(2)]; return e.end >= lo * (1 - 1e-6) && e.end <= hi * (1 + 1e-6); };
    const ji = M3.filter((e) => e.config === "JI"), own = M3.filter((e) => e.config === "OWN");
    const held = M3.filter((e) => (e.config === "JI" && e.W <= 10) || e.config === "B3").map((e) => ({ e, A: shrink(e, e.config === "B3" ? 4 : 1) })), past = ji.filter((e) => e.W === 20).map((e) => ({ e, A: shrink(e, 1) }));
    ok("!! backward Euler's shrinkage, (1 + (Omega h)^2)^(-1/2) a step, times the wobble's own swing, holds every end of JI's at 2, 5 and 10 rad/s and all eight of box3d's at its four substeps; the engine's own physics ends every spin inside the swing alone, its size kept",
        held.length === 14 && held.every(({ e, A }) => inBand(e, A)) && own.length === 8 && own.every((e) => inBand(e, 1)) && near(swing(0), Math.sqrt(3) / 2, 1e-12) && near(swing(2), GD.eulerBound(I, 2), 1e-12),
        held.map(({ e, A }) => `${e.config}${e.W}/${e.axis} ${(e.end / A).toFixed(3)}`).join(" "));
    ok("!! ...but not at 20 rad/s on Jolt: the wobble ended at 7.0e-7 and 1.8e-6 of its start, 1.4e-10 and 3.6e-10 rad/s, where backward Euler gives 4.9e-21 and 7.3e-14 -- held at a size the model does not explain",
        past.length === 2 && past.every(({ e, A }) => e.end > 1e6 * A) && J(past.map(({ e }) => e1(e.end))) === J(["7.0e-7", "1.8e-6"]) &&
        J(past.map(({ e }) => e1(e.end * L.STABLE.eps * e.W))) === J(["1.4e-10", "3.6e-10"]) && J(past.map(({ A }) => e1(A))) === J(["4.9e-21", "7.3e-14"]));
    const r5 = Math.log(at("JI", 5, 0).end) / Math.log(at("B3", 5, 0).end);
    ok("!! on Jolt the step damps about four times as fast as box3d's, which takes it at four substeps of a quarter of the step: at 5 rad/s about the largest axis the wobble ended at 0.0499 of its start on Jolt and 0.4694 on box3d",
        near(r5, 4, 0.1) && f4(at("JI", 5, 0).end) === "0.0499" && f4(at("B3", 5, 0).end) === "0.4694", `the logarithms ${r5.toFixed(3)} apart`);
    const note = fs.readFileSync(path.join(ENG, "physics/mechanics/SPINNING_BODY_WIP.md"), "utf8"), sAt = note.indexOf("\n## The implicit gyroscopic step in Jolt's wrapper");
    const vAt = sAt >= 0 ? note.indexOf("\n### The verdict, 2026-11-03", sAt) : -1, bAt = sAt >= 0 ? note.indexOf("\n### Built, 2026-11-03", sAt) : -1;
    const built = bAt > 0 && vAt > bAt ? note.slice(bAt, vAt).replace(/\s+/g, " ") : "";
    const jiEnds = ji.filter((e) => e.W >= 5), worstEnd = jiEnds.reduce((m, e) => (e.end > m.end ? e : m), { end: -1 });
    const pred = { P1: m1.reading === "Euler's equations" && Math.abs(pct(m1.fit.sigma) - 0.80) <= 0.05, P2: pat("JI") === eight, P3: jiEnds.length === 6 && jiEnds.every((e) => e.end < 0.5),
        P4: -inv.energyChange >= 0.01 && -inv.energyChange <= 0.10, P5: m2.same === true, P6: pat("B3") === eight };
    ok("!! the predictions, read off the file: P1 to P6 right -- and P7 is the build record's, which says so (M4's reds were P7's list)",
        Object.values(pred).every(Boolean) && /That is P7's list\./.test(built) && /no physics gate moved/.test(built), J(pred));
    let worst = 0, where = "";
    const same = (a, b, p) => {
        if (typeof a === "number" && typeof b === "number") {
            if (Number.isInteger(a) && Number.isInteger(b)) return a === b;
            const d = Math.abs(a - b) / Math.max(1, Math.abs(a), Math.abs(b)); if (d > worst) { worst = d; where = p; } return d <= 1e-9;
        }
        if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, k) => same(x, b[k], `${p}[${k}]`));
        if (a && b && typeof a === "object" && typeof b === "object") { const ka = Object.keys(a).sort(), kb = Object.keys(b).sort(); return J(ka) === J(kb) && ka.every((k) => same(a[k], b[k], `${p}.${k}`)); }
        return a === b;
    };
    const again = await L.run(), { at: atA, ...flown } = again, { at: atR, ...filed } = R;
    ok("!! the registered round flown again at this head, through the library: run() gives back the file -- every reading, flag and count exactly, every number to 1e-9 (only the time it was written differs)",
        again.registered === true && typeof atA === "string" && typeof atR === "string" && same(flown, filed, "R"), `worst ${worst.toExponential(1)}${where ? " at " + where : ""}`);
    // THE NOTE: the third round's verdict, that section alone (the second round's carries the same heading, earlier), its line breaks read as spaces
    const rest = vAt >= 0 ? note.slice(vAt + 1) : "", nextHead = rest.search(/\n#{2,3} /), vt = vAt >= 0 ? (nextHead > 0 ? rest.slice(0, nextHead) : rest).replace(/\s+/g, " ") : "";
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), stands = (x) => new RegExp("(?<![0-9])" + esc(x) + "(?![0-9])").test(vt);
    const name = { JI: "JI", JE: "JE", OWN: "own physics", B3: "B3", J0: "J0" }, axn = { 0: "largest axis", 2: "smallest axis" }, words = { 1: "once", 2: "twice", 8: "eight" };
    const fmt = (f) => (f >= 100 ? th(Math.round(f)) : f4(f)), cell = (e) => (e.lostAt !== null ? `lost at ${e.lostAt.toFixed(2)} s` : `${fmt(e.factor)}, ${e.reading}`), endF = (x) => (x >= 0.01 ? f4(x) : e1(x));
    const rows = [];
    for (const c of ["JI", "JE", "OWN", "B3", "J0"]) for (const a of [0, 2]) rows.push(`| ${name[c]}, ${axn[a]} | ${[2, 5, 10, 20].map((W) => cell(at(c, W, a))).join(" | ")} |`);
    for (const c of ["JI", "OWN", "B3"]) for (const a of [0, 2]) rows.push(`| ${name[c]}, ${axn[a]} | ${[2, 5, 10, 20].map((W) => endF(at(c, W, a).end)).join(" | ")} |`);
    const frags = [...rows, `(${th(text.length)} bytes, sha256 ${sha.slice(0, 8)})`, `to ${e1(R.box3d.off)} of the spin; an explicit step is ${e1(R.box3d.offExplicit)} away`,
        `at ${f4(R.key.got[0].factor)} and ${f4(R.key.got[1].factor)} of their start`, `over all ${th(R.key.got[0].steps)} steps`, `JE's ${words[R.repeat.spins]} spins are the second round's committed J`,
        `all ${M3.length} spins flew twice to the bit${R.m1.twin ? ", and so did M1" : ""}`, `grew at ${m1.fit.sigma.toFixed(6)}/s (+${pct(m1.fit.sigma).toFixed(3)}%)`,
        `read ${gdR.m1.fit.sigma.toFixed(6)}/s (${pct(gdR.m1.fit.sigma).toFixed(3)}%)`, `its rotational energy ended ${E}% below its start, and its angular momentum's length strayed by at most ${Lp}%`,
        `ended ${E1}% below and strayed by at most ${L1}%`, `the tumble flipped ${words[inv.flips]}, as box3d's did`, `moved it by ${e1(gdR.m2.changeOn)} of its spin`,
        `from ${f4(at("JI", 2, 2).factor)} at 2 rad/s to ${f4(at("JI", 20, 2).factor)} at 20, always under Euler's ${f4(GD.eulerBound(I, 2))}`,
        `between ${swing(0).toFixed(3)} and 1 of its start about the largest axis, and between 1 and ${f4(swing(2))} about the smallest`,
        `It ended at ${e1(past[0].e.end)} and ${e1(past[1].e.end)} of its start (${e1(past[0].e.end * L.STABLE.eps * 20)} and ${e1(past[1].e.end * L.STABLE.eps * 20)} rad/s), where backward Euler gives ${e1(past[0].A)} and ${e1(past[1].A)}`,
        `the wobble ended at ${f4(at("JI", 5, 0).end)} of its start on Jolt, and at ${f4(at("B3", 5, 0).end)} on box3d`,
        `M1 reads Euler's equations at +${pct(m1.fit.sigma).toFixed(3)}%`, `The largest end was ${f4(worstEnd.end)}, at ${worstEnd.W} rad/s about the ${axn[worstEnd.axis].replace(" axis", "")} axis`,
        `M1's rotational energy ended ${E}% below its start`, `to ${e1(at("JI", 10, 0).end)} of its start about the largest axis and ${e1(at("JI", 10, 2).end)} about the smallest`,
        `loses rotational energy, ${E}% in 30 s at 2 rad/s`, ...Object.keys(pred).map((k) => `**${k}: ${pred[k] ? "right" : "wrong"}.**`), "**P7: right, read from the build record, not from this file.**"];
    const missing = frags.filter((x) => !stands(x));
    ok("!! the note's verdict carries the file's numbers, both tables row by row, backward Euler's numbers as this section computes them, and each prediction's outcome as the file decides it (no digit may touch a fragment's ends; read from the third round's verdict alone)",
        sAt > 0 && vAt > sAt && missing.length === 0, missing.length ? "missing: " + missing.join(" || ").slice(0, 300) : `${frags.length} fragments`);
} catch (e) { guard(6, e); }

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: what holds a 20 rad/s wobble near 1e-10 rad/s, how fast a larger wobble dies, contact, joints and damping, the step at more substeps, and its time in a scene whose bodies touch -- none of it registered.");
process.exitCode = fails ? 1 : 0;
