// tools/ship/morphCounter.mjs
//
// v3530 -- THE FRONT DOOR FOR THE DERIVED STROKE MORPH: A COUNTER, PRINTED.
//
// A MODULE WITH NO CALLER IS UNFINISHED, and strokeMorph.mjs shipped with only a gate. This is its consumer --
// Keith's own question, "could we count with the morph effect, from 1 to 2, etc" -- and it is the reason the
// module exists at all: a fifth thing with no consumer would be the greedyMesh3d situation.
//
// IT PRINTS THE FRAMES AS CHARACTERS, on v3509's precedent. That round found both halves of an argument had
// been in the tree the whole time -- a renderer returning numbers and an asciifier turning numbers into text --
// and putting them together let the sandbox SEE a path trace for the first time in forty rounds. Same here: a
// morph is a shape and the numbers say it is bounded, but only a picture says whether it looks like a digit on
// the way across. AND THE PICTURE IS NOT THE CHECK -- strokeMorph-selfcheck decides, this shows.
//
// NO CANVAS, NO DOM, NO GPU. The glyphs are polylines and the raster is a nearest-cell walk, so this runs in
// the same node the gates run in.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as SM from "../../physics/mesh/strokeMorph.mjs";

const W = 13, H = 13, N = 64;
// The glyph box is 24x24 in the stroke data; the raster maps that box and nothing else, so a stroke drifting
// outside it CLIPS VISIBLY rather than being silently rescaled into looking fine.
const BOX = 24;

export function frame(pts) {
    const grid = Array.from({ length: H }, () => Array(W).fill(" "));
    const plot = (x, y) => {
        const cx = Math.round((x / BOX) * (W - 1)), cy = Math.round((y / BOX) * (H - 1));
        if (cx >= 0 && cx < W && cy >= 0 && cy < H) grid[cy][cx] = "#";
    };
    for (let i = 1; i < pts.length; i++) {
        // Walk the segment so a sparse sample set still draws a connected stroke -- a per-point plot would
        // show dots and invite "the morph is broken" for a reason that is the RASTER'S and not the morph's.
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
        for (let s = 0; s <= steps; s++) plot(x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps);
    }
    return grid.map((r) => r.join(""));
}

/** One transition, as `cols` side-by-side frames. */
export function transition(from, to, cols = 5) {
    const a = SM.resample(SM.parseStroke(SM.DIGIT_STROKES[from]), N);
    const b = SM.resample(SM.parseStroke(SM.DIGIT_STROKES[to]), N);
    const { target, reversed } = SM.pairStrokes(a, b);
    const frames = [];
    for (let c = 0; c < cols; c++) frames.push(frame(SM.morphAt(a, target, c / (cols - 1))));
    const rows = [];
    for (let y = 0; y < H; y++) rows.push(frames.map((f) => f[y]).join("  "));
    return { rows, reversed, lenFrom: SM.totalLength(a), lenTo: SM.totalLength(target) };
}

export function reportLines(pairs = [[1, 2], [2, 3], [9, 0]]) {
    const L = ["[morphCounter] the derived stroke morph, counting"];
    L.push("  " + N + " samples per glyph, frames at t = 0, .25, .5, .75, 1");
    for (const [from, to] of pairs) {
        const t = transition(from, to);
        L.push("");
        L.push("  " + from + " -> " + to + "   length " + t.lenFrom.toFixed(2) + " -> " + t.lenTo.toFixed(2) +
               (t.reversed ? "   (target pairing REVERSED -- shorter travel)" : ""));
        for (const r of t.rows) L.push("    " + r);
    }
    L.push("");
    L.push("  THE PICTURE IS NOT THE CHECK. strokeMorph-selfcheck decides: endpoints are IDENTITIES, arc length");
    L.push("  never exceeds the longer endpoint, 1->2->1 returns the original, and 9->0 takes the same path as");
    L.push("  every other adjacent pair. This is here so a person can see whether it still looks like a digit");
    L.push("  halfway across, which no number in that gate asks.");
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
