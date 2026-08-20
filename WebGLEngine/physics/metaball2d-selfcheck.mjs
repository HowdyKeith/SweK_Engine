// physics/metaball2d-selfcheck.mjs
//
// Run: node physics/metaball2d-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The field behind the Lab's isosurface render. The canvas drawing itself is rig-only, but the field it thresholds is
// arithmetic and testable, so this gate holds it to the two properties that make it a metaball rather than a set of
// circles: a point at a blob's centre is inside the skin and a point outside the blob's support is not; and, the
// signature, two blobs close together merge -- the midpoint between them is inside the surface -- while two far apart
// stay separate. The sabotage drops the merge by shrinking the support to nothing, and the close pair stops merging.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { metaballField2d, insideSkin, merged, ISO2D } from "./metaball2d.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const blob = (x, y, r = 0.5, a = 2) => ({ x, y, r, a });

// ---- 1. INSIDE at the centre, OUTSIDE past the support ----------------------------------------------------
{
    const centre = metaballField2d([blob(0, 0)], 0, 0), out = metaballField2d([blob(0, 0)], 1, 0);
    ok("!! a blob's centre is inside the skin and a point past its support is outside", centre >= ISO2D && insideSkin([blob(0, 0)], 0, 0) && out === 0 && !insideSkin([blob(0, 0)], 1, 0),
       "the field is " + centre.toFixed(2) + " at the centre (>= ISO " + ISO2D + ") and exactly 0 past the radius -- a finite-support kernel, inside where it should be and nowhere else.");
}

// ---- 2. MERGE: two close blobs share one skin --------------------------------------------------------------
{
    ok("!! two blobs close together merge into one connected skin", merged(blob(-0.25, 0), blob(0.25, 0)),
       "the midpoint between two blobs a quarter-radius apart is inside the surface -- their skins have joined, which circles drawn side by side never do.");
}

// ---- 3. SEPARATE: two far blobs stay apart -----------------------------------------------------------------
{
    ok("!! two blobs far apart stay separate", !merged(blob(-0.7, 0), blob(0.7, 0)),
       "at a separation past their combined support the midpoint is outside both, so the surface is two skins, not one -- the merge is a real function of distance, not always on.");
}

// ---- 4. MONOTONE: the field falls with distance from a centre ---------------------------------------------
{
    const f = (d) => metaballField2d([blob(0, 0)], d, 0);
    ok("!! the field falls smoothly from the centre outward", f(0) > f(0.2) && f(0.2) > f(0.4) && f(0.4) > f(0.6),
       "the field decreases " + f(0).toFixed(2) + " -> " + f(0.2).toFixed(2) + " -> " + f(0.4).toFixed(2) + " -> " + f(0.6).toFixed(2) + " with distance -- a smooth falloff, so the skin is round.");
}

// ---- 5. DETERMINISTIC + finite-support arithmetic ---------------------------------------------------------
{
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "metaball2d.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const clean = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random|acos|asin|atan)\b/.test(src);
    const a = metaballField2d([blob(0.1, 0.2), blob(-0.3, 0.1)], 0.05, 0.05), b = metaballField2d([blob(0.1, 0.2), blob(-0.3, 0.1)], 0.05, 0.05);
    ok("!! the field is deterministic and uses only arithmetic", a === b && clean,
       "the same query returns the same value and the kernel is +,-,*,/ with a cubic by multiplication -- no transcendental, so the surface is identical wherever it is drawn.");
}

console.log(fails ? "\nmetaball2d-selfcheck: " + fails + " FAILED" : "\nmetaball2d-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
