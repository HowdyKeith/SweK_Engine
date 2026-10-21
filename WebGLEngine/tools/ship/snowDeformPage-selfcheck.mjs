// WebGLEngine/tools/ship/snowDeformPage-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). (~15 s with a browser; section 1 alone ~0.1 s)
//
// Run: node tools/ship/snowDeformPage-selfcheck.mjs
//
// snow-deform.html, THE FOUR LIFTED PIECES MEETING, HELD TO WHAT IT SAYS (each piece is graded in its own render/*-selfcheck.mjs; this gate grades the PAGE):
//   1  THE SOURCE   it imports the field, the read side, the clipmap and the sky bake; never turns data into markup; loads nothing from outside; carries the origin of its lift, the demo: meta tags, and says
//                   what it is NOT (no snow shading, no PCSS/TAA wired, CPU placement);
//   2  THE LIVE PAGE (needs a browser; SKIPPED, and said, without one) in headless Chromium's software WebGL: no script or console error; the canvas is lit; the walker's feet become brushes (footprints counted);
//                   the terrain READS the field (the deepest displacement at a vertex is a trail depth, centimetres); a click-stamp lowers the height at that spot by about its depth and the stamp heals only
//                   slowly (over seconds, 90% of it remains: the banked-time rule at work); the sky is baked once, and moving the sun re-bakes it exactly once and changes the average sky; the sun's direction is the
//                   brightest part of the baked sky and the opposite horizon is darker (the sky is the right way round in three's convention).
// NOT GRADED, said plainly: that it looks like snow, a real GPU, any timing.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL, webglLaunchArgs } from "./playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);
const raw = fs.readFileSync(path.join(ENG, "snow-deform.html"), "utf8"), flat = raw.replace(/\s+/g, " "), js = raw.slice(raw.indexOf('<script type="module">'));

console.log("snowDeformPage-selfcheck -- snow-deform.html\n");
console.log("1. THE SOURCE");
{
    ok("!! the page imports the four lifted pieces (field, read side, clipmap, sky bake) and builds the clipmap, the field and the sky only through them", ["/render/toroidalDeform.mjs", "/render/deformRead.mjs", "/render/clipmapTerrain.mjs", "/render/skyBake.mjs"].every((m) => js.includes('"' + m + '"')) && /new DeformField\(/.test(js) && /buildClipmap\(/.test(js) && /deformHeight\(field\.state/.test(js) && /bakeSkyThree\(/.test(js));
    const body = js.replace(/\/\/[^\n]*/g, "");
    const bad = ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function", "srcdoc"].filter((w) => body.includes(w));
    ok("!! nothing is turned into markup: no innerHTML, outerHTML, insertAdjacentHTML, document.write, eval, new Function or srcdoc; every status line goes in with textContent", bad.length === 0 && /textContent/.test(js), bad.join(", "));
    const ext = [...raw.matchAll(/(?:src|href)=["'](https?:)?\/\/[^"']+["']|import\s*\(\s*["']https?:|from\s+["']https?:/g)].filter((m) => !/github\.com|noniv/i.test(m[0]));
    ok("!! the page loads nothing from outside the engine's own origin", ext.length === 0, ext.map((m) => m[0]).join(" | "));
    ok("  it carries the demo: meta tags and a link back to the server page, credits the lift (Noniv/snowflow_demo, MIT, vendor/snowflow), and says what it is NOT", /name="demo:title"/.test(raw) && /name="demo:desc"/.test(raw) && /name="demo:category"/.test(raw) && /href="\/server\.html"/.test(raw) && /Noniv\/snowflow_demo/.test(raw) && flat.includes("NOT THE DEMO IT IS LIFTED FROM") && flat.includes("NOT FAST") && flat.includes("NOT SEEN ON A REAL GPU"));
    ok("  the clipmap's winding is flipped for a right-handed scene, as render/clipmapTerrain-selfcheck.mjs found it must be", /idx\[t \+ 1\] = idx\[t \+ 2\]/.test(js));
}

console.log("\n2. THE LIVE PAGE");
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) { report("live half SKIPPED -- " + skip); report("*** THAT IS A SKIP AND NOT A PASS: section 1 reads source, and source cannot show the pieces meet"); }
    else {
        const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".css": "text/css" };
        const server = http.createServer((req, res) => {
            const u = decodeURIComponent(req.url.split("?")[0]), fp = path.join(ENG, u);
            if (fp.startsWith(ENG) && fs.existsSync(fp) && fs.statSync(fp).isFile()) { res.writeHead(200, { "Content-Type": types[path.extname(fp)] || "text/plain" }); return res.end(fs.readFileSync(fp)); }
            res.writeHead(404); res.end("not found");
        });
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        const base = "http://127.0.0.1:" + server.address().port;
        const br = await chromium.launch({ executablePath: HEADLESS_SHELL, args: webglLaunchArgs().args });
        try {
            const pg = await (await br.newContext({ viewport: { width: 640, height: 400 } })).newPage(); const errs = [];
            pg.on("pageerror", (e) => errs.push(String(e.message))); pg.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
            await pg.goto(base + "/snow-deform.html", { waitUntil: "load" });
            const until = (fn, ms) => pg.waitForFunction(fn, null, { timeout: ms }).then(() => true, () => false);
            const started = await until(() => window.__snow && window.__snow.ready && window.__snow.frames >= 5, 30000);
            const walking = await until(() => window.__snow.footprints >= 5, 40000);
            const s1 = await pg.evaluate(() => ({ frames: window.__snow.frames, footprints: window.__snow.footprints, deformMax: window.__snow.deformMax, bakes: window.__snow.bakes, verts: window.__snow.vertices, tris: window.__snow.triangles, error: window.__snow.error }));
            ok("!! the page starts, the walker's feet become brushes (" + s1.footprints + " footprints in " + s1.frames + " frames) and the terrain reads the field: the deepest displacement at a vertex is " + (s1.deformMax * 100).toFixed(1) + " cm", started && walking && s1.footprints >= 5 && s1.deformMax > 0.005 && s1.deformMax < 0.6 && !s1.error, JSON.stringify({ verts: s1.verts, tris: s1.tris }));
            const shot = (await pg.screenshot()).toString("base64");
            const lit = await pg.evaluate(async (b64) => { const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode(); const t = document.createElement("canvas"); t.width = 64; t.height = 40; const g = t.getContext("2d"); g.drawImage(im, 0, 0, 64, 40); const d = g.getImageData(0, 0, 64, 40).data; let n = 0; const seen = new Set(); for (let i = 0; i < d.length; i += 4) { if (d[i] + d[i + 1] + d[i + 2] > 60) n++; seen.add((d[i] >> 4) + "," + (d[i + 1] >> 4) + "," + (d[i + 2] >> 4)); } return { n, colours: seen.size }; }, shot);
            ok("!! the canvas is lit and not flat (" + lit.n + " of 2560 sampled pixels bright, " + lit.colours + " distinct colours): terrain under a sky", lit.n > 1200 && lit.colours > 12);
            // a stamp: lowers the height where it lands, and heals slowly
            const st = await pg.evaluate(async () => {
                const S = window.__snow, w = S.walker, x = w.x + 1.4, z = w.z + 0.2; const before = S.heightAt(x, z), base = S.baseAt(x, z); const ok = S.stamp(x, z, 0.8);
                const f0 = S.frames; await new Promise((r) => { const t = setInterval(() => { if (S.frames >= f0 + 3) { clearInterval(t); r(); } }, 50); });
                const d0 = S.baseAt(x, z) - S.heightAt(x, z) < 0 ? 0 : S.baseAt(x, z) - S.heightAt(x, z);
                const dep0 = base - S.heightAt(x, z);
                await new Promise((r) => setTimeout(r, 2500));
                const dep1 = S.baseAt(x, z) - S.heightAt(x, z);
                return { ok, before, base, dep0, dep1, stamps: S.stamps };
            });
            ok("!! a click-stamp lowers the surface where it lands (" + (st.dep0 * 100).toFixed(1) + " cm of a 20 cm brush, after the 3x3 band-limiting read) and 2.5 s later " + (100 * st.dep1 / st.dep0).toFixed(0) + "% of it remains: the trail heals slowly, as the banked-time rule intends", st.ok && st.stamps === 1 && st.dep0 > 0.04 && st.dep1 > 0.9 * st.dep0 - 0.003 && st.dep1 <= st.dep0 + 1e-6, JSON.stringify({ dep0: st.dep0, dep1: st.dep1 }));
            // the sky: baked once, re-baked once when the sun moves; the sun is the brightest part, the far horizon darker
            const sky0 = await pg.evaluate(() => { const S = window.__snow, sd = S.sunDir; const lum = (p) => 0.3 * p[0] + 0.42 * p[1] + 0.28 * p[2]; const at = (d) => lum(S.skyAt(d)); return { bakes: S.bakes, elev: S.sunElev, toward: at([sd[0], sd[1] * 0.3 + 0.05, sd[2]]), away: at([-sd[0], 0.05, -sd[2]]), zenith: S.skyAt([0, 1, 0]), avg: S.skyAverage }; });
            await pg.evaluate(() => { const el = document.getElementById("sun"); el.value = "40"; el.dispatchEvent(new Event("input")); });
            await until(() => window.__snow.bakes === 2, 5000);
            const sky1 = await pg.evaluate(() => ({ bakes: window.__snow.bakes, elev: window.__snow.sunElev, avg: window.__snow.skyAverage }));
            ok("!! the sky is baked once at load and moving the sun re-bakes it exactly once (" + sky0.bakes + " -> " + sky1.bakes + " bakes, sun " + sky0.elev + " -> " + sky1.elev + " degrees), and the average sky changes", sky0.bakes === 1 && sky1.bakes === 2 && sky1.elev === 40 && Math.abs(sky1.avg[0] - sky0.avg[0]) + Math.abs(sky1.avg[1] - sky0.avg[1]) > 1e-3);
            ok("!! the sky is the right way round in three's convention: the baked texel toward the sun (luminance " + sky0.toward.toFixed(0) + ") is brighter than the opposite horizon (" + sky0.away.toFixed(0) + "), and the zenith is blue (b " + sky0.zenith[2] + " > r " + sky0.zenith[0] + ")", sky0.toward > sky0.away + 20 && sky0.zenith[2] > sky0.zenith[0]);
            ok("  no script or console error in the whole run", errs.length === 0, errs.join(" | ").slice(0, 300));
        } finally { await br.close(); server.close(); }
    }
}

console.log(`\nsnowDeformPage-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
