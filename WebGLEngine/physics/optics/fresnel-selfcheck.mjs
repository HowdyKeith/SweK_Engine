// WebGLEngine/physics/optics/fresnel-selfcheck.mjs -- v2809
//
// Run: node physics/optics/fresnel-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES physics/optics/fresnel.js -- near-field diffraction, the parked extension to the far-field lab.
//
// EVERY ANSWER KEY HERE IS DERIVABLE, NOT RECALLED. The first draft of this gate compared the integrator against
// remembered table values for C(x)/S(x) and two of them were wrong in the 5th decimal -- the CODE was right and
// the "truth" was not. A gate is only as good as its oracle, so the oracles here are things that can be derived
// on the spot: the power series, the fundamental theorem of calculus, odd symmetry, the asymptotic envelope, and
// two exact limits. The one exception is the knife-edge landmark (1.3704 at v=1.2172), which is a textbook
// constant used as a cross-check, not as the primary claim -- the primary claim at the edge is I = 1/4 EXACTLY,
// and that follows from C(0)=S(0)=0.

import { fresnelCS, knifeEdgeIntensity, knifeEdgeProfile, edgeV, slitFresnel, slitFresnelNumeric, slitFresnelAtAngles, fresnelNumber, regime, profileRms } from "./fresnel.js";
import { slitAnalytic } from "./diffraction.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const P = Math.PI / 2;
const Cser = (x) => x - P * P * x ** 5 / 10 + P ** 4 * x ** 9 / 216;
const Sser = (x) => P * x ** 3 / 3 - P ** 3 * x ** 7 / 42 + P ** 5 * x ** 11 / 1320;

// 1. INTEGRATOR vs the POWER SERIES (derivable truth, valid for small x)
{
    let worst = 0;
    for (const x of [0.05, 0.1, 0.2, 0.3, 0.4, 0.5]) {
        const r = fresnelCS(x);
        worst = Math.max(worst, Math.abs(r.C - Cser(x)), Math.abs(r.S - Sser(x)));
    }
    ok("integrator matches the power series where the series is valid", worst < 1e-6, "worst=" + worst.toExponential(2));
}

// 2. FUNDAMENTAL THEOREM: dC/dx = cos(pi x^2/2), dS/dx = sin(pi x^2/2)
{
    let worstC = 0, worstS = 0;
    for (const x of [0.4, 1.1, 1.7, 2.3, 3.1]) {
        const h = 1e-5;
        const dC = (fresnelCS(x + h).C - fresnelCS(x - h).C) / (2 * h);
        const dS = (fresnelCS(x + h).S - fresnelCS(x - h).S) / (2 * h);
        worstC = Math.max(worstC, Math.abs(dC - Math.cos(Math.PI * x * x / 2)));
        worstS = Math.max(worstS, Math.abs(dS - Math.sin(Math.PI * x * x / 2)));
    }
    ok("derivative of C is cos(pi x^2/2) (fundamental theorem)", worstC < 1e-5, "worst=" + worstC.toExponential(2));
    ok("derivative of S is sin(pi x^2/2)", worstS < 1e-5, "worst=" + worstS.toExponential(2));
}

// 3. EXACT VALUES AND SYMMETRY
{
    const z = fresnelCS(0);
    ok("C(0) = S(0) = 0 exactly", z.C === 0 && z.S === 0);
    const a = fresnelCS(1.3), b = fresnelCS(-1.3);
    ok("C and S are ODD functions", Math.abs(a.C + b.C) < 1e-12 && Math.abs(a.S + b.S) < 1e-12);
    // asymptotic: C,S -> 1/2 with a decaying oscillation whose envelope is 1/(pi x)
    let envelopeOK = true, detail = "";
    for (const x of [8, 15, 30]) {
        const r = fresnelCS(x), env = 1 / (Math.PI * x) + 1e-3;
        if (Math.abs(r.C - 0.5) > env || Math.abs(r.S - 0.5) > env) { envelopeOK = false; detail = `x=${x} C=${r.C.toFixed(4)} S=${r.S.toFixed(4)} env=${env.toFixed(4)}`; }
    }
    ok("C,S approach 1/2 inside the 1/(pi x) asymptotic envelope", envelopeOK, detail);
}

// 4. THE KNIFE EDGE -- the exact quarter, and the textbook first fringe
{
    ok("EXACT: intensity at the geometric shadow edge is 1/4 of unobstructed", Math.abs(knifeEdgeIntensity(0) - 0.25) < 1e-12, knifeEdgeIntensity(0).toFixed(12));
    let best = 0, bv = 0;
    for (let v = 0; v < 4; v += 0.0002) { const i = knifeEdgeIntensity(v); if (i > best) { best = i; bv = v; } }
    ok("first fringe maximum ~1.3704 (textbook cross-check)", Math.abs(best - 1.3704) < 0.002, best.toFixed(4));
    ok("...and it sits at v ~ 1.2172", Math.abs(bv - 1.2172) < 0.01, bv.toFixed(4));
    ok("deep shadow tends to zero", knifeEdgeIntensity(-4) < 0.01 && knifeEdgeIntensity(-8) < knifeEdgeIntensity(-4));
    ok("far into the light tends to unobstructed", Math.abs(knifeEdgeIntensity(12) - 1) < 0.05);
    ok("fringes OVERSHOOT unity on the lit side (that is the physics, not an artefact)", best > 1.3);
    ok("edgeV scales as 1/sqrt(lambda z)", Math.abs(edgeV(1, 500e-6, 100) / edgeV(1, 500e-6, 400) - 2) < 1e-9);
}

// 4b. knifeEdgeProfile IS THE POINTWISE PROFILE, NOT A DECORATION AROUND IT
{
    const vs = [0, 1.2172, -8, 12];
    const prof = knifeEdgeProfile(vs);
    ok("knifeEdgeProfile equals knifeEdgeIntensity applied pointwise, in order", vs.every((v, i) => prof[i] === knifeEdgeIntensity(v)),
       "profile(" + vs.join(",") + ") = " + prof.map((x) => x.toFixed(4)).join(","));
    // and the values it produces are the same physical landmarks checked above for the scalar function
    ok("!! ...so it reproduces the exact quarter at the shadow edge and the textbook fringe peak", Math.abs(prof[0] - 0.25) < 1e-12 && Math.abs(prof[1] - 1.3704) < 0.002,
       "profile[0]=" + prof[0] + "  profile[1]=" + prof[1].toFixed(4));
    ok("output length tracks input length", knifeEdgeProfile([1, 2, 3, 4, 5]).length === 5);
}

// 5. TWO INDEPENDENT ROUTES to the near-field slit pattern agree
{
    const a = 0.1, lambda = 500e-6, z = 50;
    const xs = []; for (let i = -40; i <= 40; i++) xs.push(i * 0.005);
    const closed = slitFresnel(a, lambda, z, xs);
    const numeric = slitFresnelNumeric(a, lambda, z, xs, 4000);
    ok("closed-form Fresnel slit == direct numerical integration (shape)", profileRms(closed, numeric) < 0.02, "rms=" + profileRms(closed, numeric).toFixed(4));
}

// 6. THE CROSS-INSTRUMENT CLAIM: near field -> far field as the Fresnel number falls
{
    const a = 0.1, lambda = 500e-6;
    const sinT = []; for (let i = -60; i <= 60; i++) sinT.push(i * 0.00012);
    const far = slitAnalytic(a, lambda, sinT);
    const rmsAt = (z) => profileRms(slitFresnelAtAngles(a, lambda, z, sinT), far);
    const r1 = rmsAt(20), r2 = rmsAt(200), r3 = rmsAt(2000);
    ok("CROSS-INSTRUMENT: at small Fresnel number the near-field module reproduces the FAR-FIELD module", r3 < 0.005, `F=${fresnelNumber(a, lambda, 2000).toFixed(4)} rms=${r3.toFixed(5)}`);
    ok("...and the agreement IMPROVES monotonically as z grows", r1 > r2 && r2 >= r3, `rms: ${r1.toFixed(4)} -> ${r2.toFixed(4)} -> ${r3.toFixed(4)}`);
    // The load-bearing negative: if the two agreed everywhere, the near-field module would be redundant or wrong.
    ok("LOAD-BEARING: they DISAGREE in the near field, where only Fresnel is valid", r1 > 0.01, "rms at F=1 is " + r1.toFixed(4));
}

// 7. regime bookkeeping
{
    const a = 0.1, lambda = 500e-6;
    ok("fresnelNumber = a^2/(lambda z)", Math.abs(fresnelNumber(a, lambda, 2000) - (a * a) / (lambda * 2000)) < 1e-15);
    ok("regime labels: near / transition / far", regime(a, lambda, 1) === "near field (Fresnel)" && regime(a, lambda, 20) === "transition" && regime(a, lambda, 2000) === "far field (Fraunhofer)");
}

// 8. browser-safe
{
    const src = (await import("node:fs")).readFileSync(new URL("./fresnel.js", import.meta.url), "utf8");
    ok("fresnel.js imports nothing and uses no DOM", !/^\s*import\s/m.test(src) && !/\bwindow\.|\bdocument\./.test(src));
}

console.log("fresnel-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
