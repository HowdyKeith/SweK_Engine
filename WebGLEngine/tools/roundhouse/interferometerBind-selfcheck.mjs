// tools/roundhouse/interferometerBind-selfcheck.mjs -- v3758
//
// *** THIS DEVICE HAD NO GATE OF ITS OWN AND ITS HEADLINE OBSERVABLES ARE A MIRROR. runOnce passes THE SAME
// c.lambda to fourStep and to recoverHeight, so a wrong wavelength cancels: rmsResidual reads 9.25e-17 at
// lambda 0.55, 9.25e-17 at 1.1 and 9.39e-17 at 2.2 -- MACHINE ZERO ACROSS A FACTOR OF FOUR. That is v3733's
// shape (a key sharing a constant with the thing under test) in a device nobody had planted. And peakToValley
// is read from `truth`, so it is a property of the FIXTURE and cannot move whatever the recovery does. ***
//
// *** THE KEY THAT IS NOT A MIRROR: without unwrapping the four-step phase is wrapped into (-pi, pi], and
// h = lambda*phi/(4*pi), SO THE UNAMBIGUOUS BAND IS h IN (-lambda/4, lambda/4]. A surface on a zero background
// aliases the moment ITS MAXIMUM crosses lambda/4. That is arithmetic from the method, not a number read off
// this fixture -- and it is the first thing here the device was never told. ***

import { buildInterferometer, aliasOnset, INTERF_OBSERVABLES, interferometerDevice } from "./interferometerBind.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);

// ---- 1. THE MIRROR, DECLARED ------------------------------------------------------------------------------
console.log("1. THE SHIPPED OBSERVABLES CANNOT SEE A WRONG WAVELENGTH");
{
    const r = [];
    for (const lambda of [0.55, 1.1, 2.2]) r.push((await buildInterferometer({ mode: "recover", config: { lambda } })).rmsResidual);
    ok("!! *** rmsResidual IS MACHINE ZERO ACROSS A FACTOR OF FOUR IN LAMBDA ***",
        r.every((v) => v < 1e-12),
        r.map((v) => v.toExponential(2)).join(", ") + " -- the SAME c.lambda encodes and decodes, so it CANCELS. " +
        "THIS IS A DECLARED BLINDNESS, NOT A DEFECT TO FIX: the round trip is worth measuring, it just is not " +
        "evidence about the wavelength. If this line ever goes red the two paths have stopped sharing lambda, " +
        "which would be worth knowing");

    const a = await buildInterferometer({ mode: "recover", config: { lambda: 0.55, scale: 0.5 } });
    const b = await buildInterferometer({ mode: "recover", config: { lambda: 2.2, scale: 0.5 } });
    ok("!! and peakToValley is IDENTICAL across wavelengths because it is read from `truth`",
        a.peakToValley === b.peakToValley,
        a.peakToValley.toFixed(4) + " both times. It is a property of the FIXTURE, so it cannot report anything " +
        "about the recovery at all -- asserted so nobody quotes it as one");
}

// ---- 2. THE KEY -------------------------------------------------------------------------------------------
console.log("\n2. THE ALIASING BAND IS lambda/4, AND IT IS ARITHMETIC FROM THE METHOD");
{
    const rows = [];
    for (const [lambda, scale] of [[0.55, 0.08], [0.55, 0.10], [0.55, 0.115], [0.55, 0.12],
                                   [0.55, 0.15], [0.8, 0.17], [1.2, 0.26], [1.2, 0.10]]) {
        rows.push(await buildInterferometer({ mode: "alias", config: { lambda, scale } }));
    }
    ok("!! *** THE RECOVERY ALIASES EXACTLY WHEN max(h) EXCEEDS lambda/4, ON BOTH SIDES AT THREE WAVELENGTHS ***",
        rows.every((o) => (o.aliasHeadroom > 1) === o.aliasedNow),
        rows.map((o) => o.aliasHeadroom.toFixed(3) + (o.aliasedNow ? "A" : "-")).join(" ") +
        "  (A = aliased). *** BOTH SIDES MATTER: a key that only fires above the band would be satisfied by a " +
        "device that always aliased ***");
    ok("!! the band is DERIVED from lambda, never typed",
        rows.every((o) => Math.abs(o.aliasBand - o.aliasMaxHeight / o.aliasHeadroom) < 1e-12),
        "aliasBand = lambda/4 and headroom = max(h)/band, so the ratio is the same number at every wavelength -- " +
        "A CLAIM ABOUT THE METHOD RATHER THAN ABOUT THIS FIXTURE AT THIS LAMBDA");
}

// ---- 3. TWO FALSIFIED HYPOTHESES, KEPT FALSIFIED -----------------------------------------------------------
console.log("\n3. THE TWO VARIABLES THAT WOULD HAVE SHIPPED A PLAUSIBLE WRONG KEY");
{
    const at = async (lambda, scale) => (await buildInterferometer({ mode: "alias", config: { lambda, scale } }));
    // Peak-to-valley: the obvious variable, and it DRIFTS with lambda.
    const ptvRatios = [];
    for (const [lambda, scale] of [[0.55, 0.1169], [0.8, 0.1700], [1.2, 0.2551]]) {
        const o = await at(lambda, scale);
        ptvRatios.push(o.peakToValley / o.aliasBand / 4);
    }
    ok("!! *** PEAK-TO-VALLEY AT THE ONSET IS NOT A CONSTANT OF THE METHOD ***",
        new Set(ptvRatios.map((v) => v.toFixed(3))).size > 1,
        "ptv/lambda at the onset reads " + ptvRatios.map((v) => v.toFixed(5)).join(", ") + " -- IT DRIFTS, " +
        "because the surface does not touch zero and ptv is not the distance from the wrap centre. A BRACKET " +
        "TYPED AROUND 0.229 WOULD HAVE LOOKED LIKE A CONSTANT AND BEEN A FIXTURE ARTEFACT");

    // The local Nyquist gradient: proposed, arithmetically reasonable, and WRONG for this fixture.
    const o = await at(0.55, 0.11687);
    ok("!! *** AND THE LOCAL PHASE-GRADIENT HYPOTHESIS IS FALSIFIED BY FIFTY-SIX ***",
        o.aliasGradientHeadroom < 0.05 && o.aliasHeadroom > 0.99 && o.aliasHeadroom < 1.01,
        "at the onset the largest ADJACENT-PIXEL height step is " + (o.aliasGradientHeadroom * o.aliasBand).toFixed(5) +
        " against the lambda/4 a Nyquist limit of pi per pixel would predict (" + o.aliasBand.toFixed(5) + ") -- " +
        "gradient headroom " + o.aliasGradientHeadroom.toFixed(4) + ". *** THE SURFACE IS SMOOTH ON A 64-GRID SO " +
        "NEIGHBOURING PHASES NEVER APPROACH pi APART; THE WRAP HERE IS GLOBAL, NOT LOCAL. Reported as an " +
        "observable so it stays falsified rather than being re-proposed ***");
}

// ---- 4. THE PLANT (v3761) ----------------------------------------------------------------------------------
console.log("\n4. WHAT THE MIRROR CAN STILL SEE, AND WHAT IT STILL CANNOT");
{
    const honest = await buildInterferometer({ mode: "recover" });
    const planted = await buildInterferometer({ mode: "stepsswapped" });
    ok("!! *** SWAPPING THE pi/2 AND 3pi/2 CAPTURES CONJUGATES THE PHASE, AND rmsResidual SEES IT ***",
        honest.rmsResidual < 1e-12 && planted.rmsResidual > 0.1,
        honest.rmsResidual.toExponential(3) + " -> " + planted.rmsResidual.toExponential(3) + ", a separation of " +
        (planted.rmsResidual / honest.rmsResidual).toExponential(2) + "x. *** THIS IS THE PRECISE STATEMENT THE " +
        "DEVICE LACKED: rmsResidual IS BLIND TO A CONSTANT SHARED BY BOTH SIDES (v3758's lambda) AND ALIVE TO A " +
        "DEFECT ON ONE SIDE ONLY. 'The round trip is a mirror' was too coarse -- it is a mirror of the ENCODING, " +
        "not of the DECODER, and a decoder-only fault is exactly what it is for ***");
    ok("!! *** AND peakToValley DOES NOT MOVE AT ALL UNDER A DEFECT THAT WRECKS THE RECOVERY ***",
        planted.peakToValley === honest.peakToValley,
        honest.peakToValley.toFixed(4) + " both arms. v3758 showed this across WAVELENGTHS; this shows it " +
        "against a REAL DEFECT, which is the stronger demonstration -- the recovery is ruined and the " +
        "observable is unchanged to every digit, because it is read from `truth`");
    ok("!! the plant is a REAL LAB MISTAKE, not one invented to be caught",
        interferometerDevice.plantMode === "stepsswapped" && interferometerDevice.plantFlips === "rmsResidual" &&
        interferometerDevice.plantKind === "mode" && interferometerDevice.modes.includes("stepsswapped"),
        "recording the phase steps OUT OF ORDER. Nothing downstream can detect it from the frames themselves, " +
        "because ALL FOUR ARE PERFECTLY VALID INTERFEROGRAMS -- which is why it needs a plant rather than a guard");
    ok("!! and the plant sits in the SETUP, not the readback",
        planted.lambda === honest.lambda,
        "v3725's distinction: setup means the solver was handed the WRONG WORLD; readback means the bind LIES " +
        "about a correct result. Both fire and both look identical in a log. THE SETUP IS THE HONEST CHOICE");
}

report("HOW THE MODE ITSELF WAS CAUGHT BEING WRONG",
    "The first version of `alias` inherited unwrap=true from the shared line `unwrap = h.mode !== 'nounwrap'`, " +
    "and reported aliasedNow=false at a headroom of 1.71 -- THE MODE DEFEATING THE THING IT MEASURES. Nothing " +
    "failed; the numbers simply disagreed with the prediction, which is the only reason it was noticed.");

report("WHAT THIS DOES NOT CLAIM",
    "That lambda/4 is the band for every interferometer. It follows from h = lambda*phi/(4*pi) with phi wrapped " +
    "into (-pi, pi], which is THIS method -- a transmission geometry or a different phase convention moves it, " +
    "and the check would then be measuring the convention rather than the optics. Nor is the surface's " +
    "MINIMUM handled: this fixture sits on a zero background, so max(h) is the distance from the wrap centre. " +
    "A surface straddling zero would need |h| max, and that case is NOT covered here.");

console.log("\ninterferometerBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
