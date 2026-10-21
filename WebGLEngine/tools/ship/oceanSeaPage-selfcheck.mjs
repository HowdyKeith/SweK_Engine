// WebGLEngine/tools/ship/oceanSeaPage-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/oceanSeaPage-selfcheck.mjs      (~30 s with a browser; section 1 alone ~0.1 s)
//
// THE OPT-IN SEA PAGE, HELD TO WHAT IT SAYS. ocean-sea.html puts the vendored web-ocean sea in a frame behind the tier switch (ui/oceanTier.mjs) and keeps it only if a
// reading of the sea's own HUD says it holds the frame budget. The pure half is graded in ui/oceanSea-selfcheck.mjs; this gate grades the PAGE.
//   1  THE PAGE'S SOURCE   it imports the tier and sea modules and the physics surface; never turns data into markup; every reading reaches the DOM through textContent; loads
//                          nothing from outside; builds the sea's URL only through seaUrl(); carries the origin notice and the demo: meta tags; says what it is NOT
//   2  THE LIVE PAGE       (needs a browser; SKIPPED, and said, without one) EIGHT SCENARIOS IN PARALLEL (the seventh, v4895, has the sea's real panel code in its stand-in and checks the live retune; the eighth stands in for the PATCHED host's seaApi and checks the realized-height readout), each with navigator.gpu stood in and the sea's frame replaced by a stand-in page
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
//   P9 (v4895) the page never retunes live, always reloads 2 (the live-tune rows) |
//   P10 (v4895) the patched source never loads the host (always the bundle) 2 | (log: measured with the seventh and eighth scenarios)
//   P6 no-WebGPU claims WebGPU 1 | P7 the page reaches into the frame (contentWindow) 1 | P8 a frame time compared to a number of the page's own 1 (that mutation was also a syntax error, so it
//   proves less than the others: the source row that reads for it was exercised only in company)
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { declaredDefaults } from "../../ui/oceanSea.mjs";
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
    ok("!! the sea is loaded ONLY through seaUrl() or hostUrl() (which is seaUrl on the host page): the page spells no path to the bundle and no query string of its own", /state\.seaSrc = \(srcSel\.value === "patched" \? SF\.hostUrl : OS\.seaUrl\)\(/.test(js) && /sea\.src = state\.seaSrc/.test(js) && !/vendor\/web-ocean/.test(js) && !/["'`][^"'`]*\?[a-z]+=/.test(js.replace(/\$\{[^}]*\}/g, "")));
    ok("!! the page never edits the bundle: no srcdoc, no eval, no postMessage into the frame, the frame's HUD is only READ, and the one thing reached in the PATCHED host is its published handle (contentWindow.seaApi, nothing else of contentWindow)", !/srcdoc|\.eval\(|postMessage/.test(js) && /contentDocument/.test(js) && (js.match(/contentWindow/g) || []).length === 2 && (js.match(/contentWindow && sea\.contentWindow\.seaApi/g) || []).length === 1);
    const hits = ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function", "setAttribute(\"on", "srcdoc"].filter((w) => body.includes(w));
    ok("!! the page NEVER turns data into markup", hits.length === 0, hits.join(", "));
    ok("!! every status line and reading reaches the DOM through textContent (banner, fallback, comparison, adapter chip)", /banner\.textContent\s*=/.test(js) && /fallback\.textContent\s*=/.test(js) && /\$\("match"\)\.textContent\s*=/.test(js) && /\$\("gpuWord"\)\.textContent\s*=/.test(js));
    const ext = [...body.matchAll(/(?:src|href|action)\s*=\s*"(https?:\/\/[^"]+)"|fetch\(\s*"(https?:\/\/[^"]+)"|url\(\s*"?(https?:\/\/[^")]+)|import\s+[^;]*"(https?:\/\/[^"]+)"/g)].filter((m) => !/github\.com\/noniv/.test(m[0]));
    ok("!! the page loads NOTHING from outside (the attribution is text, not a request)", ext.length === 0, ext.map((m) => m[0]).join(" | "));
    ok("the page carries the origin notice, the demo: meta tags, a <title>, and links to the default water and server.html", /ui\/originNotice\.js/.test(raw) && /name="demo:title"/.test(raw) && /name="demo:desc"/.test(raw) && /name="demo:category"/.test(raw) && /<title>/.test(raw) && /href="\/ocean-default\.html"/.test(raw) && /href="\/server\.html"/.test(raw));
    ok("!! the page SAYS what it is not: not the physics surface (and that v4890 said the opposite wrongly), not read by physics, not depth-composited, not seen to render here", /NOT THE PHYSICS SURFACE/.test(flat) && /v4890 and v4894 said the opposite and were WRONG/.test(flat) && /NOT READ BY ANY PHYSICS/.test(flat) && /NOT DEPTH-COMPOSITED/.test(flat) && /NOT SEEN TO RENDER WHERE IT WAS BUILT/.test(flat));
    ok("!! *** the page does not repeat the v4890 claim that was WRONG: nowhere does it say the sea cannot be tuned, cannot be set, or is out of reach in a module scope ***", !/cannot be tuned|cannot be set|NOT lined up|module scope|inside their module|no page can reach/i.test(noComments(raw).replace(/\s+/g, " ").replace(/v4890 and v4894 said the opposite and were WRONG[^.]*\./, "")), "the one allowed mention is the correction itself");
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
        // v4895: with `withPanel` the stand-in also carries UPSTREAM'S OWN panel-building block, cut out of the bundle's text and unmodified, over a P block holding the bundle's declared defaults,
        // so the page's live path (ui/oceanLiveTune.mjs) meets the sea's real listeners; window.__P and window.__flags() show what they did
        const bundleText = fs.readFileSync(path.join(ENG, "vendor/web-ocean/ocean.html"), "utf8");
        const pa = bundleText.indexOf("const panel = document.getElementById('panel');"), pEnd = "panel.appendChild(row);\n  }", pb = bundleText.indexOf(pEnd, pa);
        const panelBlock = pa > 0 && pb > pa ? bundleText.slice(pa, pb + pEnd.length) : "", pDefaults = Object.fromEntries(Object.entries(declaredDefaults(bundleText)).map(([k, v]) => [k, v.value]));
        const panelScript = (withPanel) => !withPanel ? "" : `<div id="panel" class="hidden"></div><script>const P = ${JSON.stringify(pDefaults)}; let needSpectrum = false, needLUT = false, envFull = 0; window.__P = P; window.__flags = () => ({ needSpectrum, needLUT, envFull });\n${panelBlock}</script>`;
        const standIn = (line, withPanel = false) => `<!doctype html><meta charset="utf-8"><div id="fps">${line === null ? "" : "starting"}</div><script>${line === null ? "" : `setInterval(() => { document.getElementById("fps").textContent = ${JSON.stringify(line)}; }, 100);`}</script>${panelScript(withPanel)}`;
        const GPUS = {
            fast: { info: { vendor: "nvidia", architecture: "pascal", description: "NVIDIA GeForce GTX 1080" }, line: "120 fps  8.33 ms  |  GPU 6.00 ms  |  3000 nodes  640x360" },
            slow: { info: { vendor: "intel", architecture: "gen-9", description: "Intel(R) UHD Graphics 620" }, line: "10 fps  100.00 ms  |  GPU 228.04 ms  |  3000 nodes  1653x493" },
            mute: { info: { vendor: "nvidia", architecture: "pascal", description: "NVIDIA GeForce GTX 1080" }, line: null },
        };
        async function scenario({ gpu, pref, noWebgpu = false, panel = false }) {
            const ctx = await b.newContext({ viewport: { width: 1100, height: 760 } });
            const cfg = gpu ? GPUS[gpu] : null;
            if (!noWebgpu && cfg) await ctx.addInitScript((info) => { Object.defineProperty(navigator, "gpu", { configurable: true, value: { requestAdapter: async () => ({ info, isFallbackAdapter: false, features: new Set() }) } }); }, cfg.info);
            if (pref) await ctx.addInitScript((p) => { try { localStorage.setItem("swek.ocean.tier", p); } catch {} }, pref);
            const frameRequests = [];
            await ctx.route("**/sea-host.html*", (route) => {
                // the PATCHED host: a stand-in that publishes a seaApi like the real one (ready, setPoints, a heights array refilled every 150 ms from a fixed pattern of sigma 0.6) and prints the HUD line
                if (!route.request().isNavigationRequest()) return route.continue();
                frameRequests.push(route.request().url());
                return route.fulfill({ status: 200, contentType: "text/html", body: standIn(cfg ? cfg.line : "1 fps  1000.00 ms", true) + `<script>
                    window.seaApi = { ready: true, count: 0, points: new Float32Array(128), heights: new Float32Array(64), heightFrame: -1, setPoints(a) { this.count = Math.min(64, a.length / 2); this.set = Array.from(a); return this.count; } };
                    let f = 0; setInterval(() => { f += 8; for (let i = 0; i < 64; i++) window.seaApi.heights[i] = 0.6 * ((i % 2 ? 1 : -1) * (1 + (i % 5) * 0.1) * Math.cos(f * 0.37 + i)); window.seaApi.heightFrame = f; }, 150);
                </script>` });
            });
            await ctx.route("**/vendor/web-ocean/ocean.html*", (route) => {
                // the frame is a NAVIGATION; the page's own fetch of the bundle's text (for the declared defaults) is not, and gets the real file
                if (route.request().isNavigationRequest()) { frameRequests.push(route.request().url()); return route.fulfill({ status: 200, contentType: "text/html", body: standIn(cfg ? cfg.line : "1 fps  1000.00 ms", panel) }); }
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
                live: scenario({ gpu: "fast", pref: "auto", panel: true }),
                patched: scenario({ gpu: "fast", pref: "on", panel: true }),
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
            ok("  the comparison table is on the page, computed, at the sea's DEFAULTS: the swell height matches, the swell wavelength differs, the total is not comparable, and the page offers 'matched'", /swell height\s+matches/.test(f.match) && /swell wavelength\s+differs/.test(f.match) && /total height\s+not comparable/.test(f.match) && /choose 'matched'/.test(f.match) && !/NOT lined up|cannot be set/.test(f.match), f.match.split("\n")[1] ? f.match.split("\n")[1].slice(0, 120) : "(none)");
            // reload the fast page: the reading is remembered for this adapter, so the sea is shown without a second timing
            const stored = await S.fast.pg.evaluate(() => JSON.parse(localStorage.getItem("swek.ocean.probe") || "null"));
            await S.fast.pg.reload({ waitUntil: "load" });
            const quick = await until(S.fast.pg, () => window.__sea && window.__sea.phase === "sea" && window.__sea.remembered === true, 2500);
            const f2 = await snap(S.fast.pg);
            ok("!! *** a reload on the same adapter does NOT time the sea again: the stored reading is for this adapter, and the sea is shown within 2.5 s (a probe takes 8) ***",
                stored && stored.label === f.kind + "" || (stored && /1080/.test(stored.label)) ? quick && f2.remembered === true && f2.samples === 0 && Math.abs(f2.probeMs - 8.33) < 0.01 : false, JSON.stringify({ stored: stored && stored.label, quick, samples: f2.samples }));
            // "Time the sea again" forgets the reading and measures again
            await S.fast.pg.click("#retimeBtn");
            const retimed = await until(S.fast.pg, () => window.__sea && window.__sea.remembered === false && window.__sea.samples.length > 0, 12000);
            ok("  the Time-the-sea-again button forgets the stored reading and measures again", retimed, "");
            {   // the correction: 'matched' puts the sea's own tunables on the frame's URL, two of them, and the table follows
                const before = await snap(S.fast.pg);
                await S.fast.pg.selectOption("#setSel", "matched");
                await until(S.fast.pg, () => /swellHs=/.test(window.__sea.seaSrc || ""), 8000);
                const mt = await S.fast.pg.evaluate(() => ({ src: window.__sea.seaSrc, match: document.getElementById("match").textContent, settings: window.__sea.settings }));
                ok("!! *** THE CORRECTION, LIVE: choosing 'matched' loads the sea with its swell height and length set from slice 1's longest wave (swellHs=1.99, swellLength=60) and NOTHING else of the sea's tunables ***",
                    before.src && !/swellHs|swellLength|windSpeed/.test(before.src) && /\?ui=1&swellHs=1\.99&swellLength=60$/.test(mt.src) && !/windSpeed|windDir|choppy|swellDir/.test(mt.src) && mt.settings === "matched", mt.src);
                ok("  and the table follows: both swell rows read matches and now come from the URL, the report names the two inputs and lists what was not matched, and says the realized height has not been measured",
                    /swell height\s+matches/.test(mt.match) && /swell wavelength\s+matches/.test(mt.match) && /\(url\)/.test(mt.match) && /swellHs=1\.99, swellLength=60 -- two inputs, nothing else/.test(mt.match) && /NOT matched: windSpeed/.test(mt.match) && /realized height has not been measured/.test(mt.match), mt.match.split("\n").slice(-2)[0].slice(0, 100));
                await S.fast.pg.selectOption("#setSel", "defaults");
                await until(S.fast.pg, () => !/swellHs/.test(window.__sea.seaSrc || "") && window.__sea.settings === "defaults", 8000);
                const back = await S.fast.pg.evaluate(() => window.__sea.seaSrc);
                ok("  and choosing the defaults again takes the tunables off the URL", !/swellHs|swellLength/.test(back), back);
            }
            {   // v4895 step 1: a sea that already has its panel is retuned through the panel's own sliders -- no new frame request, no reload, the frame's P changes
                const lv = S.live, ready = await settled(lv.pg, 30000), nReq = lv.frameRequests.length, srcBefore = await lv.pg.evaluate(() => document.getElementById("sea").getAttribute("src"));
                await lv.pg.selectOption("#setSel", "matched");
                await until(lv.pg, () => window.__sea.live && window.__sea.live.applied.length === 2, 8000);
                const fr = () => lv.pg.evaluate(() => { const w = document.getElementById("sea").contentWindow; return { P: { swellHs: w.__P.swellHs, swellLength: w.__P.swellLength, windSpeed: w.__P.windSpeed }, flags: w.__flags(), src: document.getElementById("sea").getAttribute("src"), live: window.__sea.live, match: document.getElementById("match").textContent }; });
                const a = await fr();
                ok("!! *** LIVE TUNE: with the sea already running and its panel built, choosing 'matched' retunes it through the sea's own sliders -- NO new frame request, the frame's src unchanged, P.swellHs 2 (1.99 snapped to the 0.05 step) and P.swellLength 60, needSpectrum raised ***",
                    ready && lv.frameRequests.length === nReq && a.src === srcBefore && a.P.swellHs === 2 && a.P.swellLength === 60 && a.P.windSpeed === 7 && a.flags.needSpectrum === true && a.live.applied.join() === "swellHs,swellLength" && a.live.missing.length === 0, JSON.stringify({ req: lv.frameRequests.length, P: a.P, flags: a.flags }));
                ok("  and the page says what it did: 'applied live', that nothing was reloaded or re-timed, and the snapped value", /applied live/.test(a.match) && /not re-timed/.test(a.match) && /snapped to the slider's step/.test(a.match), a.match.split("\n").slice(-3).join(" | ").slice(0, 200));
                await lv.pg.selectOption("#setSel", "defaults");
                await until(lv.pg, () => window.__sea.settings === "defaults" && document.getElementById("sea").contentWindow.__P.swellHs === 1.8, 8000);
                const d = await fr();
                ok("  and choosing the defaults sets the sea's own declared values back (swellHs 1.8, swellLength 120) the same way, still with no reload", d.P.swellHs === 1.8 && d.P.swellLength === 120 && lv.frameRequests.length === nReq, JSON.stringify(d.P));
            }
            {   // v4895 step 3: the patched source -- the page loads sea-host.html, gives the sea 64 points, collects the heights it reads back and prints the sea's realized Hs
                const pp = S.patched.pg;
                await until(pp, () => window.__sea && window.__sea.loaded === true, 10000);
                await pp.selectOption("#srcSel", "patched");
                const got = await until(pp, () => window.__sea && window.__sea.realized, 20000);
                const rz = await pp.evaluate(() => ({ src: window.__sea.seaSrc, realized: window.__sea.realized, text: document.getElementById("realized").textContent, set: document.getElementById("sea").contentWindow.seaApi.set && document.getElementById("sea").contentWindow.seaApi.set.length, req: 0 }));
                ok("!! *** THE PATCHED SOURCE: choosing it loads sea-host.html (not the bundle), hands the sea 64 world points (128 numbers), and prints the sea's REALIZED significant height, computed from the heights the sea reports ***",
                    got && /^\/sea-host\.html\?/.test(rz.src) && rz.set === 128 && rz.realized && rz.realized.points === 64 && rz.realized.sigma > 0.3 && rz.realized.sigma < 0.9 && Math.abs(rz.realized.hs - 4 * rz.realized.sigma) < 1e-9 && /Hs \(4 sigma\)/.test(rz.text), JSON.stringify({ src: rz.src, sigma: rz.realized && rz.realized.sigma, set: rz.set }));
                ok("  and it says the physics surface is a different sea (the first figure of the GPU sea's own height exists; no agreement is claimed)", /a different sea/.test(rz.text) && /physics surface's total Hs/.test(rz.text));
            }
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
