// WebGLEngine/simulation/ferro-selfcheck.mjs — v2554
//
// Run: node simulation/ferro-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// TWO QUESTIONS, OPPOSITE ANSWERS:
//
//   "if we blast sound at the blobulator that is just vibrations?"   -- yes, essentially, because THE BLOB DOES
//                                                                       NOT CHANGE THE SOUND FIELD.
//   "can we feed it magnetism?"                                      -- yes, and it is NOT vibration, because
//                                                                       THE BLOB CHANGES THE MAGNETIC FIELD.
//
// Rosensweig's own linear stability analysis says it exactly: "Although the applied magnetic field is HOMOGENEOUS
// and therefore NO NET-FORCE is acting on the medium, FLUCTUATIONS OF THE SURFACE LEAD TO FOCUSING EFFECTS
// rendering the local field at the surface inhomogeneous." A flat ferrofluid in a uniform field feels NOTHING. A
// bump focuses the field, pulls harder, grows. That feedback is the whole difference.
//
// The assertion that carries this file: THE GROWTH RATE CROSSES ZERO AT EXACTLY M_c, AND THE MODE THAT CROSSES
// FIRST IS THE CAPILLARY ONE. Both are predictions of the published theory, and the first draft failed both --
// it dropped the permeability factor from the dynamics while keeping it in the threshold, so the two halves
// described different fluids and the surface was still "flat" 50% past its own critical field.
import { criticalMagnetisation, criticalWavenumber, spikeSpacing, growthRate, mostUnstable, nodesOf, standingWaveField, MU0 } from "./ferro.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

const rho = 1236, sigma = 0.025, rc = 1.6, g = 9.81;
const Mc = criticalMagnetisation(rho, sigma, rc, g);

// ---- 1. THE THRESHOLD IS THE THRESHOLD ----------------------------------------------------------------------
// M_c is DEFINED as where the flat surface stops being stable. If the dynamics disagree with the formula, one of
// them is wrong -- and in the first draft it was the dynamics, silently, by 50%.
{
    ok("BELOW M_c the surface is flat", !mostUnstable(Mc * 0.9, rho, sigma, g, 5000, rc).unstable,
       "0.9 M_c -> stable");
    ok("ABOVE M_c it is not", mostUnstable(Mc * 1.1, rho, sigma, g, 5000, rc).unstable, "1.1 M_c -> UNSTABLE");
    const at = mostUnstable(Mc, rho, sigma, g, 5000, rc);
    ok("AND THE CROSSING IS AT EXACTLY M_c (the formula and the dynamics are the same fluid)",
       Math.abs(at.rate) < Math.abs(growthRate(at.k, Mc * 1.05, rho, sigma, g, rc)) * 0.02,
       "rate at M_c = " + at.rate.toExponential(2) + ", vs " + growthRate(at.k, Mc * 1.05, rho, sigma, g, rc).toExponential(2) + " at 1.05 M_c");
}

// ---- 2. THE INSTABILITY PICKS THE CAPILLARY WAVELENGTH -------------------------------------------------------
// This is the theory's real prediction, and the interesting one: the wavelength is NOT put in by hand. It falls
// out of gravity (flat in k) racing tension (k^2) against focusing (k). The middle is where it lives.
{
    const kc = criticalWavenumber(rho, sigma, g);
    const at = mostUnstable(Mc, rho, sigma, g, 5000, rc);
    ok("THE FIRST MODE TO GO UNSTABLE IS THE CAPILLARY ONE", Math.abs(at.k - kc) / kc < 0.02,
       "the dynamics pick k=" + at.k.toFixed(0) + ", the formula says k_c=" + kc.toFixed(0) + " -- predicted, not assumed");
    ok("...which is a spike spacing you could measure with a ruler", spikeSpacing(rho, sigma, g) * 1000 > 3 && spikeSpacing(rho, sigma, g) * 1000 < 20,
       (1000 * spikeSpacing(rho, sigma, g)).toFixed(2) + " mm -- real Rosensweig spikes are millimetres apart");
}

// ---- 3. the numbers are a real fluid's numbers ---------------------------------------------------------------
// A number that cannot be true is worth more than a number you like.
{
    ok("M_c is in the range real ferrofluids live in", Mc / 1000 > 1 && Mc / 1000 < 50,
       (Mc / 1000).toFixed(2) + " kA/m");
    ok("...and B_c is a magnet you could actually hold", MU0 * Mc * 1000 > 1 && MU0 * Mc * 1000 < 100,
       (MU0 * Mc * 1000).toFixed(2) + " mT -- a fridge magnet is ~5, a neodymium is ~500");
}

// ---- 4. THE FEEDBACK: a flat surface feels nothing ------------------------------------------------------------
// THE POINT OF THE WHOLE FILE. The magnetic term is proportional to the bump. No bump, no force -- exactly as
// Rosensweig says a homogeneous field must behave. If this ever failed, the model would be pushing on flat fluid,
// which is the thing the theory explicitly says does not happen.
{
    ok("A FLAT SURFACE FEELS NO FORCE FROM A UNIFORM FIELD (k=0 -> no focusing)",
       growthRate(0, Mc * 10, rho, sigma, g, rc) === -rho * g,
       "at k=0 the magnetic term vanishes and only gravity remains: " + growthRate(0, Mc * 10, rho, sigma, g, rc).toFixed(1) + " = -rho*g = " + (-rho * g).toFixed(1));
    ok("...and the force GROWS with the bump's sharpness (that IS the focusing)",
       growthRate(500, Mc, rho, sigma, g, rc) - growthRate(400, Mc, rho, sigma, g, rc) > 0,
       "a sharper bump focuses harder -- magnetic is linear in k while tension is quadratic, which is why there IS a preferred wavelength");
    ok("...but tension wins eventually (or it would blow up at the sharpest mode available)",
       growthRate(1e5, Mc * 2, rho, sigma, g, rc) < 0, "k=1e5 -> " + growthRate(1e5, Mc * 2, rho, sigma, g, rc).toExponential(1));
}

// ---- 5. SOUND, for contrast: the nodes do not move ------------------------------------------------------------
// This is what "just vibration" means. A standing wave's nodes are stationary, the material migrates there, and
// the blob takes the shape of the PATTERN rather than the wave. One-way: the sand does not change the plate.
{
    const k = 4, nodes = nodesOf(k, 0, 3);
    ok("a standing wave has nodes", nodes.length > 0, nodes.length + " nodes in [0,3] at k=" + k);
    const moved = nodes.map((x) => Math.max(...[0, 0.3, 0.7, 1.1].map((t) => Math.abs(standingWaveField(x, t, k, 7)))));
    ok("AND THE NODES NEVER MOVE, AT ANY TIME (this is why sound sculpts instead of shaking)",
       moved.every((m) => m < 1e-12), "largest excursion at any node, over four times: " + Math.max(...moved).toExponential(1));
    const anti = Math.abs(standingWaveField(0, 0, k, 7));
    ok("...while the antinodes do", anti > 0.9, "antinode amplitude " + anti.toFixed(3));
}

console.log(fails ? "\nferro-selfcheck: " + fails + " FAILED" : "\nferro-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
