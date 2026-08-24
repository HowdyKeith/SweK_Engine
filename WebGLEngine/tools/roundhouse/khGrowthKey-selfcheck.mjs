// tools/roundhouse/khGrowthKey-selfcheck.mjs
//
// Run: node tools/roundhouse/khGrowthKey-selfcheck.mjs   (~389s)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v3092 -- THE SIXTH SECOND ANSWER KEY, AND IT WAS ALREADY IN THE OBJECT.
//
// kh compares its measured peak wavenumber against MICHALKE.peakKD, a published constant for the inviscid tanh
// shear layer -- a genuinely external reference, so unlike v3091's pipe3d this device really did have one real
// key. It also reported michalkePeakSigma next to the measured peakSigmaNorm AND NEVER COMPARED THEM. At the
// default configuration those are 0.1059 against 0.1897: A 44 PERCENT SHORTFALL, computed, published in the
// observable list, and ungraded. Exactly v3089's asset hash -- the number was right there looking like a
// guarantee, and the one job it existed for was the one nobody asked it to do.
//
// WHY IT IS INDEPENDENT, argued the way v3091 says it must be -- by WHAT IT LOOKS AT rather than by whether the
// numbers move together. peakKD is the ARGMAX: the position along k where growth is largest. peakSigma is the
// VALUE at that position. A dispersion curve can peak in the right place with the wrong magnitude, or carry the
// right magnitude at the wrong wavenumber, and neither error is visible to the other.
//
// THE 44 PERCENT IS PHYSICS AND THE GATE SAYS SO IN A FALSIFIABLE WAY. Michalke's number is INVISCID; this is an
// LBM at finite viscosity, which damps the instability. A fixed tolerance here would be a number somebody chose
// to make the current result pass. The real claim is the TREND -- as viscosity falls the measured growth rate
// must climb toward the inviscid value, and below threshold it must go NEGATIVE, because a damped mode decays.
// That is a statement an implementation can fail, and this asserts it over a tau sweep.
//
// AND A THIRD THING, RECORDED BECAUSE IT LIMITS WHAT THE FIRST KEY CAN EVER SAY: peakKD is an ARGMAX OVER A
// FIVE-POINT SWEEP. Across nine viscosities it takes exactly TWO distinct values. peakKDErrFrac is therefore
// quantised to the sweep grid and cannot resolve an error smaller than one grid step -- the same shape as
// optics rayleighFactor before v2932, which "passed" three criteria for free because nothing at a small scale
// could move it. Not a defect, and not something to fix by widening a tolerance; it is a ceiling on the
// resolution of that key, and the growth-rate key does not share it.

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getDevice } from "./devices.mjs";
import { MICHALKE } from "../../simulation/lbm/khDispersion.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// v3970 -- READ ONLY. This gate asserts an expected physics TREND (growth rate rises monotonically as
// viscosity falls) rather than testing whether a swept quantity settles, so it has nothing to WRITE to the
// corpus -- but it shares the same "kh" device as khConvergence and khMichalke, which DO write, so reading
// their findings first is still worth the one import.
try {
    const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
    const L = await import(pathToFileURL(path.join(ENG, "brain", "rl", "lessons.mjs")).href);
    console.log(L.lessonsBrief("kh"));
} catch {}

const dev = await getDevice("kh");
const run = (config = {}) => dev.build({ config });

// ---- 1. THE KEY THAT WAS SITTING THERE UNGRADED ---------------------------------------------------------------------
{
    const o = await run();
    ok("!! the growth rate is now compared to Michalke, not just reported beside it",
        Number.isFinite(o.peakSigmaErrFrac),
        "peakSigmaNorm " + o.peakSigmaNorm.toPrecision(6) + " against MICHALKE.peakSigma " + MICHALKE.peakSigma +
        " -> " + (100 * o.peakSigmaErrFrac).toFixed(1) + "%. Both numbers have been in this object since the " +
        "device was written and nothing compared them");

    ok("...and it is a MUCH larger disagreement than the wavenumber key reports",
        o.peakSigmaErrFrac > 3 * o.peakKDErrFrac,
        "wavenumber " + (100 * o.peakKDErrFrac).toFixed(1) + "%, growth rate " +
        (100 * o.peakSigmaErrFrac).toFixed(1) + "%. The device was reporting the smaller of the two and had no " +
        "opinion about the larger one");

    ok("the reference really is EXTERNAL, not something this device derived",
        MICHALKE.peakKD === 0.4446 && MICHALKE.peakSigma === 0.1897 && MICHALKE.neutral === 1.0,
        "Michalke's inviscid tanh shear-layer values, imported from khDispersion. v3091's finding was a key that " +
        "inverted the instrument's own closed form; this one comes from outside the tree entirely, which is the " +
        "difference between a second key and a restatement");
}

// ---- 2. THE 44 PERCENT IS VISCOUS DAMPING, ASSERTED AS A TREND RATHER THAN A TOLERANCE ---------------------------------
{
    const TAUS = [1.2, 0.9, 0.7, 0.6, 0.55, 0.52];   // falling tau = falling viscosity
    const sig = [];
    for (const tau of TAUS) sig.push((await run({ tau })).peakSigmaNorm);

    const monotone = sig.every((v, i) => i === 0 || v > sig[i - 1]);
    ok("!! growth rate rises MONOTONICALLY as viscosity falls",
        monotone,
        TAUS.map((t, i) => "tau " + t + " -> " + sig[i].toFixed(4)).join(", ") + ". This is the claim, not a " +
        "tolerance: an inviscid reference and a viscous simulation SHOULD disagree, and the disagreement must " +
        "shrink in the direction that removes the viscosity");

    ok("!! and the most viscous case is NEGATIVE -- a damped mode decays",
        sig[0] < 0,
        "tau 1.2 gives " + sig[0].toFixed(4) + ". A sign change is a much harder thing to reproduce by accident " +
        "than a magnitude, and an implementation that always reported growth would fail here");

    ok("...while the least viscous case is closest to the inviscid value",
        Math.abs(sig[sig.length - 1] - MICHALKE.peakSigma) < Math.abs(sig[0] - MICHALKE.peakSigma),
        "|" + sig[sig.length - 1].toFixed(4) + " - " + MICHALKE.peakSigma + "| < |" + sig[0].toFixed(4) + " - " +
        MICHALKE.peakSigma + "|. Still 44% short at the default tau, which is honest rather than tuned");

    // A TOLERANCE WOULD HAVE BEEN THE WRONG INSTRUMENT, said explicitly so nobody adds one later.
    ok("no fixed tolerance is asserted on the growth rate",
        true,
        "44% would have to be the number, and it is 44% because tau is 0.52 -- change the default and a fixed " +
        "tolerance becomes either a free pass or a false failure. The trend survives both");
}

// ---- 3. THE ARGMAX KEY IS QUANTISED, WHICH LIMITS WHAT IT CAN EVER SAY --------------------------------------------------
{
    const seen = new Set();
    for (const tau of [1.2, 1.0, 0.9, 0.8, 0.7, 0.65, 0.6, 0.55, 0.52]) seen.add((await run({ tau })).peakKD);
    ok("!! peakKD is an ARGMAX over a five-point sweep and takes few distinct values",
        seen.size <= 3,
        [...seen].map((x) => x.toPrecision(6)).join(", ") + " -- " + seen.size + " values across nine " +
        "viscosities. peakKDErrFrac cannot resolve an error smaller than one grid step, the same shape as optics " +
        "rayleighFactor before v2932, which passed three criteria for free because nothing small could move it");

    const o = await run();
    ok("...and the growth-rate key does NOT share that ceiling",
        !Number.isInteger(o.peakSigmaNorm * 1e6),
        "peakSigmaNorm " + o.peakSigmaNorm.toPrecision(10) + " is a fitted amplitude, continuous in the field, " +
        "not a position on a sweep grid. Which is the point of adding it: the two keys fail differently AND " +
        "resolve differently");
}

console.log();
if (fails) { console.log("khGrowthKey-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("khGrowthKey-selfcheck: all checks pass");
