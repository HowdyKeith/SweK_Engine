#!/usr/bin/env node
// WebGLEngine/tools/ship/avatarZWander-selfcheck.mjs -- v4304
//
// GATES #85: the diorama avatar walks in DEPTH, not only across. Keith: "the walking avatar could walk away
// from the front of the room; it could get smaller back there." face/avatarStage.js's wander was X-only since
// v894; the room has been 1.8 deep the whole time and the avatar's z was a constant nothing changed.
//
// Section A reads the source: a z target beside the x target, one speed along the path (hypot, so a diagonal
// is not a sprint), a yaw from atan2 that keeps the v894 sideways turn exactly, and a depth range that stays
// inside the room. Section B WATCHES it: the real stage in a real browser, the avatar sampled every half
// second for thirty seconds through the stage's own avatar() handle, and z must MOVE, stay inside its roam
// range, and stay inside the room. A control: with the same samples, x still wanders too -- the depth walk
// did not replace the old one.
//
// Run: node tools/ship/avatarZWander-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (c, name, detail) => { console.log(`  ${c ? "PASS" : "FAIL"}${c ? "  " : "  !! "}${name}${detail ? "   " + detail : ""}`); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const src = fs.readFileSync(path.join(ENG, "face/avatarStage.js"), "utf8");

// ---------------------------------------------------------------------------------------------------------
sec("A. THE SOURCE: A DEPTH TARGET, ONE SPEED ALONG THE PATH, A RANGE INSIDE THE ROOM");
// ---------------------------------------------------------------------------------------------------------
{
    const m = src.match(/const ROAM_Z_MIN = (-?[\d.]+), ROAM_Z_MAX = (-?[\d.]+), ROAM_Z_HOME = (-?[\d.]+);/);
    ok(!!m, "the roam depth range is named in one place", m ? `[${m[1]}, ${m[2]}], home ${m[3]}` : "not found");
    if (m) {
        const [zMin, zMax, zHome] = [m[1], m[2], m[3]].map(Number);
        const D = Number((src.match(/W=\(sceneMaxX\+1\.05\)\+0\.9, D=([\d.]+), H=/) || [])[1]);
        ok(D === 1.8 && zMin > -D / 2 + 0.3 && zMax < D / 2 && zHome > zMin && zHome < zMax,
           "*** and it sits inside the room: the back wall is at -D/2 = -0.9, the range starts at least 0.3 in front of it ***",
           `room D ${D}, back wall ${-D / 2}, range [${zMin}, ${zMax}]`);
    }
    ok(/targetZ: ROAM_Z_HOME/.test(src) && /A\.targetZ = \(hot\.val < 0\.1\)/.test(src), "every retarget picks a depth: anywhere in a quiet room, near the front for a hot gauge");
    ok(/dist = Math\.hypot\(dx, dz\)/.test(src) && /A\.x \+= dx \/ dist \* step; A\.z \+= dz \/ dist \* step;/.test(src),
       "*** one speed along the path: a diagonal walk is not faster than a straight one ***");
    ok(/Math\.atan2\(dx, dz\) \* \(0\.8 \/ \(Math\.PI \/ 2\)\)/.test(src), "yaw comes from atan2, scaled so a pure sideways walk is still the v894 0.8 rad turn");
    ok(/if\(inPickup\) A\.targetZ = ROAM_Z_HOME;/.test(src), "a dial pickup happens from the front row");
    ok(/const avatar = \(\) => \(\{ x: A\.x, z: A\.z, targetX: A\.targetX, targetZ: A\.targetZ/.test(src) && /window\.__avatarStages/.test(src),
       "the stage exposes avatar() and registers itself on window.__avatarStages, so this gate can watch");
}

// ---------------------------------------------------------------------------------------------------------
sec("B. IN A REAL BROWSER (the demoChrome dock): THIRTY SECONDS OF WANDER, z MOVES AND STAYS IN THE ROOM; x STILL WANDERS TOO");
// ---------------------------------------------------------------------------------------------------------
const { chromium, from: pwFrom } = resolvePlaywright(require_);
const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
if (skip) { console.log("  SKIP  section B -- " + skip); } else {
    const browser = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await page.route("**/*", (route) => {
        const u = new URL(route.request().url());
        const p = path.join(ENG, decodeURIComponent(u.pathname));
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
            const ext = path.extname(p);
            const type = ext === ".mjs" || ext === ".js" ? "text/javascript" : ext === ".html" ? "text/html" : ext === ".glb" ? "model/gltf-binary" : ext === ".json" ? "application/json" : "text/plain";
            return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(p) });
        }
        return route.fulfill({ status: 404, body: "not found" });
    });
    try {
        // battleship3d.html, not avatarstage.html: the first draft watched avatarstage.html and read forty samples
        // of x = 0, z = 0, not moving -- its default scene is "focus", which pins the avatar at the origin on
        // purpose (drawFocus), and it mounts no gauges, and the wander returns early with no gauges to patrol.
        // The demoChrome dock on battleship3d.html mounts the wide diorama with four gauges: the real wander.
        await page.goto("http://localhost/battleship3d.html", { waitUntil: "domcontentloaded", timeout: 30000 });
        let err = null;
        await page.waitForFunction(() => window.__avatarStages && window.__avatarStages.length && typeof window.__avatarStages[0].avatar === "function",
            undefined, { timeout: 30000 }).catch((e) => { err = e; });
        ok(!err, "*** battleship3d.html's demoChrome dock mounts a stage that exposes avatar() ***", err ? String(err).slice(0, 120) : "mounted");
        const samples = [];
        // Thirty seconds, not twenty, and a span of 0.08 rather than 0.15: the dock's gauges carry live values, so
        // the room is "hot" and by design the avatar keeps to the front third (targetZ in [HOME - 0.35, HOME]);
        // the first draft asked for a quiet-room excursion and read 0.14 of a 0.35 range. The quiet-room range
        // is asserted from the source in section A; here the depth walk is asserted to HAPPEN.
        for (let i = 0; i < 60; i++) { await page.waitForTimeout(500); samples.push(await page.evaluate(() => window.__avatarStages[0].avatar())); }
        const zs = samples.map((s) => s.z), xs = samples.map((s) => s.x), [zMin, zMax] = samples[0].roamZ;
        const zSpan = Math.max(...zs) - Math.min(...zs), xSpan = Math.max(...xs) - Math.min(...xs);
        ok(zSpan > 0.08, "*** z MOVED over thirty seconds: the avatar stepped back into the room and forward again ***", `z from ${Math.min(...zs).toFixed(2)} to ${Math.max(...zs).toFixed(2)} (span ${zSpan.toFixed(2)})`);
        ok(zs.every((z) => z >= zMin - 1e-6 && z <= zMax + 1e-6), "and every z stayed inside the roam range", `[${zMin}, ${zMax}]`);
        ok(zs.every((z) => z > -0.9 && z < 0.9), "and inside the room (back wall at -0.9)");
        ok(samples.every((s) => s.targetZ >= zMin && s.targetZ <= zMax), "every depth target was inside the range too");
        ok(xSpan > 0.15, "CONTROL: x still wanders -- the depth walk joined the old one, it did not replace it", `x span ${xSpan.toFixed(2)}`);
        const moved = samples.filter((s) => s.moving).length;
        ok(moved > 0 && moved < samples.length, "the avatar both walked and stood still during the watch", `${moved} of ${samples.length} samples moving`);
        ok(!samples[0].compact, "demoChrome's dock is the wide diorama (compact:false, v4107's measurement), so this is the full wander");
    } catch (e) {
        ok(false, "section B ran to its end", String(e && e.message || e).slice(0, 160));
    } finally { await browser.close(); }
}

// ---- SABOTAGE LOG ---------------------------------------------------------------------------------------
//
//   A  dz forced to 0 in the move step (the x walk untouched).
//      -> exit=1, one line: "z from 0.35 to 0.35 (span 0.00)" over thirty seconds while x still wandered. The
//      browser watch is the only line that sees this; every source check stays green.
//
//   B  ROAM_Z_MIN moved to -0.85, five centimetres from the back wall.
//      -> exit=1, two lines: section A's room check, and -- unexpectedly -- the browser span fell to 0.04,
//      because a target near the wall is a long walk the avatar had not finished when the watch ended.
//      Recorded because a short watch reads a long walk as no walk; the thirty seconds is a floor, not a
//      constant to trim.
//
//   Also caught while writing: the first draft watched avatarstage.html and read forty samples of x = 0,
//   z = 0, not moving -- its default scene pins the avatar (drawFocus) and mounts no gauges, so the wander
//   never ran. A gate that watches the wrong page passes the sabotage of nothing.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: what it LOOKS like -- that a figure at z = -0.5 renders smaller than one at z = 0.45 is " +
    "perspective's promise, measured by dockFraming.mjs's coverage instrument rather than here.");
process.exit(fails ? 1 : 0);
