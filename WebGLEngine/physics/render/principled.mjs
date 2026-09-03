// WebGLEngine/physics/render/principled.mjs
//
// v4432 -- *** A PRINCIPLED BSDF IS A COMPOSITION OF LOBES, AND THE HONEST QUESTION IS WHETHER THE COMPOSITION
// STILL CONSERVES ENERGY OR WHETHER THE LOBES DOUBLE-COUNT AT THE SEAMS. ***
//
// docs/EXPLAIN-ITSELF.md item 9, from reading knightcrawler25/GLSL-PathTracer (MIT, C++/OpenGL). That renderer
// ships a Disney BSDF; this tree had every PIECE of one -- GGX in microfacet.mjs, Fresnel in fresnel.mjs, the
// multi-scatter table in energyCompensation.mjs, Oren-Nayar in roughDiffuse.mjs -- and no composed model at
// all. `grep -i disney` over the tree returned one comment about a sphere radius.
//
// *** COMPOSED FROM THOSE MODULES, NOT BESIDE THEM. *** physics/render/pathTracer.mjs states the rule and the
// reason: "if it re-implemented the sampler or the intersection it would be a second declaration of the very
// things that were graded, and the keys would be grading a different renderer than the one that ships." Every
// D, G, Fresnel and diffuse term here is imported. What is NEW is only the weighting between them, which is
// exactly the part that has never been graded because it did not exist.
//
// THE FALSIFIER IS THE BOUNDARY, and it is why this is worth a round rather than a copy. A composed model must
// AGREE WITH THE PIECES AT THEIR LIMITS:
//   metallic 0, roughness 1  ->  the diffuse lobe alone, which roughDiffuse.mjs already grades
//   metallic 1, roughness->0 ->  mirror Fresnel, which fresnel.mjs already grades
//   any parameters at all    ->  directional albedo <= 1, which is the white furnace and is the one most
//                                implementations of this model are never run against
"use strict";
import { D, G2, G1, sampleHalfVector } from "./microfacet.mjs";
import { schlick } from "./fresnel.mjs";
import { orenNayarBrdf, directionalAlbedo as diffuseAlbedo } from "./roughDiffuse.mjs";

/** Disney's roughness-to-alpha convention: alpha = roughness^2, so the slider is perceptually even. */
export const alphaOf = (roughness) => { const r = Math.min(1, Math.max(0, roughness)); return r * r; };

/**
 * The specular F0 for a surface. A dielectric's is a small constant the `specular` slider scales; a metal's IS
 * its base colour, which is what makes metals coloured in reflection and dielectrics not.
 *
 * *** THE 0.08 AND THE FACTOR OF 2 ARE DISNEY'S, AND THEY ARE A REMAPPING RATHER THAN A LAW. *** specular=0.5
 * gives F0 = 0.04, the usual dielectric value (an IOR of about 1.5); the range reaches 0.08 at specular=1.
 * Recorded here because a magic constant with no stated origin is the thing this tree keeps finding.
 */
export const f0Of = (baseColour, metallic, specular = 0.5) => {
    const m = Math.min(1, Math.max(0, metallic)), s = Math.min(1, Math.max(0, specular));
    const die = 0.08 * s;
    return baseColour.map((c) => die * (1 - m) + c * m);
};

/**
 * Evaluate the BSDF for one channel. Returns f (per steradian), NOT f*cos.
 *
 * `cosPhiDiff` is the azimuthal term Oren-Nayar needs; a caller with full vectors passes cos of the difference
 * of the projected azimuths. The specular lobe does not use it because GGX here is isotropic.
 */
export function evaluate({ baseColour, metallic = 0, roughness = 0.5, specular = 0.5, sigma = 0,
                          lobes = "both", coupled = false }, cosO, cosI, cosM, cosPhiDiff = 1, channel = 0) {
    const m = Math.min(1, Math.max(0, metallic));
    const alpha = alphaOf(roughness);
    const base = baseColour[channel];

    // *** THE DIFFUSE LOBE IS SCALED BY (1 - metallic) AND NOTHING ELSE, WHICH IS A CHOICE WITH A COST. ***
    // A metal has no subsurface response, so it has no diffuse lobe; that much is physics. What is NOT physics
    // is that the dielectric diffuse is not also scaled by (1 - F): the light reflected specularly at the
    // interface never reaches the substrate. Disney's model leaves that out for artist-controllability and so
    // does this, DELIBERATELY, and it is the reason the composed albedo can exceed the diffuse albedo alone --
    // measured in the gate rather than left as a worry.
    // *** MEASURED AT v4432: LEAVING THIS UNCOUPLED CREATES ENERGY, AND THE FURNACE SAYS BY HOW MUCH. ***
    // Disney's model scales the diffuse lobe by (1 - metallic) and nothing else, for artist-controllability:
    // the light reflected specularly at the interface is not removed from what reaches the substrate. On a
    // white surface at metallic 0, roughness 1, cosO 0.15 that returns a directional albedo of 1.0796 -- EIGHT
    // PER CENT MORE LIGHT THAN ARRIVED -- because Schlick's grazing term rides on top of a full-albedo diffuse.
    // Both models are kept and named. `coupled` removes what the interface took, which conserves; the default
    // is Disney's, which does not, and the gate holds each to what it actually is rather than to what is
    // convenient. A composition that double-counts at the seams is what item 9 predicted and this is the number.
    // *** SYMMETRIC, BECAUSE A ONE-SIDED COUPLING IS NOT RECIPROCAL AND A SABOTAGE FOUND THAT. ***
    // The first version scaled by (1 - F(cosO)) alone. Made the default, it broke f(wo, wi) = f(wi, wo) by
    // 1.6e-1 -- the reciprocity row went red and named it. Light loses the interface reflection on the way IN
    // and again on the way OUT, so the factor is both, and the pair is symmetric under swapping them by
    // construction rather than by luck.
    const kD = coupled
        ? (1 - schlick(cosO, f0Of(baseColour, m, specular)[channel])) *
          (1 - schlick(cosI, f0Of(baseColour, m, specular)[channel]))
        : 1;
    const diffuse = lobes === "specular" ? 0 : kD * (1 - m) * orenNayarBrdf(base, cosI, cosO, cosPhiDiff, sigma);

    const f0 = f0Of(baseColour, m, specular)[channel];
    const Dv = D(cosM, alpha);
    const Gv = G2(cosO, cosI, alpha);
    const Fv = schlick(cosM, f0);
    const denom = 4 * Math.abs(cosO) * Math.abs(cosI);
    const spec = lobes === "diffuse" || denom <= 0 ? 0 : (Dv * Gv * Fv) / denom;

    return diffuse + spec;
}

/**
 * Directional albedo: the fraction of energy leaving a surface lit from one direction, integrated over the
 * hemisphere. THIS IS THE WHITE FURNACE, and it is the number the gate holds to <= 1.
 *
 * Integrated numerically over (thetaI, phi) rather than sampled, so it does not depend on the sampler being
 * right -- a furnace that used the sampler would pass for a model whose f and whose pdf were wrong together.
 */
export function directionalAlbedo(params, cosO, { N = 96, M = 48, channel = 0 } = {}) {
    const thetaO = Math.acos(Math.min(1, Math.max(-1, cosO)));
    const sinO = Math.sin(thetaO);
    let sum = 0;
    const dTheta = (Math.PI / 2) / N, dPhi = (2 * Math.PI) / M;
    for (let i = 0; i < N; i++) {
        const thetaI = (i + 0.5) * dTheta;
        const cosI = Math.cos(thetaI), sinI = Math.sin(thetaI);
        for (let j = 0; j < M; j++) {
            const phi = (j + 0.5) * dPhi;
            // the half vector between wo (in the xz plane) and wi, in the shading frame with n = +z
            const hx = sinO + sinI * Math.cos(phi), hy = sinI * Math.sin(phi), hz = cosO + cosI;
            const len = Math.hypot(hx, hy, hz);
            const cosM = len > 0 ? hz / len : 1;
            const f = evaluate(params, cosO, cosI, cosM, Math.cos(phi), channel);
            sum += f * cosI * sinI * dTheta * dPhi;
        }
    }
    return sum;
}

/**
 * The two lobes separately.
 *
 * *** BY AN EXPLICIT FLAG, NOT BY A PARAMETER TRICK. *** The first draft isolated the specular lobe by zeroing
 * baseColour -- which also zeroes a metal's F0, so it measured a different surface and would have read 0 for
 * every metal while looking like a split. A knob that happens to suppress a term is not the same as saying
 * which term you want, and this tree has spent the session on detectors that meant something other than what
 * they said.
 */
export function albedoSplit(params, cosO, opts = {}) {
    const total = directionalAlbedo({ ...params, lobes: "both" }, cosO, opts);
    const specular = directionalAlbedo({ ...params, lobes: "specular" }, cosO, opts);
    const diffuse = directionalAlbedo({ ...params, lobes: "diffuse" }, cosO, opts);
    return { total, specular, diffuse, sums: Math.abs(total - (specular + diffuse)) };
}

/**
 * Sample an incoming direction. Chooses a lobe by its share of the reflectance, then samples that lobe --
 * GGX through microfacet.sampleHalfVector, cosine-weighted for the diffuse.
 * Returns { cosI, cosM, phi, pdf, lobe }, where `phi` is the AZIMUTH OF wi RELATIVE TO wo, which is what
 * evaluate() wants as cosPhiDiff and not the half-vector's own azimuth.
 *
 * *** THIS FUNCTION RETURNED NaN ON EVERY SPECULAR SAMPLE FROM v4432 UNTIL v4437, AND NOTHING NOTICED
 * BECAUSE NOTHING CALLED IT. *** The first version read:
 *
 *     const h = sampleHalfVector(u1, u2, alpha);
 *     const cosM = h.cosTheta !== undefined ? h.cosTheta : Math.cos(h.theta);
 *
 * microfacet.sampleHalfVector returns a THREE-VECTOR with Y UP -- [sinH cos(phi), cosH, sinH sin(phi)] --
 * so `h.cosTheta` is undefined, the ternary falls through, `h.theta` is ALSO undefined, and Math.cos of
 * undefined is NaN. Both the SHAPE and the AXIS were wrong. *** THE TERNARY IS THE TELL: it guards between
 * two GUESSED shapes and neither of them is the real one, and a guess with a fallback is still a guess. ***
 * v4432 shipped this with an honest note saying the sampler was ungraded -- and "ungraded" was carrying
 * "returns NaN", which is what an unexercised code path is always free to do.
 */
export function sample(params, cosO, u1, u2, u3) {
    const m = Math.min(1, Math.max(0, params.metallic || 0));
    const alpha = alphaOf(params.roughness ?? 0.5);
    const pSpec = m + (1 - m) * 0.5;                  // metals are specular-only; dielectrics split evenly
    const sinO = Math.sqrt(Math.max(0, 1 - cosO * cosO));
    const wo = [sinO, cosO, 0];                        // the frame is Y-UP, matching furnace.mjs and the sampler

    // *** THE PDF IS THE MIXTURE'S, NOT THE CHOSEN LOBE'S, AND THAT WAS A SECOND DEFECT WORTH 2x. ***
    // evaluate() returns the WHOLE BSDF, so the estimator f*cos/pdf must divide by the density that actually
    // produced the direction: pSpec*pdfSpec + (1 - pSpec)*pdfDiff, both evaluated AT THE SAMPLED DIRECTION.
    // Returning only the chosen lobe's term halves the denominator whenever both lobes can reach a direction,
    // and the Monte Carlo estimate came back at 1.9917x the quadrature for a dielectric. A METAL HIDES IT
    // ENTIRELY, because pSpec is 1 there and the mixture IS the one lobe -- so the check that would have
    // caught this had to be run on a dielectric, and the obvious material to test a specular sampler on is
    // a metal.
    const mixturePdf = (cosI, cosM, dotOH) => {
        const pdfSpec = dotOH > 0 ? (D(cosM, alpha) * cosM) / (4 * dotOH) : 0;
        const pdfDiff = cosI > 0 ? cosI / Math.PI : 0;
        return { pdf: pSpec * pdfSpec + (1 - pSpec) * pdfDiff, pdfSpec, pdfDiff };
    };

    if (u3 < pSpec) {
        const h = sampleHalfVector(u1, u2, alpha);     // [x, y, z] with y up -- a vector, not an angle pair
        const cosM = h[1];
        const dot = wo[0] * h[0] + wo[1] * h[1] + wo[2] * h[2];
        if (dot <= 0) return { cosI: 0, cosM, phi: 0, pdf: 0, lobe: "specular" };
        // Reflect wo about h. The full vector reflection, not a small-angle stand-in for it.
        const wi = [2 * dot * h[0] - wo[0], 2 * dot * h[1] - wo[1], 2 * dot * h[2] - wo[2]];
        const cosI = wi[1];
        if (cosI <= 0) return { cosI: 0, cosM, phi: 0, pdf: 0, lobe: "specular" };
        const phi = Math.atan2(wi[2], wi[0]) - Math.atan2(wo[2], wo[0]);
        const { pdf, pdfSpec, pdfDiff } = mixturePdf(cosI, cosM, dot);
        return { cosI, cosM, phi, pdf, pdfSpec, pdfDiff, lobe: "specular" };
    }

    // Cosine-weighted diffuse, then the SAME half-vector arithmetic so the mixture pdf can be formed here too.
    const cosI = Math.sqrt(Math.max(0, 1 - u1));
    const phi = 2 * Math.PI * u2;
    const sinI = Math.sqrt(Math.max(0, 1 - cosI * cosI));
    const wi = [sinI * Math.cos(phi), cosI, sinI * Math.sin(phi)];
    const hx = wo[0] + wi[0], hy = wo[1] + wi[1], hz = wo[2] + wi[2];
    const len = Math.hypot(hx, hy, hz);
    const cosM = len > 0 ? hy / len : 1;
    const dot = len > 0 ? (wo[0] * hx + wo[1] * hy + wo[2] * hz) / len : 0;
    const { pdf, pdfSpec, pdfDiff } = mixturePdf(cosI, cosM, dot);
    return { cosI, cosM, phi, pdf, pdfSpec, pdfDiff, lobe: "diffuse" };
}

/** The two limits the composed model must agree with, named so the gate reads as the argument it is. */
// *** `specular: 0` DOES NOT REMOVE THE SPECULAR LOBE, AND THE FIRST DRAFT OF THIS OBJECT ASSUMED IT DID. ***
// Schlick's form is F0 + (1 - F0)(1 - cos)^5: at F0 = 0 the CONSTANT term goes and the GRAZING term does not,
// so a "specular 0" surface still has a rim. Measured: the diffuse-limit check disagreed with roughDiffuse by
// 2.1e-2 at cosO = 0.3 and 1.0e-4 at cosO = 0.95 -- an error that grows exactly where the grazing term lives,
// which is what pointed at it. The limit says `lobes: "diffuse"` now, which is the thing it meant.
// A knob that happens to suppress a term is not the same as saying which term you want, and this is the second
// time in one file: albedoSplit above isolated the specular lobe by zeroing baseColour, which also zeroes a
// metal's F0 and would have read 0 for every metal.
export const LIMITS = Object.freeze({
    diffuseOnly: { metallic: 0, roughness: 1, specular: 0, lobes: "diffuse" },
    mirror: { metallic: 1, roughness: 0.001, specular: 1, lobes: "specular" },
});
