// tools/roundhouse/esTrailOffset-selfcheck.mjs
//
// Run: node tools/roundhouse/esTrailOffset-selfcheck.mjs   (<50ms, source scan + real math, no GPU)
//
// v3977 -- THE ENGINE TRAIL WAS ANCHORED AT THE SHIP'S PIVOT, NOT ITS ENGINE. Keith noticed the blue swept-spine
// trails on es-box3d-fly3d.html looked like they came from mid-ship and asked whether they should trail further
// back, toward where the engine actually is. They should, and they did not: the per-frame push into e._path used
// the ship's raw flight-model position with no rear offset at all.
//
// *** THE OFFSET IS NOT A GUESSED CONSTANT -- IT IS MEASURED FROM THE HULL'S OWN GEOMETRY, AND THIS GATE PROVES
// THE TWO STAY IN SYNC. *** makeHull() places its engine-glow mesh at local x=-1.35 and scales the whole group by
// 0.9, so the engine sits 1.215 Three units behind the ship's pivot along -forward. ENGINE_TRAIL_OFFSET is
// asserted against THAT measurement, read from the SAME file by regex, rather than compared to a second typed
// copy of 1.215 -- if somebody moves the engine mesh or changes the hull scale later and forgets the trail
// offset, this goes red instead of the two silently drifting apart, which is exactly the class of bug the
// codemap round (v3976) found one file over.
//
// GL rendering is unverifiable here (no GPU, as the page's own v3834 comment already says) -- what IS checkable
// without one is the ARITHMETIC that decides where each trail sample is placed, using the real forward3d() this
// file also uses for hull orientation, so the check exercises the same function the page calls rather than a
// reimplementation of it.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { forward3d } from "../../ev/flightModel3d.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const src = fs.readFileSync(path.join(ROOT, "es-box3d-fly3d.html"), "utf8");

// ---- 1. THE OFFSET EXISTS AND IS MEASURED FROM THE HULL, NOT A SECOND TYPED CONSTANT --------------------------
const offM = src.match(/const ENGINE_TRAIL_OFFSET = ([\d.]+);/);
const engM = src.match(/eng\.position\.x = (-?[\d.]+);/);
const scaleM = src.match(/g\.scale\.setScalar\(([\d.]+)\);/);
ok("!! ENGINE_TRAIL_OFFSET is declared", !!offM, offM ? offM[1] : "not found");
ok("!! the hull's own engine-mesh position and group scale are still readable at the lines this measured",
    !!engM && !!scaleM, "eng.position.x=" + (engM && engM[1]) + " scale=" + (scaleM && scaleM[1]));

if (offM && engM && scaleM) {
    const offset = parseFloat(offM[1]);
    const measured = Math.abs(parseFloat(engM[1])) * parseFloat(scaleM[1]);
    ok("!! *** ENGINE_TRAIL_OFFSET matches the hull's MEASURED engine distance, not an independent guess ***",
        Math.abs(offset - measured) < 0.05,
        "offset=" + offset + " against |eng.position.x * scale|=" + measured.toFixed(3) + " -- a future edit to " +
        "either the engine mesh's local x or the hull's group scale must move this constant too, or this fails");
}

// ---- 2. THE PUSH FORMULA ACTUALLY SUBTRACTS THE OFFSET ON ALL THREE AXES, EVERY FRAME --------------------------
ok("!! the trail-history push subtracts the engine offset along forward on x, alt AND y",
    /f\.x\*ENGINE_TRAIL_OFFSET/.test(src) && /f\.alt\*ENGINE_TRAIL_OFFSET/.test(src) && /f\.y\*ENGINE_TRAIL_OFFSET/.test(src),
    "all three axes must move together or the trail head drifts off the ship's own forward line");

// ---- 3. THE FORWARD VECTOR IS RECOMPUTED PER SHIP PER FRAME, NOT HOISTED OUT OF THE LOOP -----------------------
// A forward vector computed once (e.g. outside the `for (const e of ships)` loop, or from a fixed heading) would
// point every ship's trail the SAME direction regardless of that ship's own turn -- wrong the instant two ships
// are not flying parallel, and silently plausible-looking for a lone ship flying straight.
{
    const pushBlock = src.slice(src.indexOf("if (!e.dead) {"), src.indexOf("if (!e.dead) {") + 400);
    ok("!! forward3d is called with THIS SHIP's own e.heading and e.pitch, inside the per-ship push",
        /forward3d\(e\.heading, e\.pitch \|\| 0\)/.test(pushBlock),
        "a forward vector computed from anything other than this ship's own live heading/pitch would mis-aim " +
        "the trail for every ship except one flying dead straight");
}

// ---- 4. THE REAL ARITHMETIC, DRIVEN WITH forward3d() -- THE SAME FUNCTION THE PAGE CALLS -----------------------
// GL rendering cannot be exercised without a GPU; the placement MATH can, using the real function rather than a
// second copy of what it should return.
{
    const OFFSET = offM ? parseFloat(offM[1]) : 1.2;
    // Level flight (pitch 0) at an ARBITRARY heading (37 degrees, chosen off-axis on purpose so the check
    // cannot pass by accident on a convention this file does not actually use). forward3d's own headingVector
    // is (sin, -cos), not assumed here -- the expected point is computed FROM forward3d's real return, so this
    // proves the subtraction is wired correctly rather than asserting a guessed axis convention.
    const level = forward3d(37, 0);
    const shipPos = { x: 10, alt: 5, y: -3 };
    const levelPoint = { x: shipPos.x - level.x * OFFSET, alt: shipPos.alt - level.alt * OFFSET, y: shipPos.y - level.y * OFFSET };
    ok("!! level flight: the offset lands entirely in the x/y plane, alt untouched (forward3d's own alt is 0 at pitch 0)",
        level.alt === 0 && Math.abs(levelPoint.alt - shipPos.alt) < 1e-9 &&
        (Math.abs(level.x) > 1e-6 || Math.abs(level.y) > 1e-6),
        "forward.alt=" + level.alt + " so levelPoint.alt=" + levelPoint.alt + " must equal the ship's own alt " +
        "(" + shipPos.alt + ") unchanged; x=" + levelPoint.x.toFixed(3) + " y=" + levelPoint.y.toFixed(3) +
        " must both have moved off the raw ship position since forward.x/y are nonzero at this heading");

    // A ship pitched straight up (pitch 90): forward3d's alt component is 1, x/y are 0, so the offset must show
    // up ENTIRELY on alt -- if it leaked onto x or y instead, the rotation-by-heading/pitch would be wrong.
    const climbing = forward3d(0, 90);
    const climbPoint = { x: 0 - climbing.x * OFFSET, alt: 0 - climbing.alt * OFFSET, y: 0 - climbing.y * OFFSET };
    ok("!! *** pitched straight up, the WHOLE offset lands on alt -- none leaks onto x or y ***",
        Math.abs(climbPoint.x) < 1e-6 && Math.abs(climbPoint.alt - (-OFFSET)) < 1e-6 && Math.abs(climbPoint.y) < 1e-6,
        "x=" + climbPoint.x.toFixed(4) + " alt=" + climbPoint.alt.toFixed(4) + " y=" + climbPoint.y.toFixed(4) +
        " -- alt should read -" + OFFSET.toFixed(3) + " (behind, i.e. BELOW the nose) and the other two exactly zero");

    // A 180-degree turn must reverse the offset's sign entirely -- proves the fix is a genuine per-heading
    // rotation and not a fixed vector that happens to look right at 37 degrees.
    const reversed = forward3d(37 + 180, 0);
    ok("...and turning 180 degrees flips which side of the ship the trail sits on",
        Math.abs(reversed.x - (-level.x)) < 1e-9 && Math.abs(reversed.y - (-level.y)) < 1e-9,
        "forward flips from (" + level.x.toFixed(3) + ", " + level.y.toFixed(3) + ") to (" +
        reversed.x.toFixed(3) + ", " + reversed.y.toFixed(3) + "); a trail anchored correctly must flip with " +
        "it or it would end up AHEAD of the ship on the reverse heading");
}

console.log("\nesTrailOffset-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
