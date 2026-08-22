// WebGLEngine/tools/roundhouse/runClass.mjs -- v3029
//
// IS THIS RUN COMPARABLE, OR ONLY WATCHABLE?
//
// Keith's call: a suite taken while the phone was serving its own live view is for DIAGNOSTICS and MONITORING,
// not for comparison. That is the right call -- an HTTP server sharing a phone with 15-25 minutes of lattice
// work changes the timings, and the device may throttle.
//
// THIS FILE EXISTS SO IT IS NOT A CONVENTION. A convention is a rule that holds until the day somebody is in a
// hurry, and the whole point of this project is that the refusal lives in the data rather than in the discipline
// of whoever is reading it. The same move fleetBench makes when it returns INCOMPARABLE across engine versions.
//
// THREE CLASSES, and the third is the one that matters:
//   comparable    nothing else was running. Safe to set beside another comparable run.
//   diagnostic    the phone was serving. The measurement is REAL -- it is not invalid, it happened -- but it
//                 cannot be placed next to a quiet run without inventing a difference.
//   unclassified  older transcript, or the marker could not be read. NOT the same as comparable: a transcript
//                 that predates this field cannot promise anything about what else was running, and treating
//                 silence as "nothing" is exactly the assumption this file exists to refuse.
"use strict";

export const RUN_CLASS = { COMPARABLE: "comparable", DIAGNOSTIC: "diagnostic", UNCLASSIFIED: "unclassified" };

/** Classify a transcript. Reads the field if present, falls back to the marker, never guesses "comparable". */
export function classOf(transcript) {
    const t = transcript || {};
    if (t.runClass && Object.values(RUN_CLASS).includes(t.runClass)) return t.runClass;
    if (t.servedWhileRunning === true) return RUN_CLASS.DIAGNOSTIC;
    if (t.servedWhileRunning === false) return RUN_CLASS.COMPARABLE;
    return RUN_CLASS.UNCLASSIFIED;
}

/**
 * Split a set of transcripts for a comparison. The caller gets what it may compare AND what it may not, so an
 * excluded run is VISIBLE rather than silently absent -- a shorter table with no explanation is how someone
 * concludes a phone stopped reporting.
 */
export function partition(transcripts) {
    const rows = (transcripts || []).map((t) => ({ t, cls: classOf(t) }));
    const comparable = rows.filter((r) => r.cls === RUN_CLASS.COMPARABLE).map((r) => r.t);
    const excluded = rows.filter((r) => r.cls !== RUN_CLASS.COMPARABLE);
    return {
        comparable, excluded,
        diagnostic: excluded.filter((r) => r.cls === RUN_CLASS.DIAGNOSTIC).length,
        unclassified: excluded.filter((r) => r.cls === RUN_CLASS.UNCLASSIFIED).length,
        why: excluded.length
            ? excluded.length + " run(s) held out of the comparison: " +
              excluded.filter((r) => r.cls === RUN_CLASS.DIAGNOSTIC).length + " taken while the phone was serving (real, but not comparable), " +
              excluded.filter((r) => r.cls === RUN_CLASS.UNCLASSIFIED).length + " that cannot say what else was running"
            : "every run is comparable",
    };
}

/** A diagnostic run is still worth reading -- it is excluded from COMPARISON, not from existence. */
export function isReadable() { return true; }
