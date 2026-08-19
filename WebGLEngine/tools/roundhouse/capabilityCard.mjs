// WebGLEngine/tools/roundhouse/capabilityCard.mjs -- v3395
//
// *** WHAT THIS LAB CAN BE ASKED, PUBLISHED AS DATA -- AND, JUST AS IMPORTANTLY, WHAT IT REFUSES TO CLAIM. ***
//
// Two unrelated projects arrived at the same shape and this is SweK's version of it. A2A's AgentCard (v3279):
// "a peer PUBLISHES what it can serve and the caller READS it instead of assuming". DeepVerify (v3394): a
// research agent is reachable as a TOOL SERVER rather than a library. Both say the same thing -- THE CALLER
// SHOULD NOT HAVE TO GUESS -- and neither of them can publish the thing SweK actually has.
//
// *** BECAUSE THE INTERESTING FIELD IS NOT "HERE ARE MY TOOLS". IT IS "HERE IS WHAT EACH ONE IS GRADED AGAINST
// AND WHAT IT WOULD HAVE CAUGHT". *** Every agent card in the wild lists capabilities; none of them can say
// which of its answers has an answer key, because nobody else keeps the census. That census exists here
// (gradedCoverage v3195, plantedCoverage v3391, the instrument index), and this file is the one place it is
// assembled into something a caller can read.
//
// EVERY FIELD IS DERIVED. Nothing is typed, nothing is remembered:
//
//   modes / observables   from the device's own exported declaration
//   instrument / page     from physics/instruments.mjs, matched on its `device` field
//   statedKey             whether that instrument entry carries a key -- the LAB'S OWN RULE, that an
//                         instrument without a key is decoration
//   plant / plantKind     from plantedCoverage, which RUNS each candidate rather than reading its source
//
// *** AND THE CARD CARRIES A `notClaimed` LIST, WHICH IS THE PART MOST LIKELY TO BE DELETED BY SOMEBODY TIDYING.
// A card that lists only what it knows reads as a card that knows everything. *** The three absences are real
// and each has a reason: no detection floor (only clocks has one measured, and it is a RADIUS rather than an
// epsilon, so a single numeric column would be a lie); no correctness claim (a green gate says a value did not
// move, not that the physics is right); no latency (v2827: latency is not comparable across peers).
//
// WHAT THIS IS NOT: AN MCP IMPLEMENTATION. The wire protocol is deliberately absent -- putting a second
// transport with its own auth on the trusted path is the reasoning that kept copyparty and A2A off it. This
// publishes JSON. If something later wants to speak MCP to it, that is a SHIM over this, not an architecture.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { INSTRUMENTS } from "../../physics/instruments.mjs";
import { parseRegistry, readsPlantedKnob, declaredPlantMode } from "./plantedCoverage.mjs";

/** The absences, first-class. A caller that reads only the positive fields would over-trust the card. */
export const NOT_CLAIMED = [
    { field: "detectionFloor", why: "only clocks has one measured, and it is a RADIUS (invisible beyond ~1007M at a 1e-6 tolerance) rather than an epsilon. One numeric column would force every other device to look like it had a floor of zero." },
    { field: "correct", why: "a green gate says a value did not move and a relationship held. It does not say the physics is right, and the card must not let a caller read it that way." },
    { field: "latencyMs", why: "v2827: latency is not comparable across peers, so a number here would be compared anyway." },
    { field: "plantVerified", why: "the card reads whether a bind DECLARES a planted knob, which is cheap. Proving the knob MOVES something takes 91 seconds of sweeping, so the verified census is named as a command rather than pretended at." },
    { field: "answerKeyText", why: "the instrument entry holds it and it runs to hundreds of words. The card says WHETHER one is stated and names the instrument to fetch, which is a different and smaller promise." },
];

/** Card for one device. Every field traced to the thing that derived it. */
export function cardFor(name, device, { instrument, plant }) {
    return {
        device: name,
        name: (device && device.name) || null,
        modes: (device && device.modes) || [],
        observables: ((device && device.observables) || []).length,
        instrument: instrument ? instrument.id : null,
        page: instrument ? (instrument.page || null) : null,
        // *** NULL, NOT FALSE, WHEN THERE IS NO INSTRUMENT. "nobody has linked this device to an instrument"
        // and "the instrument says it has no key" are DIFFERENT FACTS, and false would collapse them into the
        // more damning one. v3334's rule in a new place: UNKNOWN IS NOT SATISFIED, and it is not refused either.
        statedKey: instrument ? !!(instrument.key && instrument.key.length > 0) : null,
        plantDeclared: !!plant,
        // v3900 -- how the declaration was found: "knob" (the bind reads a planted config key), "mode" (the
        // device names a plantMode and the observable it flips), or both. Null when there is no plant.
        plantShape: plant ? plant.shape : null,
        plantKind: plant ? ((device && device.plantKind) || "undeclared") : null,
    };
}

/** The whole card. Async because several device builds are, and plantedCoverage RUNS them. */
export async function capabilityCard(engRoot, registry) {
    // *** THE PLANT COLUMN IS DECLARED, NOT VERIFIED, AND THE CARD SAYS SO. *** plantedCoverage's verified
    // census RUNS every candidate across every mode, nominal against planted -- MEASURED AT 91 SECONDS, which
    // is not a report, it is a sweep. The card reads the DECLARATION instead (does the bind's code read a
    // planted knob) and names `plantedVerifiedBy` so a caller who wants the run knows exactly what to run.
    // A CARD THAT SILENTLY PUBLISHED A DECLARATION AS A MEASUREMENT WOULD BE THE EXACT DEFECT THIS TREE KEEPS
    // FINDING; a card that dropped the column to stay fast would hide the one field nobody else can publish.
    // *** v3900 -- THE COLUMN COUNTED KNOB PLANTS AND WAS NAMED FOR ALL OF THEM, WHICH IS THE THIRD PLACE THIS
    // TREE HAS MADE THE SAME MISTAKE. *** readsPlantedKnob is a `\bplanted\b` GREP OVER CODE, so a bind whose
    // plant is a MODE -- declared as plantMode/plantFlips on the device object, not as a config knob -- never
    // entered this map at all. plantDeclared read FALSE for hands, flip3d, hydrostatic, flip2d, mpmrefine and
    // gyroscope, i.e. for EVERY mode-shaped plant in the tree, under a count whose name says "declaring a
    // plant". The barehands round (v3850, parallel line) NAMED this and correctly left it: "a tree that
    // declares two plant shapes and counts one of them under a name that says all will keep reporting
    // mode-planted devices as bare." detectionMap carried the same defect and was fixed this round; this is
    // the same edit in the third consumer, and the reason it is worth doing here rather than later is that
    // ONE GREP IS NOT A TAXONOMY -- the device says what kind of plant it has, so ask the device.
    //
    // *** THE DECLARED-NOT-VERIFIED CAVEAT IS UNTOUCHED, and that distinction is the whole point of the
    // column. *** A mode plant is DECLARED here on exactly the same terms as a knob plant: the bind says it
    // has one. Whether it MOVES anything is still plantedCoverage's sweep, still named in plantedVerifiedBy,
    // and still not pretended at.
    const knobBy = {};
    for (const row of parseRegistry(engRoot)) {
        if (readsPlantedKnob(engRoot, row.file)) knobBy[row.name] = true;
    }
    const instBy = {};
    for (const i of INSTRUMENTS) if (i.device) instBy[i.device] = i;

    const devices = [];
    for (const name of registry.DEVICE_NAMES) {
        let d = null;
        try { d = await registry.getDevice(name); } catch { /* an unloadable device is still a row */ }
        // A bind may declare BOTH shapes. `shape` records which one was found, so a reader can tell a mode
        // plant from a knob plant without re-deriving it -- the two are not the same evidence, which is the
        // rule plantedCoverage already applies by keeping probeModePlant ahead of the knob path.
        const mode = declaredPlantMode(d);
        const plant = (knobBy[name] || mode)
            ? { declared: true, shape: knobBy[name] ? (mode ? "knob+mode" : "knob") : "mode" }
            : null;
        devices.push(cardFor(name, d, { instrument: instBy[name] || null, plant }));
    }
    const version = readVersion(engRoot);
    return {
        engine: version,
        devices,
        counts: {
            devices: devices.length,
            withInstrument: devices.filter((d) => d.instrument).length,
            withStatedKey: devices.filter((d) => d.statedKey === true).length,
            keyUnknown: devices.filter((d) => d.statedKey === null).length,
            plantDeclared: devices.filter((d) => d.plantDeclared).length,
            withPage: devices.filter((d) => d.page).length,
        },
        plantedVerifiedBy: "node tools/roundhouse/plantedCoverage-selfcheck.mjs",
        notClaimed: NOT_CLAIMED,
    };
}

/** The engine marker, read rather than typed -- a card stamped by hand would be the first thing to go stale. */
export function readVersion(engRoot) {
    try {
        const m = /ENGINE_VERSION\s*=\s*"(v\d+)"/.exec(fs.readFileSync(path.join(engRoot, "main.js"), "utf8"));
        return m ? m[1] : null;
    } catch { return null; }
}

// ---- main block: this is a REPORTING tool -- it prints and exits zero, and changes nothing ----------------
if (process.argv[1] && process.argv[1].endsWith("capabilityCard.mjs")) {
    const here = path.dirname(new URL(import.meta.url).pathname);
    const eng = path.join(here, "..", "..");
    const D = await import("./devices.mjs");
    const card = await capabilityCard(eng, D);
    const c = card.counts;
    // NAMES ITSELF: a report with no name on it is unattributable the moment two of them share a terminal.
    console.log("[capabilityCard] SweK capability card -- " + card.engine);
    console.log(c.devices + " devices; " + c.withInstrument + " linked to an instrument, " + c.withStatedKey +
        " of those stating an answer key (" + c.keyUnknown + " UNKNOWN, not unlinked-and-therefore-keyless), " + c.withPage + " with a page, " + c.plantDeclared + " DECLARING a planted error (declared, not verified -- run " + card.plantedVerifiedBy + ").");
    console.log();
    console.log("device".padEnd(15) + "modes obs  instrument".padEnd(30) + "key plant");
    for (const d of card.devices) {
        console.log(d.device.padEnd(15) + String(d.modes.length).padEnd(6) + String(d.observables).padEnd(5) +
            String(d.instrument || "-").padEnd(25) + (d.statedKey === true ? "yes " : d.statedKey === false ? "no  " : "?   ") +
            (d.plantDeclared ? d.plantKind : "-"));
    }
    console.log();
    console.log("NOT CLAIMED BY THIS CARD -- each absence has a reason, and the list is part of the card:");
    for (const n of card.notClaimed) console.log("  " + n.field + ": " + n.why);
}
