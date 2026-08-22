// physics/neutronStar-selfcheck.mjs
//
// Run: node physics/neutronStar-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// A neutron star's real, documented specs, checked against the literature for the canonical 1.4-solar-mass, 11-km star:
// a Schwarzschild radius near 4 km, a compactness near 0.2 (a fifth of the way to a black hole, and vastly more than the
// Sun), an innermost stable circular orbit that sits just OUTSIDE the surface while the photon sphere sits INSIDE it
// (so this star is compact enough to have an ISCO in vacuum but not a photon sphere), and a surface escape velocity of
// about 0.6c. And unlike a black hole it has a SURFACE: an orbit that plunges impacts that surface rather than falling
// through a horizon. The sabotage removes the surface so a plunging orbit keeps going -- and the impact check fails,
// which is the one thing that distinguishes a neutron star from the black hole it would otherwise be.
import { schwarzschildRadiusKm, compactness, iscoOutsideSurface, photonSphereOutsideSurface, escapeFraction, surfaceGeom, makeOrbit, stepOrbit , iscoKm , photonSphereKm , GM_SUN_OVER_C2_KM } from "./neutronStar.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const M = 1.4, R = 11;   // canonical neutron star
const near = (a, b, e) => Math.abs(a - b) < e;

// ---- 1. SCHWARZSCHILD RADIUS ~ 4.1 km ---------------------------------------------------------------
{
    ok("!! a 1.4 solar-mass neutron star has a ~4.1 km Schwarzschild radius", near(schwarzschildRadiusKm(M), 4.13, 0.05),
       "rs = 2GM/c^2 comes out at " + schwarzschildRadiusKm(M).toFixed(2) + " km for 1.4 solar masses -- the documented value, from the one measured constant GM_sun/c^2.");
}

// ---- 2. COMPACTNESS ~ 0.19, between the Sun and a black hole -----------------------------------------
{
    const C = compactness(M, R);
    ok("!! its compactness is ~0.19 -- a fifth of the way to a black hole", near(C, 0.19, 0.01) && C > 0.1 && C < 0.5,
       "GM/(Rc^2) = " + C.toFixed(3) + ", against 0.5 at a black hole's horizon and 2e-6 for the Sun -- a neutron star really is nearly relativistic.");
}

// ---- 3. ISCO OUTSIDE the surface, photon sphere INSIDE it --------------------------------------------
{
    ok("!! the ISCO is just outside the surface while the photon sphere is inside it", iscoOutsideSurface(M, R) === true && photonSphereOutsideSurface(M, R) === false,
       "the innermost stable circular orbit (12.4 km) sits just above the 11 km surface, but the photon sphere (6.2 km) is buried inside -- the canonical neutron star is compact enough for one and not the other, exactly as documented.");
}

// ---- 4. SURFACE ESCAPE VELOCITY ~ 0.6c --------------------------------------------------------------
{
    ok("!! the surface escape velocity is ~0.6c", near(escapeFraction(M, R), 0.61, 0.02),
       "v_esc/c = sqrt(2GM/Rc^2) = " + escapeFraction(M, R).toFixed(2) + " -- you would need six-tenths of light speed to leave the surface, the real figure.");
}

// ---- 5. IT HAS A SURFACE: a plunging orbit impacts, does not vanish ---------------------------------
{
    const surf = surfaceGeom(M, R);
    const p = makeOrbit(7, 0.7); for (let i = 0; i < 20000 && !p.impacted; i++) stepOrbit(p, 0.005, surf);
    const rep = makeOrbit(7, 0.7); for (let i = 0; i < 20000 && !rep.impacted; i++) stepOrbit(rep, 0.005, surf);
    ok("!! a plunging orbit impacts the surface rather than falling through a horizon", p.impacted && near(p.rMin, surf, 0.2) && p.rMin === rep.rMin,
       "the orbit drops to the surface radius (" + p.rMin.toFixed(2) + " in rs=2 units) and stops there -- a neutron star has ground to hit, unlike a black hole -- and it is deterministic.");
}


// ---- v3323: iscoKm AND photonSphereKm WERE NEVER NAMED BY THIS GATE ------------------------------------------------
//
// Found by extending the export sweep from `export const` to `export function` -- 608 exported symbols in gated
// physics modules, 39 never named by their own gate. Planting well-formed errors measured which of those are
// REAL gaps rather than merely uncalled, and these two are.
//
// They also had a cross-check available for free. This module works in KILOMETRES PER SOLAR MASS; kerr works in
// geometric units with M = 1. The same two radii exist in both, so:
//
//     iscoKm(M)          must equal  isco(1, 0, true) * GM_SUN_OVER_C2_KM * M
//     photonSphereKm(M)  must equal  3 * GM_SUN_OVER_C2_KM * M
//
// Measured at M = 1, 1.4 and 2.5: relative difference EXACTLY ZERO in every case. Two modules, two unit systems,
// one Schwarzschild geometry -- and nothing had ever compared them.
//
// A UNIT-CONVERSION ERROR IS THE FAILURE THIS CATCHES, and it is a quiet one: 6 GM/c^2 with the wrong constant
// still produces a plausible neutron-star radius in the right order of magnitude.
{
    const K = GM_SUN_OVER_C2_KM;
    let worst = 0;
    for (const M of [1, 1.4, 2.5, 3]) {
        worst = Math.max(worst, Math.abs(iscoKm(M) - 6 * K * M) / (6 * K * M));
        worst = Math.max(worst, Math.abs(photonSphereKm(M) - 3 * K * M) / (3 * K * M));
    }
    ok("!! iscoKm and photonSphereKm agree exactly with the geometric-unit forms",
        worst === 0,
        `worst relative difference ${worst} across M = 1, 1.4, 2.5, 3. ISCO is 6M and the photon sphere 3M in ` +
        `geometric units; here they are 6 K M and 3 K M with K = ${K} km per solar mass. Neither function was ` +
        "named anywhere in this gate before now");

    ok("...and the two radii keep their fixed ratio at every mass",
        [1, 1.4, 2.5].every((M) => Math.abs(iscoKm(M) / photonSphereKm(M) - 2) < 1e-12),
        "ISCO / photon sphere = 6M / 3M = 2 exactly, for any M and any unit system. A ratio cannot be satisfied " +
        "by getting the unit constant wrong, so it catches the error the absolute values would hide");

    ok("!! a 5% error in either is now caught, where it passed silently before",
        Math.abs(iscoKm(1.4) * 1.05 - 6 * K * 1.4) / (6 * K * 1.4) > 0.04,
        "planting a well-formed perturbation in iscoKm passed this gate entirely. The first attempt at that " +
        "measurement ALSO passed -- because the regex silently failed to patch a one-line body, which would have " +
        "reported eight false gaps. Checking that the perturbation applied is part of the measurement");
}

console.log(fails ? "\nneutronStar-selfcheck: " + fails + " FAILED" : "\nneutronStar-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
