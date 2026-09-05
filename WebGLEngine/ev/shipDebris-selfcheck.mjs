// WebGLEngine/ev/shipDebris-selfcheck.mjs -- v4421
//
// Run: node ev/shipDebris-selfcheck.mjs
//
// Grades ev/shipDebris.mjs and its wiring into ev/flightView.js.
//
// *** SECTION 3 IS THE ONE THE ROUND EXISTS FOR. *** The backlog item is "death is one dot and the hull never
// leaves", so the check that matters is not "debris exists" -- it is that the pieces GET SOMEWHERE, measured
// in pixels, and that none of them travels inward.
"use strict";

import { gateReport } from "../tools/ship/gateReport.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as D from "./shipDebris.mjs";
import { SOURCES, census, MEASURED_AT_V4412 } from "../render/fireColour.mjs";
const REPORT = gateReport("ev/shipDebris-selfcheck.mjs");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const viewRaw = fs.readFileSync(path.join(HERE, "flightView.js"), "utf8");
// *** COMMENTS ARE STRIPPED BEFORE ANY CODE IDIOM IS ASSERTED, AND SABOTAGE D IS WHY. ***
// The first draft tested `/explosionSample\(f\)/` against the raw file. Reverting the draw call to the old
// inline triple cost ZERO RED -- because the COMMENT I had written above that very line contains the string
// "explosionSample(f) IS the expression this line used to compute inline". The check was satisfied by prose
// ABOUT the code instead of by the code, which is exactly the species tools/ship/commentFalsePass-selfcheck
// exists to catch, committed inside a gate that was asserting a rewrite had happened.
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const view = stripComments(viewRaw);
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

// ---- 1. THE COLOUR IS THE ONE THE DRAW CALL ALREADY COMPUTED -------------------------------------------------
// The extraction has to be EXACT or the picture moved, and "I gave it a name" would be a rewrite in disguise.
{
    say("explosionSample(h) against the expression flightView used to inline: r = h, g = 0.6h, b = 0.25h");
    let worst = 0;
    for (let i = 0; i <= 200; i++) {
        const h = i / 200;
        const [r, g, b] = D.explosionSample(h);
        worst = Math.max(worst, Math.abs(r - h), Math.abs(g - 0.6 * h), Math.abs(b - 0.25 * h));
    }
    ok("!! *** the named ramp is BIT-IDENTICAL to the inline expression at 201 sample points ***",
        worst === 0,
        `max |delta| ${worst}. IF THIS IS EVER NON-ZERO the extraction changed the picture, and giving a ` +
        "colour a name would have become a redesign nobody asked for");
    ok("...and flightView no longer types the colour into the draw call",
        !/0\.6 \* f, 0\.25 \* f/.test(view) && /explosionSample\(f\)/.test(view),
        "the inline triple is gone and the call is there -- one declaration of this fire, not two");
}

// ---- 2. *** THE CENSUS CAN SEE IT NOW, WHICH IT STRUCTURALLY COULD NOT BEFORE *** -----------------------------
{
    say("");
    const keys = SOURCES.map((s) => s.key);
    say(`fireColour SOURCES: ${keys.length} -> ${keys.join(", ")}`);
    ok("!! the fifth fire is registered, by symbol, in the census that could not reach it",
        keys.includes("explosion") &&
        SOURCES.find((s) => s.key === "explosion").symbol === "explosionSample",
        "v4412's table is {file, symbol, sample}; a colour written as three expressions inside an argument " +
        "list has no symbol, so it could never have appeared. THE REPAIR WAS A NAME, not a scanner for " +
        "inline colours -- and the population that would have needed one is measured in the module header");
    const row = census().find((c) => c.key === "explosion");
    ok("...and it measures what the record says it measures",
        JSON.stringify(row.drops) === JSON.stringify([...MEASURED_AT_V4412.drops.explosion]),
        `drops ${JSON.stringify(row.drops)} against the pinned ${JSON.stringify([...MEASURED_AT_V4412.drops.explosion])}`);
    ok("!! and it is NOT held to monotonicity, because it never claimed to be physics",
        SOURCES.find((s) => s.key === "explosion").blackbodyCandidate === false,
        "a fixed orange scaled by a fade is an artistic tint. v4412's own vocabulary has a word for that, " +
        "and grading it against a claim it does not make is how a census turns into a scoreboard");
}

// ---- 3. *** THE HULL LEAVES. *** ------------------------------------------------------------------------------
{
    say("");
    const ship = { x: 0, y: 0, vx: 0, vy: 0 };
    let d = D.shatter(ship, { seed: 7 });
    ok("a hull breaks into more than one piece", d.length === D.DEFAULTS.pieces, `${d.length} pieces`);

    const at = {};
    for (let f = 1; f <= 81; f++) { d = D.stepDebris(d, 1 / 60); if (f % 20 === 0) at[f] = D.reach(d).slice(); }
    for (const f of Object.keys(at))
        say(`  frame ${String(f).padStart(2)}: reach px ${at[f].map((v) => v.toFixed(1)).join(" ")}`);
    // v4423 -- the same table, emitted rather than only printed. gateReport-selfcheck's rule since v4399: a
    // gate that argues in NUMBERS and emits nothing writes its evidence to a terminal that closes.
    REPORT.table("how far each fragment gets from where the ship died", ["frame", "reach px, per piece"],
        Object.keys(at).map((f) => [f, at[f].map((v) => v.toFixed(1)).join("  ")]),
        "The hull never leaving was the defect; a number in pixels is the only thing that answers it.");

    const final = at[80];
    ok("!! *** every fragment is somewhere else than where the ship died ***",
        final.length > 0 && final.every((r) => r > 5),
        `min reach ${Math.min(...final).toFixed(1)} px after 80 frames. THIS IS THE ITEM: the hull never ` +
        "leaving was the defect, and a number in pixels is the only thing that answers it");
    ok("!! ...and no fragment travels INWARD at any point -- reach is monotone per piece",
        [20, 40, 60].every((f) => at[f].every((r, i) => at[f + 20][i] >= r - 1e-9)),
        "drag slows the pieces and never reverses them; a fragment that came back would be a sign error " +
        "rather than a design choice");
    ok("the pieces do not all leave in one direction",
        new Set(D.shatter(ship, { seed: 7 }).map((p) => Math.sign(p.vx) + "," + Math.sign(p.vy))).size >= 3,
        "evenly spaced headings with a jitter, so a seed cannot fire the whole hull one way by luck");
    ok("!! debris is DETERMINISTIC for a seed, or none of the above could be asserted at all",
        JSON.stringify(D.shatter(ship, { seed: 7 })) === JSON.stringify(D.shatter(ship, { seed: 7 })) &&
        JSON.stringify(D.shatter(ship, { seed: 8 })) !== JSON.stringify(D.shatter(ship, { seed: 7 })),
        "same seed identical, different seed different -- both halves, or a constant would pass the first");
    // *** MOMENTUM: the wreck belongs to the ship that died, not to the point it died at. ***
    const moving = D.shatter({ x: 0, y: 0, vx: 200, vy: 0 }, { seed: 7 });
    const still = D.shatter({ x: 0, y: 0, vx: 0, vy: 0 }, { seed: 7 });
    ok("!! fragments inherit the ship's velocity",
        moving.every((p, i) => Math.abs(p.vx - still[i].vx - 200) < 1e-9),
        "a ship dying at speed whose debris fell straight down would read as the explosion happening to a " +
        "different, stationary object");
}

// ---- 4. THE WIRING, ASSERTED AGAINST THE SOURCE THAT SHIPS ---------------------------------------------------
{
    say("");
    ok("flightView imports the module and keeps a debris list", /from "\.\/shipDebris\.mjs"/.test(view) && /let debris = \[\]/.test(view));
    ok("a kill both shatters the hull and pushes a fireball",
        /debris = debris\.concat\(shatter\(k,/.test(view) && /fireball: true/.test(view),
        "the original 0.55s flash is KEPT and the fireball goes behind it -- this round adds, it does not " +
        "replace something that already read correctly");
    ok("debris is stepped every frame and drawn in the additive batch",
        /debris = stepDebris\(debris, dt\)/.test(view) && /shots\.length \+ explosions\.length \+ debris\.length/.test(view),
        "a list that grew and was never stepped would leak, and one never added to `extra` would be invisible");
    ok("!! and the debris list is cleared on entry, like explosions",
        /explosions = \[\]; debris = \[\]/.test(view),
        "wreckage surviving across two entries into the flight view is the same defect as a stale explosion");
    ok("the fireball outlives the flash, which is what makes it read as a fireball",
        D.FIREBALL.life > 0.55 && D.FIREBALL.sizeTo > 86,
        `life ${D.FIREBALL.life}s vs the flash's 0.55s, growing to ${D.FIREBALL.sizeTo}px vs its 86px`);
}

console.log("shipDebris-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
REPORT.write();
process.exit(fails ? 1 : 0);
