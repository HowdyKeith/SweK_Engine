// WebGLEngine/tools/ship/oceanSpikePage-selfcheck.mjs -- UNNUMBERED (a spike; the version is chosen at ship time)
//
// Run: node tools/ship/oceanSpikePage-selfcheck.mjs      (~3 s with a browser; sections 1-2 alone ~0.1 s)
//
// ocean-spike.html RUNS SOMEONE ELSE'S OCEAN, UNMODIFIED, IN A FRAME. THIS GATE HOLDS THE THREE THINGS THAT MAKE THAT SAFE TO CLAIM:
//   1  THE VENDORED BYTES   vendor/web-ocean/ocean.html is exactly the 102,283 bytes noniv/web-ocean published at commit a07c7fd (sha256 pinned) -- "unmodified" is a claim about bytes, and a hash is the only thing
//                           that can keep it true; the file makes no network request (it contains no http string) and needs navigator.gpu; LICENSE is MIT with the author's name; PROVENANCE.txt names the
//                           repository, the commit and the hash, and says plainly that it was NOT seen to render where it was vendored
//   2  THE PAGE'S SOURCE    the frame's address is the vendored file and it exists; the page never turns data into markup (no innerHTML, outerHTML, insertAdjacentHTML, document.write, eval, new Function,
//                           onXXX attributes or srcdoc); it loads nothing from outside (no http(s) script, style, image, frame or fetch); it carries the demo: meta tags and a link back to server.html; it
//                           checks navigator.gpu BEFORE it sets the frame's address; it says what it is NOT (not depth-composited, not used by physics, not seen to render in the sandbox) and credits the author
//   3  THE LIVE PAGE (needs a browser; SKIPPED, and said, without one)  with NO WebGPU the chip says so, the 'no WebGPU' message is shown and the frame is NOT started (no src); with a STUBBED
//                           adapter the chip says WebGPU and names the adapter as text, the frame's src is the vendored file with ?ui=1, choosing 1280x720 reloads it with &w=1280&h=720, and 'Note reading'
//                           appends one line with the resolution and the frame's own HUD text. The ocean itself is replaced by a one-line stub: THIS GATE DOES NOT RUN THE OCEAN, AND NOTHING IN THIS SANDBOX CAN.
//
// SABOTAGE LOG -- TWELVE, each applied in place, the gate run (with a real browser), the file restored and md5-compared; every one red by name (the number is how many rows went red):
//   S1 one byte appended to the vendored bundle 1 | S2 the frame started without the WebGPU check (if (!gpuOk) -> if (false)) 3 | S3 the adapter's name set as innerHTML 2 | S4 an outside <script src> 3
//   S5 the resolution parameters misspelled 1 | S6 'Note reading' ignoring the resolution 1 | S7 the not-depth-composited statement dropped 1 | S8 the licence losing the author's name 1
//   S9 the provenance losing the hash 1 | S10 the demo:category meta dropped 1 | S11 the log overwritten instead of appended 1 | S12 the frame pointed at a file that does not exist 5
// The first run of this gate passed every row, which is the result the ritual says to distrust; the twelve above are what showed each row can fail.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL, webglLaunchArgs } from "./playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);

const OCEAN_SIZE = 102283;
const OCEAN_SHA256 = "61e4fe5edf10253b0552570b574da7206754c2fb6033e2e6d73845daae4b36e8";
const OCEAN_COMMIT = "a07c7fd522ef0a897601c114f927a49d93d95520";
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");
const raw = read("ocean-spike.html");
const sm = /<script type="module">([\s\S]*?)<\/script>/.exec(raw), code = sm ? sm[1] : "";
const noComments = (s) => s.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

console.log("oceanSpikePage-selfcheck -- someone else's ocean, in a frame, unmodified\n");

console.log("1. THE VENDORED BYTES");
{
    const buf = fs.readFileSync(path.join(ENG, "vendor/web-ocean/ocean.html"));
    const sha = crypto.createHash("sha256").update(buf).digest("hex");
    ok("!! vendor/web-ocean/ocean.html is byte-for-byte upstream's published bundle: " + OCEAN_SIZE + " bytes, sha256 " + OCEAN_SHA256.slice(0, 16) + "...", buf.length === OCEAN_SIZE && sha === OCEAN_SHA256, buf.length + " bytes, " + sha.slice(0, 16) + "...");
    const txt = buf.toString("utf8");
    ok("!! the bundle makes no network request: it contains no http string at all (a vendored page that phones out would be the quiet way this goes wrong)", !/https?:\/\//i.test(txt));
    ok("the bundle says it needs WebGPU (navigator.gpu) and has no fallback, which is why the page checks first", /navigator\.gpu/.test(txt) && /WebGPU is not available/.test(txt));
    const lic = read("vendor/web-ocean/LICENSE");
    ok("!! LICENSE is the MIT licence with the author's name (Maksymilian Dendura) and a year", /MIT License/.test(lic) && /Permission is hereby/.test(lic) && /free of charge/.test(lic) && /Maksymilian Dendura/.test(lic) && /Copyright \(c\) 20\d\d/.test(lic));
    const prov = read("vendor/web-ocean/PROVENANCE.txt");
    ok("!! PROVENANCE.txt names the repository, the commit and the hash, and says it was NOT seen to render where it was vendored", /github\.com\/noniv\/web-ocean/.test(prov) && prov.includes(OCEAN_COMMIT) && prov.includes(OCEAN_SHA256) && /NOT BY RUNNING/.test(prov) && /no WebGPU adapter/.test(prov));
}

console.log("\n2. THE PAGE'S SOURCE");
{
    const body = noComments(raw);
    const frameSrc = (/const SEA = "([^"]+)"/.exec(code) || [])[1] || "";
    ok("!! the frame's address is the vendored bundle and the file exists: " + frameSrc, frameSrc === "/vendor/web-ocean/ocean.html" && fs.existsSync(path.join(ENG, frameSrc.slice(1))));
    const hits = ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function", "setAttribute(\"on", "srcdoc"].filter((w) => body.includes(w));
    ok("!! the page NEVER turns data into markup: no innerHTML, outerHTML, insertAdjacentHTML, document.write, eval, new Function, onXXX attributes or srcdoc anywhere in it", hits.length === 0, hits.join(", "));
    ok("!! every status line and reading reaches the DOM through textContent (the chip, the adapter name and the log)", /word\.textContent\s*=/.test(code) && /detail\.textContent\s*=/.test(code) && /logEl\.textContent\s*\+?=/.test(code));
    const ext = [...body.matchAll(/(?:src|href|action)\s*=\s*"(https?:\/\/[^"]+)"|fetch\(\s*"(https?:\/\/[^"]+)"|url\(\s*"?(https?:\/\/[^")]+)|import\s+[^;]*"(https?:\/\/[^"]+)"/g)];
    ok("!! the page loads NOTHING from outside: no http(s) script, stylesheet, image, frame, fetch or import", ext.length === 0, ext.map((m) => m[0]).join(" | "));
    ok("the page has the demo: meta tags (title, desc, category), a <title>, and a link back to server.html", /name="demo:title"/.test(raw) && /name="demo:desc"/.test(raw) && /name="demo:category"/.test(raw) && /<title>[^<]+<\/title>/.test(raw) && /href="\/server\.html"/.test(raw));
    const iAt = code.indexOf("sea.src =");
    ok("!! the page checks navigator.gpu BEFORE it sets the frame's address (so a browser without WebGPU never sees the bundle's own error screen)", iAt > 0 && code.indexOf("navigator.gpu") > 0 && code.indexOf("navigator.gpu") < iAt && /if \(!gpuOk\)/.test(code));
    ok("!! the page SAYS what it is not: not depth-composited, not used by any physics, not seen to render where it was vendored", /NOT DEPTH-COMPOSITED/.test(raw) && /NOT USED BY ANY PHYSICS/.test(raw) && /NOT SEEN TO RENDER/.test(raw));
    ok("the author is credited on the page (name, project, licence)", /Maksymilian Dendura/.test(raw) && /web-ocean/.test(raw) && /MIT/.test(raw));
    const opts = [...raw.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
    ok("the resolution selector offers native and three fixed sizes", opts.join(",") === "native,1920x1080,1280x720,960x540", opts.join(","));
}

console.log("\n3. THE LIVE PAGE");
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) {
        report("live half SKIPPED -- " + skip);
        report("*** THAT IS A SKIP AND NOT A PASS: sections 1-2 read source, and source cannot show the page starts the frame only when WebGPU is there");
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
            // A. NO WebGPU: this box's own browser has none, so the page is loaded as it comes -- and a stub that REMOVES it is applied anyway, so the row does not depend on the box
            {
                const ctx = await b.newContext({ viewport: { width: 1100, height: 800 } });
                await ctx.addInitScript(() => { try { Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true }); } catch (e) { /* already unset */ } });
                const pg = await ctx.newPage(); const errs = [];
                pg.on("pageerror", (e) => errs.push(String(e.message))); pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
                await pg.goto(base + "/ocean-spike.html", { waitUntil: "load" });
                await pg.waitForFunction(() => document.getElementById("gpuWord").textContent !== "checking…", null, { timeout: 8000 }).catch(() => {});
                const st = await pg.evaluate(() => ({ word: document.getElementById("gpuWord").textContent, msg: getComputedStyle(document.getElementById("nogpu")).display, src: document.getElementById("sea").getAttribute("src") }));
                ok("!! with NO WebGPU the chip says 'no WebGPU', the 'no WebGPU' message is shown, and the frame is NOT started (it has no src)", st.word === "no WebGPU" && st.msg === "block" && st.src === null, JSON.stringify(st));
                ok("!! ...and the page loads with no script error and no console error", errs.length === 0, errs.join(" | ").slice(0, 200));
                await ctx.close();
            }
            // B. a STUBBED adapter, and the ocean replaced by a one-line page whose HUD says 60 fps: the page's own logic is what is tested
            {
                const ctx = await b.newContext({ viewport: { width: 1100, height: 800 } });
                await ctx.addInitScript(() => { const features = new Set(["timestamp-query"]); Object.defineProperty(navigator, "gpu", { configurable: true, value: { requestAdapter: async () => ({ info: { vendor: "stubvendor", architecture: "stubarch", description: "<b>stub</b>" }, features }) } }); });
                const pg = await ctx.newPage(); const errs = [], asked = [];
                pg.on("pageerror", (e) => errs.push(String(e.message))); pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
                await pg.route("**/vendor/web-ocean/ocean.html**", (route) => { asked.push(route.request().url().replace(/^https?:\/\/[^/]+/, "")); route.fulfill({ status: 200, contentType: "text/html", body: '<!doctype html><div id="fps">60 fps stub</div>' }); });
                await pg.goto(base + "/ocean-spike.html", { waitUntil: "load" });
                await pg.waitForFunction(() => document.getElementById("gpuWord").textContent === "WebGPU", null, { timeout: 8000 }).catch(() => {});
                await pg.waitForFunction(() => document.getElementById("sea").getAttribute("src"), null, { timeout: 5000 }).catch(() => {});
                const st = await pg.evaluate(() => ({ word: document.getElementById("gpuWord").textContent, detail: document.getElementById("gpuDetail").textContent, msg: getComputedStyle(document.getElementById("nogpu")).display, src: document.getElementById("sea").getAttribute("src"), bolds: document.querySelectorAll("#gpuDetail b").length }));
                ok("!! with a (stubbed) adapter the chip says WebGPU, the adapter's name is shown as TEXT (a name that is markup stays text: no <b> exists) with 'GPU time available', and the frame starts at the vendored file with ?ui=1",
                    st.word === "WebGPU" && /stubvendor stubarch <b>stub<\/b>/.test(st.detail) && /GPU time available/.test(st.detail) && st.bolds === 0 && st.msg === "none" && st.src === "/vendor/web-ocean/ocean.html?ui=1", JSON.stringify(st).slice(0, 240));
                await pg.selectOption("#resSel", "1280x720");
                await pg.waitForFunction(() => /w=1280/.test(document.getElementById("sea").getAttribute("src") || ""), null, { timeout: 5000 }).catch(() => {});
                const src2 = await pg.evaluate(() => document.getElementById("sea").getAttribute("src"));
                ok("!! choosing 1280 x 720 reloads the frame with &w=1280&h=720 (and native sends no size)", src2 === "/vendor/web-ocean/ocean.html?ui=1&w=1280&h=720", src2);
                await pg.waitForFunction(() => { const d = document.getElementById("sea").contentDocument; return d && d.getElementById("fps"); }, null, { timeout: 5000 }).catch(() => {});
                await pg.click("#noteBtn");
                const log = await pg.textContent("#log");
                ok("!! 'Note reading' appends one line: the chosen resolution, a bar and the frame's own HUD text", log === "1280x720 | 60 fps stub", JSON.stringify(log));
                await pg.click("#noteBtn");
                ok("...and a second press appends a second line (the log accumulates)", (await pg.textContent("#log")).split("\n").length === 2);
                ok("!! the page asked for nothing but the vendored bundle during all that, and made no script or console error", asked.length >= 2 && asked.every((u) => u.startsWith("/vendor/web-ocean/ocean.html?ui=1")) && errs.length === 0, asked.join(" ") + (errs.length ? " | " + errs.join(" | ").slice(0, 160) : ""));
                try { await pg.screenshot({ path: process.env.OCEAN_SHOT || "/tmp/ocean-spike.png" }); } catch {}
                await ctx.close();
            }
        } finally { await b.close(); server.close(); }
    }
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
console.log("unchecked here, named honestly: that the ocean RENDERS (nothing in this sandbox has a WebGPU adapter -- the live half runs the PAGE against a stub); what it costs on any GPU (the page's own HUD is the instrument, read on a rig with the 'Note reading' button); and that the bundle is what upstream's js/ sources build to (the hash pins the bytes, not their derivation).");
process.exit(fails ? 1 : 0);
