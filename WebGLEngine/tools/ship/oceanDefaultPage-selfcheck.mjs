// WebGLEngine/tools/ship/oceanDefaultPage-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/oceanDefaultPage-selfcheck.mjs      (~6 s with a browser; sections 1 alone ~0.1 s)
//
// THE DEFAULT-WATER PAGE, HELD TO WHAT IT SAYS. ocean-default.html draws world/oceanWater.mjs's mesh, which is built from physics/ocean/oceanSurface.mjs, with five
// buoys floating on the same surface and a HUD that re-asks the physics about 32 drawn vertices every frame. The mesh and the surface are graded by their own gates
// (world/oceanWater-selfcheck.mjs, physics/ocean/oceanSurface-selfcheck.mjs); this gate grades the PAGE.
//   1  THE PAGE'S SOURCE   it imports both modules and does the wave arithmetic in neither (the sea is the module's, not a second copy in the page); it never turns data into markup
//                          (no innerHTML, outerHTML, insertAdjacentHTML, document.write, eval, new Function, onXXX attributes or srcdoc); every reading reaches the DOM through
//                          textContent; it loads nothing from outside; it carries the demo: meta tags and a link back to server.html; it says what it is NOT (not the opt-in sea, not a
//                          fitted sea state, not lit like the engine, not yet read by anything else); the buffers are sized for the largest detail option
//   2  THE LIVE PAGE       (needs a browser with WebGL2; SKIPPED, and said, without one) the page draws: frames advance, the agreement it prints is a measurement under 1e-4 m, the mesh
//                          has 9,409 vertices and 18,432 triangles at the default detail and 625 at the coarse one, five buoys are drawn, the seed selector changes the sea the HUD names,
//                          Pause really stops the clock and Resume restarts it, the canvas is not one flat colour and its lower part is not its upper part, and the page makes no script or
//                          console error. With WebGL2 taken away it says so, draws nothing and throws nothing.
//
// SABOTAGE LOG -- TWELVE, each applied in place, the gate run with a real browser, the file restored and md5-compared; every one red by name (the number is how many rows went red):
//   S1 a wave term (omega) spelled in the page 1 | S2 the HUD set as innerHTML 1 | S3 an outside <script src> 3 | S4 four buoys instead of five 1 | S5 the vertex buffer sized for 64 cells, not 96 2
//   S6 the pause ignored (the clock always runs) 1 | S7 the seed selector's sea not rebuilt, only its name 0 on the first draft, 1 once the frozen-origin row was added -- THE FIRST GATE PASSED A PAGE WHOSE SEED SELECTOR DID NOTHING
//   S8 the agreement forced to zero 1 | S9 'NOT YET READ BY ANYTHING ELSE' dropped 1 | S10 the water draw call disabled 1 | S11 the no-WebGL2 branch removed (start() called regardless) 1 | S12 the demo:category meta dropped 1
//   (all twelve run on this file; restored md5-identical after each)
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
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");
const raw = read("ocean-default.html");
const sm = /<script type="module">([\s\S]*?)<\/script>/.exec(raw), code = sm ? sm[1] : "";
const noComments = (s) => s.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

console.log("oceanDefaultPage-selfcheck -- the default water, drawn from the physics surface\n");

console.log("1. THE PAGE'S SOURCE");
{
    const body = noComments(raw), js = noComments(code);
    ok("!! the page imports the physics surface and the mesh builder from the engine's own paths", /import \{ defaultSurface \} from "\/physics\/ocean\/oceanSurface\.mjs"/.test(code) && /import \{ buildWater, buoy \} from "\/world\/oceanWater\.mjs"/.test(code)
        && fs.existsSync(path.join(ENG, "physics/ocean/oceanSurface.mjs")) && fs.existsSync(path.join(ENG, "world/oceanWater.mjs")));
    // the page may use sin/cos for its CAMERA; the wave maths must not be in it. A wave term needs omega or a wavenumber, and neither is spelled in the page.
    ok("!! the sea is the module's: the page spells no wavenumber, no dispersion and no Gerstner term of its own (a second copy of the waves is how a picture and a number part)", !/omega|wavelength|Gerstner|\bg\s*\*\s*k|9\.81/.test(js));
    ok("the page asks the physics for every buoy and for the agreement measurement, so the numbers on screen come from the surface and not from the mesh alone", /buoy\(sea, bx, bz, simT\)/.test(js) && /sea\.sample\(/.test(js));
    const hits = ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function", "setAttribute(\"on", "srcdoc"].filter((w) => body.includes(w));
    ok("!! the page NEVER turns data into markup: no innerHTML, outerHTML, insertAdjacentHTML, document.write, eval, new Function, onXXX attributes or srcdoc", hits.length === 0, hits.join(", "));
    ok("!! every status line and reading reaches the DOM through textContent (the HUD, the pause label, the no-WebGL2 note)", /hud\.textContent\s*=/.test(js) && /\$\("pauseBtn"\)\.textContent\s*=/.test(js));
    const ext = [...body.matchAll(/(?:src|href|action)\s*=\s*"(https?:\/\/[^"]+)"|fetch\(\s*"(https?:\/\/[^"]+)"|url\(\s*"?(https?:\/\/[^")]+)|import\s+[^;]*"(https?:\/\/[^"]+)"/g)];
    ok("!! the page loads NOTHING from outside: no http(s) script, stylesheet, image, frame, fetch or import", ext.length === 0, ext.map((m) => m[0]).join(" | "));
    ok("the page has the demo: meta tags (title, desc, category), a <title>, and a link back to server.html", /name="demo:title"/.test(raw) && /name="demo:desc"/.test(raw) && /name="demo:category"/.test(raw) && /<title>[^<]+<\/title>/.test(raw) && /href="\/server\.html"/.test(raw));
    ok("!! the page SAYS what it is not: not the opt-in sea, not a fitted sea state, not lit like the engine, not yet read by anything else", /NOT THE OPT-IN SEA/.test(raw) && /NOT A FITTED SEA STATE/.test(raw) && /NOT LIT LIKE THE ENGINE/.test(raw) && /NOT YET READ BY ANYTHING ELSE/.test(raw));
    const opts = [...raw.matchAll(/id="detailSel">([\s\S]*?)<\/select>/g)].flatMap((m) => [...m[1].matchAll(/<option value="(\d+)"/g)].map((x) => +x[1]));
    ok("the detail selector offers 24, 48 and 96 cells", opts.join(",") === "24,48,96", opts.join(","));
    const maxN = Math.max(...opts), maxV = (/const MAXV = (\d+) \* (\d+)/.exec(code) || []).slice(1).map(Number);
    ok("!! the vertex and index buffers are sized for the LARGEST detail option, so a fine mesh cannot overrun them (bufferSubData past the end is a GL error, silently)", maxV.length === 2 && maxV[0] === maxN + 1 && maxV[1] === maxN + 1 && /96 \* 96 \* 6 \* 4/.test(code), `MAXV ${maxV.join(" x ")} for ${maxN} cells`);
    ok("the page imports the tier switch and names the storage it uses only through it", /import \* as OT from "\/ui\/oceanTier\.mjs"/.test(raw) && !/localStorage\.(get|set)Item\(\s*["']swek\.ocean/.test(raw), "ui/oceanTier.mjs");
    ok("the credit line says the agreement is a measurement and not a caption", /The agreement line is a measurement/.test(raw));
}

console.log("\n2. THE LIVE PAGE");
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) {
        report("live half SKIPPED -- " + skip);
        report("*** THAT IS A SKIP AND NOT A PASS: section 1 reads source, and source cannot show that the page draws, agrees with the physics, pauses or survives having no WebGL2");
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
        try {
            {   // A. the page as it comes, in a browser with WebGL2
                const ctx = await b.newContext({ viewport: { width: 1100, height: 760 } });
                const pg = await ctx.newPage(); const errs = [];
                pg.on("pageerror", (e) => errs.push(String(e.message))); pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
                await pg.goto(base + "/ocean-default.html", { waitUntil: "load" });
                await pg.waitForFunction(() => window.__ocean && window.__ocean.frames >= 5, null, { timeout: 25000 }).catch(() => {});
                const st = await pg.evaluate(() => ({ ...window.__ocean }));
                ok("!! the page DRAWS: frames advance (at least 5 within the wait) with no shader error", st.frames >= 5 && st.error === "", `frames ${st.frames}, error ${JSON.stringify(st.error)}`);
                ok("!! the agreement the HUD prints is a measurement under 1e-4 m (float32 rounding of a drawn vertex against the physics surface asked again)", typeof st.agreement === "number" && st.agreement < 1e-4, `${st.agreement}`);
                ok("the default mesh is 9,409 vertices and 18,432 triangles, with five buoys", st.vertices === 9409 && st.triangles === 18432 && st.buoys === 5, `${st.vertices} / ${st.triangles} / ${st.buoys}`);
                const hud1 = await pg.textContent("#hud");
                ok("the HUD names the vertex count, the agreement and the seed, as text", /9409 vertices/.test(hud1) && /largest height gap [0-9.]+e-\d+ m/.test(hud1) && /seed 1, 6 waves, steepness 0\.60/.test(hud1), hud1.replace(/\n/g, " | ").slice(0, 200));
                // pixels: the WebGL canvas drawn onto a 2D canvas INSIDE a frame, while its drawing buffer is still valid
                const px = await pg.evaluate(() => new Promise((res) => requestAnimationFrame(() => {
                    const c = document.getElementById("cv"), t = document.createElement("canvas"); t.width = 96; t.height = 64; const x = t.getContext("2d");
                    x.drawImage(c, 0, 0, 96, 64); const d = x.getImageData(0, 0, 96, 64).data, seen = new Set(); let top = [0, 0, 0], bot = [0, 0, 0], nt = 0, nb = 0;
                    for (let i = 0; i < d.length; i += 4) { seen.add((d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | (d[i + 2] >> 3)); const row = Math.floor(i / 4 / 96); if (row < 20) { top[0] += d[i]; top[1] += d[i + 1]; top[2] += d[i + 2]; nt++; } else if (row >= 44) { bot[0] += d[i]; bot[1] += d[i + 1]; bot[2] += d[i + 2]; nb++; } }
                    res({ colours: seen.size, top: top.map((v) => v / nt), bot: bot.map((v) => v / nb) });
                })));
                const gap = Math.hypot(px.top[0] - px.bot[0], px.top[1] - px.bot[1], px.top[2] - px.bot[2]);
                ok("!! the canvas is a picture, not one flat colour: many distinct colours, and the sky above is not the water below", px.colours > 60 && gap > 25, `${px.colours} distinct colours (5 bits per channel), top/bottom mean colours ${gap.toFixed(0)} apart`);
                await pg.selectOption("#detailSel", "24");
                await pg.waitForFunction(() => window.__ocean.vertices === 625, null, { timeout: 8000 }).catch(() => {});
                const coarse = await pg.evaluate(() => ({ v: window.__ocean.vertices, t: window.__ocean.triangles }));
                ok("!! choosing the coarse detail rebuilds the mesh at 625 vertices and 1,152 triangles", coarse.v === 625 && coarse.t === 1152, JSON.stringify(coarse));
                await pg.selectOption("#seedSel", "2");
                await pg.waitForFunction(() => /seed 2,/.test(document.getElementById("hud").textContent), null, { timeout: 8000 }).catch(() => {});
                ok("!! choosing seed 2 changes the sea the HUD names", /seed 2,/.test(await pg.textContent("#hud")), (await pg.textContent("#hud")).split("\n")[2]);
                {   // ...and CHANGES THE SEA, not only its name: frozen at one instant, the height at the origin differs between two seeds
                    await pg.click("#pauseBtn");
                    const settle = async () => { const f = await pg.evaluate(() => window.__ocean.frames); await pg.waitForFunction((n) => window.__ocean.frames >= n + 2, f, { timeout: 8000 }).catch(() => {}); return pg.evaluate(() => window.__ocean.originHeight); };
                    await pg.selectOption("#seedSel", "3"); const h3 = await settle(); await pg.selectOption("#seedSel", "4"); const h4 = await settle(); await pg.selectOption("#seedSel", "3"); const h3b = await settle();
                    ok("!! the seed selector changes the SURFACE: at one frozen instant seeds 3 and 4 put the origin at different heights, and seed 3 again puts it back", typeof h3 === "number" && Math.abs(h3 - h4) > 0.01 && Math.abs(h3 - h3b) < 1e-9, `seed 3 ${h3 && h3.toFixed(4)} m, seed 4 ${h4 && h4.toFixed(4)} m, seed 3 again ${h3b && h3b.toFixed(4)} m`);
                    await pg.click("#pauseBtn");
                }
                const tOf = async () => +(/t = ([0-9.]+) s/.exec(await pg.textContent("#hud")) || [])[1];
                const a1 = await tOf(); await pg.waitForTimeout(700); const a2 = await tOf();
                await pg.click("#pauseBtn"); await pg.waitForTimeout(300); const p1 = await tOf(); await pg.waitForTimeout(700); const p2 = await tOf();
                const label = await pg.textContent("#pauseBtn");
                await pg.click("#pauseBtn"); await pg.waitForTimeout(700); const r2 = await tOf();
                ok("!! the clock runs, Pause stops it (the label says Resume), and Resume restarts it", a2 > a1 && p2 === p1 && label === "Resume" && r2 > p2, `running ${a1} -> ${a2}; paused ${p1} -> ${p2}; resumed -> ${r2}`);
                {   // slice 3: the tier switch is on the page, decided from what the browser reports, remembered, and never claims the sea unmeasured
                    await pg.waitForFunction(() => window.__ocean.tier != null, null, { timeout: 8000 }).catch(() => {});
                    const t0 = await pg.evaluate(() => ({ tier: window.__ocean.tier, sel: document.getElementById("tierSel").value, hud: document.getElementById("hud").textContent }));
                    ok("!! the page decides a tier from the browser's own report, and with no probe it is the default water, never the sea", !!t0.tier && t0.tier.tier === "default" && t0.tier.preference === "auto" && t0.sel === "auto", JSON.stringify(t0.tier).slice(0, 160));
                    ok("  and the HUD prints the tier and its reason as text", /tier: default/.test(t0.hud) && t0.tier && t0.hud.includes(t0.tier.reason.slice(0, 20)), (t0.hud.split("\n").find((l) => /^tier:/.test(l)) || "").slice(0, 100));
                    await pg.selectOption("#tierSel", "on");
                    const kept = await pg.evaluate(() => window.localStorage.getItem("swek.ocean.tier"));
                    await pg.reload({ waitUntil: "load" });
                    await pg.waitForFunction(() => window.__ocean && window.__ocean.tier != null, null, { timeout: 15000 }).catch(() => {});
                    const t1 = await pg.evaluate(() => ({ sel: document.getElementById("tierSel").value, pref: window.__ocean.tier && window.__ocean.tier.preference }));
                    ok("!! choosing a tier is remembered across a reload (localStorage, the shared key), and the decision follows it", kept === "on" && t1.sel === "on" && t1.pref === "on", JSON.stringify({ kept, ...t1 }));
                    await pg.selectOption("#tierSel", "auto");
                }
                ok("!! the page made no script error and no console error through all of that", errs.length === 0, errs.join(" | ").slice(0, 200));
                try { await pg.screenshot({ path: process.env.OCEAN_DEFAULT_SHOT || "/tmp/ocean-default.png" }); } catch {}
                await ctx.close();
            }
            {   // B. WebGL2 taken away: the page says so, draws nothing, throws nothing
                const ctx = await b.newContext({ viewport: { width: 900, height: 600 } });
                await ctx.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (k, ...a) { return k === "webgl2" ? null : g.call(this, k, ...a); }; });
                const pg = await ctx.newPage(); const errs = [];
                pg.on("pageerror", (e) => errs.push(String(e.message))); pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
                await pg.goto(base + "/ocean-default.html", { waitUntil: "load" });
                await pg.waitForTimeout(600);
                const st = await pg.evaluate(() => ({ msg: getComputedStyle(document.getElementById("nogl")).display, hud: document.getElementById("hud").textContent, frames: window.__ocean.frames, error: window.__ocean.error }));
                ok("!! with no WebGL2 the page says so, draws no frame and throws nothing", st.msg === "block" && st.hud === "no WebGL2" && st.frames === 0 && st.error === "no WebGL2" && errs.length === 0, JSON.stringify(st) + " " + errs.join("|").slice(0, 100));
                await ctx.close();
            }
        } finally { await b.close(); server.close(); }
    }
}

report("UNCHECKED, said plainly: that this looks like water to a person (the screenshot is for a human to look at); what it costs on any GPU (the HUD's fps is the rig's to read, slice 5); the opt-in GPU sea (slice 4); and that anything but this page reads the surface yet.");
console.log("oceanDefaultPage-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
