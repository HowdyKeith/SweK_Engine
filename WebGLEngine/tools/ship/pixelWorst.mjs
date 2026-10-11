// WebGLEngine/tools/ship/pixelWorst.mjs -- v4649
//
// *** WHERE THE WORST PIXEL IS, NOT JUST HOW FAR OFF IT IS. ***
//
// The slug gates compare a device render against a CPU rasterisation model and report a single number:
// "worst 16". Keith's box sends back exactly that and nothing else. 16 of 255 is not rounding -- it is a
// coverage rule, a sample position or a filter differing -- and WHICH of those it is depends entirely on
// which pixel it is. An edge pixel at low coverage is an anti-aliasing rule; the glyph interior, where
// coverage is saturated, is something no AA rule can explain.
//
// This is deliberately NOT a per-adapter record. A number recorded is a number nobody looks at again, and
// recording 16 as "what this adapter does" would have closed a red by agreeing with it. What the gates owe
// a reader on another box is a DIAGNOSIS, and this is the smallest thing that gives one.
//
// Its own module rather than an export from a gate: importing a selfcheck runs that selfcheck, top-level
// console.log, process.exit and all. The first version of this did exactly that and would have run the whole
// slugFill gate inside slugMorph.
"use strict";

/** `a` is { i, j, cov, want, got } or null. Coverage outside [0.02, 0.98] is an edge pixel. */
export function whereWorst(a) {
    if (!a) return "no pixel over 0";
    return `at (${a.i},${a.j}) coverage ${a.cov.toFixed(4)}, model wants ${a.want}, device gave ${a.got}` +
        (a.cov < 0.02 || a.cov > 0.98
            ? " -- an EDGE pixel, so a coverage rule or a sample position"
            : " -- INSIDE the glyph, where coverage is saturated and no anti-aliasing rule can explain it");
}
