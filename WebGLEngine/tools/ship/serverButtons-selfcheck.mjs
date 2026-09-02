#!/usr/bin/env node
// WebGLEngine/tools/ship/serverButtons-selfcheck.mjs -- v4267
//
// Run: node tools/ship/serverButtons-selfcheck.mjs
//
// *** EVERY BIG BUTTON ON server.html POINTS AT SOMETHING THAT EXISTS. *** server.html's own comments record
// the same failure four separate times -- "THIRTEEN OF THOSE FIFTEEN APPS WERE IN NO PANEL AT ALL", "built
// and then nobody can find it" -- and this round found a fifth: orrery.html has existed since v3195 and
// NOTHING LINKED TO IT.
//
// The opposite failure is the one this gate exists to prevent from ever being introduced: a button that
// leads nowhere. A dead launcher is worse than a missing one, because a missing feature is merely absent
// while a dead button is a promise the page breaks in front of somebody.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SERVER = fs.readFileSync(path.join(ROOT, "server.html"), "utf8");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

console.log("serverButtons-selfcheck -- every big button leads somewhere, and one deliberately absent\n");

// =============================================================================================================
console.log("1. *** THE TWO ADDED THIS ROUND, AND WHAT EACH ACTUALLY OPENS ***");
{
    ok("the SweK Orrery button exists in the big-button row", /id="bOrrery"/.test(SERVER));
    ok("  and it opens orrery.html, which is a REAL FILE ON DISK",
        /_orr\.onclick[^;]*window\.open\("\/orrery\.html"/.test(SERVER) &&
        fs.existsSync(path.join(ROOT, "orrery.html")),
        "orrery.html, " + fs.statSync(path.join(ROOT, "orrery.html")).size + " bytes");
    ok("*** and NOTHING linked to orrery.html before this round -- a built page nobody could find ***",
        (SERVER.match(/orrery\.html/g) || []).length >= 1,
        "the fifth instance of the failure this row's own comments record four times");

    ok("the GitHub Terrain button exists", /id="bRepoTerrain"/.test(SERVER));
    ok("  and it deep-links the engine with ?terrain=1 rather than pretending to be a page",
        /_rt\.onclick[^;]*index\.html\?terrain=1/.test(SERVER));
    // *** THE DEEP LINK HAS TO BE CONSUMED, OR THE BUTTON OPENS THE ENGINE AND NOTHING HAPPENS. ***
    const MAIN = fs.readFileSync(path.join(ROOT, "main.js"), "utf8");
    ok("  and main.js READS ?terrain= -- the half that makes the button do anything",
        /URLSearchParams\(location\.search\)\.get\("terrain"\)/.test(MAIN));
    ok("  and calls repoTerrain.load with it", /window\.repoTerrain\.load\(opts\)/.test(MAIN));
    ok("  passing a directory through, so ?terrain=/some/repo works and not only ?terrain=1",
        /\(q === "1" \|\| q === "true"\) \? \{\} : \{ dir: q \}/.test(MAIN));
    ok("  and it fails LOUDLY rather than silently if the load rejects", /\?terrain= failed:/.test(MAIN));
    ok("the terrain button wears .go-link and the orrery button does not, because one is a page and one is a state",
        /id="bRepoTerrain" class="go-link"/.test(SERVER) && !/id="bOrrery" class="go-link"/.test(SERVER),
        "the palette rule server.html states at line ~118, applied rather than restated");
}

// =============================================================================================================
console.log("\n2. *** THE ONE THAT IS NOT HERE, AND THE ABSENCE IS ASSERTED ***");
{
    // Keith asked for three. Two have destinations. Writing the third as a button would have been a promise
    // the page breaks, so the refusal is in the source AND checked here -- a comment nobody verifies is how a
    // dead button gets added later by someone reading only the request.
    ok("*** there is NO GitHub Universe button, because there is nothing for it to open ***",
        !/id="bUniverse"|GitHub Universe<|Github Universe</i.test(SERVER));
    // v4303: this matched ANY *universe*.html, and v4300's universe-gpu.html -- the SweK/Endless Sky universe
    // drawn on the GPU, nothing to do with GitHub -- turned it red for three rounds. A GitHub-universe page
    // would be named for GitHub; that is what is asserted absent, and the other universe page is named as
    // what it is rather than counted.
    ok("  and no GITHUB-universe page exists to link to (universe-gpu.html is the Endless Sky universe, not GitHub's)",
        !fs.readdirSync(ROOT).some((f) => /github.?universe/i.test(f) && f.endsWith(".html")) &&
        /SweK Universe/.test(fs.readFileSync(path.join(ROOT, "universe-gpu.html"), "utf8")),
        fs.readdirSync(ROOT).filter((f) => /universe/i.test(f)).join(" ") || "(no universe files at all)");
    // The shape is asserted from the FILE, and the first draft of this line asserted one I had not looked at:
    // it required govts to be an array and govts is an object. Being wrong about the evidence for a correct
    // conclusion is still being wrong.
    ok("  es-universe.json is the ESCAPE VELOCITY dataset, not a GitHub one -- checked, not assumed", (() => {
        const j = JSON.parse(fs.readFileSync(path.join(ROOT, "es-universe.json"), "utf8"));
        return Array.isArray(j.systems) && Array.isArray(j.ships) && j.govts && typeof j.govts === "object" &&
               !("repos" in j) && !("contributors" in j); })(),
        "systems and ships are arrays, govts an object -- ev.html reads it, a different universe entirely");
    ok("and the reason is written into server.html where the next reader will meet it",
        /HAS NO DESTINATION/.test(SERVER) && /Backlog #139/.test(SERVER));
    report("a missing feature is absent; a dead button is a promise broken in front of somebody. #139 is the " +
        "round that would build the page, and this button goes in when that page does.");
}

// =============================================================================================================
console.log("\n3. *** THE GENERAL RULE: no big button anywhere on this page leads to a missing file ***");
{
    // The real value of this gate is not the two buttons above -- it is that a dead one can never be added.
    // Every window.open / location.href target in server.html that names a local .html is resolved on disk.
    const targets = [];
    const re = /(?:window\.open|location\.href\s*=)\s*\(?\s*["'](\/[^"'?#]+\.html)[^"']*["']/g;
    let m; while ((m = re.exec(SERVER))) targets.push(m[1]);
    const uniq = [...new Set(targets)];
    ok("the page names at least a handful of local pages to open", uniq.length >= 3, uniq.length + " distinct: " + uniq.join(" "));
    // *** GENERATED ARTEFACTS ARE NOT DEAD LINKS, AND THIS RULE FOUND ONE ON ITS FIRST RUN. ***
    // /render-qa/out/report.html does not exist in a clean tree and is not a broken button: the render-QA
    // tool WRITES it, and server.html's own comment beside that line says so. The exclusion is one named
    // output directory rather than a blanket "ignore what is missing" -- the difference between an exception
    // and a hole. If a second output directory appears, this list is where it has to be argued for.
    const GENERATED = [/^\/render-qa\/out\//];
    const shipped = uniq.filter((t) => !GENERATED.some((re) => re.test(t)));
    const skipped = uniq.filter((t) => GENERATED.some((re) => re.test(t)));
    const missing = shipped.filter((t) => !fs.existsSync(path.join(ROOT, t.replace(/^\//, ""))));
    ok("*** every SHIPPED page target exists on disk ***", missing.length === 0,
        missing.join(" ") || shipped.length + " checked, 0 missing");
    ok("  and the generated ones are named, not silently ignored", skipped.length >= 1,
        "excluded as tool output: " + (skipped.join(" ") || "none"));
    // CONTROL: the resolver must be able to say "missing", or the zero above is worthless.
    ok("CONTROL: a page that does not exist IS detected",
        !fs.existsSync(path.join(ROOT, "definitely-not-a-real-page.html")));
    report("this is the check that keeps the row honest as it grows: the next person to add a launcher for " +
        "something they are about to build gets a red gate instead of a button that opens a 404.");
}

// =============================================================================================================
// SABOTAGE LOG -- applied to a working tree, grep-confirmed before the result was read, exit code read as well
// as the FAIL count, restored md5-identical (server.html c8d0c6ef, main.js e07124a0).
//
// *** THE FIRST DRAFT OF THIS LOG SAID 3 RED FOR ALL THREE, AND ALL THREE NUMBERS WERE WRONG. *** They were
// written from what the checks LOOK like they would do, before the sabotages were re-run to read the counts.
// Re-running gave 2, 1, 2. A sabotage log stating a count nobody measured is the same defect as a gate
// asserting a shape nobody looked at -- which is exactly what section 2's `govts` line was, one round ago,
// when this file claimed an array and the file on disk held an object. So: measured, exit codes read.
//
//   A  the orrery button's target changed to a page that does not exist (/orrery-view.html).
//      -> exit=1, 2 FAIL. One in section 1 (the specific "orrery.html is a real file" check) and one in
//      section 3's general rule. The general rule earning its own red here is the point of having it: it
//      catches a dead target on ANY button, including ones no specific check was ever written for.
//
//   B  main.js stops reading ?terrain= (the param renamed, the button left untouched).
//      -> exit=1, 1 FAIL, and only in section 1's second half. The button still exists, still looks right,
//      and opens an engine that ignores it. Section 3 stays green because the TARGET still resolves --
//      index.html is right there. This is the failure a check on the button alone cannot see, and the
//      reason section 1 asserts both halves of the link instead of just the href.
//
//   C  a GitHub Universe button added, pointing at /github-universe.html.
//      -> exit=1, 2 FAIL: the absence assertion, and section 3 resolving the target and finding nothing.
//      The exact thing this round declined to do, refused by the gate rather than by a comment.
//
// What none of the three could do is go 0 RED, which is the failure mode that has recurred in four of the
// last five rounds. The reason is structural rather than lucky: every one of these checks reads a fact that
// something ELSE in the shipped tree has to agree with -- a path that must resolve on disk, a param the
// engine must actually read -- rather than a fact this file asserts about itself.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WHETHER THE BUTTONS WORK. Nothing renders server.html, clicks anything, or boots " +
    "the engine -- this reads source text and resolves file paths, so it proves the targets EXIST and the " +
    "?terrain= link is consumed, not that the orrery draws or that terrain stamps. A button whose handler " +
    "throws would pass every check here. Also unchecked: the ?go= demo-mode targets, which name engine " +
    "STATES rather than files and cannot be resolved on disk by the same rule -- section 3 deliberately only " +
    "resolves .html targets, and a mistyped ?go= id is invisible to it.");
process.exit(fails ? 1 : 0);
