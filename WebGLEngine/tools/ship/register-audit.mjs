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
   "gate": "tools/ship/backendParity-selfcheck.mjs",
   "exit": 1,
   "ms": 417,
   "first": "*** and BOTH stays well under the inversion line: twenty dual shader modules is where an IR would have paid ***   20 modules of 23 dual files, 23 of 158 GLSL-bearing -- 14.6% (the tenth-of-GLSL line of v4270 was crossed at v4473 and is reported, not asserted)",
   "all": [
    "*** and BOTH stays well under the inversion line: twenty dual shader modules is where an IR would have paid ***   20 modules of 23 dual files, 23 of 158 GLSL-bearing -- 14.6% (the tenth-of-GLSL line of v4270 was crossed at v4473 and is reported, not asserted)",
    "-- 1 check(s)"
   ],
   "count": 2,
   "onStderr": false
  },
  {
   "gate": "tools/ship/windowsImport-selfcheck.mjs",
   "exit": 1,
   "ms": 618,
   "first": "!! NO dynamic import is given a raw filesystem path   WOULD CRASH ON WINDOWS: tools/ship/redCensus.mjs -> import(path.join(ENG, \\\"rig/templates/kaijuBiped.js\\\") | tools/ship/register-audit.mjs -> import(path.join(ENG, \\\"rig/templates/kaijuBiped.js\\\") | tools/ship/register-audit.mjs -> import(path.join(ENG, \\\"rig/templates/kaijuBiped.js\\\") | tools/ship/trellisAutoRig-selfcheck.mjs -> import(path.join(ENG, \"rig/templates/kaijuBiped.js\"))",
   "all": [
    "!! NO dynamic import is given a raw filesystem path   WOULD CRASH ON WINDOWS: tools/ship/redCensus.mjs -> import(path.join(ENG, \\\"rig/templates/kaijuBiped.js\\\") | tools/ship/register-audit.mjs -> import(path.join(ENG, \\\"rig/templates/kaijuBiped.js\\\") | tools/ship/register-audit.mjs -> import(path.join(ENG, \\\"rig/templates/kaijuBiped.js\\\") | tools/ship/trellisAutoRig-selfcheck.mjs -> import(path.join(ENG, \"rig/templates/kaijuBiped.js\"))"
   ],
   "count": 1,
   "onStderr": false
  },
  {
   "gate": "tools/ship/definitionGates-selfcheck.mjs",
   "exit": 1,
   "ms": 493,
   "first": "!! no NEW exported symbol under physics/ has appeared without its gate naming it   GREW to 79: physics/apsidalKnob.mjs:apocentre, physics/apsidalKnob.mjs:measure, physics/apsidalKnob.mjs:adjudicateWith, physics/character/terrainWalk.mjs:functionGround, physics/character/terrainWalk.mjs:autoGround, physics/character/terrainWalk.mjs:projectOnPlane ...",
   "all": [
    "!! no NEW exported symbol under physics/ has appeared without its gate naming it   GREW to 79: physics/apsidalKnob.mjs:apocentre, physics/apsidalKnob.mjs:measure, physics/apsidalKnob.mjs:adjudicateWith, physics/character/terrainWalk.mjs:functionGround, physics/character/terrainWalk.mjs:autoGround, physics/character/terrainWalk.mjs:projectOnPlane ...",
    "!! no NEW exported symbol ANYWHERE IN THE TREE has appeared without its gate naming it   GREW to 349: ai-bridge/chunkVerify.mjs:verifiedPrefix, ai-bridge/chunkVerify.mjs:resumePlan, ai-bridge/chunkVerify.mjs:spliceRanges, ai-bridge/chunkVerify.mjs:chunkAudit, ai-bridge/chunkVerify.mjs:resumeRanges, ai-bridge/deviceWorker.mjs:offThreadDevice ...",
    "!! *** no NEW exported symbol OF ANY SHAPE has appeared without its gate naming it ***   GREW to 678: ai-bridge/catalogSnapshot.mjs:SNAPSHOT_PATH, ai-bridge/chunkVerify.mjs:verifiedPrefix, ai-bridge/chunkVerify.mjs:resumePlan, ai-bridge/chunkVerify.mjs:spliceRanges, ai-bridge/chunkVerify.mjs:chunkAudit, ai-bridge/chunkVerify.mjs:resumeRanges ..."
   ],
   "count": 3,
   "onStderr": false
  },
  {
   "gate": "tools/ship/pageSections-selfcheck.mjs",
   "exit": 1,
   "ms": 984,
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
   "ms": 102,
   "first": "!! going over Keith's cap is DETECTED   a drawer of 25 is the flat row with a lid on it (v2513), and *** A CHECKBOX IS A MUCH FASTER WAY TO MAKE ONE THAN EDITING A REGISTRY *** -- so the surface that made it easy owes the check.",
   "all": [
    "!! going over Keith's cap is DETECTED   a drawer of 25 is the flat row with a lid on it (v2513), and *** A CHECKBOX IS A MUCH FASTER WAY TO MAKE ONE THAN EDITING A REGISTRY *** -- so the surface that made it easy owes the check.",
    "the cap is measured against the RESOLVED result, not against SECTIONS   with no overrides nothing is over, because SECTIONS is already within the rule -- so a non-empty report is always about a decision made HERE"
   ],
   "count": 2,
   "onStderr": false
  },
  {
   "gate": "tools/ship/runtimeGap-selfcheck.mjs",
   "exit": 1,
   "ms": 1623,
   "first": "...and the headline survives it: a 2-file distortion in rows of 21 to 3,588, and threads still rank at the bottom   with this round: threads 23 against WebAssembly 23, rank 11 on the stable sort. Without it: 22 against 21. At v4462 the two files made a tie; at the v4526 merge they break one",
   "all": [
    "...and the headline survives it: a 2-file distortion in rows of 21 to 3,588, and threads still rank at the bottom   with this round: threads 23 against WebAssembly 23, rank 11 on the stable sort. Without it: 22 against 21. At v4462 the two files made a tie; at the v4526 merge they break one"
   ],
   "count": 1,
   "onStderr": false
  }
 ]
});
