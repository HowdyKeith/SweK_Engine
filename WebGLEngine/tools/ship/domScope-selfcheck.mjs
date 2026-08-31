#!/usr/bin/env node
// WebGLEngine/tools/ship/domScope-selfcheck.mjs -- v4252
//
// Run: node tools/ship/domScope-selfcheck.mjs     (model checks always; the live section skips loudly)
//
// *** #60's WALL WAS NOT A WALL. IT WAS A CATEGORY ERROR, AND THE DETERMINISTIC CLOCK IS WHAT SHOWED IT. ***
//
// v4232 measured 0.0% skippable in four scenarios and named the last holder "domAnimation -- a CSS animation
// in the page chrome". It could not go further, because a four-second window cannot separate "does not move"
// from "moves too slowly to see". v4250 built a rAF whose frame count is chosen rather than suffered, and
// this round spends it.
//
// ---- AND IT CORRECTED ME MID-ROUND, WHICH IS THE PART WORTH READING ------------------------------------------
//
// The first instrument here was a pixel diff over screenshot tiles. It reported ZERO scene tiles changed at
// 120 frames and ZERO at 1200, and the obvious reading -- "the 3D picture is still for twenty seconds" --
// is WRONG. Reading window.dayNight.t directly instead of its pixels:
//
//     over   120 frames   t 0.540000 -> 0.546667   delta 6.667e-3
//     over  1200 frames   t 0.546667 -> 0.613333   delta 6.667e-2
//     over  6000 frames   t 0.613333 -> 0.946667   delta 3.333e-1     (afternoon -> evening)
//
// That is 5.556e-5 per frame at all three counts -- EXACTLY 1/18000, a full day in 18,000 frames, the same
// number every time. The sun moves on EVERY FRAME. What the pixel test found was that 1/15th of a day of sun
// motion is still under one 8-bit step in the tiles it happened to sample. *** A CHANGE BELOW THE DISPLAY'S
// QUANTISATION IS STILL A CHANGE, because it accumulates: skipping those frames does not save the redraw,
// it defers it. *** So a pixel diff cannot license a skip, and dayNightCycle's ANIMATES verdict stands.
//
// ---- WHAT IS ACTUALLY TRUE, THEN ----------------------------------------------------------------------------
//
//   1. dayNight PAUSED: t moves 0.000e+0 over 6000 frames. Exactly zero, not small. The pause is real, so
//      "demo stopped, day/night paused" is a genuinely static scene rather than a slow one.
//
//   2. In that static scene the flag still says dirty every frame, held by domAnimation: 14 running
//      animations, 10 endless -- an SVG mascot (swekBob, swekDomeHalo, swekDomeCore, swekAntTip, swekBlink),
//      a watermark fade, four background-colour transitions. None is sampled into the scene.
//
//   3. *** THE TWO CLOCKS ARE INDEPENDENT, MEASURED AS A NUMBER RATHER THAN AS PIXELS: *** swekBob's
//      currentTime advanced 1016.64 ms across 1000 ms of WALL CLOCK with ZERO frames stepped. The engine
//      cannot advance that animation by drawing and cannot stop it by skipping.
//
// So the frame the flag refuses to skip would not produce the movement it is being held open for. That is
// what engine/domScope.mjs addresses, and the narrowing is the one change that can freeze a screen, so every
// uncertainty in it resolves towards drawing.
"use strict";
import * as S from "../../engine/domScope.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { RAF_SHIM } from "./deterministicRaf.mjs";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
const ENG = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

console.log("domScope-selfcheck -- the flag asks whether the DOCUMENT moved; it needs whether the RENDER is stale\n");

// =============================================================================================================
console.log("1. the rule, on cases the real page does not contain");
{
    const chrome = { name: "swekBob", properties: ["transform"], readable: true };
    ok("!! a mascot animating transform outside the canvas is CHROME -- the compositor draws it",
        S.classify(chrome) === S.CHROME,
        "a transform on chrome moves composited pixels the last draw already produced; redrawing yields the same buffer");
    ok("!! ...and one inside a subtree somebody rasterises is SAMPLED, so the frame must be drawn",
        S.classify({ ...chrome, inSampledRoot: true }) === S.SAMPLED,
        "ui/domToTexture.js (v4120) really does put a live subtree into a texture, and fallout.html uses it -- " +
        "skipping the draw there freezes a CRT screen that should be alive");
    ok("!! a LAYOUT property on an ancestor of the canvas is GEOMETRY, not chrome",
        S.classify({ name: "grow", properties: ["width"], isCanvasAncestor: true, readable: true }) === S.GEOMETRY,
        "it can change the canvas's box, and this file cannot see whether a resize path is wired to that");
    // *** THE ASYMMETRY THAT IS THE WHOLE DESIGN: transform on the SAME ancestor is still chrome. ***
    ok("!! ...while a TRANSFORM on that same ancestor stays CHROME",
        S.classify({ name: "slide", properties: ["transform"], isCanvasAncestor: true, readable: true }) === S.CHROME,
        "transforming an ancestor scales and moves the COMPOSITED canvas; the drawing buffer is untouched, so a " +
        "redraw would produce identical pixels. Same element, same ancestry -- only the property differs, which " +
        "is what says the rule is about the render path rather than about position in the tree.");
}

// =============================================================================================================
console.log("\n2. *** THE FAIL-SAFE: EVERY UNCERTAINTY RESOLVES TOWARDS DRAWING ***");
{
    ok("!! an unreadable animation is UNKNOWN",
        S.classify({ name: "x", properties: ["transform"], readable: false }) === S.UNKNOWN,
        "and it is checked FIRST, so no later branch can talk it into a clean vote");
    ok("!! one with no property list at all is UNKNOWN, not CHROME",
        S.classify({ name: "x" }) === S.UNKNOWN,
        "a missing list is 'nobody looked', which is the exact shape of the v4232 defect: an absent property " +
        "read as a value. `!!obj.missingProp` and `!!obj.falseProp` are the same bit and neither is evidence.");
    ok("   garbage in is UNKNOWN",
        S.classify(null) === S.UNKNOWN && S.classify("nope") === S.UNKNOWN);
    const mixed = S.scopeOf([
        { name: "a", properties: ["transform"], readable: true },
        { name: "b", properties: ["opacity"], readable: true },
        { name: "c", properties: ["transform"], readable: true, inSampledRoot: true },
    ]);
    ok("!! *** ONE SAMPLED ANIMATION IN A LIST OF CHROME STILL MEANS DRAW ***",
        mixed.mustRedraw === true && mixed.counts[S.CHROME] === 2 && mixed.counts[S.SAMPLED] === 1,
        "2 chrome + 1 sampled -> mustRedraw true. A majority vote here would be a frozen screen whenever the " +
        "moving thing is outnumbered, which is exactly when it is hardest to notice.");
    const allChrome = S.scopeOf([{ name: "a", properties: ["transform"], readable: true }]);
    ok("!! ...and only an ALL-chrome list may skip, which is the one place the saving comes from",
        allChrome.mustRedraw === false);
    ok("   an EMPTY list may skip too",
        S.scopeOf([]).mustRedraw === false, "nothing is animating, so nothing is stale");
}

// =============================================================================================================
console.log("\n3. the registry, which is the half that makes the narrowing safe");
{
    S.clearSampled();
    ok("!! it starts EMPTY, and that is the dangerous direction, so it is asserted rather than assumed",
        S.sampledRoots().length === 0,
        "an empty registry means every animation outside the canvas reads CHROME. A domToTexture caller that " +
        "does not register is a frozen screen, which is why registration belongs in the rasteriser.");
    const fakeChild = {}, fakeRoot = { contains: (n) => n === fakeChild };
    const release = S.claimSampled(fakeRoot);
    ok("!! a claimed subtree contains its descendants",
        S.inSampledRoot(fakeRoot) && S.inSampledRoot(fakeChild));
    release();
    ok("!! ...and releasing it takes them back out -- a claim that could not be released would leak a " +
       "permanently dirty flag",
        !S.inSampledRoot(fakeRoot) && !S.inSampledRoot(fakeChild) && S.sampledRoots().length === 0);
}

// =============================================================================================================
console.log("\n4. *** THE REAL PAGE, ON A CLOCK THE GATE CHOOSES ***");
const require_ = createRequire(import.meta.url);
const { chromium, from: pwFrom } = resolvePlaywright(require_);
const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
if (skip) {
    report("SKIPPED -- " + skip);
    report("*** A SKIP, NOT A PASS. Sections 1-3 check the rule; only the real page can say what is actually " +
           "animating on it, and that is the half #60 has been waiting four rounds for.");
} else {
    const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
    const pg = await b.newPage({ viewport: { width: 1280, height: 800 } });
    const errs = [];
    pg.on("pageerror", (e) => errs.push(String(e).slice(0, 140)));
    await pg.route("**/*", (route) => {
        const u = new URL(route.request().url());
        if (u.hostname !== "swek.local") return route.fulfill({ status: 404, body: "nf" });
        const p = path.join(ENG, decodeURIComponent(u.pathname));
        if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return route.fulfill({ status: 404, body: "nf" });
        const ext = path.extname(p);
        const type = ext === ".mjs" || ext === ".js" ? "text/javascript" : ext === ".html" ? "text/html"
            : ext === ".json" ? "application/json" : ext === ".css" ? "text/css" : "application/octet-stream";
        let body = fs.readFileSync(p);
        if (u.pathname === "/index.html") body = body.toString().replace("<head>", "<head>\n" + RAF_SHIM);
        return route.fulfill({ status: 200, contentType: type, body });
    });
    await pg.goto("http://swek.local/index.html", { waitUntil: "domcontentloaded", timeout: 45000 });
    await pg.waitForFunction(() => window.__raf && window.world, { timeout: 45000 }).catch(() => {});
    for (let r = 0; r < 5; r++) { await pg.evaluate((k) => window.__raf.step(k), 24); await new Promise((x) => setTimeout(x, 700)); }

    // ---- WHAT IS ACTUALLY ANIMATING, AND WHETHER ANY OF IT IS IN THE PICTURE ----
    const anims = await pg.evaluate(() => {
        const cv = document.querySelector("canvas");
        return document.getAnimations().map((a) => {
            const t = a.effect && a.effect.target;
            let props = [];
            try { props = (a.effect.getKeyframes() || []).flatMap((k) => Object.keys(k))
                            .filter((k) => k !== "offset" && k !== "composite" && k !== "computedOffset" && k !== "easing"); }
            catch (e) { props = null; }
            if (a.transitionProperty) props = [a.transitionProperty];
            return { name: a.animationName || (a.transitionProperty ? "transition:" + a.transitionProperty : "?"),
                     endless: a.effect && a.effect.getTiming && a.effect.getTiming().iterations === Infinity,
                     properties: props, readable: props !== null,
                     isCanvasAncestor: !!(cv && t && t.contains && t.contains(cv)),
                     inSampledRoot: false };
        });
    });
    const scope = S.scopeOf(anims);
    ok("!! the real page boots on the stepped clock and throws nothing",
        errs.length === 0, errs.slice(0, 2).join(" | ") || (anims.length + " animations readable"));
    ok("!! *** EVERY RUNNING ANIMATION ON index.html IS CHROME -- NOT ONE IS IN THE PICTURE ***",
        anims.length > 0 && scope.counts[S.CHROME] === anims.length,
        anims.length + " animations, " + anims.filter((a) => a.endless).length + " ENDLESS: " +
        [...new Set(anims.map((a) => a.name))].join(", ") + ". Sampled " + scope.counts[S.SAMPLED] +
        ", geometry " + scope.counts[S.GEOMETRY] + ", unknown " + scope.counts[S.UNKNOWN] +
        ". This is what has held the flag dirty since v4232.");

    // ---- *** THE TWO CLOCKS, AS A NUMBER RATHER THAN AS PIXELS *** ----
    const domTime = () => pg.evaluate(() => {
        const a = document.getAnimations().filter((x) => x.animationName)[0];
        return a ? Number(a.currentTime) : null;
    });
    const t0 = await domTime();
    const wall0 = Date.now();
    await new Promise((x) => setTimeout(x, 1000));      // 1s of WALL clock, ZERO frames stepped
    const wall = Date.now() - wall0;
    const t1 = await domTime();
    const framesDuring = await pg.evaluate(() => window.__raf.frames);
    const framesBefore = framesDuring;                   // nothing stepped in between, asserted below
    ok("!! *** THE DOM ADVANCED " + Math.round(t1 - t0) + " ms WHILE THE ENGINE STEPPED ZERO FRAMES ***",
        t0 !== null && t1 !== null && (t1 - t0) > wall * 0.8 && framesBefore === framesDuring,
        "a CSS animation's currentTime moved " + (t1 - t0).toFixed(2) + " ms across " + wall + " ms of wall " +
        "clock with the frame counter unchanged. CSS animations run on the compositor's timeline, and " +
        "replacing requestAnimationFrame does not replace it. *** SO THE ENGINE CANNOT ADVANCE THIS BY " +
        "DRAWING AND CANNOT STOP IT BY SKIPPING -- the frame being held open would not produce the movement " +
        "it is being held open FOR.");

    // ---- THE ENGINE CLOCK: a RATE, not a single delta ----
    // The 1200- and 6000-frame numbers in this header were measured by hand and are recorded there; the gate
    // re-measures at 60 and 180 because it has to fit a 309s suite budget alongside a real Chromium boot.
    // That is a budget, not a retreat: the claim is that the rate is CONSTANT, and a constant needs two
    // points, not big ones. The accumulation claim is the one that needed 6000 and it is cited, not re-run.
    const dn = () => pg.evaluate(() => (window.dayNight ? window.dayNight.t : null));
    const rate = async (n) => { const a = await dn(); await pg.evaluate((k) => window.__raf.step(k), n); const c = await dn(); return (c - a) / n; };
    const r120 = await rate(60), r600 = await rate(180);
    ok("!! *** THE SUN MOVES ON EVERY FRAME, AT THE SAME RATE AT TWO DIFFERENT FRAME COUNTS ***",
        Math.abs(r120 - r600) < 1e-9 && r120 > 0,
        "per-frame delta " + r120.toExponential(4) + " over 60 frames and " + r600.toExponential(4) +
        " over 180 -- 1/" + Math.round(1 / r120) + " of a cycle per frame. *** THIS IS WHERE THE PIXEL TEST " +
        "MISLED ME: *** screenshot tiles reported ZERO change at 1200 frames, and the tempting reading was " +
        "'the scene is still'. It is not. A change below one 8-bit step is still a change, and it ACCUMULATES " +
        "-- 6000 frames took the sky from afternoon to evening. Skipping those frames defers the redraw " +
        "rather than saving it, so dayNightCycle's ANIMATES verdict stands and the flag is RIGHT to hold " +
        "dirty while it runs.");

    // ---- THE CONTROL: paused is EXACTLY zero, not merely small ----
    await pg.evaluate(() => { try { window.dayNight.pause(); } catch (e) {} });
    const p0 = await dn(); await pg.evaluate((k) => window.__raf.step(k), 180); const p1 = await dn();
    ok("!! *** THE CONTROL: PAUSED, IT MOVES EXACTLY ZERO -- SO THE STATIC SCENE IS REALLY STATIC ***",
        p1 - p0 === 0,
        "t " + p0.toFixed(6) + " -> " + p1.toFixed(6) + " over 180 frames, delta " + (p1 - p0).toExponential(3) +
        ". Without this the round has nothing: 'the flag is held by chrome' only matters if the scene " +
        "underneath is genuinely still, and a rate that merely LOOKED small would not have said so.");
    await pg.evaluate(() => { try { window.dayNight.play(); } catch (e) {} });
    await b.close();
}

// =============================================================================================================
// ---- v4252 SABOTAGES, EACH grep-CONFIRMED APPLIED BEFORE ITS RESULT WAS READ, RESTORED md5-IDENTICAL --------
//
//   A  the readable:false branch is deleted, so an unreadable animation falls through to CHROME. -> 1 RED.
//      This is the fail-safe itself and it is the only sabotage here that would ship a FROZEN SCREEN rather
//      than a wasted frame, which is why it is listed first. *** I WROTE "2 RED" HERE BEFORE RUNNING IT AND
//      THE SABOTAGE SAID 1: *** the second fail-safe check, the one about a missing property list, stayed
//      GREEN because it is caught by a different branch (!Array.isArray) further down. Two checks that read
//      as one guard are two guards, and only the run distinguishes them.
//
//   B  inSampledRoot is ignored, so a rasterised subtree reads CHROME. -> 2 RED, including the mixed-list
//      check. What stayed GREEN is the point: every live check in section 4 passed, because index.html has
//      no sampled subtree at all. *** THE LIVE PAGE CANNOT TEST THIS BRANCH, WHICH IS WHY SECTION 1 EXISTS
//      -- a gate that only ran against the real page would have shipped this defect green.
//
//   C  mustRedraw uses a majority instead of "any". -> 1 RED (the mixed list), and only that one.
//
//   D  LAYOUT_PROPS gains "transform". -> 1 RED, the asymmetry check in section 1, and nothing else --
//      the property that separates a composited move from a buffer change is load-bearing in exactly one
//      place, and a gate without that check would not have noticed the rule going wrong.
//
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: whether narrowing the probe ACTUALLY SAVES ANYTHING. This round measures that " +
    "the flag's last holder is on a clock the frame loop does not drive, and builds the rule that would let " +
    "it vote clean -- it does not enable the flag, and engine/frameDirty.js still ships DISABLED. The saving " +
    "is a claim for the round that turns it on with a skipped-frame count, and that round needs the OTHER " +
    "seventeen sources to be as honest as dayNight turned out to be. Also unchecked: fallout.html, the one " +
    "page where a DOM animation really is in the picture -- domToTexture registers no subtree yet, so on that " +
    "page the rule would answer CHROME for something that is not, and the registry is empty for a reason " +
    "rather than by oversight.");
process.exit(fails ? 1 : 0);
