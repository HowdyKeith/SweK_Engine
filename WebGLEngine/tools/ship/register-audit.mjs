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
   "gate": "engine/frameDirtyCensus-selfcheck.mjs",
   "exit": 1,
   "ms": 643,
   "first": "*** every covers list belongs to an addSource call -- none has drifted onto a constructor that would ignore it ***",
   "all": [
    "*** every covers list belongs to an addSource call -- none has drifted onto a constructor that would ignore it ***"
   ],
   "count": 1,
   "onStderr": false
  },
  {
   "gate": "tools/roundhouse/swekWebviewApk-selfcheck.mjs",
   "exit": 1,
   "ms": 641,
   "first": "...and a failed load offers the prompt, since that is when the address is usually wrong",
   "all": [
    "...and a failed load offers the prompt, since that is when the address is usually wrong"
   ],
   "count": 1,
   "onStderr": false
  },
  {
   "gate": "tools/ship/bfcache-selfcheck.mjs",
   "exit": 1,
   "ms": 817,
   "first": "!! NO PAGE TEARS THINGS DOWN ON pagehide WITHOUT CHECKING event.persisted   camera-effects.html",
   "all": [
    "!! NO PAGE TEARS THINGS DOWN ON pagehide WITHOUT CHECKING event.persisted   camera-effects.html"
   ],
   "count": 1,
   "onStderr": false
  },
  {
   "gate": "tools/ship/boundaryLint-selfcheck.mjs",
   "exit": 1,
   "ms": 4643,
   "first": "!! no response body is read without consulting .ok   see above",
   "all": [
    "!! no response body is read without consulting .ok   see above",
    "!! no NEW reported boundary tell has appeared   94 sites against a baseline of 88; NEW (6): ai-bridge/releaseHold.js :: KILL_NOT_VERIFIED (NEW), ai-bridge/vbaArchiveBridge.js :: KILL_NOT_VERIFIED (NEW), tools/ship/quickSweep.mjs :: KILL_NOT_VERIFIED (NEW), tools/ship/recordInputs.mjs :: KILL_NOT_VERIFIED (NEW), tools/ship/redCensus.mjs :: KILL_NOT_VERIFIED (NEW), tools/ship/slowCensus.mjs :: KILL_NOT_VERIFIED (NEW). Counted every run since v3103 and never compared until now -- so a rule could have doubled quietly, and establishing that it had NOT took walking four shipped zips"
   ],
   "count": 2,
   "onStderr": false
  },
  {
   "gate": "tools/ship/canvasFill-selfcheck.mjs",
   "exit": 1,
   "ms": 4501,
   "first": "!! NO PAGE IN THE TREE SHIPS A FIXED, UNGROWABLE CANVAS   POSTAGE STAMPS: device-present.html#c, gpu-rig-check.html#stage, tools/ship/atmosphereHarness.html#c, tools/ship/effectMergeHarness.html#c, tools/ship/perspectiveWarpHarness.html#c, tools/ship/postChainHarness.html#c, tools/ship/solidTextureHarness.html#c",
   "all": [
    "!! NO PAGE IN THE TREE SHIPS A FIXED, UNGROWABLE CANVAS   POSTAGE STAMPS: device-present.html#c, gpu-rig-check.html#stage, tools/ship/atmosphereHarness.html#c, tools/ship/effectMergeHarness.html#c, tools/ship/perspectiveWarpHarness.html#c, tools/ship/postChainHarness.html#c, tools/ship/solidTextureHarness.html#c",
    "!! *** no canvas is stretched with position:absolute + inset alone, with no explicit width/height ***   OFFENDERS: orrery.html -> #stage {position:absolute; inset:0; display:block; cursor:grab;} | orrery.html -> #fx {position:absolute; inset:0; display:none; pointer-events:none;} -- a replaced element with width/height both auto uses its OWN intrinsic size (300x150), not the container's. Add width:100%;height:100% alongside the inset."
   ],
   "count": 2,
   "onStderr": false
  },
  {
   "gate": "tools/ship/definitionGates-selfcheck.mjs",
   "exit": 1,
   "ms": 435,
   "first": "!! no NEW exported symbol under physics/ has appeared without its gate naming it   GREW to 68: physics/character/terrainWalk.mjs:functionGround, physics/character/terrainWalk.mjs:autoGround, physics/character/terrainWalk.mjs:projectOnPlane, physics/character/terrainWalk.mjs:reportLines, physics/crypto/secp256k1.mjs:pointDouble, physics/mesh/meshCSG.mjs:flatness ...",
   "all": [
    "!! no NEW exported symbol under physics/ has appeared without its gate naming it   GREW to 68: physics/character/terrainWalk.mjs:functionGround, physics/character/terrainWalk.mjs:autoGround, physics/character/terrainWalk.mjs:projectOnPlane, physics/character/terrainWalk.mjs:reportLines, physics/crypto/secp256k1.mjs:pointDouble, physics/mesh/meshCSG.mjs:flatness ...",
    "!! no NEW exported symbol ANYWHERE IN THE TREE has appeared without its gate naming it   GREW to 333: ai-bridge/chunkVerify.mjs:verifiedPrefix, ai-bridge/chunkVerify.mjs:resumePlan, ai-bridge/chunkVerify.mjs:spliceRanges, ai-bridge/chunkVerify.mjs:chunkAudit, ai-bridge/chunkVerify.mjs:resumeRanges, ai-bridge/deviceWorker.mjs:offThreadDevice ...",
    "!! *** no NEW exported symbol OF ANY SHAPE has appeared without its gate naming it ***   GREW to 642: ai-bridge/catalogSnapshot.mjs:SNAPSHOT_PATH, ai-bridge/chunkVerify.mjs:verifiedPrefix, ai-bridge/chunkVerify.mjs:resumePlan, ai-bridge/chunkVerify.mjs:spliceRanges, ai-bridge/chunkVerify.mjs:chunkAudit, ai-bridge/chunkVerify.mjs:resumeRanges ..."
   ],
   "count": 3,
   "onStderr": false
  },
  {
   "gate": "tools/ship/homography-selfcheck.mjs",
   "exit": 1,
   "ms": 1249,
   "first": "!! it is the only homography in the tree",
   "all": [
    "!! it is the only homography in the tree"
   ],
   "count": 1,
   "onStderr": false
  },
  {
   "gate": "tools/ship/pairlaneBridge-selfcheck.mjs",
   "exit": 1,
   "ms": 79,
   "first": "!! *** the panel's label is RENAMED to what Keith actually asked for, id/tab left untouched ***   renaming the internal id too would touch every existing data-tab/data-panel selector for no reason the request asked for -- the visible label is what changed",
   "all": [
    "!! *** the panel's label is RENAMED to what Keith actually asked for, id/tab left untouched ***   renaming the internal id too would touch every existing data-tab/data-panel selector for no reason the request asked for -- the visible label is what changed",
    "!! the server.html tab button shows the renamed label, not the old one"
   ],
   "count": 2,
   "onStderr": false
  },
  {
   "gate": "tools/ship/proseAudit-selfcheck.mjs",
   "exit": 1,
   "ms": 1929,
   "first": "the audit actually resolved most of its subjects (an audit that cannot see its subjects is not an audit)   44 sound, 7 HTML (not auditable this way, declared), 2 OR-branches, 13 unresolved",
   "all": [
    "the audit actually resolved most of its subjects (an audit that cannot see its subjects is not an audit)   44 sound, 7 HTML (not auditable this way, declared), 2 OR-branches, 13 unresolved"
   ],
   "count": 1,
   "onStderr": false
  },
  {
   "gate": "tools/ship/registerResidue-selfcheck.mjs",
   "exit": 1,
   "ms": 1025,
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
   "ms": 120032,
   "first": "",
   "all": [],
   "count": 0,
   "printedBeforeTheCap": [],
   "onStderr": false
  },
  {
   "gate": "tools/ship/sunshineHost-selfcheck.mjs",
   "exit": 1,
   "ms": 80,
   "first": "every route the bridge lists is reachable through its own handler",
   "all": [
    "every route the bridge lists is reachable through its own handler"
   ],
   "count": 1,
   "onStderr": false
  },
  {
   "gate": "tools/ship/supersededFlag-selfcheck.mjs",
   "exit": 1,
   "ms": 62,
   "first": "...and an UNINVITED launch still refuses, which was always correct   two launchers that both start a server take turns forever; the refusal is not the bug",
   "all": [
    "...and an UNINVITED launch still refuses, which was always correct   two launchers that both start a server take turns forever; the refusal is not the bug"
   ],
   "count": 1,
   "onStderr": false
  },
  {
   "gate": "tools/ship/unattendedHold-selfcheck.mjs",
   "exit": 1,
   "ms": 41,
   "first": "!! the port-owner refusal still REFUSES -- the fix was to the hold, not the verdict   it must still decline to fight the owner and still exit nonzero. Making it proceed would restore the two-windows-take-turns-forever loop v3256 was built to end",
   "all": [
    "!! the port-owner refusal still REFUSES -- the fix was to the hold, not the verdict   it must still decline to fight the owner and still exit nonzero. Making it proceed would restore the two-windows-take-turns-forever loop v3256 was built to end"
   ],
   "count": 1,
   "onStderr": false
  },
  {
   "gate": "tools/ship/wasmSupport-selfcheck.mjs",
   "exit": 1,
   "ms": 2533,
   "first": "!! 113 files mention .wasm or the WebAssembly API -- the item's number, and it is the loose one   112 mention it",
   "all": [
    "!! 113 files mention .wasm or the WebAssembly API -- the item's number, and it is the loose one   112 mention it",
    "!! ...but 23 of those are comments and prose only; 90 mention it in live code   89 in code, 23 comment-only"
   ],
   "count": 2,
   "onStderr": false
  },
  {
   "gate": "tools/ship/doorKinds-selfcheck.mjs",
   "exit": "timeout",
   "ms": 120019,
   "first": "",
   "all": [],
   "count": 0,
   "printedBeforeTheCap": [],
   "onStderr": false
  },
  {
   "gate": "tools/ship/graveyard-selfcheck.mjs",
   "exit": "timeout",
   "ms": 120114,
   "first": "",
   "all": [],
   "count": 0,
   "printedBeforeTheCap": [],
   "onStderr": false
  },
  {
   "gate": "ui/stageInfo-selfcheck.mjs",
   "exit": 1,
   "ms": 6716,
   "first": "!! *** KEITH'S THIRD ASK: THE PANEL BOX IS THE SAME WIDTH WHATEVER THE VIEWPORT ***   offsetWidth 460 at both 1280 and 1920. *** MEASURED AS LAYOUT WIDTH ON PURPOSE: server.html puts a responsive `zoom` on BODY (0.8 at 1280, 0.9 at 1920), so the BOUNDING RECT reads 368 and 414 and a future reader measuring THAT would think the fix had failed. The zoom scales the whole page equally; the box is 460 in both. ***",
   "all": [
    "!! *** KEITH'S THIRD ASK: THE PANEL BOX IS THE SAME WIDTH WHATEVER THE VIEWPORT ***   offsetWidth 460 at both 1280 and 1920. *** MEASURED AS LAYOUT WIDTH ON PURPOSE: server.html puts a responsive `zoom` on BODY (0.8 at 1280, 0.9 at 1920), so the BOUNDING RECT reads 368 and 414 and a future reader measuring THAT would think the fix had failed. The zoom scales the whole page equally; the box is 460 in both. ***"
   ],
   "count": 1,
   "onStderr": false
  },
  {
   "gate": "tools/ship/tslSource-selfcheck.mjs",
   "exit": 1,
   "ms": 1468,
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
   "ms": 1612,
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
   "ms": 5694,
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
