// WebGLEngine/tools/roundhouse/deviceModes.mjs -- v3189
//
// HOW MANY MODES DOES A DEVICE DECLARE? THE FRONT DOOR COULD NOT SAY.
//
// v3174 measured the thing that decides whether a device can explain its own error: SIX OF SEVEN LOOSE DEVICES
// DECLARE EXACTLY ONE MODE, and with one mode there is nothing to compare against, so the number it reports
// cannot be separated into "the key's truncation" and "my own defect". v3188 shipped spacefill with three.
//
// *** AND /device/list REPORTS name, observables AND knobs -- NOT MODES. *** So the single most important
// structural fact about a device is invisible on the page built to look at devices. checkMode has existed
// since v3144 and the listing never reached for it: the sixth instance this session of a capability sitting
// unused beside the thing that needed it.
//
// *** THIS IS A LOWER BOUND AND SAYS SO. *** A mode is declared by being ECHOED BACK from defaults({ mode }),
// which means you can only ask about a mode you already thought of. There is no enumeration to read. So this
// PROBES a candidate list and reports what answers -- a device with a mode nobody guessed will under-report,
// and that is itself worth knowing, because A MODE NOBODY CAN DISCOVER IS A MODE NOBODY WILL USE.
//
// A device may short-circuit the guessing by exporting `modes`. spacefill does. Nothing else has to.

/** Candidates, assembled from what the lab actually uses. NOT a claim that these are all the modes there are. */
export const CANDIDATE_MODES = [
    "stroke", "raster", "order", "precession", "firstorder", "closure", "isco", "capture", "validity",
    "sweep", "profile", "sphere", "drop", "einstein", "balance", "fixed", "deflect", "scale", "limit",
    "converge", "airy", "rayleigh", "diffuse", "fan", "merger", "conserve", "well", "shedding", "growth",
];

/**
 * @returns { declared, source, isLowerBound } -- source is "exported" when the device lists its own modes and
 *          "probed" when they had to be guessed at, because those are different levels of confidence and
 *          reporting them under one name would be the shape this session has found more than any other.
 */
export function modesOf(device, checkMode, candidates = CANDIDATE_MODES) {
    if (Array.isArray(device && device.modes) && device.modes.length) {
        return { declared: device.modes.slice(), source: "exported", isLowerBound: false };
    }
    // *** v3191 -- A DEVICE WITH NO defaults() IS NOT A DEVICE WITH EVERY MODE. *** checkMode returns ok for
    // any string when there is nothing to ask (its line 97, correctly), so probing lbm returned THE WHOLE
    // CANDIDATE LIST and it appeared in the census as a 29-mode device. It has NONE DECLARED, which is a
    // different fact and gets a different field. Two things wearing one label, caught by the number looking
    // absurd rather than by anything failing.
    if (typeof device.defaults !== "function") {
        return { declared: [], source: "no-defaults", isLowerBound: false };
    }
    const found = [];
    for (const m of candidates) {
        try { if (checkMode(device, m).ok !== false) found.push(m); } catch { /* a device that throws on a mode has not declared it */ }
    }
    return { declared: found, source: "probed", isLowerBound: true };
}

/**
 * The lab-wide picture, which is the number v3174 cared about.
 *
 * ONE-MODE DEVICES ARE COUNTED SEPARATELY rather than folded into an average. "the lab averages 1.4 modes per
 * device" would be true and useless: the question is HOW MANY CANNOT EXPLAIN THEIR OWN ERROR, and that is a
 * count of devices at exactly one.
 */
export async function modeCensus(D, checkMode) {
    const rows = [];
    for (const name of D.DEVICE_NAMES) {
        let d; try { d = await D.getDevice(name); } catch (e) { rows.push({ name, declared: [], error: String((e && e.message) || e) }); continue; }
        const m = modesOf(d, checkMode);
        rows.push({ name, declared: m.declared, source: m.source, isLowerBound: m.isLowerBound });
    }
    return {
        rows,
        devices: rows.length,
        singleMode: rows.filter((r) => r.declared.length === 1).map((r) => r.name),
        multiMode: rows.filter((r) => r.declared.length > 1).map((r) => r.name),
        // A DEVICE WHERE NOTHING ANSWERED IS NOT A DEVICE WITH ZERO MODES. It is one whose modes were not
        // among the candidates, or which has no defaults() at all -- reported apart from the single-mode
        // group, because they need different work.
        // NO-defaults IS ITS OWN GROUP, not folded into "undiscoverable" -- one has modes nobody guessed, the
        // other has no mode declaration to read at all, and they need different work.
        noDeclaration: rows.filter((r) => r.source === "no-defaults").map((r) => r.name),
        undiscoverable: rows.filter((r) => r.declared.length === 0 && r.source !== "no-defaults").map((r) => r.name),
    };
}

/**
 * v3211 -- THE TABLE NINE FILES HAVE BEEN IMPORTING AND THIS MODULE HAS NEVER EXPORTED.
 *
 * *** `import { MODES } from "./deviceModes.mjs"` APPEARS IN ELEVEN PLACES AND MODES HAS NEVER EXISTED HERE. ***
 * Nine are static and die at load with a SyntaxError -- seventeen gates, because five of the nine are modules
 * other gates import and the crash cascades. Two are DESTRUCTURED DYNAMIC imports and bind `undefined` in
 * silence: ai-bridge/fingerprintBridge.js (POST /jobs/add, on the live server) and tools/roundhouse/runJobs.mjs
 * (the peer's re-validation). THE LOUD FAILURE WAS THE SAFE ONE.
 *
 * *** AND THE ONE-WORD FIX IS A TRAP FOR TWO REASONS, NOT ONE. *** (1) The recorded one: aliasing MODES to
 * CANDIDATE_MODES makes every importer PASS while sweeping nothing, which v3177 established is strictly worse
 * than the crash because a crash is visible. (2) The unrecorded one: THEY ARE NOT THE SAME SHAPE. CANDIDATE_MODES
 * is an ARRAY of guessable mode names; every caller uses MODES as a MAP -- `MODES[name]`, `MODES.lens.includes(...)`,
 * `validateSpec(spec, MODES)` which does `modes[spec.device]`. An array indexed by a device name yields undefined
 * for every device, so the alias would not merely under-report, it would be a type error in nine files.
 *
 * SO THE TABLE IS DERIVED, NOT LISTED. A hand-written map would be a SECOND DECLARATION of which modes exist,
 * and the whole v3189-v3194 arc exists because the first one was a guess that had gone stale ("six of seven
 * devices declare one mode" was an artefact of the candidate list). modesOf already answers this per device.
 *
 * IT REFUSES A ZERO-DEVICE TABLE rather than returning {}. An empty map makes every caller sweep nothing and
 * report a clean pass over no work -- v3177's "a system whose checks pass because it does nothing", which is the
 * exact failure the lazy repair of this bug would have produced.
 */
export async function deviceModeTable(D, checkMode) {
    if (!D) D = await import("./devices.mjs");
    if (!checkMode) ({ checkMode } = await import("./knobGate.mjs"));
    const census = await modeCensus(D, checkMode);
    if (!census.devices) throw new Error("deviceModeTable: the device registry answered with ZERO devices -- refusing to return an empty mode table, because every caller would then sweep nothing and report a clean pass over no work");
    const table = {};
    for (const r of census.rows) if (r.declared && r.declared.length) table[r.name] = r.declared.slice();
    if (!Object.keys(table).length) throw new Error("deviceModeTable: " + census.devices + " devices and NOT ONE declared a mode -- refusing to return an empty table");
    return table;
}
