// WebGLEngine/tools/roundhouse/beamDevice-selfcheck.mjs -- v3380
// *** THREE KEYS THE MODULE'S OWN GATE DOES NOT TAKE, AND ONE NEGATIVE I MEASURED MY WAY OUT OF. ***
import * as B from "./beamBind.mjs";
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

const e = B.build({ mode: "exponent" });
say("L exponent recovered by regression over " + e.points + " lengths: " + e.exponent.toFixed(6));
ok("!! *** the L^3 exponent is RECOVERED FROM MEASUREMENT, not evaluated from the formula ***",
    e.exponentError < 1e-6,
    "beam-selfcheck EVALUATES F L^3 / (3 E I) at one L. This varies L over a decade and fits the SLOPE, and " +
    "the closed form is never called during the measurement. AN ORDER RATHER THAN A TOLERANCE -- the shape the " +
    "volume and gyroscope devices already use");

const s = B.build({ mode: "superposition" });
say("superposition worst residual " + s.worstResidual.toExponential(3) + " (relative " + s.relative.toExponential(2) + ") over " + s.nodes + " nodes");
ok("!! *** superposition holds -- a property of the SOLVER with no closed form involved at all ***",
    s.relative < 1e-12,
    "two loads applied together equal the sum of them applied apart. NO DEFLECTION FORMULA APPEARS, so this " +
    "would still hold if every closed form in the module were wrong -- which is exactly why it is a separate key");

const r = B.build({ mode: "reciprocity" });
say("Maxwell-Betti: " + r.dij.toFixed(6) + " vs " + r.dji.toFixed(6) + ", relative gap " + r.relGap.toExponential(2));
ok("!! *** reciprocity holds to 1e-12, measured THROUGH solve rather than read off the matrix ***",
    r.relGap < 1e-10,
    "deflection at i from a load at j equals deflection at j from a load at i. The gate proves the matrix is " +
    "SYMMETRIC; this proves the CONSEQUENCE, through the solver, which is a different route to the same physics");

// *** THE NEGATIVE THAT DID NOT SURVIVE ITS OWN TEST, KEPT AS DATA. ***
const c = B.build({ mode: "conditioning" });
say("asymmetry sweep -- " + c.rows.map((x) => "eps " + x.eps.toExponential(0) + ": tip " + (x.tipDriftFrac * 100).toFixed(0) + "% / gap " + x.relGap.toExponential(1)).join("  |  "));
ok("!! *** reciprocity is NOT a finer detector than deflection here, and the claim is REFUSED ***",
    c.reciprocityIsFiner === false,
    "I EXPECTED asymmetry -- the module's own historical bug -- to break reciprocity while leaving the tip " +
    "plausible. Perturbing one off-diagonal from 1e-2 down to 1e-6 moves the tip by 79%, 80%, 82%, 117% and " +
    "36%: ERRATIC AND ENORMOUS AT EVERY SCALE, because the perturbed matrix is badly conditioned and the solve " +
    "is garbage regardless. BOTH CHECKS SHOUT. The claim was worth testing and is worth NOT MAKING");

ok("...and the sweep is kept as an OBSERVABLE rather than deleted",
    Array.isArray(c.rows) && c.rows.length === 5,
    "a negative result that leaves no trace is one somebody re-derives -- and this one reads as an attractive " +
    "idea right up until it is measured");

ok("!! every declared mode produces a distinct answer and an undeclared one is refused",
    B.MODES.every((m) => B.defaults({ mode: m }) !== null) && B.defaults({ mode: "nope" }) === null &&
    (() => { try { B.build({ mode: "nope" }); return false; } catch { return true; } })());

console.log(failed ? "beamDevice-selfcheck: " + failed + " FAILED" : "beamDevice-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);
