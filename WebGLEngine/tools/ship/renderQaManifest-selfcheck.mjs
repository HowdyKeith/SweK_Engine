// WebGLEngine/tools/ship/renderQaManifest-selfcheck.mjs -- v2821
//
// Run: node tools/ship/renderQaManifest-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES the render-QA page list -- tools/render-qa/manifest.json plus discover.mjs -- because that list decides
// what gets rendered on the rig, and a page missing from it is a page nobody ever looks at.
//
// THE BUG THIS EXISTS FOR: discover.mjs keyed explicit entries by base file with the QUERY STRING STRIPPED, so
// several tuned entries for the same file collapsed into one and only the LAST survived. That was not
// hypothetical -- /index.html?preset=qa1 (the engine's own main QA entry) was ALREADY being dropped by its
// collision with /index.html?box3ddemo=1, before anything was added. The harness reported green on a list that
// had quietly lost its most important page. Which is the exact failure discover.mjs was written to fix, one
// level up: "a gate covering 12% of the surface is not a gate, it is a gate-shaped object".

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discover } from "../render-qa/discover.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const QA = path.join(ENG, "tools", "render-qa");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const manifest = JSON.parse(fs.readFileSync(path.join(QA, "manifest.json"), "utf8"));
const result = discover({ dir: ENG, manifest });

// 1. THE COLLAPSE BUG -- several tuned entries for one file must ALL survive
{
    const fixture = {
        defaults: { wait: 100 },
        pages: [
            { name: "a", url: "/index.html" },
            { name: "b", url: "/index.html?x=1" },
            { name: "c", url: "/index.html?y=2" },
        ],
    };
    const r = discover({ dir: ENG, manifest: fixture, files: ["index.html"] });
    const names = r.pages.map((p) => p.name).sort().join(",");
    ok("three explicit entries for ONE file all survive discovery", names === "a,b,c", "got " + names);
    ok("...and the file is not ALSO auto-added on top of them", r.added.length === 0 && r.kept.includes("index.html"));
}

// 2. no duplicates, and every explicit entry points at a file that exists
{
    // v3215 -- *** THE UNIT OF WORK IS A URL AND A CANVAS, NOT A URL. *** This forbade two entries sharing a
    // URL and flagged sphere-impostor / sphere-impostor-flat, which are the SAME PAGE deliberately checked on
    // TWO CANVASES -- #sphere must bow (>= 0.05) and #flat must not (<= 0.03). That pair is the whole point of
    // the v3180 round: a comparison needs both sides, and forbidding it would have forced somebody to delete
    // one half of a working check to make a gate quiet.
    //
    // THE PROPERTY IS THAT NO TWO ENTRIES TEST THE SAME THING. Two entries on one URL with DIFFERENT canvases
    // are two different things; two with the same canvas would be a real duplicate, and that is now what fails.
    const keyOf = (p) => String(p.url) + " @ " + String(p.canvas || "(default canvas)");
    const keys = result.pages.map(keyOf);
    const dupes = keys.filter((u, i) => keys.indexOf(u) !== i);
    ok("no duplicate url+canvas pairs in the discovered page list", dupes.length === 0,
        dupes.length ? dupes.join(", ")
                     : keys.length + " entries, " + new Set(result.pages.map((p) => String(p.url))).size +
                       " distinct URLs -- the difference is pages checked on more than one canvas, which is a " +
                       "COMPARISON and not a duplicate");
    const missing = manifest.pages
        .map((p) => String(p.url).split("?")[0].replace(/^\//, ""))
        .filter((f, i, a) => a.indexOf(f) === i)
        .filter((f) => !fs.existsSync(path.join(ENG, f)));
    ok("every explicit manifest entry names a page that exists", missing.length === 0, missing.join(", "));
}

// 3. THE PAGES THAT ONLY AN EXPLICIT ENTRY CAN REACH. Discovery walks FILES, so a query-string variant can
// never come from it -- if these are not listed, that configuration is never rendered by anyone.
{
    const byUrl = new Map(result.pages.map((p) => [String(p.url), p]));
    for (const url of ["/index.html", "/index.html?rle=1", "/index.html?biomes=1", "/index.html?rle=1&biomes=1"]) {
        ok(`world variant present: ${url}`, byUrl.has(url));
    }
    ok("the pre-existing ?preset=qa1 entry survives alongside them", byUrl.has("/index.html?preset=qa1"));
    ok("the pre-existing ?box3ddemo=1 entry survives too", byUrl.has("/index.html?box3ddemo=1"));
    // the RLE variant is the seam test: it must actually assert something about the picture
    const rle = byUrl.get("/index.html?rle=1");
    ok("the RLE variant checks the render, not just that the page loaded",
        rle && (rle.checks || []).some((c) => c.type === "notAllBlack") && (rle.checks || []).some((c) => c.type === "notUniform"));
    ok("...and it fails on console errors", rle && rle.noConsoleErrors === true);
}

// 4. THE LAB PAGES ARE PLOTS, so notAllBlack alone is too weak -- a uniform grey canvas passes it
{
    for (const n of ["lab-ising", "lab-kepler", "lab-fresnel", "lab-kerr", "lab-fanbeam", "lab-wind-tunnel"]) {
        const p = result.pages.find((x) => x.name === n);
        ok(`${n}: asserts STRUCTURE (notUniform), not merely non-black`,
            !!p && (p.checks || []).some((c) => c.type === "notUniform"), p ? (p.checks || []).map((c) => c.type).join("/") : "missing");
    }
}

// 5. the bridge pages have no canvas, so their only real check is console errors -- confirm they get it
{
    for (const f of ["device.html", "gates.html", "benchmarks.html", "ship.html", "roundhouse.html"]) {
        const p = result.pages.find((x) => String(x.url) === "/" + f);
        ok(`${f}: discovered and set to fail on console errors`, !!p && p.noConsoleErrors === true);
    }
}

// 6. coverage is real, and skips are declared rather than silent
{
    ok("the page list is the whole engine, not a remembered subset", result.total > 200, result.total + " pages");
    ok("every skipped page carries a REASON", (result.skipped || []).every((s) => s.reason && s.reason.length > 3), JSON.stringify((result.skipped || [])[0] || {}));
    ok("no orphan entries pointing at deleted pages", (result.orphans || []).length === 0, (result.orphans || []).join(", "));
}

// 7. checks referenced by the manifest actually exist in checks.mjs
{
    const { CHECKS } = await import("../render-qa/checks.mjs");
    const used = new Set();
    for (const p of result.pages) for (const c of p.checks || []) used.add(c.type);
    const unknown = [...used].filter((t) => !CHECKS[t]);
    ok("every check type used is implemented in checks.mjs", unknown.length === 0, unknown.join(", "));
}

console.log("renderQaManifest-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
