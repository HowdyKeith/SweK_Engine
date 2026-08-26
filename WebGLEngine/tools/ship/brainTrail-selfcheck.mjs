// tools/ship/brainTrail-selfcheck.mjs
//
// Run: node tools/ship/brainTrail-selfcheck.mjs   (live half skips cleanly without Chromium)
// RUNTIME 1.94s MEASURED (median of 3 -- 1942/1913/1965 ms, with date(1) around the run). Sections 1-4 drive buildTrail() with fixtures --
// that is the point of it being pure -- and section 5 renders the real module in headless Chromium against a
// stub bridge, because "it draws" is a claim about what happens in a browser.
//
// v4027 -- Keith: "what visual diagram could we give our physics ai as it is thinking? can it pull related page
// view / panels and indicate processes?"
//
// *** THE ANSWER HAD TO START BY REFUSING THE OBVIOUS DIAGRAM. *** A "reasoning trail" implies steps of thought,
// and this brain has none: gpuBrainBridge's activity ring records exactly THREE kinds -- hello, narrate, solve.
// Drawing an inner life richer than that would be an invention on a panel an operator believes at a glance,
// which is this tree's oldest rule (v2579: a flag that lies is worse than no flag).
//
// WHAT IT HAS INSTEAD IS A FULLY-INSTRUMENTED PIPELINE, and every number was already being published and drawn
// nowhere. So the gate's load-bearing property is not "a diagram appears". It is:
//
//     EVERY NODE'S STATUS AND EVERY EDGE'S LABEL COMES FROM A COUNTER THE BRIDGE ACTUALLY SERVES.
//
// and the negative that keeps it honest: an UNREACHABLE bridge must be its own state, never a diagram of zeros.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { buildTrail, layout, STAGE_PAGES, STALE_MS } from "../../ui/brainTrail.js";
import { noComments } from "./sourceScan.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);

const SRC = fs.readFileSync(path.join(ENG, "ui", "brainTrail.js"), "utf8");

// A health payload shaped exactly like /ai/brain/health's, so a fixture cannot drift into a shape the bridge
// never sends. Field names lifted from the route, not invented here.
const HEALTH = (o = {}) => ({
    ok: true, state: "live", detail: "solving in real time",
    lastFeedMsAgo: 500, lastSolveMsAgo: 800,
    snapPosts: 120, snapGets: 118, fieldPosts: 117,
    hasSnapshot: true, hasField: true, registeredBrains: 2,
    experience: 40, expSeq: 40, solverBackend: "gpu", solverTruncated: false, ...o,
});
const FLEET = (brains) => ({ ok: true, count: brains.length, brains, scheduler: { active: true, assignments: {} } });

console.log("brainTrail-selfcheck -- is every mark on the diagram a number the bridge really serves?\n");

// ---------------------------------------------------------------------------
console.log("1. *** AN UNREACHABLE BRIDGE IS ITS OWN STATE, NOT A DIAGRAM OF ZEROS ***");
{
    // The failure this exists to prevent: both fetches fail, every counter reads 0, and the map renders a
    // complete, confident picture of a pipeline moving nothing. An operator would read that as "the brain is
    // idle" when the truth is "nobody asked it".
    const dead = buildTrail(null, null);
    ok("!! *** NOTHING IS DRAWN WHEN NOTHING ANSWERED ***", dead.reachable === false && dead.nodes.length === 0,
        "reachable " + dead.reachable + ", " + dead.nodes.length + " nodes -- a zeroed diagram would be a " +
        "convincing nothing (v3237), which is the whole species this refuses");
    ok("...and it says so in words a reader can act on",
        /did not answer/.test(dead.note) && /says nothing about/.test(dead.note), dead.note);

    // health alone is enough to draw: a hub with no fleet endpoint is degraded, not dead.
    const partial = buildTrail(HEALTH(), null);
    ok("!! health alone still draws the pipeline", partial.reachable && partial.nodes.length >= 4,
        partial.nodes.length + " nodes from health only");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** EVERY STATUS COMES FROM A MEASURED AGE, AND ALL FOUR BRANCHES ARE REACHABLE ***");
{
    const live = buildTrail(HEALTH(), FLEET([]));
    const stale = buildTrail(HEALTH({ lastFeedMsAgo: STALE_MS + 1, lastSolveMsAgo: STALE_MS + 1 }), FLEET([]));
    const never = buildTrail(HEALTH({ lastFeedMsAgo: null, lastSolveMsAgo: null, hasSnapshot: false, hasField: false }), FLEET([]));

    const statusOf = (t, id) => (t.nodes.find((n) => n.id === id) || {}).status;
    ok("!! LIVE: a fresh feed reads live", statusOf(live, "engine") === "live");
    ok("!! STALE: past " + STALE_MS + "ms it reads stale, not live", statusOf(stale, "engine") === "stale",
        "engine " + statusOf(stale, "engine") + ", outbox " + statusOf(stale, "outbox"));
    ok("!! OFF: never-fed reads off, not zero-but-fine", statusOf(never, "engine") === "off",
        "an age of null and an age of 0 are different facts");
    // IDLE is the brain-only state: attached and not working.
    const idle = buildTrail(HEALTH(), FLEET([{ id: "g", solveMsEwma: 4, workPriority: 0, ageMs: 100, staleSolve: false }]));
    ok("!! IDLE: an attached brain doing nothing is idle, distinct from off",
        statusOf(idle, "brain:g") === "idle",
        "off means nobody is there; idle means somebody is there with nothing to do");
    ok("...and a busy one is live", statusOf(buildTrail(HEALTH(), FLEET([{ id: "g", solveMsEwma: 4, workPriority: 2, ageMs: 10, staleSolve: false }])), "brain:g") === "live");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE EDGE LABELS ARE THE BRIDGE'S OWN COUNTERS ***");
{
    const t = buildTrail(HEALTH({ snapPosts: 4321, fieldPosts: 99 }), FLEET([]));
    const feed = t.edges.find((e) => e.from === "engine" && e.to === "inbox");
    const back = t.edges.find((e) => e.from === "outbox" && e.to === "back");
    ok("!! *** THE FEED EDGE CARRIES snapPosts VERBATIM ***", /4321/.test(feed.label), feed.label);
    ok("!! ...and the return edge carries fieldPosts", /99/.test(back.label), back.label);
    const inbox = t.nodes.find((n) => n.id === "inbox");
    ok("!! ...and the mailbox reports both in and collected, not a single blended number",
        /4321/.test(inbox.detail) && /collected/.test(inbox.detail), inbox.detail);
    // NO BRAINS IS NOT AN ERROR, and is drawn as a fact rather than an empty column.
    ok("!! an empty fleet draws a node SAYING so rather than a gap",
        t.nodes.some((n) => n.id === "nobrain" && n.status === "off"),
        "a hub running with nobody attached is a real, reportable state");
    const two = buildTrail(HEALTH(), FLEET([{ id: "a", solveMsEwma: 3.2, ageMs: 5 }, { id: "b", solveMsEwma: 9.9, ageMs: 5 }]));
    ok("!! ...and two brains get two nodes, each carrying its OWN measured solve speed",
        two.nodes.filter((n) => n.kind === "brain").length === 2 &&
        /3\.2ms/.test(two.nodes.find((n) => n.id === "brain:a").detail) &&
        /9\.9ms/.test(two.nodes.find((n) => n.id === "brain:b").detail));
    ok("!! the solver backend is surfaced, TRUNCATED included",
        /TRUNCATED/.test(buildTrail(HEALTH({ solverTruncated: true }), FLEET([])).nodes.find((n) => n.id === "back").detail),
        "a truncated solve is the case a reader most needs to see");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE PAGE LINKS ARE REAL PAGES, AND instruments.mjs IS WHY THEY ARE HAND-DECLARED ***");
{
    // *** THIS IS THE v4019 DEFECT, DECLINED IN ADVANCE. *** The obvious source for "related page" is
    // physics/instruments.mjs, which carries a `page` field per instrument -- and it holds ZERO brain entries,
    // because it is a registry of PHYSICS gates. Filling the field from it would have pointed brain nodes at
    // pages that never mention the brain, which is exactly what swekPage-selfcheck was written for.
    const { INSTRUMENTS } = await import("../../physics/instruments.mjs");
    const brainy = (INSTRUMENTS || []).filter((i) => /brain|rl\//i.test((i.gate || "") + " " + (i.id || "")));
    ok("!! instruments.mjs really has nothing to offer here -- the reason is measured, not assumed",
        brainy.length === 0,
        (INSTRUMENTS || []).length + " instruments, " + brainy.length + " brain-related. Had this been non-zero " +
        "the links should come from there instead, and this check would say so");

    let missing = [];
    for (const k of Object.keys(STAGE_PAGES)) {
        const f = STAGE_PAGES[k].href.replace(/^\//, "");
        if (!fs.existsSync(path.join(ENG, f))) missing.push(STAGE_PAGES[k].href);
    }
    ok("!! *** EVERY DECLARED PAGE EXISTS IN THIS TREE ***", missing.length === 0,
        missing.length ? "MISSING: " + missing.join(", ") : Object.keys(STAGE_PAGES).length + " links, all real files");
    const t = buildTrail(HEALTH(), FLEET([{ id: "g", solveMsEwma: 2, ageMs: 5 }]));
    ok("...and nodes that have no honest page carry null rather than a filler",
        t.nodes.find((n) => n.id === "engine").page === null,
        "the engine is not a page; inventing one to fill the field is the defect above");
}

// ---------------------------------------------------------------------------
console.log("\n5. *** IT REFUSES TO INVENT A THOUGHT, AND IT ACTUALLY DRAWS ***");
{
    const code = noComments(SRC);
    // brainSvg.js computes a DECORATIVE flow field from a drifting sine. This module must never do that: every
    // mark has to come from the payload.
    ok("!! the module invents no field of its own -- no trig anywhere in it",
        !/Math\.(sin|cos)\(/.test(code),
        "brainSvg.js animates a sine-driven field that is NOT the brain's; a diagram claiming to show what the " +
        "brain is doing may not make its own data up");
    ok("!! ...and it reads only the two endpoints the bridge serves",
        /\/ai\/brain\/health/.test(code) && /\/ai\/brain\/fleet/.test(code) &&
        (code.match(/fetch\(/g) || []).length === 2,
        "two fetches, both to routes that already existed");

    const { chromium, from } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, from, HEADLESS_SHELL);
    if (skip) {
        report("live half SKIPPED -- " + skip);
        report("*** A SKIP, NOT A PASS: buildTrail being right about a graph is not the same as that graph " +
               "reaching a screen without throwing.");
    } else {
        const srv = http.createServer((rq, rs) => {
            const u = rq.url.split("?")[0];
            if (u === "/ai/brain/health") { rs.writeHead(200, { "Content-Type": "application/json" }); return rs.end(JSON.stringify(HEALTH())); }
            if (u === "/ai/brain/fleet") { rs.writeHead(200, { "Content-Type": "application/json" }); return rs.end(JSON.stringify(FLEET([{ id: "galaxina", solveMsEwma: 3.4, workPriority: 2, ageMs: 40, staleSolve: false }]))); }
            if (u === "/") {
                rs.writeHead(200, { "Content-Type": "text/html" });
                return rs.end('<div id="h"></div><script type="module">import{mountBrainTrail}from"/ui/brainTrail.js";mountBrainTrail(document.getElementById("h"),{pollMs:100000});</script>');
            }
            let body = null; try { body = fs.readFileSync(path.join(ENG, u)); } catch {}
            if (body) { rs.writeHead(200, { "Content-Type": "text/javascript" }); return rs.end(body); }
            rs.writeHead(404); rs.end();
        });
        await new Promise((r) => srv.listen(0, "127.0.0.1", r));
        const browser = await chromium.launch({ executablePath: HEADLESS_SHELL || undefined });
        const page = await browser.newPage();
        const errs = [];
        page.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
        await page.goto("http://127.0.0.1:" + srv.address().port + "/", { waitUntil: "networkidle" });
        await page.waitForTimeout(900);
        const seen = await page.evaluate(() => {
            const svg = document.querySelector("#h svg");
            return svg ? { rects: svg.querySelectorAll("rect").length, paths: svg.querySelectorAll("path").length,
                           text: svg.textContent } : null;
        });
        ok("!! *** THE GRAPH RENDERED: BOXES AND EDGES, IN A REAL BROWSER ***",
            !!seen && seen.rects >= 5 && seen.paths >= 4,
            seen ? seen.rects + " nodes, " + seen.paths + " edges" : "no svg produced");
        ok("!! ...and the live brain is named on it", !!seen && /galaxina/.test(seen.text),
            "the node carries the brain's real id from the fleet payload");
        ok("!! no page errors", errs.length === 0, errs.length ? errs.slice(0, 2).join(" | ") : "clean");
        await browser.close();
        await new Promise((r) => srv.close(r));
    }
}

console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
process.exit(fails ? 1 : 0);
