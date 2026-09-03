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
 "at": "v4380",
 "capMs": 120000,
 "rows": [
  {
   "gate": "engine/frameDirtyCensus-selfcheck.mjs",
   "exit": 1,
   "ms": 1393,
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
   "ms": 1365,
   "first": "...and a failed load offers the prompt, since that is when the address is usually wrong",
   "all": [
    "...and a failed load offers the prompt, since that is when the address is usually wrong"
   ],
   "count": 1,
   "onStderr": false
  },
  {
   "gate": "tools/ship/avatarServerViews-selfcheck.mjs",
   "exit": 1,
   "ms": 13396,
   "first": "!! every framed surface the server.html switch mounts carries ?embed=1   rigged, stickwoman, robotexpressive2, blob, blobgpu, thead, krbn, ascii, heerich, gauges3000",
   "all": [
    "!! every framed surface the server.html switch mounts carries ?embed=1   rigged, stickwoman, robotexpressive2, blob, blobgpu, thead, krbn, ascii, heerich, gauges3000"
   ],
   "count": 1,
   "onStderr": false
  },
  {
   "gate": "tools/ship/bfcache-selfcheck.mjs",
   "exit": 1,
   "ms": 1179,
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
   "ms": 6092,
   "first": "!! no response body is read without consulting .ok   see above",
   "all": [
    "!! no response body is read without consulting .ok   see above",
    "!! no NEW reported boundary tell has appeared   90 sites against a baseline of 88; NEW (2): ai-bridge/vbaArchiveBridge.js :: KILL_NOT_VERIFIED (NEW), tools/ship/quickSweep.mjs :: KILL_NOT_VERIFIED (NEW). Counted every run since v3103 and never compared until now -- so a rule could have doubled quietly, and establishing that it had NOT took walking four shipped zips"
   ],
   "count": 2,
   "onStderr": false
  },
  {
   "gate": "tools/ship/budgetEvidence-selfcheck.mjs",
   "exit": 1,
   "ms": 80,
   "first": "!! *** every gate carries evidence about its own runtime, or admits that it does not finish ***   6 with none -- tools/roundhouse/modeDistinct-selfcheck.mjs, tools/ship/carveGpu-selfcheck.mjs, tools/ship/divineEye-selfcheck.mjs, tools/ship/eulerGpu-selfcheck.mjs, tools/ship/shaderPairs-selfcheck.mjs, tools/ship/traderPolicy-selfcheck.mjs",
   "all": [
    "!! *** every gate carries evidence about its own runtime, or admits that it does not finish ***   6 with none -- tools/roundhouse/modeDistinct-selfcheck.mjs, tools/ship/carveGpu-selfcheck.mjs, tools/ship/divineEye-selfcheck.mjs, tools/ship/eulerGpu-selfcheck.mjs, tools/ship/shaderPairs-selfcheck.mjs, tools/ship/traderPolicy-selfcheck.mjs"
   ],
   "count": 1,
   "onStderr": false
  },
  {
   "gate": "tools/ship/canvasFill-selfcheck.mjs",
   "exit": 1,
   "ms": 4906,
   "first": "!! NO PAGE IN THE TREE SHIPS A FIXED, UNGROWABLE CANVAS   POSTAGE STAMPS: gpu-rig-check.html#stage, tools/ship/atmosphereHarness.html#c, tools/ship/effectMergeHarness.html#c, tools/ship/perspectiveWarpHarness.html#c, tools/ship/postChainHarness.html#c, tools/ship/solidTextureHarness.html#c",
   "all": [
    "!! NO PAGE IN THE TREE SHIPS A FIXED, UNGROWABLE CANVAS   POSTAGE STAMPS: gpu-rig-check.html#stage, tools/ship/atmosphereHarness.html#c, tools/ship/effectMergeHarness.html#c, tools/ship/perspectiveWarpHarness.html#c, tools/ship/postChainHarness.html#c, tools/ship/solidTextureHarness.html#c",
    "!! *** no canvas is stretched with position:absolute + inset alone, with no explicit width/height ***   OFFENDERS: orrery.html -> #stage {position:absolute; inset:0; display:block; cursor:grab;} | orrery.html -> #fx {position:absolute; inset:0; display:none; pointer-events:none;} -- a replaced element with width/height both auto uses its OWN intrinsic size (300x150), not the container's. Add width:100%;height:100% alongside the inset."
   ],
   "count": 2,
   "onStderr": false
  },
  {
   "gate": "tools/ship/definitionGates-selfcheck.mjs",
   "exit": 1,
   "ms": 251,
   "first": "!! no NEW exported symbol under physics/ has appeared without its gate naming it   GREW to 21: physics/crypto/secp256k1.mjs:pointDouble, physics/mesh/meshCSG.mjs:planeOf, physics/mesh/meshCSG.mjs:polyAABB, physics/mesh/meshCSG.mjs:polysAABB, physics/mesh/meshCSG.mjs:toTriangles, physics/mesh/meshCSG.mjs:toTriangleBuffer ...",
   "all": [
    "!! no NEW exported symbol under physics/ has appeared without its gate naming it   GREW to 21: physics/crypto/secp256k1.mjs:pointDouble, physics/mesh/meshCSG.mjs:planeOf, physics/mesh/meshCSG.mjs:polyAABB, physics/mesh/meshCSG.mjs:polysAABB, physics/mesh/meshCSG.mjs:toTriangles, physics/mesh/meshCSG.mjs:toTriangleBuffer ...",
    "!! no NEW exported symbol ANYWHERE IN THE TREE has appeared without its gate naming it   GREW to 242: ai-bridge/chunkVerify.mjs:verifiedPrefix, ai-bridge/chunkVerify.mjs:resumePlan, ai-bridge/chunkVerify.mjs:spliceRanges, ai-bridge/chunkVerify.mjs:chunkAudit, ai-bridge/chunkVerify.mjs:resumeRanges, ai-bridge/deviceWorker.mjs:offThreadDevice ..."
   ],
   "count": 2,
   "onStderr": false
  },
  {
   "gate": "tools/ship/gateReach-selfcheck.mjs",
   "exit": 1,
   "ms": 9902,
   "first": "!! the default population is ACCOUNTED FOR -- it may grow, but not silently   expected 472 (from the recorded census) and found 487. A tool that silently changed what it counts would make every earlier figure incomparable -- so when this fires, count what was added and update the pin WITH THE REASON, rather than raising the number until it passes",
   "all": [
    "!! the default population is ACCOUNTED FOR -- it may grow, but not silently   expected 472 (from the recorded census) and found 487. A tool that silently changed what it counts would make every earlier figure incomparable -- so when this fires, count what was added and update the pin WITH THE REASON, rather than raising the number until it passes"
   ],
   "count": 1,
   "onStderr": false
  },
  {
   "gate": "tools/ship/homography-selfcheck.mjs",
   "exit": 1,
   "ms": 1321,
   "first": "!! it is the only homography in the tree",
   "all": [
    "!! it is the only homography in the tree"
   ],
   "count": 1,
   "onStderr": false
  },
  {
   "gate": "tools/ship/mutationTable-selfcheck.mjs",
   "exit": 1,
   "ms": 54,
   "first": "!! EVERY MUTATION'S FIND-STRING IS STILL PRESENT   STALE, MUTATES NOTHING, WOULD REPORT A PHANTOM SURVIVOR: the fluid's shadow amplitude drops its 315/64pi -> physics/sph/sph.js",
   "all": [
    "!! EVERY MUTATION'S FIND-STRING IS STILL PRESENT   STALE, MUTATES NOTHING, WOULD REPORT A PHANTOM SURVIVOR: the fluid's shadow amplitude drops its 315/64pi -> physics/sph/sph.js"
   ],
   "count": 1,
   "onStderr": false
  },
  {
   "gate": "tools/ship/pagePlacement-selfcheck.mjs",
   "exit": 1,
   "ms": 153,
   "first": "!! ...and the silent bucket is the large one, which is the finding   188 silent against 235 placed. pageSections says of UNPLACED: \"an unplaced page and a page nobody has got to look identical, and the second one gets placed by a guess.\" *** UNPLACED HOLDS 23. THE OTHER 188 ARE IN EXACTLY THE STATE THE MECHANISM EXISTS TO PREVENT. ***",
   "all": [
    "!! ...and the silent bucket is the large one, which is the finding   188 silent against 235 placed. pageSections says of UNPLACED: \"an unplaced page and a page nobody has got to look identical, and the second one gets placed by a guess.\" *** UNPLACED HOLDS 23. THE OTHER 188 ARE IN EXACTLY THE STATE THE MECHANISM EXISTS TO PREVENT. ***",
    "!! box3d-blobs.html goes to Box3D, and the unweighted version sent it to Sampling & Methods   *** \"physics\" APPEARS IN FIVE PANELS AND SAYS NOTHING ABOUT WHICH ONE; \"box3d\" APPEARS IN ONE AND SAYS EVERYTHING. *** Two hits on the common word outscored one hit on the discriminating word and the wrong panel won. This survived the entity fix because \"physics\" is a REAL subject word -- just not a discriminating one, which a raw count cannot tell apart."
   ],
   "count": 2,
   "onStderr": false
  },
  {
   "gate": "tools/ship/pagePlacements-selfcheck.mjs",
   "exit": 1,
   "ms": 139,
   "first": "!! a page can be listed in TWO topics at once   *** SECTIONS.pages IS A PARTITION AND COULD NOT SAY THIS. *** Keith: \"a page such as Cosmic Map could show some or all or none of the sections\" -- so topics is a SET, and the base registry's one-panel-per-page shape was a limit of the storage rather than a fact about pages.",
   "all": [
    "!! a page can be listed in TWO topics at once   *** SECTIONS.pages IS A PARTITION AND COULD NOT SAY THIS. *** Keith: \"a page such as Cosmic Map could show some or all or none of the sections\" -- so topics is a SET, and the base registry's one-panel-per-page shape was a limit of the storage rather than a fact about pages.",
    "...and the packing rule has ONE implementation, on the server side   the browser renders what it is handed. A second copy of the packing in page JavaScript would drift from this one the first time either changed -- the defect this session keeps finding. *** THE FIRST VERSION OF THIS CHECK GREPPED FOR THE WORD AND WENT RED ON THE COMMENT THAT NAMES THE OWNER *** -- a check that punishes a file for SAYING where its logic lives is one that teaches people to stop saying."
   ],
   "count": 2,
   "onStderr": false
  },
  {
   "gate": "tools/ship/pageReflow-selfcheck.mjs",
   "exit": 1,
   "ms": 87,
   "first": "!! *** nothing reads layout after a DOM write inside a loop ***   ui/crtToggle.js:58 getBoundingClientRect, ui/domToTexture.js:137 clientWidth, ui/domToTexture.js:137 clientHeight, ui/textMorph.js:152 getBoundingClientRect",
   "all": [
    "!! *** nothing reads layout after a DOM write inside a loop ***   ui/crtToggle.js:58 getBoundingClientRect, ui/domToTexture.js:137 clientWidth, ui/domToTexture.js:137 clientHeight, ui/textMorph.js:152 getBoundingClientRect"
   ],
   "count": 1,
   "onStderr": false
  },
  {
   "gate": "tools/ship/pageSectionsReport-selfcheck.mjs",
   "exit": 1,
   "ms": 1384,
   "first": "!! and no alarm span is drawn at all when nothing is actually wrong    — 1 already linked in another part of the page: ev.html",
   "all": [
    "!! and no alarm span is drawn at all when nothing is actually wrong    — 1 already linked in another part of the page: ev.html"
   ],
   "count": 1,
   "onStderr": false
  },
  {
   "gate": "tools/ship/pairlaneBridge-selfcheck.mjs",
   "exit": 1,
   "ms": 84,
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
   "ms": 2115,
   "first": "the audit actually resolved most of its subjects (an audit that cannot see its subjects is not an audit)   44 sound, 7 HTML (not auditable this way, declared), 2 OR-branches, 13 unresolved",
   "all": [
    "the audit actually resolved most of its subjects (an audit that cannot see its subjects is not an audit)   44 sound, 7 HTML (not auditable this way, declared), 2 OR-branches, 13 unresolved"
   ],
   "count": 1,
   "onStderr": false
  },
  {
   "gate": "tools/ship/referenceKind-selfcheck.mjs",
   "exit": 1,
   "ms": 81411,
   "first": "!! *** the prose-rescued population may only SHRINK ***   227 against a ceiling of 181. A RISE MEANS A NEW ORPHAN IS BEING HIDDEN BY A SENTENCE. Falling is progress by any of three routes -- wire it, delete it, or teach the census to resolve.",
   "all": [
    "!! *** the prose-rescued population may only SHRINK ***   227 against a ceiling of 181. A RISE MEANS A NEW ORPHAN IS BEING HIDDEN BY A SENTENCE. Falling is progress by any of three routes -- wire it, delete it, or teach the census to resolve."
   ],
   "count": 1,
   "onStderr": false
  },
  {
   "gate": "tools/ship/registerResidue-selfcheck.mjs",
   "exit": 1,
   "ms": 1274,
   "first": "!! *** the residue may only SHRINK -- a page linked but neither placed nor excused fails on arrival ***   45 against a ceiling of 41. *** UNPLACED's OWN COMMENT SAYS \"AN UNPLACED PAGE AND A PAGE NOBODY GOT TO LOOK THE SAME\", AND UNTIL THIS LINE EXISTED NOTHING COMPARED THE REGISTER TO THE PAGES ACTUALLY OUTSIDE THE SECTIONS -- so it could not tell them apart, which is the one thing it exists to do. *** Each of the 45 is a judgement (a section, or an exemption with a sentence) and it is Keith's, one at a time.",
   "all": [
    "!! *** the residue may only SHRINK -- a page linked but neither placed nor excused fails on arrival ***   45 against a ceiling of 41. *** UNPLACED's OWN COMMENT SAYS \"AN UNPLACED PAGE AND A PAGE NOBODY GOT TO LOOK THE SAME\", AND UNTIL THIS LINE EXISTED NOTHING COMPARED THE REGISTER TO THE PAGES ACTUALLY OUTSIDE THE SECTIONS -- so it could not tell them apart, which is the one thing it exists to do. *** Each of the 45 is a judgement (a section, or an exemption with a sentence) and it is Keith's, one at a time."
   ],
   "count": 1,
   "onStderr": false
  },
  {
   "gate": "tools/ship/shaderRefs-selfcheck.mjs",
   "exit": "timeout",
   "ms": 120124,
   "first": "",
   "all": [],
   "count": 0,
   "onStderr": false
  },
  {
   "gate": "tools/ship/statedRuntime-selfcheck.mjs",
   "exit": 1,
   "ms": 133,
   "first": "!! *** no NEW header has drifted from what its gate actually does ***   NEW: tools/roundhouse/reconQualityBind-selfcheck.mjs, tools/ship/commentFalsePass-selfcheck.mjs, tools/ship/spacesimStart-selfcheck.mjs -- correct the header FROM THE MEASUREMENT in gate-timings.json. DO NOT ADD IT TO THE BASELINE: that is a ratchet growing back, the one thing a ratchet must never do",
   "all": [
    "!! *** no NEW header has drifted from what its gate actually does ***   NEW: tools/roundhouse/reconQualityBind-selfcheck.mjs, tools/ship/commentFalsePass-selfcheck.mjs, tools/ship/spacesimStart-selfcheck.mjs -- correct the header FROM THE MEASUREMENT in gate-timings.json. DO NOT ADD IT TO THE BASELINE: that is a ratchet growing back, the one thing a ratchet must never do"
   ],
   "count": 1,
   "onStderr": false
  },
  {
   "gate": "tools/ship/sunshineHost-selfcheck.mjs",
   "exit": 1,
   "ms": 102,
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
   "ms": 83,
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
   "ms": 63,
   "first": "!! the port-owner refusal still REFUSES -- the fix was to the hold, not the verdict   it must still decline to fight the owner and still exit nonzero. Making it proceed would restore the two-windows-take-turns-forever loop v3256 was built to end",
   "all": [
    "!! the port-owner refusal still REFUSES -- the fix was to the hold, not the verdict   it must still decline to fight the owner and still exit nonzero. Making it proceed would restore the two-windows-take-turns-forever loop v3256 was built to end"
   ],
   "count": 1,
   "onStderr": false
  },
  {
   "gate": "tools/ship/updatePause-selfcheck.mjs",
   "exit": 1,
   "ms": 258,
   "first": "...and an errored check is counted as its own thing, not silently dropped",
   "all": [
    "...and an errored check is counted as its own thing, not silently dropped"
   ],
   "count": 1,
   "onStderr": false
  },
  {
   "gate": "tools/ship/wasmSupport-selfcheck.mjs",
   "exit": 1,
   "ms": 2783,
   "first": "!! 82 files mention .wasm or the WebAssembly API -- the item's number, and it is the loose one   92 mention it",
   "all": [
    "!! 82 files mention .wasm or the WebAssembly API -- the item's number, and it is the loose one   92 mention it",
    "!! ...but 16 of those are comments and prose only; 66 mention it in live code   74 in code, 18 comment-only"
   ],
   "count": 2,
   "onStderr": false
  },
  {
   "gate": "tools/ship/winPathGuard-selfcheck.mjs",
   "exit": 1,
   "ms": 734,
   "first": "!! no source file uses the Windows-fragile path idioms   19 offending occurrence(s): engine/frameDirtyCensus-selfcheck.mjs  [rel .pathname, no drive-letter strip] ; engine/xrSession-selfcheck.mjs  [rel .pathname, no drive-letter strip] ; render/aquarelle-selfcheck.mjs  [rel .pathname, no drive-letter strip] ; render/badTv-selfcheck.mjs  [rel .pathname, no drive-letter strip] ; render/doomFire-selfcheck.mjs  [rel .pathname, no drive-letter strip] ; render/spriteSlice-selfcheck.mjs  [rel .pathname, no drive-letter strip]",
   "all": [
    "!! no source file uses the Windows-fragile path idioms   19 offending occurrence(s): engine/frameDirtyCensus-selfcheck.mjs  [rel .pathname, no drive-letter strip] ; engine/xrSession-selfcheck.mjs  [rel .pathname, no drive-letter strip] ; render/aquarelle-selfcheck.mjs  [rel .pathname, no drive-letter strip] ; render/badTv-selfcheck.mjs  [rel .pathname, no drive-letter strip] ; render/doomFire-selfcheck.mjs  [rel .pathname, no drive-letter strip] ; render/spriteSlice-selfcheck.mjs  [rel .pathname, no drive-letter strip]"
   ],
   "count": 1,
   "onStderr": false
  },
  {
   "gate": "tools/ship/wiringClaims-selfcheck.mjs",
   "exit": 1,
   "ms": 2082,
   "first": "!! *** every remaining hit is a CONTRAST LINE, adjudicated by name ***   a sentence that says 'A is unwired while B is live' names two modules and my extractor takes both. REPORTED AS CANDIDATES, NOT FAILED -- and this check names the two rather than loosening the pattern, so a THIRD would show up",
   "all": [
    "!! *** every remaining hit is a CONTRAST LINE, adjudicated by name ***   a sentence that says 'A is unwired while B is live' names two modules and my extractor takes both. REPORTED AS CANDIDATES, NOT FAILED -- and this check names the two rather than loosening the pattern, so a THIRD would show up"
   ],
   "count": 1,
   "onStderr": false
  }
 ]
});
