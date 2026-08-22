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

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("installHistoryReadout-selfcheck -- what the header says when there is nothing to measure\n");

const src = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
const m = src.match(/var el=document\.getElementById\("instHist"\)[\s\S]*?\}\)\.catch/);
if (!m) { console.log("  FAIL  could not find the instHist renderer in server.html"); process.exit(1); }
const inner = m[0].slice(m[0].indexOf("if(!j||!j.ok"), m[0].lastIndexOf("}).catch"));

function render(j) {
    const el = { textContent: null, title: null };
    const logs = [];
    new Function("j", "el", "console", inner + "\nreturn 0;")(j, el, { log: (...a) => logs.push(a.join(" ")) });
    return { text: el.textContent || "", title: el.title || "", logs };
}
const NOTE = "measured by the server.";

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
