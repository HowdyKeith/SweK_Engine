#!/usr/bin/env node
// WebGLEngine/tools/ship/strengthField-selfcheck.mjs -- v4299 (Level 11)
//
// GRADES EFFECT STRENGTH AS A SPATIAL FIELD: badTv (WGSL and GLSL, through gfx/device.js on both backends) and crt
// (GLSL, through its own pass) take a per-pixel strength texture, and the CPU models take the same number.
//
// Three facts, each measured against the model rather than by eye: a WHITE field reproduces the scalar effect
// pixel for pixel (so nothing shipped changed); a BLACK field is the identity (the picture comes through
// untouched); and a BAND field applies the effect in the band and not outside it, exactly where the model says.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { FRAGMENT_WGSL, FIELD_FRAGMENT_WGSL, KNOB_ORDER } from "../../render/badTvWgsl.mjs";
import { FRAGMENT_GLSL, FIELD_FRAGMENT_GLSL, badTvFieldPipelineDesc, badTvPipelineDesc, FIELD_BINDING } from "../../render/badTvDevicePass.mjs";
import { sampleAt } from "../../render/badTvModel.mjs";
import { crtPixel, crtImage, DEFAULTS } from "../../render/crtModel.js";
import { parseBindings } from "../../render/wgslSpec.mjs";
import { constantField, bandField, radialField, fieldAt } from "../../render/strengthField.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const N = 64, TIME = 1.5;
const BAND = bandField(N, N, { v0: 0.25, v1: 0.75 });

console.log("\n1. THE FIELD VARIANTS ARE DERIVED FROM THE SCALAR SHADERS, NOT RETYPED");
{
    ok("*** FIELD_FRAGMENT_WGSL is FRAGMENT_WGSL plus one binding and one function ***",
        FIELD_FRAGMENT_WGSL.length > FRAGMENT_WGSL.length && FIELD_FRAGMENT_WGSL.includes("badTvOffsetAt") && FIELD_FRAGMENT_WGSL.includes("@binding(3) var tField"));
    const b = parseBindings(FIELD_FRAGMENT_WGSL);
    ok("  four bindings, the field last", b.length === 4 && b[3].name === FIELD_BINDING && /^texture_2d/.test(b[3].type), b.map((x) => x.name).join(","));
    ok("  the scalar shader is untouched: three bindings, no tField", parseBindings(FRAGMENT_WGSL).length === 3 && !FRAGMENT_WGSL.includes("tField"));
    ok("  the GLSL half carries the same extra sampler", FIELD_FRAGMENT_GLSL.includes("uniform sampler2D " + "tField;") && !FRAGMENT_GLSL.includes("tField"));
    ok("  both scale the displacement BEFORE the wrap", /fract\(uv\.x \+ badTvOffsetAt\(uv\.y, k\) \* s\)/.test(FIELD_FRAGMENT_WGSL) && /fract\(vUv\.x \+ badTvOffsetAt\(vUv\.y\) \* s\)/.test(FIELD_FRAGMENT_GLSL));
    const d = badTvFieldPipelineDesc(), d0 = badTvPipelineDesc();
    ok("  the field descriptor keeps the scalar one's knobs and uv convention", d.field === FIELD_BINDING && d.uniforms.map((u) => u.name).join() === d0.uniforms.map((u) => u.name).join() && d.uvConvention === d0.uvConvention && KNOB_ORDER.length === 6);
}

console.log("\n2. THE MODELS TAKE THE STRENGTH");
{
    const [u0, v0] = sampleAt(0.3, 0.7, TIME, {}, 0), [u1, v1] = sampleAt(0.3, 0.7, TIME, {}, 1), [uD, vD] = sampleAt(0.3, 0.7, TIME);
    ok("badTv at strength 0 is the identity", u0 === 0.3 && v0 === 0.7);
    ok("  at strength 1 it is the scalar effect, and the old signature still means 1", u1 === uD && v1 === vD && (u1 !== 0.3 || v1 !== 0.7));
    const sample = (x, y) => [x / 7, y / 7, 0.5];
    const raw = sample(3, 4), full = crtPixel(3, 4, 8, 8, sample, DEFAULTS), half = crtPixel(3, 4, 8, 8, sample, DEFAULTS, 0.5), none = crtPixel(3, 4, 8, 8, sample, DEFAULTS, 0);
    ok("crt at strength 0 is the source pixel", none.every((c, i) => Math.abs(c - raw[i]) < 1e-12));
    ok("  at strength 0.5 it is halfway", half.every((c, i) => Math.abs(c - (raw[i] + full[i]) / 2) < 1e-12), `raw ${raw.map((c) => c.toFixed(3))} crt ${full.map((c) => c.toFixed(3))}`);
    ok("  and the default is 1, unchanged", crtPixel(3, 4, 8, 8, sample, DEFAULTS).join() === full.join());
    ok("fieldAt samples nearest and clamps", fieldAt(BAND, 0.5, 0.5) === 1 && fieldAt(BAND, 0.5, 0.1) === 0 && fieldAt(constantField(0.5), 3, -2) === Math.round(0.5 * 255) / 255);
}

console.log("\n3. badTv WITH A FIELD, ON BOTH BACKENDS, AGAINST THE MODEL");
const skip = webgpuSkipReason();
let r = null;
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    r = await runInEngineOrigin({ engineRoot: ENG, args: { N, TIME, band: { width: BAND.width, height: BAND.height, data: Array.from(BAND.data) } }, script: `async (a) => {
        const { requestDevice } = await import("/gfx/device.js");
        const { badTvPipelineDesc, badTvFieldPipelineDesc, packKnobs, KNOB_ORDER } = await import("/render/badTvDevicePass.mjs");
        const N = a.N;
        const src = document.createElement("canvas"); src.width = N; src.height = N;
        const c2 = src.getContext("2d"); const img = c2.createImageData(N, N);
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = (y * N + x) * 4; img.data[i] = Math.round(x * 255 / (N - 1)); img.data[i + 1] = Math.round(y * 255 / (N - 1)); img.data[i + 2] = 0; img.data[i + 3] = 255; }
        c2.putImageData(img, 0, 0);
        const knobs = packKnobs({ time: a.TIME, rows: N });
        const out = {};
        for (const backend of ["webgpu", "webgl2"]) {
            const cv = document.createElement("canvas"); cv.width = N; cv.height = N;
            const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
            const plain = dev.pipeline(badTvPipelineDesc()), field = dev.pipeline(badTvFieldPipelineDesc());
            const tex = dev.texture({ source: src, nearest: true });
            const white = dev.texture({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]), nearest: true });
            const black = dev.texture({ width: 1, height: 1, data: new Uint8Array([0, 0, 0, 255]), nearest: true });
            const band = dev.texture({ width: a.band.width, height: a.band.height, data: new Uint8Array(a.band.data), nearest: true });
            const draw = (pipe, f) => dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); pass.use(pipe); for (let i = 0; i < KNOB_ORDER.length; i++) pass.uniform(KNOB_ORDER[i], knobs[i]); pass.texture("tDiffuse", tex, 0); if (f) pass.texture("tField", f, 1); pass.draw(3); }, { read: true });
            const o = { backend: dev.backend };
            o.plain = Array.from((await draw(plain, null)).pixels);
            o.white = Array.from((await draw(field, white)).pixels);
            o.black = Array.from((await draw(field, black)).pixels);
            o.band = Array.from((await draw(field, band)).pixels);
            dev.destroy(); out[backend] = o;
        }
        return out;
    }` });
    ok("*** the field pipeline builds and draws on both backends ***", r.ok, r.ok ? "" : r.reason);
    if (r.ok) {
        const diff = (A, B) => { let d = 0; for (let i = 0; i < A.length; i += 4) if (A[i] !== B[i] || A[i + 1] !== B[i + 1]) d++; return d; };
        const worstVs = (P, expect) => { let w = 0; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const [eR, eG] = expect(x, y), i = (y * N + x) * 4; w = Math.max(w, Math.abs(P[i] - eR), Math.abs(P[i + 1] - eG)); } return w; };
        const enc = (su, sv) => [Math.round(Math.min(N - 1, Math.floor(su * N)) * 255 / (N - 1)), Math.round(Math.min(N - 1, Math.floor(sv * N)) * 255 / (N - 1))];
        const model = (strengthAt) => (x, y) => { const u = (x + 0.5) / N, v = (y + 0.5) / N; const [su, sv] = sampleAt(u, v, TIME, {}, strengthAt(u, v)); return enc(su, sv); };
        for (const b of ["webgpu", "webgl2"]) {
            const o = r.result[b];
            ok(`*** ${b}: a WHITE field reproduces the scalar pipeline pixel for pixel ***`, diff(o.white, o.plain) === 0, `${diff(o.white, o.plain)} of ${N * N} differ`);
            ok(`  ${b}: a BLACK field is the identity -- every pixel reads its own texel`, worstVs(o.black, model(() => 0)) === 0, `worst ${worstVs(o.black, model(() => 0))} of 255`);
            ok(`  ${b}: the BAND field tears inside the band and not outside, exactly as the model says`, worstVs(o.band, model((u, v) => fieldAt(BAND, u, v))) === 0, `worst ${worstVs(o.band, model((u, v) => fieldAt(BAND, u, v)))} of 255`);
            ok(`CONTROL: ${b}: the band frame differs from both the plain and the identity frames`, diff(o.band, o.plain) > 0 && diff(o.band, o.black) > 0, `${diff(o.band, o.plain)} vs plain, ${diff(o.band, o.black)} vs identity`);
        }
        ok("*** and the two backends agree on the banded frame pixel for pixel ***", diff(r.result.webgpu.band, r.result.webgl2.band) === 0);
    }
}

console.log("\n4. crt WITH A FIELD, AGAINST ITS MODEL");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const W = 48, RAD = radialField(W, W, { inner: 0.2, outer: 1.0 });
    const src = new Uint8ClampedArray(W * W * 4);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; src[i] = Math.round(x * 255 / (W - 1)); src[i + 1] = Math.round(y * 255 / (W - 1)); src[i + 2] = 128; src[i + 3] = 255; }
    const rc = await runInEngineOrigin({ engineRoot: ENG, args: { W, src: Array.from(src), field: { width: W, height: W, data: Array.from(RAD.data) } }, script: `async (a) => {
        const { makeCrtPass, DEFAULTS } = await import("/render/crtPass.js");
        const pass = makeCrtPass(a.W, a.W); if (!pass) return { reason: "no webgl2" };
        const src = new Uint8Array(a.src);
        pass.render(src, DEFAULTS); const plain = Array.from(pass.readPixels());
        pass.render(src, DEFAULTS, { width: a.field.width, height: a.field.height, data: new Uint8Array(a.field.data) }); const withField = Array.from(pass.readPixels());
        pass.render(src, DEFAULTS, { width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) }); const white = Array.from(pass.readPixels());
        pass.render(src, DEFAULTS, { width: 1, height: 1, data: new Uint8Array([0, 0, 0, 255]) }); const black = Array.from(pass.readPixels());
        pass.dispose(); return { plain, withField, white, black };
    }` });
    ok("*** the crt pass renders with a field ***", rc.ok && rc.result.withField, rc.ok ? "" : rc.reason);
    if (rc.ok && rc.result.withField) {
        const R = rc.result, mdl = crtImage(src, W, W, DEFAULTS, RAD), mdlPlain = crtImage(src, W, W, DEFAULTS);
        const worst = (A, B) => { let w = 0; for (let i = 0; i < A.length; i++) if (i % 4 !== 3) w = Math.max(w, Math.abs(A[i] - B[i])); return w; };
        ok("  a white field is the scalar pass, byte for byte", worst(R.white, R.plain) === 0);
        ok("  the scalar pass still matches crtModel within one level", worst(R.plain, mdlPlain) <= 1, `worst ${worst(R.plain, mdlPlain)}`);
        ok("*** the radial field matches crtModel with the same field within one level ***", worst(R.withField, mdl) <= 1, `worst ${worst(R.withField, mdl)} of 255`);
        let identity = 0; for (let i = 0; i < src.length; i++) if (i % 4 !== 3 && Math.abs(R.black[i] - src[i]) > 1) identity++;
        ok("  a black field passes the source through", identity === 0, `${identity} channel values off by more than one`);
        ok("CONTROL: the field changed the picture", worst(R.withField, R.plain) > 8, `max change ${worst(R.withField, R.plain)}`);
    }
}

// =============================================================================================================
// SABOTAGE LOG -- each applied, gate run, exit code read, restored. MEASURED at Level 11.
//   A  the `* s` dropped from both displacements in FIELD_FRAGMENT_WGSL -> exit=1, 6 red: the source check in
//      section 1, then on WebGPU the BLACK field is no longer the identity (worst 255 of 255) and the BAND field
//      tears everywhere (worst 255), and the cross-backend line goes red because WebGL2 still honours its field.
//   B  crtPass's mix(raw, crt, s) replaced by crt -> exit=1, 3 red: the radial field disagrees with crtModel by
//      114 of 255, a black field no longer passes the source through (5,436 channel values off), while the
//      white-field and scalar lines stay green -- exactly the lines a full-strength effect cannot distinguish.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a field sampled LINEAR (a small gradient stretched over the frame), which the models " +
    "approximate by half a texel and which is the pleasant case for a page. Every comparison above is NEAREST " +
    "with a frame-sized field so it can be exact. Also unchecked: the orrery page does not yet offer a field -- " +
    "the stage can bind one (pass.texture(\"tField\", ...)) and nothing on the page asks it to.");
process.exit(fails ? 1 : 0);
