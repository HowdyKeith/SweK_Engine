// WebGLEngine/render/wearField-selfcheck.mjs — v3838
//
// The persistent buffer is worth gating for exactly one reason: the scroll-and-clear. Get it wrong and either the
// trail vanishes the instant the ship moves (cleared too much) or the world you left leaves ghosts when you return
// (cleared too little). Both are pinned here, along with the toroidal addressing, accumulation, and decay. The
// LOOK -- a scorch trail smearing behind a ship -- is Keith's; the bookkeeping is here.
//
// Run: node render/wearField-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { wrapIndex, worldToTexelAxis, representativeWorldAxis, newlyExposedAxis, scrollClear, splatWorld, sampleWorld, decay } from "./wearField.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const N = 32, SIZE = 64;   // 2 world units per texel

// 1) TOROIDAL ADDRESSING -- world points a whole `size` apart alias to the same texel; the buffer tiles the world.
{
    ok(worldToTexelAxis(3, SIZE, N) === worldToTexelAxis(3 + SIZE, SIZE, N), "world points one window apart map to the same texel (toroidal tiling)");
    ok(worldToTexelAxis(0, SIZE, N) === 0 && worldToTexelAxis(-2, SIZE, N) === N - 1, "addressing wraps across zero");
}

// 2) ACCUMULATION -- a splat lands at its world position and two splats build up (this is a STATE buffer, not a
//    recompute).
{
    const buf = new Float64Array(N * N);
    splatWorld(buf, N, 10, 12, SIZE, 2, 1);
    const after1 = sampleWorld(buf, N, 10, 12, SIZE);
    splatWorld(buf, N, 10, 12, SIZE, 2, 1);
    const after2 = sampleWorld(buf, N, 10, 12, SIZE);
    ok(after1 > 0, "a splat deposits at its world position");
    ok(after2 > after1, "a second splat accumulates on top of the first");
}

// 3) PERSISTENCE ACROSS A SMALL SCROLL -- a mark still inside the window survives the recenter (the buffer follows
//    the world; the content is NOT copied and NOT cleared).
{
    const buf = new Float64Array(N * N);
    splatWorld(buf, N, 0, 0, SIZE, 2, 1);
    scrollClear(buf, N, 0, 0, 4, 0, SIZE);   // ship moved +4 world in x; origin still well inside the window
    ok(sampleWorld(buf, N, 0, 0, SIZE) > 0, "a mark still in the window persists through a small scroll");
}

// 4) RE-ENTRY IS CLEARED -- a mark that scrolls fully OUT of the window and back IN comes back cleared, not ghosted
//    (its texel was newly exposed on re-entry).
{
    const buf = new Float64Array(N * N);
    splatWorld(buf, N, 0, 0, SIZE, 2, 1);
    // move the window two full widths away and back: origin leaves and re-enters
    scrollClear(buf, N, 0, 0, 2 * SIZE, 0, SIZE);
    scrollClear(buf, N, 2 * SIZE, 0, 0, 0, SIZE);
    ok(near(sampleWorld(buf, N, 0, 0, SIZE), 0), "world you left and returned to comes back cleared, not ghosted");
}

// 5) SCROLL-AND-CLEAR SCOPE -- moving the center by less than a cell exposes nothing; by a whole window exposes
//    every column.
{
    ok(newlyExposedAxis(0, 0, SIZE, N).length === 0, "no movement exposes no texels");
    ok(newlyExposedAxis(0, 0.5, SIZE, N).length <= 1, "a sub-cell move exposes at most one column");
    ok(newlyExposedAxis(0, SIZE, SIZE, N).length === N, "moving a whole window exposes every column");
}

// 6) REPRESENTATIVE lands in the window and matches its texel.
{
    const c = 100;
    for (const t of [0, 7, N - 1]) {
        const w = representativeWorldAxis(t, c, SIZE, N);
        ok(w >= c - SIZE / 2 - 1e-9 && w < c + SIZE / 2 + 1e-9 && worldToTexelAxis(w, SIZE, N) === t, "representative of texel " + t + " is in-window and maps back to it");
    }
}

// 7) DECAY fades everything toward zero, monotonically, without going negative from a positive field.
{
    const buf = new Float64Array(N * N).fill(1);
    decay(buf, 0.1);
    ok(near(buf[0], 0.9), "decay(0.1) scales the field by 0.9");
    decay(buf, 0.1);
    ok(buf[0] < 0.9 && buf[0] > 0, "repeated decay keeps fading toward zero without overshooting");
}

// 8) DETERMINISM.
{
    const a = new Float64Array(N * N), b = new Float64Array(N * N);
    splatWorld(a, N, 5, 5, SIZE, 3, 1); splatWorld(b, N, 5, 5, SIZE, 3, 1);
    let same = true; for (let i = 0; i < N * N; i++) if (a[i] !== b[i]) same = false;
    ok(same, "splat is deterministic");
}

// ---- CONTROLS: the two ways scroll-clear goes wrong. ----
{
    // clear-everything: the persistence test above would fail -- show it directly
    const buf = new Float64Array(N * N); splatWorld(buf, N, 0, 0, SIZE, 2, 1);
    for (let i = 0; i < buf.length; i++) buf[i] = 0;   // "clear whole buffer on scroll"
    ok(near(sampleWorld(buf, N, 0, 0, SIZE), 0) && sampleWorld(new Float64Array(N * N).fill(0), N, 0, 0, SIZE) === 0,
       "control: clearing the whole buffer on scroll would erase the in-window trail");
    // clear-nothing: a re-entered mark would ghost
    const buf2 = new Float64Array(N * N); splatWorld(buf2, N, 0, 0, SIZE, 2, 1);
    // (no clear) -> still present, i.e. a ghost after leaving and returning
    ok(sampleWorld(buf2, N, 0, 0, SIZE) > 0, "control: clearing nothing would leave a ghost of world you left");
}

console.log(`wearField-selfcheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
