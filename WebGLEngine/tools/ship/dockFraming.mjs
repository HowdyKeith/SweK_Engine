#!/usr/bin/env node
// WebGLEngine/tools/ship/dockFraming.mjs -- v4304
//
// THE INSTRUMENT #86 ASKED FOR, BEFORE ANY FRAMING CHANGE IS JUDGED. Cover-fit candidates for the demoChrome
// robot dock (#83) were tried at v4107 and the pixel metrics were confounded by the avatar's wander: "the same
// config gave lumFill 77 then 33, and orange-pixel counts 710/2055/1422 across margins that should have varied
// monotonically." A delta read against a moving subject is a coin toss. So this file measures ONE
// configuration N times and reports the SPREAD -- the noise floor -- and only a delta larger than that floor
// means anything. It is a measuring instrument, not a verdict: measureDock() boots the real page in headless
// Chromium, waits for the dock's stage canvas to draw, screenshots that canvas N times with a gap between
// shots, and returns every coverage fraction with mean, sample sd, min and max (tools/ship/pngCoverage.mjs,
// the same decoder and metric avatarFraming-selfcheck has used since v4033).
//
// Run:  node tools/ship/dockFraming.mjs [--page battleship3d.html] [--shots 4] [--gap 1500] [--json]
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { decodePNG, subjectFraction, spread } from "./pngCoverage.mjs";

const require_ = createRequire(import.meta.url);
export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DEFAULTS = Object.freeze({ page: "battleship3d.html", selector: "#demoChrome canvas", shots: 4, gapMs: 1500, settleMs: 5000, viewport: { width: 1280, height: 800 } });

/**
 * THE NOISE FLOOR, MEASURED AT v4304 on battleship3d.html's demoChrome dock in this sandbox's headless
 * Chromium (SwiftShader). Four shots of one unchanged configuration, 1.5 s apart. This is what "no change"
 * looks like; a candidate framing whose mean moves by less than about three of these sd is not a result.
 * Re-measure (node tools/ship/dockFraming.mjs) before trusting it on another box -- SwiftShader and a GPU
 * antialias differently, and the fraction's threshold is 12 luminance units.
 */
export const NOISE_FLOOR_V4304 = Object.freeze({ at: "v4304", page: "battleship3d.html", shots: 4, gapMs: 1500,
    fractions: Object.freeze([0.239, 0.255, 0.261, 0.266]), mean: 0.255, sd: 0.011, min: 0.239, max: 0.266, width: 278, height: 88,
    note: "measured WITH the v4304 depth wander in place (#85), so this floor already includes the avatar stepping back and forward" });

/** Serve the engine tree to the page from disk; everything else 404s. */
export function routeFromDisk(page, root = ENG) {
    return page.route("**/*", (route) => {
        const u = new URL(route.request().url());
        const p = path.join(root, decodeURIComponent(u.pathname));
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
            const ext = path.extname(p);
            const type = ext === ".mjs" || ext === ".js" ? "text/javascript" : ext === ".html" ? "text/html" : ext === ".glb" ? "model/gltf-binary"
                : ext === ".json" ? "application/json" : ext === ".css" ? "text/css" : ext === ".png" ? "image/png" : "application/octet-stream";
            return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(p) });
        }
        return route.fulfill({ status: 404, body: "not found" });
    });
}

/**
 * Measure one page's dock canvas N times. Returns null-free numbers or throws; a page whose dock never
 * draws is an error here, not a zero (a zero would read as "the dock is empty", which is a finding, not a
 * failure to look).
 */
export async function measureDock(opts = {}) {
    const o = { ...DEFAULTS, ...opts };
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) throw new Error("no browser: " + skip);
    const browser = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
    try {
        const page = await (await browser.newContext({ viewport: o.viewport })).newPage();
        await routeFromDisk(page, o.root || ENG);
        await page.goto("http://localhost/" + o.page, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForFunction((sel) => { const c = document.querySelector(sel); return c && c.width > 0 && c.height > 0; }, o.selector, { timeout: 30000 });
        await page.waitForTimeout(o.settleMs);
        const size = await page.evaluate((sel) => { const c = document.querySelector(sel); const r = c.getBoundingClientRect(); return { width: Math.round(r.width), height: Math.round(r.height), pixelW: c.width, pixelH: c.height }; }, o.selector);
        const fractions = [];
        for (let i = 0; i < o.shots; i++) {
            if (i) await page.waitForTimeout(o.gapMs);
            const buf = await page.locator(o.selector).first().screenshot();
            fractions.push(subjectFraction(decodePNG(buf)));
        }
        return { page: o.page, selector: o.selector, shots: o.shots, gapMs: o.gapMs, ...size, fractions, ...spread(fractions) };
    } finally { await browser.close(); }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
    const r = await measureDock({ page: arg("--page", DEFAULTS.page), shots: Number(arg("--shots", DEFAULTS.shots)), gapMs: Number(arg("--gap", DEFAULTS.gapMs)) })
        .catch((e) => { console.error("[dockFraming] " + (e && e.message)); process.exit(2); });
    if (process.argv.includes("--json")) console.log(JSON.stringify(r, null, 1));
    else console.log(`[dockFraming] ${r.page} ${r.selector} ${r.width}x${r.height} css (${r.pixelW}x${r.pixelH} px): ${r.shots} shots, coverage ` +
        r.fractions.map((f) => f.toFixed(3)).join(" ") + ` -> mean ${r.mean.toFixed(3)} sd ${r.sd.toFixed(3)} [${r.min.toFixed(3)}, ${r.max.toFixed(3)}]`);
}
