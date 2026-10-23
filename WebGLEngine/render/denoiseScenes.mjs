// WebGLEngine/render/denoiseScenes.mjs -- the denoiser arc, round 2: the scenes, the splits and the network's inputs
//
// render/learned-denoiser-preregistration.md fixes WHAT is rendered; this is that, as code, committed and gated before
// a single dataset image exists. Two scene families from one generator, four splits on disjoint seed ranges, the
// first-hit guide buffers, the 9-channel demodulated input and the render seeds -- with the input's and the
// references' seeds distinct by construction (control C5).
//
// *** A DATASET SEED IS REFUSED UNLESS THE CALLER SAYS harvest. *** renderImages() throws for any seed in SPLITS
// or SPLITS_R2-R7 without { harvest: true }, so a gate, a page or a stray experiment cannot look at the data before the harvest
// round does -- the pre-registration's whole value is that nobody saw the numbers first, and this makes "nobody"
// checkable rather than promised. The gate renders seeds outside every split.
"use strict";
import { render, intersect, cameraBasis, pixelRay } from "../physics/render/pathTracer.mjs";
import { rng } from "../physics/render/furnace.mjs";
import { buildVoxelMeshGreedy } from "../mesh/voxelMeshGreedy.js";
import { lathe } from "../mesh/lathe.mjs";
import { extrudePolygon } from "../mesh/extrudePolygon.mjs";
import { MeshBVH } from "../mesh/meshBVH.mjs";
import { buildTable } from "../physics/render/energyCompensation.mjs";

export const IMAGE = 64;          // the pre-registration's 64 x 64
export const SPP_IN = 4;
export const SPP_REF = 1024;
export const ALBEDO_FLOOR = 0.01; // demodulation divides by max(albedo, this)
export const CHANNELS = 9;        // irradiance rgb, albedo rgb, normal xyz -- in that order

const range = (a, n) => Object.freeze(Array.from({ length: n }, (_, i) => a + i));
/** The four splits: family and the scene seeds that belong to it. The ranges do not overlap. */
export const SPLITS = Object.freeze({
    train: Object.freeze({ family: "A", seeds: range(1000, 24) }),
    val: Object.freeze({ family: "A", seeds: range(2000, 4) }),
    T1: Object.freeze({ family: "A", seeds: range(3000, 12) }),
    T2: Object.freeze({ family: "B", seeds: range(4000, 12) }),
});
/**
 * The re-run's splits (pre-registration section 13): the same training and validation scenes, and NEW test scenes on
 * ranges no earlier split touched -- round 1's T1 and T2 were seen at its harvest and are never a test set again.
 */
export const SPLITS_R2 = Object.freeze({
    train: SPLITS.train,
    val: SPLITS.val,
    T1: Object.freeze({ family: "A", seeds: range(5000, 12) }),
    T2: Object.freeze({ family: "B", seeds: range(6000, 12) }),
});
/**
 * The kernel-predicting round's splits (pre-registration section 15): the same training and validation scenes again,
 * and new test scenes on ranges no earlier split touched -- rounds 1 and 2 spent theirs.
 */
export const SPLITS_R3 = Object.freeze({
    train: SPLITS.train,
    val: SPLITS.val,
    T1: Object.freeze({ family: "A", seeds: range(7000, 12) }),
    T2: Object.freeze({ family: "B", seeds: range(8000, 12) }),
});
/**
 * The temporal round's splits (pre-registration section 17): the same training and validation scenes -- each now the
 * last frame of a sequence -- and new test scenes on ranges no earlier split touched.
 */
export const SPLITS_R4 = Object.freeze({
    train: SPLITS.train,
    val: SPLITS.val,
    T1: Object.freeze({ family: "A", seeds: range(9000, 12) }),
    T2: Object.freeze({ family: "B", seeds: range(10000, 12) }),
});
/**
 * The third-family round's splits (pre-registration section 19). A split may now mix families, one per seed, in
 * `families`; familyOf() reads it. Training is 12 scenes of A (round 1's first twelve) and 12 new scenes of B -- still
 * 24, so what changes is the variety and not the amount. H1's test set is 6 new A and 6 new B; H2's is 12 of family C,
 * which nothing is trained on.
 */
const rep = (f, n) => Array(n).fill(f);
export const SPLITS_R5 = Object.freeze({
    train: Object.freeze({ family: "A+B", families: Object.freeze([...rep("A", 12), ...rep("B", 12)]), seeds: Object.freeze([...range(1000, 12), ...range(11000, 12)]) }),
    val: Object.freeze({ family: "A+B", families: Object.freeze(["A", "A", "B", "B"]), seeds: Object.freeze([2000, 2001, 12000, 12001]) }),
    T1: Object.freeze({ family: "A+B", families: Object.freeze([...rep("A", 6), ...rep("B", 6)]), seeds: Object.freeze([...range(13000, 6), ...range(14000, 6)]) }),
    T2: Object.freeze({ family: "C", seeds: range(15000, 12) }),
});
/**
 * The emitter-mask round's splits (pre-registration section 21): round 5's training and validation scenes, and new
 * test scenes -- H1's 6 A + 6 B and H2's 12 of family C -- on ranges no earlier split touched.
 */
export const SPLITS_R6 = Object.freeze({
    train: SPLITS_R5.train,
    val: SPLITS_R5.val,
    T1: Object.freeze({ family: "A+B", families: Object.freeze([...rep("A", 6), ...rep("B", 6)]), seeds: Object.freeze([...range(16000, 6), ...range(17000, 6)]) }),
    T2: Object.freeze({ family: "C", seeds: range(18000, 12) }),
});
/**
 * The randomized round's splits (pre-registration section 23): 96 training scenes of family R, R for validation and
 * for H1, and family C again for H2 -- on ranges no earlier split touched.
 */
export const SPLITS_R7 = Object.freeze({
    train: Object.freeze({ family: "R", seeds: range(20000, 96) }),
    val: Object.freeze({ family: "R", seeds: range(21000, 4) }),
    T1: Object.freeze({ family: "R", seeds: range(22000, 12) }),
    T2: Object.freeze({ family: "C", seeds: range(23000, 12) }),
});
/**
 * Section 26's splits: round 7's training and validation scenes, and NEW test scenes -- H1 on 12 of R (24000), H2 on 12
 * of family C (25000). The one change from round 7 is where C1 is decided, so everything before the tests is round 7's.
 */
export const SPLITS_R8 = Object.freeze({
    train: SPLITS_R7.train,
    val: SPLITS_R7.val,
    T1: Object.freeze({ family: "R", seeds: range(24000, 12) }),
    T2: Object.freeze({ family: "C", seeds: range(25000, 12) }),
});
/** Section 28's splits: round 7's training and validation scenes again, and NEW test scenes -- 12 of R (26000), 12 of C (27000). */
export const SPLITS_R9 = Object.freeze({
    train: SPLITS_R7.train,
    val: SPLITS_R7.val,
    T1: Object.freeze({ family: "R", seeds: range(26000, 12) }),
    T2: Object.freeze({ family: "C", seeds: range(27000, 12) }),
});
/**
 * Section 30's splits: the network TRAINED ON FAMILY C -- 96 scenes (30000), 4 for val (31000) -- with H1 on 12 new
 * scenes of C (32000) and H2 on 12 new scenes of R (33000), the family it is now not trained on.
 */
export const SPLITS_R10 = Object.freeze({
    train: Object.freeze({ family: "C", seeds: range(30000, 96) }),
    val: Object.freeze({ family: "C", seeds: range(31000, 4) }),
    T1: Object.freeze({ family: "C", seeds: range(32000, 12) }),
    T2: Object.freeze({ family: "R", seeds: range(33000, 12) }),
});
/**
 * Section 32's splits, the deployment round: ONE network trained on both families it is to be used on -- round 7's 96
 * scenes of R and round 10's 96 of C, the same scenes, 192 in all -- validated on both rounds' val scenes, with H1 on 12
 * new scenes of R (34000) and H2 on 12 new scenes of C (35000). Neither test family is one it was not trained on.
 */
export const SPLITS_R11 = Object.freeze({
    train: Object.freeze({ family: "R+C", families: Object.freeze([...rep("R", 96), ...rep("C", 96)]), seeds: Object.freeze([...SPLITS_R7.train.seeds, ...SPLITS_R10.train.seeds]) }),
    val: Object.freeze({ family: "R+C", families: Object.freeze([...rep("R", 4), ...rep("C", 4)]), seeds: Object.freeze([...SPLITS_R7.val.seeds, ...SPLITS_R10.val.seeds]) }),
    T1: Object.freeze({ family: "R", seeds: range(34000, 12) }),
    T2: Object.freeze({ family: "C", seeds: range(35000, 12) }),
});
/**
 * Section 79's splits, the mesh round: NO TRAINING. The network and the filter are the ones the device ships (round 11's,
 * render/denoise-net-r11.json), and only test scenes are drawn -- H1 on 12 scenes of family V (voxel structures, 36000),
 * H2 on 12 of family M (lathed and extruded solids, 37000), on ranges no earlier split touched.
 */
export const SPLITS_MESH = Object.freeze({
    T1: Object.freeze({ family: "V", seeds: range(36000, 12) }),
    T2: Object.freeze({ family: "M", seeds: range(37000, 12) }),
});
/**
 * Round 56's splits (pre-registration section 127): the same shapes in family C's materials and light, nothing trained --
 * H1 on 12 scenes of family VC (C's scene, voxel structures, 50000), H2 on 12 of MC (C's scene, lathed and extruded
 * solids, 51000), on ranges no earlier split touched.
 */
/**
 * Round 58's split (pre-registration section 131): path-tracer.html's own six scenes, once each, nothing trained -- H1 on
 * family P at 52000-52005, where seed s draws the page's scene s mod 6 in PAGE_SCENES' order.
 */
export const SPLITS_PAGE = Object.freeze({ T1: Object.freeze({ family: "P", seeds: range(52000, 6) }) });
/** Round 59's split (pre-registration section 133): FSR3's generator between two of round 32's chain frames -- round 32's shape, 6 of R and 6 of C, new seeds. */
export const SPLITS_FRAMEGEN = Object.freeze({
    T1: Object.freeze({ family: "R+C", families: Object.freeze([...rep("R", 6), ...rep("C", 6)]), seeds: Object.freeze([...range(53000, 6), ...range(54000, 6)]) }),
});
export const SPLITS_MESH_C = Object.freeze({
    T1: Object.freeze({ family: "VC", seeds: range(50000, 12) }),
    T2: Object.freeze({ family: "MC", seeds: range(51000, 12) }),
});
/**
 * Section 81's split, the upscale round: ONE test set, read by both hypotheses -- 6 new scenes of R (40000) and 6 of C
 * (41000), the families the shipped network was trained on, so what changes is the RESOLUTION and nothing about the
 * scenes. No training: the network and the filter are the shipped ones.
 */
export const SPLITS_FSR1 = Object.freeze({
    T1: Object.freeze({ family: "R+C", families: Object.freeze([...rep("R", 6), ...rep("C", 6)]), seeds: Object.freeze([...range(40000, 6), ...range(41000, 6)]) }),
});
/**
 * Section 89's split, round 29 -- round 26's question at 256 x 256 (traced and denoised at 128, upscaled by EASU): ONE test set
 * again, 6 new scenes of R (42000) and 6 of C (43000), the families the shipped network was trained on. No training.
 */
export const SPLITS_HALFRES = Object.freeze({
    T1: Object.freeze({ family: "R+C", families: Object.freeze([...rep("R", 6), ...rep("C", 6)]), seeds: Object.freeze([...range(42000, 6), ...range(43000, 6)]) }),
});
/**
 * Section 91's split, round 30 -- round 29's chain with the emitters taken out of the upscale and composited at full size from
 * the geometry: ONE test set again, 6 new scenes of R (44000) and 6 of C (45000), at 256 x 256. No training.
 */
export const SPLITS_EMITTER = Object.freeze({
    T1: Object.freeze({ family: "R+C", families: Object.freeze([...rep("R", 6), ...rep("C", 6)]), seeds: Object.freeze([...range(44000, 6), ...range(45000, 6)]) }),
});
/** Round 32 (section 95): twelve new images for the temporal upscale, six R and six C as round 30's, on seeds no round has used. */
export const SPLITS_TEMPORALUP = Object.freeze({
    T1: Object.freeze({ family: "R+C", families: Object.freeze([...rep("R", 6), ...rep("C", 6)]), seeds: Object.freeze([...range(46000, 6), ...range(47000, 6)]) }),
});
/**
 * Section 116's splits, round 47 (denoise-smaller-network): round 11's training and val scenes exactly -- the 192 the shipped
 * network was trained on -- and 12 new scenes of R (48000) for H1 and 12 of C (49000) for H2, on ranges no earlier split touched.
 */
export const SPLITS_R47 = Object.freeze({ train: SPLITS_R11.train, val: SPLITS_R11.val, T1: Object.freeze({ family: "R", seeds: range(48000, 12) }), T2: Object.freeze({ family: "C", seeds: range(49000, 12) }) });
/** The family of a split's i-th scene: its own entry in `families` when the split mixes them, else the split's. */
export const familyOf = (split, i) => (split.families ? split.families[i] : split.family);
const RESERVED = new Set([SPLITS, SPLITS_R2, SPLITS_R3, SPLITS_R4, SPLITS_R5, SPLITS_R6, SPLITS_R7, SPLITS_R8, SPLITS_R9, SPLITS_R10, SPLITS_R11, SPLITS_MESH, SPLITS_FSR1, SPLITS_HALFRES, SPLITS_EMITTER, SPLITS_TEMPORALUP, SPLITS_R47, SPLITS_MESH_C, SPLITS_PAGE, SPLITS_FRAMEGEN].flatMap((S) => Object.values(S).flatMap((s) => s.seeds)));
export const isDatasetSeed = (seed) => RESERVED.has(seed);

/** The render seeds of a scene: the input, the reference and the second reference -- distinct for every scene seed. */
export function renderSeeds(seed) { return { input: seed * 8 + 1, ref: seed * 8 + 2, ref2: seed * 8 + 3 }; }

/**
 * One scene of a family. Family A: a ground sphere, 3-6 Lambertian spheres, an emitter of radius 0.5, a gradient sky.
 * Family B, the transfer family: half the spheres microfacet (roughness 0.1-0.5, a tinted F0), a hard-band sky,
 * and an emitter of radius 0.25. Spheres rest on the ground and do not overlap. Deterministic in (family, seed).
 */
export function makeScene(family, seed) {
    if (family === "C") return makeSceneC(seed);
    if (family === "R") return makeSceneR(seed);
    if (family === "V" || family === "M" || family === "VC" || family === "MC") return makeSceneMesh(family, seed);
    if (family === "P") return makeScenePage(seed);
    if (family !== "A" && family !== "B") throw new Error("denoiseScenes: family is A, B, C, R, V, M, VC, MC or P, got " + family);
    const r = rng(((seed >>> 0) * 2654435761 + (family === "A" ? 17 : 29)) >>> 0);
    const U = (a, b) => a + (b - a) * r();
    const scene = [{ centre: [0, -100, 0], radius: 100, albedo: [U(0.3, 0.7), U(0.3, 0.7), U(0.3, 0.7)] }];
    const n = 3 + Math.floor(r() * 4), placed = [];
    for (let i = 0, tries = 0; placed.length < n && tries < 400; tries++) {
        const rad = U(0.25, 0.7), x = U(-1.6, 1.6), z = U(-1.6, 1.6);
        if (placed.some((p) => Math.hypot(p[0] - x, p[2] - z) < p[3] + rad + 0.05)) continue;
        placed.push([x, rad, z, rad]);
        const s = { centre: [x, rad, z], radius: rad };
        if (family === "B" && i % 2 === 1) { s.roughness = U(0.1, 0.5); s.F0 = [U(0.3, 1), U(0.3, 1), U(0.3, 1)]; }
        else s.albedo = [U(0.1, 0.9), U(0.1, 0.9), U(0.1, 0.9)];
        scene.push(s); i++;
    }
    const lightRadius = family === "A" ? 0.5 : 0.25;
    scene.push({ centre: [U(-1.5, 1.5), U(2.5, 3.5), U(-1.5, 1.5)], radius: lightRadius, albedo: 0, emit: U(4, 12) });
    let sky, skyKind;
    if (family === "A") { const a = U(0.05, 0.2), b = U(0.2, 0.6); sky = (d) => a + b * 0.5 * (d[1] + 1); skyKind = "gradient"; }
    else { const h = U(-0.1, 0.3), hi = U(0.4, 0.8), lo = U(0.02, 0.1); sky = (d) => (d[1] > h ? hi : lo); skyKind = "band"; }
    const ang = U(0, 2 * Math.PI), ringR = U(4, 5);
    const eye = [ringR * Math.cos(ang), U(1, 2), ringR * Math.sin(ang)];
    return { family, seed, scene, sky, skyKind, lightRadius, eye, look: [0, 0.4, 0], up: [0, 1, 0], fovDeg: 40 };
}

/**
 * Family C, the third family (pre-registration section 19), which no network in this arc is trained on. Its own code
 * path and its own stream, so families A and B draw exactly what they always drew. A night interior:
 * - every even sphere ROUGH diffuse (Oren-Nayar, sigma 0.3-0.7) and every odd one a GLOSSY dielectric reflector
 *   (roughness 0.03-0.1, ior 1.4-1.7) -- neither material is in A or B, and the gloss is sharper than B's 0.1-0.5;
 * - the ground rough diffuse too (sigma 0.2-0.5);
 * - TWO emitters of radius 0.15-0.3, one warm and one cool, of strength 18-42, instead of one white one -- the range
 *   set on scenes outside every split so C's mean radiance (0.19) sits near A's (0.25) and B's (0.24): at 6-14 it was
 *   0.07, and relMSE's 0.01 offset would have made a dark family easy rather than unseen;
 * - a near-black uniform sky (0.01-0.05).
 * The camera ring is A's and B's.
 */
function makeSceneC(seed) {
    const r = rng(((seed >>> 0) * 2654435761 + 37) >>> 0);
    const U = (a, b) => a + (b - a) * r();
    const scene = [{ centre: [0, -100, 0], radius: 100, albedo: [U(0.3, 0.7), U(0.3, 0.7), U(0.3, 0.7)], sigma: U(0.2, 0.5) }];
    const n = 3 + Math.floor(r() * 4), placed = [];
    for (let i = 0, tries = 0; placed.length < n && tries < 400; tries++) {
        const rad = U(0.25, 0.7), x = U(-1.6, 1.6), z = U(-1.6, 1.6);
        if (placed.some((p) => Math.hypot(p[0] - x, p[2] - z) < p[3] + rad + 0.05)) continue;
        placed.push([x, rad, z, rad]);
        const s = { centre: [x, rad, z], radius: rad };
        if (i % 2 === 1) { s.roughness = U(0.03, 0.1); s.ior = U(1.4, 1.7); }
        else { s.albedo = [U(0.1, 0.9), U(0.1, 0.9), U(0.1, 0.9)]; s.sigma = U(0.3, 0.7); }
        scene.push(s); i++;
    }
    for (const tint of [[1, 0.7, 0.4], [0.4, 0.6, 1]]) {
        const e = U(18, 42);
        scene.push({ centre: [U(-1.8, 1.8), U(1.8, 3.2), U(-1.8, 1.8)], radius: U(0.15, 0.3), albedo: 0, emit: tint.map((t) => t * e) });
    }
    const k = U(0.01, 0.05), sky = () => k;
    const ang = U(0, 2 * Math.PI), ringR = U(4, 5);
    const eye = [ringR * Math.cos(ang), U(1, 2), ringR * Math.sin(ang)];
    return { family: "C", seed, scene, sky, skyKind: "dark", lightRadius: null, eye, look: [0, 0.4, 0], up: [0, 1, 0], fovDeg: 40 };
}

/**
 * Family R, the randomized generator (pre-registration section 23). Every scene draws its own mix from a broad menu --
 * and the menu covers families A and B -- but NOTHING that makes family C what it is, so C stays a family no R-trained
 * method has seen:
 * - a Lambertian ground, albedo 0.2-0.8 per channel;
 * - 2-8 spheres of radius 0.15-0.8 resting on the ground within |x|, |z| <= 2, each either Lambertian (albedo 0.05-0.95
 *   per channel, two in three) or a microfacet CONDUCTOR (roughness 0.05-0.8, tinted F0 0.2-1 per channel, one in three);
 * - 1-2 WHITE emitters of radius 0.15-0.5 at height 1.5-3.5 within |x|, |z| <= 2, sharing a POWER (radius^2 x
 *   strength) of 0.4-3 -- the span families A, B and C cover -- each of strength power / radius^2, at most 30. Drawn
 *   first as 1-3 emitters of strength 3-30, R was four times as bright as A (mean radiance 0.96 against 0.25, on scenes
 *   outside every split) and its noisy input up to ten times as far from its reference;
 * - a sky that is a gradient (a 0.02-0.3, b 0.1-0.8), a band (horizon -0.2-0.4, hi 0.2-1, lo 0.02-0.2) or uniform
 *   (0.1-0.8), a third each;
 * - the eye on a ring of radius 3.5-5.5 at height 0.7-2.5, looking at (0, 0.4, 0), field of view 40 degrees.
 * Never drawn: a rough-diffuse (Oren-Nayar) surface, a dielectric (ior), a coloured emitter, a near-black sky.
 */
function makeSceneR(seed) {
    const r = rng(((seed >>> 0) * 2654435761 + 41) >>> 0);
    const U = (a, b) => a + (b - a) * r();
    const scene = [{ centre: [0, -100, 0], radius: 100, albedo: [U(0.2, 0.8), U(0.2, 0.8), U(0.2, 0.8)] }];
    const n = 2 + Math.floor(r() * 7), placed = [];
    for (let tries = 0; placed.length < n && tries < 600; tries++) {
        const rad = U(0.15, 0.8), x = U(-2, 2), z = U(-2, 2);
        if (placed.some((p) => Math.hypot(p[0] - x, p[2] - z) < p[3] + rad + 0.05)) continue;
        placed.push([x, rad, z, rad]);
        const s = { centre: [x, rad, z], radius: rad };
        if (r() < 2 / 3) s.albedo = [U(0.05, 0.95), U(0.05, 0.95), U(0.05, 0.95)];
        else { s.roughness = U(0.05, 0.8); s.F0 = [U(0.2, 1), U(0.2, 1), U(0.2, 1)]; }
        scene.push(s);
    }
    // the light is drawn as POWER (radius^2 x strength), over the span A, B and C cover (about 0.5-3), and split between
    // one or two emitters; strength = power / radius^2, capped at 30
    const lights = 1 + Math.floor(r() * 2), power = U(0.4, 3) / lights;
    for (let i = 0; i < lights; i++) {
        const rad = U(0.15, 0.5);
        scene.push({ centre: [U(-2, 2), U(1.5, 3.5), U(-2, 2)], radius: rad, albedo: 0, emit: Math.min(30, power / (rad * rad)) });
    }
    let sky, skyKind;
    const kind = r();
    if (kind < 1 / 3) { const a = U(0.02, 0.3), b = U(0.1, 0.8); sky = (d) => a + b * 0.5 * (d[1] + 1); skyKind = "gradient"; }
    else if (kind < 2 / 3) { const h = U(-0.2, 0.4), hi = U(0.2, 1), lo = U(0.02, 0.2); sky = (d) => (d[1] > h ? hi : lo); skyKind = "band"; }
    else { const k = U(0.1, 0.8); sky = () => k; skyKind = "uniform"; }
    const ang = U(0, 2 * Math.PI), ringR = U(3.5, 5.5);
    const eye = [ringR * Math.cos(ang), U(0.7, 2.5), ringR * Math.sin(ang)];
    return { family: "R", seed, scene, sky, skyKind, lightRadius: null, eye, look: [0, 0.4, 0], up: [0, 1, 0], fovDeg: 40 };
}

/**
 * Families V and M, the mesh round (pre-registration section 79): THE ENGINE'S OWN GEOMETRY IN FAMILY R'S SCENES.
 * Each draws family R's scene for its own seed -- the ground, the emitters, the sky, the camera, and every resting
 * sphere's place, size and material, exactly as R would -- and then replaces each resting sphere by a closed triangle
 * mesh built by this tree's own mesh code, in the sphere's footprint (its centre, a box of side 2 x radius, resting on
 * the ground) and with the sphere's material. So the ONE thing that differs from the family the network was trained
 * on is the shape: flat faces, hard edges, normals that jump. The shapes draw from their own stream, so R's draws are
 * R's whatever V and M do.
 * - **V, voxel structures:** a grid of 3-6 cells a side, grown from the bottom centre cell by adding random face
 *   neighbours until 35-70% of the grid is filled, meshed by mesh/voxelMeshGreedy.js -- voxel-viewer.html's own builder.
 * - **M, solids:** half lathed (mesh/lathe.mjs: 3-6 rows from the ground to 70-100% of the box's height, each of radius
 *   30-100% of the sphere's, 48 segments), half extruded (mesh/extrudePolygon.mjs: a star-shaped polygon of 3-8 points
 *   at 40-100% of the sphere's radius, stood upright, 50-100% of the box's height).
 * Every mesh is wound OUTWARD (its signed volume positive) -- the tracer takes a hit's normal as it comes, and a sphere's
 * always faces out. The emitters stay spheres: next-event estimation samples a sphere's solid angle.
 */
/*
 * Families VC and MC (round 56, pre-registration section 127): the same shapes in FAMILY C's scene -- its Oren-Nayar
 * ground, its two coloured emitters, its near-black sky, its camera, and every resting sphere's place, size and material
 * (rough-diffuse, or a dielectric reflector) -- each sphere replaced as V and M replace R's. A dielectric's albedo, like a
 * conductor's, is never read and set to 0.
 */
const MESH_SALT = Object.freeze({ V: 43, M: 47, VC: 53, MC: 59 });
/** Signed volume of a flat triangle buffer (9 floats a triangle): positive when the mesh is wound outward. */
export function signedVolume(tris) {
    let v = 0;
    for (let o = 0; o < tris.length; o += 9) {
        const [ax, ay, az, bx, by, bz, cx, cy, cz] = tris.subarray(o, o + 9);
        v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    }
    return v;
}
/** A flat triangle buffer from flat positions and indices, each vertex through `at`, wound outward. */
function outward(positions, indices, at) {
    const tris = new Float64Array(indices.length * 3);
    for (let t = 0; t < indices.length; t++) {
        const p = at(positions[indices[t] * 3], positions[indices[t] * 3 + 1], positions[indices[t] * 3 + 2]);
        tris[t * 3] = p[0]; tris[t * 3 + 1] = p[1]; tris[t * 3 + 2] = p[2];
    }
    if (signedVolume(tris) < 0) for (let o = 0; o < tris.length; o += 9) for (let k = 0; k < 3; k++) {
        const b = tris[o + 3 + k]; tris[o + 3 + k] = tris[o + 6 + k]; tris[o + 6 + k] = b;
    }
    return tris;
}
function voxelMesh(U, r, x, rad, z) {
    const N = 3 + Math.floor(r() * 4), want = Math.max(2, Math.round(U(0.35, 0.7) * N * N * N)), c = Math.floor(N / 2);
    const key = (b) => b.join(","), have = new Set([key([c, 0, c])]), blocks = [[c, 0, c]];
    const steps = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (let tries = 0; blocks.length < want && tries < 20000; tries++) {
        const b = blocks[Math.floor(r() * blocks.length)], d = steps[Math.floor(r() * 6)];
        const q = [b[0] + d[0], b[1] + d[1], b[2] + d[2]];
        if (q.some((v) => v < 0 || v >= N) || have.has(key(q))) continue;
        have.add(key(q)); blocks.push(q);
    }
    // MESHED BY voxel-viewer.html's OWN BUFFER BUILDER, not by a corner rule written here. A first draft built the
    // quads from greedyMesh3d directly and got both halves of the convention wrong: a quad's pos is its CELL, not
    // its face plane, so every +x, +y and +z face sat one cell inside its block, facing in -- conductors rendered
    // black. buildVoxelMeshGreedy places each face at +-0.5 about the voxel's centre and winds each quad by its own
    // normal, and mesh/voxelMeshGreedy-selfcheck.mjs proves that per quad.
    const m = buildVoxelMeshGreedy(blocks.map((b) => [b[0], b[1], b[2], 0])), size = (2 * rad) / N;
    return outward(m.positions, m.indices, (a, b, cc) => [x - rad + (a + 0.5) * size, (b + 0.5) * size, z - rad + (cc + 0.5) * size]);
}
function solidMesh(U, r, x, rad, z) {
    if (r() < 0.5) {
        const K = 3 + Math.floor(r() * 4), h = 2 * rad * U(0.7, 1);
        const rows = Array.from({ length: K }, (_, k) => ({ y: (h * k) / (K - 1), r: rad * U(0.3, 1) }));
        const m = lathe({ axis: 0, rows }, 48);
        return outward(m.positions, m.indices, (a, b, c) => [x + a, b, z + c]);
    }
    const n = 3 + Math.floor(r() * 6), h = 2 * rad * U(0.5, 1), phase = U(0, 2 * Math.PI);
    const pts = Array.from({ length: n }, (_, i) => {
        const t = phase + (2 * Math.PI * (i + U(-0.3, 0.3))) / n, rr = rad * U(0.4, 1);
        return [rr * Math.cos(t), rr * Math.sin(t)];
    });
    const m = extrudePolygon(pts, h);
    // extruded along z from -h/2 to h/2: z becomes height (0..h), the polygon lies in x and z
    return outward(m.positions, m.indices, (a, b, c) => [x + a, c + h / 2, z + b]);
}
function makeSceneMesh(family, seed) {
    const C = family.length === 2, S = C ? makeSceneC(seed) : makeSceneR(seed), shape = family[0];   // round 56: VC and MC on C
    const r = rng(((seed >>> 0) * 2654435761 + MESH_SALT[family]) >>> 0);
    const U = (a, b) => a + (b - a) * r();
    const scene = S.scene.map((o, i) => {
        if (i === 0 || o.emit) return o;                       // the ground and the emitters, as R drew them
        const [x, , z] = o.centre, rad = o.radius;
        const tris = shape === "V" ? voxelMesh(U, r, x, rad, z) : solidMesh(U, r, x, rad, z);
        const { centre, radius, ...material } = o;             // the sphere's material, nothing else
        // A CONDUCTOR'S albedo IS NEVER READ -- its branch returns before the Lambertian alb() and its light
        // sampling skips the Lambertian loop -- but the tracer refuses a mesh entry without the field, so it gets
        // 0. render/denoiseScenes-selfcheck renders one conductor mesh at albedo 0 and at 1 and holds them equal.
        if (material.albedo === undefined) material.albedo = 0;
        return { ...material, bvh: new MeshBVH(tris), mesh: { kind: family, tris: tris.length / 9, footprint: [x, rad, z, rad] } };
    });
    return { ...S, family, seed, scene };
}

/**
 * Family P (round 58, pre-registration section 131): path-tracer.html's own scenes, as its SCENES object writes them -- RHO
 * 0.18, roughcomp's table built as the page builds it -- seen from its camera (eye (0, 0, 4) at the origin, 40 degrees) at its
 * default depth, the slider's 6 bounces. Seed s draws scene s mod 6, in this order. render/denoiseScenes-selfcheck.mjs holds
 * each scene's literal to the page's text.
 */
export const PAGE_SCENES = Object.freeze(["furnace", "gradient", "pair", "enclosed", "rough", "roughcomp"]);
export const PAGE_DEPTH = 6;
const PAGE_RHO = 0.18;
let pageTable = null;   // buildTable is 24 quadratures: built once, on first use, as the page builds it at load
function makeScenePage(seed) {
    const name = PAGE_SCENES[((seed % 6) + 6) % 6];
    const def = {
        furnace: () => ({ scene: [{ centre: [0, 0, 0], radius: 1, albedo: PAGE_RHO }], sky: () => 1 }),
        gradient: () => ({ scene: [{ centre: [0, 0, 0], radius: 1, albedo: 0.6 }], sky: (d) => 0.25 + 1.75 * Math.max(0, d[1]) }),
        pair: () => ({ scene: [{ centre: [0, -0.4, 0], radius: 1, albedo: 0.7 }, { centre: [0.9, 1.5, 0.4], radius: 0.7, albedo: 0.35 }], sky: (d) => 0.3 + 1.4 * Math.max(0, d[1]) }),
        enclosed: () => ({ scene: [{ centre: [0, 0, 0], radius: 1, albedo: PAGE_RHO }, { centre: [0, 0, 0], radius: 40, emit: 1, albedo: 0 }], sky: () => 0 }),
        rough: () => ({ scene: [{ centre: [0, 0, 0], radius: 1, roughness: 0.8 }], sky: () => 1 }),
        roughcomp: () => ({ scene: [{ centre: [0, 0, 0], radius: 1, roughness: 0.8, msTable: (pageTable ||= buildTable(0.8, { K: 24, N: 140, M: 140 })) }], sky: () => 1 }),
    }[name]();
    return { family: "P", seed, page: name, ...def, skyKind: name, lightRadius: null, eye: [0, 0, 4], look: [0, 0, 0], up: [0, 1, 0], fovDeg: 40, maxDepth: PAGE_DEPTH };
}

/**
 * The guide buffers at each pixel's CENTRE ray's first hit: base colour (albedo on a Lambertian surface, F0 on a
 * microfacet one, 1 where the ray meets the sky or an emitter -- neither has a surface colour to divide out) and the
 * unit normal (0 on sky). Both H x W x 3, channels last.
 */
export function guideBuffers(S, w = IMAGE, h = IMAGE, offset = null) {
    // round 32: `offset` [dx, dy] shifts the pixel grid as the path tracer's pixelOffset does, so a jittered frame's guides are its own
    const B = cameraBasis(S), albedo = new Float64Array(w * h * 3), normal = new Float64Array(w * h * 3), ox = offset ? offset[0] : 0, oy = offset ? offset[1] : 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const hit = intersect(S.eye, pixelRay(x, y, 0.5 + ox, 0.5 + oy, w, h, B), S.scene), i = (y * w + x) * 3;
        let c = [1, 1, 1];
        if (hit && !hit.sphere.emit) {
            const src = hit.sphere.roughness !== undefined ? (hit.sphere.F0 ?? 1) : hit.sphere.albedo;
            c = typeof src === "number" ? [src, src, src] : src;
        }
        albedo[i] = c[0]; albedo[i + 1] = c[1]; albedo[i + 2] = c[2];
        if (hit) { normal[i] = hit.N[0]; normal[i + 1] = hit.N[1]; normal[i + 2] = hit.N[2]; }
    }
    return { albedo, normal };
}

/**
 * Render a scene's images: the 4-sample input, the 1024-sample reference and, with `ref2`, the second reference.
 * *** THROWS FOR A DATASET SEED WITHOUT { harvest: true }. *** `w`, `h` and the sample counts can be lowered for a
 * gate; the harvest uses the pre-registered defaults.
 */
export function renderImages(family, seed, { harvest = false, ref2 = false, w = IMAGE, h = IMAGE, sppIn = SPP_IN, sppRef = SPP_REF } = {}) {
    if (isDatasetSeed(seed) && !harvest) throw new Error(`denoiseScenes: seed ${seed} is a dataset seed -- rendering it needs { harvest: true }`);
    const S = makeScene(family, seed), rs = renderSeeds(seed);
    // round 58: a scene that names its depth (family P, the page's 6 bounces) is rendered at it; every other family at the tracer's default
    const opts = (spp, s) => ({ w, h, spp, seed: s, rgb: true, eye: S.eye, look: S.look, up: S.up, fovDeg: S.fovDeg, sky: S.sky, ...(S.maxDepth ? { maxDepth: S.maxDepth } : {}) });
    const out = { family, seed, w, h, seeds: rs, input: render(S.scene, opts(sppIn, rs.input)), ref: render(S.scene, opts(sppRef, rs.ref)), ...guideBuffers(S, w, h) };
    if (ref2) out.ref2 = render(S.scene, opts(sppRef, rs.ref2));
    return out;
}

/**
 * The channel stride of an input of `n` pixels. Every input starts with the nine channels above -- [the irradiance to
 * denoise, albedo, normal] -- and the temporal round (section 16) appends four more after them, so a filter or a head
 * that reads the first nine reads them at this stride. Anything but a whole number of at least nine is refused.
 */
export function strideOf(x, n) {
    const C = x.length / n;
    if (!Number.isInteger(C) || C < CHANNELS) throw new Error(`denoiseScenes: ${x.length} values over ${n} pixels is not an input of at least ${CHANNELS} channels`);
    return C;
}

/** The network's input: H x W x 9, [noisy irradiance rgb, albedo rgb, normal xyz], irradiance = radiance / max(albedo, floor). */
export function inputChannels(noisy, albedo, normal, w = IMAGE, h = IMAGE) {
    const x = new Float64Array(w * h * CHANNELS);
    for (let p = 0; p < w * h; p++) for (let c = 0; c < 3; c++) {
        const a = albedo[p * 3 + c];
        x[p * CHANNELS + c] = noisy[p * 3 + c] / Math.max(a, ALBEDO_FLOOR);
        x[p * CHANNELS + 3 + c] = a;
        x[p * CHANNELS + 6 + c] = normal[p * 3 + c];
    }
    return x;
}
/** Irradiance back to radiance: multiply by max(albedo, floor), the exact inverse of the division above. */
export function remodulate(irr, albedo) {
    const y = new Float64Array(irr.length);
    for (let i = 0; i < irr.length; i++) y[i] = irr[i] * Math.max(albedo[i], ALBEDO_FLOOR);
    return y;
}
