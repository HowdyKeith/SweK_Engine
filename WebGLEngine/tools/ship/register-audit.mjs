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
   "ms": 120148,
   "first": "",
   "all": [],
   "count": 0,
   "printedBeforeTheCap": [],
   "onStderr": false
  },
  {
   "gate": "tools/ship/sweepCoverage-selfcheck.mjs",
   "exit": 1,
   "ms": 2372,
   "first": "!! a returnee that went back over the budget on a later box is NAMED with its serial readings, and is live over   meshLine-selfcheck.mjs 3105 ms on file, 4379 ms recorded; traderGraph-selfcheck.mjs 2397 ms on file, 3008 ms recorded; wgslSpec-selfcheck.mjs 2767 ms on file, 3737 ms recorded -- justified by the RECORDED readings rather than by the filed one, which says which ritual step ran last; see the note above the v4476 row",
   "all": [
    "!! a returnee that went back over the budget on a later box is NAMED with its serial readings, and is live over   meshLine-selfcheck.mjs 3105 ms on file, 4379 ms recorded; traderGraph-selfcheck.mjs 2397 ms on file, 3008 ms recorded; wgslSpec-selfcheck.mjs 2767 ms on file, 3737 ms recorded -- justified by the RECORDED readings rather than by the filed one, which says which ritual step ran last; see the note above the v4476 row",
    "!! the straddler lists are a RECORD now, not an exemption: nothing needs naming to keep this green   159 measured under budget by the rotation, 91 of them over budget in the timings now, 90 lost and 91 reverted -- with NO gate excluded by name. The 5 entries in the v4535 list survive because they carry the serial readings that show the same file taking 2,638 and 4,026 ms on the same box a day apart, which is the evidence the calibration round needs and not something to delete.",
    "!! *** WHAT THE ROTATION MEASURED UNDER BUDGET IS STILL UNDER BUDGET IN THE TIMINGS ***   90 LOST: hunt-transfer-selfcheck.mjs 2662 -> 3763, memory-selfcheck.mjs 1129 -> 3314, maze-walker-selfcheck.mjs 1184 -> 4617, es-arena-selfcheck.mjs 2343 -> 5280",
    "...and none of them carries the pre-v4408 stamp, which is the fingerprint of a REPLACED file   90 entries the rotation stamped now read \"unknown -- before v4408\"",
    "!! ...and the gate filed AT THE CAP that runs in 51 ms is back under the ship-time budget   placementRender-selfcheck.mjs reads 20125 ms now against the 20125 ms that exiled it -- 395x. It is the only one of the 140 to rejoin the sweep; the other 34 that beat the old cap are back in the over-budget pool, where the rotation can reach them."
   ],
   "count": 5,
   "onStderr": false
  },
  {
   "gate": "tools/ship/backendParity-selfcheck.mjs",
   "exit": 1,
   "ms": 425,
   "first": "wgslBearing matches the recorded baseline   measured 97, recorded 87",
   "all": [
    "wgslBearing matches the recorded baseline   measured 97, recorded 87",
    "wgslOnly matches the recorded baseline   measured 74, recorded 64",
    "*** and BOTH stays well under the inversion line: twenty dual shader modules is where an IR would have paid ***   20 modules of 23 dual files, 23 of 158 GLSL-bearing -- 14.6% (the tenth-of-GLSL line of v4270 was crossed at v4473 and is reported, not asserted)",
    "-- 3 check(s)"
   ],
   "count": 4,
   "onStderr": false
  },
  {
   "gate": "tools/ship/windowsImport-selfcheck.mjs",
   "exit": 1,
   "ms": 652,
   "first": "!! NO dynamic import is given a raw filesystem path   WOULD CRASH ON WINDOWS: tools/ship/kernelReach.mjs -> import(path.join(ENG, f)) | tools/ship/redCensus.mjs -> import(path.join(ENG, \\\"rig/templates/kaijuBiped.js\\\") | tools/ship/register-audit.mjs -> import(path.join(ENG, f)) | tools/ship/register-audit.mjs -> import(path.join(ENG, f))",
   "all": [
    "!! NO dynamic import is given a raw filesystem path   WOULD CRASH ON WINDOWS: tools/ship/kernelReach.mjs -> import(path.join(ENG, f)) | tools/ship/redCensus.mjs -> import(path.join(ENG, \\\"rig/templates/kaijuBiped.js\\\") | tools/ship/register-audit.mjs -> import(path.join(ENG, f)) | tools/ship/register-audit.mjs -> import(path.join(ENG, f))"
   ],
   "count": 1,
   "onStderr": false
  },
  {
   "gate": "tools/ship/definitionGates-selfcheck.mjs",
   "exit": 1,
   "ms": 1861,
   "first": "!! no NEW exported symbol under physics/ has appeared without its gate naming it   GREW to 79: physics/apsidalKnob.mjs:apocentre, physics/apsidalKnob.mjs:measure, physics/apsidalKnob.mjs:adjudicateWith, physics/character/terrainWalk.mjs:functionGround, physics/character/terrainWalk.mjs:autoGround, physics/character/terrainWalk.mjs:projectOnPlane ...",
   "all": [
    "!! no NEW exported symbol under physics/ has appeared without its gate naming it   GREW to 79: physics/apsidalKnob.mjs:apocentre, physics/apsidalKnob.mjs:measure, physics/apsidalKnob.mjs:adjudicateWith, physics/character/terrainWalk.mjs:functionGround, physics/character/terrainWalk.mjs:autoGround, physics/character/terrainWalk.mjs:projectOnPlane ...",
    "!! no NEW exported symbol ANYWHERE IN THE TREE has appeared without its gate naming it   GREW to 362: ai-bridge/chunkVerify.mjs:verifiedPrefix, ai-bridge/chunkVerify.mjs:resumePlan, ai-bridge/chunkVerify.mjs:spliceRanges, ai-bridge/chunkVerify.mjs:chunkAudit, ai-bridge/chunkVerify.mjs:resumeRanges, ai-bridge/deviceWorker.mjs:offThreadDevice ...",
    "!! *** no NEW exported symbol OF ANY SHAPE has appeared without its gate naming it ***   GREW to 703: ai-bridge/catalogSnapshot.mjs:SNAPSHOT_PATH, ai-bridge/chunkVerify.mjs:verifiedPrefix, ai-bridge/chunkVerify.mjs:resumePlan, ai-bridge/chunkVerify.mjs:spliceRanges, ai-bridge/chunkVerify.mjs:chunkAudit, ai-bridge/chunkVerify.mjs:resumeRanges ...",
    "!! *** no NEW exported symbol is unmentioned by EVERY gate that imports its module ***   GREW to 533: ai-bridge/catalogSnapshot.mjs:SNAPSHOT_PATH, ai-bridge/chunkVerify.mjs:verifiedPrefix, ai-bridge/chunkVerify.mjs:resumePlan, ai-bridge/chunkVerify.mjs:spliceRanges, ai-bridge/chunkVerify.mjs:chunkAudit, ai-bridge/chunkVerify.mjs:resumeRanges ...",
    "and the wider rule is not a way out of the three ratchets above -- two of them stay red under it, so this is a correction and not an amnesty   physics 51 against 68, tree-wide narrow 262 against 332"
   ],
   "count": 5,
   "onStderr": false
  },
  {
   "gate": "tools/ship/pageSections-selfcheck.mjs",
   "exit": 1,
   "ms": 958,
   "first": "!! no drawer holds more than 15 pages   biggest: 16. A DRAWER OF 25 IS THE FLAT ROW AGAIN WITH A LID ON IT -- which is why the 25 instruments were split three ways rather than filed under one Physics Lab chip. OVER: systools=16",
   "all": [
    "!! no drawer holds more than 15 pages   biggest: 16. A DRAWER OF 25 IS THE FLAT ROW AGAIN WITH A LID ON IT -- which is why the 25 instruments were split three ways rather than filed under one Physics Lab chip. OVER: systools=16"
   ],
   "count": 1,
   "onStderr": false
  },
  {
   "gate": "tools/ship/pagePlacements-selfcheck.mjs",
   "exit": 1,
   "ms": 105,
   "first": "!! going over Keith's cap is DETECTED   a drawer of 25 is the flat row with a lid on it (v2513), and *** A CHECKBOX IS A MUCH FASTER WAY TO MAKE ONE THAN EDITING A REGISTRY *** -- so the surface that made it easy owes the check.",
   "all": [
    "!! going over Keith's cap is DETECTED   a drawer of 25 is the flat row with a lid on it (v2513), and *** A CHECKBOX IS A MUCH FASTER WAY TO MAKE ONE THAN EDITING A REGISTRY *** -- so the surface that made it easy owes the check.",
    "the cap is measured against the RESOLVED result, not against SECTIONS   with no overrides nothing is over, because SECTIONS is already within the rule -- so a non-empty report is always about a decision made HERE"
   ],
   "count": 2,
   "onStderr": false
  }
 ]
});
