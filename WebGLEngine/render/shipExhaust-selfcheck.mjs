#!/usr/bin/env node
// WebGLEngine/render/shipExhaust-selfcheck.mjs -- v4411
//
// The gate on render/shipExhaust.mjs and on its REACH, which is the half #162 was filed for: the DOOM fire
// had one consumer in three hundred versions -- doom-fire.html, a standalone 2D canvas demo -- and every
// ship in the EV flight view carried a live `thrust` boolean the draw path never read.
//
// Its spine is again a control that costs nothing: a ship flying STRAIGHT has zero heading delta in every
// row, so the plume's field is uniformly (0, +1) and the plume is EXACTLY FieldFire on straightField --
// byte for byte, frame for frame, at the same seed. A bend that changed the straight case shows there.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ShipExhaust, exhaustField, exhaustCentreLine, straightField, parcelDirection, headingDelta,
         AFT, MAX_INTENSITY } from "./shipExhaust.mjs";
import { FieldFire, upstreamSource } from "./doomFireField.mjs";
import { specifiers, resolveSpec } from "../tools/ship/moduleRefs.mjs";
import { gateReport } from "../tools/ship/gateReport.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT = gateReport("render/shipExhaust-selfcheck.mjs");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

/* ---------------------------------------------------------------------------------------------------------
 * 1. THE CONTROL: straight flight is the field fire on the straight field, exactly.
 * ------------------------------------------------------------------------------------------------------ */
const W = 24, H = 32;
{
    let diffs = 0, firstFrame = -1;
    for (const seed of [7, 0x5EED, 991]) {
        const ex = new ShipExhaust({ width: W, height: H, seed });
        const ff = new FieldFire({ width: W, height: H, seed, field: straightField(W, H), lit: false });
        ff.source = Int32Array.from(upstreamSource(ff.field));
        for (let f = 0; f < 200; f++) {
            ex.push(0, true); ff.light(); ff.step();
            let d = 0;
            for (let i = 0; i < W * H; i++) if (ex.fire.pixels[i] !== ff.pixels[i]) d++;
            if (d && firstFrame < 0) firstFrame = f;
            diffs += d;
        }
    }
    ok("!! *** A SHIP FLYING STRAIGHT BURNS EXACTLY v4410'S FIELD FIRE, BYTE FOR BYTE ***",
       diffs === 0,
       diffs === 0 ? "3 seeds, 200 frames each, 0 differing cells. The bend is built on the straight case and " +
       "this is what says the straight case survived it"
       : `${diffs} differing cells, first at frame ${firstFrame}`);
}

/* ---------------------------------------------------------------------------------------------------------
 * 2. THE GEOMETRY, DERIVED. parcelDirection's SIGN is the whole thing, so it is checked against the axes.
 * ------------------------------------------------------------------------------------------------------ */
{
    const near = (a, b) => Math.abs(a - b) < 1e-9;
    const straight = parcelDirection(0, 0), left = parcelDirection(90, 0), right = parcelDirection(-90, 0);
    ok("*** a parcel from a ship that has not turned points straight aft; a turn puts it to the other side ***",
       near(straight[0], AFT[0]) && near(straight[1], AFT[1]) &&
       near(left[0], 1) && near(left[1], 0) && near(right[0], -1) && near(right[1], 0),
       `no turn -> [${straight.map((v) => v.toFixed(2))}], ship since turned +90 -> [${left.map((v) => v.toFixed(2))}], ` +
       `-90 -> [${right.map((v) => v.toFixed(2))}]. IF THE SHIP HAS TURNED LEFT THE PARCEL IS NOW ON ITS RIGHT, ` +
       "so the rotation applied is the NEGATIVE of the delta -- a sign nobody can check by looking at a flame");

    ok("...and headingDelta wraps the short way round, so 350 to 10 is 20 and not -340",
       headingDelta(350, 10) === 20 && headingDelta(10, 350) === -20 && headingDelta(0, 180) === -180,
       `350->10 = ${headingDelta(350, 10)}, 10->350 = ${headingDelta(10, 350)}, 0->180 = ${headingDelta(0, 180)}. ` +
       "*** THE HALF-TURN IS PINNED AT -180 BECAUSE THAT IS WHAT IT RETURNS. *** This gate first asserted " +
       "+180 on the strength of the range ev/flightModel3d.js's angleDiffDeg states in its own comment, " +
       "\"(-180, 180]\" -- and that comment excludes the value the expression produces. Both functions return " +
       "-180 for a half turn; the value is a convention (both ways round are the same length) and the stated " +
       "range was simply the wrong endpoint. v4411 corrected the comment where it lives");
}

/* ---------------------------------------------------------------------------------------------------------
 * 3. THE BEND -- the thing a rotated sprite cannot do, measured with a SIGN and not just a magnitude.
 *
 * *** THE FIRST DRAFT POINTED EACH ROW ALONG ITS PARCEL'S HEADING AND THAT WAS THE WRONG QUANTITY. *** At 3
 * degrees per frame the oldest row was 96 degrees off, so its `back` pointed sideways, the row read from its
 * neighbour rather than from the nozzle, and the plume stopped being connected to the engine: turning left
 * and turning right both put the tail at 12.0 and 12.7 against a straight 7.9. That is noise, not a bend.
 * Heat always travels DOWN the rows; what a turn bends is the plume's COURSE.
 * ------------------------------------------------------------------------------------------------------ */
{
    const rowCentre = (ex, y) => { let s = 0, n = 0; for (let x = 0; x < W; x++) { const v = ex.at(x, y); if (v > 4) { s += x; n++; } } return n ? s / n : null; };
    const fly = (turnPerFrame) => {
        const ex = new ShipExhaust({ width: W, height: H, seed: 7 });
        let hd = 0;
        for (let i = 0; i < 200; i++) { hd += turnPerFrame; ex.push(hd, true); }
        return ex;
    };
    const s0 = rowCentre(fly(0), 15), sL = rowCentre(fly(2), 15), sR = rowCentre(fly(-2), 15);
    ok("!! *** A TURNING SHIP DRAGS A CURVED PLUME, AND THE TWO TURNS BEND OPPOSITE WAYS ***",
       sL != null && sR != null && s0 != null && sL < s0 - 2 && sR > s0 + 2,
       `row 15 centre: straight ${s0.toFixed(1)}, turning +2 deg/frame ${sL.toFixed(1)}, -2 deg/frame ` +
       `${sR.toFixed(1)} -- a spread of ${(sR - sL).toFixed(1)} cells across a ${W}-cell plume. A ROTATED ` +
       "SPRITE CANNOT DO THIS: one texture rotated by one angle has no way to hold a different direction in " +
       "every row, and the row's direction is what records where the ship was when that parcel left");

    // The centre line is the mechanism, so it is checked directly rather than only through the picture.
    const cl = exhaustCentreLine(W, H, Array.from({ length: H }, (_, r) => -2 * r));
    const monotonic = cl.every((v, i) => i === 0 || v <= cl[i - 1] + 1e-9);
    ok("...and the centre line it comes from moves one way down the plume, never doubling back",
       monotonic && Math.abs(cl[H - 1] - cl[0]) > 3,
       `centre drifts ${cl[0].toFixed(1)} -> ${cl[H - 1].toFixed(1)} over ${H} rows under a steady turn, ` +
       `monotonic ${monotonic}. A COURSE THAT DOUBLED BACK would be a ship that had turned both ways`);
}

/* ---------------------------------------------------------------------------------------------------------
 * 4. CUTTING THRUST PUTS IT OUT -- and NOT LIGHTING IS NOT CUTTING.
 * ------------------------------------------------------------------------------------------------------ */
{
    const ex = new ShipExhaust({ width: W, height: H, seed: 7 });
    for (let i = 0; i < 120; i++) ex.push(0, true);
    const hot = ex.heat();
    let frames = 0;
    while (ex.isBurning() && frames < 400) { ex.push(0, false); frames++; }
    ok("!! *** THRUST OFF AND THE PLUME BURNS OUT, in a bounded number of frames ***",
       hot > 1000 && !ex.isBurning() && frames > 5 && frames < 200,
       `heat ${hot} under burn, out after ${frames} frames of coasting. *** MEASURED ON THE FIRST DRAFT: ` +
       "STILL BURNING AFTER 500. *** The nozzle row's upstream neighbour is off-grid, so step() skips it and " +
       "it keeps its value for ever -- merely not calling light() leaves the engine lit. v4178 names this: " +
       "extinguish() is a separate call, and this module has to make it");

    const still = new ShipExhaust({ width: W, height: H, seed: 7 });
    for (let i = 0; i < 40; i++) still.push(0, true);
    const midHeat = still.heat();
    for (let i = 0; i < 3; i++) still.push(0, false);
    ok("...and it dims rather than vanishing, which is the whole reason the automaton was worth porting",
       still.heat() < midHeat && still.isBurning(),
       `heat ${midHeat} -> ${still.heat()} three frames after the cut, still burning. A plume that VANISHED ` +
       "on release would be a boolean with a texture, not a fire");
}

/* ---------------------------------------------------------------------------------------------------------
 * 5. THE TEXTURE. Alpha carries the intensity; a flat 255 would draw a black rectangle around the flame.
 * ------------------------------------------------------------------------------------------------------ */
{
    const ex = new ShipExhaust({ width: W, height: H, seed: 7 });
    for (let i = 0; i < 60; i++) ex.push(0, true);
    const buf = ex.rgba();
    let opaque = 0, clear = 0, mid = 0;
    for (let i = 0; i < W * H; i++) { const a = buf[i * 4 + 3]; if (a === 255) opaque++; else if (a === 0) clear++; else mid++; }
    ok("!! *** ALPHA CARRIES THE FIRE'S OWN VALUE, so the plume has an edge instead of a bounding box ***",
       buf.length === W * H * 4 && clear > 0 && mid > 0 && opaque > 0,
       `${W}x${H} RGBA: ${opaque} fully opaque, ${mid} partial, ${clear} fully clear. A FLAT 255 WOULD MAKE ` +
       "ALL THREE COUNTS ONE NUMBER and the quad would show as a rectangle over the starfield");

    const q = ex.rgba();
    ok("...and rgba() writes into a caller's buffer rather than allocating one per frame",
       ex.rgba(q) === q,
       "a plume per ship at 60fps allocating a 3 KB array each is a garbage collector problem the flight " +
       "view does not need");
}

/* ---------------------------------------------------------------------------------------------------------
 * 6. *** THE REACH, WHICH IS WHAT #162 WAS FILED FOR. *** A module the scene does not import is a module
 *    that does not exist, and this tree has caught that at v4407 on the front door and v4165 on six others.
 * ------------------------------------------------------------------------------------------------------ */
{
    const fvPath = path.join(ENG, "ev", "flightView.js");
    const fv = fs.readFileSync(fvPath, "utf8");
    const specs = specifiers(fv).map((s) => s.spec);
    const imports = specs.some((sp) => /shipExhaust\.mjs$/.test(sp));
    ok("!! *** ev/flightView.js IMPORTS THE PLUME, so the DOOM fire reaches a scene at last ***",
       imports,
       `flightView declares ${specs.length} imports; shipExhaust among them: ${imports}. BEFORE v4411 the ` +
       "automaton's only consumer in three hundred versions was doom-fire.html, a standalone 2D canvas demo " +
       "linked from server.html -- gated, correct, and in no scene");

    const resolved = imports && !!resolveSpec(fvPath, specs.find((sp) => /shipExhaust\.mjs$/.test(sp)), ENG);
    ok("...and the specifier RESOLVES, which a string test alone cannot tell you",
       resolved,
       "a typo in the extension is an import that reads fine in source and 404s in a browser; this asks the " +
       "tree's own resolver, the same instrument v4407's reach walk used");

    // Wired, not merely imported: the flight loop must push the SAME thrust the flight model consumed.
    const pushesPlayer = /plumeFor\("player"[^)]*\)\.push\(st\.heading,\s*input\.thrust\)/.test(fv);
    // [^;]* AND NOT [^)]*: the seed argument contains its own parentheses -- `(e.id | 0) * 2654435761` --
    // and a character class excluding ")" cannot cross them. v4407 made this exact mistake on
    // detectBackends and the fix was the same one.
    const pushesNpc = /plumeFor\("e"\s*\+\s*e\.id[^;]*\.push\(e\.heading,\s*ai\.thrust/.test(fv);
    const draws = (fv.match(/drawPlume\(/g) || []).length;
    ok("!! ...and it is WIRED: the plume is pushed from the same input the flight model consumed",
       pushesPlayer && pushesNpc && draws >= 3,
       `player push ${pushesPlayer}, npc push ${pushesNpc}, drawPlume mentions ${draws} (one definition, ` +
       "two call sites). AN IMPORT IS NOT A CONSUMER -- v4165's finding, on six modules whose only importer " +
       "was their own gate. A frame in which the engine fired and the flame did not is not representable " +
       "because both read the one `thrust` value");

    const cleans = /dropPlumes\(/.test(fv) && (fv.match(/dropPlumes\(/g) || []).length >= 2;
    ok("...and a plume is dropped when its ship goes, rebuilt from the live set rather than on a death event",
       cleans,
       "a Map keyed by spawned entity leaks; a death event that is ever missed leaves a plume burning for " +
       "the rest of the session, so the live set is recomputed each frame");
}

REPORT.table("the bend, by turn rate", ["turn deg/frame", "row 15 centre"], (() => {
    const rc = (ex, y) => { let s = 0, n = 0; for (let x = 0; x < W; x++) { const v = ex.at(x, y); if (v > 4) { s += x; n++; } } return n ? +(s / n).toFixed(2) : 0; };
    return [-2, -1, 0, 1, 2].map((t) => {
        const ex = new ShipExhaust({ width: W, height: H, seed: 7 });
        let hd = 0; for (let i = 0; i < 200; i++) { hd += t; ex.push(hd, true); }
        return [t, rc(ex, 15)];
    });
})(), "A rotated sprite would give one number for every turn rate.");
REPORT.write();

console.log();
console.log("  ----  WHAT THIS DOES NOT CLAIM. That the plume looks right on a GPU: these checks run the");
console.log("  ----  automaton and read its cells, and the quad, the additive blend and the stern offset are");
console.log("  ----  judged by a person. That the bend is aerodynamically true -- a parcel here keeps its");
console.log("  ----  emission heading and nothing diffuses or slows it, which is a record of the ship's path");
console.log("  ----  and not a plume model. And that every ship burns: a ship with no thrust input never");
console.log("  ----  lights, which is the point, so an empty sky is a correct empty sky.");
if (fails) { console.log("shipExhaust-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("shipExhaust-selfcheck: all checks pass");
