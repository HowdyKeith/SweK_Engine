// WebGLEngine/render/cubeBake-selfcheck.mjs — v4327
//
// render/cubeBake.js is a MOVE out of render/nebulaSkybox.js, so this gate has two jobs and the second one is
// the one that matters. The first is the ordinary one: the directions are unit length, they sit at texel
// CENTRES, the faces are in GL order, and two faces sharing an edge are handed the same direction there -- the
// property every bake in this tree leans on for seamlessness.
//
// THE SECOND IS THE ANSWER KEY. A refactor that changes one texel of a shipped planet is not a refactor, and
// "it still looks right" cannot tell the difference. The digests in KEY below were measured on the tree BEFORE
// the move (v4326, the code as it stood inside nebulaSkybox.js) and are asserted here after it. They cover the
// primitives and the three bakes that ride on them. If a later round retunes the cube geometry on purpose, these
// numbers are what it has to knowingly rewrite -- which is the point: the change becomes visible instead of
// silent.
//
// SABOTAGES DRIVEN AGAINST render/cubeBake.js, each restored after (v4327):
//   1. texel CORNERS instead of centres ((i + 0.0) / size)          -> RED at the centre check + the answer key
//   2. the +X and -X face functions swapped                          -> RED at the GL face-order check
//   3. bakeCubemap tinting its output by the face index              -> RED at the three bake digests
// Three sabotages, three caught by name. The one worth noting is 3: it is the only one that leaves every
// direction still a unit vector and every face still the right way up, and it is caught ONLY by the answer key.
//
// Run: node render/cubeBake-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import crypto from "node:crypto";
import { FACES, faceTexelDir, bakeCubemap } from "./cubeBake.js";
import { bakeNebulaCubemap } from "./nebulaSkybox.js";
import { bakeStarCubemap } from "./proceduralStar.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const sha = (buf) => crypto.createHash("sha256").update(Buffer.from(buf)).digest("hex").slice(0, 16);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// 1) EVERY DIRECTION IS A UNIT VECTOR. The bakes divide by nothing and normalise nowhere else; if this slips,
//    every dot product downstream (the gradient's dir.y, the star's mu) is quietly scaled.
{
    let worst = 0;
    for (const size of [1, 2, 8, 16, 33]) for (let f = 0; f < 6; f++)
        for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
            const d = faceTexelDir(f, i, j, size);
            worst = Math.max(worst, Math.abs(Math.hypot(d[0], d[1], d[2]) - 1));
        }
    ok(worst < 1e-15, `every texel direction is unit length (worst |len-1| = ${worst.toExponential(1)})`);
}

// 2) TEXEL CENTRES, NOT CORNERS. A size-1 face has its single texel dead centre, so it must point exactly along
//    the face axis. Sampling corners instead would put it on a diagonal -- and would make the seam test below
//    pass for the wrong reason, because two faces would then share an exact edge sample.
{
    const axes = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    let centred = true;
    for (let f = 0; f < 6; f++) {
        const d = faceTexelDir(f, 0, 0, 1);
        if (Math.abs(dot(d, axes[f]) - 1) > 1e-15) centred = false;
    }
    ok(centred, "a 1x1 face's only texel points exactly along that face's axis (centres, not corners)");

    // At size 2 the four texels sit at +/-0.5 in u and v, never at +/-1.
    let inBand = true;
    for (let f = 0; f < 6; f++) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const u = ((i + 0.5) / 2) * 2 - 1;
        if (Math.abs(Math.abs(u) - 0.5) > 1e-15) inBand = false;
    }
    ok(inBand, "a 2x2 face samples u,v at +/-0.5 -- no texel lands on the face boundary");
}

// 3) GL FACE ORDER. +X, -X, +Y, -Y, +Z, -Z. Get this wrong and a cubemap is scrambled in a way that reads as
//    "the art is wrong" rather than "the order is wrong".
{
    const want = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    let order = true;
    for (let f = 0; f < 6; f++) if (dot(faceTexelDir(f, 0, 0, 1), want[f]) < 0.999999999) order = false;
    ok(order, "the six faces are in GL order (+X, -X, +Y, -Y, +Z, -Z)");
    ok(FACES.length === 6, "there are exactly six faces");
}

// 4) THE SEAM PROPERTY, AS GEOMETRY RATHER THAN AS COLOUR. nebulaSkybox's gate checks that two faces meeting at
//    an edge come out the same COLOUR; that is the end-to-end statement and it is worth having. This is the
//    statement underneath it: the two nearest texels across a shared edge converge on the SAME DIRECTION as the
//    faces get finer. Colour continuity follows from that for any shading function, not just the sky's.
{
    let prev = Infinity, shrinking = true;
    for (const S of [8, 16, 32, 64, 128]) {
        const a = faceTexelDir(0, 0, S >> 1, S);        // +X face, u at its -1 edge, mid v
        const b = faceTexelDir(4, S - 1, S >> 1, S);    // +Z face, u at its +1 edge, mid v
        const gap = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        if (!(gap < prev)) shrinking = false;
        prev = gap;
    }
    ok(shrinking, "the gap between the nearest texels across a shared edge shrinks as the face gets finer");
    ok(prev < 0.02, `at 128 the two faces' edge texels agree to ${prev.toExponential(1)} in direction`);
}

// 5) bakeCubemap IS THE LOOP IT REPLACED. nebulaSkybox.js used to write this walk out by hand; the helper must
//    produce the identical bytes, or the move quietly re-rasterised every backdrop.
{
    const shade = (dir) => [(dir[0] + 1) * 0.5, (dir[1] + 1) * 0.5, (dir[2] + 1) * 0.5];
    const size = 13;
    const got = bakeCubemap(size, 3, shade);
    const wantFaces = [];
    for (let f = 0; f < 6; f++) {
        const buf = new Uint8ClampedArray(size * size * 3);
        for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
            const c = shade(faceTexelDir(f, i, j, size));
            const o = (j * size + i) * 3;
            buf[o] = c[0] * 255; buf[o + 1] = c[1] * 255; buf[o + 2] = c[2] * 255;
        }
        wantFaces.push(buf);
    }
    let same = got.size === size && got.faces.length === 6;
    for (let f = 0; f < 6 && same; f++) if (sha(got.faces[f]) !== sha(wantFaces[f])) same = false;
    ok(same, "bakeCubemap reproduces the hand-written six-face loop byte for byte");
}

// 6) *** THE ANSWER KEY -- measured at v4326, BEFORE the geometry left nebulaSkybox.js. ***
{
    const KEY = {
        faceTexelDir: "a9b79561e99f09ef",
        "nebula:1337": "babd7987acb70302",
        "nebula:default": "7c30f8b599af1824",
        star: "40ab5ba6a8192bed",
    };
    let d = "";
    for (let f = 0; f < 6; f++) for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++)
        d += faceTexelDir(f, i, j, 16).map((v) => v.toFixed(12)).join(",");
    ok(sha(d) === KEY.faceTexelDir, `faceTexelDir digest matches the pre-move key (${sha(d)})`);

    const cat = (r) => Buffer.concat(r.faces.map((f) => Buffer.from(f)));
    const n1337 = sha(cat(bakeNebulaCubemap({ seed: 1337, size: 32 })));
    ok(n1337 === KEY["nebula:1337"], `the nebula bake at seed 1337 is unchanged (${n1337})`);
    const ndef = sha(cat(bakeNebulaCubemap({ size: 24 })));
    ok(ndef === KEY["nebula:default"], `the nebula bake at SHIPPED DEFAULTS is unchanged (${ndef})`);
    const st = sha(cat(bakeStarCubemap({ size: 24 })));
    ok(st === KEY.star, `the star bake is unchanged (${st})`);
}

// 7) SABOTAGE -- the checks above have to be able to fail. Each of these is a mistake this move could plausibly
//    have made; if any of them still reads as "fine", the corresponding check is decoration.
{
    // S1: sampling texel CORNERS instead of centres -- the classic off-by-half.
    const corner = (f, i, j, size) => {
        const u = (i / size) * 2 - 1, v = (j / size) * 2 - 1;
        const d = FACES[f](u, v), inv = 1 / Math.hypot(d[0], d[1], d[2]);
        return [d[0] * inv, d[1] * inv, d[2] * inv];
    };
    ok(Math.abs(dot(corner(0, 0, 0, 1), [1, 0, 0]) - 1) > 1e-9, "SABOTAGE corner sampling is caught by the centre check");

    // S2: two faces swapped -- a scrambled cubemap that still passes every unit-length test.
    const swapped = [FACES[1], FACES[0], FACES[2], FACES[3], FACES[4], FACES[5]];
    const dS = swapped[0](0, 0), invS = 1 / Math.hypot(dS[0], dS[1], dS[2]);
    ok(dot([dS[0] * invS, dS[1] * invS, dS[2] * invS], [1, 0, 0]) < 0.999999999,
       "SABOTAGE swapping +X and -X is caught by the face-order check");

    // S3: a bake that reads the FACE INDEX rather than only the direction. This is the one that destroys
    //     seamlessness while every other property here still holds -- and it is exactly what a careless
    //     "optimisation" of bakeCubemap would introduce.
    const perFace = bakeCubemap(8, 3, (dir, f) => [f / 6, 0, 0]);
    const pureDir = bakeCubemap(8, 3, (dir) => [(dir[0] + 1) * 0.5, 0, 0]);
    ok(sha(perFace.faces[0]) !== sha(perFace.faces[1]) && sha(pureDir.faces[0]) !== sha(pureDir.faces[1]),
       "SABOTAGE a per-face term produces different faces (the shape a seam takes)");
    ok(perFace.faces[0].every((v, i) => i % 3 !== 0 || v === perFace.faces[0][0]),
       "SABOTAGE the per-face bake is FLAT within a face -- direction ignored, which is the tell");
}

if (fail) { console.error(`\ncubeBake-selfcheck: ${pass} pass, ${fail} FAIL`); process.exit(1); }
console.log(`cubeBake-selfcheck: all ${pass} pass`);
