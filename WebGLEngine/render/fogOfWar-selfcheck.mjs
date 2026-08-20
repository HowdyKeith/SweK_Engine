// WebGLEngine/render/fogOfWar-selfcheck.mjs — v3839
//
// Field of view is the kind of thing that looks fine until a wall leaks or a corner shows what it shouldn't. The
// checks here pin what shadowcasting must guarantee: the origin sees itself, an open disc is lit to its radius and
// no further, a wall darkens what is behind it, and vision does not squeeze diagonally through a corner. Plus the
// tri-state memory: visible beats remembered beats unseen, and explored is monotone. The LOOK is Keith's.
//
// Run: node render/fogOfWar-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { computeFOV, markExplored, fogState, fowTexel } from "./fogOfWar.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const open = () => false;   // nothing is opaque

// 1) THE ORIGIN SEES ITSELF.
{
    const v = computeFOV(10, 10, 6, open);
    ok(v.has("10,10"), "the viewer's own cell is visible");
}

// 2) OPEN DISC -- everything within radius is lit, nothing past it.
{
    const R = 6, v = computeFOV(0, 0, R, open);
    ok(v.has("6,0") && v.has("0,6") && v.has("-6,0") && v.has("4,4"), "cells within the radius are visible in all octants");
    ok(!v.has("9,0") && !v.has("7,7"), "cells beyond the radius are not visible");
    ok(!v.has("5,5"), "the lit area is a round disc, not a square (a corner past the euclidean radius is dark)");
    // rough disc count: every in-radius cell is present
    let miss = 0; for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) if (x * x + y * y <= R * R && !v.has(x + "," + y)) miss++;
    ok(miss === 0, "an open field lights every cell inside the radius");
}

// 3) A WALL OCCLUDES -- a vertical wall column darkens the cells behind it, but the wall itself and the cells in
//    front stay visible.
{
    const wallX = 3;
    const isOpaque = (x, y) => x === wallX && Math.abs(y) <= 4;   // a wall segment to the right
    const v = computeFOV(0, 0, 8, isOpaque);
    ok(v.has("3,0"), "the wall cell itself is seen");
    ok(v.has("2,0"), "the cell in front of the wall is seen");
    ok(!v.has("5,0") && !v.has("6,0"), "cells directly behind the wall are dark");
}

// 4) NO CORNER LEAK -- a wall meeting at a corner does not let vision slip through the diagonal gap behind it.
{
    // opaque block filling the quadrant boundary; the cell tucked directly behind the corner must be dark
    const isOpaque = (x, y) => (x === 2 && y >= 0 && y <= 4) || (y === 2 && x >= 0 && x <= 4);
    const v = computeFOV(0, 0, 8, isOpaque);
    ok(!v.has("5,5"), "vision does not leak diagonally through the corner");
}

// 5) A CELL AT EXACTLY THE RADIUS BOUNDARY along an axis is lit; one past it is not.
{
    const v = computeFOV(0, 0, 5, open);
    ok(v.has("5,0") && !v.has("6,0"), "the radius boundary is inclusive on-axis, exclusive just past");
}

// 6) DETERMINISM.
{
    const a = [...computeFOV(4, 7, 5, open)].sort().join("|"), b = [...computeFOV(4, 7, 5, open)].sort().join("|");
    ok(a === b, "FOV is deterministic");
}

// 7) TRI-STATE MEMORY -- visible beats remembered beats unseen; marking is monotone.
{
    const N = 32, explored = new Float64Array(N * N);
    const v1 = computeFOV(8, 8, 4, open); markExplored(explored, N, v1);
    ok(fogState(explored, N, v1, 8, 9) === 2, "a currently-visible cell reads VISIBLE");
    // now the viewer moves away; a previously seen cell is no longer in view but stays explored
    const v2 = computeFOV(20, 20, 4, open);
    ok(fogState(explored, N, v2, 8, 9) === 1, "a cell seen before but not now reads REMEMBERED");
    ok(fogState(explored, N, v2, 0, 0) === 0, "a never-seen cell reads UNSEEN");
    // marking again keeps it explored (monotone)
    const before = explored[fowTexel(8, 9, N)]; markExplored(explored, N, v2);
    ok(explored[fowTexel(8, 9, N)] === before && before === 1, "explored is monotone -- re-marking does not un-explore");
}

// ---- CONTROL: an FOV that ignores opacity would show what is behind the wall. ----
{
    const wallX = 3, isOpaque = (x, y) => x === wallX && Math.abs(y) <= 4;
    const occluding = computeFOV(0, 0, 8, isOpaque), xray = computeFOV(0, 0, 8, () => false);
    ok(!occluding.has("6,0") && xray.has("6,0"), "control: ignoring opacity (x-ray) would reveal the cell the wall hides");
}

console.log(`fogOfWar-selfcheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
