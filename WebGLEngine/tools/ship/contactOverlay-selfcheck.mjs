// WebGLEngine/tools/ship/contactOverlay-selfcheck.mjs -- v3586
//
// Run: node tools/ship/contactOverlay-selfcheck.mjs
// RUNTIME 0.6s MEASURED with date +%s%N around the run. Not remembered; v3211-v3213 found 59 of 82 headers wrong.
//
// *** ROUND 3 OF THE CONTACTS BLOCK, AND THE ONE THING IT MUST NOT DO IS DRAW A NUMBER THAT MEANS TWO THINGS. ***
// v3580 measured reported/needed at 1.742 during an impact, 14 to 30 while settling, and exactly 2 at rest. An
// overlay scaling arrow length by that would be showing the reader a quantity whose meaning changes with the
// regime, and they would have no way to tell which one they were looking at.
//
// This gate cannot screenshot -- render-QA does that, and the page is in the manifest for it. What it CAN do is
// drive the overlay's own arithmetic in node against the real wasm, and read the page for the claims it makes.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initNode, mod, has } from "../../physics/box3d/box3dNode.mjs";
import { restingBudget, contactRows, sumTotal } from "../../physics/mechanics/contactImpulse.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

const PAGE = fs.readFileSync(path.join(ENG, "box3d-contacts.html"), "utf8");
const LOADER = fs.readFileSync(path.join(ENG, "physics", "box3d", "box3dLoader.js"), "utf8");

console.log("contactOverlay-selfcheck -- the overlay, and what it is allowed to claim\n");

const st = await initNode();
if (!st.ready) { console.log("  box3d wasm not loadable: " + st.reason); process.exit(1); }

// ---------------------------------------------------------------------------
console.log("1. THE LOADER CAN READ CONTACTS, AND SAYS SO WHEN IT CANNOT");
{
    ok("!! readContacts and supportsContacts exist on the browser loader",
        /readContacts\(\)/.test(LOADER) && /supportsContacts\(\)/.test(LOADER),
        "the shim declared three rounds at v3037 -- exports, gate, overlay. v3569 built the exports, v3580 " +
        "drove them, AND NOTHING COULD DRAW THEM because the browser loader had no accessor at all.");
    ok("!! it returns null rather than [] when the artifact has no contact exports",
        /if \(!this\.supportsContacts\(\)\) return null;/.test(LOADER),
        "*** ABSENT IS NOT EMPTY. *** An artifact built before v3037 has no contact functions, and [] would " +
        "render an untroubled scene with nothing touching -- indistinguishable from a world at rest.");
    ok("!! ...and it hands over BOTH impulses rather than picking one",
        /totalImpulse:/.test(LOADER) && /lastImpulse:/.test(LOADER),
        "totalNormalImpulse is solve+relax summed; normalImpulse is the final substep. A loader that exposed " +
        "one would let a page imply it was the force.");
}

// ---------------------------------------------------------------------------
console.log("\n2. THE ARITHMETIC THE PANEL SHOWS, DRIVEN AGAINST THE REAL WASM");
{
    const r = restingBudget({ dt: 1 / 240, substeps: 4 });
    report("closure at rest  (sum/2) / (m g dt)", r.closure.toFixed(4));
    ok("!! the panel's closure formula lands near 1.00 when the stack is settled",
        Math.abs(r.closure - 1) < 1e-3,
        "the page divides the SAME way: sum of totalNormalImpulse on body 1, halved, over m*g*dt. *** THE " +
        "READOUT IS THE MEASUREMENT v3580 ESTABLISHED, NOT A NEW ONE. ***");
    ok("!! and the page uses body 1 only, so the arithmetic is one mass and one weight",
        /c\.body === 1/.test(PAGE) && /8 \* HALF \* HALF \* HALF \* G \* DT/.test(PAGE),
        "summing every body's contacts against ONE body's weight would produce a number that drifts with the " +
        "stack height and mean nothing");
    ok("...and the page's constants match what the formula assumes",
        /const DT = 1 \/ 240, SUB = 4, G = 9.8, HALF = 0.5;/.test(PAGE),
        "m = 8*half^3*density with density 1, so the weight term is only right for these half-extents");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE ARROWS ARE RELATIVE, BECAUSE THE IMPULSE IS NOT A FORCE ***");
{
    ok("!! arrow length is normalised WITHIN THE FRAME",
        /const maxImp = Math\.max\(1e-12/.test(PAGE) && /c\.totalImpulse \/ maxImp/.test(PAGE),
        "*** v3580 MEASURED reported/needed AT 1.742 DURING AN IMPACT, 14 TO 30 WHILE SETTLING, AND EXACTLY 2 " +
        "AT REST. *** An absolute scale would make the same arrow mean a different thing in each regime, and " +
        "the reader would have no way to tell which they were seeing.");
    ok("!! the page SAYS the impulse is not a momentum budget",
        /not a momentum budget/i.test(PAGE) && /1\.742/.test(PAGE),
        "with the measured numbers on the page rather than a vague caution. A warning without its evidence is " +
        "advice; with it, it is a finding the reader can check.");
    ok("!! ...and it shows whether the stack is settled, so the regime is visible",
        /settled/.test(PAGE) && /closure is meaningless here/.test(PAGE),
        "*** THE READER CAN SEE WHICH REGIME THEY ARE IN RATHER THAN BEING ASKED TO REMEMBER. *** The closure " +
        "line is labelled meaningless while moving, which is the honest state of the number.");
    ok("the divide-by-zero case is handled rather than producing NaN arrows",
        /Math\.max\(1e-12/.test(PAGE),
        "every contact at zero impulse would otherwise normalise to NaN and draw nothing, which looks like a " +
        "page that failed rather than a frame with no load");
}

// ---------------------------------------------------------------------------
console.log("\n4. THE PAGE WAS WRITTEN AGAINST THE REAL API, AND THE FIRST DRAFT WAS NOT");
{
    ok("!! it imports the exported singleton and calls createWorld with an options object",
        /import \{ box3d \} from/.test(PAGE) && /box3d\.createWorld\(\{ gravity/.test(PAGE) &&
        /addBox\(\{ type: "static"/.test(PAGE),
        "*** THE FIRST DRAFT INVENTED M.init() RETURNING A WORLD, POSITIONAL addBox(type,x,y,z,...) AND A " +
        "w.isFallback FLAG. NONE OF THOSE EXIST. *** A page written against a remembered API renders a blank " +
        "canvas and reads as a physics bug rather than as a typo.");
    ok("!! an unbuilt wasm shows the loader's own rebuild instructions rather than a black canvas",
        /st\.ready/.test(PAGE) && /st\.reason/.test(PAGE),
        "the loader already composes the message; swallowing it would leave a blank page that looks like a " +
        "rendering fault");
    ok("!! and the page is in the render-QA manifest, which is what actually proves it draws",
        (() => { const m = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "render-qa", "manifest.json"), "utf8"));
                 return m.pages.some((p) => p.name === "box3d-contacts" && p.url === "/box3d-contacts.html"); })(),
        "*** THIS GATE CANNOT SCREENSHOT. *** notAllBlack and notUniform in headless Chromium are what catch a " +
        "canvas that stopped painting, and claiming here that the overlay 'works' would be asserting something " +
        "no check in this file can see.");
}

// ---------------------------------------------------------------------------
console.log("\n5. AND THE CONTACT DATA IS REAL, NOT A SHAPE THAT HAPPENS TO PARSE");
{
    const m = mod();
    m._swk_world_create(0, -9.8, 0);
    m._swk_body_box(0, 0, -0.5, 0, 20, 0.5, 20, 1);
    m._swk_body_box(1, 0, 0.5, 0, 0.5, 0.5, 0.5, 1);
    for (let i = 0; i < 300; i++) m._swk_world_step(1 / 240, 4);
    const rows = contactRows(1, m);
    const up = rows.filter((r) => Math.abs(r[5] - 1) < 1e-6 || Math.abs(r[5] + 1) < 1e-6);
    report("contact rows on the resting box", String(rows.length));
    m._swk_world_destroy();

    ok("!! four contacts, one per corner",
        rows.length === 4,
        "a box on a plane. Fewer would mean the manifold is being under-reported and the overlay would draw an " +
        "unstable-looking stack that is actually fine");
    ok("!! every normal is vertical, which is what a flat rest means",
        up.length === rows.length,
        "*** A NORMAL POINTING SIDEWAYS ON A SETTLED FLAT CONTACT IS THE FAULT AN OVERLAY EXISTS TO SHOW, *** " +
        "and it is checked here numerically so the drawing is not the only place it could be caught.");
    ok("...and the points are at the corners rather than all at the origin",
        new Set(rows.map((r) => r[1].toFixed(3) + "," + r[3].toFixed(3))).size === 4,
        "v3569 found the anchor is an OFFSET FROM THE CENTRE OF MASS, not a world point -- getting that wrong " +
        "would put every contact near the origin AND LOOK PLAUSIBLE on a body that sits there");
}

console.log(fails ? `\ncontactOverlay-selfcheck: ${fails} FAILED` : "\ncontactOverlay-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
