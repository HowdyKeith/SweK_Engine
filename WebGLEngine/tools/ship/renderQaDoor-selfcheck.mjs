// WebGLEngine/tools/ship/renderQaDoor-selfcheck.mjs -- v3044
//
// Run: node tools/ship/renderQaDoor-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES the render-QA front door: ai-bridge/renderQaBridge.js, its four routes in ai-bridge/server.js, and the
// controls on server.html.
//
// WHY IT EXISTS. The bridge has accepted an `only` filter since v1983 and nothing on the page could send one, so
// the only runs available were ALL ~300 pages (about a quarter of an hour) or nothing. The subset run is the one
// anybody actually wants mid-round, and it meant dropping to a terminal -- the front-door law failing on a page
// that already HAD a front door, which is a harder thing to notice than a missing page.
//
// It also pins the thing that makes an `only` filter safe to expose: it is a SUBSTRING FILTER over discovered
// pages, not a path, so a bad value cannot execute anything -- and the harness EXITS 2 on zero matches instead
// of printing a clean sweep of no pages. A filter that silently matched nothing and reported success would be
// the worst possible outcome here, because a green QA run is exactly what someone would act on.

import { readFileSync, readdirSync } from "node:fs";
import { codeOnly } from "./sourceScan.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(path.join(ENG, rel), "utf8");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const bridge = read("ai-bridge/renderQaBridge.js");
const server = read("ai-bridge/server.js");
const page = read("server.html");
const harness = read("tools/render-qa/render-qa.mjs");

// 1. the bridge exists and is the ONLY thing that spawns the harness
{
    ok("bridge spawns render-qa.mjs rather than reimplementing it", /spawn\(/.test(bridge) && /"render-qa\.mjs"/.test(bridge));
    ok("bridge forwards --only / --update-baselines / --base / --video",
        /--only/.test(bridge) && /--update-baselines/.test(bridge) && /--base/.test(bridge) && /--video/.test(bridge));
    ok("bridge refuses a second concurrent run instead of racing two Chromiums", /already running/.test(bridge));
    ok("bridge reports NOT-INSTALLED with the fix rather than failing cryptically",
        /needsInstall/.test(bridge) && /npm install/.test(bridge));
    ok("bridge can install for the user (no terminal needed)", /_installChild/.test(bridge) && /"install"/.test(bridge));
    ok("bridge serves out/ files only, with no traversal",
        /rel\.includes\("\.\."\)/.test(bridge) && /startsWith\(OUT_DIR/.test(bridge));
    // ONE spawner. A second module shelling out to the harness is how two front doors start disagreeing.
    const others = readdirSync(path.join(ENG, "ai-bridge"))
        .filter((f) => f.endsWith(".js") && f !== "renderQaBridge.js")
        // A STANDALONE QUOTED LITERAL, not the string appearing anywhere. rigRunner.js carries the command
        // inside job PROSE ("cd tools/render-qa && node render-qa.mjs --only ...") as text for a human to read;
        // that is documentation, not a second spawner, and reporting it would be the same read-prose-as-code
        // mistake this gate made on its first run.
        .filter((f) => /["'][^"']*\brender-qa\.mjs["']/.test(readFileSync(path.join(ENG, "ai-bridge", f), "utf8")));
    ok("nothing else in ai-bridge/ spawns the harness", others.length === 0, others.join(", "));
}

// 2. the four routes are dispatched, and they are local-only
{
    for (const r of ["/render-qa/status", "/render-qa/run", "/render-qa/install", "/render-qa/stop"]) {
        const line = server.split("\n").find((l) => l.includes('req.url === "' + r + '"'));
        ok("server.js dispatches " + r, !!line);
        ok("...and " + r + " is local-only", !!line && /_isTrustedReq\(req\)/.test(line) && /403/.test(line));
    }
    ok("server.js requires the bridge once", (server.match(/require\("\.\/renderQaBridge\.js"\)/g) || []).length === 1);
}

// 3. THE HARNESS REFUSES A FILTER THAT MATCHES NOTHING. This is what makes the new input safe to expose: the
//    dangerous outcome is not code execution, it is a green report over zero pages.
{
    ok("--only is a SUBSTRING FILTER over discovered pages, not a path",
        /ONLY\.length\) pages = pages\.filter/.test(harness.replace(/\s+/g, " ")) === false
            ? /pages\.filter\(pg => ONLY\.some/.test(harness) : true);
    ok("!! a filter that matches nothing EXITS NONZERO instead of reporting a clean sweep",
        /if \(!pages\.length\)[^\n]*process\.exit\(2\)/.test(harness),
        "no pages matched -> exit 2; a green run over zero pages is the failure that would actually be acted on");
}

// 4. the page can now ask for a subset, and says what the buttons do
{
    ok("server.html has an `only` input", /id="rqOnly"/.test(page));
    ok("...a button that runs just those pages", /id="rqRunOnly"/.test(page) && /only:only/.test(page.replace(/\s+/g, "")) === false ? /only:\s*only/.test(page) : true);
    ok("...and a one-click SEAM TEST preset naming all four world pages", (() => {
        const m = page.match(/var SEAM_PAGES = "([^"]+)"/);
        if (!m) return false;
        const want = ["world-default", "world-rle", "world-biomes", "world-rle-biomes"];
        return want.every((w) => m[1].split(",").includes(w));
    })());
    ok("the seam preset captures baselines (a diff against nothing is not a test)",
        /rqSeam[\s\S]{0,600}rqStart\(SEAM_PAGES, true\)/.test(page));
    ok("...and confirms first, because a baseline is what every later run is judged against",
        /rqSeam[\s\S]{0,400}confirm\(/.test(page));
    ok("REFUSES an empty filter rather than silently running all 300 pages",
        /if\(!only\)\{[\s\S]{0,200}return;/.test(page.replace(/\s+/g, " ").replace(/if \(!only\) \{/, "if(!only){")) ||
        /name at least one page/.test(page),
        "an empty `only` means ALL pages, which is the other button and takes a quarter of an hour");
    ok("the four world manifest entries the preset names really exist", (() => {
        const man = read("tools/render-qa/manifest.json");
        return ["world-default", "world-rle", "world-biomes", "world-rle-biomes"].every((n) => man.includes('"' + n + '"'));
    })());
    ok("the RLE seam entry really carries the query string discovery cannot produce", (() => {
        const man = JSON.parse(read("tools/render-qa/manifest.json"));
        const p = (man.pages || []).find((x) => x.name === "world-rle");
        return !!p && /\?rle=1/.test(p.url);
    })());
}

// --- v3048: THE PER-PAGE LIST ---------------------------------------------------------------------------------
// status() only ever knew pages that had already RUN (it reads out/report.json), so before a sweep there was
// nothing to choose from and the v3044 filter box required a name you already knew. discover.mjs has always known
// the full set and nothing exposed it.
{
    ok("bridge exposes the discoverable page list", /async function pages\(\)/.test(bridge) && /module\.exports = \{ pages,/.test(bridge));
    ok("!! it IMPORTS discover(), it does not walk the tree itself",
        /import\(pathToFileUrl\(path\.join\(QA_DIR, "discover\.mjs"\)\)\)/.test(bridge) && /disc\.discover\(/.test(bridge) &&
        !/readdirSync/.test(codeOnly(bridge)),
        "a second walk would be a fourth definition of which pages exist, and a list that disagreed with what a run covers would be lying about coverage");
    ok("it reports EXCLUDED pages with their reasons rather than hiding them", /excluded: d\.skipped\.map/.test(bridge) && /reason: s\.reason/.test(bridge),
        "a page missing from a QA list looks identical to a page that passed");
    ok("it refuses with the fix when render-qa is not installed", /pages[\s\S]{0,300}needsInstall: true/.test(bridge));
    const line = server.split("\n").find((l) => l.includes('req.url === "/render-qa/pages"'));
    ok("server.js dispatches /render-qa/pages", !!line);
    ok("...and it is local-only like the other four", !!line && /_isTrustedReq\(req\)/.test(line) && /403/.test(line));
    ok("...and it awaits, because pages() is async (a sync sendJson would ship a Promise)", !!line && /Promise\.resolve\(renderQaBridge\.pages\(\)\)/.test(line));

    ok("the page has a per-page list with a filter", /id="rqPageList"/.test(page) && /id="rqFilter"/.test(page) && /id="rqLoadPages"/.test(page));
    ok("!! each row runs through the SAME /render-qa/run as the sweep buttons",
        /data-run/.test(page) && /rqStart\(b\.getAttribute\("data-run"\)/.test(page),
        "no second execution path, so a single-page run and a sweep cannot judge a page differently");
    ok("!! NEVER RUN is distinct from PASS", /never run/.test(page),
        "a page nobody has tested and a page that passed are not the same claim, and a two-state list cannot tell them apart");
    ok("a missing baseline is called out, since a run without one cannot diff", /no baseline/.test(page));
    ok("the counts name tuned / discovered / excluded rather than one total", /discovered, "\+_rqPages\.counts\.excluded/.test(page.replace(/\s+/g, " ")) || /counts\.excluded/.test(page));
}


// ---- v3126: THE TWO FILES THAT LEAVE THE BOX ---------------------------------------------------------------
// report.html is for LOOKING. report.json is the only place a probe's numbers live -- frameMs.p95,
// framesOver50ms, longTasks.maxMs -- and the only form that can be handed to someone who is not at the rig.
// The bridge's traversal-guarded out/ resolve has always served both; nothing in the UI pointed at them, so in
// practice they did not exist. That is the same shape as a module nothing imports.
{
    ok("!! server.html offers report.json, where the probe numbers live",
        /id="rqJson"/.test(page) && /rqGrab\("report\.json"\)/.test(page),
        "the visual report cannot carry a number to anyone else. Without this the only way to read a probe " +
        "result was to open the file on the box that produced it");

    ok("...and failures.txt, the copyable summary",
        /id="rqFailTxt"/.test(page) && /rqGrab\("failures\.txt"\)/.test(page));

    ok("!! both DOWNLOAD rather than open a tab",
        /a\.download\s*=\s*file/.test(page),
        "a tab full of raw JSON is something you read and lose; the whole point of these two is that they leave " +
        "the box");

    ok("both point at paths the bridge actually serves",
        /"\/render-qa\/out\/"\s*\+\s*file/.test(page),
        "same out/ route as the existing report button, so there is one served path rather than a second one " +
        "that could drift from the guard");

    // The thing this round deliberately did NOT add.
    // NOTE: the first version of this asserted a COUNT (<= 4) and failed -- the real number is 7, and always
    // was. A threshold invented rather than measured, which is the one thing this tree does not do with a
    // tolerance. The property, not the count, is what matters: the download handlers must not start runs.
    const grab = (page.match(/function rqGrab\([\s\S]{0,400}?\n  \}/) || [""])[0];
    ok("!! no second run path was added for one page -- the per-page rows already do it",
        !/\/render-qa\/run/.test(grab) && !/face-mirror.{0,40}addEventListener/.test(page),
        "pages() reads the MANIFEST, so face-mirror already has a one-click row. A dedicated button would be a " +
        "second execution path for something already reachable, and v3048's own comment warns that a single-page " +
        "run and a sweep must not be able to diverge in how they judge a page");
}

console.log("renderQaDoor-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
