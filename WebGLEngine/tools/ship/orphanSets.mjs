// WebGLEngine/tools/ship/orphanSets.mjs -- v4673
//
// *** THREE RATCHETS GUARD THE ORPHAN CENSUS AND ALL THREE STORED A NUMBER. A NUMBER CAN SAY IT MOVED. IT
// CAN NEVER SAY WHAT MOVED. ***
//
// graveyard-selfcheck held ORPHAN_UTIL_BASELINE = 159, referenceKind-selfcheck held RESCUED_CEILING = 288
// and RITUAL_CEILING = 39. Every one of them was breached, and the failure line each printed was of the form
// "167 now vs 159 recorded" -- true, unarguable, and not actionable by anybody, because the eight or twelve
// or fourteen it is complaining about have no names. The only way to learn them was to run the census at the
// commit that set the ceiling and diff. THAT IS WHAT THIS ROUND DID, and it took a git worktree, four census
// runs and about seven minutes of wall clock to answer a question the record should have answered instantly.
//
// referenceKind says so itself, in a comment written two hundred rounds ago and never acted on:
// "THE RATCHET IS ON THE COUNT, NOT ON THE NAMES."
//
// *** THE MEASUREMENT, AND HOW IT WAS MADE HONEST. *** The baseline sets below were recovered by running the
// census AT fc12eef (2026-09-14, the commit that set two of the three ceilings) in a detached worktree. The
// census LOGIC is byte-identical between that commit and now -- graveyard-selfcheck.mjs, moduleRefs.mjs,
// unwiredRegister.mjs and doorKinds.mjs are unchanged, and referenceKind-selfcheck.mjs differs only in the
// ceiling constant and its comments -- so the diff measures THE TREE and not the instrument. That check was
// run before the diff was trusted, because a set difference taken across two different scanners is a reading
// of the scanner.
//
//     orphaned utilities   157 -> 167      (+12 arrived, -2 left)   ceiling said 159, so it held 2 of slack
//     prose-rescued        289 -> 302      (+18 arrived, -5 left)   ceiling said 289, exactly
//     ritual-hidden         39 ->  47      (+11 arrived, -3 left)   ceiling said 39, exactly
//
// 26 distinct modules arrived and 5 departed across ten days and roughly 137 rounds.
//
// *** THE FIVE DEPARTURES ARE THE PART THAT SHOULD STING. *** They are real paydown -- anim/ik.mjs,
// tools/ship/absenceScope.mjs, tools/ship/recordDrift.mjs, tools/ship/wgslCorpus.mjs and
// vendor/three/jsm/loaders/FBXLoader.js -- and the last of those is the exact entry referenceKind's own
// v4535 note named as "round 2 of the FBX work the vendoring commit already deferred". Somebody did that
// work. NOTHING IN THE TREE COULD SHOW IT, because a count that goes 289 -> 302 nets five paydowns against
// eighteen arrivals and reports one number that makes the paydown invisible and the growth unattributable.
//
// *** AND TWO ARRIVALS ARE THE SHIP RITUAL'S OWN DRIVERS. *** tools/ship/ship.mjs and tools/ship/verify.mjs
// are not new files and they are not unused -- ai-bridge/shipBridge.js execFiles one and
// ai-bridge/sourceChainBridge.js spawns the other. They entered the census because a gateSweep closing
// started naming them, and moduleRefs cannot resolve their callers because both are invoked through a
// COMPOSED path (path.join("ship", "ship.mjs")) rather than a literal specifier. The ritual documented its
// own driver into invisibility. tools/ship/nextRounds.mjs -- the backlog -- arrived the same way.
//
// *** A SET HAS NO SLACK, AND THAT IS WHY THE TOLERANCE IS DELETED RATHER THAN CARRIED OVER. *** Both count
// ratchets carried a second check that the ceiling had not been left behind by progress (`ceiling - actual
// <= 8`), and it existed for one reason: A COUNT HAS FUNGIBLE SLOTS. Pay two modules down under a count
// ratchet and two fresh orphans can arrive into the vacancy in silence -- which is precisely what v3673
// found in pageReach and had to fix, and precisely what happened here, where 157 sat under a ceiling of 159
// with two slots standing open. A SET HAS NO SLOTS. A departure never makes room for an arrival, because
// arrival is membership and not headcount, so the slack check has nothing left to protect and is gone.
//
// *** WHAT THIS FILE IS NOT. *** It is not an exemption list. It is the same thing
// tools/ship/unwiredRegister.mjs is -- debt with a name on it -- and the bar is identical: a member is a
// module the tree has NOT wired, NOT deleted and NOT taught the census to resolve, recorded so that the next
// arrival is visible against it. Removing a name here without doing one of those three things is the only
// way to cheat this file, and it is the one edit that makes the next round's diff lie.
//
// *** THIS MODULE IS ITSELF GATE-ONLY, AND THE CENSUS CLASSIFIES IT WITHOUT BEING TOLD. *** Two gates import
// it and nothing else does. The first draft of this file added its own name to `orphanUtils` below, on the
// reasoning that a register which exempts itself is the defect referenceKind caught in its own first run ("a
// gate about prose rescuing modules rescued a module with its own prose"). THAT WAS WRONG, and graveyard's
// own derivation is what says so: RECORD_EXPORT matches `export const ADMITTED_V4673`, so this file lands in
// ANALYSIS RECORDS -- the population for "a module holding a measurement whose consumer is correctly its
// gate" -- and never reaches the orphaned-utility list at all. That is the right answer and nobody typed it:
// v2988's rule is that the kind is DERIVED from whether the module exports a recorded measurement, precisely
// so a file cannot declare itself into the wrong bucket. Listing it by hand would have put a name in a set it
// is not a member of, and the ratchet would have reported it as departed on the very first run.
//
// *** AND THEN THIS ROUND DID IT AGAIN, TO ITSELF, IN THE RECORD -- THE THIRD INSTANCE IN ONE ROUND AND THE
// ONE WORTH READING. ***
//
// With the register excluded and both censuses green, the round wrote its records: gateSweep's 353rd closing
// and a backlog entry. The next full census came back RED.
//
//     proseRescued  304 against 302 -- ARRIVED: tools/ship/adapterRecord.mjs, tools/ship/orphanSets.mjs
//     ritualHidden   48 against  47 -- ARRIVED: tools/ship/orphanSets.mjs
//
// THE SWEEP CLOSING NAMES THE MODULE IT GUARDS. The ship ritual REQUIRES that paragraph of every round that
// adds a gate, so writing it put THIS FILE into the very population THIS FILE was created to record -- and
// the backlog entry drafted about shared gate helpers named tools/ship/adapterRecord.mjs, which put that one
// in beside it. Neither module was wired, deleted or changed. Two sentences moved them.
//
// *** THEY ARE RECORDED RATHER THAN ARGUED AWAY, AND THE RATCHET IS WHY. *** The alternative was to delete
// the closing and the backlog entry, which would have kept a number down by removing the documentation the
// ritual mandates -- gaming the instrument. These are TRUE memberships: orphanSets.mjs has two gate
// importers and no non-gate one, adapterRecord.mjs has eight, and something names each of them. The ratchet
// did exactly the job referenceKind's v4386 note set for it -- "the next round to leave a gate-only module
// behind is told so BY ITS OWN SHIP RUN, rather than 900 rounds later by a census" -- and it told this one,
// by name, within the round. Being told and then recording it with the cause attached is the whole design.
//
// *** AND A FOURTH, CAUSED BY DOCUMENTING THE THIRD -- WHICH IS WHERE THE CONVERGENCE RULE COMES FROM. ***
// The paragraph above was written into gateSweep's closing, and that closing NAMES adapterRecord.mjs. So
// adapterRecord, which the backlog entry had already put into proseRescued, was now rescued by gateSweep too
// and joined ritualHidden as well: 49 against 48. Recording the third instance created the fourth.
//
// THIS TERMINATES, AND THE REASON IS WORTH STATING BECAUSE IT IS NOT OBVIOUS. Only prose in files that are
// NOT excluded from the mention scan can move these populations -- in practice gateSweep.mjs and
// nextRounds.mjs. This file is excluded, so every name added HERE is free. The loop therefore closes the
// moment a round stops introducing NEW module names into the closing or the backlog, and the fix for an
// arrival is always an edit to this file rather than to the prose that caused it. Deleting the sentence
// would also work and is the wrong move: it keeps a number down by removing documentation the ritual
// mandates.
//
// NOTE FOR THE NEXT ROUND: yours will do this too. A round that adds a gate writes a closing that names its
// module, and if that module has no non-gate importer it joins ritualHidden on the spot. That is the 39 -> 47
// drift measured above, seen from the inside -- roughly one per gate-adding round. It is not a leak in the
// ratchet, it is the thing the ratchet is for.
//
// THERE IS NO REGRESS: orphanSets.mjs is excluded from the MENTION side of both censuses, so the 519 names
// it now carries rescue nothing. Only prose in files that are NOT excluded -- gateSweep.mjs, nextRounds.mjs
// -- can move this population, which is why those two are where the drift comes from.
"use strict";

/**
 * THE RECORDED MEMBERSHIP OF THREE POPULATIONS, BY NAME.
 *
 * Measured on this tree at v4673. Each list is what its census returns TODAY; the ratchet below forbids
 * additions and welcomes removals. The lengths are NOT written down anywhere -- every count the gates print
 * is derived from .length, so a count can no longer drift away from the set it is supposed to describe,
 * which is the drift that left two slots of silent slack under graveyard's ceiling.
 */
export const RECORDED = Object.freeze({
    // graveyard-selfcheck: gate-only modules that are not analysis records, have no tools.html door, are not
    // an MCP server and carry no unwiredRegister entry. "These export functions and NOTHING calls them."
    orphanUtils: Object.freeze([
        "ai-bridge/catalogSnapshot.mjs",
        "ai-bridge/scrapeRouter.mjs",
        "anim/reachIK.mjs",
        "brain/agent/dispatch.js",
        "brain/agent/fleetFingerprint.js",
        "brain/fieldSpace.mjs",
        "brain/rl/bptt.js",
        "brain/rl/memoryPolicy.js",
        "brain/rl/occludedHuntEnv.js",
        "brain/rl/rocketLoop.mjs",
        "brain/tools/policy-mass.mjs",
        "brain/transport/scanTwin.mjs",
        "demos_code/bitcoin_miner.js",
        "engine/domScope.mjs",
        "ev/tools/es-arena.mjs",
        "fluid/vorticity.mjs",
        "fx/cssKeyframes.mjs",
        "fx/paintFields.mjs",
        "fx/paintGenerators.mjs",
        "fx/paintTransforms.mjs",
        "fx/polyBrush.mjs",
        "lib/derivedCache.js",
        "math/solverFit.mjs",
        "mesh/binaryFaces.js",
        "mesh/carve.mjs",
        "mesh/songLathe.mjs",
        "petfbi/gallerySources.mjs",
        "physics/backend-qa-check.mjs",
        "physics/backendConformance.mjs",
        "physics/backendLimits.mjs",
        "physics/blobSpace.js",
        "physics/box3d/rayCast.mjs",
        "physics/box3dFingerprint.js",
        "physics/box3dSyncCompare.js",
        "physics/character/capsuleSettle.mjs",
        "physics/imagePair.mjs",
        "physics/octree/octree.js",
        "physics/optics/beerLambert.js",
        "physics/ragdollFromSkeleton.mjs",
        "physics/render/bssrdfSample.mjs",
        "physics/render/conductorFresnel.mjs",
        "physics/soft/volume.js",
        "physics/voxelMassProps.js",
        "physics/wasmImports.js",
        "render/badTvPass.js",
        "render/carveTsl.mjs",
        "render/depthProject.js",
        "render/frameRecorder.mjs",
        "render/frameTrace.js",
        "render/glCapture.mjs",
        "render/heightmapVertexId.js",
        "render/img2three.mjs",
        "render/isingTsl.mjs",
        "render/panini.js",
        "render/passFootprint.mjs",
        "render/retroRaster.mjs",
        "render/ringFloor.mjs",
        "render/slugTsl.mjs",
        "render/temporalLock.mjs",
        "render/texelProbe.mjs",
        "render/transitionModel.mjs",
        "simulation/ferroThermal.js",
        "simulation/lbm/lbmShader.js",
        "simulation/lbm/sheddingDesign.mjs",
        "simulation/tomo/honest-error.mjs",
        "tools/bench/meshPerf.mjs",
        "tools/emitStrictLibm.mjs",
        "tools/export/dracoEncode.mjs",
        "tools/export/glbConformance.mjs",
        "tools/frame-budget.mjs",
        "tools/mac/xbarPlugin.mjs",
        "tools/macSession.mjs",
        "tools/makeIncremental.mjs",
        "tools/mathProbe.mjs",
        "tools/media/makeStageClip.mjs",
        "tools/mesh/xatlasRef.mjs",
        "tools/mutate/mechanical.mjs",
        "tools/mutate/mechanicalSweep.mjs",
        "tools/mutate/mutate.mjs",
        "tools/mutate/mutationScore.mjs",
        "tools/petfbi/buildGalleryBookmarklet.mjs",
        "tools/rigWorklist.mjs",
        "tools/roundhouse/androidRunner.mjs",
        "tools/roundhouse/androidVerdict.mjs",
        "tools/roundhouse/coupleCensus.mjs",
        "tools/roundhouse/coverage.mjs",
        "tools/roundhouse/domainCoverage.mjs",
        "tools/roundhouse/geminiRoleCaller.mjs",
        "tools/roundhouse/knobCandidates.mjs",
        "tools/roundhouse/limitReduction.mjs",
        "tools/roundhouse/menuScope.mjs",
        "tools/roundhouse/modeDistinct.mjs",
        "tools/roundhouse/modelCatalogue.mjs",
        "tools/roundhouse/observableFinite.mjs",
        "tools/roundhouse/plantedError.mjs",
        "tools/roundhouse/refusalExpiry.mjs",
        "tools/roundhouse/routeContrast.mjs",
        "tools/roundhouse/run-device.mjs",
        "tools/roundhouse/runLive.mjs",
        "tools/roundhouse/runtimeBench.mjs",
        "tools/roundhouse/seedSpread.mjs",
        "tools/roundhouse/sensitivity.mjs",
        "tools/roundhouse/signRelease.mjs",
        "tools/roundhouse/skillProposer.mjs",
        "tools/roundhouse/skillTrial.mjs",
        "tools/roundhouse/suspiciousZero.mjs",
        "tools/roundhouse/symmetry.mjs",
        "tools/roundhouse/trendVsNoise.mjs",
        "tools/ship/adapterRecord.mjs",
        "tools/ship/aiBrainHarness.mjs",
        "tools/ship/artifactCensus.mjs",
        "tools/ship/boundaryLint.mjs",
        "tools/ship/bunNative.mjs",
        "tools/ship/claimCheck.mjs",
        "tools/ship/claimEvidence.mjs",
        "tools/ship/coverageTriage.mjs",
        "tools/ship/deterministicRaf.mjs",
        "tools/ship/ensureDxc.mjs",
        "tools/ship/fixtureLitter.mjs",
        "tools/ship/frozenReferee.mjs",
        "tools/ship/gateMutation.mjs",
        "tools/ship/gateReport.mjs",
        "tools/ship/hookupState.mjs",
        "tools/ship/kernelReach.mjs",
        "tools/ship/launchIndex.mjs",
        "tools/ship/murmurSpeciesFrames.mjs",
        "tools/ship/orreryReachedScan.mjs",
        "tools/ship/patternWidth.mjs",
        "tools/ship/pixelWorst.mjs",
        "tools/ship/pngWrite.mjs",
        "tools/ship/populationCensus.mjs",
        "tools/ship/predicatePairs.mjs",
        "tools/ship/proseAudit.mjs",
        "tools/ship/recordInputs.mjs",
        "tools/ship/recordShape.mjs",
        "tools/ship/recordTier.mjs",
        "tools/ship/registerRender.mjs",
        "tools/ship/registryOrphans.mjs",
        "tools/ship/removeCluster.mjs",
        "tools/ship/serverShutdown.mjs",
        "tools/ship/shaderPairs.mjs",
        "tools/ship/shadowedHelper.mjs",
        "tools/ship/shipVerdict.mjs",
        "tools/ship/spellCost.mjs",
        "tools/ship/spriteSheetImport.mjs",
        "tools/ship/substance.mjs",
        "tools/ship/sweepRotation.mjs",
        "tools/ship/textureBytes.mjs",
        "tools/ship/todo.mjs",
        "tools/ship/tscResolve.mjs",
        "tools/ship/verifyLicenceTexts.mjs",
        "tools/ship/wgslAutoLayout.mjs",
        "tools/ship/wgslDeviceLimits.mjs",
        "tools/ship/wiringClaims.mjs",
        "ui/avatarExpression.js",
        "ui/gazeDwell.mjs",
        "ui/radarManager.js",
        "world/VoxelWorld.js",
        "world/autoExtremity.js",
        "world/copiedOutsideVendor.mjs",
        "world/foldField.mjs",
        "world/licenceBodies.mjs",
        "world/licenceSweep.mjs",
        "world/namedNotChecked.mjs",
        "world/nodeGlPlatforms.mjs",
        "world/populationPolicy.mjs",
        "world/vendoredLicences.mjs",
    ]),
    // referenceKind-selfcheck: no resolved non-gate importer, held off the census by a MENTION somewhere.
    proseRescued: Object.freeze([
        "ai-bridge/catalogSnapshot.mjs",
        "ai-bridge/krbnRoutes.js",
        "ai-bridge/ntfsMounterBridge.js",
        "anim/reachIK.mjs",
        "brain/agent/dispatch.js",
        "brain/agent/fleetFingerprint.js",
        "brain/rl/attribution.mjs",
        "brain/rl/bptt.js",
        "brain/rl/memoryPolicy.js",
        "brain/rl/occludedHuntEnv.js",
        "brain/rl/occlusionTaxonomy.js",
        "brain/rl/rocketLoop.mjs",
        "brain/rl/surprise.mjs",
        "brain/tools/policy-mass.mjs",
        "brain/transport/pipeline.js",
        "brain/transport/scanTwin.mjs",
        "core/ecs/index.js",
        "core/ecs/systems/combat.js",
        "core/ecs/systems/physics.js",
        "core/engine.bootstrap.js",
        "core/greedyMesher.js",
        "demos_code/alien_patrol.js",
        "demos_code/ant_colony.js",
        "demos_code/aquarium.js",
        "demos_code/audio_lab.js",
        "demos_code/bitcoin_miner.js",
        "demos_code/blank_sandbox.js",
        "demos_code/boids.js",
        "demos_code/chess.js",
        "demos_code/fitzhugh_nagumo.js",
        "demos_code/home_assistant_control.js",
        "demos_code/ocean_ecosystem.js",
        "demos_code/parallax_studio.js",
        "demos_code/pheromone_hunt.js",
        "demos_code/sandbox.js",
        "demos_code/satellite_strike_showcase.js",
        "demos_code/slime_mold.js",
        "demos_code/testfire_skirmish.js",
        "demos_code/texture_studio.js",
        "demos_code/wad_arena.js",
        "engine/domScope.mjs",
        "engine/loop.js",
        "engine/voxelMesh.js",
        "ev/tools/es-arena.mjs",
        "fluid/vorticity.mjs",
        "fx/cssKeyframes.mjs",
        "fx/paintFields.mjs",
        "fx/paintGenerators.mjs",
        "fx/paintTransforms.mjs",
        "fx/polyBrush.mjs",
        "lib/derivedCache.js",
        "math/solverFit.mjs",
        "mesh/binaryFaces.js",
        "mesh/carve.mjs",
        "mesh/chunkMeshBuilder.js",
        "mesh/colliderFromGLB.mjs",
        "mesh/songLathe.mjs",
        "nav/detourScale.mjs",
        "nav/partitionScore.mjs",
        "nav/pathCost.mjs",
        "petfbi/gallerySources.mjs",
        "physics/backend-qa-check.mjs",
        "physics/backendConformance.mjs",
        "physics/blobSpace.js",
        "physics/box3dFingerprint.js",
        "physics/box3dSyncCompare.js",
        "physics/character/capsuleSettle.mjs",
        "physics/character/groundProbe.mjs",
        "physics/control/controlMargins.mjs",
        "physics/diffusionKnob.mjs",
        "physics/imagePair.mjs",
        "physics/mechanics/contactImpulse.mjs",
        "physics/mechanics/rigidKeys.mjs",
        "physics/octree/octree.js",
        "physics/octree/svoMarch.mjs",
        "physics/optics/beerLambert.js",
        "physics/ragdollFromSkeleton.mjs",
        "physics/render/btdfDomain.mjs",
        "physics/render/conductorFresnel.mjs",
        "physics/render/dielectricWalk.mjs",
        "physics/render/samplerCheck.mjs",
        "physics/render/transmission.mjs",
        "physics/render/wgslArc.mjs",
        "physics/soft/volume.js",
        "physics/sph/packingTransfer.mjs",
        "physics/sph/wideTilt.mjs",
        "physics/stepperMeter.mjs",
        "physics/tomography/matchedAdjoint.mjs",
        "physics/tomography/sirt.mjs",
        "physics/voxelMassProps.js",
        "physics/wasmImports.js",
        "physics/xpbd/collisionKnobs.mjs",
        "physics/xpbd/solverParity.mjs",
        "render/SSAOPass.js",
        "render/badTvPass.js",
        "render/carveTsl.mjs",
        "render/clipPlane.js",
        "render/colourReach.mjs",
        "render/depthProject.js",
        "render/fireSpread.mjs",
        "render/frameTrace.js",
        "render/glCapture.mjs",
        "render/heightmapVertexId.js",
        "render/img2three.mjs",
        "render/isingTsl.mjs",
        "render/panini.js",
        "render/passFootprint.mjs",
        "render/portal.js",
        "render/retroRaster.mjs",
        "render/ringFloor.mjs",
        "render/slugTsl.mjs",
        "render/stereographic.js",
        "render/temporalLock.mjs",
        "render/texelProbe.mjs",
        "render/transitionModel.mjs",
        "simulation/RagdollDismember.js",
        "simulation/SpatialHash.js",
        "simulation/ferroThermal.js",
        "simulation/lbm/dSweep.mjs",
        "simulation/lbm/lbmShader.js",
        "simulation/lbm/liftPersistence.mjs",
        "simulation/lbm/onsetTrend.mjs",
        "simulation/lbm/sheddingDesign.mjs",
        "simulation/tomo/honest-error.mjs",
        "tools/bench/meshPerf.mjs",
        "tools/dfg-benchmark.mjs",
        "tools/emitStrictLibm.mjs",
        "tools/export/dracoEncode.mjs",
        "tools/export/glbConformance.mjs",
        "tools/facePlacementSystem.js",
        "tools/fingerprint/fleet-report.mjs",
        "tools/frame-budget.mjs",
        "tools/ha-panel-lab/panels/solar-3d-card.js",
        "tools/macSession.mjs",
        "tools/makeIncremental.mjs",
        "tools/mathProbe.mjs",
        "tools/mcp/physicsAi.mjs",
        "tools/media/makeStageClip.mjs",
        "tools/mesh/xatlasRef.mjs",
        "tools/multigrid3dTiming.mjs",
        "tools/mutate/mechanical.mjs",
        "tools/mutate/mechanicalSweep.mjs",
        "tools/mutate/mutate.mjs",
        "tools/mutate/mutationScore.mjs",
        "tools/mutate/shadowedDefaults.mjs",
        "tools/petfbi/buildGalleryBookmarklet.mjs",
        "tools/render-qa/deviceOwed.mjs",
        "tools/render-qa/rigOwed.mjs",
        "tools/render-qa/traceAscii.mjs",
        "tools/rigWorklist.mjs",
        "tools/roundhouse/androidRunner.mjs",
        "tools/roundhouse/androidVerdict.mjs",
        "tools/roundhouse/applyStaged.mjs",
        "tools/roundhouse/backendRotation.mjs",
        "tools/roundhouse/capabilityCard.mjs",
        "tools/roundhouse/claimTrace.mjs",
        "tools/roundhouse/conservationReach.mjs",
        "tools/roundhouse/corroborationReach.mjs",
        "tools/roundhouse/coupleCensus.mjs",
        "tools/roundhouse/coverage.mjs",
        "tools/roundhouse/defaultPlacementSweep.mjs",
        "tools/roundhouse/detectionMap.mjs",
        "tools/roundhouse/gateActivity.mjs",
        "tools/roundhouse/geminiRoleCaller.mjs",
        "tools/roundhouse/knobCandidates.mjs",
        "tools/roundhouse/knobLiveness.mjs",
        "tools/roundhouse/labExport.mjs",
        "tools/roundhouse/labGalaxy.mjs",
        "tools/roundhouse/modelCatalogue.mjs",
        "tools/roundhouse/plantedError.mjs",
        "tools/roundhouse/promptCost.mjs",
        "tools/roundhouse/refusalExpiry.mjs",
        "tools/roundhouse/responseCensus.mjs",
        "tools/roundhouse/run-device.mjs",
        "tools/roundhouse/runLive.mjs",
        "tools/roundhouse/runtimeBench.mjs",
        "tools/roundhouse/seedSpread.mjs",
        "tools/roundhouse/sensitivity.mjs",
        "tools/roundhouse/signRelease.mjs",
        "tools/roundhouse/skillCodeTrial.mjs",
        "tools/roundhouse/skillProposer.mjs",
        "tools/roundhouse/skillTrial.mjs",
        "tools/roundhouse/suspiciousZero.mjs",
        "tools/roundhouse/zeroControl.mjs",
        "tools/roundhouse/zeroRangeFull.mjs",
        "tools/selectionState.js",
        "tools/shedding-settle.mjs",
        "tools/ship/adapterRecord.mjs",
        "tools/ship/aiBrainHarness.mjs",
        "tools/ship/areaHygiene.mjs",
        "tools/ship/artefactWriters.mjs",
        "tools/ship/artifactCensus.mjs",
        "tools/ship/assertionShape.mjs",
        "tools/ship/backlogAbsence.mjs",
        "tools/ship/baselineHygiene.mjs",
        "tools/ship/bootTraceReport.mjs",
        "tools/ship/boundaryLint.mjs",
        "tools/ship/budgetExile.mjs",
        "tools/ship/buildEngineCatalog.mjs",
        "tools/ship/buildKnowledgeIndex.mjs",
        "tools/ship/buildPageIndex.mjs",
        "tools/ship/bunNative.mjs",
        "tools/ship/checkerCensus.mjs",
        "tools/ship/claimCheck.mjs",
        "tools/ship/claimEvidence.mjs",
        "tools/ship/closingCoverage.mjs",
        "tools/ship/collideCensusHook.mjs",
        "tools/ship/collisionCensus.mjs",
        "tools/ship/controlDossier.mjs",
        "tools/ship/controllerAgreement.mjs",
        "tools/ship/corpus.mjs",
        "tools/ship/corpusFilters.mjs",
        "tools/ship/coverageTriage.mjs",
        "tools/ship/ddaPrecisionReport.mjs",
        "tools/ship/decisionIndex.mjs",
        "tools/ship/deletionHarness.mjs",
        "tools/ship/demosReach.mjs",
        "tools/ship/dockFraming.mjs",
        "tools/ship/doorKinds.mjs",
        "tools/ship/duplicateFiles.mjs",
        "tools/ship/ensureDxc.mjs",
        "tools/ship/fixtureLitter.mjs",
        "tools/ship/fixtures/tslBuilderThrows.mjs",
        "tools/ship/freezeLod.mjs",
        "tools/ship/freezeRegisterAudit.mjs",
        "tools/ship/gateMutation.mjs",
        "tools/ship/gateReport.mjs",
        "tools/ship/hookupState.mjs",
        "tools/ship/kernelReach.mjs",
        "tools/ship/launchIndex.mjs",
        "tools/ship/loopSearch.mjs",
        "tools/ship/morphCounter.mjs",
        "tools/ship/murmurSpeciesFrames.mjs",
        "tools/ship/nextRounds.mjs",
        "tools/ship/orphanDisposition.mjs",
        "tools/ship/orphanSets.mjs",
        "tools/ship/orreryAuthorScan.mjs",
        "tools/ship/orreryBake.mjs",
        "tools/ship/orreryReachedScan.mjs",
        "tools/ship/packFonts.mjs",
        "tools/ship/patternWidth.mjs",
        "tools/ship/pixelWorst.mjs",
        "tools/ship/planSnapshot.mjs",
        "tools/ship/pngWrite.mjs",
        "tools/ship/populationCensus.mjs",
        "tools/ship/predicatePairs.mjs",
        "tools/ship/probe/cpShim.mjs",
        "tools/ship/probe/fsPromisesShim.mjs",
        "tools/ship/probe/fsShim.mjs",
        "tools/ship/probe/hooks.mjs",
        "tools/ship/proseAudit.mjs",
        "tools/ship/recordInputs.mjs",
        "tools/ship/recordShape.mjs",
        "tools/ship/recordTier.mjs",
        "tools/ship/refusalStack.mjs",
        "tools/ship/registerRender.mjs",
        "tools/ship/registryOrphans.mjs",
        "tools/ship/removeCluster.mjs",
        "tools/ship/reportDoors.mjs",
        "tools/ship/roundTripCensus.mjs",
        "tools/ship/seamCensus.mjs",
        "tools/ship/serverShutdown.mjs",
        "tools/ship/settingsCensus.mjs",
        "tools/ship/shaderPairs.mjs",
        "tools/ship/shaderRefs.mjs",
        "tools/ship/shadowedHelper.mjs",
        "tools/ship/ship.mjs",
        "tools/ship/shipRitual.mjs",
        "tools/ship/shipVerdict.mjs",
        "tools/ship/slowCensus.mjs",
        "tools/ship/spellCost.mjs",
        "tools/ship/spriteSheetImport.mjs",
        "tools/ship/substance.mjs",
        "tools/ship/sweepRotation.mjs",
        "tools/ship/textureBytes.mjs",
        "tools/ship/todo.mjs",
        "tools/ship/tscResolve.mjs",
        "tools/ship/vacuity.mjs",
        "tools/ship/verify.mjs",
        "tools/ship/verifyLicenceTexts.mjs",
        "tools/ship/wasmTerrainStatus.mjs",
        "tools/ship/wgslDeviceLimits.mjs",
        "tools/ship/wiringClaims.mjs",
        "tools/voxelToolSystem.js",
        "ui/avatarExpression.js",
        "ui/gazeDwell.mjs",
        "ui/radarManager.js",
        "vendor/krbn/curve/types.js",
        "vendor/krbn/math/types.js",
        "vendor/krbn/pipeline/types.js",
        "vendor/krbn/shapes.js",
        "voxel/VoxelMesh.js",
        "voxel/voxelworld.js",
        "world/VoxelWorld.js",
        "world/autoExtremity.js",
        "world/copiedOutsideVendor.mjs",
        "world/licenceBodies.mjs",
        "world/licenceSweep.mjs",
        "world/namedNotChecked.mjs",
        "world/nodeGlPlatforms.mjs",
        "world/orreryUniverse.mjs",
        "world/populationPolicy.mjs",
        "world/terrainGenerator.js",
        "world/vendoredLicences.mjs",
    ]),
    // referenceKind-selfcheck: the subset of proseRescued whose rescuers include tools/ship/gateSweep.mjs --
    // the sweep closing the ship ritual REQUIRES every gate-adding round to write.
    ritualHidden: Object.freeze([
        "brain/agent/dispatch.js",
        "brain/rl/attribution.mjs",
        "brain/transport/scanTwin.mjs",
        "core/ecs/index.js",
        "engine/loop.js",
        "ev/tools/es-arena.mjs",
        "fx/paintFields.mjs",
        "math/solverFit.mjs",
        "mesh/carve.mjs",
        "physics/render/conductorFresnel.mjs",
        "physics/render/transmission.mjs",
        "physics/render/wgslArc.mjs",
        "render/img2three.mjs",
        "render/panini.js",
        "render/ringFloor.mjs",
        "render/slugTsl.mjs",
        "render/temporalLock.mjs",
        "render/texelProbe.mjs",
        "tools/export/glbConformance.mjs",
        "tools/mutate/mutate.mjs",
        "tools/mutate/shadowedDefaults.mjs",
        "tools/roundhouse/androidRunner.mjs",
        "tools/roundhouse/zeroRangeFull.mjs",
        "tools/ship/adapterRecord.mjs",
        "tools/ship/assertionShape.mjs",
        "tools/ship/budgetExile.mjs",
        "tools/ship/claimEvidence.mjs",
        "tools/ship/closingCoverage.mjs",
        "tools/ship/gateReport.mjs",
        "tools/ship/kernelReach.mjs",
        "tools/ship/murmurSpeciesFrames.mjs",
        "tools/ship/nextRounds.mjs",
        "tools/ship/orphanSets.mjs",
        "tools/ship/packFonts.mjs",
        "tools/ship/pngWrite.mjs",
        "tools/ship/recordInputs.mjs",
        "tools/ship/recordShape.mjs",
        "tools/ship/recordTier.mjs",
        "tools/ship/refusalStack.mjs",
        "tools/ship/reportDoors.mjs",
        "tools/ship/ship.mjs",
        "tools/ship/shipRitual.mjs",
        "tools/ship/shipVerdict.mjs",
        "tools/ship/sweepRotation.mjs",
        "tools/ship/textureBytes.mjs",
        "tools/ship/todo.mjs",
        "tools/ship/vacuity.mjs",
        "tools/ship/verify.mjs",
        "world/vendoredLicences.mjs",
    ]),
});

/**
 * The ratchet, as a value. Pure, takes the measured membership, and names both directions.
 *
 * "arrived" is the failure: a module in the census that the record does not list. "left" is progress and is
 * reported rather than asserted on, because the three routes out -- wire it, delete it, teach the census to
 * resolve -- are all things a round is supposed to be able to do freely.
 */
export function ratchet(name, measured) {
    const recorded = RECORDED[name];
    if (!recorded) throw new Error("orphanSets.ratchet: no recorded set named " + name);
    const was = new Set(recorded), now = new Set(measured);
    return Object.freeze({
        arrived: Object.freeze([...now].filter((m) => !was.has(m)).sort()),
        left: Object.freeze([...was].filter((m) => !now.has(m)).sort()),
        recorded: was.size, now: now.size,
    });
}

/** Every population this file records, so a gate can assert it covers all of them rather than a chosen two. */
export const POPULATIONS = Object.freeze(Object.keys(RECORDED));

/**
 * THE 26 MODULES ADMITTED AT v4673, EACH WITH WHAT IT IS -- so the baseline is a reckoning and not an
 * amnesty. Measured, not asserted: "gates" is the number of distinct gates that RESOLVE to it through
 * moduleRefs. A round that pays one of these down deletes its line here and its name from the sets above,
 * in the same edit.
 *
 * THE SHAPE OF THE TWENTY-SIX IS ITSELF A FINDING, and it is the next round's subject rather than this
 * one's: four are COMMANDS (ship.mjs, verify.mjs, nextRounds.mjs, androidRunner.mjs -- each provably
 * invoked by path from a non-gate, and unresolvable only because the path is COMPOSED), and four more are
 * SHARED GATE INFRASTRUCTURE by any reading (murmurSpeciesFrames 36 distinct gate importers, temporalLock
 * 18, ringFloor 12, adapterRecord 8). Neither population has a name in the census today, and v4075 already
 * refused to fold one such case into another ("a door of another shape ... gets its own name"). Naming them
 * is a CHANGE TO WHAT THE CENSUS MEASURES, and doing it in the same round that establishes this baseline
 * would move the population while its membership was being recorded -- two moving parts, and a baseline
 * that could no longer be checked against the historical one this round recovered.
 */
export const ADMITTED_V4673 = Object.freeze([
    Object.freeze({ module: "anim/reachIK.mjs", gates: 1 }),
    Object.freeze({ module: "brain/agent/dispatch.js", gates: 1 }),
    Object.freeze({ module: "math/solverFit.mjs", gates: 1 }),
    Object.freeze({ module: "mesh/colliderFromGLB.mjs", gates: 0 }),
    Object.freeze({ module: "nav/partitionScore.mjs", gates: 2 }),
    Object.freeze({ module: "nav/pathCost.mjs", gates: 1 }),
    Object.freeze({ module: "physics/character/capsuleSettle.mjs", gates: 1 }),
    Object.freeze({ module: "physics/character/groundProbe.mjs", gates: 3 }),
    Object.freeze({ module: "render/frameRecorder.mjs", gates: 1 }),
    Object.freeze({ module: "render/ringFloor.mjs", gates: 12 }),
    Object.freeze({ module: "render/temporalLock.mjs", gates: 18 }),
    Object.freeze({ module: "tools/roundhouse/androidRunner.mjs", gates: 3 }),
    Object.freeze({ module: "tools/ship/adapterRecord.mjs", gates: 8 }),
    Object.freeze({ module: "tools/ship/backlogAbsence.mjs", gates: 1 }),
    Object.freeze({ module: "tools/ship/budgetExile.mjs", gates: 2 }),
    Object.freeze({ module: "tools/ship/controllerAgreement.mjs", gates: 1 }),
    Object.freeze({ module: "tools/ship/ensureDxc.mjs", gates: 1 }),
    Object.freeze({ module: "tools/ship/fixtureLitter.mjs", gates: 3 }),
    Object.freeze({ module: "tools/ship/fixtures/tslBuilderThrows.mjs", gates: 0 }),
    Object.freeze({ module: "tools/ship/kernelReach.mjs", gates: 1 }),
    Object.freeze({ module: "tools/ship/murmurSpeciesFrames.mjs", gates: 36 }),
    Object.freeze({ module: "tools/ship/nextRounds.mjs", gates: 1 }),
    Object.freeze({ module: "tools/ship/pixelWorst.mjs", gates: 3 }),
    Object.freeze({ module: "tools/ship/ship.mjs", gates: 0 }),
    Object.freeze({ module: "tools/ship/sweepRotation.mjs", gates: 3 }),
    Object.freeze({ module: "tools/ship/verify.mjs", gates: 0 }),
]);

/** The five that LEFT between fc12eef and v4673 -- real paydown a count ratchet could not show. */
export const PAID_DOWN_SINCE_FC12EEF = Object.freeze(["anim/ik.mjs","tools/ship/absenceScope.mjs","tools/ship/recordDrift.mjs","tools/ship/wgslCorpus.mjs","vendor/three/jsm/loaders/FBXLoader.js"]);
