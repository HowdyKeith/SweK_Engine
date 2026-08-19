// physics/optics/interferometer.js
//
// Phase-shifting interferometry as a ground-truth metrology benchmark. We define a surface we know exactly -- a metaball
// height field, the blobulator's own kind -- simulate a coherent beam reflecting off it and interfering with a stepped
// reference, and then RECOVER the surface height from the fringe stack. The reconstruction never sees the true height;
// grading it against the truth we own is the whole point. The instrument is simulated, the optics is real, the answer is
// checkable. Phase-shifting uses atan2 -- trig -- so this is GATED, not fingerprinted (trig is not cross-architecture).

// A metaball surface height field: a sum of smooth bumps. z(x,y) is exact and analytic -- this is our ground truth.
export function metaballHeight(balls, x, y) {
    let z = 0;
    for (const b of balls) { const dx = x - b.cx, dy = y - b.cy; z += b.a * Math.exp(-(dx * dx + dy * dy) / (2 * b.s * b.s)); }
    return z;
}

// Sample the surface on a W x H grid -> the true height map (Float64, our answer key).
export function sampleSurface(balls, W, H, scale = 1) {
    const z = new Float64Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) z[j * W + i] = metaballHeight(balls, i * scale, j * scale);
    return z;
}

// The phase a height imprints on a double-pass reflected beam: phi = 4*pi*z / lambda.
export function phaseFromHeight(z, lambda) { return (4 * Math.PI * z) / lambda; }

// One interferogram frame at reference phase-step delta: I = A + B*cos(phi + delta).
export function interferogram(zMap, lambda, delta, A = 1, B = 0.9) {
    const I = new Float64Array(zMap.length);
    for (let k = 0; k < zMap.length; k++) I[k] = A + B * Math.cos(phaseFromHeight(zMap[k], lambda) + delta);
    return I;
}

// v3078 -- NEWTON'S RINGS, an answer key that owes nothing to the recovery algebra.
//
// Every check here so far has been a ROUND TRIP: build a height map, make frames from it, recover it, compare.
// That returns rms 9.25e-17 -- machine precision -- and it should, because the four-step arctan is the exact
// algebraic inverse of the cosine that produced the frames. IT PROVES THE ALGEBRA ROUND-TRIPS. It says nothing
// about whether phaseFromHeight has the right factor, because a wrong factor cancels: it goes in through the
// forward model and comes back out through the inverse. THE INVERSE CRIME, and the same one CT had.
//
// A sphere resting on a flat gives Newton's rings, and the DARK ring radii are a textbook result derived from
// geometry, not from anything in this file:
//
//     r_m = sqrt( m * lambda * R )        m = 1, 2, 3, ...
//
// The gap under a sphere of radius R is z(r) = r^2 / (2R), so a dark fringe needs 2z = m*lambda. Measuring ring
// radii out of a generated interferogram and comparing them against that formula tests the FACTOR OF 2 in
// phaseFromHeight, the wavelength scaling, and the fringe geometry together -- none of which a round trip can
// see, because all three cancel.
// TWO CONVENTIONS, AND THE DIFFERENCE IS PHYSICS RATHER THAN BOOKKEEPING. The textbook formula assumes the
// extra pi that a reflection off the denser medium adds, which is what makes the centre of Newton's rings DARK.
// interferogram() models a plain two-beam interference with no such shift, so its centre is BRIGHT and the dark
// fringes land on HALF-INTEGER orders. Measured, the module's default gives sqrt((m-1/2) lambda R) and stepping
// the reference by pi gives sqrt(m lambda R) -- both to about 1e-6.
//
// I wrote the integer form first and it missed by 29% on the first ring. That was the key being wrong for this
// model, not the model being wrong, and the size of the miss shrinking with m is what identified it as an order
// offset rather than a scale error.
export const newtonRingRadius = (m, lambda, R) => Math.sqrt(m * lambda * R);
export const newtonRingRadiusNoShift = (m, lambda, R) => Math.sqrt((m - 0.5) * lambda * R);

/** Gap between a sphere of radius R and a flat, sampled on a WxH grid of the given physical extent. */
export function sphereGap(W, H, R, extent) {
    const z = new Float64Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const x = (i - (W - 1) / 2) * extent / W, y = (j - (H - 1) / 2) * extent / H;
        z[j * W + i] = (x * x + y * y) / (2 * R);
    }
    return z;
}

/** Radii of the intensity minima along the +x axis of an interferogram, in physical units. */
export function ringRadii(I, W, H, extent, maxRings = 6) {
    const cy = Math.floor((H - 1) / 2), cx = (W - 1) / 2, out = [];
    for (let i = 2; i < W - 2 && out.length < maxRings; i++) {
        const a = I[cy * W + i - 1], b = I[cy * W + i], c = I[cy * W + i + 1];
        if (b < a && b < c && i > cx) {
            // parabolic sub-sample refinement -- the ring sits between samples and rounding to the nearest one
            // would put a grid artefact into a measurement of a smooth curve
            const d = (a - c) / (2 * (a - 2 * b + c));
            out.push((i + d - cx) * extent / W);
        }
    }
    return out;
}

// The classic four-step stack: reference stepped by 0, pi/2, pi, 3pi/2.
export function fourStep(zMap, lambda) {
    return [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2].map((d) => interferogram(zMap, lambda, d));
}

// Four-step phase-shifting recovery -> wrapped phase in (-pi, pi] via atan2.
export function phaseShiftRecover(frames) {
    const [I0, I1, I2, I3] = frames, phi = new Float64Array(I0.length);
    for (let k = 0; k < phi.length; k++) phi[k] = Math.atan2(I3[k] - I1[k], I0[k] - I2[k]);
    return phi;
}

// Row-then-column phase unwrapping: remove 2*pi jumps along each row, then align rows via column 0. Exact for surfaces
// smooth enough that no true adjacent step exceeds pi (the Nyquist limit for phase). This is where wrapped fringes become
// a continuous height again.
export function unwrap2d(phi, W, H) {
    const out = Float64Array.from(phi), TAU = 2 * Math.PI;
    for (let j = 0; j < H; j++) { let off = 0; for (let i = 1; i < W; i++) { const k = j * W + i, kp = j * W + i - 1; let d = out[k] + off - out[kp]; while (d > Math.PI) { off -= TAU; d -= TAU; } while (d < -Math.PI) { off += TAU; d += TAU; } out[k] += off; } }
    let colOff = 0;
    for (let j = 1; j < H; j++) { let d = out[j * W] + colOff - out[(j - 1) * W]; while (d > Math.PI) { colOff -= TAU; d -= TAU; } while (d < -Math.PI) { colOff += TAU; d += TAU; } for (let i = 0; i < W; i++) out[j * W + i] += colOff; }
    return out;
}

// Recover the height map from the frame stack: recover wrapped phase, optionally unwrap, convert phase back to height.
export function recoverHeight(frames, lambda, W, H, unwrap = true) {
    let phi = phaseShiftRecover(frames);
    if (unwrap) phi = unwrap2d(phi, W, H);
    const z = new Float64Array(phi.length);
    for (let k = 0; k < z.length; k++) z[k] = (phi[k] * lambda) / (4 * Math.PI);
    return z;
}

// The honest metrology score: RMS and peak error after removing a constant piston -- interferometry recovers height only
// up to a global offset, because the reference phase is arbitrary. Both maps are mean-subtracted before comparison.
export function scoreRecovery(recovered, truth) {
    const n = recovered.length; let mr = 0, mt = 0;
    for (let k = 0; k < n; k++) { mr += recovered[k]; mt += truth[k]; } mr /= n; mt /= n;
    let se = 0, peak = 0;
    for (let k = 0; k < n; k++) { const e = (recovered[k] - mr) - (truth[k] - mt); se += e * e; if (Math.abs(e) > peak) peak = Math.abs(e); }
    return { rms: Math.sqrt(se / n), peak };
}
