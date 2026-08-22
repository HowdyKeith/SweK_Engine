// WebGLEngine/tools/ship/installHistoryReadout-selfcheck.mjs -- v3578
//
// Run: node tools/ship/installHistoryReadout-selfcheck.mjs
// RUNTIME 0.2s MEASURED with date +%s%N around the run. Not remembered; v3211-v3213 found 59 of 82 headers wrong.
//
// *** IT DRIVES THE RENDERER OUT OF server.html RATHER THAN A COPY OF IT. *** The function is extracted from the
// page source and called with a fake element and three payload shapes. A gate holding its own copy of the
// formatting would pass forever while the page said something else -- which is the second-copy defect this
// session has now found in nine files, three, four, 59 of 82, and two indexes.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeOnly } from "./sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("installHistoryReadout-selfcheck -- what the header says when there is nothing to measure\n");

const src = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
const m = src.match(/var el=document\.getElementById\("instHist"\)[\s\S]*?\}\)\.catch/);
if (!m) { console.log("  FAIL  could not find the instHist renderer in server.html"); process.exit(1); }

// *** v3941 -- THE SLICE STARTED AT `if(!j||!j.ok` AND v3912 INSERTED THREE DECLARATIONS ABOVE THAT LINE. ***
//
//     var lineEl = document.getElementById("instHistLine");
//     var hide = function(){ el.textContent = ""; if (lineEl) lineEl.style.display = "none"; };
//     var show = function(){ if (lineEl) lineEl.style.display = ""; };
//     if(!j||!j.ok||!j.runs||!j.runs.length){ hide(); return; }      <-- the old start of the slice
//
// So the extraction took a body that CALLS show() and hide() and left their declarations behind, and this gate
// stopped being a gate: it threw ReferenceError before its first assertion and exited non-zero with no verdict
// about the page at all. A crash is not a failing check -- nothing below it ran, including the four checks that
// exist to notice the renderer moving.
//
// THE BOUNDARY WAS THE BUG, NOT THE PAGE. An offset hand-picked at one line of a function body is a claim that
// nothing will ever be inserted above it, and v3912 inserted three things. The slice now takes THE WHOLE
// CALLBACK BODY -- from the opening of `.then(function(j){` to its close -- so anything the body declares comes
// with it, and section 4 below asserts that the helpers it calls are actually inside the captured text.
const BODY_OPEN = ".then(function(j){";
const bodyAt = m[0].indexOf(BODY_OPEN);
if (bodyAt < 0) { console.log("  FAIL  could not find the instHist callback body in server.html"); process.exit(1); }
const inner = m[0].slice(bodyAt + BODY_OPEN.length, m[0].lastIndexOf("}).catch"));

// The page hides the CONTAINER, not just the span, so the harness has to own both -- and a document stub is
// what lets the extracted body reach the second one without this file re-implementing what it does with it.
function render(j) {
    const el = { textContent: null, title: null };
    const lineEl = { style: { display: "" } };
    const logs = [];
    const doc = { getElementById: (id) => (id === "instHistLine" ? lineEl : null) };
    new Function("j", "el", "document", "console", inner + "\nreturn 0;")(
        j, el, doc, { log: (...a) => logs.push(a.join(" ")) });
    return { text: el.textContent || "", title: el.title || "", logs, display: lineEl.style.display };
}
const NOTE = "measured by the server.";

// ---------------------------------------------------------------------------
// *** 0. THE SLICE MUST BE SELF-CONTAINED, AND THIS HAS TO RUN BEFORE ANYTHING IS RENDERED. ***
//
// v3941 -- my first version of this guard sat in section 4, at the bottom, and it was useless there: render()
// is called in section 1, so a decapitated slice still threw ReferenceError before the guard could report a
// thing. A CHECK THAT RUNS AFTER THE CRASH IT DESCRIBES IS NOT A GUARD, and the plant that restored the old
// boundary said so immediately -- the file still died with no verdict at all.
//
// The old slice began at a hand-picked line inside the callback body, which is a standing claim that nobody
// will ever declare anything above it. v3912 declared three things -- lineEl, hide and show -- and the gate
// began calling helpers that had been left behind. Nothing is listed by name here: the declared set and the
// called set are both read off the extracted text.
//
// codeOnly() is the tree's own stripper -- comments gone, string CONTENTS gone, quotes kept. Scanning the raw
// slice reported `bridge` and `run` as dangling: one sits in a comment explaining where the ceiling comes from,
// the other inside "The most recent run (". PROSE-AS-CODE, on the first run of a check written to catch a
// different prose-as-code bug, and fixed with the same helper downloadScan reaches for.
const SUPPLIED = new Set(["j", "el", "document", "console", "fetch", "Number", "String", "Math", "JSON",
                          "parseInt", "parseFloat", "isNaN", "Date", "Object", "Array", "Boolean", "RegExp"]);
const KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "function", "return", "typeof", "new",
                          "do", "else", "in", "of", "delete", "void", "instanceof"]);
const codeText = codeOnly(inner);
const declaredIn = new Set([...codeText.matchAll(/\bvar\s+([A-Za-z_$][\w$]*)/g)].map((x) => x[1]));
const calledIn = new Set([...codeText.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)].map((x) => x[2]));
const dangling = [...calledIn].filter((n) => !declaredIn.has(n) && !SUPPLIED.has(n) && !KEYWORDS.has(n));
ok("!! *** the captured body is SELF-CONTAINED: every helper it calls is declared inside it ***",
    dangling.length === 0,
    dangling.length
      ? "DANGLING: " + dangling.join(", ") + " -- called by the extracted body and declared above the cut. That " +
        "is the v3912 crash exactly, and it is a BOUNDARY bug rather than a page bug."
      : declaredIn.size + " declarations captured, " + calledIn.size + " call sites, none reaching outside the " +
        "slice. *** THIS IS THE LINE THAT WOULD HAVE CAUGHT v3912 THE DAY IT LANDED, and it costs nothing " +
        "because both sets are read off the extracted text rather than written down here.");
if (dangling.length) {
    console.log("\n  ----  REFUSING TO RUN THE RENDER CHECKS: the slice cannot execute, so every verdict below " +
                "would be a crash rather than a finding.");
    console.log("\ninstallHistoryReadout-selfcheck: " + fails + " FAILED");
    process.exit(1);
}

// ---------------------------------------------------------------------------
console.log("1. A REAL MEASUREMENT STILL GETS THE HEADER, WHICH IS WHAT THE HEADER IS FOR");
{
    const r = render({ ok: true, runs: [{ installToReadyMs: 4200, newBuild: true }],
                       avgNewBuildMs: 5000, avgRestartMs: 900, note: NOTE });
    report("text", JSON.stringify(r.text));
    ok("!! the last run's timing and both averages are shown",
        /ready in 4\.2s \(new build\)/.test(r.text) && /avg new/.test(r.text) && /avg restart/.test(r.text),
        "nothing about this round makes a measured install quieter");
    ok("...and new-build and restart stay apart",
        /avg new/.test(r.text) && /avg restart/.test(r.text),
        "a single blended average would describe neither operation, which is the whole point of the readout");
    ok("...and the container is SHOWN when there is something to say",
        r.display === "",
        `instHistLine display ${JSON.stringify(r.display)}. The hide/show pair is only correct if BOTH halves ` +
        "are exercised: a renderer that hid the line unconditionally would pass the empty case on its own.");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** A RUN WITH NO TIMING NO LONGER OCCUPIES THE HEADER ***");
{
    const r = render({ ok: true, runs: [{ installToReadyMs: null, newBuild: true }],
                       avgNewBuildMs: 5000, avgRestartMs: 900, note: NOTE });
    report("text", JSON.stringify(r.text));
    ok("!! \"start-to-ready NOT RECORDED\" is gone from the visible text",
        !/NOT RECORDED/.test(r.text),
        "*** IT WAS SITTING IN THE TITLE BAR ON EVERY LOAD. *** installToReadyMs is null for every run started " +
        "a way that does not record, so the condition is NOT AN EVENT -- it is a STANDING STATE, and a standing " +
        "state announced in a header is noise that trains you to stop reading the header.");
    ok("!! the averages survive, because they are real measurements even when the last run is not",
        /avg new 5\.0s/.test(r.text) && /avg restart 900ms/.test(r.text),
        "blanking the whole readout would have thrown away two true numbers to suppress one absent one");
}

// ---------------------------------------------------------------------------
console.log("\n3. AND IT IS NOT SILENTLY DROPPED, WHICH IS WHAT v3538 WAS DEFENDING");
{
    const r = render({ ok: true, runs: [{ installToReadyMs: null, newBuild: false }],
                       avgNewBuildMs: null, avgRestartMs: null, note: NOTE });
    report("text / title", JSON.stringify(r.text) + " / " + JSON.stringify(r.title.slice(-70)));
    ok("!! with nothing measurable at all the header is EMPTY rather than dashed",
        r.text === "",
        "*** v3538 IS ONLY HALF RIGHT AND THE HALF THAT IS RIGHT IS KEPT. *** It found \"ready in --\" and " +
        "correctly refused it, because A DASH LIES: it renders a run with no timing as a completed measurement " +
        "with a missing number. Naming the third case was right; GIVING IT PERMANENT HEADER REAL ESTATE WAS " +
        "NOT. An empty span makes no claim at all, which a dash cannot say.");
    ok("!! the fact moves to the TITLE, which survives an empty span",
        /recorded no start-to-ready/.test(r.title),
        "one hover away instead of one glance away forever");
    ok("!! ...and to the CONSOLE, so it is reachable without a pointer",
        r.logs.length === 1 && /NOT RECORDED/.test(r.logs[0]),
        "a title needs a hover target and a zero-width span is a poor one, so the console carries it too. *** " +
        "SUPPRESSED IS NOT THE SAME AS DELETED, and this is the difference stated in two places. ***");
    ok("the note is APPENDED to the existing title rather than replacing it",
        r.title.includes(NOTE) && r.title.includes("recorded no start-to-ready"),
        "the standing explanation of what install-to-ready even means is still the first thing a hover says");

    // *** v3941 -- AND THE ROUND THAT BROKE THIS GATE HAD NO KEY OF ITS OWN. *** v3912's finding was that an
    // empty span still took up a line: el.textContent = "" blanked the text and left the DIV around it holding
    // its padding, so "nothing to report" rendered as a permanent gap in the header. It added hide() and show()
    // to fix that -- and those two calls are what this gate then crashed on, while the behaviour they implement
    // was asserted by nothing. An empty string was checked; the empty LINE it was supposed to remove was not.
    ok("!! *** THE CONTAINER IS HIDDEN, NOT MERELY BLANKED -- v3912'S FINDING, WHICH NOTHING GATED ***",
        r.text === "" && r.display === "none",
        `text ${JSON.stringify(r.text)} and instHistLine display ${JSON.stringify(r.display)}. An empty span is ` +
        "still a span: the DIV around it keeps its padding and renders as a gap in the header forever. " +
        "CHECKING THE TEXT IS EMPTY CANNOT SEE THAT -- both readings are identical on the text and differ only " +
        "on the container, which is why this needed its own line and did not have one.");
}

// ---------------------------------------------------------------------------
console.log("\n4. THE GATE DRIVES THE PAGE, NOT A COPY OF IT");
{
    ok("!! the renderer is extracted from server.html at run time",
        inner.length > 200 && inner.includes("installToReadyMs"),
        "*** A GATE HOLDING ITS OWN COPY OF THE FORMATTING WOULD PASS FOREVER WHILE THE PAGE SAID SOMETHING " +
        "ELSE *** -- the second-copy defect this session has found in nine files, three, four, 59 of 82, and " +
        "two page indexes.");
    ok("...and it fails loudly if the renderer moves rather than passing on an empty match",
        !!m,
        "a regex that stopped matching would otherwise turn every check below it into a check of nothing");

}

console.log(fails ? `\ninstallHistoryReadout-selfcheck: ${fails} FAILED` : "\ninstallHistoryReadout-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
