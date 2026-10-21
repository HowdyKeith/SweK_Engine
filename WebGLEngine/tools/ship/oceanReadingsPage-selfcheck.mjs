// WebGLEngine/tools/ship/oceanReadingsPage-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/oceanReadingsPage-selfcheck.mjs      (~1 s with a browser; section 1 alone ~0.1 s)
//
// THE READINGS PAGE, HELD TO WHAT IT SAYS. ocean-readings.html prints a table, bars and a pixel-cost line, every figure computed by ui/oceanReadings.mjs from the stored HUD lines.
// The module is graded by ui/oceanReadings-selfcheck.mjs; this gate grades the PAGE: that it types no figure of its own, builds everything through textContent and createElementNS,
// loads nothing from outside, and -- in a browser, which needs no GPU -- that the cells it shows are the module's numbers to the printed digit, the bars are drawn at lengths
// that order as the milliseconds do, and the line it prints about the fit carries its own caveats.
//
// WHAT IT DOES NOT GRADE: that the readings are true, or how the page looks (the screenshot is for a human).
//
// SABOTAGE LOG -- each applied in place, the gate run with a real browser, the file restored and md5-compared; every one red by name (number of rows red):
//   P1 a median typed in the page 2 | P2 the bars not scaled by the median 1 | P3 a row set as innerHTML 2 | P4 the fit paragraph without its caveats 2 | P5 an outside <script src> 2
//   P6 the "not a fit you can lean on" line dropped 1 | P7 a stray extra table row 2 | after the second adapter: the second adapter dropped from the page 1, the card shown as the browser's 1,
//   a row built through innerHTML 1, a hard-coded bar scale 0 -> 1 and a budget line moved or removed 0 -> 1 (both passed until a row read the scale back from the bars) (restored md5-identical after each)
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import * as R from "../../ui/oceanReadings.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);
const raw = fs.readFileSync(path.join(ENG, "ocean-readings.html"), "utf8");
const sm = /<script type="module">([\s\S]*?)<\/script>/.exec(raw), code = sm ? sm[1] : "";
const noComments = (s) => s.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const flat = raw.replace(/\s+/g, " ");

console.log("oceanReadingsPage-selfcheck -- the rig's readings of the vendored sea, as a table\n");
console.log("1. THE PAGE'S SOURCE");
{
    const body = noComments(raw), js = noComments(code);
    ok("!! the page imports the readings module and the budget from the engine's own paths", /import \* as R from "\/ui\/oceanReadings\.mjs"/.test(code) && /import \{ BUDGET_MS \} from "\/ui\/oceanTier\.mjs"/.test(code) && fs.existsSync(path.join(ENG, "ui/oceanReadings.mjs")));
    ok("!! the page TYPES no figure of its own: no millisecond value, no resolution size and no fit coefficient is spelled in its script", !/\b\d{2,3}\.\d{1,2}\b/.test(js.replace(/"\d+ \d+"/g, "")) && !/\b(1653|1280|960|493|720|540)\b/.test(js) && !/54\.4|0\.187/.test(js), "every number on the page comes from R.groups / R.fitLine / R.reportLines");
    const hits = ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function", "setAttribute(\"on", "srcdoc"].filter((w) => body.includes(w));
    ok("!! the page NEVER turns data into markup", hits.length === 0, hits.join(", "));
    ok("!! every cell and sentence reaches the DOM through textContent, and the bars are SVG made with createElementNS", /e\.textContent\s*=/.test(js) && /\$\("fit"\)\.textContent\s*=/.test(js) && /\$\("probes"\)\.textContent\s*=/.test(js) && /createElementNS\(NS/.test(js));
    const ext = [...body.matchAll(/(?:src|href|action)\s*=\s*"(https?:\/\/[^"]+)"|fetch\(\s*"(https?:\/\/[^"]+)"|url\(\s*"?(https?:\/\/[^")]+)|import\s+[^;]*"(https?:\/\/[^"]+)"/g)].filter((m) => !/github\.com\/noniv/.test(m[0]));
    ok("!! the page loads NOTHING from outside (the attribution is text, not a request)", ext.length === 0, ext.map((m) => m[0]).join(" | "));
    ok("the page has the demo: meta tags, a <title>, and links to the opt-in page, the spike, the default water and server.html", /name="demo:title"/.test(raw) && /name="demo:desc"/.test(raw) && /name="demo:category"/.test(raw) && /<title>/.test(raw) && ["/ocean-sea.html", "/ocean-spike.html", "/ocean-default.html", "/server.html"].every((h) => raw.includes('href="' + h + '"')));
    ok("!! the page SAYS what it is not: not a benchmark of the engine, not a fit to lean on, not a discrete-GPU survey", /NOT A BENCHMARK OF THE ENGINE/.test(flat) && /NOT A FIT YOU CAN LEAN ON/.test(flat) && /NOT A DISCRETE-GPU SURVEY/.test(flat));
}

console.log("\n2. THE LIVE PAGE");
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) {
        report("live half SKIPPED -- " + skip);
        report("*** THAT IS A SKIP AND NOT A PASS: section 1 reads source, and source cannot show that the cells carry the module's numbers or that the bars order as the milliseconds do");
    } else {
        const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".css": "text/css" };
        const server = http.createServer((req, res) => {
            const fp = path.join(ENG, decodeURIComponent(req.url.split("?")[0]));
            if (fp.startsWith(ENG) && fs.existsSync(fp) && fs.statSync(fp).isFile()) { res.writeHead(200, { "Content-Type": types[path.extname(fp)] || "text/plain" }); return res.end(fs.readFileSync(fp)); }
            res.writeHead(404); res.end("not found");
        });
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        const base = "http://127.0.0.1:" + server.address().port;
        const b = await chromium.launch({ executablePath: HEADLESS_SHELL });
        try {
            const ctx = await b.newContext({ viewport: { width: 1000, height: 900 } });
            const pg = await ctx.newPage(); const errs = [];
            pg.on("pageerror", (e) => errs.push(String(e.message))); pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
            await pg.goto(base + "/ocean-readings.html", { waitUntil: "load" });
            await pg.waitForFunction(() => window.__readings && window.__readings.rows > 0, null, { timeout: 8000 }).catch(() => {});
            const rec = R.READINGS_AT_V4892;
            const dom = await pg.evaluate(() => ({
                tables: [...document.querySelectorAll("table.set")].map((t) => ({ adapter: t.dataset.adapter, rows: [...t.tBodies[0].rows].map((tr) => [...tr.cells].map((c) => c.textContent)) })),
                heads: [...document.querySelectorAll("#sets h2")].map((h) => h.textContent),
                bars: [...document.querySelectorAll("#bars rect")].map((r) => ({ ms: r.getAttribute("data-ms"), adapter: r.getAttribute("data-adapter"), w: +r.getAttribute("width") })),
                budgetX: [...document.querySelectorAll("#bars line")].map((l) => +l.getAttribute("x1")), svgW: +document.getElementById("bars").getAttribute("width"),
                fit: document.getElementById("fit").textContent, probes: document.getElementById("probes").textContent,
            }));
            const wantRows = (set) => R.groups(set).map((g) => [g.resolution, g.width + "x" + g.height, String(g.n), g.gpuMedian.toFixed(1), g.gpuMin.toFixed(1) + " - " + g.gpuMax.toFixed(1), "x" + g.budgetMultiple.toFixed(g.budgetMultiple < 1 ? 2 : 1), g.fps.toFixed(1)]);
            ok("!! *** one table per adapter, and every cell is the module's number to the printed digit: the UHD 620's three groups and the Pascal's five ***", dom.tables.length === 2 && rec.sets.every((set, i) => dom.tables[i].adapter === set.adapter && JSON.stringify(dom.tables[i].rows) === JSON.stringify(wantRows(set))), dom.tables.map((t) => t.adapter + ": " + t.rows.map((r) => r[3]).join("/")).join("  |  "));
            ok("  the second adapter's heading names the card as Keith named it, says the browser did not, and carries the 1080 report", /nvidia pascal = GTX 1070 Ti \(named by Keith; the browser reported only the first part; he also sees it reported as 1080 somewhere\)/.test(dom.heads[1]) && !/GTX/.test(dom.heads[0]), dom.heads[1].slice(0, 100));
            const all = rec.sets.flatMap((set) => R.groups(set).map((g) => ({ set, g })));
            ok("!! *** the bars share ONE scale across both adapters: eight bars (3 + 5) drawn from the medians, and ordered exactly as the milliseconds are, pair by pair ***", dom.bars.length === 8 && dom.bars.every((x, i) => x.ms === all[i].g.gpuMedian.toFixed(2)) && dom.bars.every((x, i) => dom.bars.every((y, k) => (x.w < y.w) === (+x.ms < +y.ms) || x.w === y.w)) && Math.abs(dom.bars[0].w / dom.bars[3].w - all[0].g.gpuMedian / all[3].g.gpuMedian) < 0.03, dom.bars.map((x) => x.w.toFixed(0)).join(" / ") + " px");
            {   // the scale itself: pixels per millisecond from any bar; the longest bar must use most of the drawable width, and the budget line must sit at 33.3 ms on THAT scale
                const k = dom.bars[0].w / (+dom.bars[0].ms), left = 210;
                ok("!! *** the shared scale is the right one: the longest bar fills most of the drawing (so a hard-coded scale shows) and the budget line stands at 33.3 ms on the bars' own scale ***", dom.budgetX.length === 1 && Math.abs(dom.budgetX[0] - (left + (1000 / 30) * k)) < 1.5 && dom.bars[0].w > 0.7 * (dom.svgW - left - 90) && dom.bars[0].w <= dom.svgW - left - 90 + 1, `scale ${k.toFixed(3)} px/ms, budget line at x ${dom.budgetX[0]}`);
            }
            ok("!! *** the fit text carries both adapters' lines and their caveats: the UHD's 'no resolution passes', the Pascal's megapixels at 'x the largest size measured', and 'not a law' ***", /no resolution passes/.test(dom.fit) && /the budget is reached near \d+\.\d megapixels, \d+\.\dx the largest size measured/.test(dom.fit) && (dom.fit.match(/not a law/g) || []).length === 2 && /display rate \(16\.70 ms\)/.test(dom.fit), "");
            ok("  and the comparison between adapters is printed for the sizes both read and not for native", /at 1280x720 .* x38\.8/.test(dom.fit) && /at 960x540 .* x36\.7/.test(dom.fit) && !/at native/.test(dom.fit), "");
            ok("  the opt-in probe's numbers are printed apart from the tables (238.1 auto; 262.2, 155.2, 98.3 on) with the reason they are not fitted, and name their adapter", /238\.1 ms/.test(dom.probes) && /262\.2, 155\.2, 98\.3/.test(dom.probes) && /resized/.test(dom.probes) && /UHD Graphics 620/.test(dom.probes), "");
            ok("!! the page made no script error and no console error", errs.length === 0, errs.join(" | ").slice(0, 200));
            try { await pg.screenshot({ path: process.env.OCEAN_READINGS_SHOT || "/tmp/ocean-readings.png" }); } catch {}
            await ctx.close();
        } finally { await b.close(); server.close(); }
    }
}

report("UNCHECKED, said plainly: that the rig's HUD lines are true readings; what the page looks like (the screenshot is for a human); any discrete GPU.");
console.log("oceanReadingsPage-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
