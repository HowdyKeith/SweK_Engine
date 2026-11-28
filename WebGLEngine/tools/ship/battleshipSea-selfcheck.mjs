// WebGLEngine/tools/ship/battleshipSea-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/battleshipSea-selfcheck.mjs      (under a minute: battleship3d.html in headless Chromium)
//
// THE BATTLESHIP'S SEA PICKER, HELD (Keith, 2026-11-28: "the battleship sea picker"). battleship3d.html offers the seas sub-aquarium.html offers (render/seaStyles.mjs): three physics
// seas -- the same Gerstner surface the fleet rides -- and the GPU ocean (sea-host.html behind the canvas).
//
//   1  THE CHOICES   the picker lists render/seaStyles.mjs's four, calm by default (what the page always drew)
//   2  THE PHYSICS   ?sea=rough loads the rough sea (8 waves, the longest 90 m) and the picker says so; choosing default through the picker rebuilds the surface in place
//                    (6 waves, 60 m); the rough surface's drawn height range is wider than the calm one's; no page error
//   3  THE GPU SEA   chosen, either it goes live (its frame shown behind a cleared canvas) or, when this browser's frame has no adapter, the page says so within 15 s and goes
//                    back to the calm sea with the frame hidden -- never a frame left showing over nothing
//   4  REMEMBERED    a sea chosen in the picker is the one the next visit opens with; ?sea= wins over it
//   5  LIT           with ?lights=1 on the rough sea, no GL error (the new surface is patched and kept out of the shadow atlas)
//
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, HEADLESS_SHELL, WEBGL_DEFAULT_ARGS } from "./playwrightResolve.mjs";
import { LABELS } from "../../render/seaStyles.mjs";

const require = createRequire(import.meta.url), { chromium } = resolvePlaywright(require), ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
console.log("battleshipSea-selfcheck -- the sea picker on battleship3d.html\n");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".wasm": "application/wasm" };
const srv = http.createServer((q, r) => { const f = path.join(ENG, decodeURIComponent(q.url.split("?")[0])); if (f.startsWith(ENG) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); return r.end(fs.readFileSync(f)); } r.writeHead(404); r.end(); });
await new Promise((res) => srv.listen(0, "127.0.0.1", res));
const browser = await chromium.launch({ args: [...WEBGL_DEFAULT_ARGS, "--enable-unsafe-webgpu"], ...(HEADLESS_SHELL ? { executablePath: HEADLESS_SHELL } : {}) });
const ctx = await browser.newContext({ viewport: { width: 640, height: 420 } });   // one context: its localStorage carries the remembered sea from page to page
const open = async (q) => { const p = await ctx.newPage(), errors = []; p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => { if (/GL_INVALID|Shader Error|WebGLProgram/.test(m.text())) errors.push(m.text().slice(0, 160)); });
    await p.goto(`http://127.0.0.1:${srv.address().port}/battleship3d.html${q}`); await p.waitForFunction(() => window.__battleSea, null, { timeout: 60000 }); await p.waitForTimeout(1200); return { p, errors }; };
const sea = (p) => p.evaluate(() => ({ ...window.__battleSea, span: window.__battleSea.span(), sel: document.getElementById("seaSel").value, opts: [...document.querySelectorAll("#seaSel option")].map((o) => o.value), frame: document.getElementById("seaFrame").style.display }));

console.log("1. THE CHOICES, 2. THE PHYSICS");
await section(async () => {
    const a = await open(""), calm = await sea(a.p);
    ok("!! THE PICKER LISTS render/seaStyles.mjs's FOUR, CALM BY DEFAULT", JSON.stringify(calm.opts) === JSON.stringify(Object.keys(LABELS)) && calm.style === "calm" && calm.sel === "calm" && calm.state === "physics", JSON.stringify(calm.opts));
    await a.p.close();
    const b = await open("?sea=rough"), rough = await sea(b.p);
    await b.p.selectOption("#seaSel", "default"); await b.p.waitForTimeout(400); const def = await sea(b.p); await b.p.close();
    ok("!! ?sea=rough LOADS THE ROUGH SEA (8 waves, the longest 90 m) AND THE PICKER SAYS SO; the picker's default rebuilds it in place (6 waves, 60 m); no page error", rough.style === "rough" && rough.waves === 8 && rough.longest === 90 && rough.sel === "rough" && def.style === "default" && def.waves === 6 && def.longest === 60 && a.errors.length + b.errors.length === 0, `${JSON.stringify([rough.style, rough.waves, rough.longest])} -> ${JSON.stringify([def.style, def.waves, def.longest])}`);
    ok("!! THE ROUGH SEA IS ROUGHER: its drawn surface spans more height than the calm one's", rough.span > 1.3 * calm.span, `rough ${rough.span.toFixed(2)}, calm ${calm.span.toFixed(2)}`);
});

console.log("3. THE GPU SEA, 4. REMEMBERED");
await section(async () => {
    const a = await open("");
    await a.p.selectOption("#seaSel", "gpu");
    await a.p.waitForFunction(() => /live|did not start|GPU ocean: (this|no)/.test(window.__battleSea.state), null, { timeout: 20000 }).catch(() => {});
    const g = await sea(a.p); await a.p.close();
    const live = /live/.test(g.state), fellBack = g.style === "calm" && g.frame === "none" && /did not start|GPU ocean:/.test(g.state);
    ok("!! THE GPU OCEAN, CHOSEN: live with its frame shown, or -- this browser's frame without an adapter -- said so, and back on the calm sea with the frame hidden", (live && g.frame === "block" && g.style === "gpu") || fellBack, `${g.style}; ${g.state}; frame ${g.frame}`);
    const b = await open(""); await b.p.selectOption("#seaSel", "rough"); await b.p.waitForTimeout(300); await b.p.close();
    const c = await open(""), again = await sea(c.p); await c.p.close();
    const d = await open("?sea=default"), url = await sea(d.p); await d.p.close();
    ok("!! A SEA CHOSEN IN THE PICKER IS THE NEXT VISIT'S; ?sea= WINS OVER IT", again.style === "rough" && url.style === "default", `remembered ${again.style}; ?sea=default gave ${url.style}`);
});

console.log("5. LIT");
await section(async () => {
    const { p, errors } = await open("?lights=1&sea=rough"); await p.waitForFunction(() => window.__battleLit && window.__battleLit.frames > 10, null, { timeout: 120000 }); const s = await sea(p); await p.close();
    ok("!! WITH ?lights=1 ON THE ROUGH SEA, NO GL ERROR (the new surface patched, and kept out of the shadow atlas)", s.style === "rough" && errors.length === 0, errors[0] || s.style);
});

await ctx.close(); await browser.close(); srv.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG: (filled in after the sweep)
