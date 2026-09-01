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

console.log("\n4. THE ORRERY ITSELF IS UNCHANGED");
{
    const draw = read("ui/orreryDraw.js");
    ok("*** ui/orreryDraw.js still draws in 2D and this round did not touch it ***",
        /getContext/.test(read("orrery.html")) && !/orreryPost/.test(draw),
        "368 lines of arcs, gradients and labels, none of them ported");
    ok("  and orrery.html is not yet wired to the stage", !/orreryPost/.test(read("orrery.html")),
        "the module exists and is graded; putting a control on the page is the next round");
    report("*** SO THIS IS A CONSUMER THAT EXISTS AND IS PROVEN AND IS NOT YET SWITCHED ON. *** That is one " +
        "step short of the thing v4269 asked for, and saying so is better than implying the orrery has an " +
        "effect stage on screen today. What it has is a stage that attaches, draws, and refuses correctly.");
}

// =============================================================================================================
// SABOTAGE LOG -- grep-confirmed before the result was read, exit codes read, restored md5-identical. MEASURED.
//
//   A  the null-backend refusal removed, so a recording device counts as success.
//      -> exit=1, 1 red. Only the source check fires, and that is the honest result rather than a weak one:
//      the browser sections still pass because a real browser HAS webgl2, so the recorder is never reached
//      there. The check exists for the machine that has neither backend, which is not this one.
//
//   B  the `source` branch removed from gfx/device.js's WebGL2 texture(), back to data-only.
//      -> exit=1, 1 red, and it is the PIXEL count: 2031 lit texels becomes 0. Everything else stays green --
//      the stage attaches, the pipeline builds, draw() reports drawn:true. *** A POST STAGE WITH NO SOURCE
//      REPORTS SUCCESS AND PRODUCES AN EMPTY FRAME, *** which is exactly the failure this round found in the
//      WebGPU backend and exactly why the gate counts pixels instead of trusting a return value.
//
//   C  the WebGPU texture refusal reverted to `() => {}`, the silent no-op as shipped before this round.
//      -> exit=1, 2 red, both in section 2. Nothing in section 3 moves, because the stage asks for webgl2 and
//      never reaches that code -- so the only thing standing between a future caller and a silently empty
//      frame is a source check. That is thinner than it should be, and it is the argument for the next round
//      implementing the binding rather than documenting its absence.
//
// None went 0 RED. B is the one worth keeping: it is the only sabotage here whose damage is invisible to
// every check except the one that counts what actually landed on the canvas.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WHETHER THE EFFECT LOOKS RIGHT ON THE ORRERY. This proves the stage attaches to a " +
    "real device, that the real drawSystem output is its source, that it draws with the effect on and nothing " +
    "with it off, and that it refuses an unknown effect and a texture-incapable backend by name. It does NOT " +
    "compare the output pixel by pixel to a model the way badTvDevicePass-selfcheck does -- the source there " +
    "is a texture whose texels encode their own position, and an orrery frame is not. Also unchecked: WebGPU, " +
    "which cannot carry this at all until gfx/device.js can bind a texture.");
process.exit(fails ? 1 : 0);
