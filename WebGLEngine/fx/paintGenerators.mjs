// WebGLEngine/fx/paintGenerators.mjs -- v4420
//
// *** FIVE WAYS TO MAKE A PICTURE, BEHIND ONE SIGNATURE, SO A POLICY CAN BE ASKED ABOUT ALL OF THEM. ***
//
// brain/rl/paintEnv.js's gate evaluates its learned painter on twenty-four seeds it calls "held-out
// pictures". Every one of them is makeTarget: four flat quadrants and a disc. *** VARYING THE SEED VARIES
// THE COLOURS AND THE SPLIT AND NOTHING ELSE, so "held out" there means held-out SEEDS and was read as
// held-out PICTURES. *** They are not the same claim, and the difference is the whole of this round.
//
// Each entry is (w, h, seed) -> an RGBA image, which is makeTarget's own signature, so the env's default is
// unchanged and every generator drops into the same slot. They are deliberately UNLIKE each other:
//
//   flat      four quadrants and a disc      five flat regions; the training distribution
//   ramp      a linear grey wedge            one axis of variation, no convex structure at all
//   marched   a Wyvill field, sphere-traced  curved shading, a silhouette, a specular
//   krbn      a mesh through Krbn's camera   flat-shaded triangles, hard silhouettes, a graded backdrop
//   fire      a settled Doom fire            37 palette colours, high spatial frequency, no large regions
//
// *** THE SEED HAS TO MEAN SOMETHING IN EVERY ONE OF THEM OR THE COMPARISON IS RIGGED. *** A generator that
// ignored its seed would hand the policy the same picture twenty-four times and report the variance of
// nothing; the gate checks that each one moves under its seed, and by how much, before reading any result
// off it.
"use strict";

import { makeTarget } from "../brain/rl/paintEnv.js";
import { rampTarget, marchedTarget, ballsForProps } from "./paintTargets.mjs";
import { frameFor, krbnTarget } from "./krbnPaint.mjs";
import { fireImage } from "./firePaint.mjs";
import { DoomFire } from "../render/doomFire.mjs";
import { sharedMesh } from "../tools/krbn/krbnCompare.js";
import { sceneMesh } from "../tools/krbn/sceneMeshes.js";

/** The four Krbn scenes, in a fixed order, so a seed selects one reproducibly. */
const KRBN_SCENES = ["blob", "splat", "ragdoll"];

/**
 * The ramp is the only one with nothing to vary but its direction and contrast, so the seed picks those --
 * otherwise it would be the constant picture this file exists to avoid.
 */
function seededRamp(w, h, seed) {
    const im = rampTarget(w, h);
    const s = (seed >>> 0);
    const flip = (s & 1) === 1, vert = (s & 2) === 2, lo = 10 + (s >>> 2) % 60;
    const out = { data: new Uint8ClampedArray(im.data.length), w, h };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const u = (vert ? y / (h - 1) : x / (w - 1));
        const t = flip ? 1 - u : u;
        const v = Math.round(lo + t * (245 - lo));
        const i = (y * w + x) * 4;
        out.data[i] = v; out.data[i + 1] = v; out.data[i + 2] = v; out.data[i + 3] = 255;
    }
    return out;
}

/** A metaball scene whose ball count, sizes and offsets come from the seed. */
function seededMarched(w, h, seed) {
    const s = seed >>> 0;
    const n = 1 + (s % 4);
    const balls = ballsForProps(n).map((b, k) => ({ ...b, cx: b.cx + (((s >>> (k + 2)) % 7) - 3) * 0.12,
                                                   cy: b.cy + (((s >>> (k + 5)) % 7) - 3) * 0.10 }));
    return marchedTarget(w, h, balls, { dx: (((s >>> 9) % 5) - 2) * 0.12, dy: (((s >>> 12) % 5) - 2) * 0.10 });
}

/**
 * One of four meshes, framed by Krbn's own camera, lit from a direction the seed chooses.
 *
 * *** THE LIGHT IS SEEDED BECAUSE THE MESH ALONE IS NOT ENOUGH, AND seedSpread IS WHAT SAID SO. *** The first
 * version picked a mesh with seed % 4 and varied nothing else, so two of six seeds landed on the same mesh
 * and produced BYTE-IDENTICAL pictures -- worstIdenticalFraction 1.0000. A generator that can hand the same
 * picture to two "different" episodes reports the variance of nothing, which is the failure this whole round
 * is about, one level down.
 */
function seededKrbn(w, h, seed) {
    const s = seed >>> 0, k = s % 4;
    const mesh = k === 0 ? sharedMesh(20250716 + (s % 97)) : sceneMesh(KRBN_SCENES[k - 1]);
    const a = ((s >>> 2) % 64) / 64 * Math.PI * 2, b = 0.3 + ((s >>> 8) % 32) / 32 * 0.6;
    const light = [Math.cos(a) * b, Math.sin(a) * b, Math.sqrt(Math.max(0, 1 - b * b))];
    return krbnTarget(mesh, frameFor(mesh, { w, h }), { light }).image;
}

/** A settled fire. The seed is the automaton's seed, so two seeds are two different fires. */
function seededFire(w, h, seed) {
    const f = new DoomFire({ width: w, height: h, seed: seed >>> 0 });
    for (let i = 0; i < 200; i++) f.step();
    return fireImage(f);
}

/** The registry. Keys are stable names; every value has makeTarget's exact signature. */
export const GENERATORS = Object.freeze({
    flat: makeTarget,
    ramp: seededRamp,
    marched: seededMarched,
    krbn: seededKrbn,
    fire: seededFire,
});

export const GENERATOR_NAMES = Object.freeze(Object.keys(GENERATORS));

/**
 * How much a generator actually moves under its seed: the mean pairwise distance between the pictures it
 * makes from a set of seeds. *** A GENERATOR THAT IGNORED ITS SEED WOULD SCORE ZERO HERE AND WOULD MAKE
 * EVERY VARIANCE BELOW IT MEANINGLESS, *** so this is checked before any result is read off one.
 */
export function seedSpread(gen, seeds, { w = 32, h = 32 } = {}) {
    const imgs = seeds.map((s) => gen(w, h, s));
    let sum = 0, n = 0, worstSame = 0;
    for (let i = 0; i < imgs.length; i++) for (let j = i + 1; j < imgs.length; j++) {
        let d = 0, same = 0;
        for (let k = 0; k < imgs[i].data.length; k += 4) {
            for (let c = 0; c < 3; c++) { const e = imgs[i].data[k + c] - imgs[j].data[k + c]; d += e * e; }
            if (imgs[i].data[k] === imgs[j].data[k] && imgs[i].data[k + 1] === imgs[j].data[k + 1] &&
                imgs[i].data[k + 2] === imgs[j].data[k + 2]) same++;
        }
        sum += Math.sqrt(d / (w * h * 3)) / 255; n++;
        worstSame = Math.max(worstSame, same / (w * h));
    }
    return { mean: sum / n, pairs: n, worstIdenticalFraction: worstSame };
}

/**
 * The same generator with its pictures cached per seed. *** A GENERATOR IS DETERMINISTIC IN ITS SEED, so
 * this changes no result -- it exists because the env rebuilds its target on every reset() and the marched
 * and Krbn generators cast a ray per pixel. *** Ten evaluation runs over twenty-four seeds would otherwise
 * rebuild the same 240 pictures ten times, which is the difference between a gate that runs and one nobody
 * runs.
 */
export function memoGenerator(gen, { w = 32, h = 32 } = {}) {
    const cache = new Map();
    return (gw, gh, seed) => {
        if (gw !== w || gh !== h) return gen(gw, gh, seed);
        const k = seed >>> 0;
        if (!cache.has(k)) cache.set(k, gen(w, h, k));
        return cache.get(k);
    };
}

/**
 * One episode per seed, returning what each one improved. *** THE FLOOR AND THE POLICY GO THROUGH THIS SAME
 * FUNCTION, WHICH IS THE POINT OF IT BEING ONE. *** A random floor measured by one loop and a policy measured
 * by a slightly different one is the shape of comparison that drifts silently -- a different step count, a
 * different reset, an env rebuilt per episode in one and reused in the other -- and the whole of this round
 * is a subtraction between the two.
 */
export function episodeImprovements(mkEnv, seeds, act, steps) {
    return seeds.map((s) => {
        const e = mkEnv();
        let o = e.reset(s);
        for (let t = 0; t < steps; t++) o = e.step(act(o, t)).obs;
        return e.startDistance - e.distance();
    });
}

/** A small LCG, so the random painters are reproducible without touching the env's own generators. */
export const lcg = (s) => { let x = (s >>> 0) || 1; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; };

/**
 * The random floor for one generator: several independent uniform painters, their mean and spread.
 *
 * *** IT HAS TO BE RE-MEASURED FOR EVERY GENERATOR AND THAT IS NOT A DETAIL. *** The floors here span 4.5x --
 * 0.028 on a Krbn frame against 0.124 on a ramp -- so "beats random by N sd" is a statement about a
 * DISTRIBUTION and not about a policy. Carrying one generator's floor to another would make a policy look
 * transformative on an easy target and broken on a hard one, with nothing about the policy having changed.
 */
export function randomFloor(mkEnv, seeds, steps, { painters = 8, seed = 1000, stride = 7919 } = {}) {
    const runs = [], per = [];
    for (let k = 0; k < painters; k++) {
        const r = lcg(seed + k * stride);
        const ep = episodeImprovements(mkEnv, seeds, () => [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1, r() * 2 - 1, r() * 2 - 1], steps);
        runs.push(ep.reduce((a, b) => a + b, 0) / ep.length);
        if (k === 0) per.push(...ep);
    }
    const m = runs.reduce((a, b) => a + b, 0) / runs.length;
    return { mean: m, sd: Math.sqrt(runs.reduce((a, b) => a + (b - m) ** 2, 0) / runs.length), runs, per };
}
