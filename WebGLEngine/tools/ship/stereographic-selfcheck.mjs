// WebGLEngine/tools/ship/stereographic-selfcheck.mjs -- v4463
//
// Run: node tools/ship/stereographic-selfcheck.mjs
//
// Grades render/stereographic.js -- the spherical member of the projection family render/panini.js has been
// naming since v2571 as "the cylindrical analog of the stereographic projection of a sphere".
//
// *** THE PRIMARY CHECK IS AN IDENTITY AGAINST THE MODULE THAT NAMED IT, NOT A SELF-CONSISTENCY TEST. ***
// panini.js gated itself on a falsifiable identity -- "d = 0 must reproduce x/-z TO THE LAST BIT" -- rather
// than on "the wide view looks nicer". This file does the same one level up: on the horizon, where a cylinder
// and a sphere ARE the same surface, Panini-at-d=1 and stereographic must be the same function, and at every
// other d they must not be. A new module graded only against its own arithmetic proves nothing; this one is
// held against 1,892 versions of already-gated code.
//
// *** AND CONFORMALITY IS ASSERTED THROUGH THE ANALYTIC JACOBIAN, NOT A FINITE DIFFERENCE. *** Both were run
// while building this. A central difference at eps = 1e-6 reports the right angle preserved to 1e-5 degrees;
// the analytic tangent map reports 1e-16. The difference is truncation error, and 1e-5 is large enough to hide
// a real defect of that size -- so the weaker instrument is recorded and the stronger one is what the gate
// stands on. That is this session's recurring lesson (v4448's clock, v4462's own census) applied in advance
// rather than after a sabotage found it.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as S from "../../render/stereographic.js";
import { paniniProject } from "../../render/panini.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const M = S.MEASURED_AT_V4463;

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const n = Math.hypot(...a); return [a[0] / n, a[1] / n, a[2] / n]; };
const DEG = 180 / Math.PI;

// ---- 1. *** THE IDENTITY WITH panini.js, WHICH IS WHAT MAKES "ANALOG" A MEASUREMENT *** ---------------------
{
    const horizon = (th) => [Math.sin(th), 0, -Math.cos(th)];
    let worst = 0, worstDeg = 0;
    for (let deg = 0; deg < 180; deg++) {
        const th = deg / DEG;
        const p = paniniProject(...horizon(th), 1), s = S.stereoProject(...horizon(th));
        if (!p || !s) continue;
        const d = Math.abs(p[0] - s[0]);
        if (d > worst) { worst = d; worstDeg = deg; }
    }
    say(`panini d=1 against stereographic over 180 azimuths on the horizon: max |diff| ${worst.toExponential(2)} at ${worstDeg} deg`);
    ok("!! *** ON THE HORIZON, PANINI AT d=1 AND STEREOGRAPHIC ARE THE SAME FUNCTION ***",
        worst < M.paniniMaxAbsDiffOnHorizon,
        "panini.js's own primary source calls Panini 'the cylindrical analog of the stereographic projection " +
        "of a sphere'. On the equator a cylinder and a sphere ARE the same surface, and both projections " +
        `reduce to 2*tan(th/2). Measured, not asserted: agreement to ${worst.toExponential(2)} across the whole range`);

    // AND IT MUST FAIL AT EVERY OTHER d, or the check above is satisfied by any monotone curve.
    const gaps = [0.5, 2, 4].map((d) => {
        let g = 0;
        for (let deg = 5; deg < 175; deg += 5) {
            const th = deg / DEG;
            const p = paniniProject(...horizon(th), d), s = S.stereoProject(...horizon(th));
            if (p && s) g = Math.max(g, Math.abs(p[0] - s[0]));
        }
        return { d, g };
    });
    say("  and at other d: " + gaps.map((x) => `d=${x.d} max gap ${x.g.toFixed(4)}`).join(", "));
    ok("...and it holds at d = 1 ALONE, which is what stops the identity being a tautology",
        gaps.every((x) => x.g > M.paniniDisagreeAtHalfD) && M.paniniAgreeD === 1,
        "a check that passed for every d would be satisfied by any two functions that both increase. These " +
        "miss by whole units, in opposite directions, at every angle");
}

// ---- 2. *** CONFORMAL VIA THE ANALYTIC JACOBIAN -- AND PANINI COLLAPSES A RIGHT ANGLE AT THE NADIR *** ------
{
    say("");
    const DIRS = [[0, 0, -1], [0.3, 0.2, -1], [0.7, 0.5, -1], [1, 0.6, -0.6], [1, 1, -0.3], [1, 0.2, 0.4], [0.05, -0.9, 0.3]];
    // Two orthonormal tangents at p, pushed through the ANALYTIC tangent map.
    const frame = (p) => {
        const a = Math.abs(p[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
        const t1 = unit(cross(a, p));
        return [t1, unit(cross(p, t1))];
    };
    let maxAngErr = 0, maxScaleErr = 0;
    for (const raw of DIRS) {
        const p = unit(raw), [t1, t2] = frame(p);
        const g1 = S.stereoTangent(p, t1), g2 = S.stereoTangent(p, t2);
        const n1 = Math.hypot(...g1), n2 = Math.hypot(...g2);
        const c = (g1[0] * g2[0] + g1[1] * g2[1]) / (n1 * n2);
        maxAngErr = Math.max(maxAngErr, Math.abs(Math.acos(Math.max(-1, Math.min(1, c))) * DEG - 90));
        // the SAME scalar in both directions is the whole content of "conformal", and stereoScale must be it
        maxScaleErr = Math.max(maxScaleErr, Math.abs(n1 - n2), Math.abs(n1 - S.stereoScale(...p)));
    }
    say(`analytic Jacobian over ${DIRS.length} directions: right angle preserved to ${maxAngErr.toExponential(2)} deg, ` +
        `isotropy + stereoScale agree to ${maxScaleErr.toExponential(2)}`);
    ok("!! *** STEREOGRAPHIC IS CONFORMAL: THE JACOBIAN IS EXACTLY A SCALAR TIMES A ROTATION ***",
        maxAngErr < M.stereoMaxRightAngleErrorDeg && maxScaleErr < 1e-12,
        "a right angle on the sphere comes out a right angle on the screen, and the magnification is the SAME " +
        "in every direction and equals stereoScale() -- which is what makes a little planet look like a planet " +
        "rather than a smear");

    // THE WEAKER INSTRUMENT, RUN ON PURPOSE SO THE GAP IS ON THE RECORD.
    let fdErr = 0;
    const eps = 1e-6;
    for (const raw of DIRS) {
        const p = unit(raw), [t1, t2] = frame(p), p0 = S.stereoProject(...p);
        if (!p0) continue;
        const g = (t) => { const q = S.stereoProject(p[0] + eps * t[0], p[1] + eps * t[1], p[2] + eps * t[2]);
                           return q && [(q[0] - p0[0]) / eps, (q[1] - p0[1]) / eps]; };
        const g1 = g(t1), g2 = g(t2); if (!g1 || !g2) continue;
        const c = (g1[0] * g2[0] + g1[1] * g2[1]) / (Math.hypot(...g1) * Math.hypot(...g2));
        fdErr = Math.max(fdErr, Math.abs(Math.acos(Math.max(-1, Math.min(1, c))) * DEG - 90));
    }
    ok("!! ...and a FINITE-DIFFERENCE version of that same check is 11 orders of magnitude blunter",
        fdErr > 1e-7 && fdErr < M.stereoFiniteDiffErrorDeg && fdErr / Math.max(maxAngErr, 1e-18) > 1e6,
        `analytic ${maxAngErr.toExponential(2)} deg against finite-difference ${fdErr.toExponential(2)} deg at ` +
        "eps=1e-6. The blunt one would call a real 1e-5-sized defect conformal. Recorded rather than used");

    // AND PANINI IS NOT CONFORMAL -- which is why these are two projections and not one.
    let paniniMax = 0, paniniWhere = null;
    for (const raw of DIRS) {
        const p = unit(raw), [t1, t2] = frame(p), p0 = paniniProject(...p, 1);
        if (!p0) continue;
        const g = (t) => { const q = paniniProject(p[0] + eps * t[0], p[1] + eps * t[1], p[2] + eps * t[2], 1);
                           return q && [(q[0] - p0[0]) / eps, (q[1] - p0[1]) / eps]; };
        const g1 = g(t1), g2 = g(t2); if (!g1 || !g2) continue;
        const c = (g1[0] * g2[0] + g1[1] * g2[1]) / (Math.hypot(...g1) * Math.hypot(...g2));
        const e = Math.abs(Math.acos(Math.max(-1, Math.min(1, c))) * DEG - 90);
        if (e > paniniMax) { paniniMax = e; paniniWhere = raw; }
    }
    say(`  panini d=1, same frames, same eps: worst ${paniniMax.toFixed(3)} deg off a right angle at ${JSON.stringify(paniniWhere)}`);
    ok("!! *** AND PANINI COLLAPSES A RIGHT ANGLE TO TWO DEGREES AT THE NADIR -- WHERE A LITTLE PLANET LOOKS ***",
        Math.abs(paniniMax - M.paniniMaxRightAngleErrorDeg) < 0.01 && paniniMax > 85 &&
        JSON.stringify(paniniWhere) === JSON.stringify(M.paniniWorstDir),
        "the two agree EXACTLY on the horizon and are different KINDS of map off it, and the worst direction " +
        "is not an outlier: panini's height term is y/hypot(x,z), which diverges at the poles. A little planet " +
        "points straight down, so the cylinder fails hardest exactly where the picture is built");
    ok("...and the oblique sample the first draft mistook for the worst is still what it was",
        DIRS.some((d) => JSON.stringify(d) === "[1,1,-0.3]") && M.paniniObliqueErrorDeg === 35.476,
        "35.476 deg at (1,1,-0.3) is real and was measured over six directions; the seventh direction is 88 " +
        "deg. A frozen number taken over a different sample than the check runs -- v4462's defect, one round on");
}

// ---- 3. EXACT INVERSE, AND THE ONE DIRECTION WITH NO IMAGE --------------------------------------------------
{
    say("");
    let worst = 0;
    for (let i = 0; i < 500; i++) {
        // deterministic spread over the plane, including far out where the projection is most magnified
        const a = (i * 2.399963229728653), r = Math.tan((i / 500) * (Math.PI / 2) * 0.999) * 2;
        const u = r * Math.cos(a), v = r * Math.sin(a);
        const p = S.stereoProject(...S.stereoUnproject(u, v));
        if (!p) { worst = Infinity; break; }
        worst = Math.max(worst, Math.abs(p[0] - u) / (1 + Math.abs(u)), Math.abs(p[1] - v) / (1 + Math.abs(v)));
    }
    say(`project(unproject(p)) over 500 plane points out to radius ${(Math.tan((499/500)*(Math.PI/2)*0.999)*2).toFixed(0)}: max relative error ${worst.toExponential(2)}`);
    ok("the inverse is exact, not fitted -- it is derived from |N + t(Q-N)| = 1 and it round-trips",
        worst < 1e-12, "a projection whose inverse only approximately inverts it cannot be used to SAMPLE a " +
        "source image, which is the entire application");
    ok("!! and the one direction with no image returns null rather than a plausible number",
        S.stereoProject(0, 0, 1) === null && S.stereoProject(0, 0, 2) === null && S.stereoProject(0, 0, 0) === null,
        "straight behind is the projection pole itself. panini.js: 'returning a huge number would look like " +
        "geometry and would poison any average computed over it' -- the same reasoning, the same answer");
    // paniniHorizon(0.5) is acos(-0.5) = 120 deg. The FIRST draft of this check used (1,0,0.5), whose azimuth
    // is 116.57 deg -- INSIDE the horizon, so panini returned a number and the check failed. (1,0,1) is 135 deg.
    ok("...and stereographic has NO horizon, which is exactly where it differs from Panini in reach",
        S.stereoProject(1, 0, 0.999999) !== null && paniniProject(1, 0, 1, 0.5) === null &&
        paniniProject(1, 0, 0.5, 0.5) !== null,
        "paniniHorizon(d) cuts the image off at acos(-d) for d < 1 -- past it there is no image at all. This " +
        "maps every direction but one, which is why it can wrap a whole sphere into a disc");
}

// ---- 4. THE LITTLE PLANET: THREE LANDMARKS, THROUGH THE EXACT PATH -----------------------------------------
{
    say("");
    const nadir = S.littlePlanetDir(0, 0);
    const horizonLat = S.littlePlanetLonLat(M.horizonRadius, 0)[1];
    const far = S.littlePlanetLonLat(1e7, 0)[1] * DEG;
    say(`nadir ${JSON.stringify(nadir.map((v) => +v.toFixed(15)))}, lat at radius 2 = ${horizonLat}, lat at radius 1e7 = ${far.toFixed(6)} deg`);
    ok("!! the three landmarks are EXACT through the trig-free path: nadir at the centre, horizon at radius 2",
        nadir[0] === 0 && nadir[1] === -1 && nadir[2] === 0 && horizonLat === 0 &&
        M.nadirLatDeg === -90 && far > 89.99 && far < 90,
        "radius 0 is straight down, radius 2 is the horizon exactly (2*tan(45 deg)), and the zenith is " +
        "approached and never reached -- which is why a little planet has sky at its edge and no seam");

    // *** THE ULP, MEASURED AND NOT GLOSSED. ***
    const viaTrig = S.stereoRadiusFor(Math.PI / 2);
    const ulps = Math.round((M.horizonRadius - viaTrig) / Number.EPSILON);
    say(`  same landmark, two paths: stereoProject(1,0,0) = ${S.stereoProject(1, 0, 0)[0]}, stereoRadiusFor(PI/2) = ${viaTrig}  (${ulps} ulp)`);
    ok("!! and the trig path misses that same landmark by ONE ULP, which is why the construction avoids trig",
        S.stereoProject(1, 0, 0)[0] === 2 && viaTrig === M.horizonRadiusViaTrig && ulps === M.horizonRadiusUlpGap,
        "u = 2x/(1-z) at z=0 is just 2x and lands on the integer; 2*tan(Math.PI/4) does not, because Math.PI/2 " +
        "is not pi/2. The gate asserts landmarks through the exact path and holds the helper to a tolerance, " +
        "rather than using whichever one happens to pass");

    // ---- *** THE HANDEDNESS CHECK, REBUILT AFTER SABOTAGE F COST ZERO RED *** -----------------------------
    // The first draft computed a determinant from a HARD-CODED COPY of the rotation, written out again inside
    // this gate: `[[1,0,0],[0,1,0],[0,0,1]].map(e => [e[0], e[2], -e[1]])`. Turning littlePlanetDir into a
    // REFLECTION changed nothing, because the check never called it -- a second copy of a function cannot
    // disagree with the first. And the landmarks above are blind to the flip by construction: the nadir has
    // y = 0 after rotation and so does the horizon, so both survive a mirror untouched, exactly as the old
    // comment here predicted they would. It predicted the failure and then failed to test for it.
    //
    // So: probe the REAL function. Three screen points, their true unprojected directions, and their images.
    // A rotation preserves the signed volume of any three vectors; a reflection negates it.
    const probes = [[0.6, 0.2], [-1.4, 0.9], [0.3, -2.1]];
    const src3 = probes.map((p) => S.stereoUnproject(...p));
    const img3 = probes.map((p) => S.littlePlanetDir(...p));
    const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
                      - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
                      + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const dSrc = det3(src3), dImg = det3(img3);
    // and it must be an ISOMETRY too, or "rotation" is the wrong word for it
    let lenErr = 0, dotErr = 0;
    for (let i = 0; i < 3; i++) {
        lenErr = Math.max(lenErr, Math.abs(Math.hypot(...src3[i]) - Math.hypot(...img3[i])));
        for (let j = i + 1; j < 3; j++) {
            const a = src3[i][0] * src3[j][0] + src3[i][1] * src3[j][1] + src3[i][2] * src3[j][2];
            const b = img3[i][0] * img3[j][0] + img3[i][1] * img3[j][1] + img3[i][2] * img3[j][2];
            dotErr = Math.max(dotErr, Math.abs(a - b));
        }
    }
    say(`  handedness probed through littlePlanetDir itself: signed volume ${dSrc.toFixed(9)} -> ${dImg.toFixed(9)}`);
    ok("!! the nadir map is a PROPER rotation -- probed through the real function, not a copy of it",
        Math.abs(dImg - dSrc) < 1e-12 && Math.abs(dSrc) > 1e-3 && lenErr < 1e-12 && dotErr < 1e-12,
        "signed volume preserved (a reflection negates it), lengths preserved, angles preserved. The first " +
        "draft of this check re-typed the matrix and could not see a mirror; the landmarks cannot either, " +
        "because both of them have y = 0 after the rotation");

    let llWorst = 0;
    for (let i = 0; i < 200; i++) {
        const lon = -Math.PI + (2 * Math.PI * i) / 200, lat = -Math.PI / 2 + (Math.PI * ((i * 7) % 200)) / 200;
        const [lo, la] = S.dirToLonLat(...S.lonLatToDir(lon, lat));
        const dl = Math.abs(Math.atan2(Math.sin(lo - lon), Math.cos(lo - lon)));
        llWorst = Math.max(llWorst, Math.abs(la - lat), Math.abs(Math.cos(lat)) > 1e-9 ? dl : 0);
    }
    ok("the equirectangular pair round-trips, so a little planet can actually SAMPLE a baked sphere",
        llWorst < 1e-12,
        `${llWorst.toExponential(2)} over 200 lon/lat pairs. world/procPlanet.js already bakes an ` +
        "equirectangular texture, so the consumer for this projection existed before the projection did");
}

// ---- 5. *** THE SHADER IS RUN AND COMPARED BY VALUE, NOT GREPPED *** ---------------------------------------
//
// The first draft of this section spot-checked a few substrings of stereoGLSL(). SABOTAGE M CHANGED A CONSTANT
// NONE OF THEM COVERED -- `(s - 4.0)/(s + 4.0)` became `(s - 3.0)/(s + 3.0)`, the unproject returned a
// different sphere, and the gate reported all pass. A regex over shader text tests the regexes, not the shader.
//
// #118 already settled the idiom for this tree: "the JS and GLSL Ashima simplex are NOT the same function, and
// no gate has ever compared their VALUES". So the GLSL is mechanically rewritten into JS here and the two are
// compared numerically. This is still not a GPU -- the rewrite is textual and a real driver could differ -- but
// it is a comparison of behaviour rather than of spelling, and it catches a changed constant anywhere.
{
    say("");
    const glsl = S.stereoGLSL();
    // The rewrite, deliberately small and explicit. Anything it fails to handle throws, and a throw fails the
    // check -- it must never silently fall back to "close enough".
    const js = glsl
        .replace(/^\/\/.*$/gm, "")
        .replace(/\bvec2 (\w+)\(vec3 (\w+)\)/g, "function $1($2)")
        .replace(/\bvec3 (\w+)\(vec2 (\w+)\)/g, "function $1($2)")
        .replace(/\b(vec2|vec3|float)\s+(\w+)\s*=/g, "const $2 =")
        .replace(/\breturn vec2\(([^;]*)\);/g, "return [$1];")
        .replace(/\breturn vec3\(([^;]*)\);/g, "return [$1];")
        .replace(/\b(\w+)\.x\b/g, "$1[0]").replace(/\b(\w+)\.y\b/g, "$1[1]").replace(/\b(\w+)\.z\b/g, "$1[2]");
    const prelude = "const normalize=(v)=>{const n=Math.hypot(v[0],v[1],v[2]);return [v[0]/n,v[1]/n,v[2]/n];};" +
                    "const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];";
    let P = null, U = null, buildErr = null;
    try {
        const f = new Function(prelude + js + "; return {stereoProject, stereoUnproject};");
        ({ stereoProject: P, stereoUnproject: U } = f());
    } catch (e) { buildErr = String(e && e.message).slice(0, 90); }
    ok("the GLSL rewrites into runnable JS at all -- a rewrite that throws must FAIL, never pass quietly",
        typeof P === "function" && typeof U === "function", buildErr || "both functions built from the shader text");

    if (P && U) {
        let worstP = 0, worstU = 0, n = 0;
        for (let i = 0; i < 240; i++) {
            const a = i * 2.399963229728653, r = 0.2 + (i % 40) * 0.17;
            const dir = [r * Math.cos(a), r * Math.sin(a) * 0.8, -1 + (i % 7) * 0.28];
            const jsP = S.stereoProject(...dir), gP = P(dir);
            if (jsP && Number.isFinite(gP[0]) && Math.abs(gP[0]) < 1e8) {
                worstP = Math.max(worstP, Math.abs(jsP[0] - gP[0]), Math.abs(jsP[1] - gP[1]));
                n++;
            }
            const pt = [Math.cos(a) * r * 3, Math.sin(a) * r * 3];
            const jsU = S.stereoUnproject(...pt), gU = U(pt);
            worstU = Math.max(worstU, ...[0, 1, 2].map((k) => Math.abs(jsU[k] - gU[k])));
        }
        say(`  shader-as-JS against the module over ${n} directions and 240 plane points: ` +
            `project max |diff| ${worstP.toExponential(2)}, unproject ${worstU.toExponential(2)}`);
        ok("!! *** THE SHADER AND THE MODULE ARE THE SAME FUNCTION, COMPARED BY VALUE ***",
            n > 100 && worstP < 1e-14 && worstU < 1e-14,
            "#118's rule, applied here: a regex over shader text tests the regexes. Sabotage M changed a " +
            "constant no regex covered and cost ZERO RED; this reads every constant by running them");
        ok("...and the no-image branch agrees too, at the one direction that has none",
            Math.abs(P([0, 0, 1])[0]) >= 1e9 && S.stereoProject(0, 0, 1) === null,
            "GLSL has no null, so it returns a sentinel -- 1e9 in the shader against null in the JS. The " +
            "shapes differ ON PURPOSE and both refuse; that difference is declared rather than smoothed over");
    }

    const src = fs.readFileSync(path.join(ENG, "render", "stereographic.js"), "utf8");
    const noComments = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    ok("...and the JS itself really is trig-free in its CORE, which is the claim the ulp check rests on",
        !/Math\.(tan|atan|sin|cos)\(/.test(noComments.slice(noComments.indexOf("export function stereoProject"),
                                                            noComments.indexOf("export function stereoRadiusFor"))),
        "comments stripped before asserting the idiom -- commentFalsePass's rule. stereoProject, " +
        "stereoUnproject, stereoScale and stereoTangent contain no trigonometry; only the convenience " +
        "helpers below them do, and those are the ones that miss the landmark by an ulp");
    say("  STILL NOT CLAIMED: that a GPU agrees. The rewrite is textual and a real driver may differ in " +
        "precision or in normalize(); the shader's actual output needs a screenshot on the rig.");
}

console.log("stereographic-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
