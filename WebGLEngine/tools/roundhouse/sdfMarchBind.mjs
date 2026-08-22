// WebGLEngine/tools/roundhouse/sdfMarchBind.mjs -- v3496
// ---------------------------------------------------------------------------------------------------------------
// THE IMPLICIT-FIELD RAY MARCHER AS A LAB DEVICE. v3488 built it with two external keys and a page, AND NOTHING
// IN tools/roundhouse IMPORTED IT -- so it could be LOOKED AT and not RUN: no lab export, no corroboration, no
// planted-error census, no lab-results row. *** v3420'S SENTENCE, WORD FOR WORD: AN INSTRUMENT YOU CAN LOOK AT
// BUT CANNOT RUN IS HALF AN INSTRUMENT. *** It has been the oldest open item in this arc for eight rounds.
//
// ITS OWN REGISTRY ROW, AND THE REASON IS THE ONE THIS TREE ALWAYS USES: NO EXISTING BIND SHARES ITS SUBSTRATE.
// `refscan` drives a path tracer through a camera; `geometry` grades marching TETRAHEDRA. Marching a CONTINUOUS
// FIELD along a ray is neither, and putting it on a topically adjacent device would be the unverifiable-row
// mistake in a new dress (v3422's white dwarf, v3423's centrifuge).
//
// FIVE MODES, AND EACH ASKS SOMETHING THE OTHERS CANNOT:
//   sphere   -- against a CLOSED-FORM INTERSECTION that has no notion of stepping at all
//   ball     -- against a closed form for a single Wyvill ball DERIVED AT v3488 because the tree had none
//   surface  -- against an INDEPENDENTLY EXTRACTED MESH, with the disagreement falling as THAT route refines
//   deadzone -- the stall, which is a fact about the FIELD rather than about the tracer
//   clamp    -- the maxStep trade, where the error is BOUNDED BY ONE STEP and always LATE, never early
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { marchRay, marchBalls, supportEntry, MARCH_REASONS } from "../../physics/render/sdfMarch.mjs";
import { raySphere } from "../../physics/render/occlusion.mjs";
import { sphereField, wyvill, wyvillGrad, marchingTets, surfaceDistance } from "../../physics/mesh/marchingCubes.js";

export const SDFMARCH_MODES = ["sphere", "ball", "surface", "deadzone", "clamp"];

const DEF = {
    R: 1, rays: 24, epsilon: 1e-7, maxStep: 0.05, maxSteps: 20000,
    ballR: 0.35, iso: 0.5, ballS: 1, eye: 3,
    meshN: 48, meshLo: -1.6, meshHi: 1.6, blobSep: 0.35, blobR: 1,
};

export const SDFMARCH_OBSERVABLES = [
    "worstAgainstClosedForm", "raysTraced", "worstSteps", "normalErr",
    "ballOvershoot", "ballAnalyticT", "ballMeasuredT", "overshootWithinStep",
    "meshMeanOverH", "meshWorst", "meshCells", "hitsOnBlob",
    "deadzoneReason", "deadzoneSteps", "entryStepsSaved", "entryAgreement",
    "clampWorstOvershoot", "clampAllLate", "clampStepRatio",
    "planted",
];

const blobs = (c) => [{ cx: -c.blobSep, cy: 0, cz: 0, r: c.blobR, s: 1 },
                      { cx: c.blobSep, cy: 0, cz: 0, r: c.blobR, s: 1 }];
const ONE = (c) => [{ cx: 0, cy: 0, cz: 0, r: c.ballR, s: c.ballS }];
const blobField = (b) => ({ f: (x, y, z) => wyvill(b, x, y, z), g: (x, y, z) => wyvillGrad(b, x, y, z) });

export function defaults({ mode = "sphere", config = {} } = {}) {
    if (!SDFMARCH_MODES.includes(mode)) return null;     // a refusal, not a silent substitution
    return { mode, config: { ...DEF, ...config } };
}

export function build({ mode = "sphere", config = {} } = {}) {
    if (!SDFMARCH_MODES.includes(mode)) throw new Error("sdfmarch: undeclared mode " + mode);
    const c = { ...DEF, ...config };
    const planted = !!c.planted;
    const P = { rawStep: planted };
    const blank = { planted };

    if (mode === "sphere") {
        // TWO ROUTES TO ONE NUMBER, AND THE SECOND SOLVES A QUADRATIC RATHER THAN STEPPING.
        const sf = sphereField(c.R);
        let worst = 0, steps = 0, traced = 0, nErr = 0;
        for (let i = 0; i < c.rays; i++) {
            const a = i * 0.157, o = [3 * Math.cos(a), 0.4 * Math.sin(a * 3), 3 * Math.sin(a)];
            const L = Math.hypot(o[0], o[1], o[2]), d = [-o[0] / L, -o[1] / L, -o[2] / L];
            const r = marchRay(sf, o, d, { epsilon: c.epsilon, maxSteps: c.maxSteps, ...P });
            const an = raySphere(o, d, [0, 0, 0], c.R);
            if (!r.hit || an === null) continue;
            traced++; worst = Math.max(worst, Math.abs(r.t - an)); steps = Math.max(steps, r.steps);
            // The outward normal must point back along the ray for a sphere hit from outside.
            if (r.N) nErr = Math.max(nErr, Math.abs(-(r.N[0] * d[0] + r.N[1] * d[1] + r.N[2] * d[2]) - 1));
        }
        return { ...blank, worstAgainstClosedForm: worst, raysTraced: traced, worstSteps: steps, normalErr: nErr };
    }

    if (mode === "ball") {
        // q^3 = iso/s at the surface and q = 1 - d^2/R^2, so d = R sqrt(1 - (iso/s)^(1/3)). DERIVED AT v3488
        // BECAUSE THE TREE'S ONLY METABALL KEY WAS A VOLUME -- and v3069's rule is that an aggregate is
        // invariant under a shift while A RADIUS IS NOT.
        const b = ONE(c), o = [0, 0, c.eye], d = [0, 0, -1];
        const analytic = c.eye - c.ballR * Math.sqrt(1 - Math.pow(c.iso / c.ballS, 1 / 3));
        const r = marchRay(blobField(b), o, d, { iso: c.iso, maxStep: c.maxStep, epsilon: c.epsilon,
                                                 maxSteps: c.maxSteps, t0: supportEntry(b, o, d), ...P });
        const t = r.hit ? r.t : NaN;
        return { ...blank, ballAnalyticT: analytic, ballMeasuredT: t, ballOvershoot: t - analytic,
                 overshootWithinStep: r.hit && t - analytic >= 0 && t - analytic < c.maxStep };
    }

    if (mode === "surface") {
        // *** THE HIT POINTS ARE COMPUTED ONCE AND COMPARED AGAINST A MESH THE TRACER NEVER SAW. The falling
        // number is a statement about THE EXTRACTOR, because it is the only thing that changes. ***
        const b = blobs(c), opt = { iso: c.iso, wyvill, wyvillGrad, epsilon: 1e-6, maxStep: c.maxStep,
                                    maxSteps: c.maxSteps, ...P };
        const hits = [];
        for (let i = 0; i < 60; i++) {
            const a = i * 0.2617, e = [3.2 * Math.cos(a), 1.1 * Math.sin(a * 2.3), 3.2 * Math.sin(a)];
            const L = Math.hypot(e[0], e[1], e[2]), d = [-e[0] / L, -e[1] / L, -e[2] / L];
            const r = marchBalls(b, e, d, opt);
            if (r.hit) hits.push(r.P);
        }
        const mesh = marchingTets((x, y, z) => wyvill(b, x, y, z), (x, y, z) => wyvillGrad(b, x, y, z),
                                  { N: c.meshN, lo: c.meshLo, hi: c.meshHi, iso: c.iso });
        let worst = 0, sum = 0;
        for (const p of hits) { const sd = surfaceDistance(mesh.verts, mesh.tris, p); worst = Math.max(worst, sd); sum += sd; }
        const h = (c.meshHi - c.meshLo) / c.meshN;
        return { ...blank, hitsOnBlob: hits.length, meshCells: c.meshN, meshWorst: worst,
                 meshMeanOverH: hits.length ? (sum / hits.length) / h : NaN };
    }

    if (mode === "deadzone") {
        // *** A FACT ABOUT THE FIELD AND NOT ABOUT THE TRACER: Wyvill falloff is EXACTLY ZERO outside each ball,
        // so beyond the support there is no gradient and no step to take. The unclamped tracer stalls on its
        // first move with nothing broken, and the reason is NAMED because "found nothing" and "could not move"
        // are opposite news. ***
        const b = ONE(c), o = [0, 0, c.eye], d = [0, 0, -1];
        const stalled = marchRay(blobField(b), o, d, { iso: c.iso, maxStep: 0, ...P });
        const entry = supportEntry(b, o, d);
        const opt = { iso: c.iso, maxStep: c.maxStep, epsilon: c.epsilon, maxSteps: c.maxSteps, ...P };
        const far = marchRay(blobField(b), o, d, opt);
        const near = marchRay(blobField(b), o, d, { ...opt, t0: entry });
        return { ...blank, deadzoneReason: stalled.reason, deadzoneSteps: stalled.steps,
                 entryStepsSaved: far.hit && near.hit ? far.steps / Math.max(1, near.steps) : NaN,
                 // NOT bit-identical and the field says so: the two arrive at different t before the Newton
                 // step takes over, so they land on one surface from different sample points.
                 entryAgreement: far.hit && near.hit ? Math.abs(far.t - near.t) : NaN };
    }

    // clamp -- THE TRADE, AND THE ERROR IS BOUNDED BY ONE STEP AND ALWAYS LATE.
    const b = ONE(c), o = [0, 0, c.eye], d = [0, 0, -1], entry = supportEntry(b, o, d);
    const analytic = c.eye - c.ballR * Math.sqrt(1 - Math.pow(c.iso / c.ballS, 1 / 3));
    const rows = [0.5, 0.25, 0.1, 0.05, 0.02, 0.005].map((maxStep) => {
        const r = marchRay(blobField(b), o, d, { iso: c.iso, maxStep, epsilon: c.epsilon, maxSteps: c.maxSteps, t0: entry, ...P });
        return { maxStep, over: r.hit ? r.t - analytic : NaN, steps: r.steps };
    });
    return {
        ...blank,
        clampWorstOvershoot: Math.max(...rows.map((r) => Math.abs(r.over))),
        // THE SIGN MATTERS AS MUCH AS THE SIZE: a clamped tracer can only ever report the surface LATE.
        clampAllLate: rows.every((r) => r.over >= 0 && r.over < r.maxStep),
        clampStepRatio: rows[rows.length - 1].steps / Math.max(1, rows[0].steps),
    };
}

export const sdfMarchDevice = {
    // METHOD PLANT: `planted` sets rawStep, which STEPS BY THE FIELD VALUE instead of the Newton distance
    // estimate -- it substitutes the stepping RULE rather than moving a knob or misreading one, which is
    // seismic's third kind (v3400) and compliance.mjs's shape (v3460).
    plantKind: "method",
    modes: SDFMARCH_MODES, name: "implicit-field-ray-march",
    observables: SDFMARCH_OBSERVABLES, build, defaults,
};
export default sdfMarchDevice;
