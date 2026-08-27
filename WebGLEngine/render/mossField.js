// WebGLEngine/render/mossField.js — v4077
// ---------------------------------------------------------------------------------------------------------------
// WHERE THE MOSS GOES. Pure arithmetic, following render/cloudField.js's own shape exactly: seed and placement
// spec in, an array of tuft instances out. No GL, no DOM, no Three -- so the SAME clump of moss can be scattered
// on flat voxel terrain and on a displaced planet shell by one function each, rather than by two renderers that
// started identical and drifted, which is the defect cloudField's own header was written to close for clouds.
//
// Keith: could a moss/root demo (github.com/MengTo/sylva -- all-rights-reserved, so nothing of its CODE is
// reused here, only the idea of ground cover on a real surface) fold into the engine's own terrain generation,
// on both terrain kinds. THIS FILE IS THE SHARED HALF; render/mossPatches.js draws it on voxel terrain and
// es-box3d-fly3d.html draws it on the planet.
//
// *** MOSS IS PATCHY, NOT A CARPET, AND THAT IS THE ONE STRUCTURAL DIFFERENCE FROM GRASS. *** render/vegetation.js
// scatters blades uniformly across a disk; a lawn is the right shape for grass. Moss grows in CLUMPS -- a damp
// hollow, a shaded rock face -- so placement here is two-level: a small number of patch CENTRES scattered across
// the requested area, then several tufts scattered again within each patch's own radius. `patchId` is handed out
// on every tuft precisely so a gate can measure the clumping directly (within-patch spacing tight, between-patch
// spacing loose) rather than trust the code that produced it.
//
// *** AND MOSS PREFERS FLAT GROUND, WHICH IS A REAL ECOLOGICAL FACT RATHER THAN DECORATION. *** Moss has no roots
// to grip a slope the way a tree does and it dries out where water cannot sit, so it thins out as terrain steepens
// and vanishes past some slope entirely. world/planetSurface.js already computes the height field's own gradient
// (surfaceGradient) for the normal it bakes; slopeDensityMul() below reads the SAME number and turns it into a
// tuft-count multiplier -- 1 on flat ground, 0 at or past `maxSlope`, linear between. It is exported and tested in
// isolation from any real terrain, because a formula is a claim this tree can check exactly; "moss looks thin on
// steep ground" in a screenshot is not.
//
// TWO CONSUMERS, TWO GROUND TRUTHS, AND NEITHER IS GUESSED. Voxel terrain has no closed-form height field --
// `accept(x, z)` is INJECTED by the caller (mossPatches.js, reading the live voxel world through terrainTopAt(),
// the same primitive render/vegetation.js already uses) and must answer where the ground actually is; this file
// never invents a height it was not told. The planet shell is the opposite case: world/planetSurface.js's height
// field, gradient and normal are ALL pure functions of direction, so buildMossShell() needs nothing injected and
// is exactly as testable as cloudField's own buildPuffsShell.
//
// *** v4077 -- SPECIES, VIA THE SAME INJECTION SHAPE AS accept/patchDensity, AND A CORRECTION. *** v4076 shipped
// one species and said "no moisture concept exists in world/ yet" -- WRONG, and left uncorrected would be the
// same "recorded conclusion struck rather than left" defect this tree has caught in itself before (v4038's note
// on twoF). world/worleyBiomes.js's biomeAt(x,z,seed) is a REAL Whittaker heat x moisture classification, already
// wired into actual terrain painting via world/biomeTerrain.js. This file still does not know what a biome IS --
// `speciesFor` is injected exactly like `accept`/`patchDensity`, and a caller that does not supply one gets
// "common", the single species v4076 shipped, byte-identical to before. A species name this file does not
// recognise is not guessed at either: MOSS_SPECIES[name] undefined means that patch grows nothing, the same
// refusal shape as an unknown cloud type in render/cloudField.js.
//
// WHAT THIS STILL DOES NOT DO: the procedural ROOT/ARCH geometry Sylva's demo also showed lives in
// world/rootArch.js, a separate file, because it is a standalone decorative structure and not ground cover --
// the two ideas share an inspiration, not a generator.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

import { rng } from "../world/procPlanet.js";               // mulberry32 -- the one seeded PRNG for the whole tree
import { offsetDir } from "./cloudField.js";                 // the SAME tangent-offset arithmetic clouds scatter with
import { surfaceRadiusAt, surfaceNormal, surfaceGradient, makeSurfaceParams } from "../world/planetSurface.js";

/**
 * Four species, keyed by how well a real biome supports moss rather than by an arbitrary palette. Ranges are in
 * WORLD UNITS on voxel terrain; the shell placement rescales tuft SIZE by the caller's `sizeScale` exactly as
 * cloudField's puffLook does for clouds. `colTop`/`colBot` are actual RGB triples, the SAME shape cloudField's
 * TYPES table carries them in -- not a tint scalar the renderer has to reinterpret -- because the four species
 * are meant to look distinct (lush green, dull green, pale lichen-grey, dry brown), which a single hue range
 * mixed by one scalar cannot express. `vigor` is the species' own ceiling on density, independent of slope:
 * a dry-margin species that merely tolerates a place still grows thinner there than a lush one would.
 */
export const MOSS_SPECIES = {
    lush:   { patchRadius: [1.8, 3.6], tuftsPerPatch: [6, 12], tuftScale: [0.22, 0.48],
              colTop: [0.16, 0.34, 0.12], colBot: [0.05, 0.16, 0.05], vigor: 1.00 },   // jungle, forest -- wet and warm
    common: { patchRadius: [1.4, 3.0], tuftsPerPatch: [4, 10], tuftScale: [0.18, 0.42],
              colTop: [0.14, 0.30, 0.10], colBot: [0.05, 0.14, 0.05], vigor: 0.75 },   // plains, shrubland, taiga -- v4076's one species
    pale:   { patchRadius: [1.0, 2.0], tuftsPerPatch: [2, 5],  tuftScale: [0.14, 0.30],
              colTop: [0.55, 0.60, 0.48], colBot: [0.32, 0.38, 0.28], vigor: 0.40 },   // tundra, ice caps -- cold, real reindeer-lichen colouring
    dry:    { patchRadius: [0.8, 1.6], tuftsPerPatch: [1, 3],  tuftScale: [0.12, 0.24],
              colTop: [0.55, 0.46, 0.24], colBot: [0.30, 0.24, 0.12], vigor: 0.20 },   // desert margins, savanna -- sparse and brownish
};

/**
 * TUFT-COUNT MULTIPLIER FROM SLOPE, AS A PURE FORMULA -- 1 on flat ground, 0 at or past maxSlope, linear between.
 * `gradMag` is the magnitude world/planetSurface.js's surfaceGradient already returns (a height field's own
 * dHeight/dAngle in its tangent plane); maxSlope <= 0 means "no slope is acceptable" and returns 0 rather than
 * dividing by it. Kept separate from buildMossShell so a gate can assert monotonicity and the two endpoints
 * exactly, without needing to control a real terrain's gradient to do it.
 */
export function slopeDensityMul(gradMag, maxSlope) {
    if (!(maxSlope > 0)) return 0;
    const g = Math.max(0, gradMag || 0);
    return g >= maxSlope ? 0 : 1 - g / maxSlope;
}

/** One tuft's look, shared by both placements exactly as cloudField's puffLook is shared by both cloud shapes. */
function tuftLook(sp, r, sizeScale) {
    const rnd = (a, b) => a + r() * (b - a);
    const bright = rnd(0.85, 1.15);   // per-tuft brightness jitter within the species' own colours
    const jit = (c) => c.map((v) => Math.min(1, v * bright));
    return {
        scale: rnd(sp.tuftScale[0], sp.tuftScale[1]) * sizeScale,
        colTop: jit(sp.colTop), colBot: jit(sp.colBot),
    };
}

/**
 * THE VOXEL PLACEMENT. `accept(x, z)` must return `{ ok, y }` -- `y` already at the exact placement height (the
 * voxel top-face convention lives in the CALLER, which is the only side that knows it, not here) -- or a falsy
 * `ok` to refuse the site. Refusing to invent a height is the same rule world/instruments.mjs's census refuses to
 * break for a physics claim; ground truth here is exactly as untouchable. No `accept` means no ground truth and
 * this returns [] rather than guessing one.
 *
 * `patchDensity(pcx, pcz)` is the voxel side's equivalent of the shell placement's slope derating, injected for
 * the SAME reason `accept` is: this file does not know what "slope" means on a voxel heightfield, only that a
 * caller might. render/mossPatches.js supplies one built from the SAME slopeDensityMul() the shell path uses --
 * one formula, two terrain kinds, rather than a second slope rule invented for voxels. Defaults to full density
 * so a caller that does not care about slope is unaffected.
 *
 * `speciesFor(pcx, pcz)` picks a MOSS_SPECIES key per patch, defaulting to "common" -- v4076's one species,
 * unchanged for a caller that does not supply one. A name this file does not recognise grows nothing for that
 * patch, the same refusal an unknown cloud type gets.
 */
export function buildMossVoxel({ cx = 0, cz = 0, region = 40, seed = 1, patches = 18, accept,
                                  patchDensity = () => 1, speciesFor = () => "common" } = {}) {
    if (typeof accept !== "function") return [];
    const r = rng(seed >>> 0);
    const rnd = (a, b) => a + r() * (b - a);
    const out = [];
    for (let p = 0; p < patches; p++) {
        // area-uniform patch centre (sqrt keeps density even across the disk rather than bunching at cx,cz)
        const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * region;
        const pcx = cx + Math.cos(a) * rad, pcz = cz + Math.sin(a) * rad;
        const sp = MOSS_SPECIES[speciesFor(pcx, pcz)];
        if (!sp) continue;
        const pr = rnd(sp.patchRadius[0], sp.patchRadius[1]);
        const n = Math.round(rnd(sp.tuftsPerPatch[0], sp.tuftsPerPatch[1]) * patchDensity(pcx, pcz) * sp.vigor);
        for (let i = 0; i < n; i++) {
            const ta = r() * Math.PI * 2, trad = Math.sqrt(r()) * pr;
            const x = pcx + Math.cos(ta) * trad, z = pcz + Math.sin(ta) * trad;
            const g = accept(x, z);
            if (!g || !g.ok) continue;
            const L = tuftLook(sp, r, 1);
            out.push({
                x, y: g.y, z,
                scale: L.scale, colTop: L.colTop, colBot: L.colBot,
                rot: r() * Math.PI * 2,
                patchId: p,
            });
        }
    }
    return out;
}

/**
 * *** THE SHELL PLACEMENT -- moss on a WORLD, exactly parallel to cloudField's buildPuffsShell. *** Patch centres
 * scatter inside a cone of half-angle `coverage` around `dir` (the face somebody is actually near -- generating
 * moss over a whole planet nobody will land on is tufts nobody sees, cloudField's own reason for the same cone).
 * Each patch is slope-derated at ITS OWN centre direction, once, via surfaceGradient + slopeDensityMul; each
 * surviving tuft sits at `surfaceRadiusAt` (the real displaced ground, not the mean radius) and is oriented to
 * `surfaceNormal` there, so a clump lies along the terrain rather than floating level with the planet's core.
 *
 * `speciesFor(dir)` picks a MOSS_SPECIES key per patch centre direction, defaulting to "common" -- v4076's one
 * species. es-box3d-fly3d.html supplies one built from the planet's own type and latitude; a molten or gas world
 * has no solid biosphere-friendly surface at all and can refuse every patch by returning a name this file does
 * not recognise, the same refusal shape as everywhere else in this file.
 *
 * `spec` (world/procPlanet.js's planetSpec) and, implicitly, `surfaceParams` (world/planetSurface.js's own
 * relief/eps/maxTilt bundle, defaulted via makeSurfaceParams() when omitted) are the SAME two objects the mesh
 * displacement and the descent camera already consult -- one more reader of a fact this file does not own.
 */
export function buildMossShell({ center = [0, 0, 0], groundRadius = 17, dir = [0, 0, 1], coverage = 0.45,
                                  seed = 1, spec = null, surfaceParams = null, patches = 14, maxSlope = 4.5,
                                  sizeScale = 1, ampFrac, speciesFor = () => "common" } = {}) {
    if (!spec) return [];
    const P = surfaceParams || makeSurfaceParams();
    const r = rng(seed >>> 0);
    const rnd = (a, b) => a + r() * (b - a);
    const out = [];
    for (let p = 0; p < patches; p++) {
        const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * coverage;
        const base = offsetDir(dir, Math.cos(a) * rad, Math.sin(a) * rad);
        const sp = MOSS_SPECIES[speciesFor(base)];
        if (!sp) continue;
        const g = surfaceGradient(spec, base, P);
        const gradMag = Math.hypot(g.dEast, g.dNorth);
        const densityMul = slopeDensityMul(gradMag, maxSlope) * sp.vigor;
        const pr = rnd(sp.patchRadius[0], sp.patchRadius[1]);
        const n = Math.round(rnd(sp.tuftsPerPatch[0], sp.tuftsPerPatch[1]) * densityMul);
        for (let i = 0; i < n; i++) {
            // linear ground-unit jitter converted to an angle by the same "divide by shell" idiom cloudField
            // uses for cluster spread; groundRadius is moss's own shell, since a tuft sits at ~zero altitude.
            const ex = rnd(-pr, pr) / groundRadius, ez = rnd(-pr, pr) / groundRadius;
            const td = offsetDir(base, ex, ez);
            const radius = surfaceRadiusAt(spec, td, { radius: groundRadius, ampFrac });
            const nrm = surfaceNormal(spec, td, P);
            const L = tuftLook(sp, r, sizeScale);
            out.push({
                x: center[0] + td[0] * radius, y: center[1] + td[1] * radius, z: center[2] + td[2] * radius,
                normal: nrm, dir: td, radius,
                scale: L.scale, colTop: L.colTop, colBot: L.colBot,
                spin: r() * Math.PI * 2,
                patchId: p, gradMag, densityMul,
            });
        }
    }
    return out;
}
