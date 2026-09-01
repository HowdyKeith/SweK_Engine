// WebGLEngine/physics/render/pathTracer.mjs -- v3473
//
// *** THE RENDERER THE LAST SIX ROUNDS WERE THE ANSWER KEY FOR. ***
//
// v3467 built the furnace value, v3468 the sampling strategy, v3469 the geometry, v3470 the bounce series,
// v3471 roulette, v3472 direct light sampling. NONE OF THEM DREW ANYTHING. This one does, and it is deliberately
// assembled FROM those modules rather than beside them -- if it re-implemented the sampler or the intersection
// it would be a second declaration of the very things that were graded, and the keys would be grading a
// different renderer than the one that ships.
//
// ================================================================================================
// WHAT MAKES IT CHECKABLE, AND IT IS THE SAME TEST AS v3467
// ================================================================================================
//
// Put a grey sphere of albedo rho inside a white environment and render it. *** EVERY PIXEL THAT HITS THE
// SPHERE MUST READ rho -- THE WHOLE IMAGE IS ONE FLAT COLOUR AND THE SPHERE VANISHES. *** That is the furnace
// test seen through a camera, and it catches an entire class the analytic rounds could not: a wrong camera
// basis, a normal pointing inward, a frame that is not orthonormal, a self-intersection at the surface. All of
// those leave the ANALYTIC keys untouched because none of them involves a camera, and all of them show up here
// as a sphere that is visible when it should not be.
//
// A FLAT IMAGE IS A STRANGE THING TO WANT FROM A RENDERER, WHICH IS EXACTLY WHY IT IS A GOOD TEST: there is
// nothing to admire and nothing to fool yourself with.
"use strict";
import { rng, cosineSampleHemisphere, createCoordinateSystem, toWorld } from "./furnace.mjs";
import { raySphere } from "./occlusion.mjs";
import { sampleCone, conePdf, capHalfAngle } from "./nee.mjs";
// v3493 -- THE THREE MODULES THAT WERE GRADED AND UNCALLED. microfacet (v3490), fresnel (v3491) and
// energyCompensation (v3492) each shipped with an exact key and NO CONSUMER, which is v3473's nee.mjs shape
// three times over. This is the round that gives them one.
import { sampleHalfVector, bounceWeight, bsdfEval, sampleDirPdf, misWeight, D, G2 } from "./microfacet.mjs";
import { fresnel } from "./fresnel.mjs";
import { albedoAt, msLobe } from "./energyCompensation.mjs";
// v4282 -- THE DIFFUSE LOBE THAT SHIPPED AT v4275 AND HAD NO CALLER UNTIL NOW. See the block above the
// Lambertian bounce for why `sigma` is opt-in and why absent means bit-identical rather than merely similar.
import { roughDiffuseBrdf, buildDiffuseTable, SIGMA_MAX } from "./roughDiffuse.mjs";

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// *** v3497 -- COLOUR. Radiance was a SCALAR everywhere in this arc, and the key that makes the change gradeable
// is that A GREY WORLD MUST RETURN IDENTICAL VALUES PER CHANNEL, BIT FOR BIT -- necessary and NOT sufficient,
// because a renderer that ignored colour entirely would satisfy it (v3177's shape). THE SUFFICIENT HALF IS THAT
// CHANNEL k OF A COLOURED RENDER MUST EQUAL A MONOCHROME RENDER OF THAT CHANNEL'S OWN ALBEDO, BIT FOR BIT --
// which demands that channel k's arithmetic is untouched by what the other two carry, and that is exactly what
// a shared Fresnel or a mean-albedo throughput breaks.
//
// IT COSTS NO RANDOM NUMBERS, AND THAT IS WHY THE IDENTITY CAN BE EXACT RATHER THAN STATISTICAL: every random
// decision in this tracer -- the roulette test, the two-lobe coin, the cone sample, the half-vector -- is
// already CHANNEL-INDEPENDENT, so the three channels walk one path and differ only in what they multiply.
const col = (x) => (typeof x === "number" ? [x, x, x] : x);
const cmul = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
const cscale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Nearest hit among the spheres, or null. Uses v3469's intersection -- the one with the `t > 0` test. */
export function intersect(orig, dir, spheres) {
    let best = null;
    for (const s of spheres) {
        const t = raySphere(orig, dir, s.centre, s.radius);
        if (t !== null && (best === null || t < best.t)) {
            const P = add(orig, mul(dir, t));
            best = { t, P, N: norm(sub(P, s.centre)), sphere: s };
        }
    }
    return best;
}

/**
 * One path. Returns the radiance seen along `dir` from `orig`.
 *
 * The environment returns `sky(dir)`. Bounces are cosine-weighted, so the cosine cancels against the pdf and
 * the throughput is just the albedo -- the same estimator v3470 graded, not a new one.
 */
export function trace(orig, dir, scene, rand, { maxDepth = 8, rrQ = null, sky = () => 1, nee = true,
                                                       plantGlobalGuard = false, plantDoubleCount = false,
                                                       // v3495 -- "bsdf" | "nee" | "mis" for MICROFACET surfaces.
                                                       // The Lambertian path keeps its own `nee` flag untouched.
                                                       direct = "bsdf", plantNoMisWeight = false,
                                                       plantSuppressBsdf = false,
                                                       // v3497 -- what comes BACK, never how it is computed:
                                                       // the loop below is componentwise either way.
                                                       plantNoMsDirect = false, plantOneLobePdf = false,
                                                       rgb = false, plantMeanAlbedo = false,
                                                       // v3500 -- STRATIFYING THE **PATH** DIMENSIONS. `strata`
                                                       // carries {n, i} for this sample: the grid size and which
                                                       // cell it owns. Depth is how many BOUNCES get the
                                                       // treatment; beyond that the draws are free again.
                                                       strata = null, stratDepth = 1,
                                                       plantNoShuffle = false } = {}) {
    let throughput = [1, 1, 1], o = orig, d = dir, radiance = [0, 0, 0], prevWasCamera = true;
    // ONE COMPUTATION, ONE PROJECTION AT THE EXIT. A separate scalar path would be a second declaration of the
    // whole renderer, which is the defect this tree names more often than any other.
    const out = (v) => (rgb ? v : v[0]);
    // `plantMeanAlbedo` averages the three channels into one before multiplying -- INVISIBLE ON A GREY SCENE,
    // which is precisely where anybody would check.
    const alb = (s2) => { const c = col(s2.albedo); return plantMeanAlbedo ? col((c[0] + c[1] + c[2]) / 3) : c; };
    // v3488 -- WHICH LIGHTS NEE COULD NOT SAMPLE AT THE VERTEX THIS RAY LEFT. null when there were none, which
    // is every ordinary scene, so the common path allocates nothing.
    // *** THE STRATUM PAIR FOR BOUNCE `b`, OR null ONCE THE BUDGET IS SPENT. Two draws are consumed EITHER
    // WAY -- they become the jitter inside the cell instead of the sample itself -- so the sequence every later
    // decision sees is untouched and the comparison is about WHERE the samples sit and nothing else (v3497).
    //
    // *** THE PER-PIXEL SHUFFLE IS **IDLE UNDER PER-PIXEL SEEDING**, MEASURED AT v3507 AND NOT ASSUMED. The
    // argument for it is sound -- without it every pixel walks its strata in the SAME ORDER, so sample k of one
    // pixel and sample k of its neighbour aim into the same cell and their errors would correlate across the
    // image. ITS PREMISE IS ALREADY FALSE HERE: pixelRand(x, y) gives every pixel its own stream, so the JITTER
    // INSIDE each cell differs per pixel even when the cell ORDER is identical, and it is the jitter that
    // decides where the sample lands. Lag-1 neighbour autocorrelation of the error is under 0.05 WITH the
    // shuffle and WITHOUT it, on a hard-band sky built to expose exactly this. It would only bite under
    // streamRng -- one generator shared across pixels -- WHICH IS v3487'S DECLARED PLANT. KEPT because it costs
    // no draws, WITH THAT AS ITS REASON rather than "it cannot hurt".
    // Graded by physics/render/shuffleEffect-selfcheck.mjs.
    let bounce = 0;
    const stratPair = (r1, r2) => {
        if (!strata || bounce >= stratDepth) return [r1, r2];
        const n = strata.n;
        const k = plantNoShuffle ? strata.i : strata.shuffle[strata.i];
        return [((k % n) + r1) / n, (((k / n) | 0) + r2) / n];
    };
    let neeSkipped = null;
    // v3495 -- WHAT THE PREVIOUS MICROFACET VERTEX DID, so an emitter hit can be weighted rather than merely
    // suppressed. null when the last bounce was not a microfacet one, which is every scene before this round.
    let misFrom = null;
    const lights = scene.filter((s) => s.emit);
    for (let depth = 0; depth < maxDepth; depth++) {
        const hit = intersect(o, d, scene);
        if (!hit) return out(cadd(radiance, cmul(throughput, col(sky(d)))));
        if (hit.sphere.emit) {
            // *** THE DOUBLE-COUNT GUARD, AND IT IS THE WHOLE DIFFICULTY OF WIRING NEE IN. With direct sampling
            // on, the light at THIS vertex was already added at the PREVIOUS one, so a bounce ray that lands on
            // an emitter must return NOTHING. Only the camera ray may report it, or the light itself would be
            // invisible in the picture. Forget this and every surface is lit twice -- a uniform doubling, which
            // is exactly the sort of error that looks like a brighter room. ***
            //
            // *** v3488 -- AND THE GUARD WAS GLOBAL WHERE THE FACT IT GUARDS IS PER LIGHT, WHICH LOST 92.8% OF
            // THE ENERGY ON AN ORDINARY SCENE. "The light was already added" is true only of the lights NEE
            // ACTUALLY SAMPLED, and NEE skips any emitter the shading point stands INSIDE -- there is no cone to
            // sample from within a sphere. So for an ENCLOSING emitter, which is how everybody builds an
            // environment light, NEE skipped it AND this guard suppressed the bounce ray that would have picked
            // it up: NEITHER ROUTE COLLECTED IT AND THE PICTURE WENT DARK. The comment on that `continue` said
            // "inside the light: no cone to sample", which is true, and nothing downstream had read it. ***
            //
            // THE RULE IS NOW STATED AS THE PROPERTY RATHER THAN AS AN ARRANGEMENT: EVERY LIGHT IS COLLECTED BY
            // EXACTLY ONE ROUTE, NEVER ZERO AND NEVER TWO. Both failures are one line apart and they fail in
            // opposite directions -- 93% dark against 2x too bright -- so both are planted and both are graded.
            // *** v3495 -- A MICROFACET BOUNCE LANDING ON A LIGHT IS NOT SUPPRESSED UNDER MIS, IT IS WEIGHTED.
            // Under "nee" it must still be suppressed outright (the light was collected at the previous vertex),
            // and under "bsdf" it is the only route so it is taken whole. THREE STRATEGIES, THREE TREATMENTS OF
            // THE SAME LINE, and the weight is what stops MIS double-counting. ***
            if (misFrom && !prevWasCamera) {
                if (misFrom.mode === "nee" || plantSuppressBsdf) return out(radiance);
                if (misFrom.mode === "bsdf") return out(cadd(radiance, cmul(throughput, col(hit.sphere.emit))));   // the only route
                const toL = sub(hit.sphere.centre, misFrom.P);
                const dist = Math.hypot(toL[0], toL[1], toL[2]);
                const pL = dist > hit.sphere.radius ? conePdf(Math.cos(capHalfAngle(hit.sphere.radius, dist))) : 0;
                const w = plantNoMisWeight ? 1 : misWeight(misFrom.pdf, pL);
                return out(cadd(radiance, cscale(cmul(throughput, col(hit.sphere.emit)), w)));
            }
            let alreadyCounted = nee && !prevWasCamera;
            if (alreadyCounted && !plantGlobalGuard && neeSkipped && neeSkipped.has(hit.sphere)) alreadyCounted = false;
            if (plantDoubleCount) alreadyCounted = false;
            return out(alreadyCounted ? radiance : cadd(radiance, cmul(throughput, col(hit.sphere.emit))));
        }
        // NEXT-EVENT ESTIMATION: sample each light's solid angle directly rather than hoping to hit it.
        // v3472 measured this 7912x quieter than BSDF sampling for a light of r/d = 0.1.
        let skipped = null;
        // NEE'S INTEGRAND IS albedo/pi -- A LAMBERTIAN BRDF -- so it is SKIPPED on a microfacet surface rather
        // than run with the wrong f. Doing it properly needs the BSDF evaluated at the light direction plus MIS,
        // and v3489 measured MIS as a trade rather than a win. STATED, NOT SILENTLY APPROXIMATED.
        if (nee && hit.sphere.roughness === undefined) for (const L of lights) {
            const toL = sub(L.centre, hit.P);
            const dist = Math.hypot(toL[0], toL[1], toL[2]);
            // INSIDE THE LIGHT: NO CONE TO SAMPLE -- and now the skip is RECORDED rather than merely taken, so
            // the bounce ray is allowed to collect what direct sampling could not.
            if (dist <= L.radius) { (skipped = skipped || new Set()).add(L); continue; }
            const wl = norm(toL);
            const cosA = Math.cos(capHalfAngle(L.radius, dist));
            const { Nt: Lt, Nb: Lb } = createCoordinateSystem(wl);
            const sd = toWorld(sampleCone(rand(), rand(), cosA), wl, Lt, Lb);
            const cos = dot(sd, hit.N);
            if (cos <= 0) continue;
            const shadowOrig = add(hit.P, mul(hit.N, 1e-6));
            const blocker = intersect(shadowOrig, sd, scene);
            if (!blocker || blocker.sphere !== L) continue;        // something else is in the way
            // *** THE LAMBERTIAN INTEGRAND IS albedo/pi AND A SIGMA SURFACE'S IS NOT. *** Rather than skip
            // NEE the way a microfacet surface does, the BRDF is evaluated at the light direction -- which
            // Oren-Nayar makes cheap, being a closed form rather than a sampled lobe. At sigma 0 kL is
            // exactly 1 and this line is arithmetically what it always was.
            const wo0 = [-d[0], -d[1], -d[2]];
            const kL = hit.sphere.sigma > 0
                ? Math.PI * roughDiffuseBrdf(1, cos, dot(wo0, hit.N), azimuthCos(wo0, sd, hit.N),
                                             Math.min(hit.sphere.sigma, SIGMA_MAX), diffuseTable(hit.sphere.sigma))
                : 1;
            radiance = cadd(radiance, cscale(cmul(throughput, cmul(alb(hit.sphere), col(L.emit))), kL * cos / (Math.PI * conePdf(cosA))));
        }
        neeSkipped = skipped;
        prevWasCamera = false;
        const { Nt, Nb } = createCoordinateSystem(hit.N);

        // *** v3493 -- A MICROFACET SURFACE IS A DIFFERENT BSDF, NOT A MULTIPLIER ON THE DIFFUSE ONE. Evaluating
        // D G2 F / (4 cos_o cos_i) at a direction somebody hands you is the RASTERISER'S recipe: it gives a
        // highlight and no estimator. A path tracer must CHOOSE the direction and divide by the probability it
        // chose it with, and adding a specular term on top of the diffuse throughput -- rather than instead of
        // it -- would return MORE than the surface received at every bounce. ***
        if (hit.sphere.roughness !== undefined) {
            const wo = [-d[0], -d[1], -d[2]];
            const cosO = dot(wo, hit.N);
            if (cosO <= 0) return out(radiance);
            const a = hit.sphere.roughness, T = hit.sphere.msTable || null;
            // *** v3499 -- THE REFUSAL v3495 PUT HERE IS CLOSED. It said next-event estimation evaluated the
            // SINGLE-SCATTERING lobe only, so a compensation table with "nee" or "mis" would collect the
            // specular light directly and leave the compensation lobe's share to a down-weighted route. BOTH
            // HALVES ARE NOW DONE: the light-sampled direction is evaluated against f_spec + f_ms, and the
            // BSDF-side probability is THE MIXTURE OF THE TWO LOBES' PDFS rather than whichever lobe happened
            // to be sampled. ***

            // The two-lobe mixing probability is needed by the NEE loop as well as by the bounce, so it is
            // computed ONCE here rather than declared twice -- this tree's most-named defect.
            const p = T ? Math.min(0.95, Math.max(0, 1 - albedoAt(T, cosO))) : 0;

            // NEXT-EVENT ESTIMATION WITH THE REAL BRDF. The light picks the direction, so the BSDF is
            // EVALUATED rather than sampled -- and under MIS the light's share is weighted by the balance
            // heuristic against the probability the BSDF route would have chosen the same direction.
            if (direct === "nee" || direct === "mis") for (const L of lights) {
                const toL = sub(L.centre, hit.P);
                const dist = Math.hypot(toL[0], toL[1], toL[2]);
                if (dist <= L.radius) continue;
                const wl = norm(toL);
                const cosA = Math.cos(capHalfAngle(L.radius, dist));
                const { Nt: Lt, Nb: Lb } = createCoordinateSystem(wl);
                const sd = toWorld(sampleCone(rand(), rand(), cosA), wl, Lt, Lb);
                const cosI = dot(sd, hit.N);
                if (cosI <= 0) continue;
                const blocker = intersect(add(hit.P, mul(hit.N, 1e-6)), sd, scene);
                if (!blocker || blocker.sphere !== L) continue;
                const wh = norm(add(wo, sd));
                const cosH = dot(wh, hit.N), dotOH = dot(wo, wh);
                if (cosH <= 0 || dotOH <= 0) continue;
                const Fn = hit.sphere.ior ? fresnel(dotOH, 1, hit.sphere.ior).R : 1;
                // *** A LIGHT-SAMPLED DIRECTION CAN BE REACHED BY EITHER LOBE, SO BOTH ARE EVALUATED. Leaving
                // f_ms out is the plant: it loses exactly the energy v3492 exists to give back, and it is
                // INVISIBLE AT LOW ROUGHNESS where p = 1 - E(cos_o) goes to zero and there was nothing to add.
                const fSpec = bsdfEval(cosO, cosI, cosH, a, { F: Fn });
                const fMs = (T && !plantNoMsDirect) ? msLobe(T, cosO, cosI) : 0;
                const pL = conePdf(cosA);
                // *** THE PDF OF A MIXTURE IS THE MIXTURE OF THE PDFS, WEIGHTED BY HOW OFTEN EACH LOBE IS
                // CHOSEN. Using only the lobe that happened to be sampled is the classic two-lobe bug and it
                // does not announce itself: the balance weights simply stop summing to one across the two
                // strategies, so the light is over- or under-counted by an amount nobody can name. ***
                const pB = plantOneLobePdf ? sampleDirPdf(cosH, dotOH, a)
                                           : (1 - p) * sampleDirPdf(cosH, dotOH, a) + p * (cosI / Math.PI);
                const w = direct === "mis" ? misWeight(pL, pB) : 1;
                radiance = cadd(radiance, cscale(cmul(throughput, col(L.emit)), (fSpec + fMs) * cosI * w / pL));
            }
            // TWO LOBES, CHOSEN BY A COIN WHOSE BIAS IS THE SHORTFALL ITSELF: p = 1 - E(cos_o) is exactly the
            // energy the single-scattering lobe fails to return (v3492), so the compensation is sampled exactly
            // as often as it is needed and the two branch weights each have expectation 1 in their own share.

            if (T && rand() < p) {
                const [a1, a2] = stratPair(rand(), rand());
                d = toWorld(cosineSampleHemisphere(a1, a2), hit.N, Nt, Nb);
                const cosI = Math.max(0, dot(d, hit.N));
                // f_ms cos / (cos/pi) = f_ms pi, then divided by the branch probability.
                throughput = cscale(throughput, msLobe(T, cosO, cosI) * Math.PI / p);
                // v3499 -- the compensation lobe now HAS a direct term, so a bounce from it must be weighted
                // like any other, and with THE SAME MIXTURE PDF the NEE side used.
                // *** MY FIRST VERSION WROTE `(1 - p) * 0` HERE -- the specular lobe's share of the mixture,
                // dropped because the half-vector was not to hand on this branch. THE SAME QUANTITY, WRITTEN
                // CORRECTLY IN THE NEE LOOP AND WRONG HERE: this tree's most-named defect, committed inside
                // the round whose entire subject is the mixture pdf. It read 8.37 SIGMA between the strategies
                // at a rough surface under a large light and nowhere else, because only there is the specular
                // pdf comparable to the light's. The half-vector is available -- it just had to be built. ***
                const whM = norm(add(wo, d)), cosHM = dot(whM, hit.N), dotOHM = dot(wo, whM);
                const pSpec = cosHM > 0 && dotOHM > 0 ? sampleDirPdf(cosHM, dotOHM, a) : 0;
                misFrom = { mode: direct, P: hit.P,
                            pdf: plantOneLobePdf ? cosI / Math.PI
                                                 : p * (cosI / Math.PI) + (1 - p) * pSpec };
            } else {
                const [h1, h2] = stratPair(rand(), rand());
                const wh = toWorld(sampleHalfVector(h1, h2, a), hit.N, Nt, Nb);
                const dotOH = dot(wo, wh);
                if (dotOH <= 0) return out(radiance);
                d = sub(mul(wh, 2 * dotOH), wo);                 // reflect wo about the sampled micro-normal
                const cosI = dot(d, hit.N);
                if (cosI <= 0) return out(radiance);             // below the horizon: the path ends, it is not clamped
                // Fresnel at the MICRO-normal, which is the surface the light actually meets. Using the
                // geometric normal instead is the mistake that makes grazing highlights vanish.
                const F = hit.sphere.ior ? fresnel(dotOH, 1, hit.sphere.ior).R : 1;
                // *** THE PLANT IS v3468'S, IN A NEW LOBE: sample the NDF and divide by the COSINE pdf. It is
                // the commonest importance-sampling bug there is, and it leaves the picture perfectly smooth. ***
                const w = bounceWeight(cosO, cosI, dot(wh, hit.N), dotOH, a,
                                       { F, wrongPdf: !!hit.sphere.plantWrongPdf });
                // *** THE PER-CHANNEL FRESNEL LIVES HERE: a tinted conductor carries F0 as a TRIPLE, and
                // that is the one thing a grey world can never see. `hit.sphere.F0` is optional and a scalar
                // ior keeps the dielectric path exactly as it was.
                // *** ONE PLANT REACHES BOTH PATHS AND IT HAS TO, because the per-channel quantity is
                // `albedo` on the Lambertian path and `F0` HERE: a plant that averaged only one of them would
                // be caught by a fixture nobody had to think about choosing. Same defect, two homes. ***
                let tint = hit.sphere.F0 ? col(hit.sphere.F0) : [1, 1, 1];
                if (plantMeanAlbedo) tint = col((tint[0] + tint[1] + tint[2]) / 3);
                throughput = cscale(cmul(throughput, tint), w / (1 - p));
                // RECORDED FOR THE NEXT HIT: the pdf of the direction just chosen, and where it was chosen from.
                // *** SET FOR **EVERY** MICROFACET BOUNCE INCLUDING "bsdf", AND MY FIRST VERSION SET IT ONLY
                // FOR nee/mis -- WHICH REPRODUCED v3489'S DEFECT FOUR ROUNDS AFTER FIXING IT. With `direct` at
                // "bsdf" the record was null, so the emitter hit fell through to the LAMBERTIAN guard, which
                // suppresses it because `nee` defaults true -- and NEE is skipped on microfacet surfaces, so
                // NEITHER ROUTE COLLECTED THE LIGHT. A rough surface under an explicit emitter read EXACTLY
                // 0.00000 across seven cells. The scenes in v3493 all used sky() rather than an emitter sphere,
                // which is precisely why it did not show. ***
                misFrom = { mode: direct, P: hit.P,
                            pdf: plantOneLobePdf ? sampleDirPdf(dot(wh, hit.N), dotOH, a)
                                                 : (1 - p) * sampleDirPdf(dot(wh, hit.N), dotOH, a) + p * (cosI / Math.PI) };
            }
            bounce++;
            o = add(hit.P, mul(hit.N, 1e-6));
            if (rrQ !== null) { if (rand() >= rrQ) return out(radiance); throughput = cscale(throughput, 1 / rrQ); }
            continue;
        }

        misFrom = null;      // a Lambertian bounce is not a microfacet one; a stale record would weight its hit

        // *** v4282 -- OREN-NAYAR, OPT-IN, AND ABSENT MEANS THE OLD CODE RUNS UNCHANGED. ***
        //
        // physics/render/roughDiffuse.mjs shipped at v4275 with an energy compensation measured against this
        // tree's own integration, and for seven rounds the only files importing it were itself and its gate.
        // v4280 and v4281 both cited it as THE example of a module the engine does not have. This is the
        // round that stops citing it.
        //
        // *** THE REDUCTION IS EXACT AND THE BRANCH IS STILL SEPARATE. *** At sigma 0 Oren-Nayar's A is 1 and
        // its B is 0, so its BRDF is albedo/pi to the last bit -- roughDiffuse-selfcheck asserts that with
        // === and no epsilon. So one path COULD have served both. It does not, because "the arithmetic
        // agrees" and "the same statements run in the same order consuming the same randoms" are different
        // guarantees, and only the second makes every existing image and every existing gate bit-identical BY
        // CONSTRUCTION rather than by a re-derivation somebody has to trust. A scene that sets no sigma runs
        // the code it ran yesterday.
        const sig = hit.sphere.sigma;
        if (!(sig > 0)) {
            throughput = cmul(throughput, alb(hit.sphere));
            {
                const [a1, a2] = stratPair(rand(), rand());
                d = toWorld(cosineSampleHemisphere(a1, a2), hit.N, Nt, Nb);
            }
        } else {
            // The outgoing direction is where the ray CAME FROM, and it must be read before d is replaced.
            const wo = [-d[0], -d[1], -d[2]], cosO = dot(wo, hit.N);
            // EXACTLY THE SAME TWO RANDOM NUMBERS AT EXACTLY THE SAME POINT, so a sigma surface does not
            // shift the sequence for anything later in the path.
            const [a1, a2] = stratPair(rand(), rand());
            const wi = toWorld(cosineSampleHemisphere(a1, a2), hit.N, Nt, Nb);
            const cosI = dot(wi, hit.N);
            // Cosine-weighted sampling gives pdf = cosI/pi, so f * cosI / pdf = pi * f. For Lambert that is
            // pi * (albedo/pi) = albedo, the multiply the branch above does. The gate measures the agreement
            // rather than this comment asserting it.
            const k = Math.PI * roughDiffuseBrdf(1, cosI, cosO, azimuthCos(wo, wi, hit.N),
                                                 Math.min(sig, SIGMA_MAX), diffuseTable(sig));
            throughput = cmul(throughput, cscale(alb(hit.sphere), k));
            d = wi;
        }
        bounce++;
        // OFFSET ALONG THE NORMAL, NOT ALONG THE NEW DIRECTION: a ray leaving a curved surface at a grazing
        // angle can re-enter it if it is nudged along itself, which is shadow acne. The normal always leaves.
        o = add(hit.P, mul(hit.N, 1e-6));
        if (rrQ !== null) {
            if (rand() >= rrQ) return out(radiance);              // killed: keep what was already gathered
            throughput = cscale(throughput, 1 / rrQ);
        }
    }
    return out(radiance);                               // depth exhausted: gathers nothing (v3470's guard)
}

/**
 * Cosine of the azimuth between two directions, measured in the surface's tangent plane.
 *
 * Oren-Nayar's factor needs cos(phi_i - phi_o); the cheap way is to project both directions onto the plane
 * and take their normalised dot. A direction along the normal has no azimuth at all, and that degenerate
 * case returns 0 rather than dividing by a vanishing length.
 */
function azimuthCos(wo, wi, N) {
    const dO = dot(wo, N), dI = dot(wi, N);
    const po = [wo[0] - N[0] * dO, wo[1] - N[1] * dO, wo[2] - N[2] * dO];
    const pi = [wi[0] - N[0] * dI, wi[1] - N[1] * dI, wi[2] - N[2] * dI];
    const lo = Math.hypot(po[0], po[1], po[2]), li = Math.hypot(pi[0], pi[1], pi[2]);
    if (lo < 1e-12 || li < 1e-12) return 0;
    return (po[0] * pi[0] + po[1] * pi[1] + po[2] * pi[2]) / (lo * li);
}

/**
 * The energy-compensation table for one sigma, built once and kept.
 *
 * buildDiffuseTable INTEGRATES the lobe, which is far too expensive per bounce, so it is cached by sigma.
 * The key is the NUMBER: two spheres sharing a roughness share a table, and a scene animating roughness
 * continuously would grow the map without bound -- stated here rather than discovered later.
 */
const _diffuseTables = new Map();
function diffuseTable(sigma) {
    const s = Math.min(sigma, SIGMA_MAX);
    let t = _diffuseTables.get(s);
    if (!t) { t = buildDiffuseTable(s); _diffuseTables.set(s, t); }
    return t;
}

/**
 * Render a rectangle of pixels. Returns a Float64Array of length w*h.
 *
 * The camera is an explicit orthonormal basis rather than a matrix, because a matrix would hide exactly the
 * kind of handedness error the flat-furnace check exists to catch.
 */
export function render(scene, { w = 48, h = 48, spp = 64, seed = 1, eye = [0, 0, 5], look = [0, 0, 0],
                                up = [0, 1, 0], fovDeg = 40, maxDepth = 8, rrQ = null, sky = () => 1, nee = true,
                                region = null, streamRng = false,
                                plantGlobalGuard = false, plantDoubleCount = false,
                                // v3497 -- rgb:true widens the buffer to three floats per pixel. OFF, the array
                                // is exactly what every caller before this round received, so nothing moved.
                                rgb = false,
                                // v3498 -- STRATIFIED PIXEL SAMPLING. `strat` jitters inside an n x n grid over
                                // the spp samples instead of drawing two free uniforms, AND IT CONSUMES EXACTLY
                                // THE SAME TWO RANDOM NUMBERS PER SAMPLE -- so the rest of the path is
                                // untouched and the comparison is about the SAMPLE POSITIONS and nothing else.
                                strat = false, plantNoJitter = false, plantOneStratum = false,
                                // v3500 -- stratify the PATH dimensions as well as the pixel ones.
                                pathStrat = false,
                                ...rest } = {}) {
    // v3475 -- PER-PIXEL SEEDING, AND IT IS A CORRECTNESS REQUIREMENT RATHER THAN A TIDINESS ONE. With one
    // streamed generator, rendering a 64x64 REGION consumes a different random sequence than rendering the same
    // 64x64 patch inside a 512x512 frame, so the region and the crop would differ by NOISE and no exact
    // comparison between them would be possible. Seeded from (x, y, seed), A REGION SCAN IS BIT-IDENTICAL TO
    // THE CORRESPONDING CROP -- which is what makes "scan just this corner" a measurement rather than a
    // suggestion.
    //
    // v3487 -- `streamRng` IS THE PLANT, AND IT IS A PARAMETER RATHER THAN AN EDITED COPY, so a planted run and
    // a clean run take THE SAME CODE PATH (v3467's rule). It is the implementation somebody writes first: one
    // generator for the whole frame. *** IT IS INVISIBLE ON THE FURNACE AND ONLY THE FURNACE. With a constant
    // sky every sample carries the same radiance, so the sequence a pixel consumes cannot change its value and
    // both the albedo and the crop identity survive -- A SUITE THAT GRADED ONLY THE FURNACE WOULD CERTIFY A
    // BROKEN SEEDING SCHEME. On a gradient sky the crop stops matching the frame. ***
    const streamed = streamRng ? rng(seed >>> 0) : null;
    const pixelRand = (x, y) => streamed || rng(((seed * 73856093) ^ (x * 19349663) ^ (y * 83492791)) >>> 0);
    const fwd = norm(sub(look, eye));
    const right = norm([fwd[1] * up[2] - fwd[2] * up[1], fwd[2] * up[0] - fwd[0] * up[2], fwd[0] * up[1] - fwd[1] * up[0]]);
    const camUp = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
    const scale = Math.tan(fovDeg * Math.PI / 360);
    // A REGION is a sub-rectangle of the SAME camera, never a re-aimed one: the frustum is unchanged and only
    // which pixels get walked changes. Re-aiming would give a different projection and the crop identity below
    // would quietly stop holding.
    const R = region || { x0: 0, y0: 0, w, h };
    // *** REFUSED RATHER THAN ROUNDED: an n x n grid needs a square sample count, and silently falling back to
    // free sampling would make every measurement below a comparison between two things nobody chose. ***
    const nStrat = Math.round(Math.sqrt(spp));
    if ((strat || pathStrat) && nStrat * nStrat !== spp)
        throw new Error("pathTracer: strat needs a square spp, got " + spp + " (nearest square " + nStrat * nStrat + ")");
    const CH = rgb ? 3 : 1;
    const out = new Float64Array(R.w * R.h * CH);
    for (let y = R.y0; y < R.y0 + R.h; y++) {
        for (let x = R.x0; x < R.x0 + R.w; x++) {
            const rand = pixelRand(x, y);
            // A PER-PIXEL PERMUTATION OF THE STRATUM ORDER, derived from this pixel's own stream so it costs
            // no draws at all. Fisher-Yates over the sample indices, once per pixel rather than per sample.
            let perm = null;
            if (pathStrat) {
                perm = Array.from({ length: spp }, (_, k) => k);
                const pr = pixelRand(x + 7919, y + 104729);          // a second stream, not this pixel's own
                for (let k = spp - 1; k > 0; k--) { const j = (pr() * (k + 1)) | 0; [perm[k], perm[j]] = [perm[j], perm[k]]; }
            }
            let acc = 0, accR = 0, accG = 0, accB = 0;
            for (let s = 0; s < spp; s++) {
                // THE TWO DRAWS HAPPEN EITHER WAY, INCLUDING UNDER plantNoJitter, WHICH DISCARDS THEM: a plant
                // that consumed a different number of random numbers would move every later decision on the
                // path and the measurement would be about the sequence rather than about the sampler.
                const r1 = rand(), r2 = rand();
                let fx, fy;
                if (strat) {
                    const sx = s % nStrat, sy = (s / nStrat) | 0;
                    const cx = plantOneStratum ? 0 : sx, cy = plantOneStratum ? 0 : sy;
                    fx = (cx + (plantNoJitter ? 0.5 : r1)) / nStrat;
                    fy = (cy + (plantNoJitter ? 0.5 : r2)) / nStrat;
                } else { fx = r1; fy = r2; }
                const u = ((x + fx) / w * 2 - 1) * scale * (w / h);
                const v = (1 - (y + fy) / h * 2) * scale;
                const dir = norm(add(fwd, add(mul(right, u), mul(camUp, v))));
                // `v` is already the vertical image coordinate two lines up -- v3421 lost a round to a name
                // collision in a temporal dead zone, and this one would merely have thrown, which is luckier.
                const L = trace(eye, dir, scene, rand,
                                { maxDepth, rrQ, sky, nee, plantGlobalGuard, plantDoubleCount, rgb,
                                  strata: pathStrat ? { n: nStrat, i: s, shuffle: perm } : null, ...rest });
                if (rgb) { accR += L[0]; accG += L[1]; accB += L[2]; } else acc += L;
            }
            const i = ((y - R.y0) * R.w + (x - R.x0)) * CH;
            if (rgb) { out[i] = accR / spp; out[i + 1] = accG / spp; out[i + 2] = accB / spp; }
            else out[i] = acc / spp;
        }
    }
    return out;
}

/** Which pixels actually landed on geometry -- so a flatness check can ask about those and not the background. */
export function coverage(scene, opts = {}) {
    const { w = 48, h = 48, eye = [0, 0, 5], look = [0, 0, 0], up = [0, 1, 0], fovDeg = 40 } = opts;
    const fwd = norm(sub(look, eye));
    const right = norm([fwd[1] * up[2] - fwd[2] * up[1], fwd[2] * up[0] - fwd[0] * up[2], fwd[0] * up[1] - fwd[1] * up[0]]);
    const camUp = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
    const scale = Math.tan(fovDeg * Math.PI / 360);
    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const u = ((x + 0.5) / w * 2 - 1) * scale * (w / h);
        const v = (1 - (y + 0.5) / h * 2) * scale;
        mask[y * w + x] = intersect(eye, norm(add(fwd, add(mul(right, u), mul(camUp, v)))), scene) ? 1 : 0;
    }
    return mask;
}
