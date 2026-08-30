// WebGLEngine/render/doomFire-selfcheck.mjs -- v4178
//
// GATES render/doomFire.mjs -- the PSX DOOM fire from filipedeschamps/doom-fire-algorithm (MIT).
//
// *** THIS IS GATEABLE AT ALL ONLY BECAUSE THE RNG IS A PARAMETER. *** The original calls Math.random()
// twice per cell per frame, so a faithful port is unseeded and the only available quality argument is that
// the fire looks like fire. With the generator injected, "same seed, same field, frame for frame" is exact,
// and everything below rests on it.
//
// The two checks that matter most are the ones pinning ARTIFACTS RATHER THAN FEATURES. The wind is an
// unclamped 1D index that wraps into the row above, and the update is single-buffered and order-dependent.
// Both look like bugs, both are what the fire looks like, and both are exactly the kind of thing a later
// round "cleans up" in good faith. Sections 4 and 5 make that cleanup go red.
//
// Run: node render/doomFire-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { DoomFire, PALETTE, MAX_INTENSITY, mulberry32 } from "./doomFire.mjs";
import { readFileSync } from "node:fs";
import { codeOnly } from "../tools/ship/sourceScan.mjs";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };

// 1) THE PALETTE IS EXACT. A shifted palette does not throw -- it produces a fire that is merely the wrong
//    temperature, which is why every endpoint is pinned rather than just the length.
{
    ok(PALETTE.length === 37, `37 colours (got ${PALETTE.length})`);
    ok(MAX_INTENSITY === 36, "the hottest index is 36, derived from the palette length rather than hardcoded twice");
    ok(PALETTE[0].join(",") === "7,7,7", "index 0 is the original's near-black 7,7,7 -- NOT pure black, which is the detail a retyped palette loses first");
    ok(PALETTE[36].join(",") === "255,255,255", "index 36 is white");
    ok(PALETTE[16].join(",") === "215,95,7" && PALETTE[24].join(",") === "199,151,31", "two interior entries match the original digit for digit");
    ok(PALETTE[13].join(",") === PALETTE[14].join(","), "the original's duplicated pair at 13/14 is preserved -- a 'tidied' palette would drop it and shift everything above");
    ok(Object.isFrozen(PALETTE) && Object.isFrozen(PALETTE[0]), "the palette and its entries are frozen, so a caller cannot shift it by accident");
    ok(PALETTE.every((c) => c.length === 3 && c.every((n) => n >= 0 && n <= 255)), "every entry is a valid RGB triple");
}

// 2) DETERMINISM, the property the whole gate rests on.
{
    const run = (seed, n) => { const f = new DoomFire({ width: 32, height: 20, seed }); for (let i = 0; i < n; i++) f.step(); return f; };
    const a = run(7, 60), b = run(7, 60);
    ok(a.pixels.every((v, i) => v === b.pixels[i]), "same seed, same field after 60 frames -- byte for byte");
    ok(a.frame === 60 && b.frame === 60, "and the frame counters agree");
    const c = run(8, 60);
    ok(!a.pixels.every((v, i) => v === c.pixels[i]), "a different seed gives a different field, so the seed is actually reaching the rule");
    // an injected rng overrides the seed entirely
    let calls = 0;
    const f = new DoomFire({ width: 8, height: 6, rng: () => { calls++; return 0.5; } });
    f.step();
    ok(calls > 0, "an injected rng is the one that gets called");
    ok(new DoomFire({ width: 4, height: 4, seed: 1 }).rng !== Math.random, "and the DEFAULT is a seeded generator, never Math.random -- which is what makes a direct port ungateable");
    ok(typeof mulberry32(1)() === "number" && mulberry32(1)() === mulberry32(1)(), "the bundled generator is itself deterministic");
}

// 3) THE RULE. Decay is 0..2, intensity stays inside the palette, and the source row is never propagated into.
{
    const f = new DoomFire({ width: 24, height: 16, seed: 99 });
    for (let i = 0; i < 200; i++) f.step();
    ok(f.pixels.every((v) => v >= 0 && v <= MAX_INTENSITY),
        "every cell stays within 0..36 after 200 frames -- an out-of-range index would read an undefined palette entry, which is a black frame or a crash, not a warning");
    const src = f.sourceIndex;
    ok(f.pixels.slice(src, src + f.width).every((v) => v === MAX_INTENSITY),
        "the source row is still at full intensity -- the propagation skips it (nothing is below it to copy)");

    // decay is 0, 1 or 2: with a generator pinned to each third, the drop per row is exactly that
    // *** THE FIRST VERSION OF THIS CHECK ASSERTED THE WIND AWAY, AND FAILING IS HOW IT SHOWED. *** It read
    // at(5, 2) expecting MAX - decay, i.e. that the cooled value lands in the SAME column. It does not: the
    // rule writes to i - decay, so with a decay of d the value appears d columns to the LEFT. Reading the
    // origin column gave 0 and the check went red on correct code. Both facts are now asserted together --
    // the value is at 5 - decay, and the origin column is NOT where it landed.
    for (const [r, want] of [[0.0, 0], [0.4, 1], [0.9, 2]]) {
        const g = new DoomFire({ width: 6, height: 4, rng: () => r });
        g.step();
        ok(g.at(5 - want, 2) === MAX_INTENSITY - want,
            `a generator pinned at ${r} gives a decay of ${want}, and the cooled value lands ${want} columns left (reads ${g.at(5 - want, 2)})`);
        if (want > 0) ok(g.at(5, 2) !== MAX_INTENSITY - want,
            `...and NOT in the origin column, which is the wind doing its job`);
    }
}

// 4) *** ARTIFACT 1: THE WIND IS AN UNCLAMPED INDEX AND IT WRAPS INTO THE ROW ABOVE. *** It looks like a bug.
//    It is the leftward lean, and the wrap is why a wisp shows up on the far side. Pinned so that clamping
//    it -- the obvious fix -- goes red.
{
    const code = codeOnly(readFileSync(new URL("./doomFire.mjs", import.meta.url).pathname, "utf8"));
    ok(/const dst = i - decay;/.test(code), "the write target is current - decay, the original's expression");
    // Scoped to step() and to shapes that would actually clamp a COLUMN. The first version tested /clamp/i
    // over the whole file and matched Uint8ClampedArray in toRGBA -- a check that went red on a type name.
    const step = code.slice(code.indexOf("step()"), code.indexOf("at(x, y)"));
    ok(!/Math\.max\(0,\s*column/.test(step) && !/dst % w/.test(step) && !/w \* row \+ Math\./.test(step),
        "and it is NOT clamped back into its own row -- a clamped version is a different-looking fire");

    // and the wrap demonstrably happens
    const w = 8, h = 6, n = w * h;
    const rng = mulberry32(42);
    let wraps = 0, total = 0;
    for (let column = 0; column < w; column++) for (let row = 0; row < h; row++) {
        const i = column + w * row; if (i + w >= n) continue;
        const decay = Math.floor(rng() * 3); total++;
        const dst = i - decay;
        if (dst >= 0 && Math.floor(dst / w) !== row) wraps++;
    }
    ok(wraps > 0, `the row-crossing write really occurs: ${wraps} of ${total} writes on an 8-wide grid land in the row above`);

    // a negative destination is dropped rather than wrapping to the END of the array, which WOULD be a bug:
    // writing hot pixels into the bottom-right of the field from the top-left corner.
    ok(/if \(dst >= 0\)/.test(code),
        "a negative destination at the very top-left is DROPPED -- letting it wrap to the array's end would paint hot cells into the bottom corner, which is a real bug rather than a charming one");
}

// 5) *** ARTIFACT 2: SINGLE-BUFFERED, COLUMN-MAJOR, ORDER-DEPENDENT. *** Double-buffering is the obvious
//    tidy-up and changes the result.
{
    const code = codeOnly(readFileSync(new URL("./doomFire.mjs", import.meta.url).pathname, "utf8"));
    ok(/for \(let column = 0; column < w; column\+\+\)/.test(code) && /for \(let row = 0; row < h; row\+\+\)/.test(code),
        "the loops are COLUMN-major, matching the original");
    const stepBody = code.slice(code.indexOf("step()"), code.indexOf("at(x, y)"));
    ok(!/new Uint8Array|slice\(\)|\.set\(/.test(stepBody),
        "step() allocates no second buffer -- it mutates in place, so a write lands in a column already processed this frame");

    // CONTROL: a double-buffered version of the same rule with the same rng gives a DIFFERENT field, which is
    // what makes the single-buffer choice load-bearing rather than incidental.
    const mk = () => new DoomFire({ width: 16, height: 10, seed: 3 });
    const single = mk(); for (let i = 0; i < 12; i++) single.step();
    const dbl = mk();
    for (let f = 0; f < 12; f++) {
        const src = dbl.pixels, dst2 = src.slice(), w = dbl.width, n = src.length;
        for (let column = 0; column < w; column++) for (let row = 0; row < dbl.height; row++) {
            const i = column + w * row, below = i + w; if (below >= n) continue;
            const decay = Math.floor(dbl.rng() * 3), v = src[below] - decay, d = i - decay;
            if (d >= 0) dst2[d] = v > 0 ? v : 0;
        }
        dbl.pixels = dst2;
    }
    ok(!single.pixels.every((v, i) => v === dbl.pixels[i]),
        "control: double-buffering the SAME rule with the SAME rng gives a different field -- so the in-place update is part of the algorithm, not an implementation detail");
}

// 6) THE SOURCE CONTROLS, and the burn-out that makes cutting it worth doing.
{
    const f = new DoomFire({ width: 20, height: 14, seed: 5 });
    for (let i = 0; i < 60; i++) f.step();
    ok(f.isBurning() && f.heat() > 0, "burning while the source is lit");
    f.extinguish();
    ok(f.pixels.slice(f.sourceIndex).every((v) => v === 0), "extinguish() clears the source row");
    ok(f.isBurning(), "but the fire does NOT stop instantly -- what is already alight is still above the source, and that rise-and-die is the good part");
    let n = 0; while (f.isBurning() && n < 1000) { f.step(); n++; }
    ok(n > 3 && n < 500, `and it burns out on its own after ${n} frames`);
    ok(!f.isBurning() && f.heat() === 0, "reaching genuinely zero, so isBurning() is a usable probe for engine/frameDirty.js rather than one that never clears");

    const g = new DoomFire({ width: 20, height: 8, seed: 5, lit: false });
    ok(!g.isBurning(), "lit:false starts cold");
    g.stoke();
    ok(g.heat() > 0 && g.pixels.slice(g.sourceIndex).every((v) => v <= MAX_INTENSITY), "stoke() raises the source without exceeding the palette");
    for (let i = 0; i < 40; i++) g.stoke();
    ok(g.pixels.slice(g.sourceIndex).every((v) => v === MAX_INTENSITY), "repeated stoking clamps at 36 rather than running past the palette");
    for (let i = 0; i < 40; i++) g.damp();
    ok(g.pixels.slice(g.sourceIndex).every((v) => v === 0), "and damping clamps at 0");
}

// 7) toRGBA IS THE SHAPE ImageData AND texImage2D WANT, and reuses a caller's buffer.
{
    const f = new DoomFire({ width: 5, height: 4, seed: 11 });
    const buf = f.toRGBA();
    ok(buf.length === 5 * 4 * 4, "four bytes per cell");
    ok(buf instanceof Uint8ClampedArray, "as a Uint8ClampedArray, which is what ImageData.data is");
    // the source row is white, index 36
    const i = f.sourceIndex * 4;
    ok(buf[i] === 255 && buf[i + 1] === 255 && buf[i + 2] === 255 && buf[i + 3] === 255, "the lit source row paints white at full alpha");
    const cold = new DoomFire({ width: 5, height: 4, seed: 11, lit: false }).toRGBA();
    ok(cold[0] === 7 && cold[1] === 7 && cold[2] === 7, "and an unlit cell paints the palette's 7,7,7, not transparent and not pure black");
    ok(cold[3] === 255, "with alpha 255 -- the fire is opaque, and a caller wanting it composited keys on the colour");
    const reuse = new Uint8ClampedArray(5 * 4 * 4);
    ok(f.toRGBA(reuse) === reuse, "a supplied buffer is written into rather than replaced, so a per-frame call allocates nothing");
    const tooSmall = new Uint8ClampedArray(4);
    ok(f.toRGBA(tooSmall) !== tooSmall, "and a buffer that is too small is refused rather than overflowed");
}

console.log(`doomFire-selfcheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
