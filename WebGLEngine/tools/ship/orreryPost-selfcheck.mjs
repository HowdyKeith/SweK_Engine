// WebGLEngine/tools/ship/orreryPost-selfcheck.mjs -- v4273
//
// GRADES ui/orreryPost.mjs -- gfx/device.js's FIRST NON-DEMO CONSUMER -- BY ATTACHING IT IN A REAL BROWSER.
//
// *** AND THE CONSUMER FOUND SOMETHING THE CENSUS COULD NOT. *** v4269 counted how many shader modules could
// travel to WebGPU. v4271 rendered one on both backends and diffed the frames. Neither asked whether the API
// could carry what a post effect NEEDS, and it cannot: gfx/device.js's WebGPU pass.texture was `() => {}`.
// Measured before it was changed -- the pipeline built without throwing, the call ran, nothing was bound.
// A post-processing effect samples a source texture by definition, so that backend could carry a texture-free
// render and no post effect at all, silently, while WebGL2 carried both.
//
// That is what "find the consumer first" buys, and it is the thing three rounds of counting and diffing missed.
"use strict";

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { EFFECTS, TEXTURE_CAPABLE_BACKENDS, postSkipReason } from "../../ui/orreryPost.mjs";
import { UV_CONVENTION } from "../../render/badTvDevicePass.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => {
    if (!cond) fails++;
    console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`);
};
const report = (s) => console.log(`  ----  ${s}`);
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");

console.log("\n1. THE STAGE DEGRADES INSTEAD OF THROWING, BECAUSE THE 2D ORRERY IS THE PRODUCT");
{
    ok("postSkipReason names the missing document rather than crashing",
        /no document/.test(postSkipReason({ document: null }) || ""), postSkipReason({ document: null }));
    ok("  and names the missing backends", /neither WebGPU nor WebGL2/.test(
        postSkipReason({ document: {}, backends: { webgpu: false, webgl2: false } }) || ""));
    ok("  and passes when a backend exists",
        postSkipReason({ document: {}, backends: { webgpu: false, webgl2: true } }) === null);
    const src = read("ui/orreryPost.mjs");
    ok("*** the null (recording) backend is REFUSED, not accepted as success ***",
        /backend === "null"/.test(src) && /nothing would be drawn/.test(src),
        "gfx/device.js falls back to a recorder that draws nothing -- right for a test, a regression on a page");
    ok("  and makeOrreryPost returns a reason rather than throwing", /return \{ ok: false, reason:/.test(src));
    report("the 2D drawing is what the orrery IS. This stage is an addition, so every failure path has to " +
        "leave the page exactly as good as it was.");
}

console.log("\n2. THE CONSTRAINT THE CONSUMER DISCOVERED, STATED AS DATA");
{
    const dev = read("gfx/device.js");
    ok("*** gfx/device.js's WebGPU texture bind now REFUSES BY NAME ***",
        /cannot bind textures yet/.test(dev), "it was `() => {}` -- a silent drop");
    ok("  and the refusal names the call and the alternative",
        /pass\.texture\(/.test(dev) && /webgl2 backend/.test(dev));
    ok("  the WebGL2 backend really does bind, so this is a gap and not a design",
        /activeTexture/.test(dev) && /uniform1i/.test(dev),
        "one backend implements it and the other did nothing: that is a hole, not a decision");
    ok("the post stage records which backends can carry it",
        TEXTURE_CAPABLE_BACKENDS.length === 1 && TEXTURE_CAPABLE_BACKENDS[0] === "webgl2");
    const src = read("ui/orreryPost.mjs");
    // *** AND THIS CHECK'S FIRST DRAFT FORBADE A STRING ITS OWN EXPLANATION CONTAINS. *** It asserted the
    // plural option name appears nowhere in the file -- but ui/orreryPost.mjs explains the mistake in a
    // comment, so the check went red on correct code. The ninth self-counting scan in nine rounds, and the
    // settled rule applies here as everywhere: a check about CODE strips comments first.
    const codeOf = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    const srcCode = codeOf(src);
    ok("  and asks gfx/device.js for one BY THE OPTION NAME IT ACTUALLY READS",
        /backend: wanted/.test(srcCode) && !/backends\s*:/.test(srcCode),
        "the first draft passed the plural form, which requestDevice does not read -- it takes `backend` or `prefer`");
    ok("CONTROL: the plural form IS present in the file, just not in its code",
        /backends/.test(src) && !/backends\s*:/.test(srcCode),
        "so the comment-stripping is doing work rather than passing vacuously");
    const devSrc = read("gfx/device.js");
    ok("  and that option name is the one in requestDevice", /opts\.backend \? \[opts\.backend\]/.test(devSrc),
        "checked against the callee rather than remembered");
    ok("  and refuses a non-capable backend with the reason attached",
        /cannot bind textures in gfx\/device\.js/.test(src));
    report("a preference with no reason attached is the kind of line a later round deletes as redundant. " +
        "This one carries why, and section 3 proves the why is true by running it.");
}

console.log("\n3. ATTACH IT IN A BROWSER AND DRAW");
{
    const requireFn = createRequire(import.meta.url);
    const pw = resolvePlaywright(requireFn);
    if (!pw || !fs.existsSync(HEADLESS_SHELL)) {
        console.log("  SKIP  no browser available here");
        report("*** NOT A PASS. *** Sections 1 and 2 read source. Only this one attaches the stage to a real " +
            "device, and 'the first consumer works' is the entire claim of the round.");
    } else {
        const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html" };
        const srv = http.createServer((q, s) => {
            let u = decodeURIComponent(String(q.url).split("?")[0]);
            if (u === "/") { s.writeHead(200, { "Content-Type": "text/html" }); return s.end("<!doctype html><title>o</title>"); }
            const f = path.join(ENG, u);
            if (!f.startsWith(ENG) || !fs.existsSync(f)) { s.writeHead(404); return s.end("no"); }
            s.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
            s.end(fs.readFileSync(f));
        });
        await new Promise((r) => srv.listen(0, "127.0.0.1", r));
        const browser = await pw.chromium.launch({ executablePath: HEADLESS_SHELL,
            args: ["--use-gl=swiftshader", "--enable-unsafe-webgpu"] });
        const page = await browser.newPage();
        const errs = [];
        page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
        await page.goto(`http://127.0.0.1:${srv.address().port}/`);
        const r = await page.evaluate(async () => {
            const { makeOrreryPost, EFFECTS } = await import("/ui/orreryPost.mjs");
            const { drawSystem } = await import("/ui/orreryDraw.js");
            const { buildOrrery } = await import("/world/orrery.mjs");
            const N = 96;
            // The REAL orrery drawing, into a real 2D canvas, as the source.
            const src = document.createElement("canvas"); src.width = N; src.height = N;
            const ctx = src.getContext("2d");
            ctx.fillStyle = "#000"; ctx.fillRect(0, 0, N, N);
            const system = buildOrrery([
                { name: "alpha", bytes: 4000, files: [{ path: "a/LICENSE", bytes: 100 }, { path: "a/x.js", bytes: 900 }] },
                { name: "beta", bytes: 9000, files: [{ path: "b/x.js", bytes: 9000 }] },
            ]);
            drawSystem(ctx, system, 10, { cx: N / 2, cy: N / 2, pxPerUnit: 3 });
            const before = ctx.getImageData(0, 0, N, N).data;
            let drawn = 0; for (let i = 0; i < before.length; i += 4) if (before[i] || before[i + 1] || before[i + 2]) drawn++;

            const dst = document.createElement("canvas"); dst.width = N; dst.height = N;
            const post = await makeOrreryPost(src, dst);
            if (!post.ok) return { ok: false, reason: post.reason, sourceLit: drawn };
            const off = post.draw(0);
            const setRes = post.setEffect("badTv");
            const on = post.draw(1.5);
            const gl = dst.getContext("webgl2") || dst.getContext("2d");
            let lit = 0;
            try {
                const g = dst.getContext("webgl2");
                if (g) { const px = new Uint8Array(N * N * 4); g.readPixels(0, 0, N, N, g.RGBA, g.UNSIGNED_BYTE, px);
                         for (let i = 0; i < px.length; i += 4) if (px[i] || px[i + 1] || px[i + 2]) lit++; }
            } catch (e) { /* reported via lit === 0 */ }
            const bad = post.setEffect("nope");
            post.destroy();
            return { ok: true, backend: post.backend, effects: post.effects, sourceLit: drawn,
                     offDrawn: off.drawn, offWhy: off.why, setRes, onDrawn: on.drawn, lit,
                     badEffect: bad, uv: post.uvConvention.space };
        }).catch((e) => ({ ok: false, reason: "evaluate threw: " + String(e).slice(0, 200) }));
        await browser.close(); srv.close();

        ok("*** the stage attaches to a real device ***", r.ok, r.ok ? `backend ${r.backend}` : r.reason);
        if (r.ok) {
            ok("  on a texture-capable backend", TEXTURE_CAPABLE_BACKENDS.includes(r.backend), r.backend);
            ok("CONTROL: the real orrery drawing put pixels on the source canvas", r.sourceLit > 200,
                `${r.sourceLit} lit texels of ${96 * 96} -- drawSystem from ui/orreryDraw.js, not a fixture`);
            ok("*** with the effect OFF it draws nothing and says so ***", r.offDrawn === false && /effect is off/.test(r.offWhy || ""),
                r.offWhy);
            ok("  setEffect accepts a known effect", r.setRes && r.setRes.ok === true && r.setRes.effect === "badTv");
            ok("  and REFUSES an unknown one by name", r.badEffect && r.badEffect.ok === false &&
                /no effect named/.test(r.badEffect.reason), r.badEffect && r.badEffect.reason);
            ok("*** with the effect ON it draws ***", r.onDrawn === true);
            ok("  and the target canvas has lit pixels", r.lit > 200,
                `${r.lit} lit texels -- a bound pipeline that never sampled would leave this at 0`);
            ok("  the uv convention it reports is framebuffer space", r.uv === "framebuffer");
            ok("  which is what a 2D canvas hands it", UV_CONVENTION.origin === "top-left",
                "row 0 of the ImageData is the top row, so no flip is needed anywhere");
        }
        if (errs.length) report("page errors seen: " + errs.slice(0, 2).join(" | "));
    }
}

console.log("\n4. THE PAGE IS WIRED, AND THE DRAWING ITSELF IS UNTOUCHED");
{
    const draw = read("ui/orreryDraw.js"), page = read("orrery.html");
    ok("*** ui/orreryDraw.js still draws in 2D and no round has ported it ***",
        !/orreryPost/.test(draw) && !/getContext\("webgl/.test(draw),
        "368 lines of arcs, gradients and labels, none of them touched");
    ok("*** and orrery.html NOW imports the stage -- v4273 shipped it unwired and said so ***",
        /orreryPost\.mjs/.test(page));
    ok("  there is an overlay canvas for it to draw into", /id="fx"/.test(page));
    ok("  which does not steal the pointer from the orrery", /#fx[^}]*pointer-events:\s*none/.test(page),
        "every click, drag and scroll must still reach #stage");
    ok("  and it starts hidden, so the page is unchanged until asked", /#fx[^}]*display:\s*none/.test(page));
    ok("  the effect runs AFTER the 2D frame is finished", /if \(system\) draw\(\);[\s\S]{0,400}fx\.draw\(t\)/.test(page),
        "uploading mid-draw would sample a half-built system");
    ok("*** and a failure to attach SHOWS THE REASON rather than sitting dead ***",
        /why\.textContent = fx\.reason/.test(page) && /signal: unavailable/.test(page),
        "v4267's subject was a built page nobody could reach; a silent dead control is the same defect");
    ok("  the target canvas is sized to match the source exactly",
        /fxc\.width = cv\.width; fxc\.height = cv\.height/.test(page),
        "a mismatch would rescale through the sampler rather than error");
}

console.log("\n5. LOAD THE REAL PAGE AND CLICK THE BUTTON");
{
    const requireFn2 = createRequire(import.meta.url);
    const pw2 = resolvePlaywright(requireFn2);
    if (!pw2 || !fs.existsSync(HEADLESS_SHELL)) {
        console.log("  SKIP  no browser available here");
        report("*** NOT A PASS. *** Section 4 reads the page's source. Only this one loads it, clicks the " +
            "control and looks at what appears -- which is the difference between wired and working.");
    } else {
        const MIME2 = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html",
                        ".json": "application/json" };
        const srv2 = http.createServer((q, s2) => {
            const u = decodeURIComponent(String(q.url).split("?")[0]);
            const f = path.join(ENG, u === "/" ? "orrery.html" : u);
            if (!f.startsWith(ENG) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s2.writeHead(404); return s2.end("no"); }
            s2.writeHead(200, { "Content-Type": MIME2[path.extname(f)] || "application/octet-stream" });
            s2.end(fs.readFileSync(f));
        });
        await new Promise((r) => srv2.listen(0, "127.0.0.1", r));
        const br = await pw2.chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
        const pg = await br.newPage();
        const perr = [];
        pg.on("pageerror", (e) => perr.push(String(e).slice(0, 200)));
        await pg.goto(`http://127.0.0.1:${srv2.address().port}/`, { waitUntil: "load" });
        await pg.waitForTimeout(1200);            // let the orrery fetch its data and draw a few frames
        // *** readPixels WAS THE WRONG INSTRUMENT HERE AND READ 0 ON A WORKING PAGE. ***
        // gfx/device.js creates its context with `opts.contextAttribs || {}`, so preserveDrawingBuffer is
        // false, and the browser discards the drawing buffer once a frame is presented. Section 3 gets away
        // with reading pixels because it draws and reads inside one task; this section clicks a button and
        // waits, so every read lands after a presentation and is guaranteed to be zero whatever the page did.
        //
        // A SCREENSHOT COMPOSITES, which is exactly what a person sees. So the measurement is: capture the
        // page with the effect off and on, and require the two images to DIFFER. That is also a stronger
        // claim than counting lit pixels -- it says the control changes what is on screen, not merely that
        // something was drawn somewhere.
        const state = async () => await pg.evaluate(() => ({
            label: document.getElementById("fxbtn").textContent.trim(),
            shown: getComputedStyle(document.getElementById("fx")).display,
            why: document.getElementById("fxwhy").textContent.trim(),
            disabled: document.getElementById("fxbtn").disabled,
        }));
        const shot = async () => (await pg.screenshot({ type: "png" }));
        let r2;
        try {
            // *** THE ORRERY ANIMATES, SO TWO SCREENSHOTS DIFFER WHETHER OR NOT THE EFFECT IS ON. ***
            // The first version of this check did not pause it, and sabotage A -- removing the per-frame
            // fx.draw() entirely -- still PASSED the "screen changes" line, because the bodies had moved
            // between the two captures. A difference test over a moving picture measures the clock.
            // So: pause first, confirm the page is actually still by capturing twice and requiring those to
            // MATCH, and only then attribute a difference to the effect.
            await pg.click("#play");
            await pg.waitForTimeout(400);
            const still1 = await shot();
            await pg.waitForTimeout(400);
            const still2 = await shot();
            const before = await state();
            const imgOff = await shot();
            await pg.click("#fxbtn");
            await pg.waitForTimeout(900);
            const after = await state();
            const imgOn = await shot();
            await pg.click("#fxbtn");
            await pg.waitForTimeout(300);
            const off = await state();
            const imgOff2 = await shot();
            const same = (a, b) => a.length === b.length && a.equals(b);
            r2 = { before, after, off,
                   paused: same(still1, still2),
                   changed: !same(imgOff, imgOn),
                   restored: !same(imgOn, imgOff2),
                   bytesOff: imgOff.length, bytesOn: imgOn.length };
        } catch (e) { r2 = { err: String(e).slice(0, 200) }; }
        await br.close(); srv2.close();

        ok("the page loads and the control starts OFF and hidden", !r2.err &&
            /off/.test(r2.before.label) && r2.before.shown === "none",
            r2.err || `${r2.before.label} / display:${r2.before.shown}`);
        ok("*** clicking it attaches and turns the effect ON ***", !r2.err && !r2.after.disabled &&
            /on/.test(r2.after.label) && r2.after.shown === "block",
            r2.err || `${r2.after.label} / display:${r2.after.shown} / ${r2.after.why}`);
        ok("  and it names the backend it got", !r2.err && /via /.test(r2.after.why || ""), r2.after && r2.after.why);
        ok("CONTROL: the page is PAUSED, so a difference is the effect and not the clock", !r2.err && r2.paused === true,
            r2.err || (r2.paused ? "two captures 400ms apart are byte-identical" :
                       "the page is still moving -- every comparison below would pass on motion alone"));
        ok("the composited page changes when it goes on", !r2.err && r2.changed === true,
            r2.err || `${r2.bytesOff} vs ${r2.bytesOn} bytes of PNG, with the clock paused`);
        ok("  and changes back when it goes off", !r2.err && r2.restored === true,
            "so the control is reversible and not a one-way door");
        report("*** AND THAT PAIR IS WEAKER THAN IT LOOKS, WHICH SABOTAGE A PROVED. *** Removing fx.draw() " +
            "from the frame loop entirely still passes both lines: revealing the overlay layer at all " +
            "perturbs compositing enough to change the PNG. Measured directly -- a never-drawn #fx captures " +
            "at 110,787 bytes and a drawn one at 128,266, a ratio of 1.2, which is not a discriminator. " +
            "Element screenshots do not isolate it either, because they composite what is behind. " +
            "*** SO THE THING THAT ACTUALLY CATCHES A IS THE SOURCE CHECK IN SECTION 4, AND THE PIXEL PROOF " +
            "LIVES IN SECTION 3, *** where the gate owns both canvases and reads in the same task. " +
            "gfx/device.js creates its context with `opts.contextAttribs || {}`, so preserveDrawingBuffer is " +
            "off and a read after presentation is guaranteed zero -- from outside this page, with the page " +
            "as it ships, the overlay's CONTENT cannot be measured. Saying so beats a check that reads like " +
            "proof and is not.");
        ok("  clicking again turns it off and hides the overlay", !r2.err &&
            /off/.test(r2.off.label) && r2.off.shown === "none");
        const real = (perr || []).filter((e) => !/favicon/i.test(e));
        ok("  and the page threw nothing on the way", real.length === 0, real.slice(0, 2).join(" | ") || "clean");
        report("this is the step v4273 named and did not take: the module existed, attached and drew, and " +
            "nothing on the page could ask it to. Now a person can.");
    }
}

// =============================================================================================================
// SABOTAGE LOG -- grep-confirmed before the result was read, exit codes read, restored md5-identical. MEASURED.
//
//   A  the null-backend refusal removed, so a recording device counts as success.
//      -> exit=1, 1 red. Only the source check fires, and that is honest rather than weak: a real browser HAS
//      webgl2, so the recorder is never reached here. The check exists for the machine that has neither.
//
//   B  the `source` branch removed from gfx/device.js's WebGL2 texture(), back to data-only.
//      -> exit=1, 1 red, and it is the PIXEL count in section 3: 2,031 lit texels becomes 0 while the stage
//      still attaches, the pipeline still builds and draw() still reports drawn:true. *** A POST STAGE WITH
//      NO SOURCE REPORTS SUCCESS AND PRODUCES AN EMPTY FRAME. ***
//
//   C  the WebGPU texture refusal reverted to `() => {}`, the silent no-op as shipped before v4273.
//      -> exit=1, 2 red, both in section 2. Nothing in section 3 moves, because the stage asks for webgl2.
//
//   D  fx.draw(t) removed from orrery.html's frame loop -- the effect is switched on and never rendered.
//      -> exit=1, 1 red, in SECTION 4's source check, and *** SECTION 5's SCREENSHOTS STILL PASS. *** That is
//      the sabotage that taught this file its own limit. Two earlier drafts of section 5 were fooled: the
//      first compared screenshots of an ANIMATING page, so any two differed and the check measured the clock;
//      pausing fixed that and A still passed, because revealing the overlay layer at all perturbs
//      compositing. Measured: a never-drawn #fx element captures at 110,787 PNG bytes against 128,266 drawn,
//      1.2x, and element screenshots composite what is behind them so they cannot isolate it. The page ships
//      without preserveDrawingBuffer, so a readPixels after presentation is guaranteed zero. The conclusion
//      is not a cleverer capture: it is that section 5 proves the CONTROL works and section 3 proves the
//      RENDER works, and neither is asked to do the other's job.
//
//   E  #fx given pointer-events back -> exit=1, 1 red.  F  the failure reason not shown -> exit=1, 1 red.
//
// None went 0 RED. B and D are the pair worth keeping: B is invisible to everything except a pixel count, and
// D is invisible to the pixel-shaped check that looks like it would catch it. Together they are the argument
// for keeping both a source check and a render check rather than trusting either alone.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WHETHER THE EFFECT LOOKS RIGHT ON THE ORRERY. This proves the stage attaches to a " +
    "real device, that the real drawSystem output is its source, that it draws with the effect on and nothing " +
    "with it off, and that it refuses an unknown effect and a texture-incapable backend by name. It does NOT " +
    "compare the output pixel by pixel to a model the way badTvDevicePass-selfcheck does -- the source there " +
    "is a texture whose texels encode their own position, and an orrery frame is not. Also unchecked: WebGPU, " +
    "which cannot carry this at all until gfx/device.js can bind a texture.");
process.exit(fails ? 1 : 0);
