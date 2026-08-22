// tools/ship/labExportDoor-selfcheck.mjs
//
// Run: node tools/ship/labExportDoor-selfcheck.mjs   (instant)
//
// v3184 -- THE FRONT DOOR FOR labExport, because a module with no caller is unfinished.
//
// v3182 measured that only 24% of the numeric claims in lab gates reproduce by running the device they name --
// the rest are CONFIG-SPECIFIC and the config was never written down. v3183 fixed the format so a record
// carries { device, mode, config, outputs } and PROVED it re-runs from itself. AND SHIPPED IT WITH NO CALLER,
// which this project's own law calls unfinished, and which the changelog entry admitted was a DEBT.
//
// *** THE CONFIG COLUMN IS THE WHOLE POINT AND THE PAGE SAYS SO. *** A table of numbers is not importable
// anywhere useful, because nothing downstream can say what it is looking at. A table where every row carries
// its configuration re-runs on any machine, in any tool, by anybody.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const page = fs.readFileSync(path.join(ENG, "lab-export.html"), "utf8");
const brg = fs.readFileSync(path.join(ENG, "ai-bridge", "roundhouseBridge.js"), "utf8");
const srv = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
const man = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "render-qa", "manifest.json"), "utf8"));

// ---- 1. THE ROUTE LIVES WITH ITS OWNER, AND REFUSES RATHER THAN GUESSES ----------------------------------------
{
    ok("!! the routes are in the EXISTING owner, not a new prefix",
        /route === "\/export"/.test(brg) && /route === "\/devices"/.test(brg),
        "/roundhouse already owns the lab. A SECOND OWNER FOR ONE AREA is v3154's six-copies mistake wearing a " +
        "URL, and this session watched that cost a round");

    ok("!! *** a config that will not parse is REFUSED BY NAME, not quietly dropped ***",
        /config is not JSON: /.test(brg),
        "running with config:null after the caller asked for one would return numbers FROM A DIFFERENT RUN THAN " +
        "THE ONE REQUESTED, and the record would carry a config nobody used -- THE EXACT FAILURE THIS WHOLE ARC " +
        "EXISTS TO PREVENT");

    ok("!! an unknown device is refused and NAMED",
        /unknown\s+device/.test(brg),
        "silently returning the devices it did recognise would give a shorter export than asked for, and " +
        "nothing in the CSV would say which name went nowhere");

    ok("...and the CSV comes from the server, not rebuilt in the page",
        /window\.location\.href = "\/roundhouse\/export\?"/.test(page) && !/Blob\(/.test(page),
        "the server already emits the exact CSV the v3183 gate checks. Building a second one in the browser " +
        "would be TWO IMPLEMENTATIONS OF ONE FORMAT, and only one of them would be under test");
}

// ---- 2. THE PAGE SHOWS WHAT MATTERS AND HIDES NOTHING -------------------------------------------------------------
{
    ok("!! every row carries its config",
        /class='cfg'/.test(page) && /rec\.config \? JSON\.stringify\(rec\.config\) : "\(defaults\)"/.test(page),
        "and it says '(defaults)' rather than an empty cell, because a BLANK config column reads as 'no " +
        "configuration' when it means 'the device's own'");

    ok("!! *** an ABSENT BRIDGE is named, not shown as an empty device list ***",
        /the\s+engine\s+bridge\s+is\s+not\s+answering/.test(page),
        "a page that silently showed no devices would look like A LAB WITH NO INSTRUMENTS IN IT. v3120's law: " +
        "UNSUPPORTED and FAILED must stay apart, and 'the server is not running' is neither of the page's fault");

    ok("!! a FAILED run is shown, not dropped",
        /tr\.className = "bad"/.test(page) && /FAILED: " \+ rec\.error/.test(page),
        "a missing row looks exactly like a config nobody tried -- the same reason toCSV emits a row for a " +
        "failed run instead of skipping it");

    ok("...and the page explains WHY the config column is there",
        /A\s+number\s+without\s+its\s+configuration\s+is\s+not\s+a\s+result/.test(page),
        "otherwise it reads as an extra column somebody can tidy away, and the export quietly stops being " +
        "re-runnable without anything failing");
}

// ---- 3. BOTH HALVES OF REACHABILITY, AND THE RIGHT CHECKS ----------------------------------------------------------
{
    const e = man.pages.find((p) => p.name === "lab-export");
    ok("!! linked from server.html AND in the render-qa manifest",
        /lab-export\.html/.test(srv) && !!e,
        "v3123 found pages in the manifest linked from NOTHING; v3135 found the same with the halves swapped");

    ok("!! *** the manifest entry has NO canvas, deliberately ***",
        !!e && !e.canvas && /this\s+page\s+is\s+a\s+TABLE/.test(e.note || ""),
        "asking for a canvas check would FAIL IT FOR NOT BEING A RENDERER -- a page judged against the wrong " +
        "instrument, which is how a working thing gets excluded and then never checked again");

    ok("...and its requirement derives as the BRIDGE, not a GPU",
        await (async () => {
            const P = await import(pathToFileURL(path.join(ENG, "tools", "render-qa", "pageRequirements.mjs")).href);
            const r = P.requirementsOf(path.join(ENG, "lab-export.html"));
            return r.ok && r.needs.includes("bridge") && !r.needs.includes("webgl2");
        })(),
        "v3170's scanner read it correctly with no hand-written declaration: this page needs a SERVER, and a " +
        "headless box without one knows not to judge it");
}

console.log();
console.log("  ----  WHAT THIS BOX CANNOT DO: press the buttons. The routes and the page are asserted against");
console.log("  ----  source. ON THE RIG: open Lab export from server.html, pick a device, press Run, then paste");
console.log("  ----  a config cell back into the box -- THE SAME NUMBERS MUST COME OUT. That is the whole");
console.log("  ----  guarantee, and it is the one thing a screenshot cannot show.");
if (fails) { console.log("labExportDoor-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("labExportDoor-selfcheck: all checks pass");
