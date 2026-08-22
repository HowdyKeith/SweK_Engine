// WebGLEngine/tools/ship/installTiming-selfcheck.mjs -- v3912
// ---------------------------------------------------------------------------------------------------------------
// "ready in 4180.6s (new build)" -- SEVENTY MINUTES, PARKED IN server.html's HEADER AND NEVER LEAVING.
//
// The number was honest arithmetic and a dishonest claim. installToReadyMs is bootAt minus main.js's mtime, so it
// counts every minute the build merely EXISTED before anyone launched it. Download a zip at ten, start it at
// eleven, and this reports an hour-long install. installHistory's own note conceded the mechanism -- "mtime says
// when the file was written, not when the work began" -- but it assumed install and boot are ONE CONTINUOUS
// ACTION. They are for the updater and they are not for a hand-downloaded build, which is the case this readout
// was most likely to meet.
//
// SO THERE IS A CEILING, AND PAST IT THE RUN IS NOT AN INSTALL MEASUREMENT AT ALL. Not silently dropped: the
// count is reported and the reason goes to the title and the console, which is the treatment v3538 and v3578
// worked out for the NULL case, applied to a third case neither round had -- a number that is real and is not
// the thing it is labelled.
//
// *** ONE CEILING, TWO READERS. *** It is defined in installHistory.js, applied to the AVERAGES there, and handed
// to the page in the payload for the HEADLINE. A page that chose its own number could exclude a run from the
// headline while the average still counted it, and a readout that disagrees with itself is worse than one that
// is merely wrong.
//
// AND THE EMPTY CASE FILLED SPACE. el.textContent = "" blanked the span and left the div around it holding its
// padding, so "nothing to report" rendered as a permanent gap. The container is hidden now.
//
// DRIVEN IN CHROMIUM, THREE FIXTURES:
//     4180.6s -> line display:none, height 0, reason in the title
//     45s     -> "ready in 45.0s (new build) - avg new 45.0s", shown
//     no runs -> display:none, height 0
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require_ = createRequire(import.meta.url);
const ih = require_(path.join(ENG, "ai-bridge", "installHistory.js"));
const ihSrc = fs.readFileSync(path.join(ENG, "ai-bridge", "installHistory.js"), "utf8");
const server = fs.readFileSync(path.join(ENG, "server.html"), "utf8");

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("installTiming-selfcheck -- a build that sat is not a slow install\n");

console.log("1. THE CEILING EXISTS AND DISCRIMINATES");
{
    ok("a plausibility ceiling is exported", typeof ih.PLAUSIBLE_MAX_MS === "number" && ih.PLAUSIBLE_MAX_MS > 0,
       (ih.PLAUSIBLE_MAX_MS / 60000) + " minutes");
    ok("*** Keith's 4180.6s is refused ***", ih.isPlausibleInstall(4180600) === false, "70 minutes is not an install");
    ok("...and a real install is accepted", ih.isPlausibleInstall(45000) === true && ih.isPlausibleInstall(120000) === true,
       "45s and 2min both pass -- A CEILING THAT REFUSED EVERYTHING WOULD HIDE THE READOUT AND LOOK FIXED");
    ok("...and a missing measurement stays distinct from an implausible one",
       ih.isPlausibleInstall(null) === false && ih.isPlausibleInstall(undefined) === false,
       "null was already its own case at v3538; this adds a third rather than merging them");
    ok("!! the ceiling clears the tree's own slowest single gate with room",
       ih.PLAUSIBLE_MAX_MS > 573000, "khMichalke is 573s; an unzip plus a boot must fit under this, or real installs vanish");
}

console.log("\n2. ONE CEILING, TWO READERS -- THE HEADLINE AND THE AVERAGES CANNOT DISAGREE");
{
    ok("the averages filter on it at the source", /const ready = \(f\) => runs\.filter\(f\)[\s\S]{0,80}filter\(isPlausibleInstall\)/.test(ihSrc));
    ok("*** and the page is HANDED the number rather than choosing its own ***",
       /plausibleMaxMs: PLAUSIBLE_MAX_MS/.test(ihSrc) && /j\.plausibleMaxMs/.test(server),
       "a page with its own constant could exclude a run from the headline while the average still counted it");
    ok("...and what was set aside is counted, not hidden", /setAside/.test(ihSrc) && /setAside/.test(server),
       "NEVER RUN IS DISTINCT FROM PASS, and a discarded measurement is distinct from one that never existed");
}

console.log("\n3. AN EMPTY LINE TAKES NO SPACE");
{
    ok("*** the CONTAINER is hidden, not merely the span emptied ***",
       /lineEl\.style\.display = "none"/.test(server),
       "el.textContent = \"\" left the div holding its padding -- a permanent gap that read as a bug");
    ok("...and it is shown again when there IS something to say",
       /if \(bits\.length\) \{ show\(\);/.test(server), "hiding that never un-hid would be a worse bug than the gap");
}

console.log("\n4. DRIVEN, NOT INFERRED");
report("4180.6s", "line display:none, height 0, and the title carries the reason plus the set-aside count");
report("45s", "\"ready in 45.0s (new build) - avg new 45.0s\", display block, height 14");
report("no runs at all", "display:none, height 0");
report("WHY THE MIDDLE CASE IS THE ONE THAT MATTERS", "a ceiling that hid the line always would look exactly " +
       "like a fix from the outside, and would have thrown away the measurement this readout exists for.");

console.log(fails ? `\ninstallTiming-selfcheck: ${fails} FAILED` : "\ninstallTiming-selfcheck: all checks pass");
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(fails ? 1 : 0);
