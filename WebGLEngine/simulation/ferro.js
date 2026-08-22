// WebGLEngine/simulation/ferro.js — v2554
//
// SOUND IS VIBRATION. MAGNETISM IS NOT. THE DIFFERENCE IS WHETHER THE BLOB PUSHES BACK.
//
// ---- SOUND ---------------------------------------------------------------------------------------------------
//
// Blast sound at a blob and yes, it is essentially vibration -- because THE BLOB DOES NOT CHANGE THE SOUND FIELD
// APPRECIABLY. Drive a scalar field with a travelling pressure wave and the surface oscillates. Linear. Boring.
//
// The one thing that is NOT boring: a STANDING wave has NODES THAT DO NOT MOVE. That is how acoustic levitation
// works and why sand on a Chladni plate collects into geometric patterns -- the material migrates to the nodes
// and takes their shape. So sound does not shake a blob so much as SCULPT it, and the sculpture is the nodal
// pattern, not the wave. Still linear, still one-way: the sand does not change the plate.
//
// ---- MAGNETISM -----------------------------------------------------------------------------------------------
//
// Feed a blob magnetism and it is a different category of thing, because A FERROFLUID MAGNETISES, WHICH CHANGES
// THE FIELD, WHICH CHANGES THE FORCE ON IT. That feedback is the whole phenomenon.
//
// Rosensweig's own linear stability analysis (Cowley & Rosensweig 1967; see arXiv:1101.3742) puts it exactly:
// "Although the applied magnetic field is HOMOGENEOUS and therefore NO NET-FORCE is acting on the medium,
// FLUCTUATIONS OF THE SURFACE LEAD TO FOCUSING EFFECTS rendering the local field at the surface inhomogeneous."
//
// A uniform field exerts ZERO net force on a flat ferrofluid. Nothing happens. But a BUMP FOCUSES THE FIELD, so
// the field at the bump is stronger, so it pulls harder, so the bump grows. Gravity and surface tension resist.
// Above a critical magnetisation the bump wins, and the surface breaks into HEXAGONAL SPIKES.
//
// That is the answer to both questions at once: sound is vibration BECAUSE the blob does not push back, and
// magnetism is not BECAUSE IT DOES.
//
// ---- THE NUMBERS, WEB-VERIFIED NOT REMEMBERED -----------------------------------------------------------------
//
//     M_c^2 = (2/mu_0) * (1 + 1/r_c) * sqrt(g * rho * sigma)        the critical magnetisation
//     k_c   = sqrt(rho * g / sigma)                                  the critical wavenumber
//
// where r_c = sqrt(mu_ch * mu_t)/mu_0 is the geometric mean of the chord and tangent permeabilities at the
// critical field. k_c IS THE CAPILLARY WAVENUMBER -- the instability picks the capillary wavelength, which is not
// an assumption of the theory but a prediction of it, and that makes it the thing worth testing.
//
// HONEST LIMIT, UP FRONT: this computes the THRESHOLD and the WAVELENGTH, and demonstrates the FEEDBACK that
// causes them, on a 1D surface. It is not a ferrohydrodynamics solver. The hexagons are a 2D pattern-selection
// result and nothing here selects hexagons -- claiming otherwise would be the interesting part done by assertion.
"use strict";

export const MU0 = 4e-7 * Math.PI;   // exact by the pre-2019 SI definition; close enough that nothing here cares

/**
 * Rosensweig's critical magnetisation. Above this, a flat ferrofluid surface is no longer the stable shape.
 * @param {number} rho    density, kg/m^3
 * @param {number} sigma  surface tension, N/m
 * @param {number} rc     geometric mean of chord and tangent relative permeability at the critical field
 * @param {number} g      gravity, m/s^2
 */
export function criticalMagnetisation(rho, sigma, rc, g = 9.81) {
    return Math.sqrt((2 / MU0) * (1 + 1 / rc) * Math.sqrt(g * rho * sigma));
}

/** The critical wavenumber -- the capillary one. The instability PICKS this; the theory does not assume it. */
export function criticalWavenumber(rho, sigma, g = 9.81) {
    return Math.sqrt((rho * g) / sigma);
}

/** ...and the spacing you would actually see between spikes. */
export function spikeSpacing(rho, sigma, g = 9.81) {
    return (2 * Math.PI) / criticalWavenumber(rho, sigma, g);
}

/**
 * THE FEEDBACK, ON A 1D SURFACE. This is the part that answers the question.
 *
 * A surface height h(x). Three forces per mode:
 *   gravity          -rho*g*h        pulls a bump down, always
 *   surface tension  -sigma*k^2*h    pulls a bump flat, harder for SHORT wavelengths
 *   magnetic         +mu0*M^2*k*h/2  THE FOCUSING. Grows with k -- a sharper bump focuses harder.
 *
 * The magnetic term is LINEAR in k and the tension term is QUADRATIC, so tension always wins eventually and
 * gravity always wins at long wavelength. The instability lives in the middle, and that is WHY it has a
 * characteristic wavelength at all rather than just blowing up at the sharpest mode available.
 *
 * NOTE THE SIGN OF THE MAGNETIC TERM: it is +h. It is PROPORTIONAL TO THE BUMP. A flat surface (h=0) feels
 * nothing, exactly as Rosensweig says -- a uniform field exerts no net force. THE BUMP CREATES ITS OWN FORCE.
 * That is the feedback, and it is why this is not vibration.
 *
 * @returns {number} the growth rate of mode k. Positive = the bump grows = instability.
 */
export function growthRate(k, M, rho, sigma, g = 9.81, rc = 1) {
    // !! THE PERMEABILITY FACTOR IS NOT OPTIONAL, and leaving it out was caught by the only test that matters.
    // The first version used mu0*M^2*k/2 and reported the surface FLAT at M = 1.0*M_c. But M_c is DEFINED as the
    // point where it goes unstable, so a growth rate that does not cross zero exactly there means the two halves
    // of this file are describing different fluids.
    //
    // By hand: at k_c = sqrt(rho*g/sigma), tension = sigma*k_c^2 = rho*g, so gravity + tension = 2*rho*g. Setting
    // the magnetic term equal to that gives M_c^2 = (4/mu0)*sqrt(rho*g*sigma) -- which is the published formula
    // ONLY when r_c = 1. The demo passed r_c = 1.6. THE FOCUSING IS REDUCED BY THE PERMEABILITY CONTRAST, by
    // exactly (1 + 1/r_c)/2, and dropping it made the threshold and the dynamics disagree by 50%.
    const magnetic = (MU0 * M * M * k) / (1 + 1 / rc);
    const gravity = rho * g;                  // flattening: independent of k
    const tension = sigma * k * k;            // flattening: quadratic in k
    return magnetic - gravity - tension;
}

/** Which mode grows fastest, and does anything grow at all? Scans, rather than trusting an algebraic shortcut. */
export function mostUnstable(M, rho, sigma, g = 9.81, kMax = 5000, rc = 1) {
    let best = 0, bestRate = -Infinity;
    for (let i = 1; i <= 4000; i++) {
        const k = (i / 4000) * kMax;
        const r = growthRate(k, M, rho, sigma, g, rc);
        if (r > bestRate) { bestRate = r; best = k; }
    }
    return { k: best, rate: bestRate, unstable: bestRate > 0 };
}

/**
 * SOUND, for contrast. A standing wave's nodes do not move; material migrates to them.
 * This is one-way on purpose: the blob does not change the sound field, which is exactly why it is "just
 * vibration". If it DID, this function would need to be a solver rather than a formula.
 */
export function standingWaveField(x, t, k, omega, amp = 1) {
    return amp * Math.cos(k * x) * Math.cos(omega * t);
}

/** Where the nodes sit -- the places that never move, and therefore where the sand ends up. */
export function nodesOf(k, xMin, xMax) {
    const out = [];
    // cos(kx) = 0 at kx = pi/2 + n*pi
    for (let n = Math.ceil((k * xMin - Math.PI / 2) / Math.PI); ; n++) {
        const x = (Math.PI / 2 + n * Math.PI) / k;
        if (x > xMax) break;
        if (x >= xMin) out.push(x);
    }
    return out;
}

// ---- CLI -----------------------------------------------------------------------------------------------------
if (process.argv[1] && process.argv[1].endsWith("ferro.js")) {
    // APG 512a, the ferrofluid used in the papers (Ferrotec). Representative values.
    const rho = 1236, sigma = 0.025, rc = 1.6;
    const Mc = criticalMagnetisation(rho, sigma, rc);
    console.log("\n  A REAL FERROFLUID (APG 512a-ish: rho " + rho + " kg/m^3, sigma " + sigma + " N/m, r_c " + rc + ")\n");
    console.log("  critical magnetisation M_c   " + (Mc / 1000).toFixed(2) + " kA/m");
    console.log("  critical field B_c ~ mu0*M_c " + (MU0 * Mc * 1000).toFixed(2) + " mT");
    console.log("  spike spacing 2pi/k_c        " + (1000 * spikeSpacing(rho, sigma)).toFixed(2) + " mm");
    console.log("\n  Below M_c nothing happens. Above it the flat surface stops being the answer.\n");
    for (const f of [0.5, 0.9, 1.0, 1.1, 1.5]) {
        const M = Mc * f;
        const u = mostUnstable(M, rho, sigma, 9.81, 5000, rc);
        console.log("  M = " + f.toFixed(1) + " M_c   " + (u.unstable ? "UNSTABLE" : "flat    ") +
                    "   fastest mode k=" + u.k.toFixed(0) + " (" + (1000 * 2 * Math.PI / Math.max(u.k, 1e-9)).toFixed(1) + " mm)   rate " + u.rate.toExponential(2));
    }
    console.log("\n  The magnetic term is proportional to h -- THE BUMP CREATES ITS OWN FORCE. A flat surface feels");
    console.log("  nothing from a uniform field. That feedback is why this is an instability and not vibration.");
}
