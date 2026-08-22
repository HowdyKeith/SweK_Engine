// WebGLEngine/physics/mpm/heteroMaterial.js — v3840 (two DIFFERENT materials on one MPM grid)
//
// mpmcouple (v3803) already grades two-BODY contact -- bodies stop and never overlap, momentum conserved -- but
// both bodies there run the SAME material. This is the other half of "two-material": genuinely DIFFERENT materials
// (a soft body and a stiff one) sharing the grid, coupling with no contact code, each deforming according to its
// OWN stiffness. The capability is per-particle material: step.mjs now reads `p.mat` for the elastic stress and
// the Drucker-Prager return, falling back to the global params when a particle has none (so every prior figure is
// unchanged). This file is the thin, pure side -- build a labelled material block and measure momentum and
// deformation. No GL, no Three, no DOM. Gated in physics/mpm/heteroMaterial-selfcheck.mjs.

import { restBlock } from "./step.mjs";

// A rest block whose every particle carries a material (`mat` = { lambda, mu, alpha? } or null for the global
// default), an initial x-velocity, and a tag so the two bodies can be told apart afterwards.
export function materialBlock(spec) {
    const ps = restBlock(spec);
    for (const p of ps) { if (spec.mat) p.mat = spec.mat; p.vx = spec.vx || 0; p.tag = spec.tag; }
    return ps;
}

// Total linear momentum components of a particle set.
export function totalPx(ps) { let s = 0; for (const p of ps) s += p.m * p.vx; return s; }
export function totalPy(ps) { let s = 0; for (const p of ps) s += p.m * p.vy; return s; }

// Mean elastic deformation of a set: average Frobenius distance of F from the identity. Zero for undeformed
// material; larger the more the body has been squashed or sheared.
export function meanDeformation(ps) {
    let s = 0;
    for (const p of ps) { const F = p.F; s += Math.hypot(F[0] - 1, F[1], F[2], F[3] - 1); }
    return ps.length ? s / ps.length : 0;
}

// The particles of a combined set carrying a given tag (one body out of the pair).
export function byTag(ps, tag) { return ps.filter((p) => p.tag === tag); }

// Centroid x of a set (for the no-pass-through / ordering checks).
export function centroidX(ps) { let s = 0; for (const p of ps) s += p.x; return ps.length ? s / ps.length : 0; }
