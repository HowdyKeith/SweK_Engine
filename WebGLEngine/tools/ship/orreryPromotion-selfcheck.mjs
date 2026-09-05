#!/usr/bin/env node
// WebGLEngine/tools/ship/orreryPromotion-selfcheck.mjs -- v4478
//
// *** WHETHER THE 3D ORRERY IS THE PRODUCT, DECIDED BY A TABLE RATHER THAN A PREFERENCE. *** The sixth step of the
// 3D orrery (docs/TSL-ROADMAP.md step 9) says the GPU page is promoted -- the panel's orrery button points at it --
// only once it holds every picture fact the 2D page holds. This gate IS that table: each fact is measured from the
// modules and the pages (a count from the same bake, a position from the same function, a string the page must
// contain), each row says which page holds it, and the panel's button is REQUIRED to agree with the verdict.
//
// THE RATCHET RUNS BOTH WAYS. If someone points the button at orrery-gpu.html while a row is still open, this goes
// red; if every row closes and the button still opens orrery.html, this goes red too. A promotion is then a change
// to the tree that the table already asked for, not a choice made on a good day.
//
// MEASURED AT v4478: six of ten rows held, four open -- the planet zoom level (a seeded or measured micro planet
// between the system and the terrain), the author view (the sun inverted), the post stage (ui/orreryPost.mjs), and
// the flyby trails. So the 2D page stays the product and the GPU page stays a link beside it. What the round DID
// close was the colours: the GPU page now tints its records with ui/orreryDraw.js's own STATE_COLOUR and
// REACHED_COLOUR, so a captured body is the same green and a flyby SweK may not take the same purple on both.
//
// SABOTAGE (v4478): A  the panel's button pointed at /orrery-gpu.html with rows open  -> exit=1, red: the ratchet (button vs table)
//                   B  orrery-gpu.html's tints line removed                           -> exit=1, red: the colours row, and the count of held rows
//                   C  a held row's 2D evidence broken (STATE_COLOUR's key renamed)   -> not applied: it is another gate's module; the row reads it
//
// Run: node tools/ship/orreryPromotion-selfcheck.mjs      (~0.5 s, no browser)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildOrrery, CAPTURED, UNPAPERED, REACHED } from "../../world/orrery.mjs";
import { positionAt, positionAt3 } from "../../world/orreryView.mjs";
import { fleetsFor } from "../../world/orreryFleet.mjs";
import { reachedBodies, fromReachedRegister, fromKhronos, MAY_TAKE, MAY_NOT_TAKE } from "../../world/orreryReached.mjs";
import { REACHED_SOURCES, severityOf } from "../../world/reachedLicences.mjs";
import { models, mayVendor } from "../../gpu/khronosSamples.mjs";
import { STATE_COLOUR, REACHED_COLOUR } from "../../ui/orreryDraw.js";
import * as O from "../../render/gpuOrbits.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (c, name, detail) => {
    console.log(`  ${c ? "PASS" : "FAIL"}${c ? "  " : "  !! "}${name}${detail ? "   " + detail : ""}`);
    if (!c) fails++;
};
const sec = (t) => console.log("\n" + t);
const read = (f) => fs.readFileSync(path.join(ENG, f), "utf8");

const twoD = read("orrery.html"), threeD = read("orrery-gpu.html"), server = read("server.html");
const raw = JSON.parse(read("orrery.json")), fleetRaw = JSON.parse(read("orrery-fleet.json")), reachedRaw = JSON.parse(read("orrery-reached.json"));
const system = buildOrrery(raw.bodies, { today: "2026-09-01" });
const fleets = fleetsFor(system, fleetRaw.bodies);
const flybys = reachedBodies([...fromReachedRegister(REACHED_SOURCES, severityOf), ...fromKhronos(models(), (reachedRaw.visited || []).map((v) => v.name), mayVendor)]);
const src = O.elementsOf(system, { fleets, flybys });

// ---------------------------------------------------------------------------------------------------------
sec("1. THE TABLE: what the 2D page holds, and whether the 3D page holds it too -- each row measured");
// ---------------------------------------------------------------------------------------------------------
/** { fact, twoD: [held, how], threeD: [held, how] } -- `how` is the evidence, printed beside the verdict. */
const ROWS = [
    { fact: "the bodies, from one bake",
      twoD: [/buildOrrery\(raw\.bodies/.test(twoD), "orrery.html builds from orrery.json"],
      threeD: [/buildOrrery\(raw\.bodies\)/.test(threeD) && src.counts.bodies === system.bodies.length, `orrery-gpu.html builds from the same bake: ${src.counts.bodies} bodies + SweK`] },
    { fact: "where each body is at day 0",
      twoD: [/positionAt\(/.test(twoD), "positionAt, drawn on the canvas"],
      threeD: [system.bodies.every((b) => { const p = positionAt(b, 0), q = positionAt3(b, 0); return Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.y - q.y) < 1e-9 && q.z === 0; }), "positionAt3 at day 0 IS positionAt for every body (the node is the phase)"] },
    { fact: "the fleets: importers and paperwork about each body",
      twoD: [/fleetsFor\(system, fleetRaw\.bodies\)/.test(twoD) && /drawFleet\(/.test(twoD), "drawn for the FOCUSED body at the planet magnification"],
      threeD: [/fleetsFor\(system, fleetRaw\.bodies/.test(threeD) && src.counts.satellites > 0 && src.counts.debris > 0, `all of them as records: ${src.counts.satellites} importers, ${src.counts.debris} paperwork`] },
    { fact: "the flybys: what SweK read and did not take",
      twoD: [/fromReachedRegister\(REACHED_SOURCES, severityOf\)/.test(twoD) && /fromKhronos\(models\(\), visited, mayVendor\)/.test(twoD), `drawFlybys over ${flybys.length} from the two registers`],
      threeD: [/fromReachedRegister\(REACHED_SOURCES, severityOf\)/.test(threeD) && /fromKhronos\(models\(\), visited, mayVendor\)/.test(threeD) && src.counts.flybys === flybys.length, `the same ${src.counts.flybys} as records of the orbit kernel`] },
    { fact: "a pick names what is under the pointer",
      twoD: [/hits = drawSystem\(/.test(twoD), "drawSystem's hit list"],
      threeD: [/source\.names\[hit\.id\]/.test(threeD) && /scene\.pick\(/.test(threeD), "the identity picture and source.names, for every kind"] },
    { fact: "the colours mean the same: a body by its licence state, a flyby by whether SweK may take it",
      twoD: [/STATE_COLOUR/.test(read("ui/orreryDraw.js")) && !!STATE_COLOUR[CAPTURED] && !!STATE_COLOUR[UNPAPERED] && !!REACHED_COLOUR[MAY_NOT_TAKE], "ui/orreryDraw.js STATE_COLOUR and REACHED_COLOUR"],
      threeD: [/STATE_COLOUR\[CAPTURED\], STATE_COLOUR\[UNPAPERED\], STATE_COLOUR\[REACHED\]/.test(threeD) && /REACHED_COLOUR\[MAY_TAKE\], REACHED_COLOUR\[MAY_NOT_TAKE\]/.test(threeD) && /litPipelineDesc\(\{ tints \}\)/.test(threeD), "the same constants, imported, as the lit pipeline's tints (v4478)"] },
    { fact: "the planet zoom level: a micro planet with a seeded or measured surface between the system and the terrain",
      twoD: [/drawSeededPlanet|drawPlanet\(/.test(twoD) && /ZOOM_PLANET/.test(twoD), "drawPlanet / drawSeededPlanet at ZOOM_PLANET"],
      threeD: [/drawSeededPlanet|seededPlanetFor|ZOOM_PLANET/.test(threeD), "absent: the GPU page goes from the sky straight to the terrain (landOn)"] },
    { fact: "the author view: each author as a sun, the bodies as their acquisitions",
      twoD: [/orrery-authors\.json/.test(twoD), "orrery-authors.json, the v4414 inversion"],
      threeD: [/orrery-authors\.json/.test(threeD), "absent"] },
    { fact: "the post stage over the picture (ui/orreryPost.mjs)",
      twoD: [/orreryPost/.test(twoD), "ui/orreryPost.mjs attached over the 2D canvas"],
      threeD: [/orreryPost/.test(threeD), "absent: the mask rig is a different effect over a different population"] },
    { fact: "the flyby trails: the path each passing body took",
      twoD: [/trail: SPAN/.test(twoD), "drawFlybys with a trail"],
      threeD: [/trail/.test(threeD) && /flybyAt\(/.test(threeD), "absent: a flyby is one sphere"] },
];
let held = 0, open = [];
for (const r of ROWS) {
    ok(r.twoD[0], `2D holds: ${r.fact}`, r.twoD[1]);
    const h = r.twoD[0] && r.threeD[0];
    if (h) held++; else open.push(r.fact);
    console.log(`  ----  3D ${h ? "HOLDS" : "does NOT hold"}: ${r.threeD[1]}`);
}
ok(ROWS.every((r) => r.twoD[0]), "CONTROL: every row's 2D evidence is present -- a row the 2D page does not hold cannot be a reason to withhold the 3D one", `${ROWS.length} rows`);
ok(held >= 6, `*** ${held} of ${ROWS.length} rows held by the 3D page; open: ${open.length ? open.join("; ") : "none"} ***`);

// ---------------------------------------------------------------------------------------------------------
sec("2. THE RATCHET: the panel's orrery button points where the table says");
// ---------------------------------------------------------------------------------------------------------
{
    const promote = open.length === 0;
    const button = (server.match(/_orr\.onclick[^;]*window\.open\("\/([\w-]+\.html)"/) || [])[1] || null;
    ok(button === "orrery.html" || button === "orrery-gpu.html", "the panel's orrery button opens one of the two pages", button);
    ok(promote ? button === "orrery-gpu.html" : button === "orrery.html",
       promote ? "*** every row is held, and the button opens the 3D page ***" : `*** ${open.length} row(s) open, and the button still opens the 2D page: NOT promoted, by the table ***`,
       `button opens ${button}`);
    ok(/href="\/orrery-gpu\.html"/.test(server), "and the 3D page is reachable from the panel as a link beside it, whichever is the product");
    ok(/orrery\.html/.test(threeD) && /orrery-gpu\.html/.test(twoD), "and each page links the other: the twin is one click away from either");
}

console.log(fails ? `\nFAIL -- ${fails} check(s)` : "\nall checks pass");
console.log("unchecked here: the pictures themselves (tools/ship/gpuOrbits-selfcheck.mjs loads the 3D page; tools/ship/orreryView-selfcheck.mjs and orreryPost-selfcheck.mjs hold the 2D one), and whether a viewer PREFERS one page, which no table can measure.");
process.exit(fails ? 1 : 0);
