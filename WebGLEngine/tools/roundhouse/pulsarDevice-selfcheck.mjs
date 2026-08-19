// WebGLEngine/tools/roundhouse/pulsarDevice-selfcheck.mjs -- v3381
// *** THE MODULE'S OWN GATE HAS NO EXTERNAL KEY AT ALL -- four checks, every one self-consistency. This is the
// first thing that says what the numbers should BE. ***
import * as P from "./pulsarBind.mjs";
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

const r = P.build({ mode: "residualCurvature" });
say("residual curvature " + r.curvature.toExponential(6) + " against -fdot/(2 f0) = " + r.predicted.toExponential(6) +
    "  ratio " + r.ratio.toFixed(6));
ok("!! *** fit the WRONG model and the leftovers give back the spin-down rate ***",
    r.error < 2e-3,
    "a CONSTANT-PERIOD line assumes no spin-down at all, and what it cannot explain is a PARABOLA whose " +
    "curvature IS fdot. THAT IS HOW SPIN-DOWN IS ACTUALLY DISCOVERED, and it INVERTS the model -- the module's " +
    "gate only ever checks the forward direction is self-consistent");

ok("!! ...and fdot comes back from the residuals alone: " + r.recoveredFdot.toExponential(6) + " vs " + r.trueFdot.toExponential(6),
    Math.abs(r.recoveredFdot / r.trueFdot - 1) < 2e-3,
    "recovered from the shape of the leftovers, never read from the inputs");

// *** THE ERROR THE MEASUREMENT CAUGHT, PINNED SO IT CANNOT COME BACK. ***
ok("!! *** the curvature is -fdot/(2 f0) -- ONE f0, and my first derivation had two ***",
    Math.abs(r.predicted - (-P.build({ mode: "residualCurvature" }).trueFdot / (2 * 1.5))) < 1e-18,
    "I predicted -fdot/(2 f0^2) and measured a ratio of 1.501335 against it. THAT RATIO IS f0 = 1.5, NOT A " +
    "TOLERANCE FAILURE. A RATIO THAT COMES BACK AS A CLEAN PARAMETER RATHER THAN A SMALL NUMBER IS AN ALGEBRA " +
    "ERROR ANNOUNCING ITSELF -- the same shape as the CT units sabotage at v3073, where the curve had exactly " +
    "the right form and the wrong scale");

const a = P.build({ mode: "spindownAge" });
say("characteristic age from inputs " + a.characteristicAge.toFixed(0) + " s, from residuals " + a.fromResiduals.toFixed(0) + " s");
ok("!! the characteristic age P/(2 Pdot) agrees between the two routes",
    a.agreement < 2e-3,
    "one route uses the parameters that GENERATED the train; the other uses only what could be MEASURED from " +
    "it. Agreement is the claim; either alone would be a restatement");

const n = P.build({ mode: "linearIsWrong" });
say("residual span: spinning down " + n.spinningDownPeakToPeak.toExponential(3) + " s vs steady " + n.steadyPeakToPeak.toExponential(3) + " s");
ok("!! *** with NO spin-down the residuals are FLAT -- the curvature is not a fitting artefact ***",
    n.steadyPeakToPeak < 1e-9 && n.ratio > 1e8,
    "0.594 s against 1.18e-10 s, nine orders. A quadratic fitted to a straight train finds curvature " +
    "-8.6e-21, which is nothing. THE PARABOLA IS THE PHYSICS AND NOT THE PROCEDURE");

ok("!! every declared mode answers and an undeclared one is refused",
    P.MODES.every((m) => P.defaults({ mode: m }) !== null) && P.defaults({ mode: "nope" }) === null &&
    (() => { try { P.build({ mode: "nope" }); return false; } catch { return true; } })());

console.log(failed ? "pulsarDevice-selfcheck: " + failed + " FAILED" : "pulsarDevice-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);
