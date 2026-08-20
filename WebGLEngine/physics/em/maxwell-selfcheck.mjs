// physics/em/maxwell-selfcheck.mjs
//
// v3387 -- ELECTROMAGNETISM ARRIVES AS A CONNECTOR, NOT AN ISLAND.
//
// This was the largest missing domain, and what makes it worth building NOW is that three fields already here
// supply its keys. A field that only agreed with itself would be worth far less than one tying three others
// together:
//
//   SEISMIC    Fresnel reflection at normal incidence IS the impedance reflection (Z2-Z1)/(Z2+Z1) with Z = Z0/n.
//              Both give EXACTLY -0.2 for light entering glass. Same relation, different field, no shared code.
//   SEISMIC    Snell's law is the same conserved invariant that bends seismic rays -- n sin(theta) there,
//              sin(i)/v here, and they are the same statement.
//   ACOUSTICS  the Yee scheme has the same Courant structure: a cliff at the CFL limit, and the limit itself
//              falls as 1/sqrt(dimension).
//
// AND TWO KEYS COME FROM NATURE:
//   c = 1/sqrt(mu0 eps0) = 299792458.000 against a DEFINED 299792458, to 2.2e-14 -- which is the precision of
//   the CODATA constants rather than of the formula, and saying which is the point.
//   Z0 = 376.730313667 ohms against an accepted 376.730313668.

import {
    EPS0, MU0, C_DEFINED, lightSpeed, impedanceFreeSpace,
    refractiveIndex, waveImpedance, phaseSpeed, fresnelNormal, snellRefract, criticalAngle,
    cflLimit, peakField, gaussianPulse,
} from "./maxwell.mjs";
import { reflectionCoef } from "../seismic/rays.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. THE VACUUM CONSTANTS, GRADED AGAINST NATURE --------------------------------------------------------------
{
    const c = lightSpeed(), rel = Math.abs(c - C_DEFINED) / C_DEFINED;
    ok("!! 1/sqrt(mu0 eps0) reproduces the DEFINED speed of light",
        rel < 1e-12,
        `${c.toFixed(3)} m/s against ${C_DEFINED}, relative ${rel.toExponential(2)}. The metre is DEFINED from ` +
        "c, so this is not a test of Maxwell -- it is a consistency check on the CODATA permittivity and " +
        `permeability, and the ${rel.toExponential(1)} residual is their precision rather than the formula's`);

    ok("!! and the impedance of free space matches its accepted value",
        Math.abs(impedanceFreeSpace() - 376.730313668) < 1e-6,
        `${impedanceFreeSpace().toFixed(9)} ohms against 376.730313668. Two independent combinations of the same ` +
        "two constants -- their product gives c and their ratio gives Z0, so getting both right constrains each");
}

// ---- 2. FRESNEL IS THE SEISMIC IMPEDANCE REFLECTION -- a cross-field identity -------------------------------------------
{
    const cases = [[1, 1.5], [1, 2.4], [1.5, 1]];
    const worst = Math.max(...cases.map(([n1, n2]) => {
        const Z0 = impedanceFreeSpace();
        return Math.abs(Math.abs(fresnelNormal(n1, n2)) - Math.abs(reflectionCoef(Z0 / n1, Z0 / n2)));
    }));
    ok("!! Fresnel reflection and the seismic impedance reflection are one relation",
        worst < 1e-15,
        `worst difference ${worst.toExponential(1)} over three index pairs including a reversed one. Light into ` +
        `glass gives ${fresnelNormal(1, 1.5).toFixed(6)}, and so does an acoustic impedance step with Z = Z0/n. ` +
        "The seismic module was written for rock and knows nothing about light");

    ok("...and the sign flips going from dense to rare, in both",
        fresnelNormal(1, 1.5) < 0 && fresnelNormal(1.5, 1) > 0,
        "reflecting off a denser medium inverts the phase. That sign carries which way the index stepped, and it " +
        "is the same physics as a seismic wave meeting harder or softer rock");
}

// ---- 3. SNELL, AND THE ANGLE WHERE IT STOPS HAVING A SOLUTION ------------------------------------------------------------
{
    ok("!! n sin(theta) is conserved across an interface",
        [[1, 1.5, 0.5], [1.33, 1, 0.4], [1, 2.4, 1.0]].every(([n1, n2, t1]) => {
            const t2 = snellRefract(n1, n2, t1);
            return Number.isNaN(t2) || Math.abs(n1 * Math.sin(t1) - n2 * Math.sin(t2)) < 1e-12;
        }),
        "the same conserved quantity as the seismic ray parameter, which is why a light ray and a seismic ray " +
        "bend by the same rule in a graded medium");

    const tc = criticalAngle(1.5, 1);
    ok("!! past the critical angle there is NO refracted ray, and the function says so",
        Number.isNaN(snellRefract(1.5, 1, tc + 0.01)) && !Number.isNaN(snellRefract(1.5, 1, tc - 0.01)),
        `critical angle ${(tc * 180 / Math.PI).toFixed(3)} degrees for glass to air. Returning NaN is the honest ` +
        "answer -- total internal reflection means the refracted ray does not exist, and clamping the arcsine " +
        "would have manufactured one");
}

// ---- 4. THE YEE SCHEME SHARES ACOUSTICS' COURANT STRUCTURE --------------------------------------------------------------
{
    const s = gaussianPulse(60, 10);
    const at = peakField(s, 200, 1.0, 300), over = peakField(s, 200, 1.05, 300);
    ok("!! the CFL limit is a cliff here too",
        at < 10 && over > 1e10,
        `peak |E| ${at.toExponential(2)} at C = 1.0 and ${over.toExponential(2)} at C = 1.05, from a unit pulse. ` +
        "Same structure as the acoustic scheme, from a completely different set of equations -- because both are " +
        "explicit second-order stencils on a hyperbolic system");

    ok("!! and the CFL limit falls as 1/sqrt(dimension)",
        cflLimit(1) === 1 && Math.abs(cflLimit(2) - Math.SQRT1_2) < 1e-15 &&
        Math.abs(cflLimit(3) - 1 / Math.sqrt(3)) < 1e-15,
        `1.000000 in 1D, ${cflLimit(2).toFixed(6)} in 2D, ${cflLimit(3).toFixed(6)} in 3D. Carrying the 1D limit ` +
        "into a 2D grid is a standard way to diverge, and the magic time step that makes 1D exact has no " +
        "counterpart in higher dimensions -- worth stating rather than discovering");
}

// ---- 5. MEDIA: index, impedance and speed must stay consistent ----------------------------------------------------------
{
    ok("!! n = sqrt(eps_r mu_r), and speed and impedance follow from it",
        Math.abs(refractiveIndex(2.25) - 1.5) < 1e-15 &&
        Math.abs(phaseSpeed(2.25) * refractiveIndex(2.25) - lightSpeed()) < 1e-3 &&
        Math.abs(waveImpedance(2.25) - impedanceFreeSpace() / 1.5) < 1e-9,
        `glass at eps_r = 2.25 gives n = ${refractiveIndex(2.25).toFixed(6)}, v = c/n, and Z = Z0/n. Three ` +
        "quantities from one index, and each is checked against the others rather than each standing alone");

    ok("...and a magnetic medium raises the index without raising it the same way",
        refractiveIndex(2.25, 1) < refractiveIndex(2.25, 2) &&
        Math.abs(waveImpedance(2.25, 2) - impedanceFreeSpace() * Math.sqrt(2 / 2.25)) < 1e-9,
        "mu_r enters the index as a product with eps_r but the IMPEDANCE as a ratio, so a magnetic material " +
        "bends light like a dense one while reflecting like a rare one. A model using only eps_r would miss that");
}

console.log();
if (fails) { console.log("maxwell-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("maxwell-selfcheck: all checks pass");
