#!/usr/bin/env node
// WebGLEngine/tools/ship/orbitCamera-selfcheck.mjs -- v4475
//
// GATES render/orbitCamera.mjs headless: the orbit camera's state arithmetic, the view it yields through
// gpuDriven's own lookAt/perspective, and the page's wiring of it -- the 3D orrery's third step.
//
// THE KEYS ARE GEOMETRIC, NOT PICTORIAL. A drag turns by exactly the stated radians; a dolly scales the distance by
// exactly the stated factor; the eye is always `distance` from the target whatever was dragged; the target projects
// to the exact centre of the screen; following moves the eye rigidly. None of that needs a pixel, and a gate that
// needed one would be testing the rasteriser, which other gates do.
//
// SABOTAGE (v4475), each applied to render/orbitCamera.mjs, run, restored byte for byte:
//   A  the pitch clamp dropped (makeOrbitState passes pitch through)  -> exit=1, 4 red: the pole clamp (pitch 500.5), withPitch, the
//                                                                        Infinity default, and "asked for the pole, stops short" at 1.5708
//   B  eyeOf ignoring the distance (unit sphere)                      -> exit=1, 4 red: |eye - target| = 1.000, the fifty drags, the
//                                                                        pole/edge placement, the dolly's effect on the eye
//   C  orrery-gpu.html's wheel listener removed                       -> exit=1, 1 red: "the wheel calls dollied()" -- the page's wiring
//
// Run: node tools/ship/orbitCamera-selfcheck.mjs      (~0.2 s, no browser)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as C from "../../render/orbitCamera.mjs";
import * as G from "../../render/gpuDriven.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (c, name, detail) => {
    console.log(`  ${c ? "PASS" : "FAIL"}${c ? "  " : "  !! "}${name}${detail ? "   " + detail : ""}`);
    if (!c) fails++;
};
const sec = (t) => console.log("\n" + t);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// ---------------------------------------------------------------------------------------------------------
sec("1. THE STATE: every function returns a new state and leaves its input alone");
// ---------------------------------------------------------------------------------------------------------
{
    const s0 = C.makeOrbitState({ yaw: 0.3, pitch: 0.5, distance: 12, target: [1, 2, 3], distMin: 2, distMax: 50 });
    ok(Object.isFrozen(s0) && Object.isFrozen(s0.target), "the state is frozen, target included");
    const s1 = C.dragged(s0, 100, 0);
    ok(s1 !== s0 && s0.yaw === 0.3 && near(s1.yaw, 0.3 + 100 * C.DEFAULTS.radiansPerPixel), "dragged: a new state, the old one untouched, yaw turned by dx * radiansPerPixel", `${s1.yaw.toFixed(4)}`);
    const s2 = C.dragged(s0, 0, -40);
    ok(near(s2.pitch, 0.5 - 40 * C.DEFAULTS.radiansPerPixel) && s2.yaw === s0.yaw, "dragged: dy tips the pitch and leaves the yaw", `${s2.pitch.toFixed(4)}`);
    const s3 = C.dragged(s0, 0, 100000);
    ok(near(s3.pitch, Math.PI / 2 - C.POLE_MARGIN) && near(C.dragged(s0, 0, -100000).pitch, -Math.PI / 2 + C.POLE_MARGIN),
       "*** the pitch is clamped short of both poles, however far the drag ***", `${s3.pitch.toFixed(4)} of ${(Math.PI / 2).toFixed(4)}`);
    const s4 = C.dragged(s0, 5000, 0);
    ok(s4.yaw >= 0 && s4.yaw < 2 * Math.PI && near(Math.cos(s4.yaw), Math.cos(0.3 + 5000 * C.DEFAULTS.radiansPerPixel)), "the yaw wraps into [0, 2PI) and keeps its direction");
    const d1 = C.dollied(s0, 100), d2 = C.dollied(s0, -100), d10 = C.dollied(s0, 1000);
    ok(near(d1.distance, 12 * C.DEFAULTS.dollyPerNotch) && near(d2.distance, 12 / C.DEFAULTS.dollyPerNotch), "dollied: one notch away is x dollyPerNotch, one notch in is / dollyPerNotch", `${d1.distance.toFixed(3)} / ${d2.distance.toFixed(3)}`);
    ok(near(d10.distance, 12 * Math.pow(C.DEFAULTS.dollyPerNotch, 10)), "  ten notches compound geometrically");
    ok(C.dollied(s0, 1e6).distance === 50 && C.dollied(s0, -1e6).distance === 2, "  and the distance is clamped to the state's own limits");
    const f = C.followed(s0, 7, [4, 5, 6]);
    ok(f.follow === 7 && f.target[0] === 4 && f.target[2] === 6 && s0.follow === null, "followed: carries the handle and the point; the old state still follows nothing");
    const u = C.followed(f, null);
    ok(u.follow === null && u.target[0] === 4, "followed(null) stops following and holds the target where it is");
    const r = C.retargeted(f, [10, 10, 10]);
    ok(r.target[1] === 10 && r.follow === 7, "retargeted moves the target and keeps the handle");
    ok(near(C.withPitch(s0, 0.1).pitch, 0.1) && C.withPitch(s0, 9).pitch < Math.PI / 2, "withPitch sets it outright, clamped");
    const bad = C.makeOrbitState({ yaw: NaN, pitch: Infinity, distance: "x", target: [NaN, 1, 2] });
    ok(Number.isFinite(bad.yaw) && Number.isFinite(bad.pitch) && Number.isFinite(bad.distance) && bad.target[0] === 0, "a NaN, an Infinity or a string in the input becomes a default, never a NaN in the camera");
}

// ---------------------------------------------------------------------------------------------------------
sec("2. THE EYE: on a sphere about the target, and the view puts the target dead centre");
// ---------------------------------------------------------------------------------------------------------
{
    const s = C.makeOrbitState({ yaw: 0.7, pitch: 0.4, distance: 9, target: [2, -1, 0.5] });
    const e = C.eyeOf(s);
    ok(near(dist3(e, s.target), 9), "*** |eye - target| = distance ***", `${dist3(e, s.target).toFixed(9)}`);
    let onSphere = true;
    for (let k = 0; k < 50; k++) { const t = C.dragged(s, (k * 37) % 400 - 200, (k * 53) % 300 - 150); if (!near(dist3(C.eyeOf(t), t.target), 9)) onSphere = false; }
    ok(onSphere, "  and stays so through fifty drags: the eye moves ON the sphere, never off it");
    const top = C.makeOrbitState({ yaw: 0, pitch: Math.PI / 2 - C.POLE_MARGIN, distance: 9 }), edge = C.makeOrbitState({ yaw: 0, pitch: 0, distance: 9 });
    ok(C.eyeOf(top)[2] > 8.99 && near(C.eyeOf(edge)[2], 0) && near(C.eyeOf(edge)[1], -9), "near the pole the eye is above the plane; at pitch 0 it is in the plane, on -y");
    ok(C.eyeOf(C.makeOrbitState({ pitch: -0.5, distance: 9 }))[2] < 0, "a negative pitch looks from below");
    const e2 = C.eyeOf(C.dollied(s, 100));
    ok(near(dist3(e2, s.target), 9 * C.DEFAULTS.dollyPerNotch), "a dolly moves the eye by exactly the factor");
    // through gpuDriven's own matrices: the target is at the centre of the screen
    for (const st of [s, top, edge, C.dragged(s, 300, -200)]) {
        const eye = C.eyeOf(st), { near: n, far } = C.clipPlanes(st, 20);
        const vp = G.multiply(G.perspective(C.DEFAULTS.fovY, 1.5, n, far), G.lookAt(eye, st.target, C.UP));
        const p = G.project(vp, st.target);
        ok(Number.isFinite(p[0]) && near(p[0], 0, 1e-6) && near(p[1], 0, 1e-6) && p[2] > -1 && p[2] < 1,
           `the target projects to (0, 0) in NDC and inside the clip range (pitch ${st.pitch.toFixed(2)}, yaw ${st.yaw.toFixed(2)})`, `(${p[0].toExponential(1)}, ${p[1].toExponential(1)}, z ${p[2].toFixed(4)})`);
    }
    // *** THE POLE, WHICH THE CLAMP EXISTS FOR. *** Handed a pitch of exactly PI/2, lookAt's basis collapses; the clamp keeps it finite.
    const polar = C.makeOrbitState({ pitch: Math.PI / 2, distance: 9 });
    const vpP = G.lookAt(C.eyeOf(polar), polar.target, C.UP);
    ok(polar.pitch < Math.PI / 2 && Array.from(vpP).every(Number.isFinite), "*** asked for the pole, the state stops short and lookAt's basis stays finite ***", `pitch ${polar.pitch.toFixed(4)}`);
    // lookAt's norm3 guards the zero vector, so the collapse is not a NaN but a ZERO BASIS: the screen's x axis vanishes
    const rawPole = G.lookAt([0, 0, 9], [0, 0, 0], C.UP);
    const xAxis = Math.hypot(rawPole[0], rawPole[4], rawPole[8]), xAxisOk = Math.hypot(vpP[0], vpP[4], vpP[8]);
    ok(xAxis < 1e-9 && near(xAxisOk, 1, 1e-6), "CONTROL: lookAt AT the pole, unclamped, has a zero x axis (the picture collapses to a line); the clamped one's is unit -- the rule is for something real", `|x| ${xAxis.toExponential(1)} unclamped, ${xAxisOk.toFixed(6)} clamped`);
    // following: the eye moves rigidly with the target
    const f0 = C.followed(s, 3, [0, 0, 0]), f1 = C.retargeted(f0, [5, 5, 1]);
    const off0 = [C.eyeOf(f0)[0] - 0, C.eyeOf(f0)[1] - 0, C.eyeOf(f0)[2] - 0], off1 = [C.eyeOf(f1)[0] - 5, C.eyeOf(f1)[1] - 5, C.eyeOf(f1)[2] - 1];
    ok(near(dist3(off0, off1), 0), "following: when the target moves the eye moves with it and the offset is unchanged");
    ok(near(C.pitchFromTilt(35), Math.PI / 2 - 35 * Math.PI / 180) && near(C.tiltFromPitch(C.pitchFromTilt(35)), 35) && near(C.pitchFromTilt(0), Math.PI / 2),
       "the tilt slider maps to a pitch and back: tilt 0 is the pole, tilt 35 the page's old default");
    ok(near(C.fitDistance(10), 24) && C.clipPlanes(s, 20).far > s.distance * 4, "fitDistance keeps the v4299 framing (ext x 2.4); far reaches past the system");
}

// ---------------------------------------------------------------------------------------------------------
sec("3. THE PAGE: orrery-gpu.html wires drag, wheel, follow and the slider to these functions");
// ---------------------------------------------------------------------------------------------------------
{
    const page = fs.readFileSync(path.join(ENG, "orrery-gpu.html"), "utf8");
    ok(/from "\.\/render\/orbitCamera\.mjs"/.test(page), "the page imports the module");
    ok(/pointerdown[\s\S]{0,400}pointermove[\s\S]{0,800}dragged\(/.test(page) || /dragged\(orbit/.test(page), "a pointer drag calls dragged()");
    ok(/addEventListener\("wheel"[\s\S]{0,300}dollied\(/.test(page), "the wheel calls dollied()");
    ok(/followed\(orbit/.test(page) && /retargeted\(orbit/.test(page) && /positionAt3\(/.test(page), "a click on a body follows it, and each frame retargets to positionAt3 of the followed body");
    ok(/pitchFromTilt\(/.test(page) && /withPitch\(orbit/.test(page), "the tilt slider is the initial pitch and still sets it");
    ok(/eyeOf\(orbit\)/.test(page) && /lookAt\(eye, orbit\.target, UP\)/.test(page), "the frame's camera is eyeOf and lookAt at the state's target with the module's UP");
    ok(/fitDistance\(ext\)/.test(page) && /clipPlanes\(orbit, ext\)/.test(page), "the resting distance and the clip planes come from the module, not typed on the page");
}

console.log(fails ? `\nFAIL -- ${fails} check(s)` : "\nall checks pass");
console.log("unchecked here: the picture. tools/ship/gpuOrbits-selfcheck.mjs loads the page and sees it move; what a drag LOOKS like on a real pointer is the rig's to see. Also unchecked: inertia, touch, and a roll, which the module does not claim.");
process.exit(fails ? 1 : 0);
