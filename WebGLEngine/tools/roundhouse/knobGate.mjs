// WebGLEngine/tools/roundhouse/knobGate.mjs -- v3129
//
// THE AGENT COULD ALWAYS TURN THE KNOBS. NOTHING EVER TOLD IT THEY EXISTED.
//
// deviceBind has always done `hyp = device.defaults(hyp)` and then `device.build(hyp, base)`, so a hypothesis
// carrying config REACHES THE SIMULATION. The pipe was there the whole time. But every DEMO_HYP is
// { mode, claim } with no config, and the proposer's prompt is built from `observables` alone -- THE LIST OF
// THINGS IT MAY CLAIM ABOUT, never the list of things it may CHANGE. So the roundhouse physics agent has run
// every instrument at its factory defaults since the day it was written, not because it was blocked but
// because nobody mentioned the dial.
//
// *** AND THAT COLLIDES WITH THE ENTIRE CORROBORATION ARC. *** v3081-v3105 built knob registers, separated
// nuisance knobs from refinement knobs, and attached assumptions to OPERATING POINTS. v3101 then measured that
// lens.deflect's DEFAULT operating point is exactly the one where its answer key does not apply -- b=10 sits in
// the mid band, and the 4M/b key needs b=60. THE AGENT COULD ONLY EVER RUN THE ONE PLACE THE INSTRUMENT IS
// UNSOUND, AND HAD NO WAY TO WALK TO WHERE IT ISN'T.
//
// *** THE SECOND FINDING, MEASURED: AN UNDECLARED KNOB IS KEPT AND IGNORED. *** defaults({config:{wibble:999}})
// returns wibble untouched; the sim never reads it; nothing raises. A model that sets a knob it invented gets a
// clean run and a number, AND ATTRIBUTES THAT NUMBER TO A CHANGE THAT NEVER HAPPENED. Silently dropping it
// would be no better -- the fault is not where the value goes, it is that THE AGENT IS NEVER TOLD ITS
// INSTRUCTION DID NOTHING.
//
// THE REGISTER IS DERIVED, NEVER TYPED. device.defaults({}) returns the full config a device accepts, so the
// device declares its own knobs by construction and this file maintains no list. A typed list is a second
// definition that drifts the first time somebody adds a knob -- and this tree has paid for that shape enough
// times to know better.

/** Every knob a device accepts in a given mode, with the value it defaults to. Derived from the device itself. */
export function declaredKnobs(device, mode) {
    if (!device || typeof device.defaults !== "function") return null;   // a device with no defaults declares nothing
    const d = device.defaults(mode ? { mode } : {});
    const cfg = (d && d.config) || {};
    return { mode: (d && d.mode) || null, knobs: Object.keys(cfg).sort(), defaults: cfg };
}

/**
 * Check a proposed hypothesis against what the device actually declares.
 *
 * @returns { ok, unknown, moved, register }
 *   unknown -- knobs the device does not declare. NAMED, so the agent learns its instruction did nothing.
 *   moved   -- knobs genuinely changed from the default, which is what makes the operating point NON-DEFAULT.
 */
export function checkKnobs(device, hyp) {
    const reg = declaredKnobs(device, hyp && hyp.mode);
    if (!reg) return { ok: true, unknown: [], moved: [], register: null, why: "device declares no knobs" };
    const proposed = (hyp && hyp.config) || {};
    const unknown = [], moved = [];
    for (const k of Object.keys(proposed)) {
        if (!(k in reg.defaults)) { unknown.push(k); continue; }
        // A knob SET TO ITS OWN DEFAULT has not moved. Counting it as movement would make every hypothesis
        // look like an experiment, and "did the agent change the operating point" would stop being answerable.
        if (proposed[k] !== reg.defaults[k]) moved.push({ knob: k, from: reg.defaults[k], to: proposed[k] });
    }
    return {
        ok: unknown.length === 0,
        unknown, moved, register: reg,
        why: unknown.length
            ? "device '" + (device.name || "?") + "' does not declare: " + unknown.join(", ") +
              ". It declares: " + reg.knobs.join(", ")
            : null,
    };
}

/**
 * The line a PROPOSER needs in its prompt. Without this the model has no idea a dial exists.
 *
 * NAMES THE DEFAULT ALONGSIDE EACH KNOB, because "you may set b" is useless and "b is 10 by default" tells the
 * model both what to change and what it is changing FROM -- which is the difference between an experiment and
 * a guess.
 */
export function knobPromptLine(device, mode) {
    const reg = declaredKnobs(device, mode);
    if (!reg || !reg.knobs.length) return "";
    const pairs = reg.knobs.map((k) => k + "=" + JSON.stringify(reg.defaults[k]));
    return "You may also set config knobs to move the operating point. This device declares exactly these, " +
           "shown at their defaults: " + pairs.join(", ") + ". SETTING A KNOB THIS DEVICE DOES NOT DECLARE IS " +
           "AN ERROR, NOT A NO-OP -- the run will be refused rather than silently ignoring it.";
}

/**
 * v3144 -- IS THIS MODE DECLARED? MEASURED: 26 OF 26 DEVICES SILENTLY DEFAULT AN UNKNOWN ONE.
 *
 * thermal.build({mode:"xyzzy"}) returns BIT-IDENTICAL results to mode "diffuse", and so does every other
 * device in the registry. Nothing throws, nothing warns, nothing in the output names the mode that ran. So an
 * agent asking thermal for a Rayleigh-Benard run gets a PURE DIFFUSION ANSWER and believes it measured
 * convection.
 *
 * *** THAT IS WORSE THAN THE UNDECLARED KNOB v3129 FIXED, because a MODE SELECTS WHICH PHYSICS RUNS. *** A
 * wrong knob perturbs an experiment; a wrong mode runs a different experiment under the requested name.
 *
 * DERIVED, NOT TYPED, by the same trick knobGate uses for the register: defaults() CLAMPS a sloppy proposal,
 * so a mode it hands back unchanged is DECLARED and one it replaces is NOT. The device is the authority on its
 * own vocabulary and no list here can drift from it.
 */
export function checkMode(device, mode) {
    if (!device || typeof device.defaults !== "function") return { ok: true, why: "device declares no modes" };
    if (mode === undefined || mode === null) return { ok: true, why: "no mode requested -- the default is the device's to choose" };
    // v3420 -- *** THIS THREW ON EVERY BEAM PROBE AND deviceModes-selfcheck HAD BEEN RED FOR IT, UNNOTICED,
    // because verify does not carry that gate. Confirmed on the PRISTINE v3419 extract before anything this
    // round touched it. *** The cause is TWO DECLARATIONS OF HOW A DEVICE REFUSES A MODE: most clamp a sloppy
    // proposal back to their default, and beamBind returns NULL. checkMode was written for the first only, so
    // `defaults({mode}).mode` dereferenced null and the whole gate died before printing a line.
    //
    // A NULL IS THE STRONGER ANSWER, NOT A BROKEN ONE: a device that returns nothing has REFUSED rather than
    // silently running different physics, which is the exact outcome this function exists to catch. So it is
    // read as a refusal and reported as one -- and the gate now RUNS instead of crashing, which is the whole
    // difference between a check that fails and a check that never happened (NEVER RUN IS DISTINCT FROM PASS).
    const kept = (device.defaults({ mode }) || {}).mode;
    if (kept === mode) return { ok: true, declared: kept, why: null };
    if (kept === undefined) {
        return {
            ok: false, declared: null, requested: mode,
            why: "device '" + (device.registryName || device.name || "?") + "' REFUSED mode '" + mode +
                 "' by returning no defaults at all. That is a refusal rather than a silent substitution, which " +
                 "is the better failure -- but it is still an undeclared mode and the caller must not proceed.",
        };
    }
    return {
        ok: false, declared: kept, requested: mode,
        why: "device '" + (device.registryName || device.name || "?") + "' does not declare mode '" + mode +
             "' -- it silently ran '" + kept + "' instead. A MODE SELECTS WHICH PHYSICS RUNS, so this is not a " +
             "near miss: the answer describes a different experiment under the requested name",
    };
}
