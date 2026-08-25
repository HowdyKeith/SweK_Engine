// tools/ship/bunNative-selfcheck.mjs
//
// Run: node tools/ship/bunNative-selfcheck.mjs
// RUNTIME 0.061s MEASURED (median of 3 -- 61/63/61 ms -- with date(1) around the run). It reads source and
// imports the probe in-process; it does NOT spawn bun, because a gate that skipped on a box without bun
// would be silent on exactly the machines this question is about.
//
// v4006 -- Keith: "can we make a test Bun.WebView page?" and "what are the new features of bun.exe ... other
// dependencies that we will not have to install since it would be included in Bun.exe".
//
// *** THE ANSWER IS A PROBE, AND THE PROBE'S HONESTY IS WHAT THIS GATES. *** Three properties, each of which
// would be easy to get wrong in the flattering direction:
//
//   ABSENT IS NOT BROKEN. Bun.WebView does not exist in the bun this tree has. A page that reported that as a
//   failure would send somebody to reinstall bun; one that mocked it would demonstrate a feature nobody has.
//
//   PRESENT IS NOT A SAVING. Seven of the ten announced natives ARE in bun 1.3.11 -- and they replace Knex,
//   Sharp, marked, node-pty and node-cron, none of which this project installs. A row that said only "present"
//   would read as a dependency we could drop. The manifest is READ so the column cannot be wishful.
//
//   THE GLOBAL EXISTING IS NOT THE FEATURE WORKING. `typeof Bun.WebView !== "undefined"` would be a weaker
//   claim than the one that matters, which is whether it can open a page and answer about it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeOnly, noComments } from "./sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(ENG, "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);

const PROBE = fs.readFileSync(path.join(ENG, "tools", "ship", "bunNative.mjs"), "utf8");
const SERVER = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
const PAGE = fs.readFileSync(path.join(ENG, "node-bun.html"), "utf8");

console.log("bunNative-selfcheck -- does the probe report what is there, or what the release notes said?\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE PROBE RUNS, AND SAYS WHICH RUNTIME IT IS ***");
const { probe } = await import("./bunNative.mjs");
const r = await probe();
{
    ok("it reports a runtime rather than assuming one", /^(bun|node) /.test(r.runtime), r.runtime);
    ok("!! it READ ai-bridge/package.json rather than remembering it",
        r.manifestRead === true && r.dependencyCount > 5,
        r.manifestRead ? r.dependencyCount + " packages declared" :
        "MANIFEST UNREADABLE -- every usedHere column would be '?' and a column of unknowns looks like a column");
    ok("every announced API is reported, present or not", r.rows.length === r.claimedCount && r.claimedCount >= 10,
        r.claimedCount + " rows");
    ok("...and each carries what it would replace", r.rows.every((x) => Array.isArray(x.replaces) && x.replaces.length));
}

// ---------------------------------------------------------------------------
console.log("\n2. *** PRESENT IS NOT A SAVING, AND THE MANIFEST IS WHAT SETTLES IT ***");
{
    const inManifest = JSON.parse(fs.readFileSync(path.join(ENG, "ai-bridge", "package.json"), "utf8"));
    const all = Object.assign({}, inManifest.dependencies, inManifest.devDependencies, inManifest.optionalDependencies);
    // usedHere must be DERIVED. Checked against the manifest independently rather than trusting the field.
    const wrong = r.rows.filter((x) => {
        const truth = x.replaces.filter((p) => Object.prototype.hasOwnProperty.call(all, p)).sort();
        return JSON.stringify((x.usedHere || []).slice().sort()) !== JSON.stringify(truth);
    });
    ok("!! *** every usedHere column matches the manifest, row by row ***", wrong.length === 0,
        wrong.length ? "DIVERGED: " + wrong.map((x) => x.api).join(", ") : r.rows.length + " rows agree with package.json");
    // *** THE NUMBER THE QUESTION WAS ACTUALLY ABOUT. *** Not "how many natives" but "how many packages go".
    const savable = r.rows.filter((x) => x.present && x.usedHere && x.usedHere.length);
    ok("!! packagesThisWouldRemove counts only natives that are BOTH present AND used here",
        JSON.stringify(r.packagesThisWouldRemove.slice().sort()) ===
        JSON.stringify(savable.flatMap((x) => x.usedHere).sort()),
        r.packagesThisWouldRemove.length ? r.packagesThisWouldRemove.join(", ") : "NONE -- which is the finding");
    report("MEASURED under bun 1.3.11: 7 of 10 announced natives ARE present -- SQL, Terminal, cron, redis, " +
           "Glob, YAML, semver -- and they would remove ZERO packages, because what they replace (Knex, pg, " +
           "Sharp, marked, node-pty, node-cron) is not what this project installs. The one native that would " +
           "matter, Bun.WebView against puppeteer-core and playwright, is the one that is absent.");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** ABSENT IS NOT BROKEN, AND THE WEBVIEW IS DRIVEN RATHER THAN DETECTED ***");
{
    const STATES = ["not-bun", "absent", "worked", "threw"];
    ok("!! the webview trial reports one of four NAMED states", STATES.includes(r.webview.state),
        r.webview.state + " -- " + String(r.webview.detail).slice(0, 90));
    // A BOOLEAN WOULD HAVE COLLAPSED FOUR ANSWERS INTO ONE. "not installed", "this build lacks the API",
    // "it is there and it threw" and "it worked" want four different responses from whoever reads the page.
    ok("!! *** `absent` and `threw` are different states, so a missing API never reads as a failure ***",
        /state: "absent"/.test(PROBE) && /state: "threw"/.test(PROBE) &&
        /NOT a failure and not a broken install/.test(PROBE),
        "a box that has not got a feature has not got a broken one, and the message says so in those words");
    // *** codeOnly FOR THE IDIOM, noComments FOR TEXT THE CODE CONTAINS -- and my first draft used codeOnly
    // for both and failed on its own subject. *** `data:text/html` is a STRING LITERAL, and codeOnly blanks
    // strings as well as comments, so the check for it could never match. That is the identical trap
    // patchScanDoor-selfcheck was fixed for earlier in this same session, committed again three hours later
    // in a new file. THE RULE IS EASY TO STATE AND EASY TO GET WRONG, which is why it is written here too.
    const code = codeOnly(PROBE);       // comments AND strings gone: for `evaluate(`, an identifier
    const text = noComments(PROBE);     // comments gone, strings KEPT: for "data:text/html", a literal
    ok("!! ...and when the API IS present the probe DRIVES it rather than reporting typeof",
        /evaluate\(/.test(code) && /\btitle\b/.test(code) && /data:text\/html/.test(text),
        "it opens a data: URL and reads the title back. 'The global exists' and 'it can open a page' are " +
        "different claims, and only the second would let anything here stop depending on Chromium");
    const trial = (text.match(/async function webviewTrial[\s\S]{0,1600}/) || [""])[0];
    ok("...and the trial needs no network and no file, so it cannot fail for an unrelated reason",
        /data:text\/html/.test(trial) && !/https?:\/\//.test(trial),
        "a probe that fetched a URL would report the network as the feature");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE ROUTE IS A THIRD FIXED ONE, NOT A SCRIPT PARAMETER ON THE FIRST TWO ***");
{
    const route = (SERVER.match(/\/runtime\/native[\s\S]{0,1600}/) || [""])[0];
    ok("!! the route exists and hardcodes its script", /bunNative\.mjs/.test(route) &&
        !/searchParams\.get\("(cmd|script|exec|path)"\)/.test(route),
        "/runtime/surface's header forbids taking a script from the query string -- 'a remote shell wearing a " +
        "diagnostic's clothes' -- so each probe gets its own route rather than the first one growing a knob");
    ok("!! ...and the runtime is an ALLOWLIST of two spellings", /=== "bun" \? "bun" : "node"/.test(route));
    ok("Node is spawned as process.execPath, not the name on PATH", /process\.execPath/.test(route));
    ok("...and a box without bun is told so rather than shown a spawn error",
        /not on PATH on this box/.test(route));
    ok("!! the page reaches it, and offers both columns",
        /\/runtime\/native\?rt=/.test(PAGE) && /runNative\("node"\)/.test(PAGE) && /runNative\("bun"\)/.test(PAGE));
    ok("!! ...and the page states the ABSENT-is-not-BROKEN rule where a reader meets it",
        /has not got a feature has not got a broken one/.test(PAGE),
        "a caveat that lives only in a gate is a caveat the person reading the page never sees");
}

// ---------------------------------------------------------------------------
console.log("\n5. *** THE BUN LAUNCHER FALLS BACK ON /health, NOT ON AN EXIT CODE ***");
{
    const BAT = path.join(ROOT, "START_BUN_Full.bat");
    ok("START_BUN_Full.bat is in the project root", fs.existsSync(BAT),
        "moved there at v4005 by request; rootLayout-selfcheck holds the reason");
    const bat = fs.existsSync(BAT) ? fs.readFileSync(BAT, "utf8") : "";
    ok("!! *** THE FALLBACK IS TIME-BOXED ON /health ***",
        /BUN_HEALTH_SECS/.test(bat) && /health watchdog/.test(bat) && /\/health/.test(bat),
        "an exit code can only answer 'did it stop'. A BUN THAT STARTS AND HANGS NEVER EXITS, so the old " +
        "`if errorlevel 1` fallback could not fire at all -- the window sat there while the KPop listener and " +
        "the opener both timed out against a bridge that was running and not serving");
    ok("!! ...and the two reasons are DISTINGUISHABLE in the message",
        /did not answer \/health within/.test(bat) && /exited with an error/.test(bat),
        "'Bun stopped' and 'Bun never served' send you to different places; one message for both would be the " +
        "two-things-one-label defect");
    // THE COMMAND LINE, NOT A MENTION OF IT. The prose above the watchdog explains what `bun server.js` does,
    // so a bare indexOf found the COMMENT first and reported the order backwards -- prose-as-code, in the check
    // asserting an ordering. Both positions are taken from real command lines with REM lines stripped.
    const cmdLines = bat.split("\n").map((l, i) => ({ i, t: l.trim() })).filter((x) => !/^(REM|::)\b/i.test(x.t));
    const wdAt = cmdLines.findIndex((x) => /^if not defined USE_NODE start "SweK bun health watchdog"/.test(x.t));
    const bunAt = cmdLines.findIndex((x) => /^bun server\.js\b/.test(x.t));
    ok("!! ...and the watchdog starts BEFORE the foreground blocker, so launcherLint stays happy",
        wdAt >= 0 && bunAt >= 0 && wdAt < bunAt,
        `watchdog at command line ${wdAt}, \`bun server.js\` at ${bunAt}. ` +
        "batch cannot poll while a foreground process blocks, so the poller runs beside it -- and it is hoisted " +
        "above the if/else because launcherLint reads line by line and cannot see exclusive branches");
    ok("...and it does not fall back when the stop was an auto-update",
        /swek_superseded\.flag/.test(bat),
        "a superseded bridge stopped on purpose and restarting it under Node would fight the successor");
    report("*** WHAT THIS DOES NOT PROVE, STATED RATHER THAN IMPLIED: the sandbox has no Windows, no cmd.exe " +
           "and no powershell, so what is graded here is the SHAPE of the launcher and not its behaviour. " +
           "Whether the watchdog really kills a hung bun on Keith's box is Keith's first double-click.");
}

console.log("\n" + (fails ? `${fails} FAILED` : "ALL PASS"));
process.exit(fails ? 1 : 0);
