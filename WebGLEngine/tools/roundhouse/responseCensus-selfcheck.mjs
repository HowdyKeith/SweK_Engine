// tools/roundhouse/responseCensus-selfcheck.mjs
//
// Run: node tools/roundhouse/responseCensus-selfcheck.mjs
//
// *** COST: THIS LINE SAID "~5 min" AND THE GATE HAD NOT FINISHED AT NINETY-NINE MINUTES. ***
// MEASURED at v4306 on one core at 100% CPU, uncontended: still running at 5944 s against a claim of 300 s,
// so the stated figure is wrong by AT LEAST TWENTYFOLD and the true number is a lower bound, not a reading.
//
// THE REASON IS STRUCTURAL AND THE LINE COULD NOT HAVE STAYED RIGHT. responseCensus walks
// DEVICE_NAMES x modes x config keys and REBUILDS FOR EVERY ONE -- so its cost tracks the size of the lab,
// which is now 129 devices and 484 declared device-mode pairs. The ~5 min was true of a smaller lab and was
// never re-measured. A STATED RUNTIME NOBODY RE-MEASURES IS A MEMORY (v3211-v3213, which found stated
// runtimes wrong in 59 of 82 gate headers and did not reach this file).
//
// PRACTICAL CONSEQUENCE, stated because it changes how this gate should be used: at this cost it does not
// belong in a run-everything pass. Run it deliberately and in the background, the way plantedCoverage
// --verify is run. 163 of the lab's 815 gate files state a runtime at all; this one now states a measured
// bound instead of a remembered guess.
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2910 -- OPEN ITEM 2, AND THE THING THE SWEEP FOUND WAS A HOLE IN THE SWEEPS.

import { responseCensus, responseLines, INERT_OK, RESPONSE_REGISTRATION, STEP } from "./responseCensus.mjs";
import { deviceModeTable } from "./deviceModes.mjs";   // v3211: DERIVED -- MODES never existed here
const MODES = await deviceModeTable();
import { getDevice } from "./devices.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const c = await responseCensus({});
console.log();
responseLines(c).forEach((l) => console.log("  " + l));
console.log();
const row = (d, m) => c.rows.find((r) => r.device === d && r.mode === m);

// ---- 1. THE PERTURBATION MECHANISM WORKS -- POSITIVE CONTROL --------------------------------------------------------
{
    const dev = await getDevice("thermal");
    const a = [];
    // *** v4304 -- THIS ASKED FOR MODE "diffusion" AND THERMAL DECLARES "diffuse". *** thermalDefaults does not
    // refuse an unknown mode, it SUBSTITUTES THE DEFAULT -- and the default happens to be `diffuse`, so this
    // control has been testing the right thing BY LUCK for its whole life. Verified: the two builds are
    // byte-identical by labExport's canonical form. If the default ever moved, the control would silently start
    // measuring another mode and still pass. Named correctly now; this is v3806's silent-substitution shape.
    const MODE = "diffuse";
    for (const tauG of [0.8, 0.9, 1.1]) a.push(await dev.build({ mode: MODE, config: { tauG } }));
    const tracks = a.every((o) => Math.abs(o.alphaMeasured - o.alphaTheory) / o.alphaTheory < 5e-3);
    ok("!! a knob that SHOULD move an observable does",
        a[0].alphaMeasured !== a[2].alphaMeasured && tracks,
        // AND THE NUMBERS ARE PRINTED FROM THE RUN THIS LINE JUST DID, not typed beside it. They were
        // "0.0999983, 0.1333015, 0.1992345" as literals -- correct when re-measured at v4304, and correct is
        // the point: a gate that BUILDS the sweep and then quotes a remembered answer has a second copy that
        // can rot while the assertion above it stays green.
        "thermal tauG 0.8 -> 0.9 -> 1.1 moves alphaMeasured " +
        a.map((o) => o.alphaMeasured.toPrecision(7)).join(", ") + " and alphaTheory tracks it at " +
        a.map((o) => o.alphaTheory.toPrecision(5)).join(", ") + " -- the emergent diffusivity follows " +
        "(tau_g - 1/2)/3 out of the collision. Without this control an inert verdict anywhere would be " +
        "indistinguishable from a broken sweep");
}

// ---- 2. THE PRE-REGISTERED PREDICTIONS ---------------------------------------------------------------------------------
{
    const frac = c.summary.inert / c.summary.observables;
    ok("!! prediction A HELD: a large minority of the lab's numbers respond to no input",
        frac >= RESPONSE_REGISTRATION.claim.inertFraction,
        c.summary.inert + " of " + c.summary.observables + " observables (" + (100 * frac).toFixed(0) + "%) move " +
        "for no config key at a " + STEP + " step, against a registered floor of 5%. " + c.summary.inertUnregistered +
        " of them are not registered as legitimate constants");

    const o = row("optics", "airy");
    ok("!! prediction B HELD, and precisely: rayleighFactor cannot see the wavelength",
        !o.respondsTo.rayleighFactor.includes("lambda") && o.movedBy.lambda.length === 0,
        "rayleighFactor responds to " + o.respondsTo.rayleighFactor.join(" and ") + " but NOT lambda -- and " +
        "lambda moves NOTHING optics.airy reports. v2908 measured that lambda does reach the arithmetic and " +
        "changes the diffraction pattern in the 15th digit; the sampling grid quantises that away before it " +
        "reaches a single reported number. A physical input with no reported consequence");
}

// ---- 3. THE FINDING, WHICH IS A HOLE IN THE OTHER CENSUSES -------------------------------------------------------------
{
    // lens mapN and mapSpan came back dead in every mode. They are not dead. They are the map mode's knobs, and
    // MODES has no map mode -- so this sweep never built it, and neither did any of the others.
    ok("!! the MODES table omits lens.map, and three prior censuses inherited the gap",
        !MODES.lens.includes("map"),
        "lens modes swept: " + MODES.lens.join(", ") + ". The map mode is absent, so the v2898 tautology census, " +
        "the v2904 corroboration census and the v2905 libm sweep have all been skipping it. That is the mode " +
        "whose peak is graded against sqrt(1+4/rho^2), the mode v2900 converted to strictTrig, and the entire " +
        "subject of the v2903 magmap kernel. The response census found it only because the map's knobs looked " +
        "dead -- a coverage hole is invisible until something downstream of it looks wrong");

    const dev = await getDevice("lens");
    const m = await dev.build({ mode: "map" });
    ok("...and the mode builds fine, so nothing but the table was stopping it",
        m && Number.isFinite(m.mapPeak),
        "lens.map builds and reports mapPeak = " + m.mapPeak.toFixed(6) + ". It was never broken, never " +
        "deliberately excluded, and never swept");
}

// ---- 4. TWO CANDIDATES INSPECTED, TWO FALSE POSITIVES, ONE SHARED CAUSE -------------------------------------------------
{
    // Recorded because the alarming version of both was drafted first.
    // *** v4307 -- THE REASONING WAS ABOUT THE STILL MODES AND THE ASSERTION WAS ABOUT ALL OF THEM. *** This
    // read `th.every(...)` across EVERY thermal row and went red, because thermal declares a `rayleigh` mode
    // that SWEEPS GRAVITY ON PURPOSE to find the critical point -- and Ra runs through the viscosity, which is
    // what tau sets. MEASURED per mode: diffuse, convect and onedmoment move NOTHING under tau; rayleigh moves
    // raCritMeasured and raCritErrFrac. The prose already said which case it meant -- "the diffusion test runs
    // with gravity 0 and beta 0 and walls injecting nothing, so there is no flow for it to act on" -- and that
    // sentence is exactly false of the rayleigh mode. A CLAIM STATED WIDER THAN WHAT WAS MEASURED, which is the
    // defect this branch has been chasing, in the file that reports on other devices doing it.
    //
    // NOT MINE, AND THAT WAS CHECKED RATHER THAN ASSUMED: `rayleigh` has always been in deviceModes'
    // CANDIDATE_MODES, so that row has always been swept, and the dependence is structural -- alpha =
    // c_s^2 (tau_g - 1/2) by thermalBind's own header, with Ra inversely in the viscosity tau sets. The
    // `rayleigh` observable v4184 added lives in `convect`, which reads gravity 0 and moves under nothing.
    //
    // The response is now asserted BOTH WAYS, because "tau is dead here" is only worth saying if tau is alive
    // somewhere: a suite where tau moved nothing anywhere would be a broken sweep, not a physics result.
    const th = c.rows.filter((r) => r.device === "thermal");
    const still = th.filter((r) => r.mode !== "rayleigh");
    const ray = th.filter((r) => r.mode === "rayleigh");
    const movedIn = (rs) => rs.filter((r) => r.movedBy.tau && r.movedBy.tau.length);
    ok("thermal's dead tau is correct physics in the STILL modes -- and rayleigh responds, as it must",
        still.length > 0 && movedIn(still).length === 0 && ray.length > 0 && movedIn(ray).length > 0,
        "tau is the MOMENTUM relaxation time; the still modes (" + still.map((r) => r.mode).join(", ") +
        ") run with gravity 0 and beta 0 and walls injecting nothing, so there is no flow for it to act on, and " +
        "tau moves nothing in them. `rayleigh` sweeps gravity to locate the critical point, so tau reaches it " +
        "through the viscosity: " + (movedIn(ray)[0] ? movedIn(ray)[0].movedBy.tau.join(", ") : "") + ". " +
        "thermalBind's own header says the diffusivity comes from tau_g. I had drafted this as 'the measured " +
        "diffusivity ignores the relaxation time that defines it' before reading the file");

    ok("chaos's dead warmup is convergence, not a defect",
        (row("chaos", "lyapunov").movedBy.warmup || []).length === 0,
        "40000 versus 40040 warmup iterations of a logistic map both land deep in the attractor, so an " +
        "unresponsive warmup is EVIDENCE THE WARMUP IS SUFFICIENT. It also retroactively explains v2908, where " +
        "warmup was pressed into service as an ad-hoc nuisance parameter for deltaBest and came back " +
        "bit-identical -- that c2 failure was the knob being converged, not unwired");

    ok("!! so the sweep measures response AT THE DEFAULT OPERATING POINT, which is a real limit",
        c.summary.deadKnobs > 0,
        "a device parked in a degenerate corner reports its knobs dead: thermal defaults gravity and beta to " +
        "exactly 0, and perturbing a zero-valued knob by " + STEP + " is far too small to start convection in " +
        "360 steps. Of the 15 knobs dead in EVERY mode, the two inspected were both explicable. The census " +
        "produces candidates, not verdicts, and saying otherwise would make it another gate nobody trusts");
}

// ---- 5. WHAT THIS DOES NOT ESTABLISH -------------------------------------------------------------------------------------
{
    ok("inert is a candidate list, not a defect list",
        c.summary.inertUnregistered > 0 && Object.keys(INERT_OK).length > 0,
        c.summary.inertUnregistered + " unregistered inert observables across the lab. Many will be theoretical " +
        "constants that simply are not in INERT_OK yet; triaging them device by device is the follow-on, and " +
        "each one resolved should either move into INERT_OK with a reason or become a bug");
    console.log("  NOTE   the 400 'dead knobs' in the summary line is dominated by mode scoping -- lens carries one");
    console.log("         config across eleven modes, so most keys are idle in any given one. The number that");
    console.log("         means anything is 15: knobs dead in EVERY mode of their device.");
}

console.log();
if (fails) { console.log("responseCensus-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("responseCensus-selfcheck: all checks pass");
