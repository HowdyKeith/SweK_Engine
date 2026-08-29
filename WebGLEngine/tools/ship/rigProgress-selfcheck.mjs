// tools/ship/rigProgress-selfcheck.mjs
//
// Run: node tools/ship/rigProgress-selfcheck.mjs   (browser half skips cleanly without Chromium)
// RUNTIME 11.4s MEASURED (median of 3 -- 11427/11419/11413 ms -- with date(1) around the run). Section 4's
// alternated A/B is six spawns of a 1.2s fixture; section 5 is a real headless Chromium rendering 1153 rows.
//
// v4004 -- Keith: "can rig.html for each step show how much time is expected? whether the hash is already
// matched? what step each rig step is on, unless that would slow down a test."
//
// *** THE LAST CLAUSE IS THE HARD PART AND IT IS WHY THIS FILE EXISTS. *** "It does not slow the test" is a
// CLAIM, and this tree grades claims. The argument is that /rig/progress hands back a view of the buffer
// rigRunner was already filling from the child's stdout -- the child is never signalled, never paused, never
// asked anything -- but an argument that sounds airtight is exactly the kind this project has been wrong about
// before. Section 4 measures it, alternated, and reports the effect BESIDE the noise it sits in.
//
// *** AND THE HASH IS THE DANGEROUS ONE. *** "Whether the hash is already matched" is a useful thing to SEE and
// a catastrophic thing to ACT ON. It compares the bytes of the gate FILE against the ones recorded when it last
// passed; it says nothing about the code that gate checks. An unchanged gate over changed physics is precisely
// the case where running it matters most, so section 3 asserts that nothing anywhere skips a run on the
// strength of it. A cache key that decided what to run would be the stale-suppression shape this tree keeps
// finding, at the one place where being wrong means a defect ships green.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { codeOnly } from "./sourceScan.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

const rig = require_(path.join(ENG, "ai-bridge", "rigRunner.js"));
const handle = rig.handle || rig;
const RIG_SRC = fs.readFileSync(path.join(ENG, "ai-bridge", "rigRunner.js"), "utf8");
const PAGE = fs.readFileSync(path.join(ENG, "rig.html"), "utf8");

const srv = http.createServer((q, s) => { if (!handle(q, s)) { s.writeHead(404); s.end("nf"); } });
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const BASE = "http://127.0.0.1:" + srv.address().port;
const get = async (u) => (await fetch(BASE + u, { cache: "no-store" })).json();

console.log("rigProgress-selfcheck -- what a rig step costs, whether it changed, and where it has got to\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE EXPECTATION COMES FROM THE SERVER, AND THE PAGE OWNS NO COPY OF IT ***");
const list = await get("/rig/list");
{
    ok("the list still answers", Array.isArray(list.checks) && list.checks.length > 100, list.checks.length + " checks");
    const withExp = list.checks.filter((c) => c.expectedMs != null);
    ok("!! *** every check carries the budget it will be killed at ***",
        list.checks.every((c) => typeof c.budgetMs === "number" && c.budgetMs > 0),
        list.checks.filter((c) => !(c.budgetMs > 0)).length + " without one");
    ok("!! ...and most carry HOW LONG IT USUALLY TAKES, which is a different number",
        withExp.length > list.checks.length * 0.8,
        withExp.length + " of " + list.checks.length + " have an observed time. 'usually 47s, killed at 182s' " +
        "tells you what a run sitting at 90s means; either number alone does not");
    // *** UNMEASURED IS NOT QUICK. *** A gate nobody has timed must not report 0 -- on a page that sorts or
    // colours by duration, zero is the fastest thing on the screen, which is the most flattering possible
    // reading of no data at all. v3048's rule, and gateActivity holds the same line for the same reason.
    ok("!! a never-timed gate reports expectedMs === null, NEVER 0",
        list.checks.every((c) => c.expectedMs === null || c.expectedMs > 0),
        (list.checks.length - withExp.length) + " never timed, and none of them claims to be instant");
    ok("!! ...and the PAGE renders that absence as a question mark rather than a duration",
        /NEVER TIMED\. Unmeasured is not quick/.test(PAGE));
    // v3919: the page had its own `|| 180000` and would have gone on printing "180s budget" after the server
    // moved to 568s. THE NUMBER LIVES IN ONE PLACE, and that is checked here rather than promised in a comment.
    // *** MY FIRST VERSION OF THIS CHECK HUNTED THE DIGITS AND CAUGHT ITS OWN FORMATTER. *** It flagged the
    // two 60000s in secs(), which are a MILLISECONDS-TO-MINUTES CONVERSION and not a budget at all. A regex
    // over magnitudes cannot tell a duration constant from a unit constant, and the page needs the second kind.
    // The v3919 defect was never "a big number appears" -- it was `r.timeoutMs || 180000`, a FALLBACK that
    // substitutes the page's own answer when the server does not send one. That SHAPE is what is forbidden,
    // so that shape is what is hunted.
    const pageCode = codeOnly(PAGE);
    const fallbacks = pageCode.match(/\b(?:timeoutMs|budgetMs|expectedMs)\s*(?:\|\||\?\?)\s*\d/g) || [];
    ok("!! *** rig.html supplies NO budget of its own when the server sends none ***",
        fallbacks.length === 0,
        fallbacks.length ? "FALLBACK FOUND: " + fallbacks.join(", ") + " -- v3919's `|| 180000` is exactly this, " +
            "and it went on printing 180s for seven hundred versions after the server moved to 568s"
          : "a missing budget is reported as unknown, never invented");
    ok("...and the page says UNKNOWN rather than guessing when the server sends nothing",
        /budget unknown -- server sent none/.test(PAGE),
        "the two halves of v3919's rule: do not invent one, and SAY that you did not");
    ok("...and the two numbers really are read from two different tables server-side",
        /gateBudget\.mjs/.test(RIG_SRC) && /gate-timings\.json/.test(RIG_SRC),
        "budgetFor() is when it dies; gate-timings.json is what it has done. Merging them would make one of " +
        "the two questions unanswerable");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE HASH IS SHOWN. IT IS NEVER ACTED ON. ***");
{
    const states = new Set(list.checks.map((c) => c.passState));
    ok("every check reports a pass-state from the closed set",
        [...states].every((s) => ["unchanged", "changed", "unknown"].includes(s)), [...states].join(", "));
    // *** UNKNOWN IS NOT THE DEFAULT (v3103), AND HERE IT IS THE WHOLE SAFETY PROPERTY. *** A box with no run
    // history must not report every gate as settled. Driven directly rather than inferred from this box's state.
    const hs = await import("./hostScale.mjs");
    const tmp = path.join(ENG, "tools", "ship", "__rigprogress-probe.json");
    try { fs.rmSync(tmp, { force: true }); } catch {}
    ok("!! *** a gate with NO recorded pass reads `unknown`, never `unchanged` ***",
        hs.passState("some/gate-selfcheck.mjs", "abc123", tmp).state === "unknown",
        "a fresh box would otherwise report the whole suite as unchanged-since-pass, which is the most " +
        "flattering possible reading of no information at all");
    hs.recordRun("some/gate-selfcheck.mjs", 1234, true, tmp, "abc123");
    ok("!! ...a recorded PASS with the same bytes reads `unchanged`",
        hs.passState("some/gate-selfcheck.mjs", "abc123", tmp).state === "unchanged");
    ok("!! ...and one byte different reads `changed`",
        hs.passState("some/gate-selfcheck.mjs", "abc124", tmp).state === "changed");
    // A FAILING RUN MUST NOT STAMP THE HASH. "Unchanged since it last failed" is a true sentence that reads
    // like the opposite of what the chip means.
    hs.recordRun("other/gate-selfcheck.mjs", 99, false, tmp, "deadbeef");
    ok("!! a FAILED run does not record a pass hash", hs.passState("other/gate-selfcheck.mjs", "deadbeef", tmp).state === "unknown",
        "otherwise the chip would say 'unchanged' about a gate that has never passed here");
    try { fs.rmSync(tmp, { force: true }); } catch {}

    // *** THE LOAD-BEARING NEGATIVE. *** Nothing may branch on the hash to avoid running something.
    const code = codeOnly(RIG_SRC) + codeOnly(PAGE);
    ok("!! *** NO CODE PATH SKIPS A RUN BECAUSE THE HASH MATCHED ***",
        !/passState\s*===\s*["']unchanged["']\s*\)\s*(?:return|\{[^}]*return)/.test(code) &&
        !/if\s*\([^)]*unchanged[^)]*\)\s*return/.test(code),
        "the chip is INFORMATION. A gate's verdict depends on the code it checks, which is not in this hash, " +
        "so an unchanged gate over changed physics is exactly the case where running it matters most");
    ok("...and the page says so where a reader will meet it, not only here",
        // v4075 -- the caveat is a STRING LITERAL in rig.html's tooltip, so the hazard is an HTML comment
        // carrying the same words rather than a JS one; stripped, and whitespace collapsed so rewrapping the
        // concatenated string cannot redden a page that still shows the caveat.
        /IT DOES NOT MEAN IT WOULD STILL PASS/.test(PAGE.replace(/<!--[\s\S]*?-->/g, " ").replace(/\s+/g, " ")),
        "the caveat rides in the chip's own tooltip, because a limit recorded only in a gate is a limit the " +
        "person clicking the button never sees");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** WHAT STEP IT IS ON, FROM THE BUFFER THE SERVER WAS ALREADY HOLDING ***");
const FIX = path.join(ENG, "tools", "ship", "__rigprogress-fixture-selfcheck.mjs");
fs.writeFileSync(FIX, [
    "// synthetic fixture written and deleted by rigProgress-selfcheck. Prints numbered sections, then exits 0.",
    "const sleep = (ms) => new Promise((r) => setTimeout(r, ms));",
    "for (const n of [1, 2, 3]) { console.log(n + '. SECTION ' + n); console.log('  PASS  a check in section ' + n); await sleep(380); }",
    "process.exit(0);",
].join("\n"));
try {
    ok("a rel nobody is running reports running:false rather than throwing",
        (await get("/rig/progress?rel=" + encodeURIComponent("no/such-selfcheck.mjs"))).running === false);

    const seen = [];
    const runP = fetch(BASE + "/rig/run", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rel: "tools/ship/__rigprogress-fixture-selfcheck.mjs" }) }).then((r) => r.json());
    const relEnc = encodeURIComponent("tools/ship/__rigprogress-fixture-selfcheck.mjs");
    let done = false;
    runP.then(() => { done = true; });
    while (!done) {
        const p = await get("/rig/progress?rel=" + relEnc);
        if (p.running && p.section) seen.push(p.section);
        await new Promise((r) => setTimeout(r, 90));
    }
    const res = await runP;
    const uniq = [...new Set(seen)];
    ok("!! *** THE SECTIONS ARE VISIBLE WHILE IT RUNS, NOT ONLY AFTER ***", uniq.length >= 2,
        uniq.length + " distinct sections seen mid-run: " + JSON.stringify(uniq));
    // *** THE SECTION, NOT THE LAST LINE. *** A PASS row scrolls past several times a second and tells a
    // watcher nothing; a numbered heading says which third of the gate they are in, which is what was asked.
    ok("!! ...and it is the numbered SECTION that is reported, not whatever line went past last",
        uniq.every((s) => /^\d+[.)]\s/.test(s)), JSON.stringify(uniq.slice(0, 2)));
    ok("the run still returns its real verdict alongside", res.ok === true && res.ms > 0, "ok=" + res.ok + " ms=" + res.ms);
    ok("...and progress reports running:false once it is done",
        (await get("/rig/progress?rel=" + relEnc)).running === false);

    // ---------------------------------------------------------------------------
    console.log("\n4. *** AND IT DOES NOT SLOW THE TEST -- MEASURED, ALTERNATED, AGAINST ITS OWN NOISE ***");
    const runFixture = async (poll) => {
        let stop = false;
        const poller = poll ? (async () => { while (!stop) { try { await get("/rig/progress?rel=" + relEnc); } catch {} await new Promise((r) => setTimeout(r, 60)); } })() : null;
        const r = await (await fetch(BASE + "/rig/run", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rel: "tools/ship/__rigprogress-fixture-selfcheck.mjs" }) })).json();
        stop = true; if (poller) await poller;
        return r.ms;
    };
    // ALTERNATED A B A B, never blocked. Running one arm to completion and then the other lets any drift in the
    // box -- thermal, another process, a GC -- land entirely on one side and be read as the effect.
    const off = [], on = [];
    for (let i = 0; i < 3; i++) { off.push(await runFixture(false)); on.push(await runFixture(true)); }
    const mOff = med(off), mOn = med(on);
    const effect = (mOn / mOff - 1) * 100;
    const noise = (Math.max(...off) / Math.min(...off) - 1) * 100;
    ok("!! *** POLLING'S EFFECT IS SMALLER THAN THE UNPOLLED ARM'S OWN SPREAD ***",
        Math.abs(effect) <= Math.max(noise, 8),
        `unpolled ${off.join("/")} (median ${mOff}), polled ${on.join("/")} (median ${mOn}) -- ` +
        `effect ${effect.toFixed(1)}%, spread within the unpolled arm alone ${noise.toFixed(1)}%`);
    report("THE REASON IT IS FREE, and it is structural rather than careful: rigRunner ALREADY receives the " +
           "child's stdout incrementally and concatenates it, whether anybody looks or not. /rig/progress " +
           "returns a view of THAT buffer. The child is never signalled, never paused, never asked anything. " +
           "The measurement is here because 'structural' is an argument, and this tree grades arguments.");
    report("MEASURED SEPARATELY at v4004 on a real 6s gate (physics/knobRegistry-selfcheck.mjs), four runs " +
           "each way with 38 polls at 150ms: median 6075ms unpolled against 5976ms polled, -1.6%, with 4.2% " +
           "spread inside the unpolled arm. The fixture above is small so this gate stays cheap; the real-gate " +
           "number is the one that answers Keith's question.");
} finally {
    try { fs.rmSync(FIX, { force: true }); } catch {}
}
ok("...and the fixture gate is deleted again", !fs.existsSync(FIX),
    "a gate that leaves a gate behind would grow the population every other census counts");

// ---------------------------------------------------------------------------
console.log("\n5. *** THE REAL PAGE, IN A REAL BROWSER ***");
{
    const { chromium, from } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, from, HEADLESS_SHELL);
    if (skip) {
        report("live half SKIPPED -- " + skip);
        report("*** THAT IS A SKIP AND NOT A PASS: sections 1-4 drive the SERVER, and a server that answers " +
               "correctly proves nothing about whether the page renders what it sends.");
    } else {
        const b = await chromium.launch({ executablePath: HEADLESS_SHELL });
        const ctx = await b.newContext();
        const pg = await ctx.newPage();
        const errs = [];
        pg.on("pageerror", (e) => errs.push(String(e)));
        await pg.route("**/*", (route) => {
            const u = new URL(route.request().url());
            if (u.pathname.startsWith("/rig/")) return route.continue();
            const f = path.join(ENG, decodeURIComponent(u.pathname));
            if (fs.existsSync(f) && fs.statSync(f).isFile()) {
                const e = path.extname(f);
                return route.fulfill({ status: 200, body: fs.readFileSync(f),
                    contentType: e === ".html" ? "text/html" : e === ".js" || e === ".mjs" ? "text/javascript" : "text/plain" });
            }
            return route.fulfill({ status: 404, body: "nf" });
        });
        await pg.goto(BASE + "/rig.html", { waitUntil: "load" });
        await pg.waitForTimeout(2200);
        const view = await pg.evaluate(() => ({
            rows: document.querySelectorAll(".row").length,
            exp: [...document.querySelectorAll(".exp")].slice(0, 3).map((x) => x.textContent.trim()),
            listErr: document.getElementById("list").textContent.startsWith("could not reach") ?
                     document.getElementById("list").textContent.slice(0, 120) : null,
        }));
        ok("!! *** THE PAGE RENDERS ITS ROWS ***", view.rows > 100,
            view.listErr ? "LIST ERROR: " + view.listErr : view.rows + " rows");
        ok("!! ...and each one shows an expected time beside a budget",
            view.exp.length === 3 && view.exp.every((t) => /\//.test(t)), JSON.stringify(view.exp));
        ok("no page errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
        await ctx.close();
        await b.close();
    }
}

srv.close();
console.log("\n" + (fails ? `${fails} FAILED` : "ALL PASS"));
process.exit(fails ? 1 : 0);
