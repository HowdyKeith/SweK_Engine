// render/flowCost.mjs -- v4748 -- WHAT THE OPTICAL FLOW COSTS, COUNTED RATHER THAN TIMED.
//
// Frame generation with `flow` (fx/fsr/fsrFrameGenTsl.mjs) runs render/opticalFlowTsl.mjs's pyramid and search and
// render/flowReconcileTsl.mjs's reconciliation every generated frame. This counts what they read. The count is the cost
// model because timing on this tree's device -- SwiftShader, a CPU rasteriser -- says little about a GPU: there the
// generator's splat, 65 536 instanced quads at 256 x 256, takes 1.5 s and the whole flow 0.17 s, a ratio a GPU inverts.
// The search, though, is texture reads and nothing else, and fx/fsr/fsrFlowCost-selfcheck.mjs holds the device's time for
// it to the count's ratios; render/flowCost-selfcheck.mjs holds the count to the reads render/opticalFlow.mjs's mirror makes.
//
// The search, per level: one texel per BLOCK at every level (the patch stays `block` pixels wide at every level --
// opticalFlowCPU's note says why), each scoring the guess, then (2r + 1)^2 candidates, then standing still, and at level 0
// four more for the sub-pixel vertex; each score two reads a patch pixel. r is `searchRadius` at the coarsest level and
// `refineRadius` below it (v4748). The reach -- the largest displacement the search can return -- is the sum over levels
// of r * 2^L. The pyramid: per frame, a luma pass at full size and a 2 x 2 average per level above it. The reconciliation
// per pixel ("pixel" mode): two window scores, each (2 radius + 1)^2 pixels read twice, and a handful of loads.
// v4753: `grid` "level" gives each level its own grid, ceil(lw / block) x ceil(lh / block) blocks, and each block below the
// coarsest scores four guesses -- its parent's and three neighbours' -- reading all four from the level above.
"use strict";

/** The levels a pyramid for w x h builds, capped at `levels`: [[lw, lh], ...], level 0 first. */
export function pyramidSizes(w, h, levels) {
    const sizes = [[w, h]];
    while (sizes.length < levels && (sizes[sizes.length - 1][0] > 1 || sizes[sizes.length - 1][1] > 1)) {
        const [cw, ch] = sizes[sizes.length - 1]; sizes.push([Math.ceil(cw / 2), Math.ceil(ch / 2)]);
    }
    return sizes;
}

/**
 * The flow's reads for one frame pair at w x h: { levels, perLevel: [{ L, radius, blocks, scores, reads }], search,
 * pyramid, reconcile, total, reach } -- reads counted as texture loads, reach in full-resolution pixels. `reconcileRadius`
 * is render/flowReconcileTsl.mjs's pixel window (1).
 */
export function flowCostModel({ w, h, block = 8, searchRadius = 4, refineRadius = null, levels = 3, subpixel = true, reconcileRadius = 1, grid = "block" }) {
    if (!(w >= 1 && h >= 1)) throw new Error(`render/flowCost: w and h must be at least 1 -- got ${w} x ${h}`);
    if (!(block >= 2) || block !== Math.floor(block)) throw new Error(`render/flowCost: block must be a whole number of pixels, at least 2 -- got ${block}`);
    if (grid !== "block" && grid !== "level") throw new Error(`render/flowCost: grid must be "block" or "level" -- got ${grid}`);
    if (refineRadius === null) refineRadius = searchRadius;
    for (const [k, v] of [["searchRadius", searchRadius], ["refineRadius", refineRadius], ["levels", levels]])
        if (!(v >= 1) || v !== Math.floor(v)) throw new Error(`render/flowCost: ${k} must be a whole number, at least 1 -- got ${v}`);
    const sizes = pyramidSizes(w, h, levels), top = sizes.length - 1;
    const lvl = grid === "level", patch = 2 * block * block;
    const perLevel = [];
    let search = 0, reach = 0;
    for (let L = top; L >= 0; L--) {
        const r = L === top ? searchRadius : refineRadius, guesses = lvl && L !== top ? 4 : 1;
        const blocks = lvl ? Math.ceil(sizes[L][0] / block) * Math.ceil(sizes[L][1] / block) : Math.ceil(w / block) * Math.ceil(h / block);
        const scores = guesses + (2 * r + 1) ** 2 + 1 + (L === 0 && subpixel ? 4 : 0);   // the guess(es), the window, standing still, the vertex
        const reads = blocks * scores * patch + (L === top ? 0 : blocks * guesses);       // and each block's guesses from the level above
        perLevel.push({ L, radius: r, blocks, scores, reads });
        search += reads; reach += r * (1 << L);
    }
    // both frames' pyramids: level 0 reads one colour texel a pixel, each level above reads four of the one below
    let pyramid = 0; for (let L = 0; L < sizes.length; L++) pyramid += 2 * sizes[L][0] * sizes[L][1] * (L === 0 ? 1 : 4);
    const win = (2 * reconcileRadius + 1) ** 2, reconcile = w * h * (2 * 2 * win + 4);   // two window scores, and the pixel's own loads
    return { levels: sizes.length, perLevel, search, pyramid, reconcile, total: search + pyramid + reconcile, reach };
}
