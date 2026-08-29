// WebGLEngine/tools/ship/demoChrome-selfcheck.mjs -- v4106
//
// Run: node tools/ship/demoChrome-selfcheck.mjs   (needs Chromium; skips cleanly without it)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ui/demoChrome.js -- the top-right avatar/gauges chrome that self-mounts into nearly every standalone
// demo page in this tree. UNTIL THIS FILE, NOTHING DROVE IT AT ALL: 899 lines, mounted on dozens of pages,
// zero automated coverage.
//
// *** THE BUG THIS EXISTS FOR: Keith, on webgpu-llm.html: "empty top-right box never loads." *** stageWrap
// (and pill, and body) are all BUILT with `display: "flex"` -- their children are laid out with `flex: ...`
// and depend on it, most critically the canvas-host div (`flex: 1 1 auto`, holding an absolutely-positioned
// canvas with no in-flow content of its own, so its height comes ENTIRELY from the flex layout). Three call
// sites "restored" that display by setting `.style.display = ""` -- which does not restore flex, it REMOVES
// the inline override, and a bare <div> falls back to `block`. Once the row is `block`, the canvas-host's
// `flex: 1 1 auto` is inert, its own height collapses to zero (no in-flow content), and the absolutely
// positioned canvas inside it inherits that zero height. applyDockState() runs UNCONDITIONALLY at mount, and
// docked (where stageWrap is the only visible piece) is the DEFAULT state -- so this fired on every load of
// every page that mounts this chrome, not intermittently. "Never loads" was exactly right.
//
// MEASURED BEFORE AND AFTER, real headless Chromium against the real page, not reasoned about: the canvas-
// host's getBoundingClientRect().height read 0 before this file's fix and 56 after, with stageWrap's computed
// display reading "block" before and "flex" after. That is what section 1 below re-proves on every run.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const { chromium, from: pwFrom } = resolvePlaywright(require_);
const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
if (skip) { console.log("demoChrome-selfcheck: SKIPPED -- " + skip); process.exit(0); }

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("demoChrome-selfcheck -- the docked avatar/gauges chrome, driven in a real browser\n");

// A tiny static file server over the real tree, same pattern sharpPanel-selfcheck.mjs already uses --
// demoChrome.js is a real ES module with real relative imports (avatarStage.js, svgGaugeSet.js, ...), so it
// is served for real rather than stubbed; only the network-backed bits it polls (system/stats, avatar/mood)
// are allowed to 404, which is what a box with no ai-bridge running looks like and is not this file's concern.
function serve() {
    return new Promise((resolve) => {
        const srv = http.createServer((req, res) => {
            const u = new URL(req.url, "http://x");
            let p = path.join(ROOT, decodeURIComponent(u.pathname));
            try { if (fs.statSync(p).isDirectory()) p = path.join(p, "index.html"); } catch {}
            fs.readFile(p, (err, data) => {
                if (err) { res.writeHead(404); res.end("not found"); return; }
                const ext = path.extname(p);
                const type = ext === ".js" || ext === ".mjs" ? "text/javascript"
                    : ext === ".html" ? "text/html" : ext === ".json" ? "application/json"
                    : ext === ".css" ? "text/css" : ext === ".glb" ? "model/gltf-binary" : "application/octet-stream";
                res.writeHead(200, { "Content-Type": type });
                res.end(data);
            });
        });
        srv.listen(0, "127.0.0.1", () => resolve({ srv, port: srv.address().port }));
    });
}

async function loadPage(browser, port, url) {
    const page = await browser.newContext().then((c) => c.newPage());
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    await page.goto("http://127.0.0.1:" + port + url, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(2500);   // avatarStage.js's GLB load + the mount fallback timer both need real time
    return { page, pageErrors };
}

const { srv, port } = await serve();
const b = await chromium.launch({ executablePath: HEADLESS_SHELL });

// ---- 1. THE BUG ITSELF: docked (the default), the stage row is flex and its canvas actually has height ------
{
    console.log("1. *** THE CANVAS-HOSTING ROW IS FLEX, NOT COLLAPSED TO BLOCK, IN THE DEFAULT DOCKED STATE ***");
    const { page, pageErrors } = await loadPage(b, port, "/webgpu-llm.html");
    ok("!! demoChrome actually mounted", await page.evaluate(() => !!document.getElementById("demoChrome")));
    const info = await page.evaluate(() => {
        const dc = document.getElementById("demoChrome");
        if (!dc) return null;
        // stageWrap is the second child in source order: pill, stageWrap, body, tickerOuter, svgTierWrap.
        const stageWrap = dc.children[1];
        if (!stageWrap) return { stageWrap: null };
        const canvasHost = stageWrap.children[1];   // rail, then canvasHost
        return {
            stageWrapDisplay: getComputedStyle(stageWrap).display,
            stageWrapVisible: getComputedStyle(stageWrap).display !== "none",
            canvasHostHeight: canvasHost ? canvasHost.getBoundingClientRect().height : null,
            canvasHeight: canvasHost ? (canvasHost.querySelector("canvas")?.getBoundingClientRect().height ?? null) : null,
        };
    });
    ok("!! *** stageWrap computes to display:flex, not the block it falls back to from an empty override ***",
        info && info.stageWrapDisplay === "flex", JSON.stringify(info));
    ok("stageWrap is actually visible in the default (docked) state -- this IS the top-right box Keith sees",
        info && info.stageWrapVisible === true);
    ok("!! *** THE CANVAS HOST HAS REAL, NONZERO HEIGHT -- MEASURED 0 BEFORE THIS FILE'S FIX, ON THIS SAME PAGE ***",
        info && info.canvasHostHeight > 0, "canvasHost=" + (info && info.canvasHostHeight) + "px");
    ok("!! ...and the canvas element inside it inherits that same real height",
        info && info.canvasHeight > 0, "canvas=" + (info && info.canvasHeight) + "px");
    ok("no uncaught page errors while mounting", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 200));

    // *** v4109 -- WIDTH FILL, MEASURED IN ACTUAL DRAWN PIXELS, NOT INFERRED FROM THE HEIGHT NUMBER. *** Keith:
    // "taller dock but not too taller, and spreading the scene wider." The obvious lever (avatarStage's
    // compact:true) was tried at v4107 and MEASURED WORSE -- width fill 78% -> 64%. This round found that
    // raising the docked height alone spreads the scene wider too, because halfH in camera()'s non-compact
    // diorama branch is a fixed constant while halfW is already pulled wide by the llama's forced roam range --
    // a short box was vertically constrained with width to spare. Read back with gl.readPixels rather than
    // trusting the CSS height number, because a taller CSS box proves nothing about how much of it the SCENE
    // actually draws into.
    const fill = await page.evaluate(() => {
        const dc = document.getElementById("demoChrome");
        const c = dc.children[1].children[1].querySelector("canvas");
        const gl = c.getContext("webgl2") || c.getContext("webgl");
        if (!gl) return null;
        const w = c.width, h = c.height;
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let minX = w, maxX = -1;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (px[(y * w + x) * 4 + 3] > 10) { if (x < minX) minX = x; if (x > maxX) maxX = x; } }
        return { w, h, widthFillPct: maxX < 0 ? 0 : Math.round(((maxX - minX + 1) / w) * 100) };
    });
    ok("!! *** the docked canvas fills a REAL majority of its width, measured in drawn pixels ***",
        !!fill && fill.widthFillPct >= 85,
        JSON.stringify(fill) + " -- v4106's original fix (canvas height 0px) measured 0%; the pre-v4109 64px " +
        "dock measured 78%; this asserts the v4109 96px height actually delivers the improvement it claims");
    await page.close();
}

// ---- 2. UNDOCKING RESTORES THE OTHER TWO FLEX ROWS THE SAME WAY, NOT JUST THE ONE KEITH HAPPENED TO SEE -------
{
    console.log("\n2. *** UNDOCKING (pill + body) IS THE SAME BUG SHAPE, FIXED THE SAME WAY ***");
    const { page } = await loadPage(b, port, "/webgpu-llm.html");
    // Docked is default (docked === true means the widget starts as the mini fidget strip); the undock click
    // listener is on stageHost (== canvasHost, stageWrap's SECOND child -- rail is the first), not on
    // stageWrap itself, so the click must land there rather than relying on bubbling from the parent.
    await page.evaluate(() => document.getElementById("demoChrome").children[1].children[1].dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await page.waitForTimeout(200);
    const info = await page.evaluate(() => {
        const dc = document.getElementById("demoChrome");
        const [pill, , body] = dc.children;
        return { pillDisplay: getComputedStyle(pill).display, bodyDisplay: getComputedStyle(body).display };
    });
    ok("!! the pill row is flex once undocked, not block",
        info.pillDisplay === "flex", JSON.stringify(info));
    ok("!! ...and so is the body row (avatar stamp + gauges), same fix applied to both",
        info.bodyDisplay === "flex", JSON.stringify(info));
    await page.close();
}

// ---- 3. THE SOURCE PROPERTY: every restore of a flex-built row names "flex", never the empty string ----------
{
    console.log("\n3. *** NO REMAINING \"RESTORE TO EMPTY STRING\" ON AN ELEMENT THAT WAS BUILT AS FLEX ***");
    const src = fs.readFileSync(path.join(ROOT, "ui", "demoChrome.js"), "utf8");
    ok("!! pill's own display is never reset to the empty string",
        !/pill\.style\.display = d \? "none" : "";/.test(src));
    ok("!! body's own display is never reset to the empty string",
        !/body\.style\.display = d \? "none" : "";/.test(src));
    ok("!! stageWrap's own display is never reset to the empty string, in either restore path",
        !/stageWrap\.style\.display = "";/.test(src));
    // tickerOuter's own creation block (Object.assign(tickerOuter.style, {...})) never sets a `display` key,
    // so it is a plain block-level div from the moment it exists -- its "" restore is therefore correct, not a
    // fourth instance of this bug, and is deliberately left alone.
    const tickerBlock = (src.match(/Object\.assign\(tickerOuter\.style,\s*{([\s\S]*?)}\)/) || [""])[1];
    ok("...and tickerOuter is correctly left alone -- it was never built with display:flex, so \"\" is its real default",
        tickerBlock.length > 0 && !/display/.test(tickerBlock), "creation block: " + JSON.stringify(tickerBlock.slice(0, 200)));
}

await b.close();
srv.close();
console.log("\n" + (fails ? fails + " FAILED" : "all passed"));
process.exit(fails ? 1 : 0);
