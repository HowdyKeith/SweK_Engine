// WebGLEngine/tools/roundhouse/soundness.mjs -- v3130
//
// NOW THAT THE AGENT CAN MOVE THE OPERATING POINT, SOMETHING HAS TO TELL IT WHEN IT HAS MOVED SOMEWHERE THE
// INSTRUMENT DOES NOT WORK.
//
// v3100 declared LAB_ASSUMPTIONS -- conditions that travel with a result, each a PREDICATE over the config.
// v3101 added the third verdict, "UNSOUND AT THIS OPERATING POINT", distinct from NOT CORROBORATED: the four
// criteria did not fail, the OPERATING POINT did. v3129 finally let the agent turn the knobs. THOSE THREE
// PIECES HAVE NEVER MET, and until they do, turning the dial is possible without being safe.
//
// *** AND THE FIRST THING THIS SAYS IS UNCOMFORTABLE: THE AGENT'S DEFAULT RUN OF lens.deflect IS UNSOUND. ***
// v3101 measured it -- b=10 puts the ray in the mid band where the 4M/b key does not apply, and b=60 is where
// deflectionMeasured is CORROBORATED. The agent has been running the unsound point since it was written, and
// now the run says so instead of returning a number that looks like every other number.
//
// *** THE THIRD STATE IS THE ONE THAT MATTERS MOST: UNDECLARED IS NOT SOUND. ***
// LAB_ASSUMPTIONS covers three device.mode pairs out of a registry of 27 devices. For everything else nobody
// has said what the instrument needs, and "nobody has checked" MUST NOT render as "checked and fine" -- that
// is v3101's rule (soundAtPoint === null is not a pass) and it is the same law this project has applied to a
// lost face, a silent worker, an unread control and an empty population field. A verdict of UNDECLARED is a
// TRUE statement about the state of the evidence; a verdict of SOUND there would be a lie.

import { LAB_ASSUMPTIONS } from "./assumptions.mjs";

export const VERDICTS = ["sound", "unsound", "undeclared"];

/** device.mode is the key LAB_ASSUMPTIONS is written against. */
export function assumptionKey(deviceName, mode) {
    return String(deviceName || "") + "." + String(mode || "");
}

/**
 * Evaluate every declared assumption at THIS operating point.
 *
 * @returns { verdict, key, failed, held, why }
 *   failed -- [{ id, why }] for each condition the config breaks. NAMED, because "unsound" alone sends nobody
 *             anywhere and "b/bCrit must exceed 10" sends them to the knob.
 */
export function soundnessAt(deviceName, mode, config) {
    const key = assumptionKey(deviceName, mode);
    const declared = LAB_ASSUMPTIONS[key];
    if (!Array.isArray(declared) || !declared.length) {
        return {
            verdict: "undeclared", key, failed: [], held: [],
            // NOT "sound". Nobody has said what this instrument needs at a moved point, and reporting that as
            // fine would be the exact substitution this project keeps finding.
            why: "no assumptions are declared for " + key + " -- nobody has said what this instrument needs, " +
                 "which is NOT the same as it being fine here",
        };
    }
    const cfg = config || {};
    const failed = [], held = [];
    for (const a of declared) {
        let passes = false, threw = null;
        // A PREDICATE THAT THROWS IS A FAILED ASSUMPTION, NOT A PASSING ONE. holds() reads config fields that
        // may be absent at a moved operating point, and letting an exception read as "true" would turn the one
        // safety check into a rubber stamp exactly when the config is strangest.
        try { passes = !!a.holds(cfg); } catch (e) { threw = String((e && e.message) || e); }
        if (passes) held.push({ id: a.id });
        else failed.push({ id: a.id, why: a.why, threw });
    }
    return {
        verdict: failed.length ? "unsound" : "sound", key, failed, held,
        why: failed.length
            ? "UNSOUND AT THIS OPERATING POINT -- " + failed.map((f) => f.id).join(", ")
            : null,
    };
}

/** One line a person reads. Each verdict says something DIFFERENT, or the distinction was pointless. */
export function soundnessLine(s) {
    if (s.verdict === "sound") return "sound at this operating point (" + s.held.map((h) => h.id).join(", ") + " hold)";
    if (s.verdict === "unsound") {
        return "UNSOUND AT THIS OPERATING POINT: " + s.failed.map((f) => f.id + " -- " + f.why).join(" | ");
    }
    return "SOUNDNESS UNDECLARED for " + s.key + " -- " + s.why;
}
