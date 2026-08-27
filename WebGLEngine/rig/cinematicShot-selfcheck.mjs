// WebGLEngine/rig/cinematicShot-selfcheck.mjs — v4053
//
// Run: node rig/cinematicShot-selfcheck.mjs   (~0.3s MEASURED; no browser, no GPU, no network)
//
// GRADES rig/cinematicShot.js, the parametric camera move Keith asked for after
// Makio64/threejs-cinematic-world-zoom ("could we for example tack on ..."). The repo itself could not be
// adopted -- Vite build, a mandatory Google/Cesium tile key, a hard three@0.185.1 pin -- so the TECHNIQUE was
// reimplemented, and a reimplemented technique is exactly the kind of claim that has to be measured rather than
// asserted. Everything below is arithmetic over fixtures, which is why it needs no GPU: the module takes a
// scalar t and returns a camera, with no canvas, no DOM and no GL anywhere in it.
//
// THE FOUR CLAIMS ON TRIAL:
//   1. mixLog gives a constant PERCEIVED zoom rate, and linear interpolation demonstrably does not.
//   2. The rig is orthonormal and singularity-free AT straight-down, where lookAt's own basis collapses.
//   3. Every shot channel is a pure function of t that actually reaches both endpoints.
//   4. A descent onto the REAL procedural planet ends ABOVE the ground, not inside a mountain -- checked
//      against world/planetSurface.js's surfaceRadiusAt(), the same formula es-box3d-fly3d.html displaces its
//      mesh with. That check is the reason the formula was extracted rather than copied.
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const S = await import(pathToFileURL(path.join(HERE, "cinematicShot.js")).href);
const PS = await import(pathToFileURL(path.join(ROOT, "world", "planetSurface.js")).href);
const PP = await import(pathToFileURL(path.join(ROOT, "world", "procPlanet.js")).href);

const len3 = (v) => Math.hypot(v[0], v[1], v[2]);
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

console.log("cinematicShot-selfcheck -- a camera move as arithmetic, graded without a GPU\n");

console.log("1. *** LOGARITHMIC DISTANCE: A CONSTANT PERCEIVED ZOOM RATE ***");
{
    ok("!! mixLog hits both endpoints exactly",
        Math.abs(S.mixLog(20000, 2, 0) - 20000) < 1e-9 && Math.abs(S.mixLog(20000, 2, 1) - 2) < 1e-9,
        "a shot that does not start where it was told to start is a cut, not a move");

    // *** THE IDENTITY. *** Equal steps of t must MULTIPLY the distance by equal factors. That is what "constant
    // perceived zoom rate" means, and it is checkable to machine precision rather than by eye.
    const ratios = [];
    for (let i = 0; i < 10; i++) ratios.push(S.mixLog(20000, 2, (i + 1) / 10) / S.mixLog(20000, 2, i / 10));
    const spread = Math.max(...ratios) - Math.min(...ratios);
    ok("!! *** equal steps of t multiply the distance by EQUAL factors (to machine precision) ***",
        spread < 1e-12, "10 successive ratios spread by " + spread.toExponential(2) +
        "; each step is x" + ratios[0].toFixed(4) + " -- THIS is the constant perceived zoom rate");

    // and the negative that says why it matters: linear does the opposite, measurably.
    const linHalf = 20000 + (2 - 20000) * 0.5, logHalf = S.mixLog(20000, 2, 0.5);
    const linProgress = Math.log(20000 / linHalf) / Math.log(20000 / 2);   // fraction of the ZOOM done, not of the distance
    ok("!! ...and linear interpolation is a STALL then a SLAM, which is the bug this replaces",
        logHalf < 300 && linProgress < 0.12,
        "at t=0.5: linear sits at " + linHalf.toFixed(0) + " (only " + (linProgress * 100).toFixed(1) +
        "% of the zoom done for 50% of the shot); mixLog sits at " + logHalf.toFixed(1) + " (exactly half)");

    ok("...and a zero/negative endpoint is clamped rather than returning NaN",
        Number.isFinite(S.mixLog(0, 10, 0.5)) && Number.isFinite(S.mixLog(10, 0, 0.5)),
        "log(0) is -Infinity; a NaN camera shows up as a black frame, not as an error");
}

console.log("\n2. *** THE RIG IS ORTHONORMAL AND SURVIVES STRAIGHT-DOWN, WHERE lookAt DOES NOT ***");
{
    const center = [0, 0, 0], target = [0, 0, 17];
    let worstOrtho = 0, worstUnit = 0, worstDist = 0, worstAim = 0;
    for (let i = 0; i <= 200; i++) {
        const pitch = -Math.PI / 2 + (i / 200) * Math.PI;          // straight down through straight up
        for (const az of [0, 1.1, 2.7, -2.0]) {
            const r = S.orbitRig({ center, target, distance: 40, pitch, azimuth: az });
            worstUnit = Math.max(worstUnit, Math.abs(len3(r.forward) - 1), Math.abs(len3(r.up) - 1), Math.abs(len3(r.right) - 1));
            worstOrtho = Math.max(worstOrtho, Math.abs(dot3(r.forward, r.up)), Math.abs(dot3(r.forward, r.right)), Math.abs(dot3(r.up, r.right)));
            worstDist = Math.max(worstDist, Math.abs(len3(sub3(r.eye, target)) - 40));
            // forward must actually point from the eye at the target
            const aim = S.norm3(sub3(target, r.eye));
            worstAim = Math.max(worstAim, len3(sub3(aim, r.forward)));
        }
    }
    ok("!! the basis is orthonormal at every pitch from straight-down to straight-up",
        worstOrtho < 1e-12 && worstUnit < 1e-12,
        "worst |dot| " + worstOrtho.toExponential(2) + ", worst |len-1| " + worstUnit.toExponential(2) + " over 804 rigs");
    ok("!! ...the eye really is `distance` from the target, and forward really points at it",
        worstDist < 1e-9 && worstAim < 1e-9,
        "worst distance error " + worstDist.toExponential(2) + ", worst aim error " + worstAim.toExponential(2));

    // *** THE LOAD-BEARING NEGATIVE, AND MY FIRST VERSION OF IT AIMED AT THE WRONG PLACE. *** I asserted the
    // collapse at pitch=pi/2 over an EQUATORIAL target and it passed with length 1.0 -- correctly, because
    // lookAt's singularity is NOT "straight down" in the abstract, it is "the view direction is parallel to the
    // REFERENCE up". Straight down over the equator looks along -z while worldUp is +y: no degeneracy at all.
    // The angle that actually breaks lookAt is a POLAR landing site, where the ground's own up IS the world's
    // up -- and a planetary descent picks its landing site freely, so that is a site a real shot will hit. Our
    // rig is built from do/dp and never references worldUp, so it does not distinguish the poles at all.
    const worldUp = [0, 1, 0];
    const pole = [0, 17, 0];                                   // the one place lookAt cannot aim from
    const overPole = S.orbitRig({ center, target: pole, distance: 40, pitch: Math.PI / 2, azimuth: 0 });
    const naive = [
        worldUp[1] * overPole.forward[2] - worldUp[2] * overPole.forward[1],
        worldUp[2] * overPole.forward[0] - worldUp[0] * overPole.forward[2],
        worldUp[0] * overPole.forward[1] - worldUp[1] * overPole.forward[0],
    ];
    ok("!! ...the ideal cross(worldUp, forward) really does vanish there (the singularity is real, not folklore)",
        len3(naive) < 1e-12,
        "length " + len3(naive).toExponential(2) + " at the pole, straight down");

    // ...and the whole pitch sweep stays orthonormal over that same polar site, not just over the equator.
    let poleWorst = 0;
    for (let i = 0; i <= 200; i++) {
        const r = S.orbitRig({ center, target: pole, distance: 40, pitch: -Math.PI / 2 + (i / 200) * Math.PI, azimuth: 0.9 });
        poleWorst = Math.max(poleWorst, Math.abs(dot3(r.forward, r.up)), Math.abs(len3(r.up) - 1));
    }
    ok("!! ...and a full pitch sweep OVER THE POLE stays orthonormal too",
        poleWorst < 1e-12, "worst " + poleWorst.toExponential(2) + " over 201 rigs at the pole");

    // *** THE CHECK THAT ACTUALLY DISCRIMINATES, AND MY FIRST TWO ATTEMPTS DID NOT. *** I first asserted the
    // naive basis "collapses to zero" -- and a sabotage that swapped our up FOR the naive one still PASSED,
    // because in floating point cross(worldUp, forward) at the pole is not 0, it is ~6e-17, which normalizes
    // straight back to a unit vector. The naive rig does not fail loudly. It fails SILENTLY, and the observable
    // symptom is worse than a NaN: MEASURED below, the up vector FLIPS THROUGH 180 DEGREES in a single 1e-3 rad
    // step across straight-down -- the camera rolls upside down as it passes over the pole, its direction on
    // either side decided entirely by rounding error. So the gate computes BOTH rigs itself and contrasts them;
    // no sabotage is needed to show the defect, and this can never quietly pass again.
    const naiveUp = (fwd) => {
        const c1 = [fwd[1] * 0 - fwd[2] * 1, fwd[2] * 0 - fwd[0] * 0, fwd[0] * 1 - fwd[1] * 0];   // forward x worldUp
        const c2 = [c1[1] * fwd[2] - c1[2] * fwd[1], c1[2] * fwd[0] - c1[0] * fwd[2], c1[0] * fwd[1] - c1[1] * fwd[0]];
        return S.norm3(c2);
    };
    let oursJump = 0, naiveJump = 0;
    for (let i = -40; i < 40; i++) {
        const p0 = Math.PI / 2 + i * 1e-3, p1 = p0 + 1e-3;
        const a = S.orbitRig({ center, target: pole, distance: 40, pitch: p0, azimuth: 0.7 });
        const b = S.orbitRig({ center, target: pole, distance: 40, pitch: p1, azimuth: 0.7 });
        oursJump = Math.max(oursJump, len3(sub3(a.up, b.up)));
        naiveJump = Math.max(naiveJump, len3(sub3(naiveUp(a.forward), naiveUp(b.forward))));
    }
    ok("!! *** THE NAIVE worldUp BASIS FLIPS 180 DEGREES CROSSING THE POLE -- ours steps smoothly through it ***",
        naiveJump > 1.9 && oursJump < 1e-2,
        "naive up jumps " + naiveJump.toFixed(4) + " (a full 180deg flip: the camera rolls upside down) against " +
        "ours at " + oursJump.toExponential(2) + ", for the same 1e-3 rad pitch step. THIS is why the rig is " +
        "built from do/dp rather than from a cross product with a reference up");

    // continuity over an EQUATORIAL site too -- the pole is the hard case, but the move must be smooth
    // everywhere, and an equatorial sweep is what a normal landing site actually looks like.
    let worstJump = 0;
    for (let i = -20; i < 20; i++) {
        const p0 = Math.PI / 2 + i * 1e-3, p1 = p0 + 1e-3;
        const a = S.orbitRig({ center, target, distance: 40, pitch: p0, azimuth: 0.7 });
        const b = S.orbitRig({ center, target, distance: 40, pitch: p1, azimuth: 0.7 });
        worstJump = Math.max(worstJump, len3(sub3(a.up, b.up)));
    }
    ok("!! ...and the up vector is CONTINUOUS across straight-down at an ordinary site too",
        worstJump < 1e-2, "worst step " + worstJump.toExponential(2) + " for a 1e-3 rad pitch step across pi/2");
}

console.log("\n3. *** EVERY SHOT CHANNEL IS A PURE FUNCTION OF t THAT REACHES BOTH ENDS ***");
{
    const P = {
        center: [0, 0, 0], target: [0, 0, 17],
        from: { distance: 900, pitch: 0.12, azimuth: 0, fov: 55, roll: 0 },
        to:   { distance: 3,   pitch: 1.05, azimuth: 1.4, fov: 32, roll: 0 },
    };
    for (const name of Object.keys(S.SHOTS)) {
        const sh = S.SHOTS[name];
        const ends = ["dist", "pitch", "az", "fov", "roll"].every((c) => {
            const f = sh[c]; const a = f(0), b = f(1);
            return Math.abs(a) < 1e-12 && (Math.abs(b - 1) < 1e-12 || Math.abs(b) < 1e-12);   // roll holds at 0
        });
        ok("!! shot '" + name + "' has every channel anchored at t=0 and t=1",
            ends, "a channel that does not reach 1 leaves the move short of its stated endpoint");
    }
    // purity: same t twice, byte-identical -- what makes frame-locked seeking possible.
    const a = S.sampleShot("descent", 0.37, P), b = S.sampleShot("descent", 0.37, P);
    ok("!! *** sampling the same t twice gives the SAME frame *** (no hidden state, so a recorder can seek)",
        JSON.stringify(a) === JSON.stringify(b),
        "a shot that depends on call order cannot be rendered frame-locked, which is how the reference records");

    const s0 = S.sampleShot("descent", 0, P), s1 = S.sampleShot("descent", 1, P);
    ok("!! ...and the sampled endpoints match the requested from/to",
        Math.abs(s0.distance - 900) < 1e-9 && Math.abs(s1.distance - 3) < 1e-9 &&
        Math.abs(s1.fov - 32) < 1e-9 && Math.abs(s1.pitch - 1.05) < 1e-9,
        "t=0 -> d " + s0.distance.toFixed(1) + " fov " + s0.fov.toFixed(1) +
        " | t=1 -> d " + s1.distance.toFixed(3) + " fov " + s1.fov.toFixed(1));

    // the distance must fall MONOTONICALLY on a descent -- a camera that backs up mid-dive is not a dive.
    let mono = true, prev = Infinity;
    for (let i = 0; i <= 100; i++) { const d = S.sampleShot("descent", i / 100, P).distance; if (d > prev + 1e-9) mono = false; prev = d; }
    ok("!! ...and a descent's distance never increases (it descends)", mono);

    // hyperzoom is a LENS move: FOV must do most of the work while the camera barely travels.
    const hzTravel = S.sampleShot("hyperzoom", 0, P).distance / S.sampleShot("hyperzoom", 1, P).distance;
    ok("!! 'hyperzoom' is mostly a LENS move -- the FOV closes while the camera is already near its mark",
        S.SHOTS.hyperzoom.dist(0.5) > 0.9 && S.SHOTS.hyperzoom.fov(0.5) < 0.95,
        "dist easing is " + S.SHOTS.hyperzoom.dist(0.5).toFixed(3) + " done at the half-way mark while fov is only " +
        S.SHOTS.hyperzoom.fov(0.5).toFixed(3) + " -- total travel ratio " + hzTravel.toFixed(0) + "x");
}

console.log("\n4. *** A DESCENT ONTO THE REAL PROCEDURAL PLANET ENDS ABOVE THE GROUND, NOT INSIDE A MOUNTAIN ***");
{
    // The subject is world/procPlanet.js's actual seeded planet and world/planetSurface.js's actual displacement
    // -- the same numbers es-box3d-fly3d.html builds its mesh from. Nothing here is a stand-in.
    const R = 17, AMP = 0.035;
    let worstClear = Infinity, worstSeed = -1, tested = 0, maxRelief = 0;
    for (const seed of [1, 7, 42, 1234, 99991, 777777]) {
        const spec = PP.planetSpec(seed);
        for (const dir of [[0, 0, 1], [1, 0, 0], [0, 1, 0], [0.4, 0.7, -0.6], [-0.5, -0.2, 0.84], [0.33, -0.9, 0.28]]) {
            const d = S.norm3(dir);
            const ground = PS.surfaceRadiusAt(spec, d, { radius: R, ampFrac: AMP });
            maxRelief = Math.max(maxRelief, ground - R);
            const target = [d[0] * ground, d[1] * ground, d[2] * ground];
            // a descent that ends 1.5 units off the deck, straight down the local vertical at the end
            const P = {
                center: [0, 0, 0], target,
                from: { distance: 900, pitch: 0.10, azimuth: 0, fov: 58, roll: 0 },
                to:   { distance: 1.5, pitch: 1.20, azimuth: 1.2, fov: 34, roll: 0 },
            };
            for (let i = 0; i <= 120; i++) {
                const f = S.sampleShot("descent", i / 120, P);
                const eyeR = Math.hypot(f.eye[0], f.eye[1], f.eye[2]);
                const eyeDir = S.norm3(f.eye);
                const groundUnderEye = PS.surfaceRadiusAt(spec, eyeDir, { radius: R, ampFrac: AMP });
                const clear = eyeR - groundUnderEye;
                if (clear < worstClear) { worstClear = clear; worstSeed = seed; }
                tested++;
            }
        }
    }
    ok("!! *** the camera stays ABOVE the displaced surface for the WHOLE flight, on every seed ***",
        worstClear > 0,
        "worst clearance " + worstClear.toFixed(4) + " units over " + tested + " sampled frames on 6 seeds x 6 " +
        "landing sites (closest approach on seed " + worstSeed + "); relief reaches " + maxRelief.toFixed(3) +
        " units above the mean radius, so this is not a claim about a smooth ball");

    ok("!! ...and surfaceRadiusAt keeps the sea LEVEL (every below-sea direction gives the same radius)",
        (() => {
            const spec = PP.planetSpec(42);
            const below = [];
            for (let i = 0; i < 400 && below.length < 12; i++) {
                const a = i * 0.7, b = i * 1.3;
                const d = S.norm3([Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)]);
                if (PS.heightAtDir(spec, d) < spec.seaLevel) below.push(PS.surfaceRadiusAt(spec, d, { radius: R, ampFrac: AMP }));
            }
            return below.length >= 3 && (Math.max(...below) - Math.min(...below)) < 1e-12;
        })(),
        "an ocean that follows the noise field under the water is not an ocean");

    // ONE DECLARATION: the page must not carry its own copy of the displacement any more.
    const fs = await import("node:fs");
    const page = fs.readFileSync(path.join(ROOT, "es-box3d-fly3d.html"), "utf8");
    ok("!! *** es-box3d-fly3d.html displaces its mesh through the SAME surfaceRadiusAt the camera asks ***",
        /surfaceRadiusAt\(spec, \[x, y, z\]/.test(page) && !/const k = 1 \+ \(AMP \/ R\)/.test(page),
        "two copies of a displacement formula is precisely how a camera flies through a mountain the renderer drew");
}

console.log("\n5. *** A SEQUENCE'S SEAMS DO NOT CUT -- CONTINUITY IS DERIVED, NOT REMEMBERED ***");
{
    const target = [0, 0, 17.2];
    // Leg 1 deliberately carries a NONSENSE `from` -- a different distance, pitch, azimuth and fov from where
    // leg 0 ends. If chainLegs did nothing, the camera would teleport at the seam. This is the load-bearing
    // fixture: a chain that only works when the author typed matching endpoints has not solved anything.
    const raw = [
        { shot: "descent", dur: 6, p: { center: [0, 0, 0], target,
            from: { distance: 20000, pitch: 0.05, azimuth: 0.0, fov: 62, roll: 0 },
            to:   { distance: 150,   pitch: 0.35, azimuth: 0.6, fov: 50, roll: 0 } } },
        { shot: "descent", dur: 8, p: { center: [0, 0, 0], target,
            from: { distance: 9999, pitch: -1.2, azimuth: 3.0, fov: 11, roll: 0 },   // <- wrong on purpose
            to:   { distance: 2.2,  pitch: 1.05, azimuth: 1.3, fov: 34, roll: 0 } } },
    ];
    const legs = S.chainLegs(raw);

    ok("!! chainLegs OVERWRITES a later leg's start with the previous leg's end",
        legs[1].p.from.distance === 150 && Math.abs(legs[1].p.from.pitch - 0.35) < 1e-12 &&
        Math.abs(legs[1].p.from.fov - 50) < 1e-12,
        "leg 1 was written with from.distance 9999 / fov 11 and now starts at " + legs[1].p.from.distance +
        " / fov " + legs[1].p.from.fov + " -- the seam is DERIVED, so it cannot drift when either leg is tuned");
    ok("...and it does not mutate the caller's own declaration",
        raw[1].p.from.distance === 9999,
        "returning a new array means a page can keep its legs as written and re-chain them");

    ok("!! sequenceDuration is the sum of the legs", S.sequenceDuration(legs) === 14, "6 + 8 = " + S.sequenceDuration(legs));

    // *** THE SEAM ITSELF, MEASURED: step ACROSS the boundary and the camera must not move appreciably. ***
    const eps = 1e-4;
    const a = S.sampleSequence(legs, 6 - eps), b = S.sampleSequence(legs, 6 + eps);
    const seamJump = len3(sub3(a.eye, b.eye));
    ok("!! *** THE CAMERA DOES NOT CUT AT THE SEAM *** (leg 0 -> leg 1, sampled 0.1ms either side)",
        seamJump < 1e-2 && a.leg === 0 && b.leg === 1,
        "eye moves " + seamJump.toExponential(2) + " units across the join, and the leg index really did " +
        "advance (" + a.leg + " -> " + b.leg + ") so this is a real boundary and not one leg sampled twice");
    ok("...and fov is continuous across it too (a lens jump reads as a cut just as badly)",
        Math.abs(a.fov - b.fov) < 1e-3, "fov " + a.fov.toFixed(4) + " -> " + b.fov.toFixed(4));

    // the whole arrival must still descend monotonically -- a warp leg that ended further out than it started
    // would be a retreat with a tunnel drawn over it.
    let mono = true, prev = Infinity, minD = Infinity;
    for (let i = 0; i <= 400; i++) {
        const f = S.sampleSequence(legs, (i / 400) * 14);
        if (f.distance > prev + 1e-6) mono = false;
        prev = f.distance; minD = Math.min(minD, f.distance);
    }
    ok("!! the whole two-leg arrival descends monotonically, 20000 -> 2.2",
        mono && Math.abs(minD - 2.2) < 1e-6, "closest approach " + minD.toFixed(4));

    // and past the end it CLAMPS rather than wrapping: an arrival that restarted would be a loop, not a landing.
    const end = S.sampleSequence(legs, 14), past = S.sampleSequence(legs, 999);
    ok("!! ...and sampling past the end clamps to the landing rather than wrapping",
        Math.abs(end.distance - past.distance) < 1e-9 && past.done === true,
        "t=14 and t=999 both give distance " + past.distance.toFixed(4) + ", done=" + past.done);

    // *** AND THIS IS WHERE THE FOUR-DECADE mixLog EXAMPLE STOPS BEING A FOOTNOTE. *** The module's own header
    // uses 20000 -> 2 to argue for log distance; an arrival leg really does span that, so the argument is now
    // load-bearing rather than illustrative. Half-way through leg 0, a linear camera would still be ~10000 out.
    const half = S.sampleSequence(legs, 3).distance;
    ok("!! *** half-way through the warp leg the camera is genuinely in the system, not still in deep space ***",
        half < 3000, "at t=3s of a 6s leg the camera is " + half.toFixed(0) +
        " units out; a LINEAR interpolation of the same leg would be " + ((20000 + 150) / 2).toFixed(0));
}

console.log("\n5b. *** A COMPUTED SHOT AS A RECORDED CLIP -- THE TWO CAMERA MODULES ACTUALLY COMPOSE ***");
{
    const target = [0, 0, 17.2];
    const legs = S.chainLegs([
        { shot: "dive", dur: 2.5, p: { center: [0, 0, 0], target,
            from: { distance: 20000, pitch: 0.04, azimuth: -0.5, fov: 62, roll: 0 },
            to:   { distance: 140, pitch: 0.30, azimuth: 0.2, fov: 50, roll: 0 } } },
        { shot: "descent", dur: 8, p: { to: { distance: 12, pitch: 1.05, azimuth: 1.3, fov: 34, roll: 0 } } },
        { shot: "orbit", dur: 12, p: { to: { distance: 12, pitch: 1.05, azimuth: 3.5, fov: 34, roll: 0 } } },
    ]);

    // the yaw/pitch conversion is ROUND-TRIPPED against camera/camera.js's own stated forward, not trusted.
    let worstRT = 0;
    for (let i = 0; i < 400; i++) {
        const a = (i / 400) * Math.PI * 2 - Math.PI, b = ((i * 7) % 400 / 400) * Math.PI * 0.98 - Math.PI * 0.49;
        const f = S.norm3([Math.sin(a) * Math.cos(b), Math.sin(b), -Math.cos(a) * Math.cos(b)]);
        const { yaw, pitch } = S.forwardToYawPitch(f);
        const back = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
        worstRT = Math.max(worstRT, len3(sub3(f, back)));
    }
    ok("!! forwardToYawPitch inverts camera/camera.js's OWN forward (yaw=0 -> -Z, +pitch up) exactly",
        worstRT < 1e-12, "worst round-trip error " + worstRT.toExponential(2) + " over 400 directions");

    const clip = S.toClip(legs, 30);
    ok("!! toClip emits the schema cameraCinematic/TrackAnimator already consume",
        clip.bones.length === 2 && clip.bones[0].id === "camera.pos" && clip.bones[1].id === "camera.aim" &&
        clip.bones.every((b) => b.frames.every((f) => typeof f.t === "number" && Array.isArray(f.position) && f.position.length === 3)),
        clip.bones[0].frames.length + " frames per track over " + clip.duration + "s");
    ok("...and its duration is the sequence's own, with frames spanning it end to end",
        Math.abs(clip.duration - S.sequenceDuration(legs)) < 1e-12 &&
        clip.bones[0].frames[0].t === 0 &&
        Math.abs(clip.bones[0].frames.at(-1).t - clip.duration) < 1e-9);

    // *** THE CLAIM THAT MATTERS: THE CLIP IS THE SAME FLIGHT, NOT A LOSSY TRACE OF ONE PLAYBACK. ***
    let worstPos = 0;
    for (const fr of clip.bones[0].frames) {
        const live = S.sampleSequence(legs, fr.t);
        worstPos = Math.max(worstPos, len3(sub3(fr.position, live.eye)));
    }
    ok("!! *** every recorded frame equals the shot sampled at that same t -- a record, not a trace ***",
        worstPos < 1e-9, "worst position error " + worstPos.toExponential(2) + " across " +
        clip.bones[0].frames.length + " frames; purity is what makes seeking and playing-forward the same frame");
    ok("...and recording twice gives a byte-identical clip",
        JSON.stringify(S.toClip(legs, 30)) === JSON.stringify(clip));
    ok("...and it carries its own provenance rather than looking hand-recorded",
        clip._shot && clip._shot.fps === 30 && clip._shot.legs === 3, JSON.stringify(clip._shot));
    let threw = 0;
    try { S.toClip([], 30); } catch { threw++; }
    try { S.toClip(legs, 0); } catch { threw++; }
    ok("...and bad input refuses rather than emitting an empty clip", threw === 2,
        "an empty clip plays as a camera frozen at the origin, which reads as a broken player");

    // THE THIRD LEG's own character: an orbit holds its distance and moves only the azimuth.
    const oStart = S.sampleSequence(legs, 10.5 + 0.01), oEnd = S.sampleSequence(legs, 22.5);
    ok("!! *** the settling ORBIT holds its height and sweeps only azimuth -- it ends the shot, not extends the dive ***",
        oStart.leg === 2 && Math.abs(oStart.distance - oEnd.distance) < 1e-9 &&
        Math.abs(oEnd.azimuth - oStart.azimuth) > 1.5,
        "distance held at " + oEnd.distance.toFixed(3) + " while azimuth moved " +
        (oEnd.azimuth - oStart.azimuth).toFixed(2) + " rad -- the orbit shot's dist channel is the constant 0, " +
        "so mixLog returns whatever the descent handed over");
}

console.log("\n6. *** THE PAGE ACTUALLY FLIES IT, AND THE CAMERA THREE RENDERS FROM CLEARS THE GROUND ***");
{
    const fs = await import("node:fs");
    const page = fs.readFileSync(path.join(ROOT, "es-box3d-fly3d.html"), "utf8");

    // matched by SYMBOL rather than by the whole import line -- my first version pinned the exact line and went
    // red the moment v4054 added two more names to it, which is a check grading its own punctuation.
    const importsFrom = (sym) => new RegExp("import \\{[^}]*\\b" + sym + "\\b[^}]*\\} from \"/rig/cinematicShot\\.js\"").test(page);
    ok("!! es-box3d-fly3d.html drives both flights from the shared module, not a second copy of the maths",
        ["sampleShot", "sampleSequence", "chainLegs"].every(importsFrom) &&
        /sampleShot\("descent", descent\.t, descent\.p\)/.test(page) &&
        /sampleSequence\(arrival\.legs, arrival\.t\)/.test(page),
        "a page that re-derived the curves would drift from everything sections 1-5 just proved");
    ok("!! ...and the landing site is chosen on the REAL displaced terrain, not the mean radius",
        /surfaceRadiusAt\(planetSpec_, dir, \{ radius: planetR, ampFrac: PLANET_AMP_FRAC \}\)/.test(page),
        "relief reaches ~0.39 units on this planet -- easily enough to end a descent inside a mountain");
    // *** TWO BUGS THAT ONLY EXIST BECAUSE OrbitControls SHARES THE CAMERA. *** Left enabled, its damping pulls
    // the camera back toward its own target every frame while the shot pushes it forward -- a visible shudder.
    // And on landing, handing control back WITHOUT moving controls.target snaps the view across the planet,
    // because the controls still orbit whatever they were last told to look at.
    ok("!! *** OrbitControls is DISABLED for the flight and handed the LANDING SITE when it ends ***",
        /controls\.enabled = false;/.test(page) && /controls\.target\.set\(f\.target\[0\], f\.target\[1\], f\.target\[2\]\)/.test(page),
        "damping fighting the shot reads as a shudder; releasing to a stale target snaps the view across the planet");

    // *** v4056 -- THE FRAMING RULE, KEPT HONEST BY ARITHMETIC RATHER THAN BY TASTE. ***
    // The descent used to end 2.2 units above the ground, where the frame is a flat pale wash: MEASURED
    // luminance sd 9.3, against 49.8 mid-descent. The cause is texture magnification and it is exact -- the
    // surface is a 128px cube face, one face spans R*pi/2 = 26.7 units of arc, so a texel is 0.209 units, and
    // at height 2.2 with fov 34 the visible ground is 1.19 units wide: ~5.7 TEXELS ACROSS A 700-PIXEL FRAME.
    // Raising the bake was PRICED AND REJECTED (740 ms at 128, 2697 at 256, 10222 at 512, on the main thread at
    // load). So the CAMERA gives way, which is a cinematic camera's own job. This check exists so a later round
    // cannot "improve" the landing by flying closer again without meeting the number that made it a wash.
    const numOf = (name) => { const m = page.match(new RegExp(name + "\\s*=\\s*([\\d.]+)")); return m ? parseFloat(m[1]) : NaN; };
    const dEnd = numOf("DESCENT_END"), cAlt = numOf("CLOUD_ALT");
    const TEXEL = (17 * Math.PI / 2) / 128;
    const texelsAt = (h) => (2 * h * Math.tan((34 * Math.PI / 180) / 2)) / TEXEL;
    ok("!! *** the descent ends where the terrain still CARRIES DETAIL (>= ~30 texels across the frame) ***",
        Number.isFinite(dEnd) && texelsAt(dEnd) >= 30,
        "DESCENT_END " + dEnd + " -> ~" + texelsAt(dEnd).toFixed(1) + " texels across the frame. The old 2.2 gave " +
        texelsAt(2.2).toFixed(1) + " and rendered at luminance sd 9.3; the measured elbow is ~12 units (sd 38.2)");
    ok("!! *** the arrival's legs are declared ONCE -- the button flies them and toClip records them ***",
        /function arrivalLegs\(center, target\)/.test(page) &&
        /arrival = \{ t: 0, legs: arrivalLegs\(site\.center, site\.target\) \}/.test(page) &&
        /toClip\(arrivalLegs\(site\.center, site\.target\), fps \|\| 30\)/.test(page),
        "two copies would mean the clip you exported was a different flight from the one you watched -- the " +
        "worst kind of recording, because it is plausible and wrong");
    ok("!! ...and the settling orbit sweeps from the SAME named azimuth the descent lands on",
        /const LAND_AZ = [\d.]+, ORBIT_SWEEP = [\d.]+;/.test(page) &&
        /azimuth: LAND_AZ, /.test(page) && /azimuth: LAND_AZ \+ ORBIT_SWEEP/.test(page),
        "typing the landing azimuth twice is how an orbit ends up starting somewhere the descent did not end");
    ok("!! ...and the cloud deck sits ABOVE that, so the flight still passes THROUGH the weather",
        Number.isFinite(cAlt) && cAlt > dEnd,
        "CLOUD_ALT " + cAlt + " vs DESCENT_END " + dEnd + " -- a deck at or below the landing height would leave " +
        "the shot stopping short of the clouds and looking at them edge-on instead of crossing them");

    const pw = await import(path.join(ROOT, "tools", "ship", "playwrightResolve.mjs"));
    const { createRequire } = await import("node:module");
    const rr = pw.resolvePlaywright(createRequire(import.meta.url));
    const skip = pw.browserSkipReason(rr.chromium, rr.from, pw.HEADLESS_SHELL);
    if (skip) {
        console.log("  ----  live flight SKIPPED -- " + skip);
        console.log("  ----  *** THAT IS A SKIP AND NOT A PASS: the checks above read source, and source cannot");
        console.log("  ----  show that the camera Three actually renders from stayed above a mountain.");
    } else {
        const http = await import("node:http");
        const srv = http.default.createServer((rq, rs) => {
            const p = decodeURIComponent((rq.url || "/").split("?")[0]);
            const full = path.join(ROOT, p);
            if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { rs.writeHead(404); rs.end("nf"); return; }
            const ext = path.extname(full);
            const ct = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css" }[ext] || "application/octet-stream";
            rs.writeHead(200, { "Content-Type": ct }); rs.end(fs.readFileSync(full));
        });
        await new Promise((r) => srv.listen(0, "127.0.0.1", r));
        const browser = await rr.chromium.launch({ executablePath: pw.HEADLESS_SHELL, args: ["--use-gl=swiftshader", "--enable-webgl"] });
        try {
            const pg = await browser.newPage();
            const errs = [];
            pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
            await pg.setViewportSize({ width: 700, height: 460 });
            await pg.goto("http://127.0.0.1:" + srv.address().port + "/es-box3d-fly3d.html?seed=42", { waitUntil: "load", timeout: 40000 });
            await pg.waitForTimeout(3500);
            const before = await pg.evaluate(() => window.swekDescentProbe && window.swekDescentProbe());
            ok("!! the page exposes a live probe and the planet is built", !!before, before ? "" : "no swekDescentProbe");

            if (before) {
                await pg.evaluate(() => window.swekDescend());
                // sample the WHOLE flight, not just its ends -- flying through a mountain mid-descent and
                // coming out the far side would satisfy an endpoints-only check perfectly.
                // sample until the flight REPORTS it has landed, with a bound -- a fixed sample count is a
                // guess about how fast a headless swiftshader frame loop runs, and my first version guessed
                // 11.7s for a 9s shot and still caught it mid-flight.
                const track = [];
                for (let i = 0; i < 80; i++) {
                    await pg.waitForTimeout(400);
                    const p = await pg.evaluate(() => window.swekDescentProbe());
                    track.push(p);
                    if (p && !p.flying && i > 2) break;
                }
                const flew = track.filter((p) => p);
                const minClear = Math.min(...flew.map((p) => p.clearance));
                const last = flew[flew.length - 1];
                const duringFlight = flew.filter((p) => p.flying);

                ok("!! *** THE LIVE CAMERA CLEARS THE DISPLACED TERRAIN FOR THE WHOLE FLIGHT ***",
                    minClear > 0,
                    "worst clearance " + minClear.toFixed(3) + " units over " + flew.length + " sampled frames; " +
                    "ground under the camera at landing " + last.ground.toFixed(3) + " vs mean radius 17");
                ok("!! ...and it genuinely descended (orbit distance collapsed onto the surface)",
                    before.clearance > 20 && last.clearance < before.clearance / 4,
                    "clearance " + before.clearance.toFixed(1) + " -> " + last.clearance.toFixed(2) + " units");
                // the detail REPORTS what was measured rather than restating the claim -- my first version of
                // this line said "all with controls disabled; enabled again at landing" unconditionally, which
                // printed that sentence verbatim on the run where it FAILED. A detail that asserts the
                // conclusion is the "flag that lies" this tree keeps removing, in a gate's own output.
                const allDisabled = duringFlight.every((p) => !p.controlsEnabled);
                ok("!! ...and OrbitControls really was disabled mid-flight, then handed back",
                    duringFlight.length > 0 && allDisabled && last.landed !== false && last.controlsEnabled,
                    duringFlight.length + " of " + flew.length + " sampled frames were in flight; controls disabled " +
                    "throughout: " + allDisabled + "; final frame flying=" + last.flying + " t=" + last.t.toFixed(3) +
                    " controlsEnabled=" + last.controlsEnabled);
                ok("!! ...with zero page errors across the descent", errs.length === 0, errs[0] || "clean");

                // ---- v4054: the ARRIVAL -- warp leg with the tunnel, then the descent, on one page ----
                await pg.reload({ waitUntil: "load" });
                await pg.waitForTimeout(3500);
                await pg.evaluate(() => window.swekArrive());
                const arr = [];
                for (let i = 0; i < 220; i++) {   // 22.5s of flight, and headless runs ~2x slower than real time
                    await pg.waitForTimeout(400);
                    const p = await pg.evaluate(() => window.swekArrivalProbe());
                    arr.push(p);
                    if (p && !p.flying && i > 2) break;
                }
                const flying = arr.filter((p) => p && p.flying);
                const leg0 = flying.filter((p) => p.leg === 0), leg1 = flying.filter((p) => p.leg === 1);
                ok("!! *** THE ARRIVAL RUNS BOTH LEGS: a warp cross, then a descent ***",
                    leg0.length > 0 && leg1.length > 0,
                    leg0.length + " frames on the warp leg, " + leg1.length + " on the descent");
                ok("!! ...and it really starts out at solar-system range, not just outside the atmosphere",
                    leg0.length > 0 && Math.max(...leg0.map((p) => p.distance)) > 5000,
                    "furthest sampled " + (leg0.length ? Math.max(...leg0.map((p) => p.distance)).toFixed(0) : "-") +
                    " units out -- the four-decade span rig/cinematicShot.js's header argues mixLog for");
                // *** THE TUNNEL BELONGS TO LEG 0 ONLY. *** Left running into the descent it would wrap the
                // camera in a glowing tube while the planet fills the frame -- the shot's climax, behind a
                // curtain. The leg is timed to jumpDuration() rather than to a second typed number.
                ok("!! *** THE WARP TUNNEL IS GONE BY THE TIME THE DESCENT STARTS ***",
                    leg1.length > 0 && leg1.every((p) => !p.tunnel),
                    leg1.filter((p) => p.tunnel).length + " of " + leg1.length + " descent frames still had the " +
                    "tunnel up (want 0); leg 0 is timed to render/foldTunnel.js's own jumpDuration()");
                ok("!! ...and the arrival lands and hands the camera back",
                    arr.length > 0 && arr[arr.length - 1] && arr[arr.length - 1].flying === false,
                    "final probe flying=" + (arr[arr.length - 1] || {}).flying);
                ok("!! ...with zero page errors across the arrival too", errs.length === 0, errs[0] || "clean");
            }
        } finally { await browser.close(); await new Promise((r) => srv.close(r)); }
    }
}

console.log("\n" + (fails ? fails + " FAILED" : "all passed"));
if (fails) process.exit(1);
