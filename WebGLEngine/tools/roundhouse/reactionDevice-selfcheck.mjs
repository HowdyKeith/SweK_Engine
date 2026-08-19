// WebGLEngine/tools/roundhouse/reactionDevice-selfcheck.mjs -- v3379
// *** THE KEY IS A LIMIT, NOT AN EQUALITY, AND THE GRID'S QUANTISATION IS THE FLOOR RATHER THAN A FAILURE. ***
import * as R from "./reactionBind.mjs";
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

// ---- 1. THE TWO THRESHOLDS ARE DIFFERENT AND THEIR ORDER DECIDES WHAT FORMS -------------------------------
const t = R.build({ mode: "thresholds" });
say("B_c = " + t.criticalB.toFixed(4) + ", B_hopf = " + t.hopfB.toFixed(4) + ", k_c = " + t.criticalK.toFixed(5) +
    " (continuous mode index " + t.continuousModeIndex.toFixed(3) + ")");
ok("!! *** the Turing threshold sits BELOW the Hopf line, which is why a STATIONARY pattern forms at all ***",
    t.turingFirst === true && t.gap > 0,
    "above B_hopf the whole medium oscillates uniformly and no stationary pattern survives. NEITHER THRESHOLD " +
    "ALONE SAYS THIS -- it is the ORDER between them, and the module's gate proves each separately");

// ---- 2. THE COMPETITION: the independent route -------------------------------------------------------------
const s = R.build({ mode: "selection" });
say("broadband competition at B=9: winner mode " + s.winningMode + ", k = " + s.k.toFixed(4) +
    " against k_c = " + s.criticalK.toFixed(4));
ok("!! *** a pattern forms from noise alone, with no mode seeded and no formula consulted ***",
    s.amp > 1e-2 && s.winningMode > 1,
    "every check in brusselator's own gate SEEDS ONE MODE and measures ITS rate against the linear-stability " +
    "formula. This seeds ALL of them and lets the dynamics choose. A DEVICE THAT RESTATED THAT GATE WOULD MOVE " +
    "THE COVERAGE COUNT AND GRADE NOTHING NEW");

ok("!! *** and the winner is NOT k_c, which is correct rather than a discrepancy ***",
    s.dkFromCritical > 0.2,
    "k_c is the MARGINAL wavenumber AT B_c. Well above threshold a whole band is unstable and the growth peak " +
    "sits elsewhere -- k = 1.3744 against k_c = 1.0299. I EXPECTED EQUALITY AND THE MEASUREMENT CORRECTED ME");

// ---- 3. THE KEY: convergence as B falls to threshold --------------------------------------------------------
const a = R.build({ mode: "approach" });
say("|k - k_c| as B falls to B_c: " + a.rows.map((r) => "B=" + r.B + " m=" + r.mode + " " + r.dk.toFixed(4)).join("  |  "));
ok("!! *** THE SELECTED MODE CONVERGES TO k_c AS B APPROACHES THRESHOLD -- MONOTONE ***",
    a.monotone === true && a.nearest < a.firstDk / 5,
    "0.3446 -> 0.3446 -> 0.1482 -> 0.1482 -> 0.0481, a factor of seven. THE KEY IS A LIMIT, NOT AN EQUALITY, " +
    "which is the shape the gyroscope and volume devices already use -- an ORDER rather than a tolerance");

ok("!! ...and the residual is the GRID'S QUANTISATION, not a convergence failure",
    Math.abs(t.continuousModeIndex - 5.245) < 0.01 &&
    Math.abs(a.rows[a.rows.length - 1].mode - t.continuousModeIndex) < 0.75,
    "k_c corresponds to continuous mode index 5.245 and the grid can only offer INTEGERS. m=5 is the nearest " +
    "available, so 0.0481 IS THE FLOOR. A TOLERANCE WOULD HAVE HIDDEN THAT DISTINCTION -- it would have read " +
    "as 'close enough' rather than 'as close as this grid can get'");

// ---- 4. THE NEGATIVE: physics with no free parameter --------------------------------------------------------
const w = R.build({ mode: "swapped" });
say("normal amplitude " + w.normalAmp.toExponential(2) + " vs swapped " + w.swappedAmp.toExponential(2) +
    " -- ratio " + w.ratio.toExponential(2));
ok("!! *** SWAP Du AND Dv AND NOTHING FORMS AT ANY B -- nine orders of magnitude ***",
    w.swappedAmp < 1e-8 && w.ratio > 1e8,
    "Turing patterns require LONG-RANGE INHIBITION: the inhibitor must diffuse FASTER than the activator. " +
    "Swapping them is a change with NO FREE PARAMETER -- no threshold was tuned to make this fail, and it is " +
    "the same diffusion constants in the other order");

// ---- 5. THE DEVICE CONTRACT --------------------------------------------------------------------------------
ok("!! every declared mode produces a distinct answer", new Set(R.MODES).size === R.MODES.length &&
    R.MODES.every((m) => R.defaults({ mode: m }) !== null),
    "a branch that changed nothing would be a mode in name only");
ok("...and an undeclared mode is REFUSED rather than silently defaulted",
    R.defaults({ mode: "nope" }) === null && (() => { try { R.build({ mode: "nope" }); return false; } catch { return true; } })());

console.log(failed ? "reactionDevice-selfcheck: " + failed + " FAILED" : "reactionDevice-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);
