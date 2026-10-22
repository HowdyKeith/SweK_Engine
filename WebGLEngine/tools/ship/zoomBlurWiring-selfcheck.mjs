// WebGLEngine/tools/ship/zoomBlurWiring-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). (~6 s with a browser; section 1 alone ~0.1 s)
//
// Run: node tools/ship/zoomBlurWiring-selfcheck.mjs
//
// THE ZOOM BLUR, WIRED INTO render/bloomPass.js AND HELD TO THE KERNEL IT WIRES. v4504 built render/zoomBlur.mjs (the generated GLSL + WGSL, a CPU twin, tools/ship/zoomBlur-selfcheck.mjs) and
// deliberately did not wire it: that the GLSL had never been compiled by a live context. This gate runs in headless Chromium, which DOES have a WebGL2 context (SwiftShader), and so compiles it:
//   1  THE SOURCE      bloomPass.js imports the GLSL from zoomBlur.mjs instead of spelling a second copy; the pass is off by default (zoomBlurStrength 0); its program and targets are created lazily, only
//                      behind that strength; apply() reads one local `sceneSrc` in the bright, god-ray and composite passes and the blur is the only thing that changes it;
//   2  THE LIVE PASS   (needs a browser; SKIPPED, and said, without one) in a real WebGL2 context:
//        - the GLSL compiles and links, with no GL error and no console error;
//        - strength 0 is an identity to within 1e-5 on the half-float scene target -- NOT bit-exact in GL (measured: ~4e-6, the interpolated uv is off the texel centre), so OFF is exact because apply() does not run the pass at all;
//        - the pass agrees with the CPU twin (zoomBlurCpu) to within 2 of 255 levels at an off-centre march on a non-square frame, so neither the axes nor the uv orientation are swapped;
//        - apply() with the blur on reads the BLURRED scene in every later pass: its composite equals the composite of the twin-blurred scene fed in with the blur off, and differs from the unblurred one;
//        - with the blur off apply() creates no program and no target at all, and is deterministic;
//        - a resize drops the zoom target and the next use rebuilds it at the new size.
//
// SABOTAGES, each applied to the real render/bloomPass.js, restored, md5 verified; every one red by name (rows red): the pass always on 3 | the composite reading the unblurred scene 2 |
// the centre's y flipped 3 | the strength uniform ignored 2 | the stale-size target kept on resize 2 | the program compiled eagerly in _initPrograms 3 | the default strength 0.1 3.
//
// NOT GRADED, said plainly: stereo (the pass runs on the whole target and ignores the eye rect), a WebGPU twin of the wiring (the WGSL kernel is graded by zoomBlur-selfcheck), and any real GPU:
// SwiftShader is a software rasteriser. A page that turns the blur on is also not written yet; the field exists and no page sets it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL, webglLaunchArgs } from "./playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);
const bp = fs.readFileSync(path.join(ENG, "render/bloomPass.js"), "utf8");
const flat = (s) => s.replace(/\s+/g, " ");
const apply = bp.slice(bp.indexOf("    apply(outRect = null) {"));

console.log("zoomBlurWiring-selfcheck -- the zoom blur in bloomPass\n");
console.log("1. THE SOURCE");
{
    ok("!! bloomPass.js IMPORTS the zoom blur's GLSL from render/zoomBlur.mjs and spells no second copy of the march", /import \{ FRAGMENT_GLSL as ZOOM_BLUR_FS \} from "\.\/zoomBlur\.mjs";/.test(bp) && !/for \(int i = 0; i < N; i\+\+\)/.test(bp) && fs.existsSync(path.join(ENG, "render/zoomBlur.mjs")));
    ok("!! the pass is OFF by default: zoomBlurStrength starts at 0 and the centre at the middle", /this\.zoomBlurStrength = 0;/.test(bp) && /this\.zoomBlurCentre\s*=\s*\[0\.5, 0\.5\];/.test(bp));
    ok("!! its program and targets are created LAZILY: nothing compiles it in the constructor or _initPrograms, only _ensureZoom() does, and only _runZoomBlur() calls that", !/_initPrograms\(\) \{[^}]*zoom/i.test(bp) && /_ensureZoom\(\) \{/.test(bp) && (bp.match(/_ensureZoom\(\)/g) || []).length === 2 && /this\._ensureZoom\(\);/.test(bp));
    ok("!! apply() runs the pass ONLY behind `zoomBlurStrength > 0`, and the later passes read the local `sceneSrc` (three binds), never this.sceneTex directly", /if \(this\.zoomBlurStrength > 0\) sceneSrc = this\._runZoomBlur\(/.test(apply) && (apply.match(/gl\.bindTexture\(gl\.TEXTURE_2D, sceneSrc\);/g) || []).length === 3 && !/gl\.bindTexture\(gl\.TEXTURE_2D, this\.sceneTex\);/.test(apply) && /let sceneSrc = this\.sceneTex;/.test(apply));
    ok("  resize() drops the zoom target so a new size rebuilds it (a stale-size target would sample the wrong image)", /if \(this\.zoomTex\) \{ gl\.deleteTexture\(this\.zoomTex\); this\.zoomTex = null; \}/.test(bp) && /if \(this\.zoomFBO\) \{ gl\.deleteFramebuffer\(this\.zoomFBO\); this\.zoomFBO = null; \}/.test(bp));
    ok("  the vertex shader is the passthrough one with the varying renamed to the name the zoom fragment shader reads (vUv), and the centre is in GL uv, said where the field is declared", /const ZOOM_BLUR_VS = PASSTHROUGH_VS\.replace\(\/vUV\/g, "vUv"\);/.test(bp) && /centre is in GL uv/.test(flat(bp)));
}

console.log("\n2. THE LIVE PASS");
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) {
        report("live half SKIPPED -- " + skip);
        report("*** THAT IS A SKIP AND NOT A PASS: section 1 reads source, and source cannot show that the GLSL compiles, that strength 0 is an identity, or that apply() routes the blurred scene");
    } else {
        const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json" };
        const server = http.createServer((req, res) => {
            const u = decodeURIComponent(req.url.split("?")[0]);
            if (u === "/__zb.html") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end("<!doctype html><meta charset=utf-8><body></body>"); }
            const fp = path.join(ENG, u);
            if (fp.startsWith(ENG) && fs.existsSync(fp) && fs.statSync(fp).isFile()) { res.writeHead(200, { "Content-Type": types[path.extname(fp)] || "text/plain" }); return res.end(fs.readFileSync(fp)); }
            res.writeHead(404); res.end("not found");
        });
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        const base = "http://127.0.0.1:" + server.address().port;
        const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: webglLaunchArgs().args });
        try {
            const pg = await (await b.newContext()).newPage(); const errs = [];
            pg.on("pageerror", (e) => errs.push(String(e.message))); pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
            await pg.goto(base + "/__zb.html", { waitUntil: "load" });
            const r = await pg.evaluate(async () => {
                const BP = await import("/render/bloomPass.js"), Z = await import("/render/zoomBlur.mjs");
                const W = 64, H = 48;
                const cv = document.createElement("canvas"); cv.width = W; cv.height = H; document.body.appendChild(cv);
                const gl = cv.getContext("webgl2", { antialias: false });
                if (!gl) return { noGl: true };
                gl.getExtension("EXT_color_buffer_float"); gl.getExtension("EXT_color_buffer_half_float");
                const out = { gl: true, errors: [] };
                const bloom = new BP.BloomPass(gl, W, H);
                out.hdr = bloom.hdrEnabled;
                // a deterministic, non-symmetric scene on the 1/255 grid, row 0 = v 0 (bottom), uploaded straight into the scene texture
                const bytes = new Uint8Array(W * H * 4);
                for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const o = (j * W + i) * 4; bytes[o] = (i * 37 + j * 11) % 256; bytes[o + 1] = (i * 5 + j * 53) % 256; bytes[o + 2] = (i * i + j * 3) % 256; bytes[o + 3] = 255; }
                const upload = (tex, u8) => {
                    gl.bindTexture(gl.TEXTURE_2D, tex);
                    if (bloom.hdrEnabled) { const f = new Float32Array(u8.length); for (let k = 0; k < u8.length; k++) f[k] = u8[k] / 255; gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.FLOAT, f); }
                    else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, u8);
                };
                const scratch = gl.createFramebuffer();
                const read = (tex, w = W, h = H) => {   // linear float rgba, bottom row first
                    gl.bindFramebuffer(gl.FRAMEBUFFER, scratch); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
                    if (bloom.hdrEnabled) { const f = new Float32Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, f); return f; }
                    const u = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, u); return Float32Array.from(u, (x) => x / 255);
                };
                const err = (tag) => { const e = gl.getError(); if (e) out.errors.push(tag + ":" + e); };
                upload(bloom.sceneTex, bytes); err("upload");
                out.noZoomBefore = bloom.zoomProg === null && bloom.zoomTex === null && bloom.zoomFBO === null;
                const sceneBefore = read(bloom.sceneTex);

                // (a) strength 0 through the wired pass: an exact identity on the scene target
                bloom.zoomBlurStrength = 0; bloom.zoomBlurCentre = [0.3, 0.6];
                const t0 = bloom._runZoomBlur(); err("run0");
                const z0 = read(t0);
                let id = 0; for (let k = 0; k < z0.length; k++) if (k % 4 !== 3) id = Math.max(id, Math.abs(z0[k] - sceneBefore[k]));
                out.identityMaxDiff = id; out.compiled = !!bloom.zoomProg;

                // (b) the pass against the CPU twin, off-centre, on a non-square frame
                const K = { cx: 0.3, cy: 0.6, strength: 0.35 };
                bloom.zoomBlurCentre = [K.cx, K.cy]; bloom.zoomBlurStrength = K.strength;
                const t1 = bloom._runZoomBlur(); err("run1");
                const z1 = read(t1);
                const twin = Z.zoomBlurCpu({ rgba: bytes, w: W, h: H }, W, H, K);
                let worst = 0; for (let k = 0; k < twin.length; k++) if (k % 4 !== 3) worst = Math.max(worst, Math.abs(z1[k] * 255 - twin[k]));
                out.twinWorst = worst;
                // the same march with the centre mirrored must NOT agree: it is the check that the comparison above can fail
                const twinMirror = Z.zoomBlurCpu({ rgba: bytes, w: W, h: H }, W, H, { cx: 0.3, cy: 1 - 0.6, strength: 0.35 });
                let worstMirror = 0; for (let k = 0; k < twin.length; k++) if (k % 4 !== 3) worstMirror = Math.max(worstMirror, Math.abs(z1[k] * 255 - twinMirror[k]));
                out.twinMirrorWorst = worstMirror;

                // (c) apply(): the composite of the blurred scene equals the composite of the twin-blurred scene fed in with the blur OFF
                const outTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, outTex);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
                const outFbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, outFbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outTex, 0);
                bloom.outputFBO = outFbo;
                const grab = () => { gl.bindFramebuffer(gl.FRAMEBUFFER, outFbo); const u = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, u); return u; };
                const flatOpts = () => { bloom.ssaoStrength = 0; bloom.godRayStrength = 0; bloom.sunVisibility = 0; bloom.outlineStrength = 0; bloom.vignetteStrength = 0; bloom.intensity = 0; bloom.exposure = 1; };
                flatOpts();
                bloom.zoomBlurStrength = 0; bloom.apply(); err("apply off"); const off1 = grab();
                bloom.apply(); const off2 = grab();
                out.offDeterministic = off1.every((v, k) => v === off2[k]);
                out.noZoomAfterOff = bloom.zoomTex === null;   // _runZoomBlur was called directly above, so it exists; the flag below is about apply() alone
                bloom.zoomBlurStrength = K.strength; bloom.apply(); err("apply on"); const on1 = grab();
                let diffOnOff = 0; for (let k = 0; k < on1.length; k++) diffOnOff = Math.max(diffOnOff, Math.abs(on1[k] - off1[k]));
                out.onVsOff = diffOnOff;
                upload(bloom.sceneTex, twin);    // the twin's blurred frame becomes the scene; blur OFF
                bloom.zoomBlurStrength = 0; bloom.apply(); err("apply twin"); const viaTwin = grab();
                let worstC = 0; for (let k = 0; k < on1.length; k++) if (k % 4 !== 3) worstC = Math.max(worstC, Math.abs(on1[k] - viaTwin[k]));
                out.compositeWorst = worstC;

                // (d) a resize drops the target and the next use rebuilds it at the new size
                bloom.resize(32, 24);
                out.droppedOnResize = bloom.zoomTex === null && bloom.zoomFBO === null;
                bloom.zoomBlurStrength = 0.2; bloom._runZoomBlur(); err("run resized");
                gl.bindFramebuffer(gl.FRAMEBUFFER, bloom.zoomFBO);
                out.rebuiltComplete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
                out.rebuiltSize = [bloom.width, bloom.height];
                // (e) a fresh BloomPass that never turns the blur on never builds anything
                const fresh = new BP.BloomPass(gl, W, H); fresh.outputFBO = null; fresh.apply(); err("fresh apply");
                out.freshNoZoom = fresh.zoomProg === null && fresh.zoomTex === null && fresh.zoomFBO === null;
                return out;
            });
            if (r.noGl) { report("live half SKIPPED -- this Chromium has no WebGL2 context here"); }
            else {
                report(`WebGL2 up; scene target ${r.hdr ? "RGBA16F (half float)" : "RGBA8"}`);
                ok("!! *** the zoom blur's GLSL COMPILES AND LINKS in a real WebGL2 context -- the claim v4504 could not make -- with no GL error and no console error ***", r.compiled && r.errors.length === 0 && errs.length === 0, `errors: ${JSON.stringify(r.errors)} ${errs.join(" | ").slice(0, 200)}`);
                ok("!! *** strength 0 through the wired pass is an identity to within 1e-5 (a hundredth of an 8-bit level) -- NOT bit-exact in GL: the interpolated uv is not exactly the texel centre, so the bilinear sample bleeds ~4e-6 of a neighbour (the v4478 'bit-exact' was a WebGPU reading) ***", r.identityMaxDiff <= 1e-5, `max |pass - scene| = ${r.identityMaxDiff} (${(r.identityMaxDiff * 255).toExponential(1)} of an 8-bit level)`);
                ok("!! *** ...so OFF is exact by CONSTRUCTION, not by measurement: with the strength at 0 apply() never runs the pass (the live result is the unblurred one, deterministic, and a fresh BloomPass builds no zoom resources) ***", /if \(this\.zoomBlurStrength > 0\) sceneSrc = this\._runZoomBlur\(/.test(apply) && r.offDeterministic && r.freshNoZoom, "the `> 0` guard plus the determinism and no-resources rows");
                ok("!! *** the pass agrees with the CPU twin to within 2 of 255 levels at an off-centre march on a 64x48 frame (axes and uv orientation are right) ***", r.twinWorst <= 2, `worst ${r.twinWorst.toFixed(2)} levels`);
                ok("!! *** ...and the comparison CAN fail: the twin with the centre mirrored in y disagrees by many levels ***", r.twinMirrorWorst > 8, `mirrored twin differs by ${r.twinMirrorWorst.toFixed(1)} levels`);
                ok("!! *** apply() with the blur on feeds the BLURRED scene to every later pass: its composite equals the composite of the twin-blurred scene fed in with the blur off (within 3 levels) and differs from the unblurred composite ***", r.compositeWorst <= 3 && r.onVsOff > 6, `on vs twin-via-off worst ${r.compositeWorst}; on vs off ${r.onVsOff}`);
                ok("!! with the blur OFF apply() is deterministic and builds nothing: a fresh BloomPass that never enables it has no zoom program, texture or framebuffer", r.offDeterministic && r.freshNoZoom && r.noZoomBefore, `deterministic ${r.offDeterministic}, fresh builds nothing ${r.freshNoZoom}`);
                ok("  a resize drops the zoom target, and the next use rebuilds a COMPLETE framebuffer at the new size", r.droppedOnResize && r.rebuiltComplete && r.rebuiltSize.join("x") === "32x24", `dropped ${r.droppedOnResize}, complete ${r.rebuiltComplete}, ${r.rebuiltSize.join("x")}`);
                ok("!! the page made no script error and no console error", errs.length === 0, errs.join(" | ").slice(0, 200));
            }
        } finally { await b.close(); server.close(); }
    }
}

report("UNCHECKED, said plainly: stereo (the eye rect is ignored by this pass); a real GPU (SwiftShader here); the WebGPU twin of the wiring; and any page that turns the blur on -- zoomBlurStrength has no setter anywhere yet, which is the next small round.");
console.log("zoomBlurWiring-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
