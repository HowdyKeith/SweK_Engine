// WebGLEngine/tools/roundhouse/detectionMap.mjs -- v3429
// ---------------------------------------------------------------------------------------------------------------
// *** WHICH KEY SAW IT, AND WHICH ONE WAS BLIND. ***
//
// plantedCoverage answers "can this bind be asked what it would catch". It computes exactly the list this file
// needs -- `const moved = keys.filter(k => a[k] !== b[k])` -- AND THEN KEEPS ONLY `moved.length`. So the lab has
// been able to say a plant moves SOMETHING for as long as the census has existed, and has never been able to
// say WHICH observable moved and which sat still. The names were built and thrown away one line later.
//
// THAT MATTERS BECAUSE THE LAST FIVE ROUNDS EACH FOUND THE SAME FACT BY HAND, IN FIVE DIFFERENT SUBJECTS:
//   v3422 whiteDwarf   the plant MADE THE HEADLINE KEY LOOK BETTER (4.11e-15 against a true 2.87e-4)
//   v3423 centrifuge   invisible to two of five keys, each for its own reason
//   v3424 cherenkov    invisible to the threshold key; only the two-route pair caught it
//   v3425 invariants   invisible to three of five modes, because they never boost anything
//   v3428 (Keith)      three exact identities that cannot see a 27% error, a tenfold error, or ANYTHING
// FIVE HAND-NOTICINGS IN A ROW IS NOT AN ANECDOTE, IT IS A MISSING INSTRUMENT. This is the instrument.
//
// *** THE NAME CARRIES THE CAVEAT, WHICH v3395 LEARNED THE EXPENSIVE WAY. *** An observable here is
// `blindToThisPlant`, NEVER `blind`. A key that does not move under a device's ONE declared plant may be sharp
// against a fault nobody has planted yet -- Cherenkov's threshold key is real physics and is simply orthogonal
// to a wrong refractive index. The census reports WHAT WAS TRIED AND WHAT MOVED. It does not rank keys, and a
// field called `blind` would have been read as a verdict on the key rather than a fact about one experiment.
//
// COST: this is a SWEEP, not a report -- it builds every device at every mode, twice. ~90s, which is why it is
// an ARTEFACT tool writing JSON rather than a REPORTING row: v3395 put plantedCoverage's verified census behind
// a reporting row and turned toolFrontDoor red at 205s.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseRegistry, readsPlantedKnob, declaredPlantMode } from "./plantedCoverage.mjs";

/** Comparable form of one observable. Booleans and strings count -- iscoOutside is a KEY, not decoration. */
function comparable(v) {
    if (v === null || v === undefined) return null;
    const t = typeof v;
    if (t === "number") return Number.isFinite(v) ? "n:" + v : null;   // NaN/Infinity: not a movement signal
    if (t === "boolean" || t === "string") return t[0] + ":" + v;
    if (Array.isArray(v)) { try { return "a:" + JSON.stringify(v); } catch { return null; } }
    return null;                                                       // objects are structure, not observables
}

/**
 * For ONE device: which observables move when the plant is turned on, and which do not, across every mode it
 * declares. Union over modes, because an observable that moves in ANY mode has been shown capable of failing.
 */
export async function deviceDetection(device) {
    const seen = new Set(), moved = new Set(), perMode = [];
    const nominal = new Map();                                          // observable -> Set of nominal values seen
    for (const mode of device.modes || []) {
        let a, b;
        try {
            a = await device.build({ mode });
            // *** v3851 -- BOTH SPELLINGS, THE SAME FIX plantedCoverage MADE AT v3685 AND THIS FILE NEVER GOT. ***
            // freeRotationBind's signature is `build({ mode, config = {}, planted = false })` -- planted is a
            // SIBLING of config, not a key inside it. Turning only `config.planted` built NOMINAL TWICE, saw
            // nothing move, and reported a live plant (it deletes the whole gyroscopic term) as DECLARED BUT
            // DEAD. MEASURED: freerotation was this file's only dead plant and is not dead. A FALSE NEGATIVE IS
            // THE EXPENSIVE DIRECTION -- it sends somebody to repair a plant that already works.
            b = await device.build({ mode, planted: true, config: { planted: true } });
        } catch { perMode.push({ mode, error: "build-threw" }); continue; }
        const keys = [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].filter((k) => k !== "planted");
        const movedHere = [];
        for (const k of keys) {
            const ca = comparable(a[k]), cb = comparable(b[k]);
            if (ca === null && cb === null) continue;                  // nothing comparable either side
            seen.add(k);
            if (ca !== null) { if (!nominal.has(k)) nominal.set(k, new Set()); nominal.get(k).add(ca); }
            if (ca !== cb) { moved.add(k); movedHere.push(k); }
        }
        perMode.push({ mode, moved: movedHere.sort(), of: keys.length });
    }

    // *** THE FIRST RUN LISTED 240 "BLIND" OBSERVABLES AND MOST OF THEM WERE NOT KEYS AT ALL. *** A theory
    // constant (orderTheory, rateContinuous), an echoed config value (neutralDensityConfigured) and a genuinely
    // blind key all look identical from "did not move" -- TWO THINGS WEARING ONE LABEL, this tree's most
    // repeated shape, committed by the instrument built to find it. They are told apart by asking a SECOND
    // question the sweep already answers: does the observable take DIFFERENT VALUES ACROSS THE DEVICE'S MODES?
    // A number that is the same everywhere and moves for nothing is a LABEL; one that varies with the mode is a
    // live reading that this plant could not disturb. A ONE-MODE DEVICE CANNOT BE ASKED, and says so rather
    // than being counted either way.
    const oneMode = perMode.filter((m) => !m.error).length < 2;
    const varies = (k) => (nominal.get(k) || new Set()).size > 1;
    const still = [...seen].filter((k) => !moved.has(k));
    const blindToThisPlant = oneMode ? [] : still.filter(varies).sort();
    const constantLabels = oneMode ? [] : still.filter((k) => !varies(k)).sort();
    const undecidable = oneMode ? still.sort() : [];
    return {
        modes: perMode,
        observablesSeen: [...seen].sort(),
        observablesMoved: [...moved].sort(),
        blindToThisPlant, constantLabels, undecidable,
        // *** THE SECOND QUESTION: DOES THE WHOLE DETECTION REST ON ONE OBSERVABLE? *** whiteDwarf nearly
        // shipped like that, and its plant made that one observable look BETTER than the truth. A device with
        // one detector has not been asked what its detector cannot see.
        soleDetector: moved.size === 1 ? [...moved][0] : null,
        detectorCount: moved.size,
        // Nothing moved anywhere: the plant is DECLARED AND DEAD, which plantedCoverage already reports and
        // which is repeated here because a map with no movement in it would otherwise look like a tidy result.
        declaredButDead: moved.size === 0,
    };
}

/** The whole lab. Only binds that DECLARE a plant are probed: the rest have nothing to turn on. */
export async function detectionMap(engRoot, { DEVICE_NAMES, getDevice }) {
    const rows = parseRegistry(engRoot);
    const devices = [], unparsed = DEVICE_NAMES.filter((n) => !rows.some((r) => r.name === n));
    const noPlant = [], unloadable = [];
    const modePlants = [];
    for (const row of rows) {
        const reads = readsPlantedKnob(engRoot, row.file);
        if (!reads) { noPlant.push(row.name); continue; }
        let device;
        try { device = await getDevice(row.name); } catch { unloadable.push(row.name); continue; }
        // *** v3851 -- A MODE PLANT HAS NO KNOB FOR THIS INSTRUMENT TO TURN, AND PROBING IT WITH ONE PRODUCES A
        // FALSE DEAD READING. *** readsPlantedKnob is a `\bplanted\b` grep over code, so a bind whose plant is a
        // MODE still trips it if the word appears as a local -- meltBind's `frontRun(c, { planted })`,
        // freezeBind's `controlRun`, vaporizeBind's `ratioRun`, all three arriving with the v3850 thermal
        // plants. Their `planted` is an internal argument set BY THE MODE BRANCH; nothing reads it off the
        // hypothesis, so config.planted moves nothing and all three read DECLARED BUT DEAD while their plants
        // fire perfectly (plantedCoverage --verify lists every one of them moving its declared observable).
        //
        // *** THEY ARE REPORTED IN THEIR OWN CATEGORY RATHER THAN DROPPED. *** plantedCoverage checks the mode
        // plant BEFORE the knob path for exactly this reason and keeps the two apart because THEY ARE NOT THE
        // SAME EVIDENCE. This instrument asks "what does turning the knob fail to move", which is not a
        // question a mode plant has -- so it says so, and a reader looking for those devices finds them named
        // here instead of finding them mislabelled.
        if (declaredPlantMode(device)) { modePlants.push(row.name); continue; }
        devices.push({ name: row.name, ...(await deviceDetection(device)) });
    }
    const withPlant = devices.filter((d) => !d.declaredButDead);
    return {
        parsed: rows.length, registered: DEVICE_NAMES.length, unparsed, noPlant, unloadable,
        modePlants,
        devices,
        // THE THREE ANSWERS, DERIVED.
        blindObservables: devices.flatMap((d) => d.blindToThisPlant.map((o) => d.name + "." + o)).sort(),
        constantLabels: devices.flatMap((d) => d.constantLabels.map((o) => d.name + "." + o)).sort(),
        undecidable: devices.flatMap((d) => d.undecidable.map((o) => d.name + "." + o)).sort(),
        soleDetectorDevices: devices.filter((d) => d.soleDetector).map((d) => d.name + " -> " + d.soleDetector),
        deadPlants: devices.filter((d) => d.declaredButDead).map((d) => d.name),
        census: {
            devicesProbed: devices.length,
            devicesWithLivePlant: withPlant.length,
            observablesSeen: devices.reduce((a, d) => a + d.observablesSeen.length, 0),
            observablesMoved: devices.reduce((a, d) => a + d.observablesMoved.length, 0),
            blind: devices.reduce((a, d) => a + d.blindToThisPlant.length, 0),
            constants: devices.reduce((a, d) => a + d.constantLabels.length, 0),
            undecidable: devices.reduce((a, d) => a + d.undecidable.length, 0),
        },
    };
}

// ---------------------------------------------------------------------------------------------------------------
// FRONT DOOR. Writes JSON because the map is a table rather than a paragraph, and because it is a ~90s sweep
// that a page must not run inline. PRINTS A SUMMARY AND EXITS ZERO -- a report that says nothing is
// indistinguishable from a tool that never ran (v3201).
// ---------------------------------------------------------------------------------------------------------------
export const OUT = "detection-map.json";

async function main() {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const engRoot = path.resolve(here, "..", "..");
    const D = await import("./devices.mjs");
    const r = await detectionMap(engRoot, D);

    console.log("[detectionMap] which key saw the plant, and which one was blind\n");
    console.log(`  ${r.census.devicesProbed} devices declare a plant; ${r.census.devicesWithLivePlant} have one that moves something.`);
    console.log(`  ${r.census.observablesMoved} of ${r.census.observablesSeen} observables moved under their device's plant.\n`);

    console.log("  *** OBSERVABLES THAT DID NOT MOVE UNDER THEIR DEVICE'S PLANT ***");
    console.log("  Not a verdict on the key: it may be sharp against a fault nobody has planted. It is a record");
    console.log("  of WHAT WAS TRIED AND WHAT MOVED, and a key with nothing here has never been shown failing.");
    for (const o of r.blindObservables) console.log("    " + o);
    console.log(`\n  (${r.census.constants} more never move AND never vary across modes -- theory constants and`);
    console.log("  echoed config, which are LABELS rather than keys and are counted apart. " + r.census.undecidable +
                " sit on one-mode\n  devices, where the question cannot be asked at all.)");

    console.log("\n  *** DEVICES WHOSE ENTIRE DETECTION RESTS ON ONE OBSERVABLE ***");
    console.log("  A device with one detector has not been asked what its detector cannot see.");
    for (const d of r.soleDetectorDevices) console.log("    " + d);

    if (r.modePlants.length) console.log("\n  MODE PLANTS -- not probed here, because there is no knob to turn: " +
        r.modePlants.join(", ") + "\n  (they are adjudicated by plantedCoverage's probeModePlant, which builds the plant MODE)");
    if (r.deadPlants.length) console.log("\n  DECLARED BUT DEAD (a plant that moves nothing): " + r.deadPlants.join(", "));
    if (r.unloadable.length) console.log("  UNLOADABLE: " + r.unloadable.join(", "));

    const dest = path.join(engRoot, OUT);
    if (process.argv.includes("--write")) {
        fs.writeFileSync(dest, JSON.stringify(r, null, 2));
        console.log("\n  wrote " + OUT + " (" + (fs.statSync(dest).size / 1024).toFixed(1) + " KB)");
    } else {
        console.log("\n  DRY RUN -- pass --write to emit " + OUT + ". Emitting on sight would leave a stale");
        console.log("  artefact behind every accidental run, and a stale map is worse than none (v3195).");
    }
    return 0;
}

// Windows path law (v2759): compare through fileURLToPath, never by string.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
    main().then((c) => process.exit(c)).catch((e) => { console.error("[detectionMap] COULD NOT RUN:", e && e.stack || e); process.exit(1); });
}
