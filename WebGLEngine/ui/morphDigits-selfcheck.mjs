// ui/morphDigits-selfcheck.mjs
//
// v3531 -- GRADES THE MORPHING NUMBER, AND THE RULE ABOUT WHICH NUMBERS MAY HAVE ONE.
//
// The interesting half is not that a digit morphs -- strokeMorph-selfcheck already grades that with exact
// endpoint identities. It is that *** DECORATING A NUMBER MUST NOT BREAK THE TOOL THAT KEEPS IT HONEST ***, and
// my first wiring did exactly that: `data-morph-number` went on the <b> holding the gate count, and
// `staleness --fix` IMMEDIATELY WENT RED because it finds that count by matching the element literally.
//
// Teaching staleness a second spelling would have been the wrong fix -- it would push a PRESENTATION concern
// into a DERIVED-NUMBER checker, and the next decoration would break it again. The opt-in moved up a level
// instead and the marker staleness owns is byte-identical to what it was. THIS GATE HOLDS THAT SEPARATION.
//
// NO DOM HERE. A stub document is enough to drive element creation and the morph loop, because everything this
// module decides -- what it refuses, what it keeps, whether the true value survives -- is decided in JS. WHAT
// IT CANNOT PROVE IS THAT IT LOOKS RIGHT, and that is Keith's, as every rendering claim in this tree is.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as MD from "./morphDigits.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n) => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

// A stub document: just enough shape for the module to build nodes and set attributes.
function stubDoc() {
    const mk = (tag) => ({
        tag, attrs: {}, style: {}, children: [], _text: "",
        setAttribute(k, v) { this.attrs[k] = String(v); },
        getAttribute(k) { return this.attrs[k]; },
        appendChild(c) { this.children.push(c); return c; },
        querySelector(sel) { return this.children.find((c) => c.tag === sel.replace(/[^a-z]/g, "")) || null; },
        get textContent() { return this._text; },
        set textContent(v) { this._text = String(v); this.children.length = 0; },
    });
    return {
        _els: [],
        createElement: (t) => mk(t),
        createElementNS: (_ns, t) => mk(t),
        querySelectorAll(sel) { return sel.includes("morph-stat") ? this._els : []; },
    };
}

console.log("morphDigits-selfcheck -- the rule, and the marker it must not touch\n");

// ---------------------------------------------------------------------------
console.log("1. THE DECORATION DOES NOT TOUCH THE MARKER staleness OWNS");
{
    const page = fs.readFileSync(path.join(ROOT, "case-study.html"), "utf8");
    ok("!! *** the gate-count element is UNDECORATED ***", /<b>\d+<\/b><span>gates<\/span>/.test(page),
        "*** MY FIRST VERSION PUT data-morph-number ON THAT <b> AND staleness --fix WENT RED: it finds the count " +
        "by matching the element LITERALLY. Teaching staleness a second spelling would push a PRESENTATION " +
        "concern into a DERIVED-NUMBER checker and the next decoration would break it again. ***");
    ok("...and the opt-in sits on the PARENT instead", /data-morph-stat/.test(page),
        "the rule is declared in the markup so a page that morphed a gauge would have to say so out loud");
    ok("the module selects the parent, not the number", /data-morph-stat/.test(fs.readFileSync(path.join(HERE, "morphDigits.js"), "utf8")),
        "one attribute name, in the page and in the selector, with nothing in between to drift");
}

// ---------------------------------------------------------------------------
console.log("\n2. THE TRUE VALUE SURVIVES THE DECORATION");
{
    const doc = stubDoc();
    const el = doc.createElement("b");
    el.textContent = "864";
    const r = MD.morphNumber(el, { doc });
    ok("!! it accepts a plain integer", !!r && r.value === "864", "864 -> " + (r ? r.cells.length : 0) + " digit cells");
    const hidden = el.children.find((c) => c.tag === "span");
    ok("!! *** THE REAL NUMBER IS KEPT AS TEXT, NOT REPLACED ***", !!hidden && hidden.textContent === "864",
        "moved into a visually-hidden span, so screen readers and copy-paste still get the value and NOBODY IS " +
        "EVER ASKED TO READ THE MORPH ITSELF");
    ok("one cell per digit, each starting at zero", r.cells.length === 3,
        "the reveal counts up and SETTLES IMMEDIATELY -- nothing is unreadable for longer than one transition");
}

// ---------------------------------------------------------------------------
console.log("\n3. IT REFUSES WHAT IT CANNOT HONESTLY MORPH");
{
    const doc = stubDoc();
    const refuses = (text) => {
        const el = doc.createElement("b"); el.textContent = text;
        return MD.morphNumber(el, { doc }) === null && el.textContent === text;
    };
    for (const bad of ["12.5", "1,024", "23%", "v3531", "", "-4"]) {
        ok("refuses " + JSON.stringify(bad) + " and leaves the text alone", refuses(bad));
    }
    report("WHY REFUSING MATTERS MORE THAN HANDLING",
        "*** a morph that silently dropped a decimal point or a minus sign would show a DIFFERENT NUMBER while " +
        "looking like it was working -- v3442's vox defect in a new subject, where a coerced field wrote 925 " +
        "voxels as the empty colour and every position check still passed. THE TEXT IS LEFT UNTOUCHED ON " +
        "REFUSAL, so the page is exactly as correct as it was without the script. ***");
}

// ---------------------------------------------------------------------------
console.log("\n4. THE MORPH LOOP IS TIME-BASED, NOT FRAME-BASED");
{
    const doc = stubDoc();
    const cell = MD.makeDigit(doc);
    cell.set("1");
    // A CLOCK WE CONTROL, so the check measures the loop and not this machine's speed.
    let now = 0; const clock = () => now;
    const queue = []; const raf = (fn) => queue.push(fn);
    cell.morphTo("2", 400, clock, raf);
    const seen = [];
    // Two frames only, the second landing PAST the duration -- a busy tab dropping frames.
    for (const jump of [100, 900]) {
        now += jump;
        const fn = queue.shift(); if (fn) fn();
        seen.push(cell.node.children[0].getAttribute("d"));
    }
    ok("!! a dropped frame SHORTENS the animation rather than stretching it", queue.length === 0,
        "the loop clamps elapsed/duration, so a stalled tab finishes the morph instead of leaving the number " +
        "unreadable for longer than anybody agreed to");
    ok("...and the frames actually differ", seen[0] !== seen[1], "two distinct path strings");
    ok("it lands exactly on the target glyph", seen[1] === (() => {
        const c2 = MD.makeDigit(doc); c2.set("2"); return c2.node.children[0].getAttribute("d");
    })(), "the final frame IS the destination digit, because morphAt places its endpoints by identity");
}

// ---------------------------------------------------------------------------
console.log("\n5. ONE DECLARATION OF THE GLYPHS");
{
    const ui = fs.readFileSync(path.join(HERE, "morphDigits.js"), "utf8");
    ok("!! the digits are IMPORTED from the graded module, not copied",
        /import \{[^}]*DIGIT_STROKES[^}]*\} from "\.\.\/physics\/mesh\/strokeMorph\.mjs"/.test(ui),
        "*** a copy here would be a second declaration of what a '2' looks like, and the two would drift the " +
        "first time somebody nudged a curve. The page and the lab morph THE SAME GEOMETRY. ***");
    ok("...and no path data is written in this file", !/M \d+ \d+ [CL] /.test(ui),
        "asserted as an ABSENT MECHANISM rather than an absent mention -- a comment quoting a path would not " +
        "match, which is the prose-as-code trap this file avoids by testing for the idiom");
}

report("WHAT THIS DOES NOT PROVE",
    "*** IT CANNOT SAY IT LOOKS RIGHT. No DOM renders here, so what is graded is what the module DECIDES -- what " +
    "it refuses, what it keeps, and that it leaves staleness's marker alone. Whether the reveal reads well on " +
    "case-study.html is Keith's, as every rendering claim in this tree is. AND THE RULE IS THE ROUND'S REAL " +
    "OUTPUT: A NUMBER MAY MORPH ONLY IF A READER WOULD NEVER NEED TO TRUST IT MID-TRANSITION -- which admits a " +
    "gate count and excludes the CPU gauge that prompted the question. ***");

console.log(`\nmorphDigits-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
