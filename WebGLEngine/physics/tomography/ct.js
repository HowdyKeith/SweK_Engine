// physics/tomography/ct.js
//
// Filtered back-projection CT as a ground-truth benchmark. We define a phantom exactly, forward-project it -- the Radon
// transform, the line integrals a scanner records at many angles, which is the sinogram -- then reconstruct it with
// filtered back-projection and grade the reconstruction against the phantom we own. The straight-ray line-integral model
// is the geometric-optics limit, valid when scattering is weak, which is exactly the regime born.js quantifies: it hands
// back how large a phase shift a feature may impose before the straight-ray assumption stops being trustworthy. Clean-room
// -- nothing from ASTRA (GPL) or any tomography library. Back-projection uses cos and sin, so this is GATED, not
// fingerprinted (trig is not cross-architecture).

import { maxPhaseFor } from "../../simulation/em/born.js";

// A phantom: a sum of uniform-density ellipses on [-1,1]^2. Exact and analytic -- our ground truth.
export function phantomField(N, ellipses) {
    const img = new Float64Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = (i - N / 2 + 0.5) / (N / 2), y = (j - N / 2 + 0.5) / (N / 2);
        let v = 0;
        for (const e of ellipses) { const dx = x - e.cx, dy = y - e.cy; if ((dx * dx) / (e.a * e.a) + (dy * dy) / (e.b * e.b) <= 1) v += e.rho; }
        img[j * N + i] = v;
    }
    return img;
}

// Radon transform: p(theta, t) = the line integral through the image along the ray at offset t. The sinogram.
export function radon(img, N, angles, nDet) {
    const sino = [], half = N / 2;
    for (const th of angles) {
        const ct = Math.cos(th), st = Math.sin(th), proj = new Float64Array(nDet);
        for (let d = 0; d < nDet; d++) {
            const t = (d - nDet / 2 + 0.5) / (nDet / 2) * half;
            let sum = 0;
            for (let s = -half; s < half; s++) { const px = (half + t * ct - s * st) | 0, py = (half + t * st + s * ct) | 0; if (px >= 0 && px < N && py >= 0 && py < N) sum += img[py * N + px]; }
            proj[d] = sum;
        }
        sino.push(proj);
    }
    return sino;
}

// v3073 -- THE ANALYTIC RADON TRANSFORM, so the forward model stops being checked only against itself.
//
// radon() above integrates along rays through a RASTERISED phantom, and filteredBackProjection inverts it. Every
// existing check compares the reconstruction to the same rasterised phantom -- which means the forward model and
// the inverse share an error the moment the forward model has one. That is the INVERSE CRIME: a pipeline can be
// self-consistent and wrong, and it will look excellent doing it.
//
// A uniform ellipse has an EXACT projection, and it owes nothing to the grid:
//
//     p(s, th) = 2 rho A B / a(th)^2 * sqrt(a(th)^2 - s^2)     for |s| <= a(th),  else 0
//     a(th)^2  = A^2 cos^2(th - phi) + B^2 sin^2(th - phi)
//
// with s measured from the ellipse centre projected onto the detector axis. Comparing radon() against THIS
// breaks the crime: the two disagree exactly where the rasterisation is wrong, and nowhere else.
//
// UNITS ARE THE TRAP HERE and they are why this is stated rather than assumed. radon() sums PIXELS along a ray,
// so its output is in pixel counts; the closed form is a length in image units where the field spans [-1, 1].
// One pixel is 2/N of that span, so the analytic value must be multiplied by N/2 to be comparable. Getting that
// backwards produces a curve of exactly the right SHAPE and the wrong scale -- which a correlation check would
// happily pass, and which is precisely the class of error an independent key exists to catch.
export function analyticRadonEllipse(e, angles, nDet, N) {
    const phi = e.phi || 0, half = N / 2;
    const out = [];
    for (const th of angles) {
        const c = Math.cos(th - phi), sn = Math.sin(th - phi);
        const a2 = e.a * e.a * c * c + e.b * e.b * sn * sn;
        const shift = e.cx * Math.cos(th) + e.cy * Math.sin(th);   // centre projected onto the detector axis
        const proj = new Float64Array(nDet);
        for (let d = 0; d < nDet; d++) {
            const t = (d - nDet / 2 + 0.5) / (nDet / 2);            // image units, span [-1, 1]
            const s = t - shift;
            const r2 = a2 - s * s;
            proj[d] = r2 > 0 ? (2 * e.rho * e.a * e.b / a2) * Math.sqrt(r2) * half : 0;
        }
        out.push(proj);
    }
    return out;
}

/** Sum of several ellipses: the Radon transform is linear, which is itself worth checking. */
export function analyticRadon(ellipses, angles, nDet, N) {
    let acc = null;
    for (const e of ellipses) {
        const p = analyticRadonEllipse(e, angles, nDet, N);
        if (!acc) acc = p.map((row) => Float64Array.from(row));
        else for (let i = 0; i < acc.length; i++) for (let d = 0; d < nDet; d++) acc[i][d] += p[i][d];
    }
    return acc;
}

// Ram-Lak (ramp) filter kernel in the spatial domain: h[0]=1/4, h[odd]=-1/(pi^2 n^2), h[even]=0.
export function ramLakKernel(len) {
    const h = new Float64Array(2 * len + 1);
    for (let n = -len; n <= len; n++) h[n + len] = n === 0 ? 0.25 : (n % 2 !== 0 ? -1 / (Math.PI * Math.PI * n * n) : 0);
    return h;
}

// Convolve each projection with the Ram-Lak kernel -- the filter that makes back-projection reconstruct instead of blur.
export function filterSino(sino, nDet) {
    const h = ramLakKernel(nDet);
    return sino.map((proj) => { const out = new Float64Array(nDet); for (let d = 0; d < nDet; d++) { let s = 0; for (let k = 0; k < nDet; k++) s += proj[k] * h[(d - k) + nDet]; out[d] = s; } return out; });
}

// Back-project the (filtered) sinogram into an image.
export function backProject(sino, N, angles, nDet) {
    const img = new Float64Array(N * N), half = N / 2;
    for (let a = 0; a < angles.length; a++) {
        const ct = Math.cos(angles[a]), st = Math.sin(angles[a]), proj = sino[a];
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
            const x = i - half + 0.5, y = j - half + 0.5, t = x * ct + y * st;
            const di = Math.round(t / half * (nDet / 2) + nDet / 2 - 0.5);
            if (di >= 0 && di < nDet) img[j * N + i] += proj[di];
        }
    }
    const scale = Math.PI / angles.length;
    for (let k = 0; k < img.length; k++) img[k] *= scale;
    return img;
}

// The full reconstruction. filter=false gives raw (blurred) back-projection -- the textbook contrast.
export function filteredBackProjection(sino, N, angles, nDet, filter = true) {
    return backProject(filter ? filterSino(sino, nDet) : sino, N, angles, nDet);
}

// Score against the truth we own: correlation (scale-invariant, since the filter fixes an arbitrary gain) and a
// scale-normalized RMS relative to the truth's own spread.
export function scoreRecon(recon, truth) {
    const n = recon.length; let mr = 0, mt = 0;
    for (let k = 0; k < n; k++) { mr += recon[k]; mt += truth[k]; } mr /= n; mt /= n;
    let cov = 0, vr = 0, vt = 0;
    for (let k = 0; k < n; k++) { const a = recon[k] - mr, b = truth[k] - mt; cov += a * b; vr += a * a; vt += b * b; }
    const corr = cov / Math.sqrt((vr * vt) || 1), g = cov / (vr || 1);
    let se = 0; for (let k = 0; k < n; k++) { const e = (recon[k] - mr) * g - (truth[k] - mt); se += e * e; }
    return { corr, rms: Math.sqrt(se / n) / (Math.sqrt(vt / n) || 1) };
}

// The born.js tie: the largest phase shift a feature may impose before the straight-ray (line-integral) model that CT
// rests on stops being trustworthy, at a given error tolerance -- born.js returns sqrt(2*tol). Reconstruction of features
// within this bound is believable; beyond it, refraction bends the rays and the line-integral model is the wrong physics.
export function straightRayValidPhase(tol = 0.05) { return maxPhaseFor(tol); }

// Convenience: uniform angle set over [0, pi).
export function angleSet(n) { const a = []; for (let i = 0; i < n; i++) a.push(Math.PI * i / n); return a; }
