// WebGLEngine/render/ssaoCompare.mjs -- v3369
//
// *** TWO SSAO IMPLEMENTATIONS, AND THE ONE NOBODY LOOKS AT IS THE ONE WITH THE WRITE-UP. ***
//
// A status report called render/SSAOPass.js "proven better AO, never connected". Checked: it has NO GATE, so
// "proven" has no referent; it is not on the unwired register but in the ORPHAN machinery, which is a different
// claim; and orphanScan's own header already said the thing the report did not -- "347 lines, 2 exports, zero
// referrers -- while a SECOND SSAO lives inside bloomPass.js". THE SECOND ONE IS LIVE: main.js imports BloomPass.
//
// So "better" was never measured against anything, and this file exists so it can be. IT DOES NOT DECIDE.
//
// WHAT IS COMPARABLE FROM SOURCE (and is, below): sample count, sample geometry, resolution, radius model.
// Those are read off the two shaders and are facts.
// WHAT IS NOT: which one LOOKS right. That needs a rig, and no amount of reading settles it -- PROVEN CORRECT
// AND LOOKS RIGHT ON A SCREEN ARE DIFFERENT CLAIMS, which is why voxel-viewer's mesher flag was left to a human
// for 780 versions.
"use strict";

export const IMPLEMENTATIONS = {
    bloom: {
        label: "bloomPass SSAO", file: "render/bloomPass.js", status: "LIVE -- main.js imports BloomPass",
        samples: 8, geometry: "disc", resolution: "half", radiusModel: "screen-space band",
        note: "Round 52. Half-res depth-only AO, 8 rotated samples within a DISC; a sample whose depth is " +
              "closer to camera than the current pixel counts as an occluder.",
    },
    pass: {
        label: "SSAOPass", file: "render/SSAOPass.js", status: "ORPHAN -- zero referrers, NO GATE",
        samples: 16, geometry: "hemisphere", resolution: "full", radiusModel: "world-space radius (default 0.5)",
        note: "Round 299. Reconstructs view-space NORMALS from the depth buffer and samples a hemisphere " +
              "oriented by that normal, with a smoothstep range check.",
    },
};

/**
 * *** THE ONE DIFFERENCE THAT IS A CORRECTNESS CLAIM RATHER THAN A QUALITY ONE. ***
 * A DISC samples in a plane regardless of which way the surface faces, so half its samples land BEHIND the
 * surface -- a flat wall occludes itself and darkens for no reason. A HEMISPHERE oriented by the reconstructed
 * normal cannot do that. This is the classic SSAO artefact and it is the thing to look for FIRST on a rig: a
 * large flat surface at a glancing angle, which either dims or does not.
 */
export const FLAT_SURFACE_TEST =
    "A LARGE FLAT SURFACE AT A GLANCING ANGLE. A disc sampler places half its samples behind the surface and " +
    "darkens it; a normal-oriented hemisphere does not. This is a CORRECTNESS difference, not a taste one, and " +
    "it is the first thing to look at.";

/** Relative fragment cost, stated as arithmetic rather than a benchmark nobody ran. */
export function costRatio(a = IMPLEMENTATIONS.bloom, b = IMPLEMENTATIONS.pass) {
    const px = (r) => (r === "full" ? 1 : 0.25);
    const w = (i) => i.samples * px(i.resolution);
    return { a: w(a), b: w(b), ratio: w(b) / w(a) };
}

/**
 * *** WHAT THIS PAGE REFUSES TO DO. *** It will not rank them. The measurable axes favour bloom (8x cheaper)
 * and the geometric argument favours pass (no flat-surface self-occlusion), and NOTHING HERE WEIGHS THOSE
 * AGAINST EACH OTHER because the weighing is a judgement about how the engine should look -- Keith's, on a
 * screen, not mine from a source file.
 */
export const REFUSES_TO_RANK =
    "the measurable axes favour bloom and the geometric argument favours pass, and weighing them is a judgement " +
    "about how the engine should look rather than a fact recoverable from source";
