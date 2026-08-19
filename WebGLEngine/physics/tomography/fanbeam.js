// physics/tomography/fanbeam.js
//
// FAN-BEAM CT -- v2811. The existing reconstruction instrument (physics/tomography/ct.js) is PARALLEL beam: every
// ray in a projection is parallel, which is a mathematical convenience, not a machine. A real scanner has a point
// source, so the rays DIVERGE through the patient and land on an arc of detectors.
//
// THE ANSWER KEYS:
//
//  1. CROSS-INSTRUMENT, the same move that validated the Fresnel and Kerr rounds: push the source distance D to
//     infinity and a fan projection MUST become a parallel projection. Divergence is a function of how close the
//     source is; move it far enough away and the rays are parallel again. That is checkable against the existing
//     radon() to whatever tolerance the geometry allows.
//
//  2. REBINNING IS THE RECONSTRUCTION. Rather than reimplement filtered back-projection with fan weights, this
//     REBINS fan rays into parallel ones -- each fan ray (beta, gamma) IS a parallel ray at angle beta+gamma and
//     offset D sin(gamma) -- and then hands them to the ALREADY GATED parallel FBP. Reusing the proven half
//     means the only new thing to prove is the coordinate mapping, and the gate proves exactly that.
//
//  3. THE LOAD-BEARING NEGATIVE: at a realistic source distance the RAW fan sinogram must NOT already look like
//     a parallel one, and reconstructing fan data as if it were parallel -- skipping the rebinning -- must
//     visibly degrade the image. If it did not, the rebinning would be decoration.
//
// SCOPE, stated: 2D equiangular fan beam, full 360-degree source rotation, no cone angle, no detector response,
// no beam hardening. Those are separate instruments and claiming them here would be decoration.
//
// Pure, no imports, browser-safe.

// Half fan angle needed to cover a field of view of radius R from a source at distance D.
export const fanHalfAngle = (D, R) => Math.asin(Math.min(0.999999, R / D));

// Equiangular detector fan angles, nDet of them spanning [-gammaMax, +gammaMax].
export function fanAngles(nDet, gammaMax) {
    const out = new Float64Array(nDet);
    for (let d = 0; d < nDet; d++) out[d] = -gammaMax + (2 * gammaMax) * (d + 0.5) / nDet;
    return out;
}

// Source positions for a full rotation.
export function betaSet(n) { const a = []; for (let i = 0; i < n; i++) a.push(2 * Math.PI * i / n); return a; }

// Fan-beam projection. Source sits at distance D from the centre at angle beta; each ray leaves at fan angle
// gamma from the central ray and is integrated through the image by uniform sampling.
//
// GEOMETRY, DERIVED AGAINST THIS CODEBASE'S OWN CONVENTION rather than a textbook's. ct.js's radon() builds a ray
// at angle theta with direction (-sin theta, cos theta) and offset measured along (cos theta, sin theta). A fan
// ray leaving the source at S = D(cos beta, sin beta) travels along angle beta + pi + gamma, i.e. direction
// (-cos(beta+gamma), -sin(beta+gamma)). Matching the two gives
//
//     theta = beta + gamma + pi/2       t = -D sin(gamma)
//
// NOT the textbook theta = beta + gamma, t = +D sin(gamma) -- that form assumes a different reference axis. The
// first implementation used the textbook pair and the fan/parallel divergence sat FLAT at 0.31 no matter how far
// away the source went, which is the signature of a convention error rather than a geometry one: a genuine
// convergence failure shrinks with D, a mismatched frame does not. The cross-instrument check is what exposed it.
export function fanProjection(img, N, betas, gammas, D, opts = {}) {
    const half = N / 2;
    const steps = opts.steps || Math.ceil(2 * N);
    const sino = [];
    for (const beta of betas) {
        const sx = D * Math.cos(beta), sy = D * Math.sin(beta);
        const proj = new Float64Array(gammas.length);
        for (let g = 0; g < gammas.length; g++) {
            const ang = beta + Math.PI + gammas[g];              // direction of travel, away from the source
            const dx = Math.cos(ang), dy = Math.sin(ang);
            // march the chord that can possibly intersect the field of view
            const tEnter = D - half * 1.5, tExit = D + half * 1.5;
            const dt = (tExit - tEnter) / steps;
            let sum = 0;
            for (let k = 0; k < steps; k++) {
                const t = tEnter + (k + 0.5) * dt;
                const x = sx + dx * t, y = sy + dy * t;
                const px = (x + half) | 0, py = (y + half) | 0;
                if (px >= 0 && px < N && py >= 0 && py < N) sum += img[py * N + px];
            }
            proj[g] = sum * dt;
        }
        sino.push(proj);
    }
    return sino;
}

// REBINNING: fan (beta, gamma) -> parallel (theta, t). Returns a parallel sinogram on the requested angle set,
// sampled by nearest-neighbour in both coordinates (linear in t would be smoother; nearest keeps the mapping
// visible and is what the gate checks).
export function rebinToParallel(fanSino, betas, gammas, D, angles, nDet, N) {
    const half = N / 2;
    const out = angles.map(() => new Float64Array(nDet));
    const count = angles.map(() => new Float64Array(nDet));
    for (let b = 0; b < betas.length; b++) {
        for (let g = 0; g < gammas.length; g++) {
            let theta = betas[b] + gammas[g] + Math.PI / 2;
            let t = -D * Math.sin(gammas[g]);
            // fold into [0, pi): a ray and its reverse are the same line
            theta = ((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
            if (theta >= Math.PI) { theta -= Math.PI; t = -t; }
            // nearest angle bin
            const ai = Math.round(theta / Math.PI * angles.length) % angles.length;
            const di = Math.round(t / half * (nDet / 2) + nDet / 2 - 0.5);
            if (di >= 0 && di < nDet) { out[ai][di] += fanSino[b][g]; count[ai][di] += 1; }
        }
    }
    for (let a = 0; a < out.length; a++) for (let d = 0; d < nDet; d++) if (count[a][d] > 0) out[a][d] /= count[a][d];
    // fill any gap left by the sampling with its nearest filled neighbour along t
    for (let a = 0; a < out.length; a++) {
        for (let d = 0; d < nDet; d++) {
            if (count[a][d] > 0) continue;
            let lo = d - 1, hi = d + 1;
            while (lo >= 0 || hi < nDet) {
                if (lo >= 0 && count[a][lo] > 0) { out[a][d] = out[a][lo]; break; }
                if (hi < nDet && count[a][hi] > 0) { out[a][d] = out[a][hi]; break; }
                lo--; hi++;
            }
        }
    }
    return out;
}

// How far a fan sinogram departs from the parallel one it would become at infinite source distance.
// Scale-invariant: both are normalised to their own mean before comparison, since the two geometries carry
// different path-length scalings.
export function sinoDivergence(a, b) {
    const flat = (s) => { const o = []; for (const row of s) for (const v of row) o.push(v); return o; };
    const A = flat(a), B = flat(b);
    const n = Math.min(A.length, B.length);
    let ma = 0, mb = 0;
    for (let i = 0; i < n; i++) { ma += A[i]; mb += B[i]; }
    ma /= n; mb /= n;
    if (ma === 0 || mb === 0) return NaN;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { const x = A[i] / ma, y = B[i] / mb; num += (x - y) * (x - y); den += y * y; }
    return Math.sqrt(num / den);
}
