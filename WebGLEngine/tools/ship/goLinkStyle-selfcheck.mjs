// WebGLEngine/tools/ship/goLinkStyle-selfcheck.mjs -- v4041
// ---------------------------------------------------------------------------------------------------------------
// GATES the .go-link styling Keith asked for: "let's make the link boxes around the ?go=id to appear different.
// maybe have a flash over effect on those buttons." A `?go=id` deep-link has no file behind it -- it is a STATE
// the running engine enters (KINDS.DEMO/KINDS.BUILTIN in launchIndex.mjs, survives:false), and it was rendering
// as a plain link indistinguishable from a real page sitting beside it, in both page-index.html's unified list
// and the two spots server.html renders one directly (the pfResumeFx portfolio button, and the ABYSS Battleship
// entry inside the Tools GROUPS directory).
//
// *** THE REAL BUG THIS GATE WOULD HAVE CAUGHT: THE FIRST DRAFT USED `?go=` AS THE DETECTOR AND MISSED HALF ITS
// OWN TARGETS. *** ABYSS Battleship's href is "index.html?forceEngine=1&go=battleship" -- go is the SECOND query
// param, joined by `&`, not `?`. A literal `indexOf("?go=")` check is true for a `?go=battleship` href and false
// for an `&go=battleship` one, so it flagged pfResumeFx (built from a separate id->function map, not a string
// test) while silently leaving the GROUPS-array battleship link unstyled -- caught by rendering both in headless
// Chromium and finding one flash-styled and the other not, not by reading the regex and assuming it was right.
// Fixed to /[?&]go=/, which matches `go=` as either the first or a later query parameter.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const report = (l) => console.log("  ----  " + l);

console.log("goLinkStyle-selfcheck -- the '?go=id' flash-over styling Keith asked for\n");

const pageIndexSrc = fs.readFileSync(path.join(ENG, "page-index.html"), "utf8");
const serverSrc = fs.readFileSync(path.join(ENG, "server.html"), "utf8");

console.log("1. THE CSS RULE ITSELF -- A HOVER SHEEN, NOT A CONSTANT PULSE");
{
    for (const [label, src] of [["page-index.html", pageIndexSrc], ["server.html", serverSrc]]) {
        ok(`!! ${label} defines .go-link with a ::before sheen that only moves ON HOVER`,
           /\.go-link::before\s*\{[^}]*background-image|.go-link::before\s*\{[^}]*background:linear-gradient/.test(src) &&
           /\.go-link:hover::before\s*\{[^}]*background-position/.test(src),
           "\"flash over\" read literally -- an always-animating pulse on a page listing hundreds of links would " +
           "be worse than the plain-link problem it replaces");
    }
}

console.log("\n2. THE DETECTOR -- SABOTAGE-FOUND: A LITERAL \"?go=\" MISSES A go= THAT IS NOT THE FIRST PARAM");
{
    const idx = serverSrc.indexOf('a.classList.add("go-link")');
    const around = idx >= 0 ? serverSrc.slice(Math.max(0, idx - 160), idx) : "";
    ok("!! server.html's GROUPS detector matches go= as EITHER the first or a later query param",
       idx >= 0 && /\[\?&\]go=/.test(around),
       idx >= 0 ? around.trim().split("\n").pop() : "detector not found -- the GROUPS-array branch (ABYSS Battleship, and any future entry) would silently never get flash-styled");
    ok("!! ...and it is NOT the narrower literal \"?go=\" that this file's own header names as the bug it replaced",
       idx >= 0 && !/indexOf\(["']\?go=["']\)/.test(around),
       "a literal ?go= is true for \"...html?go=x\" and false for \"...html?forceEngine=1&go=x\" -- exactly ABYSS Battleship's own href");
}

console.log("\n3. page-index.html: EVERY demo/builtin GETS THE CLASS, EVERY page NEVER DOES");
{
    ok("!! the class is driven by e.kind (demo/builtin), not a string test on the href",
       /const isGo = p\.kind === "demo" \|\| p\.kind === "builtin"/.test(pageIndexSrc),
       "a page's own href can legitimately carry a query string (?mode=pipeline, #fileaccess) -- keying off kind, " +
       "the same field KINDS.*.survives already distinguishes on, is the one test that cannot mistake either for the other");
}

console.log("\n4. LIVE: RENDERED COUNTS MATCH launch-index.json, IN A REAL BROWSER");
{
    const { chromium, from } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, from, HEADLESS_SHELL);
    if (skip) {
        report("live half SKIPPED -- " + skip);
        report("*** THAT IS A SKIP AND NOT A PASS: sections 1-3 read source, and source cannot show what a " +
               "browser actually paints for a class name it never runs. ***");
    } else {
        let li = null;
        try { li = JSON.parse(fs.readFileSync(path.join(ENG, "launch-index.json"), "utf8")); } catch {}
        const expectGoCount = li ? li.entries.filter((e) => e.kind !== "page").length : null;

        const srv = http.createServer((rq, rs) => {
            const p = decodeURIComponent((rq.url || "/").split("?")[0]);
            const file = p === "/" ? "/page-index.html" : p;
            const full = path.join(ENG, file);
            if (!full.startsWith(ENG) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { rs.writeHead(404); rs.end("not found"); return; }
            const ext = path.extname(full);
            const ct = ext === ".html" ? "text/html" : ext === ".json" ? "application/json" : ext === ".js" || ext === ".mjs" ? "text/javascript" : "application/octet-stream";
            rs.writeHead(200, { "Content-Type": ct }); rs.end(fs.readFileSync(full));
        });
        await new Promise((r) => srv.listen(0, "127.0.0.1", r));
        const port = srv.address().port;
        const browser = await chromium.launch({ executablePath: HEADLESS_SHELL });

        try {
            const page1 = await browser.newPage();
            const errs1 = [];
            page1.on("pageerror", (e) => errs1.push(String(e).slice(0, 160)));
            await page1.goto(`http://127.0.0.1:${port}/page-index.html`, { waitUntil: "networkidle", timeout: 20000 });
            await page1.waitForTimeout(700);
            const info1 = await page1.evaluate(() => ({
                goCount: document.querySelectorAll("a.go-link").length,
                plainCount: document.querySelectorAll(".item .body > a:not(.go-link)").length,
            }));
            ok("!! page-index.html renders exactly as many .go-link anchors as launch-index.json has demos+built-ins",
               expectGoCount !== null && info1.goCount === expectGoCount,
               info1.goCount + " rendered vs " + expectGoCount + " expected (" + info1.plainCount + " plain page links alongside them)");
            ok("...with no page errors", errs1.length === 0, errs1[0] || "clean");
            await page1.close();

            const page2 = await browser.newPage();
            const errs2 = [];
            page2.on("pageerror", (e) => errs2.push(String(e).slice(0, 160)));
            await page2.goto(`http://127.0.0.1:${port}/server.html`, { waitUntil: "networkidle", timeout: 20000 });
            await page2.waitForTimeout(1200);
            const info2 = await page2.evaluate(() => {
                const resumeFx = document.getElementById("pfResumeFx");
                const battleship = [...document.querySelectorAll("#ipadGrid a")].find((a) => a.href.includes("go=battleship"));
                return {
                    resumeFxHasClass: !!resumeFx && resumeFx.classList.contains("go-link"),
                    battleshipHasClass: !!battleship && battleship.classList.contains("go-link"),
                };
            });
            ok("!! server.html's pfResumeFx portfolio button carries .go-link",
               info2.resumeFxHasClass, "the one demo launched from a dedicated button, wired via the pfDemo id->function map");
            ok("!! ...AND the ABYSS Battleship GROUPS-array entry ALSO carries it -- the case the bare \"?go=\" test missed",
               info2.battleshipHasClass, "same class, different code path (the generic detector on a hand-typed href array), both must agree");
            const nonServerErrs = errs2.filter((e) => !/Failed to load resource/.test(e));
            ok("...with no page errors beyond expected 404s from bridge-only routes (no server backing this static test)",
               nonServerErrs.length === 0, nonServerErrs[0] || "clean");
            await page2.close();
        } finally {
            await browser.close();
            srv.close();
        }
    }
}

console.log(fails ? `\ngoLinkStyle-selfcheck: ${fails} FAILED` : "\ngoLinkStyle-selfcheck: all checks pass");
if (fails) process.exit(1);
