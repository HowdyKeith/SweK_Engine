// WebGLEngine/gfx/pipelineGaps.mjs -- v4480
//
// *** A SURVEY OF THE TSL/WebGPU PIPELINE, AND TWO OF ITS SIX FINDINGS WERE WRONG. ***
//
// Keith asked what was missing from the TSL/WebGPU path. Six gaps were named. Two shipped as rounds (the GPU
// clock at v4478, blend state at v4479) and each of THOSE rounds found the survey had overclaimed something.
// This file is the remaining four, measured, with the verdicts as data so a gate can hold them -- including the
// two that turned out to be "already solved" and "do not build this".
//
// A survey that only records what it got right is a worse instrument than one that records what it got wrong,
// because the second can be checked. Every row below carries `verdict` and every one is graded.
//
// ---- WHAT EACH OF THE FOUR TURNED OUT TO BE ------------------------------------------------------------------
//
// DEVICE LOSS -- REAL, AND FIXED HERE. blackhole.html, fluid-webgpu.html and mpm-gpu.html each wire
// device.lost; gfx/device.js, the layer they all go through, did not. The one-off demos were more robust than
// the abstraction. And pushErrorScope / uncapturederror appeared in exactly three files, ALL OF THEM GATES --
// the test harness caught the validation errors the running engine dropped. Both now live in device.js.
//
// TSL AT BUILD TIME -- *** ALREADY THE TREE'S PRACTICE, AND THE SURVEY MISSED IT. *** The proposal was
// "compile the TSL graphs once at ship time, emit both texts, vendor the output". tools/ship/ ALREADY HOLDS
// tsl-emitted-race.json, tsl-emitted-physics.json and tsl-emitted-compute.json, stamped with the round that
// wrote them and the three version that emitted them, with FIVE readers. The architecture exists. What does
// NOT exist is the property that would make it safe to extend: nothing compares a FRESH emit to the stored
// artifact. The gates re-emit on every run and then assert the file exists and is over a thousand characters.
// So the open question is not "build codegen" -- it is "is the emitted text reproducible", and that is what
// this round adds a check for rather than a compiler.
//
// RENDER BUNDLES -- *** REFUSED, WITH A NUMBER. *** render/gpuDriven.mjs already draws through
// drawIndexedIndirect per (fleet, LOD) region, with instancing, and the GPU decides the instance count. Ten
// races times five LODs is FIFTY indirect draws at the ceiling. A render bundle amortises CPU-side draw
// recording; there is nothing here to amortise. #133's rule -- find the consumer before taking the solver --
// refuses this, and the refusal is the finding.
//
// MSAA -- *** ABSENT ON PURPOSE, WITH THE REASON MEASURED IN 2021's WORDS. *** Already settled at v4479 and
// recorded here so the question does not get asked a third time: a WebGL2 canvas defaults to multisampling and
// WebGPU renders one sample per pixel, which made 3,417 of 65,536 pixels differ, and Level 11 chose
// antialias:false because "parity is the promise, so the default is the setting both can keep".
//
// ---- AND THREE NAMING COLLISIONS THE SURVEY WALKED INTO -------------------------------------------------------
//
// Every one of these made a grep for adoption read the opposite of the truth, and #144's register is where they
// belong. They are listed as data because a name that means two things is found by looking, not by remembering.
"use strict";

/** A survey row. `verdict` is the whole point: three of the six were not what the survey first said. */
export const VERDICTS = Object.freeze(["fixed", "already-solved", "refused", "open"]);

export const GAPS = Object.freeze([
    Object.freeze({
        id: "gpu-timing", verdict: "fixed", at: "v4478",
        was: "the tree timed the GPU through EXT_disjoint_timer_query_webgl2 and had no timestamp-query anywhere",
        now: "gfx/gpuTimer.mjs, with a calibrated noise floor and a refusal below it",
    }),
    Object.freeze({
        id: "blend", verdict: "fixed", at: "v4479",
        was: "gl.BLEND, blendFunc and blendEquation appeared zero times in gfx/device.js",
        now: "four named modes on all three backends, agreeing across backends and with the arithmetic",
    }),
    Object.freeze({
        id: "device-loss", verdict: "fixed", at: "v4480",
        was: "device.lost wired in three one-off pages and NOT in the layer they all go through; " +
             "pushErrorScope and uncapturederror only ever in gates, never in shipping code",
        now: "both in gfx/device.js, with reason 'destroyed' excluded because that is a deliberate teardown",
    }),
    Object.freeze({
        id: "tsl-build-time", verdict: "already-solved", at: "v4480",
        was: "the survey proposed emitting both texts at ship time and vendoring the output, as new work",
        now: "tools/ship/tsl-emitted-{race,physics,compute}.json already exist with five readers. THE OPEN " +
             "QUESTION IS REPRODUCIBILITY: nothing compares a fresh emit to the stored artifact",
    }),
    Object.freeze({
        id: "render-bundles", verdict: "refused", at: "v4480",
        was: "createRenderBundle appears zero times, and the orrery and fleets issue many small draws",
        now: "they do not. gpuDriven.mjs draws per (fleet, LOD) region through drawIndexedIndirect with " +
             "instancing -- 50 indirect draws at the ceiling. A bundle would amortise nothing",
    }),
    Object.freeze({
        id: "msaa", verdict: "already-solved", at: "v4479",
        was: "sampleCount appears zero times, so there is no multisampling",
        now: "there is none ON PURPOSE: 3,417 of 65,536 pixels differed between backends and Level 11 chose " +
             "antialias:false, because parity is the promise and one sample is what both can keep",
    }),
]);

/** *** THE THREE NAMES THAT MEAN TWO THINGS, WHICH IS HOW THE SURVEY GOT THEM WRONG. *** #144's family. */
export const NAME_COLLISIONS = Object.freeze([
    Object.freeze({ token: "Fn(\"swk_", evidenceFile: "physics/xpbd/rigidCouple-selfcheck.mjs",
        looksLike: "three.js TSL's Fn() node builder",
        actuallyIs: "a WASM export lookup, Fn(\"swk_world_create\")",
        cost: "a grep for TSL adoption reads twelve hits that are not TSL at all" }),
    Object.freeze({ token: "every one an edge blended", evidenceFile: "gfx/device.js",
        looksLike: "blend state in gfx/device.js",
        actuallyIs: "one COMMENT about MSAA edge antialiasing -- the file had no blend state whatsoever",
        cost: "the survey cited it as evidence of the thing it was not evidence of" }),
    Object.freeze({ token: "sampleCount", evidenceFile: "engine/MtoRenderer.js",
        looksLike: "MSAA sample count",
        actuallyIs: "a count of DATA samples, used to pick an instance count",
        cost: "a grep for MSAA adoption reads as present when there is none" }),
]);

/** Counts a gate can hold, and which the survey got wrong before it got them right. */
export const MEASURED_AT_V4480 = Object.freeze({
    gapsSurveyed: 6,
    fixed: 3,                       // gpu-timing, blend, device-loss
    alreadySolved: 2,               // tsl-build-time, msaa -- the survey's two overclaims
    refused: 1,                     // render-bundles
    surveyWrongAbout: 3,            // and that is the number worth remembering
    // The render-bundle refusal, as arithmetic rather than opinion.
    races: 10, maxLods: 5, indirectDrawCeiling: 50,
    // The device-loss inversion, before.
    pagesWithLossHandling: 3,       // blackhole.html, fluid-webgpu.html, mpm-gpu.html
    sharedLayerHadIt: false,
    errorScopeFilesAllGates: 3,     // webgpuHarness.mjs, tslSource-selfcheck, tslPhysics-selfcheck
    // The TSL artifacts that already existed.
    emittedArtifacts: 3, emittedReaders: 5, emittedPinnedThree: "0.178.0",
    freshEmitComparedToStored: false,   // *** THE ACTUAL OPEN QUESTION ***
    nameCollisions: 3,
});

/** Rows by verdict, so a caller asks the survey a question rather than reading its prose. */
export const byVerdict = (v) => GAPS.filter((g) => g.verdict === v);
