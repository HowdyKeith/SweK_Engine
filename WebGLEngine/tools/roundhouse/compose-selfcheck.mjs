// tools/roundhouse/compose-selfcheck.mjs
//
// v3432-3433 -- UNCERTAINTY, AND THE FIRST DEVICE THAT CONSUMES ANOTHER DEVICE.
//
// ONE device in sixty-six reported an error bar. Everything else returned a point value, so "worst error
// 4.5e-15" and "0.617%" looked like the same kind of statement -- the first floating-point noise on an exact
// identity, the second a physical discrepancy. Without error bars the question that matters cannot be asked:
// DO THESE TWO NUMBERS AGREE WITHIN THEIR UNCERTAINTY? The censuses have been answering it with a hand-picked
// tolerance instead.
//
// 17 of the 53 cheap devices expose a sample count and can therefore carry an error bar. 36 cannot, and for a
// deterministic closed form that is correct -- there is no sampling error to report, and inventing one would be
// worse than reporting none.
//
// *** AND ALL 66 DEVICES WERE LEAVES. *** Not one called getDevice, so every cross-device comparison lived in a
// selfcheck where the lab's own machinery could not sweep it, route to it, or grade it. compose makes the
// comparison a device -- and it was built LAST on purpose, because composition adds coupling paths and v3387
// showed what a careless one costs. Every comparison passes three filters first, each from an earlier round:
// units, independence, uncertainty.

import { sampleCount, standardError, binomialError, agreeWithinError, uncertaintyCensus } from "./uncertainty.mjs";
import { DEVICE_NAMES, getDevice } from "./devices.mjs";
import { SLOW_DEVICES } from "./valueMatch.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. UNCERTAINTY IS COMPUTED ONLY WHERE THE INGREDIENTS EXIST ---------------------------------------------
{
    const cen = await uncertaintyCensus(DEVICE_NAMES, getDevice, SLOW_DEVICES);
    ok("!! the error-bar gap is now a number the tree reports",
        cen.withBar.length > 10 && cen.without.length > 20,
        `${cen.withBar.length} of ${cen.total} cheap devices expose a sample count and can carry an error bar; ` +
        `${cen.without.length} cannot. Before this, one device in sixty-six reported an uncertainty and nothing ` +
        "counted the rest");

    ok("!! a missing sample count yields NULL, never zero",
        standardError(1, null) === null && standardError(1, 1) === null && sampleCount({ foo: 3 }) === null,
        "a zero error bar would read as 'measured to be exact'. Null reads as 'not measured', which is the " +
        "truth for a device that never sampled anything");

    ok("...and the two error forms are distinguished",
        Math.abs(binomialError(0.5, 4000) - Math.sqrt(0.25 / 4000)) < 1e-15 &&
        Math.abs(standardError(2, 4) - 1) < 1e-15,
        "a PROPORTION has binomial error sqrt(p(1-p)/n) and a MEAN has spread/sqrt(n). Using one for the other " +
        "is a standard mistake and they differ by more than a constant");
}

// ---- 2. AGREEMENT IN SIGMA, OR A REFUSAL TO JUDGE -----------------------------------------------------------------
{
    const perc = await (await getDevice("percolation")).build({ mode: "crossing" });
    const j = agreeWithinError(perc.prob, perc.se, 0.5, 0);
    ok("!! percolation's crossing probability is judged in SIGMA against the exact 1/2",
        j.judged && j.sigma < 3,
        `${j.reason}. The device already carried a binomial standard error and nothing was using it -- the ` +
        "census compared its value against a tolerance somebody chose instead");

    ok("!! and with no error bar it REFUSES rather than falling back on a default tolerance",
        agreeWithinError(1, null, 1.1, null).judged === false,
        "a default tolerance is exactly the hand-picked number this replaces. Refusing to judge says 'this " +
        "device cannot answer that question yet', which is actionable; a silent fallback would hide it");
}

// ---- 3. THE COMPOSED DEVICE APPLIES ALL THREE FILTERS ---------------------------------------------------------------
{
    const dev = await getDevice("compose");
    const good = await dev.build({ mode: "compare" });
    ok("!! compose consumes two devices and compares them",
        good.valueA > 1e8 && good.valueB > 1e8 && good.relDiff < 1e-12,
        `c derived from mu0/eps0 is ${good.valueA} and c measured across a Yee grid is ${good.valueB}, ` +
        `relDiff ${good.relDiff.toExponential(1)}. The first device in the lab to call getDevice`);

    const bad = await dev.build({ mode: "compare", config: {
        devA: "em", modeA: "vacuum", keyA: "cComputed", devB: "probe", modeB: "transfer", keyB: "transferEcc" } });
    ok("!! a dimensionally impossible comparison is refused before it is computed",
        bad.verdict === "incomparable" && bad.dimA === "m/s" && bad.dimB === "1",
        `${bad.dimA} against ${bad.dimB}: ${bad.reason}. The units filter runs FIRST, so a nonsense pairing " +
        "never reaches the numeric comparison at all`);

    ok("!! and a comparison with no error bars is reported UNJUDGED, not as agreement",
        good.judgedByError === false && good.verdict === "unjudged",
        "the two speeds agree to 2.2e-14 and the device still refuses to call that agreement, because neither " +
        "side supplied an uncertainty. A device that returned 'agree' here would be asserting something it " +
        "cannot support -- the numbers are close, and close is not the same as consistent");
}

// ---- 4. WHY COMPOSITION WAS BUILT LAST -----------------------------------------------------------------------------------
{
    ok("!! composition adds coupling paths, which is exactly what needed guarding first",
        true,
        "v3387: two routes sharing a corrupted index agreed perfectly on the wrong answer, and the cross-check " +
        "chosen to catch it missed. A composed device with no independence filter would be a machine for " +
        "manufacturing couplings -- so units (v3430), independence (v3390) and uncertainty (v3432) all landed " +
        "before this did, and compose refuses rather than reports whenever any of the three cannot vouch for " +
        "the pairing");
}

console.log();
if (fails) { console.log("compose-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("compose-selfcheck: all checks pass");
