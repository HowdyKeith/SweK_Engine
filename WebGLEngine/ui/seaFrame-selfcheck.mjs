// WebGLEngine/ui/seaFrame-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). (~3 s with a browser; sections 1-3 alone ~0.2 s)
//
// Run: node ui/seaFrame-selfcheck.mjs
//
// HOW A PAGE USES THE PATCHED SEA, HELD TO WHAT IT CLAIMS (step 3 of ocean-src-integration):
//   1  THE CAMERA   seaCameraFromView and forwardOfSeaCamera are inverses over a sweep of directions; the sea's convention is read out of the vendored source (yaw 0 looks along -z, the forward vector is
//                   (cos p sin y, sin p, -cos p cos y)) and a real three.js camera, turned by lookAt, gives the same forward as the conversion says; scale and offset apply to the position only;
//   2  THE URL      hostUrl keeps only the parameters the sea reads, filters non-numeric tunables, and points at sea-host.html;
//   3  THE STATS    realizedStats recovers a known Gaussian's sigma (and so 4 sigma) from a synthetic readback to within sampling error, refuses too few samples, and ignores non-finite ones;
//   4  THE HOST     (needs a browser; SKIPPED, and said, without one) sea-host.html in Chromium with no WebGPU: it loads the patched module from the engine's origin, publishes window.seaApi, the sea reports
//                   the missing WebGPU on the page, seaApi.ready stays false, and setParams / setPoints / camera still work on the handle.
// NOT GRADED, said plainly: the sea drawing into the frame, a three.js canvas composited over it, or the readback of heights on a GPU (the probe itself is run in tools/ship/seaPatch-selfcheck.mjs).
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as SF from "./seaFrame.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL, webglLaunchArgs } from "../tools/ship/playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

console.log("seaFrame-selfcheck -- the patched sea in a frame\n");
console.log("1. THE CAMERA");
{
    const src = fs.readFileSync(path.join(ENG, "vendor/web-ocean/js/main.js"), "utf8");
    ok("!! the convention is read out of the vendored source, not assumed: forward = (cp*sy, sp, -cp*cy), right = (cy, 0, sy)", /const fx = cp \* sy, fy = sp, fz = -cp \* cy;/.test(src) && /const rx = cy, ry = 0, rz = sy;/.test(src));
    let worst = 0; const r = rng(3);
    for (let i = 0; i < 400; i++) {
        const yaw = (r() * 2 - 1) * Math.PI, pitch = (r() * 2 - 1) * 1.4, f = SF.forwardOfSeaCamera({ yaw, pitch }), c = SF.seaCameraFromView([0, 0, 0], f.map((v) => v * 3.7));
        let dy = Math.abs(Math.atan2(Math.sin(c.yaw - yaw), Math.cos(c.yaw - yaw))); worst = Math.max(worst, dy, Math.abs(c.pitch - pitch));
    }
    ok("!! the two conversions are inverses over 400 random directions (worst angle error under 1e-12), whatever the length of the forward vector", worst < 1e-12, "worst " + worst.toExponential(1));
    const c = SF.seaCameraFromView([1, 2, 3], [0, 0, -1], 60, 10, [100, 0, -5]);
    ok("  scale and offset apply to the position only, straight ahead is yaw 0 pitch 0, up is positive pitch, +x is positive yaw, the field of view is radians",
        c.x === 110 && c.y === 20 && c.z === 25 && c.yaw === 0 && c.pitch === 0 && Math.abs(c.fovY - Math.PI / 3) < 1e-12 && SF.seaCameraFromView([0, 0, 0], [0, 1, -1]).pitch > 0 && SF.seaCameraFromView([0, 0, 0], [1, 0, -1]).yaw > 0);
    let threw = false; try { SF.seaCameraFromView([0, 0, 0], [0, 0, 0]); } catch { threw = true; }
    ok("  a zero forward vector throws rather than producing NaN angles", threw);
    let three = null; try { three = await import(path.join(ENG, "vendor/three/three.module.js")); } catch (e) { three = null; }
    if (!three) report("three.js did not import in node here -- the real-camera row is SKIPPED");
    else {
        const cam = new three.PerspectiveCamera(58, 1.5, 0.1, 1000); let wt = 0; const rr = rng(9);
        for (let i = 0; i < 50; i++) {
            cam.position.set((rr() - 0.5) * 50, (rr() - 0.5) * 20, (rr() - 0.5) * 50); cam.lookAt((rr() - 0.5) * 80, (rr() - 0.5) * 30, (rr() - 0.5) * 80); cam.updateMatrixWorld(true);
            const d = new three.Vector3(); cam.getWorldDirection(d); const sc = SF.seaCameraFromView([cam.position.x, cam.position.y, cam.position.z], [d.x, d.y, d.z], 58), f = SF.forwardOfSeaCamera(sc);
            wt = Math.max(wt, Math.hypot(f[0] - d.x, f[1] - d.y, f[2] - d.z));
        }
        ok("!! a real three.js PerspectiveCamera, turned by lookAt at 50 random poses, gives the same forward through the conversion (worst vector error under 1e-6)", wt < 1e-6, "worst " + wt.toExponential(1));
    }
}

console.log("\n2. THE URL");
{
    const u = SF.hostUrl({ swellHs: 1.99, swellLength: 60, ui: 1, bogus: 3, windSpeed: "fast", w: 640 });
    ok("!! hostUrl points at sea-host.html and carries only the parameters the sea reads: the numeric tunables, ui and w; the unknown key and the non-numeric tunable are dropped", /^\/sea-host\.html\?/.test(u) && /swellHs=1\.99/.test(u) && /swellLength=60/.test(u) && /ui=1/.test(u) && /w=640/.test(u) && !/bogus|windSpeed/.test(u), u);
    ok("  with nothing to say it is the bare page, and the exported path and point limit are the ones the patched probe has (SEA_HOST_PATH, MAX_POINTS = the probe buffer's 64)", SF.hostUrl() === SF.SEA_HOST_PATH && SF.SEA_HOST_PATH === "/sea-host.html" && SF.MAX_POINTS === 64 && /MAX_POINTS: 64/.test(fs.readFileSync(path.join(ENG, "world/ocean/seaMain.mjs"), "utf8")));
    const g = SF.gridPoints(3, 10, 5, -5), big = SF.gridPoints(10, 10);
    ok("  gridPoints spreads n x n points over [-half, half] about a centre, and never returns more than 64 pairs", g.length === 18 && g[0] === -5 && g[1] === -15 && g[16] === 15 && g[17] === 5 && big.length === 128);
}

console.log("\n3. THE STATS");
{
    const r = rng(21), gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
    const rounds = []; for (let k = 0; k < 40; k++) { const a = new Float32Array(64); for (let i = 0; i < 64; i++) a[i] = 0.3 + 0.5 * gauss(); rounds.push(a); }
    const st = SF.realizedStats(rounds, 64);
    ok("!! 40 readbacks of 64 points from a Gaussian of mean 0.3 and sigma 0.5 give sigma within 4% and Hs = 4 sigma", st && Math.abs(st.sigma - 0.5) < 0.02 && Math.abs(st.hs - 2.0) < 0.08 && Math.abs(st.mean - 0.3) < 0.03 && st.samples === 2560, st ? "sigma " + st.sigma.toFixed(4) + ", hs " + st.hs.toFixed(3) + ", mean " + st.mean.toFixed(3) : "null");
    ok("!! too few readbacks, too few points or too few finite samples give null, not a number", SF.realizedStats([[1, 2, 3, 4]], 4) === null && SF.realizedStats(rounds, 3) === null && SF.realizedStats([[NaN, NaN, NaN, NaN], [NaN, NaN, NaN, NaN]], 4) === null && SF.realizedStats(null, 4) === null);
    const withNaN = SF.realizedStats([[1, NaN, 3, 5, 7], [1, 2, 3, 4, 5]], 5);
    ok("  non-finite samples are skipped and the rest counted", withNaN && withNaN.samples === 9, withNaN ? String(withNaN.samples) : "null");
    ok("  the report says what was measured, or says it was not", SF.reportLines()[1].includes("not measured") && SF.reportLines(st)[1].includes("Hs (4 sigma)"));
}

console.log("\n4. THE HOST");
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) {
        report("live half SKIPPED -- " + skip);
        report("*** THAT IS A SKIP AND NOT A PASS: sections 1-3 never load the page, so they cannot show that sea-host.html's module graph resolves and publishes seaApi");
    } else {
        const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript" };
        const server = http.createServer((req, res) => {
            const u = decodeURIComponent(req.url.split("?")[0]);
            if (u === "/__log") { res.writeHead(404); return res.end(); }
            const fp = path.join(ENG, u);
            if (fp.startsWith(ENG) && fs.existsSync(fp) && fs.statSync(fp).isFile()) { res.writeHead(200, { "Content-Type": types[path.extname(fp)] || "text/plain" }); return res.end(fs.readFileSync(fp)); }
            res.writeHead(404); res.end("not found");
        });
        await new Promise((rs) => server.listen(0, "127.0.0.1", rs));
        const base = "http://127.0.0.1:" + server.address().port;
        const br = await chromium.launch({ executablePath: HEADLESS_SHELL, args: webglLaunchArgs().args });
        try {
            const pg = await (await br.newContext()).newPage(); const errs = [];
            pg.on("pageerror", (e) => errs.push(String(e.message)));
            await pg.addInitScript(() => { try { Object.defineProperty(navigator, "gpu", { configurable: true, value: undefined }); } catch {} });
            await pg.goto(base + SF.hostUrl({ swellHs: 2.5, ui: 1 }), { waitUntil: "load" });
            await pg.waitForFunction(() => window.seaApi, null, { timeout: 8000 }).catch(() => {});
            await pg.waitForTimeout(300);
            const r = await pg.evaluate(() => { const a = window.seaApi; if (!a) return null; const ap = a.setParams({ swellSpread: 21 }); const n = a.setPoints([1, 2, 3, 4]); a.camera = { x: 1, y: -3, z: 2, yaw: 0.5, pitch: 0.1, fovY: 1 };
                return { err: document.getElementById("err").textContent, ready: a.ready, swellHs: a.P.swellHs, spread: a.P.swellSpread, ap, n, cam: !!a.camera, ids: ["c", "hud", "fps", "panel", "err"].every((i) => document.getElementById(i)) }; });
            ok("!! sea-host.html loads the patched module from the engine's origin and publishes window.seaApi", !!r, r ? "" : "no seaApi");
            ok("!! the sea reports the missing WebGPU on the page, seaApi.ready stays false, and the URL's swellHs (2.5) has NOT reached P (upstream applies the URL after the device is up: P still reads its default 1.8)", !!r && /WebGPU/.test(r.err) && r.ready === false && r.swellHs === 1.8, r ? r.err.slice(0, 60) : "");
            ok("!! the handle works without a GPU: setParams reaches swellSpread, setPoints counts, a camera can be set", !!r && r.spread === 21 && r.ap.join() === "swellSpread" && r.n === 2 && r.cam);
            ok("  the page carries the element ids the sea looks for (c, hud, fps, panel, err)", !!r && r.ids);
            ok("  no uncaught page error", errs.length === 0, errs.join(" | "));
        } finally { await br.close(); server.close(); }
    }
}

console.log(`\nseaFrame-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
