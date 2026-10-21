// WebGLEngine/tools/ship/oceanSeaPage-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/oceanSeaPage-selfcheck.mjs      (~30 s with a browser; section 1 alone ~0.1 s)
//
// THE OPT-IN SEA PAGE, HELD TO WHAT IT SAYS. ocean-sea.html puts the vendored web-ocean sea in a frame behind the tier switch (ui/oceanTier.mjs) and keeps it only if a
// reading of the sea's own HUD says it holds the frame budget. The pure half is graded in ui/oceanSea-selfcheck.mjs; this gate grades the PAGE.
//   1  THE PAGE'S SOURCE   it imports the tier and sea modules and the physics surface; never turns data into markup; every reading reaches the DOM through textContent; loads
//                          nothing from outside; builds the sea's URL only through seaUrl(); carries the origin notice and the demo: meta tags; says what it is NOT
//   2  THE LIVE PAGE       (needs a browser; SKIPPED, and said, without one) SIX SCENARIOS IN PARALLEL, each with navigator.gpu stood in and the sea's frame replaced by a stand-in page
//                          that prints a HUD line in the sea's own format -- the sandbox has no WebGPU adapter, so this grades the PAGE'S LOGIC against a frame, and says it is not the sea:
//                          a fast GPU under auto (probed, kept, remembered, and NOT probed again on reload); a slow one under auto (probed, unloaded, the reason names the reading);
//                          the same slow one under on (kept, and says how slow); no WebGPU (the frame is never requested); off (the frame is never requested); a sea that prints nothing
//                          (given up on, not hung). And the comparison table is on the page, computed, with "differs" for the heights.
//
// WHAT IT DOES NOT GRADE: the real sea on a real GPU (the rig's reading), or that the bundle's HUD keeps its format (the bundle is pinned by oceanSpikePage-selfcheck and
// the format is read by ui/oceanSea-selfcheck against the bundle's own text).
//
// SABOTAGE LOG -- each applied in place, the gate run with a real browser, the file restored and md5-compared; every one red by name (number of rows red):
//   P1 a slow sea is never unloaded 1 | P2 the reading is not remembered 1 | P3 a remembered reading is ignored 1 | P4 off still loads the sea 2 | P5 the give-up branch removed 1
//   P6 no-WebGPU claims WebGPU 1 | P7 the page reaches into the frame (contentWindow) 1 | P8 a frame time compared to a number of the page's own 1 (that mutation was also a syntax error, so it
//   proves less than the others: the source row that reads for it was exercised only in company)
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL, webglLaunchArgs } from "./playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);
const raw = fs.readFileSync(path.join(ENG, "ocean-sea.html"), "utf8");
const sm = /<script type="module">([\s\S]*?)<\/script>/.exec(raw), code = sm ? sm[1] : "";
// the page's header comment WRAPS its prose across lines; a phrase is matched against the text with its whitespace collapsed, never against the wrapped source
const flat = raw.replace(/\s+/g, " ");
const noComments = (s) => s.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

console.log("oceanSeaPage-selfcheck -- the opt-in sea, behind the tier switch\n");

console.log("1. THE PAGE'S SOURCE");
{
    const body = noComments(raw), js = noComments(code);
    ok("!! the page imports the tier switch, the sea module and the physics surface from the engine's own paths",
        /import \* as OT from "\/ui\/oceanTier\.mjs"/.test(code) && /import \* as OS from "\/ui\/oceanSea\.mjs"/.test(code) && /import \{ defaultSurface \} from "\/physics\/ocean\/oceanSurface\.mjs"/.test(code)
        && ["ui/oceanTier.mjs", "ui/oceanSea.mjs", "physics/ocean/oceanSurface.mjs"].every((f) => fs.existsSync(path.join(ENG, f))));
    ok("!! the sea is loaded ONLY through seaUrl(): the page spells no path to the bundle and no query string of its own", /sea\.src = OS\.seaUrl\(/.test(js) && !/vendor\/web-ocean/.test(js) && !/["'`][^"'`]*\?[a-z]+=/.test(js.replace(/\$\{[^}]*\}/g, "")));
    ok("!! the page never edits the bundle: no srcdoc, no contentWindow.eval, no postMessage into the frame, and the frame is only READ (its HUD text)", !/srcdoc|contentWindow|\.eval\(|postMessage/.test(js) && /contentDocument/.test(js));
    const hits = ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function", "setAttribute(\"on", "srcdoc"].filter((w) => body.includes(w));
    ok("!! the page NEVER turns data into markup", hits.length === 0, hits.join(", "));
    ok("!! every status line and reading reaches the DOM through textContent (banner, fallback, comparison, adapter chip)", /banner\.textContent\s*=/.test(js) && /fallback\.textContent\s*=/.test(js) && /\$\("match"\)\.textContent\s*=/.test(js) && /\$\("gpuWord"\)\.textContent\s*=/.test(js));
    const ext = [...body.matchAll(/(?:src|href|action)\s*=\s*"(https?:\/\/[^"]+)"|fetch\(\s*"(https?:\/\/[^"]+)"|url\(\s*"?(https?:\/\/[^")]+)|import\s+[^;]*"(https?:\/\/[^"]+)"/g)].filter((m) => !/github\.com\/noniv/.test(m[0]));
    ok("!! the page loads NOTHING from outside (the attribution is text, not a request)", ext.length === 0, ext.map((m) => m[0]).join(" | "));
    ok("the page carries the origin notice, the demo: meta tags, a <title>, and links to the default water and server.html", /ui\/originNotice\.js/.test(raw) && /name="demo:title"/.test(raw) && /name="demo:desc"/.test(raw) && /name="demo:category"/.test(raw) && /<title>/.test(raw) && /href="\/ocean-default\.html"/.test(raw) && /href="\/server\.html"/.test(raw));
    ok("!! the page SAYS what it is not: not lined up, not read by physics, not depth-composited, not seen to render here", /NOT LINED UP WITH THE PHYSICS SURFACE/.test(flat) && /NOT READ BY ANY PHYSICS/.test(flat) && /NOT DEPTH-COMPOSITED/.test(flat) && /NOT SEEN TO RENDER WHERE IT WAS BUILT/.test(flat));
    ok("  and the decision is the tier switch's, not the page's: the page calls chooseTier and compares no frame time to a number of its own", /OT\.chooseTier\(/.test(js) && !/\b(33|30|16|60)\b\s*(?:ms|fps)/.test(js) && /OT\.BUDGET_MS/.test(js));
}

console.log("\n2. THE LIVE PAGE");
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) {
        report("live half SKIPPED -- " + skip);
        report("*** THAT IS A SKIP AND NOT A PASS: section 1 reads source, and source cannot show that the probe keeps a fast sea, unloads a slow one, remembers a reading or gives up on a mute one");
    } else {
        const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".css": "text/css" };
        const server = http.createServer((req, res) => {
            const fp = path.join(ENG, decodeURIComponent(req.url.split("?")[0]));
            if (fp.startsWith(ENG) && fs.existsSync(fp) && fs.statSync(fp).isFile()) { res.writeHead(200, { "Content-Type": types[path.extname(fp)] || "text/plain" }); return res.end(fs.readFileSync(fp)); }
            res.writeHead(404); res.end("not found");
        });
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        const base = "http://127.0.0.1:" + server.address().port;
        const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: webglLaunchArgs().args });
        // the stand-in for the sea's frame: prints a HUD line in the sea's own format every 100 ms (or never)
        const standIn = (line) => `<!doctype html><meta charset="utf-8"><div id="fps">${line === null ? "" : "starting"}</div><script>${line === null ? "" : `setInterval(() => { document.getElementById("fps").textContent = ${JSON.stringify(line)}; }, 100);`}</script>`;
        const GPUS = {
            fast: { info: { vendor: "nvidia", architecture: "pascal", description: "NVIDIA GeForce GTX 1080 Ti" }, line: "120 fps  8.33 ms  |  GPU 6.00 ms  |  3000 nodes  640x360" },
            slow: { info: { vendor: "intel", architecture: "gen-9", description: "Intel(R) UHD Graphics 620" }, line: "10 fps  100.00 ms  |  GPU 228.04 ms  |  3000 nodes  1653x493" },
            mute: { info: { vendor: "nvidia", architecture: "pascal", description: "NVIDIA GeForce GTX 1080 Ti" }, line: null },
        };
        async function scenario({ gpu, pref, noWebgpu = false }) {
            const ctx = await b.newContext({ viewport: { width: 1100, height: 760 } });
            const cfg = gpu ? GPUS[gpu] : null;
            if (!noWebgpu && cfg) await ctx.addInitScript((info) => { Object.defineProperty(navigator, "gpu", { configurable: true, value: { requestAdapter: async () => ({ info, isFallbackAdapter: false, features: new Set() }) } }); }, cfg.info);
            if (pref) await ctx.addInitScript((p) => { try { localStorage.setItem("swek.ocean.tier", p); } catch {} }, pref);
            const frameRequests = [];
            await ctx.route("**/vendor/web-ocean/ocean.html*", (route) => {
                // the frame is a NAVIGATION; the page's own fetch of the bundle's text (for the declared defaults) is not, and gets the real file
                if (route.request().isNavigationRequest()) { frameRequests.push(route.request().url()); return route.fulfill({ status: 200, contentType: "text/html", body: standIn(cfg ? cfg.line : "1 fps  1000.00 ms") }); }
                return route.continue();
            });
            const pg = await ctx.newPage(); const errs = [];
            pg.on("pageerror", (e) => errs.push(String(e.message))); pg.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
            await pg.goto(base + "/ocean-sea.html", { waitUntil: "load" });
            return { ctx, pg, frameRequests, errs };
        }
        const until = (pg, fn, ms) => pg.waitForFunction(fn, null, { timeout: ms }).then(() => true, () => false);
        const settled = (pg, ms) => until(pg, () => ["sea", "default"].includes(window.__sea && window.__sea.phase), ms);
        const snap = (pg) => pg.evaluate(() => ({ phase: window.__sea.phase, loaded: window.__sea.loaded, probeMs: window.__sea.probeMs, remembered: window.__sea.remembered, tier: window.__sea.decision && window.__sea.decision.tier, reason: window.__sea.decision && window.__sea.decision.reason,
            kind: window.__sea.adapterKind, error: window.__sea.error, samples: window.__sea.samples.length, src: document.getElementById("sea").getAttribute("src"), fallback: getComputedStyle(document.getElementById("fallback")).display, fallbackText: document.getElementById("fallback").textContent, banner: document.getElementById("banner").textContent, match: document.getElementById("match").textContent }));
        try {
            const S = {};
            const run = {
                fast: scenario({ gpu: "fast", pref: "auto" }),
                slow: scenario({ gpu: "slow", pref: "auto" }),
                slowOn: scenario({ gpu: "slow", pref: "on" }),
                none: scenario({ pref: "auto", noWebgpu: true }),
                off: scenario({ gpu: "fast", pref: "off" }),
                mute: scenario({ gpu: "mute", pref: "auto" }),
            };
            for (const k of Object.keys(run)) S[k] = await run[k];
            // the no-WebGPU and off pages answer at once; the others are measuring. Wait for each by what it must reach.
            const [fastDone, slowDone, slowOnProbed] = await Promise.all([
                settled(S.fast.pg, 30000), settled(S.slow.pg, 30000),
                until(S.slowOn.pg, () => window.__sea && window.__sea.probeMs != null, 30000)]);
            const f = await snap(S.fast.pg), s = await snap(S.slow.pg), so = await snap(S.slowOn.pg), n = await snap(S.none.pg), o = await snap(S.off.pg);
            ok("!! *** a fast GPU under auto is TIMED, KEPT and REMEMBERED: the frame was requested, the median is the stand-in's 8.33 ms, the tier is sea and the frame is still loaded ***",
                fastDone && f.phase === "sea" && f.tier === "sea" && f.loaded === true && Math.abs(f.probeMs - 8.33) < 0.01 && S.fast.frameRequests.length === 1 && f.kind === "discrete" && /web-ocean\/ocean\.html\?ui=1/.test(f.src || ""), JSON.stringify({ phase: f.phase, ms: f.probeMs, requests: S.fast.frameRequests.length, kind: f.kind }));
            ok("!! *** a slow GPU under auto is TIMED and UNLOADED: the median is the GPU clock's 228.04 ms, the tier is default, the frame is blank and the reason names the reading ***",
                slowDone && s.phase === "default" && s.tier === "default" && s.loaded === false && Math.abs(s.probeMs - 228.04) < 0.01 && /about:blank/.test(s.src || "") && s.fallback === "block" && /228\.0 ms/.test(s.reason) && /ocean-default\.html/.test(s.fallbackText), JSON.stringify({ phase: s.phase, ms: s.probeMs, src: s.src, fallback: s.fallback }));
            ok("!! *** the same slow GPU under ON keeps the sea, as asked, and the banner says how slow ***", slowOnProbed && so.tier === "sea" && so.loaded === true && so.fallback === "none" && /as asked/.test(so.reason) && /4 fps/.test(so.reason), so.reason);
            ok("!! *** with no WebGPU the sea's frame is never requested and the default water is named ***", n.phase === "default" && n.loaded === false && S.none.frameRequests.length === 0 && /no usable WebGPU/.test(n.reason), n.reason.slice(0, 90));
            ok("!! *** under off the frame is never requested, even on a fast GPU ***", o.phase === "default" && S.off.frameRequests.length === 0 && o.loaded === false && /by choice/.test(o.reason), o.reason);
            ok("  the comparison table is on the page, computed: the heights differ and the page says the seas are not lined up", /wave height\s+differs/.test(f.match) && /longest wavelength\s+differs/.test(f.match) && /NOT lined up/.test(f.match) && /not comparable/.test(f.match), f.match.split("\n")[1] ? f.match.split("\n")[1].slice(0, 120) : "(none)");
            // reload the fast page: the reading is remembered for this adapter, so the sea is shown without a second timing
            const stored = await S.fast.pg.evaluate(() => JSON.parse(localStorage.getItem("swek.ocean.probe") || "null"));
            await S.fast.pg.reload({ waitUntil: "load" });
            const quick = await until(S.fast.pg, () => window.__sea && window.__sea.phase === "sea" && window.__sea.remembered === true, 2500);
            const f2 = await snap(S.fast.pg);
            ok("!! *** a reload on the same adapter does NOT time the sea again: the stored reading is for this adapter, and the sea is shown within 2.5 s (a probe takes 8) ***",
                stored && stored.label === f.kind + "" || (stored && /1080 Ti/.test(stored.label)) ? quick && f2.remembered === true && f2.samples === 0 && Math.abs(f2.probeMs - 8.33) < 0.01 : false, JSON.stringify({ stored: stored && stored.label, quick, samples: f2.samples }));
            // "Time the sea again" forgets the reading and measures again
            await S.fast.pg.click("#retimeBtn");
            const retimed = await until(S.fast.pg, () => window.__sea && window.__sea.remembered === false && window.__sea.samples.length > 0, 12000);
            ok("  the Time-the-sea-again button forgets the stored reading and measures again", retimed, "");
            const mDone = await settled(S.mute.pg, 40000);
            const m = await snap(S.mute.pg);
            ok("!! *** a sea that prints nothing is GIVEN UP ON, not waited for forever: the default water, with a reason that says it was never shown to hold the budget ***", mDone && m.phase === "default" && m.loaded === false && /no readable frame time/.test(m.fallbackText) && /never shown to hold the budget/.test(m.fallbackText) && m.error !== "", JSON.stringify({ phase: m.phase, error: m.error }));
            const errs = Object.entries(S).flatMap(([k, v]) => v.errs.map((e) => k + ": " + e));
            ok("!! the page made no script error and no console error in any scenario", errs.length === 0, errs.join(" | ").slice(0, 240));
            for (const v of Object.values(S)) await v.ctx.close();
        } finally { await b.close(); server.close(); }
    }
}

report("UNCHECKED, said plainly: the REAL sea on a real GPU (the frame here is a stand-in that prints the sea's HUD format; the rig's reading is slice 5); that the real bundle's HUD line is the one the stand-in prints (ui/oceanSea-selfcheck reads the format from the bundle's text); the page in a browser that has WebGPU but refuses the bundle's device request.");
console.log("oceanSeaPage-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
