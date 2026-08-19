// WebGLEngine/tools/roundhouse/plantedCoverage-selfcheck.mjs -- v3391
//
// *** THE NUMBER REACHED ME AS "27 OF 63 BINDS" AND THIS TREE COULD NOT PRODUCE IT. Derived at v3391 for the first
// time, the answer was 14 OF 63; v3392 planted inspiral and kerr and it is 16; v3393 added pipe3d and it is 17 -- OF WHICH ONE IS A READER
// PLANT AND SIXTEEN HAVE NOT SAID. ***
//
// The two figures are almost certainly answering different questions. 14 is the count of binds that follow the
// v2893 PLANTED-ERROR CONVENTION -- a `planted` config that swaps a physics knob for a plausible wrong one, so
// the gate can be asked WHAT IT WOULD CATCH. A broader and equally real question is "which binds have a
// LOAD-BEARING NEGATIVE at all", and many more do: galaxy tests a one-way link, geostats sweeps an exponent
// away from the Markov value, md varies a parameter with no physical meaning, volume drops a triangle. THOSE
// ARE GOOD NEGATIVES AND THEY ARE NOT PLANTED ERRORS -- each is expressed in its own vocabulary, in its own
// mode, so nothing in the tree can count them. TWO THINGS WEARING ONE LABEL, which is the most repeated shape
// in this project's failure list, and the reason a derived census beats a remembered one.
import { plantedCoverage, readsPlantedKnob, parseRegistry } from "./plantedCoverage.mjs";
import * as D from "./devices.mjs";
import { ratchet } from "./coverage.mjs";
import { codeOnly } from "../ship/sourceScan.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

const r = await plantedCoverage(ENG, D);

// ---- 1. THE COUNT IS DERIVED, AND SO IS WHAT THE CENSUS COULD NOT SEE ------------------------------------
say(r.covered.length + " of " + r.registered + " binds carry a live planted error; " +
    r.modesLive + " of " + r.modesTotal + " modes on those binds actually respond");
{
    const g = ratchet({ have: r.covered.length, what: "binds with a live planted error", floor: 17 });
    ok("!! *** planted-error coverage does not go backwards ***", g.pass,
        g.evidence + " -- COVERED: " + r.covered.map((c) => c.name).join(", "));
    ok("!! and the registry rows this census could NOT parse are named, never folded into 'uncovered'",
        r.unparsed.length + r.missingFile.length <= 1 && !r.unparsed.some((n) => r.uncovered.includes(n)),
        "parsed " + r.parsed + " of " + r.registered + "; UNPARSED: " + (r.unparsed.join(", ") || "none") +
        " -- lbm is registered as a factory rather than an arrow and has no defaults(), so it is UNMEASURED " +
        "rather than uncovered. v3382 found a sibling gate quietly reading 44 of 57 rows; A SUBSET THAT LOOKS " +
        "LIKE A CORPUS is what this line exists to prevent");
}

// ---- 1b. KNOB AND READER PLANTS ARE NOT THE SAME EVIDENCE AND ARE NEVER SUMMED --------------------------
{
    say("by kind: " + Object.entries(r.byKind).map(([k, n]) => k + " " + n).join(", "));
    ok("!! *** the census reports plant KIND and refuses to fold it into the coverage number ***",
        Object.keys(r.byKind).length >= 2 && (r.byKind.reader || 0) >= 1,
        "a KNOB plant perturbs a physics input and grades the whole path from knob to observable; a READER " +
        "plant substitutes the MEASUREMENT because the failure being reproduced has no input that produces it " +
        "(pipe3d: no LBM input moves the peak and the shape independently). Both are useful and they are NOT " +
        "the same evidence");
    // v3400 -- *** THE SIXTEEN WERE READ AND THE COUNT IS A WALL AT ZERO. *** v3393 said reading them was owed
    // work, and reading them CORRECTED THE TAXONOMY rather than just filling in labels: the binary was wrong.
    // 14 are KNOB plants (a physics law replaced upstream of every observable), 2 are READER plants (the
    // dynamics run identically and only the MEASUREMENT is corrupted -- diffusion accumulates its MSD from
    // WRAPPED coordinates, pipe3d substitutes a plug profile), and ONE IS NEITHER: seismic's plant reparametrises
    // a correct integral in depth, where dx/dz diverges at the turning point. THE PHYSICS IS RIGHT AND THE
    // READING IS RIGHT; THE EVALUATION IS WRONG. That is a METHOD plant and the v3393 binary had no name for it.
    //
    // A WALL IS ONLY AFFORDABLE AT ZERO -- the platformRequires precedent. The only way to break it is a NEW
    // plant arriving undeclared, which is exactly when somebody should be made to read the bind. READ THE BIND
    // AND DECLARE; NEVER RAISE A BASELINE.
    //
    // *** v3851 -- THE WALL DID ITS JOB. SIX NEW PLANTS HAD ARRIVED UNDECLARED SINCE v3400, AND READING THEM
    // CORRECTED THE TAXONOMY A SECOND TIME. *** born, crystallize, blobkelvin and blobthermal are KNOB plants
    // (a refractive-index model, a periodic boundary condition, a STICK-vs-SLIP drag law, and the Einstein
    // factor that sets a random walk's step size). TWO ARE NOT, and the default would have been wrong about
    // both:
    //   chaos      READER. logistic.js's lyapunov() advances the orbit with `x = logistic(r, x)`, which the
    //              plant never touches; slopeOfMap enters ONLY the sum. The dynamics run identically and the
    //              measurement is corrupted -- v3400's reader shape exactly, and its own header calls the
    //              planted arm "THE PLANTED INSTRUMENT" four times.
    //   blobbodies METHOD, the second one this tree has found after seismic. The advection law is right and
    //              the centroid reading is right; the DEPARTURE POINT IS EVALUATED by rounding to the nearest
    //              voxel instead of interpolating, and since v*dt is a quarter of a cell the field never
    //              moves. No law replaced, no measurement substituted -- a discretisation choice inside a
    //              correct scheme.
    //
    // *** SO THE COUNT SINCE v3393 IS: THE BINARY WAS WRONG ONCE (v3400, seismic) AND WOULD HAVE BEEN WRONG
    // TWICE MORE HERE. blobthermal is the sharpest of them -- axisFactor is the SAME CONSTANT v3850 planted on
    // `thermal` as a READER (an MSD read with the wrong factor), and here it sets the WALK'S STEP SIZE
    // instead. SAME CONSTANT, OPPOSITE SIDE OF THE INSTRUMENT, OPPOSITE KIND, and only reading the bind can
    // tell you which. ***
    ok("!! *** every planted bind DECLARES its kind -- undeclared is a WALL at zero ***",
        (r.byKind.undeclared || 0) === 0 && (r.byKind.knob || 0) > 0 &&
        (r.byKind.reader || 0) > 0 && (r.byKind.method || 0) > 0,
        Object.entries(r.byKind).map(([k, n]) => k + " " + n).join(", ") + ". Reading the sixteen produced a " +
        "TAXONOMY CORRECTION rather than sixteen labels: seismic is neither knob nor reader, and assuming " +
        "`knob` by default -- the thing v3393 refused to do -- would have been WRONG ABOUT THREE OF THE " +
        "SEVENTEEN, not merely unproven");
}

// ---- 2. THE UNCOVERED LIST IS THE USEFUL HALF, AND IT IS PRINTED BY NAME ----------------------------------
{
    ok("!! every bind is on exactly one list -- covered, uncovered, dead or unparsed",
        r.covered.length + r.uncovered.length + r.declaredButDead.length + r.missingFile.length === r.parsed,
        r.covered.length + " + " + r.uncovered.length + " + " + r.declaredButDead.length + " + " +
        r.missingFile.length + " = " + r.parsed + ". A census that let a device fall through would report a " +
        "smaller problem than it has");
    say("UNCOVERED, " + r.uncovered.length + " of them -- these are the devices whose green tells you nothing");
    say("  " + r.uncovered.join(", "));
    say("MANY OF THESE HAVE A REAL LOAD-BEARING NEGATIVE IN ANOTHER FORM (galaxy's one-way link, geostats'");
    say("  exponent sweep, md's alphaFree). THIS CENSUS COUNTS THE CONVENTION, NOT THE VIRTUE, and says so");
    say("  rather than letting the number be read as 48 devices with nothing to prove.");
}

// ---- 3. A DECLARATION IS NOT A CAPABILITY: EVERY COVERED BIND WAS RUN -------------------------------------
{
    ok("!! *** every covered bind has at least one mode where the planted knob MOVES A NUMBER ***",
        r.declaredButDead.length === 0 && r.covered.every((c) => c.live.length > 0),
        "dead declarations: " + (r.declaredButDead.join(", ") || "none") + ". v3081's lens read 107% movement " +
        "on a device that was IGNORING ITS CONFIG, because an echoed input is not liveness. So the knob is not " +
        "believed, it is DRIVEN -- nominal against planted, every declared mode");
    const inertModes = r.modesTotal - r.modesLive;
    ok("...and the modes that do NOT respond are counted, not hidden",
        r.modesLive < r.modesTotal,
        inertModes + " of " + r.modesTotal + " modes on covered devices are inert under their own device's " +
        "plant. THAT IS CORRECT AND NOT A DEFECT: a planted error targets ONE derivation, and a plant that " +
        "moved every mode would be perturbing something shared rather than something specific. Reporting " +
        "coverage per DEVICE while hiding that it is one mode of four would be the flattering number");
}

// ---- 4. THE SABOTAGE: THIS IS NOT A KEYWORD SCAN ---------------------------------------------------------
{
    // The whole census turns on one question, so the question is tested directly rather than trusted.
    const commentOnly = "// this bind has no planted error yet -- see plantedError.mjs\nexport const x = 1;\n";
    const stringOnly = "export const label = \"planted\";\n";
    const real = "export function build({ config }) { return { v: config.planted ? 2 : 1 }; }\n";
    ok("!! *** a bind that only MENTIONS a planted error in a comment does not count as having one ***",
        !/\bplanted\b/.test(codeOnly(commentOnly)) && !/\bplanted\b/.test(codeOnly(stringOnly)) &&
        /\bplanted\b/.test(codeOnly(real)),
        "codeOnly() strips comments AND strings. Several binds in this tree DISCUSS the convention at length " +
        "without following it, and a raw grep would have counted every one of them. THE KEYWORD PROBE HAS " +
        "MISLED THIS PROJECT THREE TIMES");
    // ...and the same question asked of a real file, so the helper is not merely correct on toy input.
    const rows = parseRegistry(ENG);
    const clocksRow = rows.find((x) => x.name === "clocks");
    ok("...asked of a real bind, on disk, through the same path the census uses",
        !!clocksRow && readsPlantedKnob(ENG, clocksRow.file) === true,
        "clocks was the most conspicuous gap and is now the fourteenth");
}

// ---- 5. THE CENSUS IS ABOUT THE CONVENTION AND MUST NOT BE READ AS A QUALITY SCORE ------------------------
{
    // *** v3852 -- THE LINE THAT STOOD HERE IS DELETED, WHICH IS WHAT IT ASKED FOR. *** It named galaxy,
    // geostats, md, volume, friction and figureeight as devices carrying load-bearing negatives that did not
    // use the `planted` convention, and said: "WHEN SOMEBODY UNIFIES THE TWO NOTIONS THIS LINE SHOULD GO RED
    // AND BE DELETED, NOT WEAKENED -- and the honest unification is to give those devices a plant, never to
    // widen the census until the number looks better." All five real ones have a plant now, so it went red and
    // it is gone rather than adjusted.
    //
    // *** TWO THINGS READING THEM ESTABLISHED, KEPT BECAUSE THEY ARE WHY THE LINE WAS RIGHT: ***
    //
    // (1) `volume` WAS NEVER A DEVICE. No volumeBind, not in devices.mjs, no trace in the changelog. The old
    //     filter passed it through `|| !D.DEVICE_NAMES.includes(n)`, so a name that never existed was a
    //     PERMANENT PASS and that sixth entry asserted nothing for as long as it stood. AN ESCAPE CLAUSE ADDED
    //     FOR ROBUSTNESS MADE ONE SIXTH OF THE CHECK VACUOUS, and only counting the real ones found it.
    //
    // (2) NONE OF THE FIVE NEGATIVES WAS A PLANT, and the census was right to keep reading them as uncovered.
    //     friction's zeroMu and md's alphaFree move their observable TO its ideal -- CONTROLS. figureeight's
    //     perturbed and geostats' screen vary a legitimate INPUT, so nothing is implemented wrongly in either
    //     arm. galaxy's oneway is an exact structural identity whose own header says it "needs no sabotage".
    //     A PLANT HAS TO BE A WRONG METHOD ON THE RIGHT PROBLEM, and none of these was, so the work was to
    //     BUILD FIVE, not to relabel five.
    //
    // (3) AND ONE OF THEM DID NOT FIT THE CONTROL CONTRACT EITHER. friction's zeroMuRatio is a SEPARATION
    //     demonstration -- "these two must be far apart", reading 1.6e17 -- and the control contract wants an
    //     observable that REACHES a stated ideal. It was declared wrong first and probeControlMode refused it
    //     by name. The control is declared on travelHalfMu -> 0 instead, which is a value something reaches.
    //     THE TAXONOMY HAS A THIRD SHAPE AND THE CENSUS HAS NO CATEGORY FOR IT; that is recorded, not forced.
    ok("!! the census counts plants and NEVER folds a control into the number",
        (r.controls || []).length >= 1 && !(r.covered || []).some((c) => (r.controls || []).some((k) => k.name === c.name && !c.plantKind)),
        "a subject with a good control and no plant has not been shown to CATCH anything, so controls are " +
        "probed separately, reported separately, and kept out of the coverage total on purpose");
}

console.log(failed ? "\n[plantedCoverage-selfcheck] FAILED " + failed : "\n[plantedCoverage-selfcheck] all checks pass");
process.exit(failed ? 1 : 0);
