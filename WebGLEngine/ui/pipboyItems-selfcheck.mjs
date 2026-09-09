// ui/pipboyItems-selfcheck.mjs -- v4559
//
// Run: node ui/pipboyItems-selfcheck.mjs
//
// GATES ui/pipboyItems.mjs -- the rotating wireframe item that ui/pipboyWireframe.js's INV page did not have.
// That page drew six names and a blinking cursor; the panel beside the list, which is the one thing a Pip-Boy
// inventory screen is recognised BY, was not there at all.
//
// *** THE GEOMETRY IS PURE SO THAT THE FAILURE THIS CODE ACTUALLY HAS IS A NODE ASSERTION. *** A wireframe
// that fits its panel at 0 degrees and crosses the bezel at 137 is the classic version of this bug, and it is
// invisible to anything that renders one frame -- including a screenshot test. Here every model is projected
// at every degree of a full turn and held to the panel, which is 2,160 checks a browser gate could not make
// cheaply and a human could not make at all.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ITEMS, modelFor, project, wellFormed } from "./pipboyItems.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

console.log("pipboyItems-selfcheck -- the wireframe item, its models and its fit\n");

const PANEL = { x: 298, y: 76, w: 190, h: 282 };   // what pageInv passes on a 512x432 screen
const names = Object.keys(ITEMS);

// =============================================================================================================
console.log("1. *** EVERY MODEL IS STRUCTURALLY SOUND, WHICH A HAND-BUILT MESH IS NOT BY DEFAULT ***");
{
    const bad = names.filter((n) => !wellFormed(ITEMS[n]));
    say(names.map((n) => n + " " + ITEMS[n].v.length + "v/" + ITEMS[n].e.length + "e").join(", "));
    ok("!! every edge indexes a vertex that exists, and no edge joins a vertex to itself",
        bad.length === 0 && names.length >= 6,
        bad.length ? "MALFORMED: " + bad.join(", ")
            : names.length + " models, " + names.reduce((a, n) => a + ITEMS[n].e.length, 0) + " edges total. " +
              "These are built by joining primitives and RE-INDEXING, which is exactly where an off-by-one " +
              "puts an edge on a vertex that is not there -- it draws a line to the origin and looks like a " +
              "stray spike rather than like a crash.");
    ok("...and no model is degenerate: each has real extent on all three axes",
        names.every((n) => [0, 1, 2].every((ax) => {
            const vs = ITEMS[n].v.map((p) => p[ax]);
            return Math.max(...vs) - Math.min(...vs) > 0.05;
        })),
        "a model flat on an axis is a model somebody built inside out; it would still project, still draw, " +
        "and read as a line when it turned edge-on.");
}

// =============================================================================================================
console.log("\n2. *** THE FIT HOLDS AT EVERY ANGLE, WHICH IS THE WHOLE REASON THIS IS NOT DONE IN THE CANVAS ***");
{
    let worstOut = -Infinity, worstAt = null, minFill = Infinity, minFillAt = null, checks = 0;
    for (const n of names) for (let deg = 0; deg < 360; deg++) {
        const segs = project(ITEMS[n], deg * Math.PI / 180, PANEL);
        checks++;
        let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
        for (const [x1, y1, x2, y2] of segs) for (const [x, y] of [[x1, y1], [x2, y2]]) {
            if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y;
        }
        const out = Math.max(PANEL.x - mnx, mxx - (PANEL.x + PANEL.w), PANEL.y - mny, mxy - (PANEL.y + PANEL.h));
        if (out > worstOut) { worstOut = out; worstAt = n + " at " + deg + " deg"; }
        const fill = Math.max((mxx - mnx) / PANEL.w, (mxy - mny) / PANEL.h);
        if (fill < minFill) { minFill = fill; minFillAt = n + " at " + deg + " deg"; }
    }
    say(`${checks} projections (${names.length} models x 360 degrees); worst overflow ${worstOut.toFixed(4)} px ` +
        `(${worstAt}); smallest long-axis fill ${minFill.toFixed(3)} (${minFillAt})`);
    ok("!! *** NOTHING EVER CROSSES THE PANEL EDGE, AT ANY ANGLE, FOR ANY MODEL ***",
        worstOut <= 0,
        `worst is ${worstOut.toFixed(4)} px OUTSIDE the panel, i.e. ${(-worstOut).toFixed(1)} px INSIDE it. ` +
        `The fit is measured on the projected extent AT THIS ANGLE, not on a radius taken once -- scaling by ` +
        `a radius from angle 0 is what lets a long item swing through the bezel as it turns, and it is the ` +
        `defect this row exists for.`);
    ok("!! ...and it is not achieved by drawing everything tiny: the silhouette still fills the panel",
        minFill > 0.85,
        `the smallest long-axis fill over all ${checks} projections is ${minFill.toFixed(3)} against a pad of ` +
        `0.90. A fit that passed the row above by shrinking to a dot would satisfy containment and be useless, ` +
        `so the floor is asserted beside the ceiling.`);
}

// =============================================================================================================
console.log("\n3. *** IT ACTUALLY TURNS, AND THE TURN IS NOT A REDRAW OF THE SAME PICTURE ***");
{
    const m = ITEMS["Stimpak"];
    const at = (deg) => project(m, deg * Math.PI / 180, PANEL);
    const d = (a, b) => a.reduce((s, seg, i) => s + Math.abs(seg[0] - b[i][0]) + Math.abs(seg[1] - b[i][1]), 0);
    const a0 = at(0), a1 = at(1), a90 = at(90), a180 = at(180), a360 = at(360);
    say(`sum |delta| from 0 deg: 1 deg -> ${d(a0, a1).toFixed(1)} px, 90 deg -> ${d(a0, a90).toFixed(1)} px, ` +
        `360 deg -> ${d(a0, a360).toFixed(4)} px`);
    ok("!! one degree moves the picture, and ninety moves it a lot more",
        d(a0, a1) > 1 && d(a0, a90) > 20 * d(a0, a1),
        "a projection that ignored its angle would pass every containment check in section 2 while showing a " +
        "still image. This is what separates a wireframe that turns from a wireframe that is merely drawn.");
    ok("!! ...and a full turn returns to where it started, so the rotation is a rotation",
        d(a0, a360) < 1e-6,
        `360 degrees differs from 0 by ${d(a0, a360).toExponential(2)} px total over ${a0.length} segments. ` +
        `A drift here would mean the transform is not orthonormal and the model would creep or shear over a ` +
        `long run -- the panel is on screen for as long as the page is, so a slow creep is a real failure.`);
    ok("...and 180 degrees is not the same picture as 0, which a symmetric bug would make it",
        d(a0, a180) > 1,
        "a yaw implemented with the wrong sign on one axis can look right and be a mirror; this asks the " +
        "half-turn to differ, which a mirrored model would not.");
}

// =============================================================================================================
console.log("\n4. *** THE LIST AND THE MODELS ARE THE SAME NAMES, AND A RENAME IS VISIBLE RATHER THAN SILENT ***");
{
    // The INV list lives in ui/pipboyWireframe.js. Read it rather than restating it: a second copy of the
    // names here would agree on the day it was written and drift the first time somebody edits the page.
    const src = fs.readFileSync(path.join(ENG, "ui", "pipboyWireframe.js"), "utf8");
    const block = (src.match(/const INV_ITEMS = \[([\s\S]*?)\];/) || [])[1] || "";
    const listed = [...block.matchAll(/\["([^"]+)",/g)].map((m) => m[1]);
    const missing = listed.filter((n) => !modelFor(n));
    say(`INV list as read from pipboyWireframe.js: ${listed.join(", ") || "(not found)"}`);
    ok("!! every name the INV page lists has a model, read from the page rather than restated here",
        listed.length >= 6 && missing.length === 0,
        missing.length ? "NO MODEL FOR: " + missing.join(", ")
            : `${listed.length} names, ${listed.length} models. The list is PARSED OUT OF THE PAGE, so ` +
              `renaming an entry there turns this red instead of quietly showing an empty panel.`);
    ok("!! ...and an unknown name yields null rather than the last model that worked",
        modelFor("Not An Item") === null && modelFor("") === null && modelFor(undefined) === null,
        "the page draws NO MODEL for a null and says so on the panel. Falling back to a previous model would " +
        "put a stimpak under the word BOBBLEHEAD, which is worse than an empty box because it looks correct.");
    ok("...and the wiring is present in the page: it imports the module and calls the projection",
        /from "\.\/pipboyItems\.mjs"/.test(src) && /_itemProject\(/.test(src) && /_itemModel\(/.test(src),
        "the panel is drawn by the page calling this module. Named here so that deleting the call goes red " +
        "rather than silently restoring the list-only screen this round exists to replace.");

    // *** AND THE PAGE MUST STAY IMPORTABLE IN NODE, WHICH THE FIRST DRAFT OF THIS ROUND BROKE. ***
    // ui/pipboyWireframe.js was importable before v4559; wiring the panel in with a browser-absolute
    // "/ui/pipboyItems.mjs" made it not. NOTHING WOULD HAVE CAUGHT IT: every gate that touches that file
    // reads it as TEXT, so the sweep stays green while the module stops loading. Every other sibling import
    // in ui/ is relative -- ./draggable.js, ./springMotion.js, ./swekRobot.js -- and so is this one now.
    ok("!! *** THE PAGE IS STILL IMPORTABLE IN NODE: NO BROWSER-ABSOLUTE SIBLING IMPORT ***",
        !/^import[^\n]*from\s*"\/(ui|render|world|physics)\//m.test(src) &&
        /from "\.\/pipboyItems\.mjs"/.test(src),
        "a leading-slash import resolves in the page and fails in Node, and this directory's convention is " +
        "relative. The check is on the SHAPE rather than on one filename, so the next sibling added with a " +
        "leading slash goes red too.");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\n*** WHAT IS NOT CHECKED: whether the items LOOK like what they are named. *** A stimpak is a barrel, a " +
    "flange, a plunger and a needle, and whether that reads as a stimpak at 190 pixels of green line is a " +
    "judgement no assertion here makes -- these rows check that a model is sound, fits, turns, and is the one " +
    "the list asked for. Nor is the CANVAS drawing checked: pageInv strokes the segments this module returns, " +
    "and that it strokes them in the right colour on the right screen is the browser gate's business, not " +
    "this one's.");
process.exit(fails ? 1 : 0);
