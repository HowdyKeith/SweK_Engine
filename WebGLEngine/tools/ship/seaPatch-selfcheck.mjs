// WebGLEngine/tools/ship/seaPatch-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). (~2 s with a browser; sections 1-3 alone ~0.3 s)
//
// Run: node tools/ship/seaPatch-selfcheck.mjs
//
// THE PATCH LAYER OVER THE VENDORED SEA, HELD TO WHAT IT CLAIMS (step 2 of ocean-src-integration):
//   1  THE INPUT    vendor/web-ocean/js/main.js is the pinned upstream file (sha256), and every patch's anchor occurs in it exactly as many times as the patch says; a drifted anchor throws;
//   2  THE OUTPUT   world/ocean/seaMain.mjs is byte for byte what applyPatches() makes of the vendored file, has the recorded sha256, and is syntactically a module (node --check);
//   3  WHAT MOVED   running the patches BACKWARDS (replace -> find) on seaMain.mjs gives upstream's bytes exactly, so nothing changed except what PATCHES lists;
//   4  THE API      the api and hook text, cut out of the patched file, run in a closure shaped like main()'s: setParams sets every key P has (swellSpread too), ignores unknown keys and non-numbers,
//                   raises needSpectrum for the spectrum keys, needLUT for haze, neither for the rest; waterHeight() reads the closure's waterH; ready flips only when the hook runs;
//   5  THE MODULE   (needs a browser; SKIPPED, and said, without one) the patched module loads from the engine's own origin with its imports resolved, exports P and seaApi, and with no
//                   WebGPU main() reports the failure on the page, leaves seaApi.ready false and still lets setParams set P.
// SABOTAGES, each applied in place, restored, md5 verified; every one red by name (rows red): a patch anchor edited 1 | seaMain.mjs with one byte appended 3 | the hook not setting ready 9 | setParams
// ignoring swellSpread 6 | haze raising needLUT always 6 | an import path left relative 3.
// NOT GRADED, said plainly: the sea on a GPU after setParams (the sandbox has none), and that upstream's main.js still equals the pinned file.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as SP from "./seaPatch.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL, webglLaunchArgs } from "./playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);
const up = fs.readFileSync(path.join(ENG, SP.UPSTREAM_PATH)), patchedOnDisk = fs.readFileSync(path.join(ENG, SP.PATCHED_PATH));
const upText = up.toString("utf8");

console.log("seaPatch-selfcheck -- the patch layer over the vendored sea\n");
console.log("1. THE INPUT");
{
    ok("!! vendor/web-ocean/js/main.js is the pinned upstream file", SP.sha256(up) === SP.UPSTREAM_SHA256, SP.sha256(up).slice(0, 12));
    ok("!! every patch's anchor occurs in it exactly as often as the patch says", SP.PATCHES.every((p) => upText.split(p.find).length - 1 === p.count), SP.PATCHES.map((p) => p.id + " x" + p.count).join(", "));
    let msg = "";
    try { SP.applyPatches(upText.replace("let needSpectrum = true", "let needSpectrumX = true")); } catch (e) { msg = e.message; }
    ok("!! a drifted upstream throws instead of patching quietly", /patch 'hook': anchor occurs 0 times/.test(msg), msg);
}

console.log("\n2. THE OUTPUT");
{
    const made = SP.applyPatches(upText);
    ok("!! world/ocean/seaMain.mjs is byte for byte what applyPatches makes of the vendored file", patchedOnDisk.equals(Buffer.from(made, "utf8")), patchedOnDisk.length + " bytes");
    ok("!! ... and has the recorded sha256 (PATCHED_SHA256)", SP.sha256(patchedOnDisk) === SP.PATCHED_SHA256, SP.sha256(patchedOnDisk).slice(0, 12));
    const chk = spawnSync(process.execPath, ["--check", path.join(ENG, SP.PATCHED_PATH)], { encoding: "utf8" });
    ok("  it parses as a module (node --check)", chk.status === 0, (chk.stderr || "").split("\n")[0]);
    ok("  no relative './wgsl/' import is left: the patched module can live outside the vendor directory", !/from '\.\/wgsl\//.test(patchedOnDisk.toString("utf8")) && (patchedOnDisk.toString("utf8").match(/from '\/vendor\/web-ocean\/js\/wgsl\//g) || []).length === 5);
}

console.log("\n3. WHAT MOVED");
{
    let back = patchedOnDisk.toString("utf8");
    for (const p of [...SP.PATCHES].reverse()) back = back.split(p.replace).join(p.find);
    ok("!! the patches run BACKWARDS on seaMain.mjs give upstream's bytes exactly: nothing changed that PATCHES does not list", Buffer.from(back, "utf8").equals(up));
    report("the whole change: " + SP.reportLines(upText).slice(1).join(" | "));
}

console.log("\n4. THE API");
{
    const t = patchedOnDisk.toString("utf8");
    const a = t.indexOf("export const seaApi = {"), aEnd = t.indexOf("\n};\n", a) + 4;
    const h = t.indexOf("  seaApi.raise = "), hEnd = t.indexOf("  seaApi.ready = true;\n", h) + "  seaApi.ready = true;\n".length;
    ok("!! the api and hook text are found in the patched file", a > 0 && aEnd > a && h > 0 && hEnd > h);
    const apiSrc = t.slice(a, aEnd).replace("export const seaApi", "const seaApi"), hookSrc = t.slice(h, hEnd);
    const P = { windSpeed: 7, swellHs: 1.8, swellSpread: 48, haze: 3, foam: 1, bloom: 0.1 };
    const mk = () => new Function("P", `${apiSrc}\n const before = { ready: seaApi.ready };\n let needSpectrum = false, needLUT = false, envFull = 0, waterH = 0.42;\n${hookSrc}\n return { seaApi, before, flags: () => ({ needSpectrum, needLUT, envFull }), clear: () => { needSpectrum = false; needLUT = false; envFull = 0; } };`)(P);
    const w = mk();
    ok("!! before the hook runs the api is not ready, and setParams sets P with no raise to call (the sea reads P at its start)", w.before.ready === false);
    const pre = new Function("P", `${apiSrc}\n const r = seaApi.setParams({ swellHs: 2.5 }); return { r, ready: seaApi.ready };`)({ ...P });
    ok("  setParams before main() has built its flags still sets P and does not throw", pre.r.join() === "swellHs" && pre.ready === false);
    w.clear(); const r1 = w.seaApi.setParams({ swellSpread: 30, swellHs: 2, bogus: 1, foam: NaN, windSpeed: "9" });
    ok("!! setParams sets every key P has -- swellSpread, the one with no slider, included -- ignores the unknown key and the non-number, and takes a numeric string", r1.join() === "swellSpread,swellHs,windSpeed" && P.swellSpread === 30 && P.swellHs === 2 && P.windSpeed === 9 && !("bogus" in P) && P.foam === 1, JSON.stringify(P));
    ok("!! the spectrum keys raise needSpectrum and not needLUT; envFull is raised", w.flags().needSpectrum && !w.flags().needLUT && w.flags().envFull === 2);
    w.clear(); w.seaApi.setParams({ haze: 6 });
    ok("!! haze raises needLUT and NOT needSpectrum", w.flags().needLUT && !w.flags().needSpectrum && P.haze === 6);
    w.clear(); w.seaApi.setParams({ foam: 2, bloom: 0.2 });
    ok("  foam and bloom raise neither flag (upstream's sliders for them raise none), only envFull", !w.flags().needSpectrum && !w.flags().needLUT && w.flags().envFull === 2);
    ok("  after the hook: ready is true and waterHeight() reads the closure's waterH", w.seaApi.ready === true && w.seaApi.waterHeight() === 0.42);
}

console.log("\n5. THE MODULE");
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) {
        report("live half SKIPPED -- " + skip);
        report("*** THAT IS A SKIP AND NOT A PASS: sections 1-4 never load the module, so they cannot show that its imports resolve from the engine's origin");
    } else {
        const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript" };
        const server = http.createServer((req, res) => {
            const u = decodeURIComponent(req.url.split("?")[0]);
            if (u === "/__sea.html") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end("<!doctype html><meta charset=utf-8><canvas id=c></canvas><div id=fps></div><div id=panel></div><div id=err></div>"); }
            if (u === "/__log") { res.writeHead(404); return res.end(); }
            const fp = path.join(ENG, u);
            if (fp.startsWith(ENG) && fs.existsSync(fp) && fs.statSync(fp).isFile()) { res.writeHead(200, { "Content-Type": types[path.extname(fp)] || "text/plain" }); return res.end(fs.readFileSync(fp)); }
            res.writeHead(404); res.end("not found");
        });
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        const base = "http://127.0.0.1:" + server.address().port;
        const br = await chromium.launch({ executablePath: HEADLESS_SHELL, args: webglLaunchArgs().args });
        try {
            const pg = await (await br.newContext()).newPage(); const errs = [];
            pg.on("pageerror", (e) => errs.push(String(e.message)));
            await pg.addInitScript(() => { try { Object.defineProperty(navigator, "gpu", { configurable: true, value: undefined }); } catch {} });
            await pg.goto(base + "/__sea.html", { waitUntil: "load" });
            const r = await pg.evaluate(async () => {
                const M = await import("/world/ocean/seaMain.mjs");
                await new Promise((res) => setTimeout(res, 300));
                const applied = M.seaApi.setParams({ swellSpread: 33 });
                return { keys: Object.keys(M).sort(), ready: M.seaApi.ready, err: document.getElementById("err").textContent, applied, spread: M.P.swellSpread, same: M.P === M.seaApi.P };
            });
            ok("!! the patched module loads from the engine's origin (its five wgsl imports resolve), exporting P and seaApi", r.keys.join() === "P,seaApi", r.keys.join());
            ok("!! with no WebGPU main() reports it on the page, seaApi stays NOT ready, and setParams still sets upstream's P (swellSpread 33)", /WebGPU/.test(r.err) && r.ready === false && r.applied.join() === "swellSpread" && r.spread === 33 && r.same, r.err);
            ok("  no uncaught page error", errs.length === 0, errs.join(" | "));
        } finally { await br.close(); server.close(); }
    }
}

console.log(`\nseaPatch-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
