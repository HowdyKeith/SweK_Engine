"use strict";
/**
 * WHAT EVERY GATE IN THE RED REGISTER ACTUALLY SAYS (v4380), frozen so a fast gate can hold the register to it.
 *
 * The register in redCensus.mjs records a failing LINE for each standing red. Nothing checked that the line was
 * still the line, and twice in one session an entry turned out to describe a red that no longer existed while the
 * real one went unread. This is the observed side: run at the version below, one row per register entry, carrying
 * the exit code, EVERY failing line (a gate with several is common, and asking only about the first reports drift
 * where there is none), and whether the gate printed them to STDERR -- which one of them does, invisibly to anything
 * reading stdout. Rewritten by tools/ship/freezeRegisterAudit.mjs.
 */
export const REGISTER_AUDIT = Object.freeze({
 "at": "v4622",
 "capMs": 120000,
 "rows": [
  {
   "gate": "tools/ship/shaderRefs-selfcheck.mjs",
   "exit": "timeout",
   "ms": 120151,
   "first": "",
   "all": [],
   "count": 0,
   "printedBeforeTheCap": [],
   "onStderr": false
  },
  {
   "gate": "tools/ship/sweepCoverage-selfcheck.mjs",
   "exit": 1,
   "ms": 2664,
   "first": "!! the straddler lists are a RECORD now, not an exemption: nothing needs naming to keep this green   172 measured under budget by the rotation, 90 of them over budget in the timings now, 90 lost and 90 reverted -- with NO gate excluded by name. The 5 entries in the v4535 list survive because they carry the serial readings that show the same file taking 2,638 and 4,026 ms on the same box a day apart, which is the evidence the calibration round needs and not something to delete.",
   "all": [
    "!! the straddler lists are a RECORD now, not an exemption: nothing needs naming to keep this green   172 measured under budget by the rotation, 90 of them over budget in the timings now, 90 lost and 90 reverted -- with NO gate excluded by name. The 5 entries in the v4535 list survive because they carry the serial readings that show the same file taking 2,638 and 4,026 ms on the same box a day apart, which is the evidence the calibration round needs and not something to delete.",
    "!! *** WHAT THE ROTATION MEASURED UNDER BUDGET IS STILL UNDER BUDGET IN THE TIMINGS ***   90 LOST: hunt-transfer-selfcheck.mjs 2662 -> 3763, memory-selfcheck.mjs 1129 -> 3314, maze-walker-selfcheck.mjs 1184 -> 4617, es-arena-selfcheck.mjs 2343 -> 5280",
    "...and none of them carries the pre-v4408 stamp, which is the fingerprint of a REPLACED file   90 entries the rotation stamped now read \"unknown -- before v4408\"",
    "!! ...and the gate filed AT THE CAP that runs in 51 ms is back under the ship-time budget   placementRender-selfcheck.mjs reads 20125 ms now against the 20125 ms that exiled it -- 395x. It is the only one of the 140 to rejoin the sweep; the other 34 that beat the old cap are back in the over-budget pool, where the rotation can reach them."
   ],
   "count": 4,
   "onStderr": false
  }
 ]
});
