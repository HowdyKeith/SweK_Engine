// WebGLEngine/render/greeble-selfcheck.mjs — v3843
//
// Greebling is a look, and a look cannot be checked here. What CAN be checked is the thing underneath it: the
// panels must PARTITION the surface -- cover it once, with no gap and no double-cover -- because on a hull a gap
// is a hole and a double-cover is z-fighting. Everything else in this file is the same kind of arithmetic: the
// splits terminate, the panels stay above the minimum size, the extrusions land on their declared tiers, and the
// plates on a box sit ON the hull rather than inside it.
//
// Run: node render/greeble-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { makeGreebleParams, panelSplit, panelDepth, panelTone, greebleFace, greebleBox, panelArea } from "./greeble.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };

const RECTS = [
    { x: 0, y: 0, w: 1, h: 1 }, { x: 0, y: 0, w: 4, h: 1 }, { x: 0, y: 0, w: 1, h: 3 },
    { x: -2, y: 5, w: 2.5, h: 1.75 }, { x: 0, y: 0, w: 0.1, h: 0.1 },
];
const overlaps = (a, b, eps = 1e-12) =>
    a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.y < b.y + b.h - eps && b.y < a.y + a.h - eps;

// 1) THE PARTITION -- the whole point. Areas sum to the parent's, nothing overlaps, nothing escapes.
{
    let areaOk = true, noOverlap = true, inside = true, worstArea = 0, tested = 0;
    for (const rect of RECTS) for (let s = 0; s < 40; s++) {
        const panels = greebleFace(rect, { seed: s * 101 + 7 });
        tested += panels.length;
        const err = Math.abs(panelArea(panels) - rect.w * rect.h) / (rect.w * rect.h);
        worstArea = Math.max(worstArea, err);
        if (err > 1e-12) areaOk = false;
        for (let i = 0; i < panels.length; i++) {
            const p = panels[i];
            if (p.x < rect.x - 1e-12 || p.y < rect.y - 1e-12 ||
                p.x + p.w > rect.x + rect.w + 1e-12 || p.y + p.h > rect.y + rect.h + 1e-12) inside = false;
            if (p.w <= 0 || p.h <= 0) inside = false;
            for (let j = i + 1; j < panels.length; j++) if (overlaps(p, panels[j])) noOverlap = false;
        }
    }
    ok(areaOk, `panel areas sum to the parent's area over ${tested} panels (worst relative error ${worstArea.toExponential(1)})`);
    ok(noOverlap, "no two panels overlap");
    ok(inside, "every panel is inside the parent and has positive extent");
}

// 2) TERMINATION and the MINIMUM SIZE. A split that could not honour minSize must refuse rather than shave.
{
    const P = makeGreebleParams({ minSize: 0.06 });
    let smallest = Infinity, count = 0;
    for (let s = 0; s < 200; s++) for (const p of panelSplit({ x: 0, y: 0, w: 1, h: 1 }, { ...P, seed: s })) {
        smallest = Math.min(smallest, p.w, p.h); count++;
    }
    ok(smallest >= P.minSize - 1e-12, `no panel is thinner than minSize (smallest side ${smallest.toFixed(4)} vs ${P.minSize})`);
    ok(count > 2000, `the recursion produces panels rather than one rectangle (${count} over 200 seeds)`);
    const deep = panelSplit({ x: 0, y: 0, w: 1, h: 1 }, makeGreebleParams({ depth: 12 }));
    ok(deep.length <= Math.pow(2, 12), "panel count never exceeds 2^depth");
    ok(panelSplit({ x: 0, y: 0, w: 0.02, h: 0.02 }, P).length === 1, "a face too small to split comes back whole, not empty");
}

// 3) THE LONGER SIDE IS THE ONE THAT GETS CUT, which is what stops panels degenerating into slivers. Bounded
//    aspect is the visible consequence and the checkable one.
{
    let worst = 0;
    for (const rect of RECTS.slice(0, 4)) for (let s = 0; s < 100; s++)
        for (const p of greebleFace(rect, { seed: s * 13 + 1 })) worst = Math.max(worst, p.w / p.h, p.h / p.w);
    ok(worst < 8, `no panel is a sliver (worst aspect ratio ${worst.toFixed(2)} over 400 greebles)`);
}

// 4) STATELESS -- a panel's depth and tone depend on the panel, not on when it was generated. Shuffling the list
//    (or regenerating one panel alone) must not move a single value. A stream-based PRNG fails this.
{
    const P = makeGreebleParams({ seed: 77 });
    const panels = panelSplit({ x: 0, y: 0, w: 1, h: 1 }, P);
    const first = panels.map((p) => [panelDepth(p, P), panelTone(p, P)]);
    const shuffled = panels.map((p, i) => panels[(i * 7 + 3) % panels.length]);
    let stable = true;
    for (const p of shuffled) {
        const i = panels.indexOf(p);
        if (panelDepth(p, P) !== first[i][0] || panelTone(p, P) !== first[i][1]) stable = false;
    }
    ok(stable, "depth and tone are a function of the panel alone (order-independent, no stream)");
}

// 5) DETERMINISM and SEED SENSITIVITY.
{
    const a = greebleFace({ x: 0, y: 0, w: 1, h: 1 }, { seed: 5 });
    const b = greebleFace({ x: 0, y: 0, w: 1, h: 1 }, { seed: 5 });
    const c = greebleFace({ x: 0, y: 0, w: 1, h: 1 }, { seed: 6 });
    ok(JSON.stringify(a) === JSON.stringify(b), "same seed -> identical greeble");
    ok(JSON.stringify(a) !== JSON.stringify(c), "different seed -> different greeble");
}

// 6) THE EXTRUSIONS LAND ON THEIR TIERS. Arbitrary depths read as noise; a few shared depths read as plating.
{
    const P = makeGreebleParams({ tiers: 4, step: 0.012, seed: 3 });
    let quantised = true, tooDeep = false, flat = 0, total = 0;
    for (let s = 0; s < 200; s++) for (const p of greebleFace({ x: 0, y: 0, w: 1, h: 1 }, { ...P, seed: s })) {
        const t = p.depth / P.step;
        if (Math.abs(t - Math.round(t)) > 1e-9) quantised = false;
        if (p.depth > P.tiers * P.step + 1e-12 || p.depth < 0) tooDeep = true;
        total++; if (p.depth === 0) flat++;
    }
    ok(quantised, "every extrusion is an exact multiple of the tier step");
    ok(!tooDeep, "no extrusion exceeds tiers * step, and none is negative");
    const frac = flat / total;
    ok(Math.abs(frac - P.flatChance) < 0.05, `the declared flat fraction is the delivered one (${frac.toFixed(3)} against ${P.flatChance})`);
    let toneOk = true;
    for (const p of greebleFace({ x: 0, y: 0, w: 1, h: 1 }, P)) if (p.tone < 1 - P.tone / 2 - 1e-9 || p.tone > 1 + P.tone / 2 + 1e-9) toneOk = false;
    ok(toneOk, "panel tone stays within the declared band around 1 (no panel goes black)");
}

// 7) PLATES ON A BOX sit ON the hull: the inner face of every plate is exactly flush with the hull face it grew
//    from, and the plate stays inside that face's footprint. A plate that sank into the hull would z-fight, and
//    one that floated off it would read as debris.
{
    const size = [3, 1.4, 1];
    const plates = greebleBox(size, { seed: 21 });
    let flush = true, within = true, outward = true, worstGap = 0;
    for (const pl of plates) {
        const ax = pl.face >> 1;   // the face index IS the axis; do not infer it from which extent is smallest
        const inner = Math.abs(pl.center[ax]) - pl.size[ax] * 0.5;
        worstGap = Math.max(worstGap, Math.abs(inner - size[ax] * 0.5));
        if (Math.abs(inner - size[ax] * 0.5) > 1e-9) flush = false;
        if (pl.size[ax] <= 0) outward = false;
        for (let k = 0; k < 3; k++) if (k !== ax) {
            if (Math.abs(pl.center[k]) + pl.size[k] * 0.5 > size[k] * 0.5 + 1e-9) within = false;
        }
    }
    ok(plates.length > 20, `a greebled box carries plates (${plates.length} on a 3 x 1.4 x 1 hull)`);
    ok(flush, `every plate's inner face is flush with its hull face (worst gap ${worstGap.toExponential(1)})`);
    ok(within, "no plate hangs over the edge of the face it grew from");
    ok(outward, "every plate has positive thickness (flush panels are dropped, not emitted at zero)");
    let perFace = true;
    for (let f = 0; f < 6; f++) {
        const on = plates.filter((p) => p.face === f);
        const ax = f >> 1;
        for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) {
            const a = on[i], b = on[j];
            let hit = true;
            for (let k = 0; k < 3; k++) {
                if (k === ax) continue;
                if (!(Math.abs(a.center[k] - b.center[k]) < (a.size[k] + b.size[k]) * 0.5 - 1e-9)) hit = false;
            }
            if (hit) perFace = false;
        }
    }
    ok(perFace, "plates on the same face never overlap each other");
    const sides = new Set(plates.map((p) => p.face));
    ok(sides.size === 6, "all six faces get greebled (a hull with a bare side reads as unfinished)");
    ok(JSON.stringify(greebleBox(size, { seed: 21 })) === JSON.stringify(plates), "greebleBox is deterministic");
    const other = greebleBox(size, { seed: 22 });
    ok(JSON.stringify(other) !== JSON.stringify(plates), "and seed-sensitive");
}

// 8) OPPOSITE FACES ARE NOT MIRRORS -- each face is salted, so a hull does not read as symmetrical junk.
{
    const plates = greebleBox([2, 2, 2], { seed: 9 });
    const px = plates.filter((p) => p.face === 0).length, nx = plates.filter((p) => p.face === 1).length;
    const pxT = plates.filter((p) => p.face === 0).map((p) => p.size[1].toFixed(6)).sort().join();
    const nxT = plates.filter((p) => p.face === 1).map((p) => p.size[1].toFixed(6)).sort().join();
    ok(px > 0 && nx > 0 && pxT !== nxT, "+X and -X of a cube are greebled differently (per-face salt)");
}

if (fail) { console.error(`\ngreeble-selfcheck: ${pass} pass, ${fail} FAIL`); process.exit(1); }
console.log(`greeble-selfcheck: all ${pass} pass`);
