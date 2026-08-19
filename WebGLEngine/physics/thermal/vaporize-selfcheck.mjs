// WebGLEngine/physics/thermal/vaporize-selfcheck.mjs -- v3620
//
// Run: node physics/thermal/vaporize-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES physics/thermal/vaporize.mjs. THE CHECK THIS FILE EXISTS FOR is section 4: r goes to EXACTLY 1 at the
// critical point, so the three representation schemes COINCIDE there. Without it, "a voxel grid cannot draw a
// gas" is a complaint about voxels; with it, the complaint is quantified and bounded -- the trap is distance
// from critical, and it disappears on the same grid with the same code.
//
// Everything here is arithmetic over external reference tables, so it is instant. THAT IS THE POINT rather than
// a convenience: nothing in this round is simulated, so nothing in this round can be graded against itself.
import {
    R_GAS, WATER, VAPOUR_PRESSURE, SATURATION, satPressure, keyAccuracy, expansionRatio, densityRatio,
    representationChoices, voxelCost, MEASURED_V3620, reportLines,
} from "./vaporize.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. THE KEY IS EXTERNAL, AND ITS ACCURACY SHIPS WITH IT ---------------------------------------------------------
{
    const acc = keyAccuracy();
    const anchor = acc.find((a) => a.T === WATER.Tboil);
    ok("!! the key is EXACT at its anchor", anchor.rel < 1e-12,
       "CC " + anchor.cc.toExponential(6) + " against a known " + anchor.known.toExponential(6) +
       " -- it must be, the anchor is where P0 was set, which is why the anchor ALONE proves nothing");
    const away = acc.filter((a) => a.T !== WATER.Tboil);
    ok("!! ...and it agrees with anchors it was NOT fitted to", away.every((a) => a.rel < 0.40),
       away.map((a) => a.T.toFixed(0) + "K " + (100 * a.rel).toFixed(1) + "%").join(", ") +
       " -- these are the readings that make it a key rather than a restatement");
    // THE SHAPE IS THE EVIDENCE, not the size: a constant-L approximation must be worst furthest from its anchor.
    const below = acc.filter((a) => a.T < WATER.Tboil), above = acc.filter((a) => a.T > WATER.Tboil);
    ok("!! the error is smallest at the anchor and grows BOTH WAYS", 
       below.every((a) => a.rel > anchor.rel) && above.every((a) => a.rel > anchor.rel) &&
       below[0].rel > below[below.length - 1].rel,
       "36.7% at 273K falling to 8.0% at 323K, then 0.0% at the anchor, then 0.1% and 4.0% above -- L is a " +
       "function of temperature and this key pretends it is not, so THIS IS THE SHAPE IT MUST HAVE");
    const pc = satPressure(WATER.Tcrit), relC = Math.abs(pc - WATER.Pcrit) / WATER.Pcrit;
    ok("!! ...and the key's OWN LIMIT is measured rather than left for somebody to find", relC > 0.1 && relC < 0.3,
       "at the critical point " + pc.toExponential(3) + " against " + WATER.Pcrit.toExponential(3) + " -- " +
       (100 * relC).toFixed(1) + "% out. A KEY WHOSE ACCURACY IS NOT REPORTED ALONGSIDE IT IS ONE SOMEBODY " +
       "WILL QUOTE OUTSIDE ITS RANGE.");
}

// ---- 2. THE RATIO IS A FUNCTION AND NOT A NUMBER ---------------------------------------------------------------------
{
    const evap = expansionRatio({ T: 293.15, P: 2339, rhoLiquid: 998 });
    const boil = expansionRatio({ T: 373.15, P: 101325, rhoLiquid: 958 });
    const bar100 = expansionRatio({ T: 584, P: 1e7, rhoLiquid: 712 });
    ok("!! THE EXPANSION RATIO SPANS THREE ORDERS ACROSS ORDINARY CONDITIONS", evap / bar100 > 1000,
       "evaporating at 20 C " + evap.toFixed(0) + ", boiling at 1 atm " + boil.toFixed(0) + ", 100 bar " +
       bar100.toFixed(1) + " -- a span of " + (evap / bar100).toExponential(2) + "x. SO 'GAS TAKES ABOUT A " +
       "THOUSAND TIMES MORE ROOM' IS NOT A FACT A GRID COULD BE BUILT AROUND: there is no constant to bake in.");
    ok("...and it falls with pressure, which is the direction the gas law demands", evap > boil && boil > bar100,
       "asserted as an ORDERING, so it cannot pass on three numbers that merely differ");
}

// ---- 3. THE TRILEMMA: ONE NUMBER DECIDES EVERY PENALTY ------------------------------------------------------------------
{
    const r = densityRatio(SATURATION[0]);
    const c = representationChoices(r);
    ok("!! each scheme is wrong in EXACTLY ONE quantity", 
       c.inPlaceAsGas.massFactor !== 1 && c.inPlaceAsGas.volumeFactor === 1 &&
       c.expanded.massFactor === 1 && c.expanded.voxels !== 1 &&
       c.inPlaceDense.massFactor === 1 && c.inPlaceDense.volumeFactor !== 1,
       "in place as gas loses MASS, expanded costs a VOXEL BUDGET, in place at liquid density gets the DENSITY " +
       "wrong. MASS, VOLUME, DENSITY -- PICK TWO.");
    ok("!! ...and ALL THREE PENALTIES ARE THE SAME NUMBER", c.penalties.every((p) => p === r),
       "r = " + r.toFixed(3) + " decides every one, SO THERE IS NOTHING TO TRADE AND NO CLEVERER SCHEME. A " +
       "round reporting three separate costs would be reporting one number three times.");
    const cost = voxelCost(r);
    ok("the voxel cost is stated as a block a reader can picture", Math.abs(cost.side ** 3 - r) / r < 1e-12,
       Math.round(r) + " voxels = a " + cost.side.toFixed(2) + "^3 block for ONE liquid voxel at 1 atm");
}

// ---- 4. THE CONTROL, AND IT IS WHAT THIS FILE EXISTS FOR ------------------------------------------------------------------
{
    const crit = SATURATION[SATURATION.length - 1];
    ok("!! AT THE CRITICAL POINT THE TWO PHASES HAVE THE SAME DENSITY", crit.liq === crit.vap,
       "rho_liq = rho_vap = " + crit.liq + " kg/m3 at " + crit.T + " K, which is what a critical point IS");
    const rC = densityRatio(crit), cC = representationChoices(rC);
    ok("!! ...so r IS EXACTLY 1 AND ALL THREE SCHEMES COINCIDE", 
       rC === 1 && cC.inPlaceAsGas.massFactor === 1 && cC.inPlaceDense.volumeFactor === 1 && cC.expanded.voxels === 1,
       "r = " + rC.toFixed(6) + " -- IN-PLACE GASIFICATION IS EXACT THERE, same grid, same voxel, same code. SO " +
       "THE TRAP IS NOT A PROPERTY OF VOXELS: it is how far the state sits from critical, and a fixed grid " +
       "represents this phase change perfectly in the regime where the two phases stop being different.");
    // AND IT MUST APPROACH 1 RATHER THAN JUMP TO IT, or the last row is a special case somebody typed.
    const rs = SATURATION.map(densityRatio);
    let monotone = true;
    for (let i = 1; i < rs.length; i++) if (rs[i] >= rs[i - 1]) monotone = false;
    ok("!! ...and it APPROACHES 1 monotonically rather than jumping there", monotone && rs[rs.length - 2] > 1,
       rs.map((x) => x.toFixed(1)).join(" -> ") + " -- the row before critical still reads " +
       rs[rs.length - 2].toFixed(3) + ", so the exact 1 is the END OF A TREND and not a typed special case");
    ok("...and the far end is genuinely severe, so the trend has somewhere to come from", rs[0] > 1000,
       "r = " + rs[0].toFixed(1) + " at 1 atm");
}

// ---- 5. TWO INDEPENDENT ROUTES TO r, AND THEY MUST NOT BE THE SAME ROUTE TWICE --------------------------------------------
{
    // The ideal-gas ratio and the measured-density ratio share NO inputs beyond the temperature.
    const measured = densityRatio(SATURATION[0]);
    const ideal = expansionRatio({ T: 373.15, P: 101325, rhoLiquid: 958 });
    ok("!! the ideal-gas route and the saturated-density route AGREE without sharing a formula",
       Math.abs(ideal - measured) / measured < 0.03,
       "ideal " + ideal.toFixed(1) + " against measured " + measured.toFixed(1) + " -- " +
       (100 * Math.abs(ideal - measured) / measured).toFixed(1) + "%. One divides RT/P by a molar volume, the " +
       "other divides two tabulated densities; NEITHER IS A RESTATEMENT OF THE OTHER, so the agreement is evidence.");
    ok("...and they DIVERGE near critical, where the ideal gas law has no business being", 
       (() => { const row = SATURATION[SATURATION.length - 2];
                const id = expansionRatio({ T: row.T, P: 21.04e6, rhoLiquid: row.liq });
                return Math.abs(id - densityRatio(row)) / densityRatio(row) > 0.2; })(),
       "so the agreement above is a reading about the REGIME rather than a tautology that holds everywhere");
}

// ---- 6. WHAT IS REFUSED --------------------------------------------------------------------------------------------------
//
// ANTIDOTE: if a later round builds a gas SOLVER, section 6 goes red and must be rewritten to assert that the
// solver is graded against its own key -- do NOT delete the refusal and do NOT let the solver borrow this file's
// credibility, which is exactly what v3618 refused for combustion.
{
    ok("no gas dynamics are claimed", (MEASURED_V3620.refused || "").includes("NO GAS DYNAMICS"),
       "advection, buoyancy, diffusion and pressure coupling each need their own key and this round has none");
    ok("no scheme is recommended", (MEASURED_V3620.notClaimed || "").includes("choice is Keith's"),
       "the numbers are on the record; picking one is a design call");
    const rep = reportLines();
    ok("the report renders and names the control", rep.length > 20 && rep.join("\n").includes("EXACTLY 1"),
       rep.length + " lines");
}

console.log(fails ? "\nvaporize-selfcheck: " + fails + " FAILED" : "\nvaporize-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
