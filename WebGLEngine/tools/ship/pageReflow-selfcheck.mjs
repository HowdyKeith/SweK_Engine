// WebGLEngine/tools/ship/pageReflow-selfcheck.mjs -- v3403
//
// *** A LAYOUT READ AFTER A DOM WRITE FORCES A SYNCHRONOUS RELAYOUT, AND KEITH'S CONSOLE MEASURED IT AT 154ms. ***
//
//     el.innerHTML = ...;                 // invalidates layout
//     el.scrollTop = el.scrollHeight;     // FORCES a full layout, mid-script, to answer the read
//
// server.html carried THREE hand-written copies of that idiom -- render a log, scroll it to the bottom -- and the
// page paused before the gauges and avatar could appear. THE FIX DOES NOT CHANGE WHAT HAPPENS, IT CHANGES WHEN:
// the scroll is deferred to the next animation frame, so the browser lays out ONCE on its own schedule and the
// read is free. The scroll still lands before the next paint, which is why nothing looks different.
//
// AND IT IS ONE SPELLING, for the reason the round before this one paid for: three hand-written copies of a
// layout idiom is how the fourth gets written differently.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ENG = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

// v3403b -- *** THE FIRST VERSION OF THIS GATE SCANNED server.html ONLY, AND THE REFLOW WAS IN THE MODULES. ***
// It reported "server.html forces no relayout" -- true, and useless, because the 267ms was in ui/minitabLayout.js.
// A SUBSET THAT LOOKS LIKE A CORPUS, this project's own named failure, committed inside the round whose whole
// point was measuring the thing. The walk now covers ui/ as well as the pages.
function walk(dir, out = []) {
    let entries; try { entries = fs.readdirSync(dir); } catch { return out; }
    for (const f of entries) {
        if (/^(node_modules|vendor|\.git)$/.test(f)) continue;
        const p2 = path.join(dir, f);
        let st; try { st = fs.statSync(p2); } catch { continue; }
        if (st.isDirectory()) walk(p2, out);
        else if (/\.(js|mjs|html)$/.test(f)) out.push(p2);
    }
    return out;
}
const SCANNED = [...walk(path.join(ENG, "ui")), path.join(ENG, "server.html")];
const READ = /\.(offsetWidth|offsetHeight|offsetTop|clientWidth|clientHeight|scrollHeight|scrollWidth|getBoundingClientRect)\b/g;
// *** classList.contains IS A READ, AND MATCHING BARE `classList` FLAGGED IT AS A WRITE. *** That false positive
// cost a real investigation this round, so the mutators are named instead of the property.
const WRITE = /(innerHTML|textContent|\.style\.|appendChild|setAttribute|classList\.(add|remove|toggle))/;

/** A read that follows a DOM write inside the same loop body -- the shape that forces a relayout per iteration. */
const LOOP = /(\.forEach\(|\.map\(|for\s*\(|while\s*\()/g;
function offenders(src) {
    const out = [];
    for (const m of src.matchAll(READ)) {
        const before = src.slice(Math.max(0, m.index - 600), m.index);
        LOOP.lastIndex = 0;
        if (!(LOOP.test(before) && WRITE.test(before))) { LOOP.lastIndex = 0; continue; }
        LOOP.lastIndex = 0;
        // *** AND A PURE READ PASS IS NOT THRASH -- IT IS THE FIX. *** After the write/read/write split in
        // minitabLayout, pass 2 is an arr.map() of nothing but measurements, and the character window still saw
        // pass 1's writes behind it. A WINDOW IS NOT A SCOPE, for the second round running and in my own new
        // instrument this time. So: if NO write appears between the nearest loop opener and the read, the read
        // stands alone in its pass and is exempt. Decidable from the source, not a name list (v3141's rule).
        let last = -1;
        for (const l of src.slice(0, m.index).matchAll(LOOP)) last = l.index;
        if (last >= 0 && !WRITE.test(src.slice(last, m.index))) continue;
        out.push({ prop: m[1], line: src.slice(0, m.index).split("\n").length });
    }
    return out;
}

// ---- 1. THE PAGE THAT WAS MEASURED IS CLEAN, AND THE DETECTOR CAN FAIL ------------------------------------
{
    const hits = [];
    for (const f of SCANNED) {
        for (const o of offenders(fs.readFileSync(f, "utf8"))) hits.push(path.relative(ENG, f) + ":" + o.line + " " + o.prop);
    }
    say("scanned " + SCANNED.length + " files across ui/ and the dashboard; offenders: " + (hits.length || "none"));
    ok("!! *** nothing reads layout after a DOM write inside a loop ***",
        hits.length === 0,
        hits.join(", ") || "minitabLayout's dock loop forced ONE FULL RELAYOUT PER PANEL (Keith measured 267ms) " +
        "and is now write/read/write; comicPanel hoisted its stage measurement; the three log panels defer to " +
        "requestAnimationFrame");
    // A CENSUS THAT FINDS NOTHING IS INDISTINGUISHABLE FROM A BROKEN SCAN, so the detector is shown FIRING on
    // the exact code that was there before the fix.
    const wasThere = `arr.forEach(el => { el.style.top = "0px"; const s = el.offsetHeight; acc += s; });`;
    ok("...and the detector fires on the pattern that WAS there, so the zero above is a result",
        offenders(wasThere).length === 1,
        "fed minitabLayout's PRE-FIX loop it reports one site; a scan that could not fail would make the " +
        "clean result above meaningless");
}

// ---- 2. ONE SPELLING, AND IT DEFERS RATHER THAN DROPS -----------------------------------------------------
{
    const html = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
    const helper = (html.match(/window\.swekScrollToEnd = function[\s\S]*?\n\};/) || [""])[0];
    // MY FIRST COUNT EXPECTED FOUR AND THE DEFINITION DOES NOT MATCH ITS OWN CALL PATTERN -- it is written
    // `window.swekScrollToEnd = function (el)`, so only the three CALL SITES carry `swekScrollToEnd(`. Counting
    // a definition as a reference is the same class of arithmetic slip as the 114-vs-103 control census.
    const calls = (html.match(/swekScrollToEnd\(/g) || []).length;
    ok("!! the scroll idiom is defined ONCE and every site routes through it",
        /requestAnimationFrame/.test(helper) && helper.length > 0 && calls === 3,
        calls + " call sites and one definition -- the three log panels that used to force the relayout");
    ok("...and it DEFERS the read rather than dropping the scroll",
        /el\.scrollTop = el\.scrollHeight/.test(helper),
        "the behaviour is unchanged and only its timing moved -- a fix that also changed what the page DOES " +
        "would need its own argument, and would have made the 154ms unattributable");
    ok("...and it falls back to a timeout where requestAnimationFrame is absent",
        /setTimeout\(f, 16\)/.test(helper),
        "a headless or very old context still scrolls rather than silently not scrolling");
}

// ---- 3. AN UNHANDLED REJECTION MUST PRINT MORE THAN ITS TYPE ---------------------------------------------
{
    const html = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
    ok("!! *** a rejection with a plain object prints its OWN FIELDS, not the word Object ***",
        /addEventListener\("unhandledrejection"/.test(html) && /Object\.keys\(r\)/.test(html),
        "Keith's console showed `Uncaught (in promise) Object` with no line and no fields -- a report nobody " +
        "can act on");
    ok("...and it REPORTS rather than swallows",
        !/ev\.preventDefault\(\)/.test(html.slice(html.indexOf("unhandledrejection"), html.indexOf("unhandledrejection") + 900)),
        "calling preventDefault would silence the console line and hide a real failure. THE POINT IS TO MAKE " +
        "THE EXISTING MESSAGE LEGIBLE, NOT TO REMOVE IT");
    ok("...and an Error is left alone, because the console already formats one properly",
        /!\(r instanceof Error\)/.test(html),
        "wrapping an Error would replace a stack trace with a field dump, which is strictly worse");
}

console.log(failed ? "\n[pageReflow-selfcheck] FAILED " + failed : "\n[pageReflow-selfcheck] all checks pass");
process.exit(failed ? 1 : 0);
