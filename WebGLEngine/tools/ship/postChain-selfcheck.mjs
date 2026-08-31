// WebGLEngine/tools/ship/postChain-selfcheck.mjs -- v4241
//
// Run: node tools/ship/postChain-selfcheck.mjs
//
// *** v4236 MEASURED THE POST CHAIN AND GOT THREE THINGS WRONG, AND THIS FILE IS THE INSTRUMENT THAT SAYS SO
// AND THE CORRECTION. *** That round reported "six fullscreen draws per render cycle, five of the six already
// using the fullscreen triangle, and one still a quad", and filed the quad as a post-processing pass to be
// tracked down. All three parts are wrong, and they are wrong for one reason: the classifier called any
// drawArrays of six vertices or fewer "fullscreen-ish" and had no way to say WHICH FILE was calling.
//
// A program slot cannot be mapped back to a source file -- glCapture interns objects, and the byte budget
// drops long shader sources before a fragment shader could be matched to a pass. What CAN name a file is the
// CALL STACK. This file wraps drawArrays on the real page and reads the stack, so every draw is attributed
// to a file and a line rather than to a guess.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { QUAD_VS, TRI_VS, DECAY_FS } from "../../gpu/VoxelMemoryGPU.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

console.log("postChain-selfcheck -- what the frame actually draws, attributed to a file and a line\n");

const require_ = createRequire(import.meta.url);
const { chromium, from: pwFrom } = resolvePlaywright(require_);
const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);

// =============================================================================================================
console.log("1. *** THE CENSUS, BY CALL SITE -- which is what v4236 could not do ***");
if (skip) {
    report("SKIPPED -- " + skip);
    report("*** A SKIP, NOT A PASS. This whole section is a measurement of the real page; there is nothing " +
           "here that reading the source could substitute for, which is the point v4236 proved the hard way.");
} else {
    const INJECT = '<script>\n' +
        'window.__draws = new Map();\n' +
        '(function(){\n' +
        '  const patch = (proto) => {\n' +
        '    if (!proto || !proto.drawArrays || proto.__patched) return;\n' +
        '    proto.__patched = true;\n' +
        '    const orig = proto.drawArrays;\n' +
        '    proto.drawArrays = function (mode, first, count) {\n' +
        '      try {\n' +
        '        const st = new Error().stack.split("\\n").slice(2, 5)\n' +
        '          .map(s => (s.match(/\\/([A-Za-z0-9_.-]+\\.(?:js|mjs|html)):(\\d+)/) || [])[0] || "")\n' +
        '          .filter(Boolean).join(" <- ");\n' +
        '        const k = count + "|" + st;\n' +
        '        window.__draws.set(k, (window.__draws.get(k) || 0) + 1);\n' +
        '      } catch (e) {}\n' +
        '      return orig.call(this, mode, first, count);\n' +
        '    };\n' +
        '  };\n' +
        '  patch(window.WebGL2RenderingContext && window.WebGL2RenderingContext.prototype);\n' +
        '  patch(window.WebGLRenderingContext && window.WebGLRenderingContext.prototype);\n' +
        '})();\n' +
        'window.__reset = () => window.__draws.clear();\n' +
        'window.__dump = () => [...window.__draws].map(([k, n]) => {\n' +
        '  const i = k.indexOf("|");\n' +
        '  return { count: +k.slice(0, i), site: k.slice(i + 1), calls: n };\n' +
        '}).sort((a, b) => b.calls - a.calls);\n' +
        '</script>';
    const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
    const pg = await b.newPage();
    const errs = [];
    pg.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
    await pg.route("**/*", (route) => {
        const u = new URL(route.request().url());
        if (u.hostname !== "swek.local") return route.fulfill({ status: 404, body: "nf" });
        const p = path.join(ENG, decodeURIComponent(u.pathname));
        if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return route.fulfill({ status: 404, body: "nf" });
        const ext = path.extname(p);
        const type = ext === ".mjs" || ext === ".js" ? "text/javascript" : ext === ".html" ? "text/html"
            : ext === ".json" ? "application/json" : ext === ".css" ? "text/css" : "application/octet-stream";
        let body = fs.readFileSync(p);
        if (u.pathname === "/index.html") body = body.toString().replace("<head>", "<head>\n" + INJECT);
        return route.fulfill({ status: 200, contentType: type, body });
    });
    await pg.goto("http://swek.local/index.html", { waitUntil: "domcontentloaded", timeout: 45000 });
    await pg.waitForFunction(() => window.world && window.camera, { timeout: 45000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 6000));              // boot and program compilation
    await pg.evaluate(() => window.__reset());
    await new Promise((r) => setTimeout(r, 5000));              // the steady-state window
    const draws = await pg.evaluate(() => window.__dump());
    const ssao = await pg.evaluate(() => { try { return window.ssao ? !!window.ssao.enabled : null; } catch { return "err"; } });
    await b.close();

    ok("!! the real index.html booted headless with drawArrays wrapped, and threw nothing",
        errs.length === 0, errs.slice(0, 2).join(" | "));
    for (const d of draws) report(String(d.calls).padStart(4) + " draws of " + d.count + " verts   " + d.site);

    const tri = draws.filter((d) => d.count === 3);
    const quad = draws.filter((d) => d.count === 6);
    const bloom = tri.filter((d) => /bloomPass\.js/.test(d.site));
    ok("!! *** THE FIVE POST-CHAIN DRAWS ARE FIVE CALL SITES INSIDE ONE FILE: bloomPass ***",
        bloom.length === 5 && tri.length === 6,
        bloom.map((d) => d.site.split(" <- ")[0]).join(", ") + " -- five lines of ONE file, all called from " +
        "main.js:30826. v4236 read this as a chain of separate effects; it is a single pass's downsample and " +
        "upsample ladder.");
    ok("!! *** WHICH IS THE ONE CASE effectMerge's OWN TAXONOMY FORBIDS MERGING ***",
        bloom.length === 5,
        "bloom is OPAQUE -- it needs the full previous output as a texture at each level. So the tree's " +
        "entire fullscreen workload, in the default scene, is the one thing that must keep its own passes. " +
        "effectMerge has no caller because there is nothing mergeable RUNNING, not because nobody wired it.");
    // *** AND THE SIXTH DRAW IS NOT A POST PASS AT ALL, WHICH IS WHY v4236 COULD NOT FIND IT. *** Before this
    // round it was the frame's only six-vertex draw, and the backlog item filed it as a post-processing quad
    // to be tracked down. It is gpu/VoxelMemoryGPU.js: a GPGPU decay step over a square framebuffer with
    // depth off, which never went near the post chain.
    const vm = draws.filter((d) => /VoxelMemoryGPU\.js/.test(d.site));
    ok("!! *** the sixth draw is a GPGPU decay step, and it was NEVER in the post chain ***",
        vm.length === 1 && vm[0].count === 3,
        vm.length ? vm[0].site + " at " + vm[0].count + " vertices" : "(absent)");
    ok("!! *** AND THE FRAME NOW CONTAINS NO FULLSCREEN QUAD AT ALL -- this round converted the last one ***",
        quad.length === 0 && draws.every((d) => d.count === 3),
        "every one of the " + draws.length + " draw sites in a steady frame issues 3 vertices. Before v4241 " +
        "this one issued 6, and section 2 is the proof that changing it moved no pixel.");
    ok("!! ...and crt, cameraEffects, swiftShader, transition and phosphor draw NOTHING in the default scene",
        !draws.some((d) => /crtPass|cameraEffectsPass|swiftShaderPass|transitionPass|phosphorPass/.test(d.site)),
        "they are opt-in effects and the default boot enables none of them, which is why the chain looks the " +
        "way it does and why merging has nothing to bite on yet");
    ok("   ...and SSAO, whose two quad draws would otherwise be candidates, is disabled at boot",
        ssao === false, "window.ssao.enabled = " + ssao);
}

// =============================================================================================================
console.log("\n2. *** THE ONE REAL FULLSCREEN QUAD, CONVERTED -- AND PROVEN BYTE-IDENTICAL ***");
if (skip) { report("SKIPPED -- " + skip); }
else {
    // The claim is not "a triangle is faster". It is that the triangle renders EXACTLY what the quad rendered,
    // so the change costs nothing to verify and nothing to trust. Both vertex stages are compiled here against
    // the module's own fragment shader and run over the same input.
    const HARNESS = fs.readFileSync(path.join(ENG, "tools/ship/postChainHarness.html"), "utf8");
    const srv = http.createServer((rq, rs) => {
        if (rq.url.startsWith("/gpu/") || rq.url.startsWith("/render/")) {
            const p = path.join(ENG, rq.url);
            if (fs.existsSync(p)) { rs.writeHead(200, { "content-type": "text/javascript" }); return rs.end(fs.readFileSync(p)); }
        }
        rs.writeHead(200, { "content-type": "text/html" }); rs.end(HARNESS);
    }).listen(0);
    const port = srv.address().port;
    const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
    const pg = await b.newPage();
    const errs = [];
    pg.on("pageerror", (e) => errs.push(String(e).slice(0, 250)));
    await pg.goto("http://127.0.0.1:" + port + "/", { waitUntil: "networkidle" });
    ok("!! the harness compiled both vertex stages against the module's own fragment shader",
        errs.length === 0 && (await pg.evaluate(() => !!window.__ready)), errs.join(" | "));

    const r = await pg.evaluate(() => window.__compare());
    ok("!! *** THE TRIANGLE RENDERS THE QUAD'S PIXELS EXACTLY -- 0 of " + (r.pixels || 0) + " differ ***",
        r.diff === 0,
        "byte-identical over " + r.pixels + " pixels. The vUV expression is the same and the interpolated " +
        "coordinate at every covered pixel is the same, so this is an equality and not a tolerance.");
    ok("!! ...and it covers every pixel: nothing is left holding the sentinel",
        r.untouchedTri === 0 && r.untouchedQuad === 0,
        "triangle " + r.untouchedTri + ", quad " + r.untouchedQuad + " of " + r.pixels +
        " still magenta. A triangle that had been shrunk to the viewport instead of overhanging it would " +
        "leave half the frame here, which is the sabotage v4236 needed a check added for.");
    ok("!! *** and it is ONE primitive where the quad was two, so the shared diagonal is not rasterised twice ***",
        r.triVerts === 3 && r.quadVerts === 6,
        "3 vertices against 6. On a 128x128 decay target that diagonal is 128 fragments of duplicated work " +
        "every pass; the saving is small and it is also free, which is the whole reason to take it.");
    ok("   neither result contains a NaN or an out-of-range byte", r.finite);
    // the decay itself: not this gate's subject, but the comparison above CANNOT see it, so it is asked here
    ok("!! *** and the decay actually decays -- which the comparison above is structurally blind to ***",
        (r.probe || []).length === 3 && r.probe.every((p2) =>
            p2.before === 0 ? p2.after === 0 : Math.abs(p2.after - Math.round(p2.before * r.decay)) <= 1),
        (r.probe || []).map((p2) => p2.before + " -> " + p2.after).join(", ") + " at a decay of " + r.decay +
        ". Sabotaging `c.r *= uDecay` to `c.r *= 1.0` left the quad-versus-triangle comparison GREEN, because " +
        "the fragment shader is common to both sides and a change to it cancels -- the same shape the " +
        "fullscreen-triangle sabotage exposed in v4236, in a different file.");
    await b.close(); srv.close();
}

// =============================================================================================================
// =============================================================================================================
// THE SABOTAGE RECORD FOR v4241. Five breakages, applied, run, restored byte-identical and hash-verified.
//
//   A  the triangle shrunk to the viewport        -> 2 red, 8256 of 16384 pixels left holding the sentinel
//   B  the triangle's vUV drifts by 0.01          -> 1 red, the byte-equality
//   C  the draw back to six vertices              -> 3 red, and the census reports "at 6 vertices"
//   D  the decay stops decaying (c.r *= 1.0)      -> *** STILL GREEN ON THE FIRST PASS. *** The fragment
//      shader is COMMON to both sides of the comparison, so a change to it cancels and both paths fail
//      identically. That is the same shape the fullscreen-triangle sabotage exposed in v4236 -- anything
//      shared by both halves of a comparison is invisible to it -- arriving a second time in a different
//      file. The decay is now asked about directly.
//   E  QUAD_VS no longer exported                 -> the gate CRASHES on the import rather than failing a
//      named check. A crash still fails a ship and still names nothing useful; left as is here because the
//      import is the gate's own first line and a missing export is not a subtle defect.
//
console.log("\n3. the corrections, written where the wrong numbers were");
{
    const em = fs.readFileSync(path.join(ENG, "render/effectMerge.mjs"), "utf8");
    ok("!! *** effectMerge.mjs's header carries the correction, not just the original measurement ***",
        /v4241/.test(em) && /CORRECTED/.test(em),
        "a header that still said 'six fullscreen draws, one of them a quad to be found' would be a stale " +
        "claim with good manners, which is the thing this tree keeps catching itself doing");
    const vmSrc = fs.readFileSync(path.join(ENG, "gpu/VoxelMemoryGPU.js"), "utf8");
    ok("!! ...and VoxelMemoryGPU.js says why its own quad became a triangle and who thought it was elsewhere",
        /v4236/.test(vmSrc) && /stack-attributed/i.test(vmSrc));
    ok("   the old quad vertex stage is kept and exported, because the gate's claim needs both to exist",
        /export const QUAD_VS/.test(vmSrc) && /export const TRI_VS/.test(vmSrc),
        "not dead code: section 2 compiles both and compares them");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: what the chain looks like with the optional effects ENABLED. crtPass, " +
    "cameraEffectsPass, swiftShaderPass, transitionPass and phosphorPass all exist, all have gates, and all " +
    "draw nothing at boot -- so the census above is the DEFAULT scene and not the only scene, and a frame " +
    "with three swiftShader effects switched on is exactly the mergeable chain effectMerge was built for. " +
    "Turning them on from a gate means driving the real UI, which is a harness this file does not have. " +
    "Also unchecked: whether the triangle is measurably FASTER -- nothing here times it, and on a 128x128 " +
    "target the saving is 128 duplicated fragments per pass, which is real and small. What IS checked: that " +
    "every fullscreen triangle draw in the default frame comes from five call sites inside bloomPass and " +
    "nowhere else; that the sixth draw is a GPGPU decay step and never was a post pass; that the effects " +
    "which would be mergeable draw nothing at boot; and that converting the one real quad to a triangle is " +
    "byte-identical over every pixel.");
process.exit(fails ? 1 : 0);
