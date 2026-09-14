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
 "at": "v4535",
 "capMs": 120000,
 "rows": [
  {
   "gate": "tools/ship/definitionGates-selfcheck.mjs",
   "exit": 1,
   "ms": 503,
   "first": "!! no NEW exported symbol under physics/ has appeared without its gate naming it   GREW to 68: physics/character/terrainWalk.mjs:functionGround, physics/character/terrainWalk.mjs:autoGround, physics/character/terrainWalk.mjs:projectOnPlane, physics/character/terrainWalk.mjs:reportLines, physics/crypto/secp256k1.mjs:pointDouble, physics/mesh/meshCSG.mjs:flatness ...",
   "all": [
    "!! no NEW exported symbol under physics/ has appeared without its gate naming it   GREW to 68: physics/character/terrainWalk.mjs:functionGround, physics/character/terrainWalk.mjs:autoGround, physics/character/terrainWalk.mjs:projectOnPlane, physics/character/terrainWalk.mjs:reportLines, physics/crypto/secp256k1.mjs:pointDouble, physics/mesh/meshCSG.mjs:flatness ...",
    "!! no NEW exported symbol ANYWHERE IN THE TREE has appeared without its gate naming it   GREW to 332: ai-bridge/chunkVerify.mjs:verifiedPrefix, ai-bridge/chunkVerify.mjs:resumePlan, ai-bridge/chunkVerify.mjs:spliceRanges, ai-bridge/chunkVerify.mjs:chunkAudit, ai-bridge/chunkVerify.mjs:resumeRanges, ai-bridge/deviceWorker.mjs:offThreadDevice ...",
    "!! *** no NEW exported symbol OF ANY SHAPE has appeared without its gate naming it ***   GREW to 639: ai-bridge/catalogSnapshot.mjs:SNAPSHOT_PATH, ai-bridge/chunkVerify.mjs:verifiedPrefix, ai-bridge/chunkVerify.mjs:resumePlan, ai-bridge/chunkVerify.mjs:spliceRanges, ai-bridge/chunkVerify.mjs:chunkAudit, ai-bridge/chunkVerify.mjs:resumeRanges ..."
   ],
   "count": 3,
   "onStderr": false
  },
  {
   "gate": "tools/ship/registerResidue-selfcheck.mjs",
   "exit": 1,
   "ms": 1364,
   "first": "!! *** the residue may only SHRINK -- a page linked but neither placed nor excused fails on arrival ***   62 against a ceiling of 41. *** UNPLACED's OWN COMMENT SAYS \"AN UNPLACED PAGE AND A PAGE NOBODY GOT TO LOOK THE SAME\", AND UNTIL THIS LINE EXISTED NOTHING COMPARED THE REGISTER TO THE PAGES ACTUALLY OUTSIDE THE SECTIONS -- so it could not tell them apart, which is the one thing it exists to do. *** Each of the 62 is a judgement (a section, or an exemption with a sentence) and it is Keith's, one at a time.",
   "all": [
    "!! *** the residue may only SHRINK -- a page linked but neither placed nor excused fails on arrival ***   62 against a ceiling of 41. *** UNPLACED's OWN COMMENT SAYS \"AN UNPLACED PAGE AND A PAGE NOBODY GOT TO LOOK THE SAME\", AND UNTIL THIS LINE EXISTED NOTHING COMPARED THE REGISTER TO THE PAGES ACTUALLY OUTSIDE THE SECTIONS -- so it could not tell them apart, which is the one thing it exists to do. *** Each of the 62 is a judgement (a section, or an exemption with a sentence) and it is Keith's, one at a time."
   ],
   "count": 1,
   "onStderr": false
  },
  {
   "gate": "tools/ship/shaderRefs-selfcheck.mjs",
   "exit": "timeout",
   "ms": 120077,
   "first": "",
   "all": [],
   "count": 0,
   "printedBeforeTheCap": [],
   "onStderr": false
  },
  {
   "gate": "tools/ship/tslSource-selfcheck.mjs",
   "exit": 1,
   "ms": 1785,
   "first": "webgl2: and three's own linear render, row-mirrored, agrees with the device to a byte or so (two samplers, one filter)   3971/4096 identical, worst 127",
   "all": [
    "webgl2: and three's own linear render, row-mirrored, agrees with the device to a byte or so (two samplers, one filter)   3971/4096 identical, worst 127",
    "-- 1 check(s)"
   ],
   "count": 2,
   "onStderr": false
  },
  {
   "gate": "tools/ship/tsl-selfcheck.mjs",
   "exit": 1,
   "ms": 1942,
   "first": "CONTROL: three 0.178's WebGPU readback at 32 px (a 128-byte row, not 256-aligned) raises a validation error and reads nothing -- the gate keeps to widths whose rows are 256-byte aligned, and says so   0 error(s), alpha 255",
   "all": [
    "CONTROL: three 0.178's WebGPU readback at 32 px (a 128-byte row, not 256-aligned) raises a validation error and reads nothing -- the gate keeps to widths whose rows are 256-byte aligned, and says so   0 error(s), alpha 255",
    "-- 1 check(s)"
   ],
   "count": 2,
   "onStderr": false
  },
  {
   "gate": "tools/ship/tslPhysics-selfcheck.mjs",
   "exit": 1,
   "ms": 6827,
   "first": "the emitted fragments transplant (labelled uniforms in three's order: the Lyapunov key's four, the Heidler key's six)   {\"lyapunov\":[\"seedLo\",\"seedHi\",\"rLo\",\"rHi\",\"nodeUniform6\"],\"heidler\":[\"i0\",\"eta\",\"tLo\",\"tHi\",\"t1\",\"t2\",\"nodeUniform8\"]}",
   "all": [
    "the emitted fragments transplant (labelled uniforms in three's order: the Lyapunov key's four, the Heidler key's six)   {\"lyapunov\":[\"seedLo\",\"seedHi\",\"rLo\",\"rHi\",\"nodeUniform6\"],\"heidler\":[\"i0\",\"eta\",\"tLo\",\"tHi\",\"t1\",\"t2\",\"nodeUniform8\"]}",
    "-- 1 check(s)"
   ],
   "count": 2,
   "onStderr": false
  }
 ]
});
