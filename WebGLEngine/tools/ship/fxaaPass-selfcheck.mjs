#!/usr/bin/env node
// WebGLEngine/tools/ship/fxaaPass-selfcheck.mjs
//
// Run: node tools/ship/fxaaPass-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES render/fxaaPass.js (tools/ship/nextRounds.mjs's fxaa-gap entry) and its wiring into main.js's real
// composite chain (bloom -> [fxaa] -> [phosphor] -> screen).
//
// *** SECTIONS 2-3 ARE HAND-PROVEN, NOT EYEBALLED. *** The FXAA formula's blend direction is built entirely
// from the four DIAGONAL neighbours' luma (NW, NE, SW, SE) -- the centre pixel and the horizontal/vertical
// neighbours never enter it. So whenever those four diagonals carry EXACTLY equal luma, dir.x and dir.y are
// each a difference of two equal sums and come out at EXACTLY 0.0, not merely small: dir = (0,0), every
// "along dir" sample in rgbA/rgbB then lands at uv + 0*anything = uv, and the whole function reduces to
// returning the centre texel completely unchanged -- an algebraic identity, true for ANY input, checked here
// on a real value rather than assumed. A test point picked with four equal diagonal neighbours is therefore
// not "probably unaffected", it is PROVEN unaffected before the gate ever runs, and section 2 asserts exact
// bit-for-bit equality on that basis. A test point picked where the diagonals genuinely disagree (a real
// staircase corner on a rasterised 45-degree edge) is the opposite case -- dir is provably NONZERO there -- so
// section 3 asserts the output must measurably differ from the pure input colour, or the shader is not doing
// the one thing FXAA exists to do.
"use strict";
import { SECURE_HOST } from "./webgpuHarness.mjs";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// render/bloomPass.js's own outputFBO convention, mirrored by fxaaPass.js -- a raw WebGL2 test needs a real
// context, not a THREE.js one, so this is the same server/launch pattern pipboyWireframe-selfcheck.mjs's
// runWebGL2InEngineOrigin established (--use-gl=swiftshader, NOT webgpuHarness.mjs's own runInEngineOrigin,
// which launches with --enable-unsafe-webgpu -- a different GL backend for a pass that has no WebGPU in it).
async function runWebGL2InEngineOrigin({ engineRoot, script, args = null }) {
    if (!fs.existsSync(HEADLESS_SHELL)) return { ok: false, skipped: true, reason: "no headless shell", result: null, pageErrors: [] };
    const pw = resolvePlaywright();
    if (!pw) return { ok: false, skipped: true, reason: "playwright not resolvable", result: null, pageErrors: [] };
    const root = path.resolve(engineRoot);
    const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html" };
    const srv = http.createServer((q, s) => {
        let u = decodeURIComponent(String(q.url).split("?")[0]);
        if (u === "/") { s.writeHead(200, { "Content-Type": "text/html" }); return s.end("<!doctype html><title>engine-origin</title>"); }
        const f = path.join(root, u);
        if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end("no"); }
        s.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
        s.end(fs.readFileSync(f));
    });
    await new Promise((r) => srv.listen(0, SECURE_HOST, r));
    let browser = null;
    try {
        browser = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
        const page = await browser.newPage();
        const pageErrors = [];
        page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 300)));
        page.on("console", (m) => { if (m.type() === "error") pageErrors.push("console: " + m.text().slice(0, 300)); });
        await page.goto(`http://${SECURE_HOST}:${srv.address().port}/`);
        const out = await page.evaluate(async ({ src, a }) => {
            try { const fn = new Function("return (" + src + ")")(); return { ok: true, result: await fn(a) }; }
            catch (e) { return { ok: false, reason: String(e && e.stack || e).slice(0, 600) }; }
        }, { src: String(script), a: args });
        return { skipped: false, ok: out.ok, result: out.ok ? out.result : null, reason: out.ok ? null : out.reason, pageErrors };
    } catch (e) {
        return { ok: false, skipped: false, reason: "harness error: " + String(e).slice(0, 300), result: null, pageErrors: [] };
    } finally { try { await browser?.close(); } catch {} srv.close(); }
}

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const report = (s) => console.log("  ----  " + s);
const sec = (s) => console.log("\n" + s);

// A 16x16 rasterised 45-degree edge: white where x+y >= 15, black otherwise -- the canonical aliasing test
// case (a straight diagonal line necessarily staircases across integer pixels). Built once, reused by every
// browser call below via `args`, so every section grades the SAME fixture.
const N = 16, THRESH = 15;
function buildDiagonalRGBA() {
    const px = new Array(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const v = (x + y >= THRESH) ? 255 : 0;
        const o = (y * N + x) * 4;
        px[o] = v; px[o + 1] = v; px[o + 2] = v; px[o + 3] = 255;
    }
    return px;
}
// (2,2)'s diagonal neighbours (1,1),(3,1),(1,3),(3,3) all have x+y < THRESH -- four EQUAL blacks, the
// algebraic-identity case. (7,7)'s diagonal neighbours (6,6)x+y=12,(8,6)x+y=14,(6,8)x+y=14 are black but
// (8,8)x+y=16 is white -- four UNEQUAL diagonals, the provably-nonzero-direction case.
const FLAT_PT = [2, 2], EDGE_PT = [7, 7];

// Runs a compiled VS/FS pair (built from the given FXAA fragment-shader TEXT, not a class instance) against
// the diagonal fixture and reads back both the flat point and the edge point. Section 1-4 call it with the
// real, unmodified FXAA_FRAG_GLSL (imported from the module); section 5's sabotage calls it with one exact
// substring replaced -- same shape as this tree's other shader gates (compile the ACTUAL text that was
// changed, not a hand-reasoned "should behave like" stand-in).
const SCRIPT = `async ({ n, thresh, flatPt, edgePt, pixels, fsOverride }) => {
    const { FxaaPass, FXAA_VERT_GLSL, FXAA_FRAG_GLSL } = await import("/render/fxaaPass.js");
    const canvas = document.createElement("canvas");
    canvas.width = n; canvas.height = n;
    const gl = canvas.getContext("webgl2");
    if (!gl) return { error: "no webgl2 context" };

    const pass = new FxaaPass(gl, n, n);
    if (!pass.ok) return { error: "shader failed to compile (unmodified source)", compiled: false };

    // if a sabotaged FS text was supplied, compile IT into a second program and swap it onto the pass in
    // place of the real one -- everything else (the VAO, the FBO, render()'s own binding/uniform code) is
    // reused unmodified, so only the fragment shader text under test differs from section 1-4's run.
    let compiledOverride = true;
    if (fsOverride) {
        try {
            const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
                if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
            const vs = mk(gl.VERTEX_SHADER, FXAA_VERT_GLSL), fs = mk(gl.FRAGMENT_SHADER, fsOverride);
            const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
            if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
            pass.prog = p;
            pass._loc = { uTex: gl.getUniformLocation(p, "uTex"), uRes: gl.getUniformLocation(p, "uRes") };
        } catch (e) { compiledOverride = false; }
    }
    if (!compiledOverride) return { error: "sabotaged shader failed to compile", compiled: false };

    // upload the fixture straight onto the pass's own colour attachment -- exact, hand-specified input,
    // bypassing a draw call (and any rasteriser rounding) entirely.
    gl.bindTexture(gl.TEXTURE_2D, pass.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(pixels));
    gl.bindTexture(gl.TEXTURE_2D, null);

    pass.enabled = true;
    pass.render();   // outputFBO is null -> draws to canvas's own default framebuffer
    const out = new Uint8Array(n * n * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, out);

    // the outputFBO redirect: render again into a second, independent target (the mechanism main.js uses
    // when phosphor is also on) and confirm it lands THERE, not on the screen.
    const redirectTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, redirectTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    const redirectFBO = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, redirectFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, redirectTex, 0);
    // paint the screen a sentinel colour so a mis-redirect (draws to the screen anyway) is visible on readback
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, n, n); gl.clearColor(0.2, 0.4, 0.6, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    pass.outputFBO = redirectFBO;
    pass.render();
    pass.outputFBO = null;
    const redirected = new Uint8Array(n * n * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, redirectFBO);
    gl.readPixels(0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, redirected);
    const screenAfter = new Uint8Array(n * n * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, screenAfter);

    const at = (buf, x, y) => { const o = (y * n + x) * 4; return [buf[o], buf[o + 1], buf[o + 2]]; };
    return {
        ok: true, compiled: true,
        flatOut: at(out, flatPt[0], flatPt[1]),
        flatIn: at(new Uint8Array(pixels), flatPt[0], flatPt[1]),
        edgeOut: at(out, edgePt[0], edgePt[1]),
        edgeIn: at(new Uint8Array(pixels), edgePt[0], edgePt[1]),
        redirectSample: at(redirected, edgePt[0], edgePt[1]),
        directSample: at(out, edgePt[0], edgePt[1]),
        screenSentinelSurvived: at(screenAfter, 0, 0),
    };
}`;

async function main() {
    const skip = !fs.existsSync(HEADLESS_SHELL) ? "no headless shell" : (!resolvePlaywright() ? "playwright not resolvable" : null);
    if (skip) { ok("browser jobs ran", false, "SKIP: " + skip + " -- a SKIP counts as a fail here"); console.log(fails ? "\nfxaaPass-selfcheck: " + fails + " FAILED" : "\nall checks pass"); process.exit(fails ? 1 : 0); }

    const pixels = buildDiagonalRGBA();

    sec("1. *** SHADER COMPILES ON A REAL WebGL2 CONTEXT ***");
    const r1 = await runWebGL2InEngineOrigin({ engineRoot: ENG, script: SCRIPT, args: { n: N, thresh: THRESH, flatPt: FLAT_PT, edgePt: EDGE_PT, pixels, fsOverride: null } });
    ok("!! FxaaPass constructs and compiles (pass.ok === true)", r1.ok && r1.result && r1.result.ok && r1.result.compiled,
       r1.ok ? JSON.stringify(r1.result && { compiled: r1.result.compiled, error: r1.result.error }) : "harness: " + r1.reason);
    if (r1.pageErrors && r1.pageErrors.length) report("page errors: " + r1.pageErrors.slice(0, 3).join(" | "));
    if (!r1.ok || !r1.result || !r1.result.ok) { console.log("\nfxaaPass-selfcheck: cannot continue, section 1 failed"); console.log(fails ? "\nfxaaPass-selfcheck: " + fails + " FAILED" : "\nall checks pass"); process.exit(1); }

    sec("2. *** ALGEBRAIC IDENTITY: FOUR EQUAL DIAGONAL NEIGHBOURS -> dir=(0,0) EXACTLY -> OUTPUT = INPUT EXACTLY ***");
    {
        const { flatIn, flatOut } = r1.result;
        ok("!! (2,2), deep inside the black region, comes back bit-for-bit identical to its input colour",
           flatIn[0] === flatOut[0] && flatIn[1] === flatOut[1] && flatIn[2] === flatOut[2],
           `in=${JSON.stringify(flatIn)} out=${JSON.stringify(flatOut)}`);
    }

    sec("3. *** THE THING FXAA EXISTS TO DO: A REAL STAIRCASE CORNER MEASURABLY BLENDS, IT DOES NOT PASS THROUGH ***");
    {
        const { edgeIn, edgeOut } = r1.result;
        const changed = Math.abs(edgeIn[0] - edgeOut[0]) + Math.abs(edgeIn[1] - edgeOut[1]) + Math.abs(edgeIn[2] - edgeOut[2]);
        ok("!! (7,7), a real staircase corner (diagonal neighbours 0,0,0,255 -- provably dir != (0,0)), changes measurably",
           changed >= 4, `in=${JSON.stringify(edgeIn)} out=${JSON.stringify(edgeOut)} |delta|=${changed}`);
        const inBounds = edgeOut.every((c) => c >= 0 && c <= 255 && Number.isFinite(c));
        ok("the blended value is still a valid colour channel (no NaN/overflow from the blend)", inBounds, JSON.stringify(edgeOut));
    }

    sec("4. *** outputFBO REDIRECT: THE MECHANISM main.js USES WHEN PHOSPHOR IS ALSO ON ***");
    {
        const { redirectSample, directSample, screenSentinelSurvived } = r1.result;
        ok("!! rendering with outputFBO set lands in THAT target, matching the direct (screen) render pixel for pixel",
           redirectSample[0] === directSample[0] && redirectSample[1] === directSample[1] && redirectSample[2] === directSample[2],
           `redirect=${JSON.stringify(redirectSample)} direct=${JSON.stringify(directSample)}`);
        ok("!! and the screen itself is untouched by the redirected render (still the sentinel clear colour)",
           screenSentinelSurvived[0] === 51 && screenSentinelSurvived[1] === 102 && screenSentinelSurvived[2] === 153,
           `screen after redirected render: ${JSON.stringify(screenSentinelSurvived)} (expected [51,102,153], 0.2/0.4/0.6 * 255)`);
    }

    sec("5. *** SABOTAGE, ON THE REAL EXPORTED SOURCE TEXT: dir PINNED AT (0,0) TURNS SECTION 3 RED, LEAVES SECTION 2 GREEN ***");
    {
        // fetch the real module text once, in Node, and do the exact string-replace here -- the SAME needle
        // fxaaPass.js actually contains, so a future refactor that changes this line's wording fails LOUDLY
        // (the replace is a no-op, sabotagedFS === original) rather than silently sabotaging nothing.
        const src = fs.readFileSync(path.join(ENG, "render", "fxaaPass.js"), "utf8");
        const needle = "dir = clamp(dir * rcpDirMin, vec2(-FXAA_SPAN_MAX), vec2(FXAA_SPAN_MAX)) * texel;";
        ok("the sabotage needle is present in the real source (so the replace below is not a silent no-op)", src.includes(needle));
        const fsMatch = src.match(/export const FXAA_FRAG_GLSL = `([\s\S]*?)`;/);
        ok("FXAA_FRAG_GLSL is exported as a string constant the gate can read and patch", !!fsMatch);
        const realFS = fsMatch[1];
        const sabotagedFS = realFS.replace(needle, "dir = vec2(0.0);");
        ok("the sabotage actually changed the text (replace found and replaced its target)", sabotagedFS !== realFS);

        const r5 = await runWebGL2InEngineOrigin({ engineRoot: ENG, script: SCRIPT, args: { n: N, thresh: THRESH, flatPt: FLAT_PT, edgePt: EDGE_PT, pixels, fsOverride: sabotagedFS } });
        if (!r5.ok || !r5.result || !r5.result.ok) {
            ok("!! sabotage harness ran", false, r5.ok ? JSON.stringify(r5.result) : "harness: " + r5.reason);
        } else {
            const { flatIn, flatOut, edgeIn, edgeOut } = r5.result;
            const flatIdentical = flatIn[0] === flatOut[0] && flatIn[1] === flatOut[1] && flatIn[2] === flatOut[2];
            const edgeChanged = Math.abs(edgeIn[0] - edgeOut[0]) + Math.abs(edgeIn[1] - edgeOut[1]) + Math.abs(edgeIn[2] - edgeOut[2]) >= 4;
            ok("!! *** under the sabotage, the edge corner NO LONGER changes -- section 3's check catches it ***",
               !edgeChanged, `sabotaged edge: in=${JSON.stringify(edgeIn)} out=${JSON.stringify(edgeOut)} (expected identical -- dir pinned at 0)`);
            ok("and the flat-region identity (section 2) is UNAFFECTED by this sabotage, as predicted",
               flatIdentical, `sabotaged flat: in=${JSON.stringify(flatIn)} out=${JSON.stringify(flatOut)}`);
        }
    }

    sec("6. *** WIRED INTO THE REAL ENGINE, NOT JUST BUILT: main.js's ACTUAL COMPOSITE CHAIN ***");
    {
        const mainSrc = fs.readFileSync(path.join(ENG, "main.js"), "utf8");
        ok("main.js imports FxaaPass from render/fxaaPass.js", /import\s*\{\s*FxaaPass\s*\}\s*from\s*"\.\/render\/fxaaPass\.js"/.test(mainSrc));
        ok("fxaaPass is constructed (new FxaaPass(gl, ...))", /fxaaPass\s*=\s*new FxaaPass\(/.test(mainSrc));
        ok("fxaaPass is resized alongside bloom/phosphor on canvas resize", /fxaaPass\.resize\(canvas\.width,\s*canvas\.height\)/.test(mainSrc));
        ok("fxaaPass.enabled is driven from gfxSettings.get(\"fxaa\") every frame, like grass/moss/rootarch", /fxaaPass\.enabled\s*=\s*fxaaPass\.ok\s*&&\s*gfxSettings\.get\("fxaa"\)/.test(mainSrc));
        ok("the composite branch redirects bloom's output into fxaaPass.inputFBO when fxaa is on", /bloomPass\.outputFBO\s*=\s*fxaaPass\.inputFBO/.test(mainSrc));
        ok("!! *** AND THE PHOSPHOR-ALSO-ON CASE CHAINS THROUGH IT: fxaaPass redirects into phosphorPass.inputFBO ***",
           /fxaaPass\.outputFBO\s*=\s*phosphorPass\.inputFBO/.test(mainSrc));
        const gfxSrc = fs.readFileSync(path.join(ENG, "ui", "graphicsSettings.js"), "utf8");
        ok("ui/graphicsSettings.js registers the \"fxaa\" toggle, default OFF", /fxaa:\s*false/.test(gfxSrc));
        ok("and exposes it as a settings-panel row", /\["fxaa",/.test(gfxSrc));
    }

    console.log(fails ? "\nfxaaPass-selfcheck: " + fails + " FAILED" : "\nfxaaPass-selfcheck: all checks pass");
    process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error("fxaaPass-selfcheck: threw " + (e && e.stack || e)); process.exit(1); });
