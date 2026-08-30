// WebGLEngine/render/spriteSlice-selfcheck.mjs -- v4174
//
// sprite-lab's claim is "deterministic, no ML, no network", which is the only reason an image tool is
// gateable here at all: identical input must give byte-identical output, so these are EXACT assertions on
// pixel values and box coordinates, not eyeballing.
//
// The checks are arranged around the four ways backdrop removal goes wrong, each of which produces a
// picture that looks nearly right:
//   - a global colour test punches a hole through the sprite's own key-coloured pixels (section 3, with a
//     control proving the naive version really does),
//   - keying only exact matches leaves the antialiased mixture behind as a coloured fringe (section 5),
//   - fixing alpha but not RGB lets bilinear filtering put the fringe back (section 6),
//   - and slicing on a grid mis-cuts any sheet a person drew rather than a tool generated (section 8).
//
// Run: node render/spriteSlice-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { detectKey, borderFill, unmix, components, mergeBoxes, readingOrder, sliceSheet, toSheetMeta, SLICE_DEFAULTS } from "./spriteSlice.mjs";
import { validateSheet, importSheet } from "../tools/ship/spriteSheetImport.mjs";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

// A 40-line decoder for 8-bit non-interlaced RGBA PNG, so section 13 can run against a REAL asset in this
// tree with NO dependency and NO conditional. pngjs exists but only under tools/render-qa, and a real-asset
// check that skips itself when a package is missing is the thing this tree keeps having to go back and
// un-skip. PNG's IDAT is plain zlib and node has zlib, so there is nothing to install.
function decodePng(path) {
    const b = readFileSync(path);
    if (b.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG: " + path);
    let o = 8, ihdr = null; const idat = [];
    while (o < b.length) {
        const len = b.readUInt32BE(o), type = b.toString("latin1", o + 4, o + 8);
        if (type === "IHDR") ihdr = { w: b.readUInt32BE(o + 8), h: b.readUInt32BE(o + 12), depth: b[o + 16], color: b[o + 17], interlace: b[o + 20] };
        else if (type === "IDAT") idat.push(b.subarray(o + 8, o + 8 + len));
        o += 12 + len;
    }
    if (!ihdr || ihdr.depth !== 8 || ihdr.color !== 6 || ihdr.interlace !== 0) throw new Error("unsupported PNG shape: " + JSON.stringify(ihdr));
    const { w, h } = ihdr, bpp = 4, stride = w * bpp;
    const raw = inflateSync(Buffer.concat(idat));
    const out = new Uint8ClampedArray(w * h * 4);
    let prev = new Uint8Array(stride);
    for (let y = 0; y < h; y++) {
        const ft = raw[y * (stride + 1)];
        const row = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
        const cur = new Uint8Array(stride);
        for (let i = 0; i < stride; i++) {
            const a = i >= bpp ? cur[i - bpp] : 0, bb = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
            let v = row[i];
            if (ft === 1) v += a; else if (ft === 2) v += bb; else if (ft === 3) v += (a + bb) >> 1;
            else if (ft === 4) { const p = a + bb - c, pa = Math.abs(p - a), pb = Math.abs(p - bb), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? bb : c); }
            cur[i] = v & 255;
        }
        out.set(cur, y * stride); prev = cur;
    }
    return { width: w, height: h, data: out };
}

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };

const MAGENTA = [255, 0, 255];
/** Build a test sheet filled with `bg`. px(x,y,[r,g,b,a]) paints one pixel. */
function sheet(w, h, bg = [...MAGENTA, 255]) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) { data[i * 4] = bg[0]; data[i * 4 + 1] = bg[1]; data[i * 4 + 2] = bg[2]; data[i * 4 + 3] = bg[3]; }
    const img = { width: w, height: h, data };
    img.px = (x, y, c) => { const i = (y * w + x) * 4; data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = c[3] ?? 255; return img; };
    img.rect = (x, y, rw, rh, c) => { for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) img.px(xx, yy, c); return img; };
    return img;
}
const alphaAt = (im, x, y) => im.data[(y * im.width + x) * 4 + 3];
const rgbAt   = (im, x, y) => { const i = (y * im.width + x) * 4; return [im.data[i], im.data[i + 1], im.data[i + 2]]; };

// 1) KEY DETECTION reads the corners and says which of the three kinds of backdrop it found.
{
    const solid = sheet(16, 16);
    const k = detectKey(solid);
    ok(k.kind === "solid" && k.agree === 4, "four matching corners read as a solid backdrop, with the agreement reported");
    ok(k.key[0] === 255 && k.key[1] === 0 && k.key[2] === 255, "and the key is the corner colour");

    // a checkerboard is the commonest 'transparent' backdrop and is NOT one colour
    const chk = sheet(16, 16, [200, 200, 200, 255]);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (((x >> 3) + (y >> 3)) & 1) chk.px(x, y, [255, 255, 255, 255]);
    const kc = detectKey(chk);
    ok(kc.kind === "checker", "a 2-2 corner split is recognised as a checkerboard rather than averaged into a grey matching neither square");
    ok(kc.keys.length === 2, "and BOTH square colours are kept as keys");

    const clear = sheet(16, 16, [0, 0, 0, 0]);
    ok(detectKey(clear).kind === "alpha", "a sheet that already has an alpha channel is recognised and left alone");
}

// 2) COMPONENTS finds frames of DIFFERENT sizes at IRREGULAR spacing, with exact boxes.
{
    const im = sheet(40, 20, [0, 0, 0, 0]);
    im.rect(2, 3, 5, 9,  [255, 255, 255, 255]);      // tall thin
    im.rect(14, 5, 11, 4, [255, 255, 255, 255]);     // short wide
    im.rect(31, 2, 6, 15, [255, 255, 255, 255]);     // tall wide, different again
    const b = readingOrder(components(im));
    ok(b.length === 3, "three blobs give three components");
    ok(b[0].x === 2 && b[0].y === 3 && b[0].w === 5 && b[0].h === 9, "first box is exact (2,3 5x9)");
    ok(b[1].x === 14 && b[1].y === 5 && b[1].w === 11 && b[1].h === 4, "second box is exact (14,5 11x4) -- a different size, which a grid slicer cannot express");
    ok(b[2].x === 31 && b[2].y === 2 && b[2].w === 6 && b[2].h === 15, "third box is exact (31,2 6x15)");
}

// 3) *** THE CLASSIC BUG. *** A magenta gem inside a sprite on a magenta backdrop. Background is what is
//    REACHABLE FROM THE BORDER, so the gem survives; a global colour test punches a hole through it.
{
    const im = sheet(20, 20);
    im.rect(5, 5, 10, 10, [0, 128, 255, 255]);       // a solid blue sprite
    im.px(9, 9, [255, 0, 255, 255]);                 // ...with one magenta pixel inside it
    im.px(10, 9, [255, 0, 255, 255]);
    const mask = borderFill(im, [MAGENTA]);
    ok(mask[0] === 1, "the border is background");
    ok(mask[9 * 20 + 9] === 0, "a key-coloured pixel INSIDE the sprite is NOT background -- it is drawn, and unreachable from the border");
    ok(mask[9 * 20 + 10] === 0, "and so is its neighbour");

    // CONTROL: the naive global colour test really does destroy it, so the check above is not free.
    let naiveHole = 0;
    for (let p = 0; p < 400; p++) { const i = p * 4; if (im.data[i] === 255 && im.data[i + 1] === 0 && im.data[i + 2] === 255) naiveHole++; }
    ok(naiveHole > 0 && naiveHole === (400 - 100) + 2, "control: a global colour test would mark the two interior gem pixels as background too");

    // and the sprite still slices as ONE frame with the gem inside it
    const { frames } = sliceSheet(im);
    ok(frames.length === 1, "the sprite is one frame, not a ring with a hole in it");
    ok(frames[0].x === 5 && frames[0].y === 5 && frames[0].w === 10 && frames[0].h === 10, "and its box is the whole sprite");
}

// 4) THE FILL IS 4-CONNECTED, DELIBERATELY. An 8-connected fill leaks diagonally through a one-pixel
//    antialiased outline and eats the interior -- a total loss, not a cosmetic one.
{
    // a hollow diamond outline whose pixels touch only diagonally
    const im = sheet(11, 11);
    const on = [[5,1],[6,2],[7,3],[8,4],[9,5],[8,6],[7,7],[6,8],[5,9],[4,8],[3,7],[2,6],[1,5],[2,4],[3,3],[4,2]];
    for (const [x, y] of on) im.px(x, y, [255, 255, 255, 255]);
    const mask = borderFill(im, [MAGENTA]);
    ok(mask[5 * 11 + 5] === 0, "the interior of a diagonally-connected outline is protected (a 4-connected fill cannot squeeze between diagonal pixels)");
    ok(mask[0] === 1, "while the outside is still filled");
}

// 5) *** THE HALO. *** An antialiased edge over magenta is a MIXTURE, not a colour. Keying exact matches
//    leaves it at full opacity as a pink fringe. Solving C = a*F + (1-a)*K recovers both.
{
    const im = sheet(9, 9);
    im.rect(3, 3, 3, 3, [255, 255, 255, 255]);            // white sprite
    // a half-and-half edge pixel: 0.5*white + 0.5*magenta = (255,128,255)
    im.px(3, 2, [255, 128, 255, 255]);
    const mask = borderFill(im, [MAGENTA]);
    ok(mask[2 * 9 + 3] === 0, "the mixed edge pixel is not within tolerance of the key, so it survives the fill (this is the fringe)");
    const out = unmix(im, mask, MAGENTA);
    const a = alphaAt(out, 3, 2), c = rgbAt(out, 3, 2);
    ok(Math.abs(a - 128) <= 2, `the mixture is solved: the half-covered edge pixel comes out at alpha ~128, got ${a}`);
    ok(c[0] === 255 && c[1] === 255 && c[2] === 255, `and its colour is the sprite's WHITE, not pink -- got rgb(${c.join(",")})`);

    // CONTROL: leaving it as-is is the fringe. Exactly what a tolerance-only keyer ships.
    ok(im.data[(2 * 9 + 3) * 4 + 3] === 255 && im.data[(2 * 9 + 3) * 4 + 1] === 128,
        "control: untouched, that pixel is fully opaque and pink -- the halo every naive keyer leaves behind");

    // and widening the tolerance instead is not the fix: it erodes the sprite rather than solving the mix
    const wide = borderFill(im, [MAGENTA], 140);
    ok(wide[2 * 9 + 3] === 1, "control: a tolerance wide enough to swallow the fringe (140) deletes the edge pixel outright -- erosion, not matting");
}

// 6) THE BLEED. Alpha can be perfect and the halo still comes back, because a transparent pixel still
//    carries RGB and bilinear filtering samples it.
{
    const im = sheet(9, 9);
    im.rect(3, 3, 3, 3, [0, 200, 0, 255]);                // a green sprite on magenta
    const { matted } = sliceSheet(im);
    const outside = rgbAt(matted, 1, 1);                  // deep in the transparent margin
    const rim     = rgbAt(matted, 2, 4);                  // a transparent pixel touching the sprite
    ok(alphaAt(matted, 2, 4) === 0, "the pixel beside the sprite is transparent");
    ok(!(rim[0] === 255 && rim[1] === 0 && rim[2] === 255), `a transparent pixel touching the sprite no longer carries the key colour -- got rgb(${rim.join(",")})`);
    ok(rim[1] > rim[0] && rim[1] > rim[2], "it carries the sprite's green instead, so bilinear filtering has nothing magenta to blend back in");
    void outside;
}

// 7) MERGING. One sprite is routinely several components. A dot over an i is not its own frame.
{
    const im = sheet(30, 20, [0, 0, 0, 0]);
    im.rect(4, 8, 6, 8, [255, 255, 255, 255]);            // the body
    im.px(6, 5, [255, 255, 255, 255]);                    // the dot, 2px of clear air above it
    im.rect(20, 8, 6, 8, [255, 255, 255, 255]);           // a genuinely separate frame
    ok(components(im).length === 3, "three components before merging");
    const merged = readingOrder(mergeBoxes(components(im), 3));
    ok(merged.length === 2, "a detached piece within the merge gap joins its body: two frames, not three");
    ok(merged[0].y === 5 && merged[0].h === 11, "and the merged box grows to include the dot (y=5, h=11)");
    ok(merged[1].x === 20, "while the genuinely separate frame stays separate");
    // the gap is a STATED distance, not a guess -- tighten it and the dot is its own frame again
    ok(mergeBoxes(components(im), 1).length === 3, "with a 1px gap the dot does not merge, so the threshold is doing the work and not a heuristic");
}

// 8) READING ORDER over a sheet whose rows are not pixel-aligned -- which is every sheet a person drew.
{
    const im = sheet(40, 30, [0, 0, 0, 0]);
    im.rect(2, 2, 6, 8,   [255, 255, 255, 255]);          // row 1, left
    im.rect(20, 4, 6, 8,  [255, 255, 255, 255]);          // row 1, right, 2px lower
    im.rect(3, 18, 6, 8,  [255, 255, 255, 255]);          // row 2, left
    im.rect(22, 17, 6, 8, [255, 255, 255, 255]);          // row 2, right, 1px higher
    const f = readingOrder(components(im));
    ok(f.length === 4, "four frames");
    ok(f[0].x === 2 && f[1].x === 20 && f[2].x === 3 && f[3].x === 22,
        `rows read left-to-right and top-to-bottom despite misalignment -- got x order ${f.map((b) => b.x).join(",")}`);
    ok(f[0].y < 12 && f[1].y < 12 && f[2].y > 12 && f[3].y > 12, "and the banding put the right two frames in each row");

    // CONTROL: a plain sort by y scrambles it, which is why the banding exists.
    // The scramble a plain y-sort produces on this sheet is in the SECOND row, not the first: row 2's right
    // frame sits 1px higher than its left one, so sorting by y alone reads that row right-to-left.
    const naive = components(im).slice().sort((a, b) => a.y - b.y);
    ok(naive[2].x === 22 && naive[3].x === 3, "control: sorting by y alone reads the second row RIGHT-to-left, because its right frame sits 1px higher");
    ok(f[2].x === 3 && f[3].x === 22, "and the banding reads that same row left-to-right, which is the fix");
}

// 9) BLIND GRID SLICING IS WRONG ON AN IRREGULAR SHEET, and this is the whole reason the module exists.
{
    const im = sheet(48, 16, [0, 0, 0, 0]);
    im.rect(1, 2, 4, 12,  [255, 255, 255, 255]);
    im.rect(9, 5, 14, 6,  [255, 255, 255, 255]);
    im.rect(30, 1, 7, 14, [255, 255, 255, 255]);
    const f = readingOrder(components(im));
    // a grid slicer told "3 frames across 48px" cuts at 0/16/32
    const gridCuts = [0, 16, 32];
    let gridWrong = 0;
    for (let i = 0; i < 3; i++) if (f[i].x !== gridCuts[i] || f[i].w !== 16) gridWrong++;
    ok(gridWrong === 3, "all three frames sit somewhere a 3-across grid would not have cut them");
    ok(f[1].x === 9 && f[1].w === 14, "the middle frame straddles a grid line (x=9..22 crosses the cut at 16), so a grid slicer would split it across two cells");
    ok(f[0].w === 4 && f[1].w === 14 && f[2].w === 7, "and the three widths are all different, which a grid cannot represent at all");
}

// 10) DETERMINISM, which is the claim the whole port rests on. Same input, byte-identical output.
{
    const build = () => {
        const im = sheet(24, 24);
        im.rect(4, 4, 7, 9, [30, 190, 90, 255]);
        im.rect(14, 6, 6, 6, [200, 40, 40, 255]);
        im.px(5, 3, [255, 128, 255, 255]);                // an edge mixture, so unmix is exercised
        return im;
    };
    const a = sliceSheet(build()), b = sliceSheet(build());
    ok(JSON.stringify(a.frames) === JSON.stringify(b.frames), "two runs give identical frame boxes");
    let diff = 0;
    for (let i = 0; i < a.matted.data.length; i++) if (a.matted.data[i] !== b.matted.data[i]) diff++;
    ok(diff === 0, `two runs give byte-identical matted pixels (${diff} bytes differ)`);
    ok(a.frames.length === 2, "and it found the two sprites");
}

// 11) DEFAULTS ARE FROZEN AND NAMED, so a caller can read what it is getting rather than discover it.
{
    ok(Object.isFrozen(SLICE_DEFAULTS), "SLICE_DEFAULTS is frozen");
    ok(SLICE_DEFAULTS.tolerance === 24 && SLICE_DEFAULTS.mergeGap === 2 && SLICE_DEFAULTS.alphaCut === 8,
        "and pins the four numbers the pipeline actually uses");
    // an explicit key overrides detection
    const im = sheet(12, 12, [0, 255, 0, 255]);
    im.rect(4, 4, 4, 4, [255, 255, 255, 255]);
    const r = sliceSheet(im, { key: [0, 255, 0] });
    ok(r.key.kind === "given" && r.frames.length === 1, "an explicit key is used as given rather than re-detected");
}

// 12) DEGENERATE INPUT does not throw. An empty sheet has no frames; a sheet that is ALL sprite is one.
{
    ok(sliceSheet(sheet(8, 8)).frames.length === 0, "a sheet of nothing but backdrop yields no frames");
    const full = sheet(8, 8, [255, 255, 255, 255]);
    const r = sliceSheet(full);
    ok(r.frames.length <= 1, "a sheet that is entirely sprite yields at most one frame rather than throwing");
    ok(detectKey({ width: 1, height: 1, data: new Uint8ClampedArray(4) }).kind === "empty", "a 1x1 image is refused as empty rather than read as a backdrop");
}

// 13) *** A REAL SHEET FROM THIS TREE, NOT A FIXTURE I DREW TO SUIT MY OWN ALGORITHM. ***
//     textures/sprites/effects/torch_sheet.png, 128x48, four flame frames. Every other section builds its
//     own input, which means every other section can be right about a world that does not exist.
{
    const img = decodePng(new URL("../textures/sprites/effects/torch_sheet.png", import.meta.url).pathname);
    ok(img.width === 128 && img.height === 48, "the real torch sheet decodes to 128x48");

    const k = detectKey(img);
    ok(k.kind === "alpha", "it already carries an alpha channel, so the matting passes correctly leave it alone rather than keying a colour out of it");

    const { frames } = sliceSheet(img);
    ok(frames.length === 4, `four flame frames found in a sheet nothing described (got ${frames.length})`);
    ok(frames.every((f) => f.w === 11), "all four flames are 11px wide");
    ok(frames[0].x === 9 && frames[1].x === 43 && frames[2].x === 74 && frames[3].x === 107,
        `and sit at x = ${frames.map((f) => f.x).join(", ")} -- irregular spacing, not a grid`);

    // *** WHAT THE REAL ASSET SHOWS THAT NO FIXTURE OF MINE WOULD HAVE. ***
    // A 4-across grid on a 128px sheet cuts at 0/32/64/96 into four identical 32x48 cells. That does not
    // SPLIT any flame, so a grid slicer looks like it works -- and then every frame carries three times its
    // own area in empty padding, and the animation jitters because each flame sits at a different offset
    // inside its cell rather than where it was drawn.
    const gridArea = 32 * 48 * 4;
    const tightArea = frames.reduce((n, f) => n + f.w * f.h, 0);
    ok(tightArea * 3 < gridArea, `grid cells would carry ${Math.round((1 - tightArea / gridArea) * 100)}% padding (${tightArea}px of content in ${gridArea}px of cells)`);
    const offsets = frames.map((f, i) => f.x - i * 32);
    ok(new Set(offsets).size > 1, `and each flame sits at a DIFFERENT offset inside its grid cell (${offsets.join(", ")}) -- the jitter a grid bakes in`);

    // and the frames are not even all the same HEIGHT, which a grid cannot express at all
    const heights = new Set(frames.map((f) => f.h));
    ok(heights.size > 1, `the flames are not all the same height (${[...heights].sort((a, b) => a - b).join(", ")}) -- one frame is genuinely taller`);
    ok(frames[3].h === 44 && frames[0].h === 42, "the fourth flame is 44px to the others' 42px, and it starts 2px higher");

    // determinism on the real asset too
    const again = sliceSheet(decodePng(new URL("../textures/sprites/effects/torch_sheet.png", import.meta.url).pathname));
    ok(JSON.stringify(again.frames) === JSON.stringify(frames), "and the real sheet slices identically on a second run");
}

// 14) THE HANDOFF. Found frames go through the SAME validator declared frames do.
//     tools/ship/spriteSheetImport.mjs is the other half of this pipeline: it takes a sheet that arrived
//     WITH a JSON and refuses any rect that samples outside the sheet. Frames found from pixels get held to
//     that same standard rather than a private, laxer path -- otherwise the undeclared half would be the
//     one place an out-of-bounds rect could get through.
{
    const img = decodePng(new URL("../textures/sprites/effects/torch_sheet.png", import.meta.url).pathname);
    const { frames, matted } = sliceSheet(img);
    const meta = toSheetMeta(matted, frames, "torch");
    ok(meta.sheet.w === 128 && meta.sheet.h === 48, "the emitted metadata carries the sheet size");
    ok(meta.frames.length === 4 && meta.frames[0].name === "torch0", "and names the frames");

    const v = validateSheet(meta);
    ok(v.ok === true, `found frames validate under the declared-sheet validator (${v.errors.join("; ")})`);
    const imported = importSheet(meta);
    ok(imported.ok === true && imported.frames.length === 4, "and import cleanly, so a found sheet and a declared one are the same thing downstream");

    // CONTROL: the validator really does refuse an out-of-bounds rect, so passing above means something.
    const bad = toSheetMeta(matted, [...frames, { x: 120, y: 0, w: 20, h: 10 }], "torch");
    ok(validateSheet(bad).ok === false, "control: a rect running off the right edge IS refused, so the pass above is a real check and not a validator that says yes to everything");
}

console.log(`spriteSlice-selfcheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
