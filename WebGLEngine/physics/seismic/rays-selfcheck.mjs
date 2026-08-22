// physics/seismic/rays-selfcheck.mjs
//
// v3384 -- SEISMOLOGY ENTERS THE LAB.
//
// Four keys from four directions, none derived from the others:
//
//   Vp/Vs = sqrt(3)   for a Poisson solid. The moduli and the density CANCEL, so a pure number falls out of two
//                     material properties, and it inverts exactly back to nu = 1/4.
//   Vs = 0 in a fluid IDENTICALLY, not as a limit -- a fluid has no shear modulus, so S waves do not exist
//                     there. This is the Earth's S-wave shadow zone, and how the liquid outer core was found.
//   CIRCULAR RAYS     in a linear velocity gradient a ray is EXACTLY a circular arc. Three routes to the same
//                     distance agree to 9.5e-13: an angle integration, a closed form, and the arc geometry.
//   ENERGY BALANCE    R^2 + (Z1/Z2) T^2 = 1 at an interface. An identity, so it holds to the last bit.
//
// *** AND ONE RESULT IS ABOUT NUMERICS RATHER THAN PHYSICS, WHICH IS WHY IT IS HERE. *** Integrating the ray in
// DEPTH gives dx/dz = pv/sqrt(1 - p^2 v^2), which DIVERGES at the turning point where pv -> 1. A midpoint rule
// in z returns 10.389735 against a true 10.392305 -- four digits lost, precisely where the ray matters most.
// Parametrising by the incidence angle instead gives dx = sin(i)/(pk) di with no singularity anywhere, and the
// agreement improves from 2.5e-4 to 9.5e-13. Same physics, same ray; the entire difference is the choice of
// integration variable.

import {
    vP, vS, vpvsFromPoisson, poissonFromVpVs, impedance, reflectionCoef, transmissionCoef, energyBalance,
    rayParameter, turningDepth, arcRadius, arcCentreDepth,
    turningDistance, turningDistanceIntegrated, turningDistanceFromArc, raySamples,
} from "./rays.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. THE SPEED RATIO IS A PURE NUMBER -------------------------------------------------------------------------
{
    ok("!! a Poisson solid has Vp/Vs = sqrt(3) exactly",
        Math.abs(vpvsFromPoisson(0.25) - Math.sqrt(3)) < 1e-15,
        `${vpvsFromPoisson(0.25).toFixed(12)} against ${Math.sqrt(3).toFixed(12)}. The moduli and density cancel ` +
        "out of the ratio entirely, so this is a statement about nu alone -- two rocks of completely different " +
        "stiffness and density share it if they share a Poisson ratio");

    ok("...and the ratio inverts back to Poisson's ratio",
        [0.1, 0.25, 0.33, 0.45].every((nu) => Math.abs(poissonFromVpVs(vpvsFromPoisson(nu)) - nu) < 1e-12),
        "two functions, one relation, so they must round-trip. This catches a sign or a factor that the sqrt(3) " +
        "check alone would not, because sqrt(3) is a single point and this is the whole curve");

    ok("!! Vp and Vs computed from moduli agree with the ratio computed from nu",
        (() => {
            const K = 5.2e10, mu = 3.1e10, rho = 2700;
            const nu = (3 * K - 2 * mu) / (2 * (3 * K + mu));
            return Math.abs(vP(K, mu, rho) / vS(mu, rho) - vpvsFromPoisson(nu)) < 1e-12;
        })(),
        "one route goes through the physical speeds -- sqrt((K + 4mu/3)/rho) over sqrt(mu/rho) -- and the other " +
        "through Poisson's ratio. They share no line and must land on the same number");
}

// ---- 2. NO SHEAR IN A FLUID, AND THAT IS THE SHADOW ZONE -----------------------------------------------------------
{
    ok("!! a fluid carries P waves and NO S waves, identically",
        vS(0, 2500) === 0 && vP(2.2e9, 0, 2500) > 0,
        `Vs is exactly ${vS(0, 2500)} and Vp is ${vP(2.2e9, 0, 2500).toFixed(1)} m/s for water. Not a small ` +
        "number -- zero. A fluid has no shear modulus, so the S wave has nothing to restore it. This is why the " +
        "Earth has an S-wave shadow beyond about 103 degrees, and how the liquid outer core was discovered");

    ok("...and Vs rises from zero with the shear modulus, so the limit is approached and not just asserted",
        [0, 1e6, 1e8, 1e10].every((mu, i, a) => i === 0 || vS(mu, 2500) > vS(a[i - 1], 2500)),
        "a solid with vanishing rigidity behaves like a fluid continuously, which is what makes the zero a " +
        "physical statement rather than a special case in the code");
}

// ---- 3. RAYS ARE CIRCLES -- THREE ROUTES -------------------------------------------------------------------------------
{
    const cases = [[1 / 6, 3, 0.5], [1 / 8, 2.5, 0.4], [1 / 5, 3.5, 0.6]];
    const worst = Math.max(...cases.map(([p, v0, k]) => {
        const a = turningDistance(p, v0, k), b = turningDistanceIntegrated(p, v0, k), c = turningDistanceFromArc(p, v0, k);
        return Math.max(Math.abs(a - b), Math.abs(a - c));
    }));
    ok("!! closed form, angle integration and circular-arc geometry all agree",
        worst < 1e-9,
        `worst difference ${worst.toExponential(2)} across three gradients. cos(i0)/(pk) is algebra, the ` +
        "integration steps the ray, and the arc is pure geometry -- three descriptions of one path");

    const [p, v0, k] = cases[0];
    ok("!! the turning depth is where the local velocity reaches 1/p, and the ray goes no deeper",
        Math.abs((v0 + k * turningDepth(p, v0, k)) - 1 / p) < 1e-12 &&
        raySamples(p, v0, k, turningDepth(p, v0, k) - 0.1) && !raySamples(p, v0, k, turningDepth(p, v0, k) + 0.1),
        `turning depth ${turningDepth(p, v0, k).toFixed(4)}, where v = ${1 / p}. A ray samples everything above ` +
        "its turning depth and nothing below -- which is why a velocity structure is read from many rays at " +
        "different take-off angles rather than one");

    ok("!! and the arc centre sits where the velocity would extrapolate to ZERO",
        Math.abs(v0 + k * arcCentreDepth(v0, k)) < 1e-12 && arcRadius(p, k) === 1 / (p * k),
        `centre at z = ${arcCentreDepth(v0, k)}, radius ${arcRadius(p, k)}. The centre is generally ABOVE the ` +
        "surface at a depth where no rock exists -- the circle is a property of the gradient, not of the medium " +
        "reaching there");
}

// ---- 4. THE VARIABLE MATTERS MORE THAN THE METHOD ------------------------------------------------------------------------
{
    // integrate in DEPTH, the natural-looking choice, and watch it lose four digits at the turning point
    const p = 1 / 6, v0 = 3, k = 0.5;
    const zt = turningDepth(p, v0, k);
    let x = 0; const n = 2000000, h = (zt - 1e-9) / n;
    for (let i = 0; i < n; i++) { const v = v0 + k * (i + 0.5) * h, s = p * v; x += p * v / Math.sqrt(1 - s * s) * h; }
    const exact = turningDistance(p, v0, k);
    const angleErr = Math.abs(turningDistanceIntegrated(p, v0, k) - exact) / exact;
    const depthErr = Math.abs(x - exact) / exact;
    ok("!! integrating in DEPTH loses four digits; integrating in ANGLE loses none",
        depthErr > 1e-5 && angleErr < 1e-11,
        `depth parametrisation ${depthErr.toExponential(1)}, angle parametrisation ${angleErr.toExponential(1)} ` +
        "-- a factor of a billion, on the same ray with the same step count. dx/dz diverges at the turning point " +
        "where pv -> 1; dx/di does not. This is a numerics result, not a physics one, and it is recorded because " +
        "the wrong choice is the natural-looking one");
}

// ---- 5. ENERGY BALANCES AT AN INTERFACE, EXACTLY -----------------------------------------------------------------------
{
    const pairs = [[2500 * 3000, 3300 * 5000], [1000 * 1500, 2700 * 6000], [3300 * 5000, 2500 * 3000]];
    ok("!! R^2 + (Z1/Z2) T^2 = 1 at every impedance contrast",
        pairs.every(([Z1, Z2]) => Math.abs(energyBalance(Z1, Z2) - 1) < 1e-15),
        `residuals ${pairs.map(([a, b]) => Math.abs(energyBalance(a, b) - 1).toExponential(0)).join(", ")}. This ` +
        "is an identity in Z1 and Z2, so it holds to the last bit rather than to a tolerance -- including the " +
        "reversed pair, where the wave goes from fast rock into slow");

    ok("...and the reflection flips sign when the wave meets a SLOWER medium",
        reflectionCoef(3300 * 5000, 2500 * 3000) < 0 && reflectionCoef(2500 * 3000, 3300 * 5000) > 0,
        "a hard interface reflects in phase and a soft one inverts. The sign carries real information about " +
        "which way the impedance stepped, and a magnitude-only check would discard it");
}

console.log();
if (fails) { console.log("rays-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("rays-selfcheck: all checks pass");
