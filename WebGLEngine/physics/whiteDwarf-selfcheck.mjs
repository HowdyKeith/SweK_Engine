// physics/whiteDwarf-selfcheck.mjs
//
// Run: node physics/whiteDwarf-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The white dwarf's real, documented physics, checked against published numbers. The Chandrasekhar mass comes out near
// 1.44 solar masses. The mass-radius relation runs backwards -- a heavier white dwarf is smaller -- and the absolute
// radii match the literature (about 8500 km at 0.6 solar masses, 5500 at 1.0). As the mass approaches the Chandrasekhar
// limit the radius collapses toward zero, and at or above it there is no stable star at all: that is the supernova
// threshold, and accreting a sub-limit dwarf past it detonates it (a Type Ia). The sabotage drops the relativistic
// correction that drives the radius to zero -- the exact term that creates the Chandrasekhar limit -- and the collapse
// check fails, because without it there is no maximum mass and no supernova.
import { chandrasekharMass, radiusSolar, radiusKm, isStable, collapses, accreteToLimit } from "./whiteDwarf.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const near = (a, b, e) => Math.abs(a - b) < e;

// ---- 1. CHANDRASEKHAR MASS ~ 1.44 M_sun -------------------------------------------------------------
{
    ok("!! the Chandrasekhar limit comes out near 1.44 solar masses", near(chandrasekharMass(2), 1.44, 0.03),
       "5.826/mu_e^2 with mu_e=2 gives " + chandrasekharMass(2).toFixed(3) + " solar masses -- the maximum mass electron degeneracy pressure can support, from fundamental constants.");
}

// ---- 2. THE MASS-RADIUS RELATION RUNS BACKWARDS -----------------------------------------------------
{
    ok("!! a heavier white dwarf is smaller (R ~ M^-1/3)", radiusKm(0.6) > radiusKm(1.0) && radiusKm(1.0) > radiusKm(1.3),
       "0.6, 1.0 and 1.3 solar-mass dwarfs have decreasing radii -- the counterintuitive but real signature of degenerate matter, where adding mass compresses the star rather than expanding it.");
}

// ---- 3. THE ABSOLUTE RADII MATCH THE LITERATURE -----------------------------------------------------
{
    ok("!! the radii match documented values (~8500 km at 0.6, ~5500 at 1.0)", near(radiusKm(0.6), 8500, 500) && near(radiusKm(1.0), 5500, 400),
       "0.6 solar masses gives " + radiusKm(0.6).toFixed(0) + " km and 1.0 gives " + radiusKm(1.0).toFixed(0) + " km -- an Earth-sized dead star, the real figures, not a sketch.");
}

// ---- 4. THE RADIUS COLLAPSES AT THE LIMIT; above it, no stable star ---------------------------------
{
    const collapsing = radiusSolar(1.45) < 0.1 * radiusSolar(0.6);
    const noStar = Number.isNaN(radiusSolar(chandrasekharMass(2) + 0.1)) && collapses(1.5) && isStable(1.0);
    ok("!! the radius collapses toward zero at the Chandrasekhar limit, and beyond it no stable star exists", collapsing && noStar,
       "approaching the limit the radius falls to nearly nothing, and at or above it the mass-radius relation returns no real value -- there is simply no white dwarf there. That is the supernova threshold.");
}

// ---- 5. ACCRETION PAST THE LIMIT DETONATES (Type Ia) ------------------------------------------------
{
    const run = accreteToLimit(1.2, 0.001);
    const shrank = run.hist[0].R > run.hist[run.hist.length - 1].R;
    ok("!! a sub-limit dwarf accreting past the limit detonates, shrinking as it goes", run.detonated && run.crossedAt >= chandrasekharMass(2) && shrank,
       "starting at 1.2 solar masses and stealing gas, the dwarf shrinks step by step until it crosses " + run.crossedAt.toFixed(3) + " solar masses and detonates -- the real trigger of a Type Ia supernova, a threshold crossed, not an effect played.");
}

// ---- 6. DETERMINISTIC -------------------------------------------------------------------------------
{
    const once = () => accreteToLimit(1.1, 0.002).crossedAt;
    ok("!! deterministic", once() === once(),
       "the same white dwarf accreting the same way crosses the limit at the same mass every run -- pure arithmetic, bit-identical across machines.");
}

console.log(fails ? "\nwhiteDwarf-selfcheck: " + fails + " FAILED" : "\nwhiteDwarf-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
