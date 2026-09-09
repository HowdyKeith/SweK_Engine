// WebGLEngine/physics/render/fresnelF82.mjs -- v4584
//
// *** THE CORRECTION SCHLICK'S FRESNEL HAS NO ROOM FOR. *** physics/render/fresnel.mjs's own schlick() is exact
// at both ends (F0 at normal incidence, F -> 1 at grazing) and wrong in a specific, named way in between: every
// metal's curve rides the SAME (1-cosTheta)^5 shape from F0 up to white, regardless of what that metal's real,
// polarised Fresnel response actually does near grazing. Real metals often do NOT go pure white there -- gold's
// grazing edge reads warmer than Schlick predicts, for instance -- and that is a genuine physical effect Schlick
// cannot represent at all, not a rounding error. This file adds it back as a small correction on top of Schlick,
// not a second Fresnel model: microfacet.mjs and energyCompensation.mjs are untouched, and schlick() itself is
// called, not restated.
//
// PROVENANCE, AND WHAT WAS AND WASN'T READ. The technique is Naty Hoffman's, from "Fresnel Equations Considered
// Harmful" (SIGGRAPH courses), popularised as "F82-tint" by Kutz et al.'s "Novel aspects of the Adobe Standard
// Material" (SIGGRAPH 2021 Physically Based Shading course notes) and since adopted by the OpenPBR Surface
// specification and Blender's Principled BSDF. tools/ship/nextRounds.mjs's own f82-tint-metal-fresnel entry
// flagged that portsmouth/F82-tint-generator -- a tool built around this same published technique -- is NOT in
// world/licenceSweep.mjs and said "verify before vendoring, not before reading". Nothing from that repo was read
// or used. The formula below was instead RE-DERIVED from its published defining property (three pinned points,
// see below) and then cross-checked against the exact published numeric constants (17.6513846, and 49/6 =
// 8.16666...) in boksajak/brdf's evalFresnelHoffman() -- a widely-cited open BRDF reference, read ONLY to verify
// the derivation's constants, not copied: the code below is independently written, in this tree's own idioms,
// calling schlick() rather than re-expanding it, which is not how that reference (or Hoffman's original,
// pre-simplified form) is written. See this file's own selfcheck for the algebraic cross-check itself.
//
// THE CONSTRUCTION: exactly three points are pinned and nothing else is free.
//   F(1)   = F0     normal incidence, unchanged from Schlick
//   F(0)   = 1       grazing, unchanged from Schlick's own F90 = 1 (schlick() has no F90 parameter and neither
//                     does this -- an inherited, named simplification, not a new one)
//   F(1/7) = b       the caller's OWN target reflectance at the model's pinned angle (cos(theta) = 1/7 is
//                     approximately 81.79 degrees, informally "82" -- this is what "F82" names)
// A correction term shaped mu(1-mu)^6 is EXACTLY zero at mu=0 and mu=1 by construction, so it cannot disturb
// either endpoint regardless of its scale; that scale is then the one value that makes the term supply exactly
// (b - schlick(1/7, F0)) at mu=1/7, pinning the curve to b there. The whole model is schlick() plus one weighted
// bump, not a new curve.
//
// *** HONEST LIMIT ON THE EXPONENT ITSELF, NAMED RATHER THAN IMPLIED. *** The THREE constraints above (zero at
// both ends, pinned value at the interior point) are satisfied by mu(1-mu)^n for ANY positive integer n, and are
// independently verified by computation in this file's own selfcheck regardless of which n is used -- they do
// not, by themselves, single out n = 6 as "the" correct exponent. n = 6 is a modelling choice from the published
// construction (it is what "F82" is built around, and it is confirmed by the exact match to boksajak/brdf's own
// shipped constants above), not something this file re-derives from first principles the way, say, split-sum's
// A + B was independently re-derived against energyCompensation's directional albedo. A reader who wants that
// deeper, computed-from-nothing-but-physics confirmation of n = 6 specifically would need real, tabulated
// (F0, F82) data for an actual metal (measured from its complex refractive index) to compare against -- which is
// what portsmouth/F82-tint-generator computes, unread here, and is this file's own honestly-named remainder.
"use strict";
import { schlick } from "./fresnel.mjs";

/** cos(theta) at the model's own pinned angle. "F82" is 1/7 read as the nearest whole degree (81.79 deg). */
export const MU_PIN = 1 / 7;

/** mu(1-mu)^6 -- zero at mu=0 AND mu=1 by construction, which is what lets the correction touch only the
 *  interior of the curve. Exported so the selfcheck can assert the zeros directly rather than through f82Tint. */
export const edgeShape = (mu) => mu * Math.pow(1 - mu, 6);

/** edgeShape's own value at MU_PIN -- fixed once, not a function of F0 or b, and never zero (MU_PIN is neither
 *  0 nor 1), so dividing by it is always well-defined. */
export const PIN_WEIGHT = edgeShape(MU_PIN);

/**
 * The F82-tint correction to Schlick's Fresnel. `cosI` is cos(theta) at the shading angle, `F0` is schlick()'s
 * own normal-incidence parameter (unchanged meaning), `b` is the desired reflectance AT the pinned angle
 * (mu = 1/7) -- Hoffman's own "F82" value, an edge-tint colour when called once per channel the way schlick()
 * already is throughout this tree (physics/render/principled.mjs's own per-channel f0 loop, for instance).
 *
 * Passing `b = schlick(MU_PIN, F0)` -- asking for exactly what Schlick already gives at the pin -- collapses
 * this to schlick(cosI, F0) EXACTLY, at every angle, not only at the pin: the correction's own coefficient is
 * (schlick(MU_PIN, F0) - b), which is then zero everywhere. Asserted bit-identical, not merely close, in this
 * file's own selfcheck.
 */
export function f82Tint(cosI, F0, b) {
    const mu = Math.min(1, Math.max(0, cosI));
    const Fs = schlick(mu, F0);
    const FsPin = schlick(MU_PIN, F0);
    return Fs - edgeShape(mu) * (FsPin - b) / PIN_WEIGHT;
}
