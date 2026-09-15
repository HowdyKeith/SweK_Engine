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
   "ms": 120116,
   "first": "",
   "all": [],
   "count": 0,
   "printedBeforeTheCap": [],
   "onStderr": false
  },
  {
   "gate": "tools/ship/backendParity-selfcheck.mjs",
   "exit": 1,
   "ms": 374,
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
   "ms": 535,
   "first": "!! NO dynamic import is given a raw filesystem path   WOULD CRASH ON WINDOWS: tools/ship/redCensus.mjs -> import(path.join(ENG, \\\"rig/templates/kaijuBiped.js\\\") | tools/ship/register-audit.mjs -> import(path.join(ENG, \\\"rig/templates/kaijuBiped.js\\\") | tools/ship/register-audit.mjs -> import(path.join(ENG, \\\"rig/templates/kaijuBiped.js\\\") | tools/ship/trellisAutoRig-selfcheck.mjs -> import(path.join(ENG, \"rig/templates/kaijuBiped.js\"))",
   "all": [
    "!! NO dynamic import is given a raw filesystem path   WOULD CRASH ON WINDOWS: tools/ship/redCensus.mjs -> import(path.join(ENG, \\\"rig/templates/kaijuBiped.js\\\") | tools/ship/register-audit.mjs -> import(path.join(ENG, \\\"rig/templates/kaijuBiped.js\\\") | tools/ship/register-audit.mjs -> import(path.join(ENG, \\\"rig/templates/kaijuBiped.js\\\") | tools/ship/trellisAutoRig-selfcheck.mjs -> import(path.join(ENG, \"rig/templates/kaijuBiped.js\"))"
   ],
   "count": 1,
   "onStderr": false
  },
  {
   "gate": "tools/ship/runtimeGap-selfcheck.mjs",
   "exit": 1,
   "ms": 1458,
   "first": "the census re-derives to what the module recorded, EVERY row of it -- a stale table is a red   drifted: WebAssembly 23 -> 24",
   "all": [
    "the census re-derives to what the module recorded, EVERY row of it -- a stale table is a red   drifted: WebAssembly 23 -> 24",
    "!! *** THREADS ARE THE SMALLEST GAP OF TWELVE ON THE MERGED TREE (second-smallest at v4462), WHICH INVERTS THE ITEM'S SCALE EITHER WAY ***   #129 asks what is missing \"besides threads\"; threads rank 12 of 12, 23 files at 0.6%",
    "...and the headline survives it: a 2-file distortion in rows of 21 to 3,588, and threads still rank at the bottom   with this round: threads 23 against WebAssembly 24, rank 12 on the stable sort. Without it: 22 against 22. At v4462 the two files made a tie; at the v4526 merge they break one"
   ],
   "count": 3,
   "onStderr": false
  },
  {
   "gate": "tools/ship/definitionGates-selfcheck.mjs",
   "exit": 1,
   "ms": 400,
   "first": "!! *** no NEW exported symbol OF ANY SHAPE has appeared without its gate naming it ***   GREW to 641: ai-bridge/catalogSnapshot.mjs:SNAPSHOT_PATH, ai-bridge/chunkVerify.mjs:verifiedPrefix, ai-bridge/chunkVerify.mjs:resumePlan, ai-bridge/chunkVerify.mjs:spliceRanges, ai-bridge/chunkVerify.mjs:chunkAudit, ai-bridge/chunkVerify.mjs:resumeRanges ...",
   "all": [
    "!! *** no NEW exported symbol OF ANY SHAPE has appeared without its gate naming it ***   GREW to 641: ai-bridge/catalogSnapshot.mjs:SNAPSHOT_PATH, ai-bridge/chunkVerify.mjs:verifiedPrefix, ai-bridge/chunkVerify.mjs:resumePlan, ai-bridge/chunkVerify.mjs:spliceRanges, ai-bridge/chunkVerify.mjs:chunkAudit, ai-bridge/chunkVerify.mjs:resumeRanges ..."
   ],
   "count": 1,
   "onStderr": false
  },
  {
   "gate": "tools/ship/releaseLedger-selfcheck.mjs",
   "exit": 1,
   "ms": 290,
   "first": "!! *** main runs no more than the budget ahead of the releases page ***   8 of 3 allowed: v4535, v4534, v4533, v4532, v4531, v4504, v4487, v4486. PUBLISH BEFORE SHIPPING AGAIN -- the ship skill's step 7 is the how",
   "all": [
    "!! *** main runs no more than the budget ahead of the releases page ***   8 of 3 allowed: v4535, v4534, v4533, v4532, v4531, v4504, v4487, v4486. PUBLISH BEFORE SHIPPING AGAIN -- the ship skill's step 7 is the how"
   ],
   "count": 1,
   "onStderr": false
  }
 ]
});
