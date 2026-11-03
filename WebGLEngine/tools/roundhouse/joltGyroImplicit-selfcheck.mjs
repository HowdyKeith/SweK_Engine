// WebGLEngine/tools/roundhouse/joltGyroImplicit-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/roundhouse/joltGyroImplicit-selfcheck.mjs      (~2 s)
//
// THE GATE OF tools/roundhouse/joltGyroImplicit.mjs (and its command, joltGyroImplicitRun.mjs): the implicit gyroscopic step
// in Jolt's wrapper, as physics/mechanics/SPINNING_BODY_WIP.md registers its third round -- and of the step itself
// (physics/mechanics/implicitGyro.mjs) and the wrapper that takes it (physics/jolt/joltLoader.js).
// *** NOTHING HERE FLIES A REGISTERED SPIN, AND NOTHING HERE STARTS THE COMMAND. *** The miniature spins at 1 rad/s, a rate
// nobody registered, for a tenth of a second, and M1 about a STABLE axis. The command's guards are held as library functions
// and as the order of its source.
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
"use strict";
import fs from "node:fs";
import path from "node:path";
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

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: the round itself -- the registered run writes physics/mechanics/joltGyroImplicitResults.json, committed before it is read, and its verdict becomes section 6.");
process.exitCode = fails ? 1 : 0;
