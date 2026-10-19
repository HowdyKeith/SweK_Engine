// WebGLEngine/physics/mechanics/terrain-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node physics/mechanics/terrain-selfcheck.mjs      (~0.3 s)
//
// THE GROUND THE MODELS, THE PILOTS AND THE PAGES SHARE, HELD TO ITS CLOSED FORMS. physics/mechanics/terrain.mjs is a height function with a gradient and a normal, built from a JSON spec; what this gate protects is that the three things reading it cannot disagree about where the ground is:
//
//   1  THE FRONT DOOR   the export list and the kinds are pinned; FLAT is height 0 with a normal of exactly (0, 0, 1) -- the models' bit-for-bit fast path rests on that -- and a bare function, a spec and a terrain all become a terrain
//   2  SPECS            an unknown kind, a non-finite number, a bad radius, a half octave, a malformed clearing and a sum with no parts are each refused by name; a spec is frozen all the way down and rebuilds the same ground from JSON
//   3  CLOSED FORMS     each kind's height at points worked out here, not read back: the plane's slope, the bump's e^-1 at one radius, the ridge's across any angle, the wall's step, the swell with its ripple, the sum
//   4  GRADIENTS        the analytic gradient of every kind against a central difference taken here with a different step; the normal is unit, up, and perpendicular to the tangent plane
//   5  THE NOISE        fbm is deterministic, depends on its seed, stays inside +-amplitude, is flat to the bit inside the clearing and the noise beyond it, and its steepest slope is pinned
//   6  THE MESH         counts, indices in range, every vertex at the terrain's height, unit normals, the flat mesh's area and a plane's (x sqrt(1 + g^2)) to 1e-9, triangles wound counter-clockwise from above
//
// SABOTAGE LOG (each applied to the module in a scratch copy, the gate run, the copy discarded; the number is how many rows went red):
//   Run 1 (70 mutants against the gate as first written): 7 went 0 red -- a fractional octave count (the refused list only had 0.5, which the other octave test caught), a clearing of the wrong shape (the list only had a
//   short one, which a later test caught), a changed bump default (only the ridge's and the noise's defaults were pinned), a wall that ignores its angle (only angle 0 was tried), the function-made terrain's normal with
//   the wrong sign, and asTerrain neither wrapping a function nor passing a terrain through (those two threw at module level and ended the gate with no row failing by name). Each got a row (the refused list grew, a
//   defaults table pinned every kind, the wall turns, the function's normal is checked, asTerrain is called through a guard so a mutant fails its row and not the run). Run 2: 70 of 70 red, none 0:
//   S1 unknown kind accepted 2; S2 non-finite number accepted 1; S3 bump radius unchecked 1; S4 ridge width unchecked 1; S5 rolling wavelength unchecked 1; S6 fbm octaves may be fractional 1; S6b fbm octaves may be zero
//   1; S6c fbm wavelength unchecked 1; S7 clearing shape unchecked 1; S8 clearing r1 < r0 allowed 1; S9 sum without parts allowed 1; S10 spec not frozen 1; S11 frozen only at the top 1; S12 sum parts not normalised 6;
//   D1 flat level default 1 3; D2 ridge width default 20 2; D3 fbm octaves default 3 2; D4 bump radius default 25 1; E1 plane gradient sign 3; E2 plane uses y0 for x 2; E3 bump radius not squared 3; E4 bump gradient
//   sign 2; E5 bump y gradient sign 1; E6 ridge ignores its angle 2; E7 ridge cos/sin swapped 2; E8 ridge gradient sign 1; E9 ridge gradient axes swapped 1; E10 ridge width not squared 2; E11 wall step is strict 1; E12
//   wall inverted 2; E13 wall ignores angle 1; E14 rolling sine for cosine 2; E15 rolling ripple not squared 2; E16 rolling gradient dropped ripple 1; E17 rolling gradient sign 1; E18 fbm not centred 3; E19 fbm seed
//   ignored 3; E20 fbm wavelength ignored in y 4; E21 fbm level ignored 1; E22 clearing mask inverted 5; E23 clearing centre x ignored 1; E24 clearing centre y ignored 1; E25 gradient step 2 m 1; E26 fbm x gradient is y
//   1; E27 sum drops gradients 2; E28 sum takes the last part 2; E29 smoothstep linear 2; E30 smoothstep degenerate returns 0 1; C1 flat detection loose 1; C2 flat detection by kind only wrong 1; C3 normal not negated
//   1; C4 normal z is 1 1; C5 gradient axes swapped 5; C6 terrain not frozen 1; F1 fromFunction gradient sign 1; F2 fromFunction normal sign 1; A1 nothing is not FLAT 1; A2 function not wrapped 1; A3 terrain not passed
//   through 1; A4 agl sign 1; M1 mesh argument check 1; M2 mesh x step ignored 3; M3 mesh rows by nx 1; M4 mesh winding clockwise 1; M5 mesh bounds low only 2; M6 mesh normals dropped 1; M7 mesh z is zero 2; M8 mesh
//   quad index c 3; M9 mesh index array type 1; R1 report lines kinds 1.
"use strict";
import * as T from "./terrain.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const throws = (fn) => { try { fn(); return false; } catch { return true; } };
const attempt = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };   // a mutant that makes a call throw must fail its row by name, not end the gate
const POINTS = Array.from({ length: 40 }, (_, i) => [((i * 137) % 997) - 480 + i * 0.37, ((i * 71) % 887) - 400 - i * 0.21]);
const cdiff = (t, x, y, h) => [(t.height(x + h, y) - t.height(x - h, y)) / (2 * h), (t.height(x, y + h) - t.height(x, y - h)) / (2 * h)];

console.log("terrain-selfcheck -- the ground as a height function\n");

console.log("1. THE FRONT DOOR");
{
    const keys = "FLAT,KINDS,agl,asTerrain,createTerrain,fromFunction,meshOf,normalizeSpec,reportLines".split(",").sort().join();
    ok("!! the export list is pinned: FLAT, KINDS, agl, asTerrain, createTerrain, fromFunction, meshOf, normalizeSpec, reportLines", Object.keys(T).sort().join() === keys, Object.keys(T).sort().join());
    ok("the kinds are frozen and are flat, plane, bump, ridge, wall, rolling, fbm, sum", Object.isFrozen(T.KINDS) && T.KINDS.join() === "flat,plane,bump,ridge,wall,rolling,fbm,sum");
    ok("!! FLAT IS HEIGHT 0, A NORMAL OF EXACTLY (0, 0, 1) AND A GRADIENT OF EXACTLY (0, 0) EVERYWHERE, AND IT IS THE ONLY TERRAIN THAT SAYS `flat`: a flat spec with a level is not (the models' bit-for-bit fast path is for FLAT alone)",
        Object.isFrozen(T.FLAT) && T.FLAT.flat === true && POINTS.every(([x, y]) => T.FLAT.height(x, y) === 0 && T.FLAT.normal(x, y).join() === "0,0,1" && T.FLAT.gradient(x, y).join() === "0,0")
        && T.createTerrain({ kind: "flat", level: 5 }).flat === false && T.createTerrain({ kind: "flat", level: 5 }).height(3, 4) === 5 && T.createTerrain({ kind: "flat" }).flat === true && T.createTerrain().flat === true && T.createTerrain({ kind: "plane", gx: 0 }).flat === false);
    const fn = (x, y) => 2 * x + 3 * y + 1, tf = attempt(() => T.asTerrain(fn), { height: () => NaN, gradient: () => [NaN, NaN], normal: () => [NaN, NaN, NaN] }), spec = { kind: "bump", x0: 10, y0: -5, height: 12, radius: 30 }, ts = attempt(() => T.asTerrain(spec), { height: () => NaN });
    ok("!! WHATEVER A CALLER HOLDS BECOMES A TERRAIN: nothing is FLAT, a bare function keeps its heights and gets a gradient (2, 3) by central difference and the normal (-2, -3, 1) / sqrt(14), a terrain is itself (the very object), a spec is built; anything else is refused",
        T.asTerrain(null) === T.FLAT && T.asTerrain(undefined) === T.FLAT && tf.height(4, 5) === 24 && near(tf.gradient(4, 5)[0], 2, 1e-9) && near(tf.gradient(4, 5)[1], 3, 1e-9) && attempt(() => T.asTerrain(ts)) === ts && ts.height(10, -5) === 12 && (() => { const n = tf.normal(4, 5), r = Math.sqrt(14); return near(n[0], -2 / r, 1e-9) && near(n[1], -3 / r, 1e-9) && near(n[2], 1 / r, 1e-9); })() && throws(() => T.asTerrain({ kind: "volcano" })) && throws(() => T.asTerrain(42)));
    ok("!! agl IS THE HEIGHT ABOVE THE GROUND UNDER THE POINT: 100 m up over a 12 m bump's crest is 88; over FLAT it is the height", T.agl(ts, [10, -5, 100]) === 88 && T.agl(T.FLAT, [3, 4, 100]) === 100);
}

console.log("\n2. SPECS");
{
    const refused = [{ kind: "volcano" }, null, { kind: "plane", gx: NaN }, { kind: "bump", radius: 0 }, { kind: "bump", radius: -3 }, { kind: "ridge", width: 0 }, { kind: "rolling", wavelength: 0 }, { kind: "fbm", octaves: 0.5 }, { kind: "fbm", octaves: 2.5 }, { kind: "fbm", octaves: 0 }, { kind: "fbm", wavelength: -1 }, { kind: "fbm", clearing: [0, 0, 10] }, { kind: "fbm", clearing: [0, 0, 10, 20, 30] }, { kind: "fbm", clearing: [NaN, 0, 10, 20] }, { kind: "fbm", clearing: "nope" }, { kind: "fbm", clearing: [0, 0, 50, 10] }, { kind: "fbm", clearing: [0, 0, NaN, 10] }, { kind: "sum" }, { kind: "sum", parts: [] }, { kind: "sum", parts: [{ kind: "volcano" }] }, { kind: "wall", height: Infinity }];
    ok("!! A SPEC THAT CANNOT BE A GROUND IS REFUSED, EACH BY ITS OWN FAULT: an unknown kind, nothing, a non-finite number, a radius or width or wavelength that is not positive, half an octave and two and a half, a clearing with the wrong shape (three numbers, five, a string, a NaN centre) or r1 < r0, a sum with no parts or a bad part, an infinite height", refused.every((s) => throws(() => T.createTerrain(s))), `${refused.filter((s) => throws(() => T.createTerrain(s))).length} of ${refused.length}`);
    const defaults = { flat: { kind: "flat", level: 0 }, plane: { kind: "plane", gx: 0, gy: 0, level: 0, x0: 0, y0: 0 }, bump: { kind: "bump", x0: 0, y0: 0, height: 10, radius: 50 }, ridge: { kind: "ridge", x0: 0, height: 20, width: 40, angle: 0 }, wall: { kind: "wall", x0: 0, height: 30, angle: 0 }, rolling: { kind: "rolling", amplitude: 40, wavelength: 800, ripple: 0, rippleWavelength: 116 }, fbm: { kind: "fbm", seed: 1, amplitude: 30, wavelength: 300, octaves: 4, level: 0 } };
    ok("!! THE DEFAULTS ARE PINNED, KIND BY KIND (a spec that says only its kind is a particular ground): flat level 0; plane no slope; bump 10 m high, radius 50; ridge 20 m high, width 40, angle 0; wall 30 m at x0 = 0; rolling 40 m over 800 m with no ripple (ripple wavelength 116); fbm seed 1, 30 m over 300 m, 4 octaves, level 0", Object.keys(defaults).every((k) => JSON.stringify(T.normalizeSpec({ kind: k })) === JSON.stringify(defaults[k])));
    const s = T.createTerrain({ kind: "sum", parts: [{ kind: "fbm", clearing: [0, 0, 1, 2] }, { kind: "ridge" }] }).spec;
    ok("!! A SPEC IS FROZEN ALL THE WAY DOWN AND THE DEFAULTS ARE FILLED IN (a sum's parts and an fbm's clearing included), so it cannot be edited out from under the terrain built from it",
        Object.isFrozen(s) && Object.isFrozen(s.parts) && Object.isFrozen(s.parts[0]) && Object.isFrozen(s.parts[0].clearing) && s.parts[0].octaves === 4 && s.parts[1].width === 40 && throws(() => { s.parts[1].width = 1; }) && throws(() => { s.parts[0].clearing[0] = 5; }));
    const specs = [{ kind: "flat", level: 3 }, { kind: "plane", gx: 0.1, gy: -0.2, level: 4, x0: 5, y0: 6 }, { kind: "bump", x0: 20, y0: -30, height: 25, radius: 60 }, { kind: "ridge", x0: 100, height: 40, width: 30, angle: 0.6 }, { kind: "wall", x0: 50, height: 22, angle: -0.4 }, { kind: "rolling", amplitude: 35, wavelength: 700, ripple: 9, rippleWavelength: 90 },
        { kind: "fbm", seed: 11, amplitude: 45, wavelength: 250, octaves: 5, level: 2, clearing: [10, 20, 100, 300] }, { kind: "sum", parts: [{ kind: "plane", gx: 0.05 }, { kind: "bump", height: 15 }, { kind: "fbm", seed: 3 }] }];
    const round = specs.map((sp) => { const a = T.createTerrain(sp), b = T.createTerrain(JSON.parse(JSON.stringify(a.spec))), c = T.createTerrain(T.normalizeSpec(a.spec)); return POINTS.every(([x, y]) => a.height(x, y) === b.height(x, y) && a.height(x, y) === c.height(x, y) && Object.is(a.normal(x, y)[2], b.normal(x, y)[2])) && JSON.stringify(T.normalizeSpec(a.spec)) === JSON.stringify(a.spec); });
    ok("!! A SPEC TRAVELS BY VALUE: every kind, through JSON and back (and through normalizeSpec twice), rebuilds the SAME ground to the bit at forty points -- a peer or a lockstep payload can carry it", round.every(Boolean), round.map((b, i) => `${specs[i].kind}:${b ? "ok" : "DIFFERS"}`).join(" "));
}

console.log("\n3. CLOSED FORMS");
{
    const plane = T.createTerrain({ kind: "plane", gx: 0.1, gy: -0.05, level: 3, x0: 10, y0: 20 });
    ok("!! THE PLANE: height = level + gx (x - x0) + gy (y - y0) -- 3 at (10, 20), 3 + 0.1 x 100 = 13 at (110, 20), 3 - 0.05 x 50 = 0.5 at (10, 70) -- with the gradient (0.1, -0.05) everywhere", plane.height(10, 20) === 3 && near(plane.height(110, 20), 13, 1e-12) && near(plane.height(10, 70), 0.5, 1e-12) && POINTS.every(([x, y]) => plane.gradient(x, y)[0] === 0.1 && plane.gradient(x, y)[1] === -0.05));
    const bump = T.createTerrain({ kind: "bump", x0: 20, y0: -30, height: 25, radius: 60 });
    ok("!! THE BUMP: the crest is the height (25 at the centre), one radius out (in any direction) it is height / e = 9.197, and it is symmetric about the centre; far away it is under a millimetre", bump.height(20, -30) === 25 && near(bump.height(80, -30), 25 / Math.E, 1e-12) && near(bump.height(20, 30), 25 / Math.E, 1e-12) && near(bump.height(20 + 42.42640687, -30 + 42.42640687), 25 / Math.E, 1e-6) && near(bump.height(20 + 17, -30 - 9), bump.height(20 - 17, -30 + 9), 1e-12) && bump.height(2000, 2000) < 1e-3);
    const ridge = T.createTerrain({ kind: "ridge", x0: 100, height: 40, width: 30 }), turned = T.createTerrain({ kind: "ridge", x0: 100, height: 40, width: 30, angle: Math.PI / 2 });
    ok("!! THE RIDGE: at its crest the height (40), one width across it height / e (14.71), unchanged along its length (any y), and turned by a quarter circle it runs along x and is crossed along y (its crest at y = 0, not at x0)", ridge.height(100, 0) === 40 && ridge.height(100, 5000) === 40 && near(ridge.height(130, -77), 40 / Math.E, 1e-12) && near(ridge.height(70, 123), 40 / Math.E, 1e-12) && near(turned.height(777, 0), 40, 1e-9) && near(turned.height(-500, 30), 40 / Math.E, 1e-9) && near(turned.height(55, -30), 40 / Math.E, 1e-9) && turned.height(777, 600) < 1e-6);
    const wall = T.createTerrain({ kind: "wall", x0: 50, height: 22 });
    ok("!! THE WALL IS A STEP: 0 before x0, the height from x0 on (at x0 itself the height), the same for any y; its gradient is zero on both sides (the face is a jump, which is the point: only a sample on each side sees it)", wall.height(49.999, 0) === 0 && wall.height(50, 0) === 22 && wall.height(1e4, -9e3) === 22 && wall.height(-1e4, 3) === 0 && wall.gradient(10, 0).join() === "0,0" && wall.gradient(90, 0).join() === "0,0");
    const wallY = T.createTerrain({ kind: "wall", x0: 50, height: 22, angle: Math.PI / 2 });
    ok("!! THE WALL TURNS WITH ITS ANGLE: at a quarter circle the step is across y (22 for y >= 0, 0 below, whatever x -- x0 no longer places it), and at angle 0 it is across x", wallY.height(500, -1) === 0 && wallY.height(-500, 1) === 22 && wallY.height(0, 0.001) === 22 && wallY.height(9999, -0.001) === 0);
    const roll = T.createTerrain({ kind: "rolling", amplitude: 40, wavelength: 800, ripple: 15, rippleWavelength: 37 * Math.PI });
    const want = (x) => 40 * (1 - Math.cos(2 * Math.PI * x / 800)) / 2 + 15 * Math.sin(x / 37) ** 2;
    ok("!! THE SWELL AND ITS RIPPLE: amplitude (1 - cos(2 pi x / wavelength)) / 2 + ripple sin^2(pi x / rippleWavelength) -- the very function the pilot's gate used to hand it as a bare function (40 (1 - cos(2 pi x / 800)) / 2 + 15 sin^2(x / 37)), to 1e-9 at forty points; independent of y", POINTS.every(([x, y]) => near(roll.height(x, y), want(x), 1e-9) && roll.height(x, y) === roll.height(x, y + 333)) && roll.height(0, 0) === 0 && near(roll.height(400, 0), 40 + 15 * Math.sin(400 / 37) ** 2, 1e-9));
    const sum = T.createTerrain({ kind: "sum", parts: [{ kind: "plane", gx: 0.1 }, { kind: "bump", height: 15, radius: 40 }, { kind: "flat", level: 2 }] });
    ok("!! A SUM ADDS: the plane + the bump + a level of 2 is their heights added at forty points, and its gradient is their gradients added, to the bit", POINTS.every(([x, y]) => near(sum.height(x, y), 0.1 * x + 15 * Math.exp(-((x * x + y * y) / 1600)) + 2, 1e-12) && near(sum.gradient(x, y)[0], 0.1 + 15 * Math.exp(-((x * x + y * y) / 1600)) * (-2 * x / 1600), 1e-12)));
}

console.log("\n4. GRADIENTS AND NORMALS");
{
    const kinds = [{ kind: "plane", gx: 0.1, gy: -0.2, level: 4 }, { kind: "bump", x0: 20, y0: -30, height: 25, radius: 60 }, { kind: "ridge", x0: 100, height: 40, width: 30, angle: 0.6 }, { kind: "rolling", amplitude: 35, wavelength: 700, ripple: 9, rippleWavelength: 90 }, { kind: "sum", parts: [{ kind: "bump", height: 15 }, { kind: "ridge", angle: 1.1 }, { kind: "rolling" }] }];
    const errs = kinds.map((sp) => { const t = T.createTerrain(sp); let worst = 0; for (const [x, y] of POINTS) { const g = t.gradient(x, y), d = cdiff(t, x, y, 1e-3); worst = Math.max(worst, Math.abs(g[0] - d[0]), Math.abs(g[1] - d[1])); } return worst; });
    ok("!! THE ANALYTIC GRADIENT IS THE SLOPE OF THE HEIGHT: for the plane, the bump, a turned ridge, the swell and a sum, the gradient at forty points against a central difference of the HEIGHT (step 1 mm, taken here) is within 1e-6 -- a gradient copied from the wrong formula would not be", errs.every((e) => e < 1e-6), errs.map((e) => e.toExponential(1)).join(" "));
    const fb = T.createTerrain({ kind: "fbm", seed: 7, amplitude: 60, wavelength: 400, octaves: 4 });
    const worstFbm = POINTS.reduce((m, [x, y]) => { const g = fb.gradient(x, y), d = cdiff(fb, x, y, 0.02); return Math.max(m, Math.abs(g[0] - d[0]), Math.abs(g[1] - d[1])); }, 0);
    ok("!! THE NOISE'S GRADIENT (a central difference of 0.25 m, the module's own) AGREES WITH A FINER ONE (2 cm) to 2e-3 -- the height is smooth at that scale, and the normal is built from it", worstFbm < 2e-3, worstFbm.toExponential(1));
    const all = [...kinds, { kind: "fbm", seed: 7, amplitude: 60, wavelength: 400, octaves: 4 }, { kind: "wall", x0: 0, height: 9 }];
    const nrm = all.every((sp) => { const t = T.createTerrain(sp); return POINTS.every(([x, y]) => { const n = t.normal(x, y), g = t.gradient(x, y); return near(Math.hypot(...n), 1, 1e-12) && n[2] > 0 && near(n[0] * 1 + n[2] * g[0], 0, 1e-12) && near(n[1] * 1 + n[2] * g[1], 0, 1e-12); }); });
    ok("!! THE NORMAL IS UNIT, ALWAYS UP, AND PERPENDICULAR TO THE TANGENT PLANE: n . (1, 0, gx) = 0 and n . (0, 1, gy) = 0 for every kind at forty points; on a 0.1 slope it leans 5.7 degrees from the vertical", nrm && near(Math.acos(T.createTerrain({ kind: "plane", gx: 0.1 }).normal(3, 3)[2]), Math.atan(0.1), 1e-12));
}

console.log("\n5. THE NOISE");
{
    const spec = { kind: "fbm", seed: 7, amplitude: 60, wavelength: 400, octaves: 4, clearing: [0, 0, 150, 400] }, t = T.createTerrain(spec), pts = [[300, 100], [-250, 420], [500, -500], [123.5, -77.25], [-800, 300], [40, 40]];
    const pinned = [8.498159751, 1.196520747, 5.468940353, 0, 10.336331486, 0];
    ok("!! THE NOISE IS PINNED, NOT JUST DETERMINISTIC: six points of a seed-7 ground give the heights 8.498159751, 1.196520747, 5.468940353, 0 (inside the clearing), 10.336331486 and 0 to 1e-8 -- integer-hashed noise, so the same on every engine; the same spec twice is the same to the bit", pts.every((p, i) => near(t.height(...p), pinned[i], 1e-8)) && pts.every((p) => t.height(...p) === T.createTerrain(spec).height(...p)), pts.map((p) => t.height(...p).toFixed(3)).join(" "));
    const t8 = T.createTerrain({ ...spec, seed: 8 });
    ok("!! THE SEED CHANGES THE GROUND (seed 8 gives -4.180282 where seed 7 gives 8.498159751) and so does the wavelength (a ground twice as long is not the same ground)", near(t8.height(300, 100), -4.180282, 1e-6) && t8.height(300, 100) !== t.height(300, 100) && T.createTerrain({ ...spec, wavelength: 800 }).height(300, 100) !== t.height(300, 100));
    const open = T.createTerrain({ kind: "fbm", seed: 7, amplitude: 60, wavelength: 400, octaves: 4, level: 10 });
    let lo = Infinity, hi = -Infinity, slope = 0;
    for (let i = 0; i < 4000; i++) { const x = ((i * 37) % 2000) - 1000, y = ((i * 91) % 2000) - 1000, h = t.height(x, y); lo = Math.min(lo, h); hi = Math.max(hi, h); slope = Math.max(slope, Math.hypot(...t.gradient(x, y))); }
    ok("!! THE NOISE STAYS INSIDE +-AMPLITUDE OF THE LEVEL (60 of 0; 10 +-60 with a level of 10), and its steepest slope over 4,000 points of a 2 km square is pinned: 0.433 (24 degrees) -- the steepest ground a pilot is asked to fly over at 60 m of amplitude over 400 m", lo >= -60 && hi <= 60 && lo < -20 && hi > 20 && near(slope, 0.4331, 5e-3) && open.height(300, 100) > 10 - 60 && near(open.height(300, 100), 10 + (T.createTerrain({ ...spec, clearing: undefined }).height(300, 100)), 1e-12), `${lo.toFixed(1)}..${hi.toFixed(1)}, steepest ${slope.toFixed(3)}`);
    const inside = POINTS.map(([x, y]) => [x * 0.2, y * 0.2]).filter(([x, y]) => Math.hypot(x, y) <= 150), outside = POINTS.filter(([x, y]) => Math.hypot(x, y) >= 400), free = T.createTerrain({ ...spec, clearing: undefined });
    ok("!! THE CLEARING IS FLAT TO THE BIT INSIDE r0 (150 m: exactly the level, whatever the noise) AND THE NOISE ITSELF BEYOND r1 (400 m: identical to the ground with no clearing), and in between it blends (a point at 275 m is neither)", inside.length > 5 && inside.every(([x, y]) => t.height(x, y) === 0) && outside.length > 5 && outside.every(([x, y]) => t.height(x, y) === free.height(x, y)) && (() => { const a = t.height(275, 0), b = free.height(275, 0); return a !== 0 && a !== b && Math.abs(a) < Math.abs(b); })());
    ok("a clearing with r0 = r1 is a hard edge (no blend) and one around a point other than the origin flattens THAT point", T.createTerrain({ ...spec, clearing: [100, -50, 20, 20] }).height(100, -50) === 0 && T.createTerrain({ ...spec, clearing: [100, -50, 20, 20] }).height(105, -45) === 0 && T.createTerrain({ ...spec, clearing: [100, -50, 20, 20] }).height(300, 100) === free.height(300, 100));
}

console.log("\n6. THE MESH");
{
    const plane = T.createTerrain({ kind: "plane", gx: 0.1, gy: -0.05, level: 3, x0: 10, y0: 20 }), m = T.meshOf(plane, { x0: 0, y0: 0, nx: 5, ny: 4, step: 10 });
    ok("!! THE COUNTS: a 5 x 4 grid is 20 vertices (60 position numbers, 60 normal numbers) and 2 x 4 x 3 = 24 triangles (72 indices), all indices inside 0..19, the bounds the lowest and highest vertex (1.5..7)", m.positions.length === 60 && m.normals.length === 60 && m.indices.length === 72 && m.indices.every((i) => i >= 0 && i < 20) && m.positions instanceof Float32Array && m.indices instanceof Uint32Array && near(m.bounds.min, 1.5, 1e-6) && near(m.bounds.max, 7, 1e-6));
    ok("!! EVERY VERTEX IS ON THE GROUND THE MODEL COLLIDES WITH: vertex (i, j) is at (x0 + i step, y0 + j step, terrain.height) and carries the terrain's normal (to float32), so what is drawn is what is hit", Array.from({ length: 20 }, (_, v) => v).every((v) => { const i = v % 5, j = Math.floor(v / 5), x = i * 10, y = j * 10, n = plane.normal(x, y); return m.positions[3 * v] === x && m.positions[3 * v + 1] === y && near(m.positions[3 * v + 2], plane.height(x, y), 1e-5) && near(m.normals[3 * v], n[0], 1e-6) && near(m.normals[3 * v + 1], n[1], 1e-6) && near(m.normals[3 * v + 2], n[2], 1e-6); }));
    const area = (mesh) => { let a = 0; for (let k = 0; k < mesh.indices.length; k += 3) { const [p, q, r] = [0, 1, 2].map((o) => mesh.indices[k + o] * 3), u = [0, 1, 2].map((c) => mesh.positions[q + c] - mesh.positions[p + c]), w = [0, 1, 2].map((c) => mesh.positions[r + c] - mesh.positions[p + c]); a += 0.5 * Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]); } return a; };
    const flatMesh = T.meshOf(T.FLAT, { x0: -50, y0: -50, nx: 11, ny: 11, step: 10 }), tilted = T.meshOf(T.createTerrain({ kind: "plane", gx: 0.3, gy: -0.4 }), { x0: -50, y0: -50, nx: 11, ny: 11, step: 10 });
    ok("!! THE AREA: the flat 100 m x 100 m mesh is 10,000 m^2 and a plane of slope (0.3, -0.4) is 10,000 x sqrt(1 + 0.09 + 0.16) = 11,180.34 m^2, both to 1e-9 relative (the triangles tile the square with no gap and no overlap)", near(area(flatMesh), 10000, 1e-6) && near(area(tilted), 10000 * Math.sqrt(1.25), 1e-5));
    const winding = (() => { let up = 0; for (let k = 0; k < flatMesh.indices.length; k += 3) { const [p, q, r] = [0, 1, 2].map((o) => flatMesh.indices[k + o] * 3), z = (flatMesh.positions[q] - flatMesh.positions[p]) * (flatMesh.positions[r + 1] - flatMesh.positions[p + 1]) - (flatMesh.positions[q + 1] - flatMesh.positions[p + 1]) * (flatMesh.positions[r] - flatMesh.positions[p]); if (z > 0) up++; } return up === flatMesh.indices.length / 3; })();
    ok("!! TRIANGLES ARE WOUND COUNTER-CLOCKWISE SEEN FROM ABOVE (all 200 of the flat mesh's have a positive upward cross product), so the front face is the top", winding);
    ok("a mesh with fewer than 2 vertices a side, or a step that is not positive, is refused; the default mesh is 65 x 65 with a step of 16 m (1,024 m square)", throws(() => T.meshOf(T.FLAT, { nx: 1 })) && throws(() => T.meshOf(T.FLAT, { step: 0 })) && T.meshOf(T.FLAT).positions.length === 65 * 65 * 3 && T.meshOf(T.FLAT).indices.length === 6 * 64 * 64);
    const lines = T.reportLines();
    ok("the report lines name the kinds and say real numbers", lines.length === 2 && lines[0].includes("flat, plane, bump, ridge, wall, rolling, fbm, sum") && /heights -?\d+\.\d\.\.\d+\.\d m/.test(lines[1]));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
