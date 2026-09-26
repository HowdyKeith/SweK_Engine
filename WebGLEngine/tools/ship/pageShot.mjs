#!/usr/bin/env node
// WebGLEngine/tools/ship/pageShot.mjs -- v4739 -- A SCREENSHOT OF A PAGE AS THIS BOX PRESENTS IT, ON WebGPU.
//
// Every screenshot this tree took of a three.js page before v4739 was ?backend=webgl2, because presenting a WebGPU
// canvas lost the device here (gfx/device.js Level 11). tools/ship/webgpuHarness.mjs's PRESENT_ARGS found that the loss
// was the FLAGS -- the compositor has to be on the same software stack as Dawn's SwiftShader Vulkan -- so a page can now
// be shot on the backend a user's browser would pick. tools/ship/pageShot-selfcheck.mjs grades it.
//
//   node tools/ship/pageShot.mjs fsr-three.html out.png "#scale=2" "#mode=fsr2"
//
// Each "selector=value" is a <select> set in order after the page has started. The status line (#stat, if the page has
// one) is printed, and so is every page error except a missing resource's 404 -- the pages here ask for a favicon.
"use strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { PRESENT_ARGS, SECURE_HOST, installSwizzleWorkaround } from "./webgpuHarness.mjs";
import { decodePNG } from "./pngCoverage.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".json": "application/json", ".css": "text/css",
               ".wasm": "application/wasm", ".png": "image/png", ".jpg": "image/jpeg", ".glb": "model/gltf-binary" };

/**
 * Load `page` from the engine root in the headless shell under `launchArgs` (PRESENT_ARGS by default), set each
 * [selector, value] in `selects`, wait `waitMs`, and screenshot the viewport. Resolves to { status, errors, png, image }
 * where `png` is the file's bytes and `image` tools/ship/pngCoverage.mjs's decode of them ({ width, height, channels, data }).
 */
export async function shootPage({ engineRoot = ENG, page, query = "", selects = [], waitMs = 8000, launchArgs = PRESENT_ARGS,
                                  viewport = { width: 1000, height: 660 }, statusSelector = "#stat", startMs = 2500 } = {}) {
    const root = path.resolve(engineRoot);
    const srv = http.createServer((q, s) => {
        const u = decodeURIComponent(String(q.url).split("?")[0]), f = path.join(root, u);
        if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end("no"); }
        s.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }); s.end(fs.readFileSync(f));
    });
    await new Promise((r) => srv.listen(0, SECURE_HOST, r));
    const pw = resolvePlaywright(createRequire(import.meta.url));
    const browser = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: [...launchArgs] });
    try {
        const tab = await browser.newPage({ viewport });
        await tab.addInitScript(`${installSwizzleWorkaround.toString()}; try { installSwizzleWorkaround(); } catch (e) {}`);
        const errors = [];
        tab.on("pageerror", (e) => errors.push(String(e.message).slice(0, 300)));
        tab.on("console", (m) => { if (m.type() === "error" && !/status of 404/.test(m.text())) errors.push(m.text().slice(0, 300)); });
        await tab.goto(`http://${SECURE_HOST}:${srv.address().port}/${page}${query}`);
        await tab.waitForTimeout(startMs);
        for (const [sel, val] of selects) await tab.selectOption(sel, val);
        await tab.waitForTimeout(waitMs);
        const status = statusSelector ? await tab.textContent(statusSelector, { timeout: 120000 }).catch(() => null) : null;
        const png = await tab.screenshot({ timeout: 120000 });
        return { status, errors, png, image: decodePNG(png) };
    } finally { await browser.close(); srv.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [page, out, ...rest] = process.argv.slice(2);
    if (!page || !out) { console.log('usage: node tools/ship/pageShot.mjs <page.html[?query]> <out.png> ["#select=value" ...]'); process.exit(2); }
    const [file, q] = page.split("?");
    const r = await shootPage({ page: file, query: q ? "?" + q : "", selects: rest.map((a) => { const i = a.indexOf("="); return [a.slice(0, i), a.slice(i + 1)]; }) });
    fs.writeFileSync(out, r.png);
    console.log(`${out}: ${r.image.width}x${r.image.height}${r.status ? " | " + r.status : ""}`);
    if (r.errors.length) console.log("page errors:", r.errors.join(" | "));
}
