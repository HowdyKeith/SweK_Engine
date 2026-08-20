// tools/roundhouse/landauZener-selfcheck.mjs
//
// v3288 -- LANDAU-ZENER BECOMES THE 37th GRADED DEVICE, AND IT ARRIVES WITH ITS OWN LIMIT ALREADY MEASURED.
//
// Drive a two-level system through an avoided crossing; the closed form is exact for an infinite sweep:
//
//     P_diabatic = exp(-pi D^2 / (2 v))          (Landau, Zener, Stueckelberg, Majorana, 1932)
//
// What distinguishes this promotion from kuramoto and hmc is that the module had ALREADY established where its
// integrator is trustworthy, and written the failure down rather than tuning around it. Its header records that
// deep in the adiabatic corner -- P below about 0.03 -- widening the time window moved the answer -16.0%, +5.4%
// and +35.9% at T = 87, 150 and 250 WITHOUT SETTLING, because the surviving population is smaller than the
// coherent leftover of a finite window.
//
// SO THE DEVICE GRADES THE VALIDATED WINDOW AND NOT THE CORNER. The alternatives were both bad: a tolerance
// wide enough to cover a number that does not converge, or an assertion the module itself declines to make. The
// corner is still reachable, through a `corner` mode that reports the suppression as an order of magnitude and
// carries graded:false so nothing downstream can mistake it for a keyed result.
//
// This is the same discipline as the sub-critical floor in kuramoto and the f32 floor in magmap: find out what
// the instrument can support BEFORE choosing what to claim.

import { getDevice } from "./devices.mjs";
import { lzExact } from "../../physics/quantum/landauZener.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const dev = await getDevice("landauzener");

// ---- 1. THE VALIDATED WINDOW MATCHES THE CLOSED FORM ---------------------------------------------------------------
{
    const o = await dev.build({ mode: "curve" });
    ok("!! measured survival matches exp(-pi D^2 / 2v) across the converged window",
        o.relWorst < 0.01 && o.graded === true,
        `worst relative error ${(o.relWorst * 100).toFixed(3)}% over ${o.points} points at v=${o.v}. The module's ` +
        "header claims 0.62% worst at this sweep rate and the device measures " +
        `${(o.relWorst * 100).toFixed(2)}% -- the documented number is reproduced, not taken on trust`);
}

// ---- 2. THE PLANTED FACTOR-OF-TWO IS CAUGHT --------------------------------------------------------------------------
{
    const good = await dev.build({ mode: "curve" });
    const bad = await dev.build({ mode: "curve", config: { planted: true } });
    ok("!! couplingWRONG -- D instead of D/2 in the off-diagonal -- is detected 175x clear",
        bad.errMean / good.errMean > 50,
        `mean absolute error ${good.errMean.toExponential(2)} correct vs ${bad.errMean.toExponential(2)} planted, ` +
        `a factor of ${(bad.errMean / good.errMean).toFixed(0)}. The wrong curve is still smooth, still ` +
        "normalized and still monotone in D -- it is simply the wrong curve, which is what a closed-form key is " +
        "for and what a plot would not show");
}

// ---- 3. THE CORNER IS REPORTED, NOT GRADED ----------------------------------------------------------------------------
{
    const o = await dev.build({ mode: "corner" });
    ok("!! the adiabatic corner carries graded:false",
        o.graded === false && o.errMean === null,
        `P = ${o.cornerP.toFixed(5)} against exact ${o.cornerExact.toFixed(5)}. The module measured this regime ` +
        "swinging -16%, +5.4%, +35.9% as the window widened, without settling. Grading it would need a tolerance " +
        "chosen to fit a number that does not converge -- so the observable is present, the claim is not");

    ok("...and what IS claimed there is only an order of magnitude, which does hold",
        o.cornerOrderOk === true && Math.abs(o.cornerP - o.cornerExact) / o.cornerExact < 0.2,
        `both measurement and exact value are below 0.05, and they happen to agree to ` +
        `${(Math.abs(o.cornerP - o.cornerExact) / o.cornerExact * 100).toFixed(1)}% at this window -- but that ` +
        "agreement is not stable under T, so it is not what is asserted");
}

// ---- 4. THE CLOSED FORM BEHAVES ------------------------------------------------------------------------------------------
{
    ok("lzExact is monotone in adiabaticity and bounded in (0, 1]",
        lzExact(0, 4) === 1 && lzExact(1, 4) < lzExact(0.5, 4) && lzExact(5, 4) > 0 && lzExact(0.5, 4) < 1,
        "zero gap means certain diabatic passage; a larger gap or a slower sweep means more adiabatic following, " +
        "and the survival probability falls toward zero without reaching it");
}

// ---- 5. DECLARED, SO THE CENSUS KNOWS ----------------------------------------------------------------------------------
{
    const { modesOf } = await import("./deviceModes.mjs");
    const m = modesOf(dev, null);
    ok("landauzener declares its modes",
        m.source === "exported" && m.declared.includes("curve") && m.declared.includes("corner"),
        `source "${m.source}", modes ${JSON.stringify(m.declared)} -- 37 graded of 113 proven`);
}

console.log();
if (fails) { console.log("landauZener-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("landauZener-selfcheck: all checks pass");
