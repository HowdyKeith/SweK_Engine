// tools/ship/fsr2Coverage.mjs -- WHICH OF FSR2's PASSES THIS TREE HAS, AND WHICH OF THEM ANYTHING RUNS.
//
// *** "FSR2 IS COMPLETE" HAS BEEN A SENTENCE IN COMMIT MESSAGES AND NOWHERE ELSE. *** Fifteen rounds of
// this arc have added passes, and the only account of what is left has been prose in a closing line. This
// module makes the question answerable: a table of FSR2's dispatches against the modules that implement
// them, with two things DERIVED from the tree rather than asserted -- whether the named file exists, and
// whether fsr.html imports it.
//
// ---- WHAT IS DECLARED AND WHAT IS DERIVED, WHICH IS THE WHOLE HONESTY OF THE THING ------------------------
//
// *** THE MAPPING IS A DECLARATION AND NO CENSUS CAN MAKE IT FOR YOU. *** That render/temporalReject.mjs
// "is" ffx_fsr2_depth_clip is a judgement about two pieces of software, and a tool that inferred it from
// file names would be inventing a correspondence and reporting it as a measurement. So PASSES below is
// hand-written, and it is the part a reader should distrust.
//
// What the tool DERIVES, and what a gate can therefore hold:
//
//   exists   the named module is on disk. A row naming a file that was renamed or never written is the
//            cheapest way for this table to become a lie, and it is the one this catches for free.
//   wired    fsr.html imports it. The distinction matters because this arc has shipped passes that are
//            built, gated, correct and reachable by nothing -- render/luminancePyramidGPU.mjs is one
//            RIGHT NOW, deliberately, with the reason recorded at v4668. A table that counted those as
//            done would say FSR2 is finished while a quarter of it never runs.
//   status   derived from the two: "wired" | "gate-only" | "MISSING".
//
// The summary counts are derived from the rows. Nothing in this file reports a number a reader cannot
// recompute from the table beside it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { noComments } from "./sourceScan.mjs";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * FSR2's dispatches, in the order ffx_fsr2.cpp issues them, plus the two prerequisites that are not
 * dispatches but without which none of it means anything (the jitter, and the spatial pass RCAS).
 *
 * `files` is the DECLARATION. An empty array means this tree has nothing for that pass and says so.
 */
export const PASSES = Object.freeze([
    Object.freeze({ pass: "jitter (Halton phase, jittered + unjittered matrices)", dispatch: false,
                    files: ["render/jitter.mjs"] }),
    Object.freeze({ pass: "compute_luminance_pyramid", dispatch: true,
                    files: ["render/luminancePyramid.mjs", "render/luminancePyramidGPU.mjs"] }),
    Object.freeze({ pass: "auto-exposure APPLIED to the chain", dispatch: false,
                    files: [], note: "the pyramid and exposureFrom exist; nothing multiplies by the result. " +
                            "On [0,1] content the scale is 1, which v4668 measured rather than assumed." }),
    Object.freeze({ pass: "reconstruct_previous_depth: motion vectors", dispatch: true,
                    files: ["render/motionVectors.mjs", "render/motionVectorsGPU.mjs"] }),
    Object.freeze({ pass: "reconstruct_previous_depth: per-object motion", dispatch: true,
                    files: ["render/objectMotion.mjs", "render/objectMotionGPU.mjs"] }),
    Object.freeze({ pass: "reconstruct_previous_depth: DILATED depth and motion", dispatch: true,
                    files: ["render/dilate.mjs", "render/dilateGPU.mjs"] }),
    Object.freeze({ pass: "depth_clip (disocclusion)", dispatch: true,
                    files: ["render/temporalReject.mjs", "render/temporalRejectGPU.mjs"] }),
    Object.freeze({ pass: "create_locks", dispatch: true,
                    files: ["render/temporalLock.mjs", "render/temporalLockGPU.mjs"] }),
    Object.freeze({ pass: "autogen_reactive (the derived mask)", dispatch: true,
                    files: ["render/reactive.mjs", "render/reactiveGPU.mjs"] }),
    Object.freeze({ pass: "accumulate: jitter-aware Lanczos resolve", dispatch: true,
                    files: ["render/temporalResolve.mjs"] }),
    Object.freeze({ pass: "accumulate: reproject and blend", dispatch: true,
                    files: ["render/temporalAccumulate.mjs", "render/temporalGPU.mjs"] }),
    Object.freeze({ pass: "rcas (and the EASU spatial half)", dispatch: true,
                    files: ["fx/fsr/fsr.js", "fx/fsr/fsrGPU.js"] }),
    Object.freeze({ pass: "TCR: transparency & composition reactive", dispatch: true,
                    files: [], note: "FSR2 derives a second mask by comparing the opaque-only frame with " +
                            "the composed one. This tree has the transparent CONTENT since v4669 and an " +
                            "application-supplied mask since v4670, but no opaque-vs-composed comparison." }),
    Object.freeze({ pass: "single-pass SPD for the pyramid", dispatch: true,
                    files: [], note: "an optimisation, not a capability: luminancePyramidGPU dispatches " +
                            "once per mip and computes the same numbers. Named here so the table is not " +
                            "read as claiming a like-for-like implementation." }),
]);

/** The page whose imports decide whether a pass is WIRED or merely present. */
export const CALLER = "fsr.html";

export function coverage({ eng = ENG } = {}) {
    const callerSrc = noComments(fs.readFileSync(path.join(eng, CALLER), "utf8"));
    const rows = PASSES.map((p) => {
        const exists = p.files.map((f) => fs.existsSync(path.join(eng, f)));
        const missingFiles = p.files.filter((f, i) => !exists[i]);
        // an import of ANY of a pass's files counts as wiring it: the CPU mirror and the runner are one
        // pass, and the page picks between them at runtime by whether it has an adapter.
        const wired = p.files.some((f) => callerSrc.includes(`"./${f}"`) || callerSrc.includes(`'./${f}'`));
        const status = p.files.length === 0 ? "MISSING" : wired ? "wired" : "gate-only";
        return { ...p, missingFiles, wired, status };
    });
    const by = (s) => rows.filter((r) => r.status === s);
    return { rows,
             wired: by("wired").length, gateOnly: by("gate-only").length, missing: by("MISSING").length,
             total: rows.length,
             brokenRows: rows.filter((r) => r.missingFiles.length > 0) };
}
