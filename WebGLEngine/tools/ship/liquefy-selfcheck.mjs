// WebGLEngine/tools/ship/liquefy-selfcheck.mjs -- v4202
//
// GATES math/segment.mjs, render/liquefyModel.mjs and ui/domLiquefy.js -- a displacement field that REMEMBERS.
//
// *** THIS FILE EXISTS BECAUSE I SEARCHED FOR A SPELLING AND REPORTED AN ABSENCE. *** Assessing
// positlabs/spark-liquefy I grepped for `sdSegment` and `sdLine`, found neither, and wrote down that this tree
// had no point-to-segment distance anywhere. physics/soft/boneField.js has had one since v2523 -- private, 3D,
// unexported, and carrying the same comment about the clamp. Section 1 grades the extracted copy against a
// FINGERPRINT OF THE BONE FIELD taken before the extraction, so "the refactor changed nothing" is a measured
// fact and not a hope.
//
// *** AND THE STATE IS THE NEW THING, NOT THE SMUDGE. *** The five radial shaders of v4196 -- touchRipple,
// liveRipple, shockwave, gravityWells, refractLens -- recompute their entire displacement from `time` every
// frame. Nothing carries over. Liquefy's field IS its state, so it is the first displacement in this tree that
// engine/frameDirty.js has to be able to call QUIET, and an exponential decay never reaches zero. Section 4
// measures how long "wait for zero" waits.
//
// Run: node tools/ship/liquefy-selfcheck.mjs

import { closestT2, distToSegment2, closestT3, distToSegment3, distToLine2, DEGENERATE } from "../../math/segment.mjs";
import { makeField, stampStroke, decayField, peakDisplacement, isQuiet, displacementAt, warp, QUIET_PX }
    from "../../render/liquefyModel.mjs";
import { boneField, boneBounds, fitGrid } from "../../physics/soft/boneField.js";
import { codeOnly, noComments } from "./sourceScan.mjs";
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");

// 1) *** THE BONE FIELD IS BYTE-IDENTICAL ACROSS THE EXTRACTION. ***
//    The numbers below were computed by running this exact recipe against the PRE-REFACTOR boneField.js, kept
//    aside before the edit. Not a golden value this file generated from the code it is grading -- a value the
//    old code produced, asserted against the new one.
{
    const bones = [
        { a: [0, 0, 0],       b: [1, 0, 0],       r: 0.18 },
        { a: [1, 0, 0],       b: [1.5, 0.7, 0.2], r: 0.14 },
        { a: [0, 0, 0],       b: [0.2, -1.0, 0],  r: 0.22 },
        { a: [0.5, 0, 0],     b: [0.5, 0, 0],     r: 0.30 },   // a == b: the len2 <= DEGENERATE branch
    ];
    const g = fitGrid(bones, 16, 0.05);
    const f = boneField(bones, g.dimX, g.dimY, g.dimZ, { origin: g.origin, cellSize: g.cellSize, blend: 0.05 });
    let sum = 0, min = Infinity, max = -Infinity, neg = 0;
    for (let i = 0; i < f.length; i++) { sum += f[i]; if (f[i] < min) min = f[i]; if (f[i] > max) max = f[i]; if (f[i] < 0) neg++; }
    ok(f.length === 1920 && g.dimX === 15 && g.dimY === 16 && g.dimZ === 8,
        `the fitted grid is still 15x16x8 = ${f.length} cells`);
    ok(sum === 860.2220349703275, `the bone field sums to exactly 860.2220349703275 as it did before the move (got ${sum})`);
    ok(min === -0.21394360065460205, `deepest point inside the flesh unchanged: ${min}`);
    ok(max === 1.533807635307312, `furthest point outside unchanged: ${max}`);
    ok(neg === 88, `and the same 88 cells are inside the surface`);
    const bb = boneBounds(bones, 0);
    ok(bb.min[1] === -1.22 && bb.max[0] === 1.6400000000000001, "boneBounds is untouched by the move");
    // The grid has to actually EXERCISE the clamp, or the fingerprint above proves only that arithmetic is
    // deterministic. Count cells whose closest point is an endpoint rather than the interior.
    let capped = 0, interior = 0;
    for (let z = 0; z < g.dimZ; z++) for (let y = 0; y < g.dimY; y++) for (let x = 0; x < g.dimX; x++) {
        const p = [g.origin[0] + x * g.cellSize, g.origin[1] + y * g.cellSize, g.origin[2] + z * g.cellSize];
        const t = closestT3(p[0], p[1], p[2], 0, 0, 0, 1, 0, 0);
        if (t === 0 || t === 1) capped++; else interior++;
    }
    ok(capped > 0 && interior > 0,
        `the fingerprint grid straddles the clamp: ${capped} cells land on a cap, ${interior} on the segment's interior`);
}

// 2) *** THE CLAMP IS THE WHOLE FUNCTION, AND distToLine2 IS HERE TO SHOW WHAT IT BUYS. ***
{
    // Between the endpoints the two agree exactly -- that is why the bug hides.
    let worst = 0;
    for (let i = 0; i <= 20; i++) {
        const t = i / 20, px = 2 + t * 6, py = 5;
        worst = Math.max(worst, Math.abs(distToSegment2(px, py + 3, 2, 5, 8, 5) - distToLine2(px, py + 3, 2, 5, 8, 5)));
    }
    ok(worst < 1e-12, `clamped and unclamped agree to ${worst.toExponential(1)} everywhere BETWEEN the endpoints`);
    // Past an endpoint they disagree by the whole overshoot.
    ok(Math.abs(distToSegment2(100, 5, 2, 5, 8, 5) - 92) < 1e-9, "92 px past the end, the segment is 92 px away");
    ok(distToLine2(100, 5, 2, 5, 8, 5) < 1e-9, "...and the infinite line is 0 px away, because the line goes there");
    // What that costs a stroke: the same 40px stroke stamped both ways, counting cells within the radius.
    const W = 400, H = 200, RAD = 30;
    const count = (fn) => { let n = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
        if (fn(x + 0.5, y + 0.5, 180, 100, 220, 100) < RAD) n++; return n; };
    const seg = count(distToSegment2), lin = count(distToLine2);
    ok(seg === 5228, `a 40px stroke with a 30px radius touches ${seg} cells`);
    ok(lin === 24000 && lin === H_band(H, RAD) * W,
        `the unclamped form touches ${lin} -- ${(lin / seg).toFixed(1)}x, the FULL WIDTH of the field, 10x the stroke's own length`);
    // Degeneracy: a == b is a point, and t is arbitrary rather than NaN.
    ok(closestT2(9, 9, 3, 3, 3, 3) === 0, "a zero-length segment yields t=0, not a division by zero");
    ok(Math.abs(distToSegment2(3, 7, 3, 3, 3, 3) - 4) < 1e-12, "...and measures distance to that single point");
    ok(DEGENERATE > 0 && closestT2(9, 9, 0, 0, Math.sqrt(DEGENERATE) / 2, 0) === 0,
        "a segment shorter than sqrt(DEGENERATE) is treated as a point");
    // closestT is exposed because callers need WHERE, not just how far.
    ok(closestT2(5, 99, 2, 5, 8, 5) === 0.5, "closestT2 reports the midpoint as t=0.5");
    ok(closestT2(-50, 5, 2, 5, 8, 5) === 0 && closestT2(50, 5, 2, 5, 8, 5) === 1, "and clamps to 0 and 1 outside");
    // The 3D case still is the 2D case with a zero z.
    let d3 = 0;
    for (const [px, py] of [[0, 0], [5, 5], [100, 3], [-9, 2]])
        d3 = Math.max(d3, Math.abs(distToSegment3(px, py, 0, 2, 5, 0, 8, 5, 0) - distToSegment2(px, py, 2, 5, 8, 5)));
    ok(d3 < 1e-12, `distToSegment3 with z=0 equals distToSegment2 to ${d3.toExponential(1)}`);
}
function H_band(H, r) { let n = 0; for (let y = 0; y < H; y++) if (Math.abs(y + 0.5 - 100) < r) n++; return n; }

// 3) *** THE STROKE IS A SWEPT SEGMENT, AND THE GAPS ARE MEASURED RATHER THAN ASSERTED. ***
//    A 600px swipe in 0.2s arrives as 24 samples at 120Hz, 12 at 60Hz, 6 at 30Hz -- 25, 50 and 100 px apart.
//    Discs at the samples leave craters; the segment covers the path.
{
    const W = 800, H = 200, y = 100;
    const line = (field) => { const out = []; for (let x = 100; x <= 700; x++) {
        const i = y * W + x; out.push(Math.hypot(field.dx[i], field.dy[i])); } return out; };
    const samples = (jump) => { const xs = []; for (let x = 100; x <= 700; x += jump) xs.push(x);
        if (xs[xs.length - 1] !== 700) xs.push(700); return xs; };

    for (const [jump, expectHoles] of [[25, 0], [50, 21], [100, 281]]) {
        const xs = samples(jump);
        const seg = makeField(W, H);
        for (let i = 1; i < xs.length; i++) stampStroke(seg, xs[i - 1], y, xs[i], y, { strength: 12, radius: 40 });
        const dots = makeField(W, H);
        for (let i = 1; i < xs.length; i++) stampStroke(dots, xs[i] - 1e-6, y, xs[i] + 1e-6, y, { strength: 12, radius: 40 });
        const segHoles = line(seg).filter((v) => v < QUIET_PX).length;
        const dotHoles = line(dots).filter((v) => v < QUIET_PX).length;
        ok(segHoles === 0, `${jump}px between pointer samples: the swept segment leaves 0 cells below the quiet floor`);
        ok(dotHoles === expectHoles, `...and discs at the samples leave ${dotHoles} (expected ${expectHoles})`);
    }
    // The segment's floor does not depend on the pointer rate. The dots' does, badly.
    const floor = (jump, mode) => { const xs = samples(jump); const f = makeField(W, H);
        for (let i = 1; i < xs.length; i++) mode === "seg"
            ? stampStroke(f, xs[i - 1], y, xs[i], y, { strength: 12, radius: 40 })
            : stampStroke(f, xs[i] - 1e-6, y, xs[i] + 1e-6, y, { strength: 12, radius: 40 });
        return Math.min(...line(f)); };
    const s50 = floor(50, "seg"), s100 = floor(100, "seg"), s150 = floor(150, "seg");
    ok(s50 === s100 && s100 === s150 && Math.abs(s50 - 11.477) < 0.001,
        `the segment holds the same ${s50.toFixed(3)}px floor at 50, 100 and 150px between samples`);
    ok(floor(25, "dot") < 1.2 && floor(25, "dot") > 0,
        `while at 25px apart -- a 120Hz pointer, the BEST case -- dots already dip to ${floor(25, "dot").toFixed(3)}px`);
    // The bbox limit is an optimisation, so it must not change the answer: a stroke's touched count is exactly
    // the cells within the radius, no more.
    //
    // *** WITH INTEGER ENDPOINTS AND AN INTEGER RADIUS THIS CHECK IS BLIND, AND MY FIRST DRAFT USED EXACTLY
    // THOSE. *** Sabotaging the box to `floor(max + radius) - 1` left the gate GREEN, because at 90->110 with
    // radius 15 the right edge lands on 125.0, the last column holding a cell centre inside the radius is 124,
    // and the column the shrunken box drops is empty. The boundary column is only load-bearing when the edge
    // falls in a fractional band -- and pointer coordinates are essentially never integers, so the blind case
    // was the ONLY case I tested. The strokes below are fractional and diagonal, and the last assertion
    // proves the set actually reaches a column a one-off box would drop.
    const STROKES = [
        [90, 100, 110, 100, 15],            // the original: axis-aligned, integer, edge at 125.0
        [90.2, 100.4, 110.2, 100.4, 15.5],  // edge at 125.7 -- column 125 is inside AND would be dropped
        [40.6, 30.1, 150.3, 170.9, 12.25],  // diagonal, every bbox side fractional
        [10.5, 10.5, 10.5, 10.5, 9.75],     // degenerate: a disc, where the bbox is squarest
    ];
    let bearing = 0;
    for (const [ax, ay, bx, by, radius] of STROKES) {
        const f = makeField(200, 200);
        const touched = stampStroke(f, ax, ay, bx, by, { strength: 5, radius });
        let inside = 0, outside = 0;
        for (let yy = 0; yy < 200; yy++) for (let xx = 0; xx < 200; xx++) {
            const d = distToSegment2(xx + 0.5, yy + 0.5, ax, ay, bx, by);
            if (d < radius) inside++;
            else if (f.dx[yy * 200 + xx] || f.dy[yy * 200 + xx]) outside++;
        }
        ok(touched === inside, `stroke (${ax},${ay})->(${bx},${by}) r${radius}: the box stamps exactly the ${inside} cells inside the radius`);
        ok(outside === 0, `...and nothing outside it`);
        // Does this stroke reach the column a floor()-1 box would drop?
        const edge = Math.max(ax, bx) + radius;
        if (Math.ceil(edge - 0.5) - 1 >= Math.floor(edge)) bearing++;
    }
    ok(bearing > 0, `${bearing} of the ${STROKES.length} strokes put a live cell in the outermost bbox column, so shrinking the box by one is visible`);
    // A stroke off the edge clips instead of writing out of bounds.
    const edge = makeField(64, 64);
    ok(stampStroke(edge, -200, -200, -150, -150, { radius: 10 }) === 0, "a stroke entirely off-canvas stamps nothing");
    ok(stampStroke(edge, -5, 32, 5, 32, { radius: 10 }) > 0, "a stroke straddling the left edge stamps the part that is on it");
    ok(edge.dx.every(Number.isFinite) && edge.dy.every(Number.isFinite), "and the field stays finite");
}

// 4) *** THE DECAY IS PER SECOND, AND "WAIT FOR ZERO" WAITS FOREVER. ***
{
    const stroked = () => { const f = makeField(64, 64); stampStroke(f, 10, 32, 54, 32, { strength: 12, radius: 20 }); return f; };
    const after = (fps, seconds) => { const f = stroked(); const dt = 1 / fps;
        for (let i = 0; i < Math.round(fps * seconds); i++) decayField(f, dt); return peakDisplacement(f); };
    // *** NOT EXACTLY EQUAL, AND CHECKING FOR EXACT EQUALITY WAS MY FIRST DRAFT. *** pow(rate, dt*60) applied
    // n times is mathematically pow(rate, 60*total) whatever n is, but the field is a Float32Array and each
    // step rounds. Across 30..144fps the answers agree to about 1.1e-7 relative -- four float32 ULPs at this
    // magnitude -- which is accumulated rounding and not a rate dependence. A tolerance of 1e-5 is still four
    // ORDERS below the per-frame bug measured immediately after it.
    const rates = [30, 60, 120, 144].map((fps) => after(fps, 1));
    const spread = (Math.max(...rates) - Math.min(...rates)) / rates[1];
    ok(spread < 1e-5,
        `one second of decay leaves ${rates[1].toFixed(6)}px at 30, 60, 120 and 144 fps -- spread ${spread.toExponential(2)} relative, float32 rounding`);
    ok(spread > 0, "...and it is not bit-identical, because each step rounds into a Float32Array -- that is what the tolerance is for");
    ok(after(60, 2) < after(60, 1) && after(60, 1) < after(60, 0.5), "and more time always means less displacement");
    // A per-FRAME decay would be the bug. Show the size of it: 0.94 applied once per frame.
    const perFrame = (fps) => { const f = stroked(); for (let i = 0; i < fps; i++) { for (let k = 0; k < f.dx.length; k++) { f.dx[k] *= 0.94; f.dy[k] *= 0.94; } } return peakDisplacement(f); };
    ok(perFrame(120) < perFrame(60) / 20,
        `a per-frame decay would leave ${perFrame(120).toExponential(2)}px at 120fps against ${perFrame(60).toExponential(2)} at 60 -- ${(perFrame(60) / perFrame(120)).toFixed(0)}x apart, the same smudge with a different lifetime`);
    // The maxStep clamp: a tab that was backgrounded for a minute must not wipe the field in one step... it
    // must decay by at most one clamped step, so the effect survives a stall instead of teleporting to zero.
    const stalled = stroked(), normal = stroked();
    decayField(stalled, 60);                          // sixty seconds in one dt
    decayField(normal, 0.05);
    ok(Math.abs(peakDisplacement(stalled) - peakDisplacement(normal)) < 1e-9,
        "a 60-second dt is clamped to maxStep, so one stalled frame does not erase the field");
    ok(decayField(makeField(4, 4), -1) === 1, "a negative dt decays by nothing rather than AMPLIFYING the field");

    // Never reaches zero. Five minutes of frames.
    const f = stroked();
    let quietAt = -1, zeroAt = -1;
    for (let i = 1; i <= 60 * 60 * 5; i++) {
        decayField(f, 1 / 60);
        const p = peakDisplacement(f);
        if (quietAt < 0 && p < QUIET_PX) quietAt = i;
        if (p === 0) { zeroAt = i; break; }
    }
    ok(quietAt === 51, `isQuiet becomes true after ${quietAt} frames -- ${(quietAt / 60).toFixed(2)}s`);
    ok(zeroAt === -1, "and the field is STILL not exactly zero after five minutes of frames (18000 of them)");
    ok(peakDisplacement(f) > 0 && peakDisplacement(f) < 1e-40,
        `it is at ${peakDisplacement(f).toExponential(3)}px -- which is why a dirty flag waiting for zero never clears`);
    ok(isQuiet(f), "isQuiet says quiet anyway, because half a pixel is a threshold with a meaning");
    // The threshold means what it says: below QUIET_PX no sample can round to a different texel.
    const g = makeField(8, 8);
    g.dx.fill(QUIET_PX - 1e-6);
    const im = { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4).map((_, i) => (i % 4 === 3 ? 255 : i)) };
    const w = warp(im, g);
    ok(w.data.every((v, i) => v === im.data[i]), `a field just under ${QUIET_PX}px changes not one pixel of the image`);
    g.dx.fill(QUIET_PX + 1e-3);
    ok(!warp(im, g).data.every((v, i) => v === im.data[i]), "and just over it, pixels move -- the floor is exactly where it claims");
}

// 5) *** THE FIELD IS SUBTRACTED. ADDING IT DRAGS THE IMAGE THE WRONG WAY. ***
{
    const stripe = () => { const data = new Uint8ClampedArray(8 * 4);
        for (let x = 0; x < 8; x++) { const i = x * 4; data[i] = data[i + 1] = data[i + 2] = (x === 2 ? 255 : 0); data[i + 3] = 255; }
        return { width: 8, height: 1, data }; };
    const whiteAt = (im) => Array.from({ length: im.width }, (_, x) => im.data[x * 4]).indexOf(255);
    const g = makeField(8, 1); g.dx.fill(2);
    ok(whiteAt(stripe()) === 2, "the source has its white pixel at index 2");
    ok(whiteAt(warp(stripe(), g)) === 4,
        "a uniform +2px displacement moves the content TO index 4 -- along the push, which is what a smudge does");
    // Adding instead of subtracting: the content would go to index 0, backwards.
    const back = { width: 8, height: 1, data: new Uint8ClampedArray(32) };
    for (let x = 0; x < 8; x++) { const s = Math.round(x + 2); const src = stripe();
        if (s >= 0 && s < 8) { back.data[x * 4] = src.data[s * 4]; back.data[x * 4 + 3] = 255; } }
    ok(whiteAt(back) === 0, "...where adding it would have moved the same pixel to index 0, backwards along the stroke");
    // Edges: clamping repeats, and not clamping leaves a visible hole rather than wrapping.
    const wide = makeField(8, 1); wide.dx.fill(20);
    ok(warp(stripe(), wide, { clampEdges: true }).data[3] === 255, "clampEdges reads the nearest edge texel, opaque");
    ok(warp(stripe(), wide, { clampEdges: false }).data[3] === 0, "without it the destination is left transparent, deliberately visible");
    ok(displacementAt(makeField(4, 4), -1, 0)[0] === 0 && displacementAt(makeField(4, 4), 99, 99)[1] === 0,
        "displacementAt is zero out of bounds, not an edge repeat that would smear the border");
    const nan = makeField(4, 4);
    ok(warp({ width: 4, height: 4, data: new Uint8ClampedArray(64) }, nan).data.length === 64, "an untouched field warps to the same size");
}

// 6) *** THE PIECES ARE ACTUALLY WIRED, AND EACH CHECK MATCHES A WHOLE STATEMENT. ***
//    Three times in the last six versions a wiring check passed on a mention of the filename in a comment or
//    an error string. codeOnly() blanks both, and each pattern below is a full import or call, not a path.
{
    // *** codeOnly BLANKS STRING LITERALS, SO AN IMPORT PATH CANNOT BE MATCHED IN IT. *** The first draft of
    // this section used codeOnly throughout and every path pattern failed against correct code. The rule this
    // tree already wrote down: noComments for anything QUOTED, codeOnly for code SHAPES. Import statements are
    // quoted, so they are graded against noComments -- which still strips comments, so a filename in prose
    // cannot satisfy one. Everything below that is a shape rather than a path stays on codeOnly.
    const boneQ = noComments(read("physics/soft/boneField.js"));
    const bone = codeOnly(read("physics/soft/boneField.js"));
    ok(/import\s*\{\s*distToSegment3\s+as\s+distToSegment\s*\}\s*from\s*["'][^"']*math\/segment\.mjs["']/.test(boneQ),
        "boneField.js imports distToSegment3 from math/segment.mjs under its old local name");
    ok(!/function\s+distToSegment\s*\(/.test(bone), "and no longer declares its own -- one copy, not two");
    ok((bone.match(/distToSegment\s*\(/g) || []).length >= 2, "and still calls it in the field loop");

    const modelQ = noComments(read("render/liquefyModel.mjs"));
    const model = codeOnly(read("render/liquefyModel.mjs"));
    ok(/import\s*\{[^}]*distToSegment2[^}]*\}\s*from\s*["'][^"']*math\/segment\.mjs["']/.test(modelQ),
        "liquefyModel.mjs imports distToSegment2 rather than writing a second one");
    ok(!/function\s+(closestT|distToSegment|distToLine)/.test(model), "and declares no segment maths of its own");
    ok(/Math\.pow\s*\(\s*rate\s*,\s*step\s*\*\s*60\s*\)/.test(model), "the decay is pow(rate, seconds * 60), not a per-frame multiply");
    ok(/x\s*-\s*ddx/.test(model) && /y\s*-\s*ddy/.test(model), "and warp subtracts the field from the destination");

    const domQ = noComments(read("ui/domLiquefy.js"));
    const dom = codeOnly(read("ui/domLiquefy.js"));
    ok(/import\s*\{[^}]*stampStroke[^}]*isQuiet[^}]*\}\s*from\s*["'][^"']*render\/liquefyModel\.mjs["']/.test(domQ),
        "domLiquefy.js imports the model rather than reimplementing it");
    ok(/import\s*\{\s*rasterize\s*\}\s*from\s*["'][^"']*domToTexture\.js["']/.test(domQ),
        "and rasterises through ui/domToTexture.js, the module that already refused html2canvas");
    ok(/probe\s*\(\s*\)\s*\{\s*return\s+!isQuiet\s*\(\s*this\.field\s*\)/.test(dom),
        "probe() is exactly !isQuiet(field) -- the level-triggered source FrameDirty.addSource wants");
    ok(/removeEventListener/.test(dom) && /destroy\s*\(\s*\)/.test(dom),
        "and destroy() removes every listener it added, so the loop cannot outlive the node");
    ok(/stampStroke\(\s*this\.field\s*,\s*this\._last\[0\]/.test(dom),
        "pointermove stamps from the LAST position to the new one -- the segment, not the point");

    const mainQ = noComments(read("main.js"));
    const main = codeOnly(read("main.js"));
    ok(/import\s*\{[^}]*liquefyElement[^}]*\}\s*from\s*["']\.\/ui\/domLiquefy\.js["']/.test(mainQ),
        "main.js imports liquefyElement from ui/domLiquefy.js");
    ok(/window\.domFx\s*=/.test(main) && /liquefy\s*:/.test(main), "and hangs liquefy off the same window.domFx as disintegrate");

    // The claim in the header is about a real absence, so check the tree still has exactly one segment distance.
    const roots = ["math", "render", "physics", "ui", "simulation", "engine"];
    let decls = 0;
    for (const r of roots) for (const p of walk(path.join(ENG, r))) {
        if (!/\.(mjs|js)$/.test(p)) continue;
        const src = noComments(fs.readFileSync(p, "utf8"));
        if (/function\s+(distToSegment2|distToSegment3)\s*\(/.test(src)) decls++;
    }
    ok(decls === 1, `exactly ${decls} file declares a segment distance -- math/segment.mjs, and nothing else`);
}
function* walk(dir) {
    let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) { const p = path.join(dir, e.name);
        if (e.isDirectory()) yield* walk(p); else yield p; }
}

console.log(`liquefy-selfcheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
