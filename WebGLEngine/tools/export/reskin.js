// FILE: tools/export/reskin.js -- v4157
//
// *** RESKIN A RIGGED MODEL: KEEP THE SKELETON AND THE CLIPS, REPLACE THE SURFACE. ***
//
// Keith: "i would have thought a penciled robot expressive would have the same skin dimensions as the original.
// sort of just paste the new skin over the old skin and it still has the same joints etc."
//
// *** HE IS RIGHT IN GENERAL, AND THE ASSET IS WHY IT LOOKS OTHERWISE. *** For a TEXTURED model that is exactly
// the job: same vertices, same JOINTS_0/WEIGHTS_0, same skeleton, swap the image. MEASURED ON THE REAL FILE,
// GPU_Assets/RobotExpressive.glb has 7,214 vertices, 14 animation clips, a skin -- and NO TEXCOORD_0 AND NO
// TEXTURE AT ALL. It is flat-coloured by per-material baseColorFactor. With no UV layout there is nowhere to
// paste an image, and unwrapping 7,214 vertices is a modelling job whose automatic version puts seams down the
// front of a robot. So the simple path is not wrong, it is unavailable ON THIS ASSET -- which is a narrower and
// more useful statement than "reskinning is structural", and correcting it is what produced route 1 below.
//
// ---- TWO ROUTES, AND THE FIRST ONE IS THE ONE HE DESCRIBED ---------------------------------------------------
//
// ROUTE 1 -- VERTEX COLOURS. COLOR_0 is per-vertex and needs NO UVs. Same vertices, same joints, same weights,
// same clips; only a colour per vertex is new. *** THE ENTIRE FOUR-INFLUENCE PROBLEM SIMPLY DOES NOT ARISE. ***
// riggedExport's stroke tubes introduce NEW vertices, so each one must work out which bones it follows from a
// barycentric blend of three originals -- up to twelve joints culled to four and renormalised, or the limb
// weights stop summing to 1 and the mesh shrinks toward the origin as it animates. A vertex that already
// existed already has its four. Nothing is blended, nothing is culled, and the silhouette cannot move.
// THE LIMIT IS RESOLUTION, AND IT IS STATED RATHER THAN DISCOVERED: 7,214 vertices is about 85x85 if it were a
// texture. Too coarse for photographic detail; a fair budget for pencil or ASCII banding, which is low-frequency
// by construction.
//
// ROUTE 2 -- GLYPH QUADS. New geometry, so it DOES pay the four-influence cost -- and pays it through
// riggedExport's existing blendInfluences() rather than a second copy of that arithmetic.
//
// ---- WHAT IS PURE HERE, AND WHY ------------------------------------------------------------------------------
// Every function that decides a NUMBER is pure and takes typed arrays: shading, the ramp, surface sampling, the
// glyph atlas mapping. Only the final assembly needs THREE. That is what lets the gate run all of it headlessly
// against the REAL RobotExpressive.glb -- a reskin whose only test is "look at it" is one nobody can regress.
"use strict";
import { RAMP } from "../render-qa/asciify.mjs";   // the SAME ten-level ladder the ASCII view uses, not a copy
import { rng } from "../../world/procPlanet.js";   // the one seeded PRNG in the tree

/**
 * Lambert shade per vertex, 0..1, from the model's own normals.
 *
 * NO CAMERA IS INVOLVED, on purpose. A view-dependent shade baked into a file freezes the angle it was baked
 * from -- riggedExport records the same trap about the outline Krbn draws. A fixed light direction gives a
 * shade that is a property of the SURFACE, so it stays true from every angle and in every clip.
 */
export function shadeVertices(normals, { light = [-0.4, 0.7, 0.6], ambient = 0.25 } = {}) {
    if (!normals || !normals.length) return new Float32Array(0);
    const n = Math.floor(normals.length / 3);
    const L = (() => { const m = Math.hypot(light[0], light[1], light[2]) || 1; return [light[0] / m, light[1] / m, light[2] / m]; })();
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const x = normals[i * 3], y = normals[i * 3 + 1], z = normals[i * 3 + 2];
        const m = Math.hypot(x, y, z) || 1;
        const d = (x * L[0] + y * L[1] + z * L[2]) / m;
        // half-Lambert: a hard clamp at zero makes every back-facing vertex identical black, which throws away
        // the whole unlit half of a model that has to read as a drawing from any side.
        out[i] = Math.max(0, Math.min(1, ambient + (1 - ambient) * (d * 0.5 + 0.5)));
    }
    return out;
}

/**
 * *** STRETCH AN OBSERVED SHADE RANGE ACROSS THE WHOLE RAMP. ***
 *
 * Driven on the real asset and it caught a claim that would have been quietly false: half-Lambert with an
 * ambient floor of 0.25 cannot return anything below 0.25, so shades landed in levels 2..9 and THE FIRST TWO OF
 * THE TEN WERE UNREACHABLE. The file would have said "ten levels" while rendering eight, which is the shape of
 * over-claim this tree spends most of its gates on -- and the two lost levels are the darkest ones, so the
 * drawing loses its blacks rather than something nobody would notice.
 *
 * The rescale is per model, so two different models get different mappings. That is the right choice for a
 * reskin, whose job is to make ONE model read well, and the wrong one for comparing models -- the same
 * relative-versus-absolute decision the repo terrain has to make about heat, named here so nobody has to
 * rediscover it.
 */
export function normalizeShade(shade) {
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < shade.length; i++) { const v = shade[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    const span = mx - mn;
    if (!(span > 1e-6)) return { shade, min: mn, max: mx, stretched: false };   // a flat model has nothing to stretch
    const out = new Float32Array(shade.length);
    for (let i = 0; i < shade.length; i++) out[i] = (shade[i] - mn) / span;
    return { shade: out, min: mn, max: mx, stretched: true };
}

/** Which of RAMP's levels a shade lands in. Exported because the glyph route and the colour route must agree. */
export function rampLevel(t, levels = RAMP.length) {
    if (!(t >= 0)) return 0;
    return Math.max(0, Math.min(levels - 1, Math.floor(t * levels - 1e-9)));
}

/**
 * COLOR_0 (VEC3) from a shade array, QUANTISED THROUGH THE RAMP rather than left continuous.
 *
 * *** THE BANDING IS THE POINT AND NOT AN ARTEFACT. *** A smooth grey gradient is just a grey model; what makes
 * a pencil or ASCII rendering read as one is that it commits to a small number of tones. Ten is asciify's own
 * count, chosen there because "a long ramp looks impressive and quantises noise into visible bands" -- the same
 * argument, so the same number, read from the same constant.
 */
export function rampColors(shade, { levels = RAMP.length, ink = [0.05, 0.05, 0.06], paper = [0.96, 0.95, 0.92] } = {}) {
    const n = shade.length;
    const out = new Float32Array(n * 3);
    const denom = Math.max(1, levels - 1);
    for (let i = 0; i < n; i++) {
        const t = rampLevel(shade[i], levels) / denom;
        for (let k = 0; k < 3; k++) out[i * 3 + k] = ink[k] + (paper[k] - ink[k]) * t;
    }
    return out;
}

/**
 * Route 1, end to end as data: positions/normals/joints/weights in, the same arrays plus COLOR_0 out.
 *
 * Deliberately returns the SAME position/joint/weight arrays by reference. Copying them would invite a caller to
 * edit one and wonder why the rig no longer matches -- and the whole claim of this route is that they are
 * untouched.
 */
export function vertexColourReskin(parsed, opts = {}) {
    if (!parsed || !parsed.positions || !parsed.positions.length) throw new Error("vertexColourReskin: no positions");
    if (!parsed.normals || parsed.normals.length !== parsed.positions.length) {
        throw new Error("vertexColourReskin: needs per-vertex normals (got " +
                        (parsed.normals ? parsed.normals.length : 0) + " for " + parsed.positions.length + " position floats)");
    }
    const raw = shadeVertices(parsed.normals, opts);
    // normalize defaults ON: see normalizeShade. Pass { normalize: false } for the unstretched shade.
    const norm = opts.normalize === false ? { shade: raw, stretched: false, min: 0, max: 1 } : normalizeShade(raw);
    const shade = norm.shade;
    const colors = rampColors(shade, opts);
    const hist = new Array(opts.levels || RAMP.length).fill(0);
    for (let i = 0; i < shade.length; i++) hist[rampLevel(shade[i], hist.length)]++;
    return {
        positions: parsed.positions, normals: parsed.normals,
        joints: parsed.joints, weights: parsed.weights, indices: parsed.indices,
        colors,
        stats: { vertices: shade.length, levels: hist.length, histogram: hist,
                 levelsUsed: hist.filter((n) => n > 0).length,
                 normalized: norm.stretched, rawRange: [+norm.min.toFixed(4), +norm.max.toFixed(4)],
                 ramp: RAMP, unchanged: ["positions", "normals", "joints", "weights", "indices"] },
    };
}

// ---------------------------------------------------------------------------------------------------------------
// Route 2 -- glyph quads
// ---------------------------------------------------------------------------------------------------------------

/**
 * Sample points over a surface, AREA-WEIGHTED, as {tri, bary} pins riggedExport's blendInfluences() can read.
 *
 * *** AREA-WEIGHTED AND NOT PER-TRIANGLE. *** One sample per triangle puts the same number of glyphs on a huge
 * floor slab as on a fingernail, so the density reads as topology rather than as shading -- exactly the mistake
 * that makes procedural scatter look wrong and nobody can name why. Seeded, so an export is reproducible.
 */
export function surfaceSamples(positions, indices, { count = 4000, seed = 1337 } = {}) {
    const triCount = Math.floor(indices.length / 3);
    if (!triCount) return [];
    const area = new Float64Array(triCount);
    let total = 0;
    for (let t = 0; t < triCount; t++) {
        const a = indices[t * 3] * 3, b = indices[t * 3 + 1] * 3, c = indices[t * 3 + 2] * 3;
        const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
        const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        area[t] = 0.5 * Math.hypot(cx, cy, cz);
        total += area[t];
    }
    if (!(total > 0)) return [];
    const cum = new Float64Array(triCount);
    let run = 0;
    for (let t = 0; t < triCount; t++) { run += area[t]; cum[t] = run / total; }
    const rand = rng(seed >>> 0);
    const out = [];
    for (let i = 0; i < count; i++) {
        const r = rand();
        let lo = 0, hi = triCount - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; }
        // uniform barycentric on a triangle: the sqrt is what stops samples bunching at one corner
        let u = rand(), v = rand();
        const s = Math.sqrt(u);
        const bary = [1 - s, s * (1 - v), s * v];
        out.push({ tri: lo, bary });
    }
    return out;
}

/** Interpolate a per-vertex attribute at a barycentric pin. */
export function baryAttr(arr, stride, tri3, bary) {
    const o = new Array(stride).fill(0);
    for (let c = 0; c < 3; c++) {
        const base = tri3[c] * stride, w = bary[c];
        for (let k = 0; k < stride; k++) o[k] += arr[base + k] * w;
    }
    return o;
}

/**
 * The UV rectangle of one glyph in a single-row atlas of `levels` cells.
 *
 * *** INSET BY HALF A TEXEL, WHICH IS NOT FUSSINESS. *** A quad whose UVs land exactly on a cell boundary
 * samples its neighbour under linear filtering, so every glyph shows a sliver of the next character along its
 * edge -- and at a distance that reads as a blurry mess nobody can attribute to the atlas.
 */
export function glyphUV(level, levels = RAMP.length, atlasPx = 1024) {
    const cell = 1 / levels;
    const half = 0.5 / Math.max(1, atlasPx);
    const u0 = level * cell + half, u1 = (level + 1) * cell - half;
    return { u0, u1, v0: half, v1: 1 - half };
}

/**
 * Build camera-agnostic glyph quads pinned to a surface, ready to be skinned.
 *
 * Returns PLAIN ARRAYS rather than a THREE.BufferGeometry so it stays pure and gateable; the caller assembles.
 * Each quad sits in the tangent plane at its sample, so it follows the surface and the skeleton rather than
 * facing a camera -- a billboarded glyph would need per-frame work no exported file can carry.
 *
 * @param blend  riggedExport's blendInfluences, injected rather than imported, so this module does not depend on
 *               the Krbn export path and the gate can drive it with a stand-in.
 */
export function buildGlyphQuads(parsed, samples, blend, { size = 0.035, levels = RAMP.length, atlasPx = 1024 } = {}) {
    const { positions, normals, indices, joints, weights } = parsed;
    // THE SAME STRETCH AS ROUTE 1, so a glyph and a vertex colour at the same point pick the same level. Two
    // routes disagreeing about what "level 7" means would be a second declaration of the ramp.
    const shade = normalizeShade(shadeVertices(normals)).shade;
    const P = [], UV = [], J = [], W = [], IDX = [], used = new Array(levels).fill(0);
    for (const s of samples) {
        const tri3 = [indices[s.tri * 3], indices[s.tri * 3 + 1], indices[s.tri * 3 + 2]];
        const p = baryAttr(positions, 3, tri3, s.bary);
        const n = baryAttr(normals, 3, tri3, s.bary);
        const nl = Math.hypot(n[0], n[1], n[2]) || 1;
        const nx = n[0] / nl, ny = n[1] / nl, nz = n[2] / nl;
        // a tangent frame from the least-aligned axis, so the cross product never degenerates
        const ax = Math.abs(nx) < 0.9 ? [1, 0, 0] : [0, 1, 0];
        let tx = ay(ax, 1) * nz - ay(ax, 2) * ny, ty = ay(ax, 2) * nx - ay(ax, 0) * nz, tz = ay(ax, 0) * ny - ay(ax, 1) * nx;
        const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
        const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;

        const lvl = rampLevel((shade[tri3[0]] * s.bary[0] + shade[tri3[1]] * s.bary[1] + shade[tri3[2]] * s.bary[2]), levels);
        used[lvl]++;
        const uv = glyphUV(lvl, levels, atlasPx);
        const h = size / 2;
        const base = P.length / 3;
        const corners = [[-h, -h, uv.u0, uv.v0], [h, -h, uv.u1, uv.v0], [h, h, uv.u1, uv.v1], [-h, h, uv.u0, uv.v1]];
        const inf = blend(joints, weights, tri3, s.bary);
        for (const [cu, cv, u, v] of corners) {
            P.push(p[0] + tx * cu + bx * cv, p[1] + ty * cu + by * cv, p[2] + tz * cu + bz * cv);
            UV.push(u, v);
            // EVERY CORNER OF A QUAD TAKES THE SAME FOUR INFLUENCES. Blending per corner would let one corner of
            // a glyph follow a different bone from another and tear the character in half mid-animation.
            J.push(inf.J[0], inf.J[1], inf.J[2], inf.J[3]);
            W.push(inf.W[0], inf.W[1], inf.W[2], inf.W[3]);
        }
        IDX.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return { positions: new Float32Array(P), uvs: new Float32Array(UV),
             joints: new Uint16Array(J), weights: new Float32Array(W), indices: new Uint32Array(IDX),
             stats: { quads: samples.length, vertices: P.length / 3, triangles: IDX.length / 3,
                      levelHistogram: used, ramp: RAMP } };
    function ay(v, i) { return v[i]; }
}
