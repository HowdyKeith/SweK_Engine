// WebGLEngine/render/blobFire-selfcheck.mjs -- v4429
//
// Run: node render/blobFire-selfcheck.mjs
//
// Grades render/blobFire.mjs and the wiring of it into blobulator.html -- #168, "it already paints heat with
// the blackbody ramp and has no fire at all".
//
// *** SECTION 2 IS THE ONE THAT MATTERS, AND IT GRADES A CONCLUSION THIS ROUND GOT WRONG. *** The round chose
// doomFire's rule over fireSystem's on v4423's measurement that doomFire "consumes nothing", so a blobulator's
// blobs would not be eaten. The first thing the harness printed was the blobs going out in ten frames. The
// persistence v4423 measured belongs to the BOTTOM ROW, whose back index is off-grid, not to the rule -- so
// section 2 asserts BOTH halves: that an unmaintained interior source dies, and that a bottom-row one does
// not. A check that only asserted the working case would let the wrong inference back in silently.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as B from "./blobFire.mjs";
import { FieldFire, uniformField, offsets } from "./doomFireField.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..");
const PAGE = fs.readFileSync(path.join(ENG, "blobulator.html"), "utf8");
const FIELD_SRC = fs.readFileSync(path.join(HERE, "doomFireField.mjs"), "utf8");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

/**
 * *** COMMENTS OUT BEFORE ANY IDIOM IS ASSERTED, BECAUSE THIS ROUND WROTE THE IDIOMS INTO ITS OWN COMMENTS. ***
 * v4421's sabotage D cost zero red for exactly this reason, and v4424's census counted its own changelog. The
 * replacement comment in paintFire QUOTES the gradient it replaced -- `heat = 1 - py/worldH*1.05` -- so a check
 * for "the old idiom is gone" run against raw source would pass on the removal and then fail forever on the
 * explanation, or worse, pass on both while the code still had it.
 */
function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}
const CODE = stripComments(PAGE);

const BLOB = [{ x: 0, y: 3, z: 0, r: 2 }];

// ---- 1. THE BEFORE: A POSITIONAL GRADIENT WEARING A TEMPERATURE'S NAME ----------------------------------------
{
    say("what blobulator.html handed the blackbody ramp before this round");
    // *** THE STRONGEST FORM OF "IT IGNORES THE BLOBS" IS THAT NO BLOB CAN BE NAMED IN IT. *** Feeding three
    // blob configurations to a function that takes none and finding one answer proves nothing about the
    // function -- it proves the harness passed no blobs. So this reads the body: the parameters are (px, py,
    // t, worldH) and the source mentions nothing blob-shaped, which is why the page's own line could not have
    // depended on the blobs however it was called.
    const near = B.positionalHeat(4, 10, 0.5);
    const src = B.positionalHeat.toString();
    const params = /^function positionalHeat\(([^)]*)\)/.exec(src)[1].split(",").map((x) => x.trim().split("=")[0].trim());
    const namesABlob = /\bblob|\bball|\briver|metaballField|\bx\b\s*:/.test(src.slice(src.indexOf("{")));
    say("  positionalHeat parameters: " + params.join(", "));
    ok("positionalHeat CANNOT depend on the blobs: none is a parameter and none is named in the body",
        params.join(",") === "px,py,t,worldH" && !namesABlob &&
        Math.abs(near - B.MEASURED_AT_V4429.positionalHeatAt) < 1e-12,
        `heat(4, 10, 0.5) = ${near.toFixed(6)}, and it is that for clustered blobs, distant blobs and no ` +
        "blobs alike because there is nothing in scope for it to be otherwise. The colour did not depend " +
        "on the thing being coloured");
    ok("it has no memory either: the value at t is a closed form in t, so nothing cools and nothing carries",
        B.positionalHeat(4, 10, 0.5) === B.positionalHeat(4, 10, 0.5) &&
        B.positionalHeat(4, 10, 0.6) !== B.positionalHeat(4, 10, 0.5),
        "two points at one height are the same temperature whatever either of them did a moment ago");
}

// ---- 2. *** THE ROUND'S OWN SELECTION CRITERION, AND THE MEASUREMENT THAT CORRECTED IT *** --------------------
{
    say("");
    say("does doomFire's rule really consume nothing, or was that the bottom row?");

    const unmaintained = new B.BlobFire({ maintain: false }).setBlobs(BLOB);
    const t0 = unmaintained.total();
    unmaintained.step(60);
    const t60 = unmaintained.total();
    ok("!! *** an INTERIOR source is NOT self-sustaining -- the blobs go out ***",
        t0 === B.MEASURED_AT_V4429.interiorSourceTotalAtStep0 && t60 === 0,
        `${unmaintained.source.length} cells lit at MAX, total ${t0} at step 0 and ${t60} at step 60. ` +
        "v4423 measured that doomFire consumes nothing and this round chose its rule on that basis. " +
        "THE INFERENCE WAS WRONG");

    const w = 64, h = 40;
    const bottom = new FieldFire({ width: w, height: h, field: uniformField(w, h), seed: 0x5EED });
    const src = []; for (let c = 0; c < w; c++) src.push(w * (h - 1) + c);
    const srcHeat = () => { let s = 0; for (const i of src) s += bottom.pixels[i]; return s; };
    const b0 = srcHeat();
    for (let i = 0; i < 1200; i++) bottom.step();
    const b1200 = srcHeat();
    ok("...while a BOTTOM-ROW source is, which is the configuration v4423 actually measured",
        b0 === B.MEASURED_AT_V4429.bottomRowSourceHeatAtStep0 && b1200 === b0,
        `source heat ${b0} at step 0 and ${b1200} at step 1200 -- unchanged, exactly as v4423 recorded`);

    const interiorIdx = unmaintained.source[Math.floor(unmaintained.source.length / 2)];
    const n = w * h;
    ok("!! *** and the mechanism is an index, not the rule: the bottom row's `back` is OFF-GRID ***",
        (src[10] + w) >= n && (interiorIdx + w) < n,
        `bottom cell ${src[10]} reads from ${src[10] + w} (>= ${n}, so step() skips it and never writes it); ` +
        `interior cell ${interiorIdx} reads from ${interiorIdx + w} (on-grid, so the cold cell below ` +
        "overwrites it). A measurement transfers only as far as its mechanism does");

    const kept = new B.BlobFire().setBlobs(BLOB);
    kept.step(60); const k60 = kept.total();
    kept.step(1140); const k1200 = kept.total();
    ok("maintaining the source restores the settling shape v4423 attributed to the rule",
        k60 === B.MEASURED_AT_V4429.maintainedTotalAtStep60 &&
        k1200 === B.MEASURED_AT_V4429.maintainedTotalAtStep1200 &&
        Math.abs(k1200 - k60) / k60 < 0.05,
        `total ${k60} at step 60 and ${k1200} at step 1200 -- ${(100 * Math.abs(k1200 - k60) / k60).toFixed(1)}% apart`);
}

// ---- 3. THE WRAP, AND A GUTTER WIDE ENOUGH ONLY BECAUSE IT WAS DERIVED ----------------------------------------
{
    say("");
    say("v4410 kept v4178's unclamped write index; an interior source is what makes it visible");

    ok("MAX_DECAY is checked against FieldFire's own source, not trusted as a transcription",
        B.decayCeiling(FIELD_SRC) === B.MAX_DECAY && B.MAX_DECAY === 2,
        `doomFireField.mjs computes Math.floor(this.rng() * 3), ceiling ${B.decayCeiling(FIELD_SRC)}; ` +
        "MAX_DECAY says " + B.MAX_DECAY + ". v4427 shipped a round about an unchecked transcription drifting");

    const reach = (g) => { const f = new B.BlobFire({ gutter: g }).setBlobs(BLOB); f.step(120); return B.wrapReach(f.fire, f.source); };
    const r0 = reach(0), r1 = reach(1), r2 = reach(B.MAX_DECAY);
    say(`  gutter 0: ${r0.cells} cells / ${r0.heat} heat right of column ${r0.maxSrcCol}, max column ${r0.maxCol}`);
    say(`  gutter 1: ${r1.cells} cells / ${r1.heat} heat, max column ${r1.maxCol}`);
    say(`  gutter ${B.MAX_DECAY}: ${r2.cells} cells / ${r2.heat} heat, max column ${r2.maxCol}`);
    ok("without a gutter the plume TELEPORTS: heat appears right of the source, which no transport can do",
        r0.cells === B.MEASURED_AT_V4429.wrapCellsAtGutter0 && r0.maxCol === 63,
        "the flow is up and the lean is left, so heat right of the source arrived by dst = i - decay " +
        "crossing a row. An exact detector, not a proxy");
    ok("!! *** a one-column gutter -- what a guess would pick -- STILL WRAPS; the derived width does not ***",
        r1.cells === B.MEASURED_AT_V4429.wrapCellsAtGutter1 && r1.cells > 0 &&
        r2.cells === 0 && r2.maxCol === r2.maxSrcCol,
        `gutter 1 leaves ${r1.cells} wrapped cells because decay reaches TWO columns left; gutter ` +
        `${B.MAX_DECAY} leaves ${r2.cells}. The width is MAX_DECAY, derived, and the measurement says so`);
    ok("the gutter is a zero DIRECTION, so the ported rule and v4410's byte-for-byte control are untouched",
        /gutter \? \[0, 0\] : UP/.test(stripComments(fs.readFileSync(path.join(HERE, "blobFire.mjs"), "utf8"))),
        "v4410's control runs on uniformField, which this module does not modify");
}

// ---- 4. *** v4410 MADE THE FLOW A FIELD AND LEFT THE LEAN WELDED TO IT *** ------------------------------------
{
    say("");
    const leans = B.leanMagnitudes(64, offsets);
    const minLean = Math.min(...leans.map((l) => l.lean));
    say("|perp| by direction: " + leans.map((l) => `(${l.dx},${l.dy})=${l.lean}`).join(" "));
    ok("!! *** NO field can make this fire rise straight: |perp| is never 0 over the eight directions ***",
        leans.length === 8 && minLean === B.MEASURED_AT_V4429.minLeanOverAllEightDirections && minLean === 1,
        `smallest lean ${minLean}. perp(d) = dy + w*(-dx) vanishes only when d does, and a zero direction ` +
        "is a dead cell. The obvious repair for the shear does not exist");

    const f = new B.BlobFire().setBlobs(BLOB); f.step(200);
    const centroid = (gy) => { let s = 0, m = 0; for (let gx = 0; gx < f.w; gx++) { const v = f.fire.at(gx, gy); s += v; m += v * gx; } return s ? m / s : NaN; };
    const rows = f.source.map((i) => (i - i % f.w) / f.w);
    const top = Math.min(...rows);
    const shear = (centroid(top) - centroid(0)) / top;
    say(`  plume centroid: column ${centroid(top).toFixed(1)} at the source's top row ${top}, ` +
        `${centroid(0).toFixed(1)} at row 0`);
    ok("and the shear it forces is the DERIVED expectation of the decay draw, not a fitted number",
        Math.abs(shear - B.leanPerRow()) < 0.15 && Math.abs(shear - B.MEASURED_AT_V4429.leanPerRowMeasured) < 0.05,
        `${shear.toFixed(2)} columns left per row risen against E[decay] = ${B.leanPerRow()}; that is 45 degrees`);
}

// ---- 5. THE WIRING, BECAUSE A MODULE ONLY ITS GATE IMPORTS IS NOT A FIRE ON THE BLOBULATOR --------------------
{
    say("");
    say("does the page actually burn? (comment-stripped -- the new comment quotes the code it replaced)");
    ok("blobulator.html imports BlobFire, builds one over the channel and STEPS it every march",
        /import \{ BlobFire \} from "\.\/render\/blobFire\.mjs"/.test(CODE) &&
        /new BlobFire\(\{[^}]*rect:/.test(CODE) && /blobFire\.setBlobs\(/.test(CODE) && /blobFire\.step\(\)/.test(CODE));
    ok("!! *** paintFire reads the fire and the positional gradient is GONE from the code ***",
        /blobFire\.heatAt\(/.test(CODE) && !/1\.0 - hgt \* 1\.05/.test(CODE) && !/const hgt = py \/ worldH/.test(CODE),
        "the gradient survives in render/blobFire.mjs as positionalHeat(), which is what section 1 grades, " +
        "and in a comment on the line that replaced it -- hence the strip");
    ok("the fire is rebuilt only on a resize, so the field it has built is not thrown away every frame",
        /blobFire\.w !== LX \|\| blobFire\.h !== LY/.test(CODE),
        "a new FieldFire each frame would have no memory, which is the defect being fixed");
    let refused = false;
    try { B.blobSource([{ p: [0, 3, 0], r: 2 }]); } catch { refused = true; }
    ok("a malformed blob is a REFUSAL, not a silent empty source",
        refused,
        "probed with {p: [...], r} instead of {x, y, z, r}, metaballField summed NaN and `NaN < 0` is false, " +
        "so every cell declined to be a source and the harness reported a fire of zero heat with no error. " +
        "v4418's defect exactly, and it gets v4418's treatment");
}

// ---- 6. *** THE SAMPLING, WHICH TWO SABOTAGES PROVED NOTHING ABOVE WAS GRADING *** ---------------------------
//
// Sections 1-5 grade the fire and its wiring, and every one of them stayed GREEN through a heatAt() whose
// bilinear weights were transposed and a worldToCell() with its y axis flipped. *** heatAt IS THE FUNCTION THE
// PAGE DRAWS WITH. *** The round's whole claim is that the blobs' fire now colours the blobs, and the pipe
// carrying it was the one thing untested -- an upside-down fire would have shipped green. This is v4427's
// finding again (a transcription nothing compared to its original) and v4424's (a detector blind to a whole
// mechanism), in the round that quoted both.
{
    say("");
    say("the sampling that carries the fire to the vertices");

    const F = new B.BlobFire();
    let roundTrips = 0, worst = 0;
    for (let gy = 0; gy < F.h; gy++) for (let gx = 0; gx < F.w; gx++) {
        const [x, y] = B.cellToWorld(gx, gy, { w: F.w, h: F.h, rect: F.rect });
        const c = B.worldToCell(x, y, { w: F.w, h: F.h, rect: F.rect });
        if (c && c[0] === gx && c[1] === gy) roundTrips++;
        worst = Math.max(worst, Math.abs(x - B.cellToWorld(gx, gy, { w: F.w, h: F.h, rect: F.rect })[0]));
    }
    const topY = B.cellToWorld(0, 0, { w: F.w, h: F.h, rect: F.rect })[1];
    const botY = B.cellToWorld(0, F.h - 1, { w: F.w, h: F.h, rect: F.rect })[1];
    say(`  row 0 is world y ${topY}, row ${F.h - 1} is world y ${botY} (rect y0 ${F.rect.y0}, y1 ${F.rect.y1})`);
    ok("!! *** the grid's y is UPSIDE DOWN relative to the world's, and both directions are pinned ***",
        roundTrips === F.w * F.h && topY === F.rect.y1 && botY === F.rect.y0,
        `${roundTrips} of ${F.w * F.h} cells round-trip through cellToWorld -> worldToCell. The fire grid ` +
        "grows downward and the scene grows upward; flipping the mapping puts the flames under the blobs " +
        "and NOTHING in sections 1-5 noticed");

    // *** THE PROBE MUST BE ASYMMETRIC IN x AND y OR IT CANNOT SEE A TRANSPOSE. *** Sampling a cell centre
    // reduces both the right formula and the transposed one to the same corner, and a symmetric neighbourhood
    // gives them the same answer everywhere -- which is how the transpose survived. So: heat in exactly ONE
    // cell, the one to the RIGHT of the sample's corner, read at tx = 0.25 and ty = 0.75.
    F.fire.pixels.fill(0);
    const gx0 = 10, gy0 = 10;
    F.fire.pixels[(gx0 + 1) + F.w * gy0] = 36;
    const [xa] = B.cellToWorld(gx0, gy0, { w: F.w, h: F.h, rect: F.rect });
    const [xb] = B.cellToWorld(gx0 + 1, gy0, { w: F.w, h: F.h, rect: F.rect });
    const [, ya] = B.cellToWorld(gx0, gy0, { w: F.w, h: F.h, rect: F.rect });
    const [, yb] = B.cellToWorld(gx0, gy0 + 1, { w: F.w, h: F.h, rect: F.rect });
    const got = F.heatAt(xa + 0.25 * (xb - xa), ya + 0.75 * (yb - ya));
    const want = 0.25 * (1 - 0.75), transposed = 0.75 * (1 - 0.25);
    say(`  one hot cell to the right, sampled at tx=0.25 ty=0.75: ${got.toFixed(4)} ` +
        `(correct ${want.toFixed(4)}, weights transposed would read ${transposed.toFixed(4)})`);
    ok("heatAt interpolates in the right axes -- a probe symmetric in x and y could not have told",
        Math.abs(got - want) < 1e-12,
        "transposing tx and ty in the bilinear cost ZERO RED before this check, because every other probe " +
        "in this file sampled cell centres, where both formulas collapse to the same corner");
    // *** AND THE CORNERS MUST BE HOT BEFORE THIS IS ASKED. *** The first draft asked it with the field empty
    // everywhere but one interior cell, so a heatAt() that CLAMPED out-of-rect reads to the nearest edge
    // returned 0 for the honest reason and the check passed -- v4420's "N or N+1" ratchet again, a test
    // satisfiable by the wrong cause. Light every edge cell and a clamp is the only thing that can read hot.
    for (let gx = 0; gx < F.w; gx++) { F.fire.pixels[gx] = 36; F.fire.pixels[gx + F.w * (F.h - 1)] = 36; }
    for (let gy = 0; gy < F.h; gy++) { F.fire.pixels[F.w * gy] = 36; F.fire.pixels[F.w - 1 + F.w * gy] = 36; }
    ok("and it reads 0 outside the rect rather than CLAMPING to the edge, with the edge lit so a clamp shows",
        F.heatAt(999, 999) === 0 && F.heatAt(F.rect.x0 - 1, 0) === 0 && F.heatAt(0, F.rect.y1 + 1) === 0 &&
        F.heatAt(F.rect.x0, F.rect.y1) === 1,
        "every edge cell is at MAX here, so clamping an out-of-rect sample would read 1, not 0");

    // the page's own conversion, which is the last link and belongs to blobulator.html rather than to here
    const hasOrigin = /origin: \[-\(LX \* cs\) \/ 2, 0, -\(LZ \* cs\) \/ 2\], cellSize: cs/.test(CODE);
    const hasInverse = /blobFire\.heatAt\(px \/ cs \+ LX \/ 2, py \/ cs\)/.test(CODE);
    const LX = 54, cs = 1.4, fx = 17;
    const world = -(LX * cs) / 2 + fx * cs, back = world / cs + LX / 2;
    ok("paintFire's world->field conversion is the exact inverse of the march's own origin",
        hasOrigin && hasInverse && Math.abs(back - fx) < 1e-12,
        `march puts field x ${fx} at world ${world}; paintFire reads it back as ${back}`);
}

console.log("blobFire-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
