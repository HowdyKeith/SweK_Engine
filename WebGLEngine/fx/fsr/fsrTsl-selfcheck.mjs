#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsrTsl-selfcheck.mjs -- v4726
//
// FSR1 AS TSL NODES, HELD TO THE SAME CPU REFERENCE AS THE WGSL. fx/fsr/fsrTsl.mjs transcribes easuCPU and rcasCPU
// into three.js's node language so a WebGPURenderer scene can be upscaled through three's own pipeline; this gate
// renders the nodes into float render targets on a real adapter, on BOTH of three's backends, reads the pictures
// back and holds them to fx/fsr/fsr.js. Then it checks what each pass is for on the device's own output, the colour
// transfer a linear scene needs, the guard that transfer forced, and a real three.js scene through the three passes.
//
// *** TWO FACTS ABOUT READING A FLOAT TARGET BACK, MEASURED BEFORE A ROW WAS WRITTEN. ***
//   * readRenderTargetPixelsAsync on WebGPU hands back rows PADDED to 256 bytes: an 8-wide rgba32float target (128
//     bytes a row) came back as 480 floats, not 256 -- seven padded rows and an unpadded last one. Every size here is
//     a multiple of 16 texels, where a row is already 256-aligned, and the length is ASSERTED, so a padded readback
//     fails by name instead of shearing the picture.
//   * WebGL2 hands rows back BOTTOM-first (tools/ship/tsl-selfcheck.mjs measured it at v4319). three flips WebGL2's
//     gl_FragCoord so screenCoordinate is top-left on both backends -- measured here: the first row a WebGL2 target
//     reads back carries screenCoordinate.y = 7.5 of 8 -- so only the READBACK needs turning over, and it is.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";
import { easuCPU, rcasCPU, bilinearCPU, RCAS_LIMIT, RCAS_EPS } from "./fsr.js";
import * as FT from "./fsrTsl.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

// the pictures fx/fsr/fsr-selfcheck.mjs grades the WGSL on, rebuilt here so the two gates grade one question
const N = 32, M = 64, U = 16;
function mixed(n) {
    const src = new Float32Array(n * n * 4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const i = (y * n + x) * 4;
        const edge = (x + y < n) ? 0 : 1;
        const chq = (x > n * 0.6 && y < n * 0.4) ? ((x ^ y) & 1) : edge;
        src[i] = chq; src[i + 1] = chq * 0.5 + edge * 0.5; src[i + 2] = 1 - chq; src[i + 3] = 1;
    }
    return src;
}
function diagonal(n) {
    const src = new Float32Array(n * n * 4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const v = (x + y < n) ? 0 : 1, i = (y * n + x) * 4;
        src[i] = v; src[i + 1] = v; src[i + 2] = v; src[i + 3] = 1;
    }
    return src;
}
function flat(n, rgb) {
    const src = new Float32Array(n * n * 4);
    for (let i = 0; i < n * n; i++) { src[i * 4] = rgb[0]; src[i * 4 + 1] = rgb[1]; src[i * 4 + 2] = rgb[2]; src[i * 4 + 3] = 1; }
    return src;
}
// A LOCAL MINIMUM: 0.1 ringed by 0.5 at display size. rcasCPU resolves it to (-0.1875 * 2.0 + 0.1) / 0.25 = -1.1.
const DIP = (() => { const s = flat(U, [0.5, 0.5, 0.5]); const c = ((U / 2) * U + U / 2) * 4; s[c] = s[c + 1] = s[c + 2] = 0.1; return s; })();
const DIP_AT = (U / 2) * U + U / 2;
// A LONE PIXEL AGAINST A FLAT RING OF 0 OR OF 1 -- the only place RCAS's 0/0 guard decides anything. EASU's output is
// smooth, so no picture above reaches it; the first run of this gate's sabotage T8 (the guard removed from the node)
// scored 0 RED for exactly that reason. fx/fsr/fsr-selfcheck.mjs grades the same two pictures on the WGSL.
const lone = (centre) => { const s = flat(U, [1 - centre, 1 - centre, 1 - centre]); const c = DIP_AT * 4; s[c] = s[c + 1] = s[c + 2] = centre; return s; };
const WHITE_ON_BLACK = lone(1), BLACK_ON_WHITE = lone(0);
const SRC = mixed(N), EDGE = diagonal(N), FLAT = flat(N, [0.3, 0.6, 0.9]);

// three's own transfer functions, transcribed from vendor/three-webgpu/three.webgpu.js (sRGBTransferOETF/EOTF), so
// the CPU side of the "srgb" rows computes what the node does and not a textbook sRGB it does not use
const oetf = (c) => (c <= 0.0031308 ? c * 12.92 : Math.pow(c, 0.41666) * 1.055 - 0.055);
const eotf = (c) => (c <= 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4));
const mapRgb = (a, fn) => { const o = new Float32Array(a); for (let i = 0; i < o.length; i += 4) for (let c = 0; c < 3; c++) o[i + c] = fn(o[i + c]); return o; };
/** The CPU side of transfer "srgb": encode, EASU, RCAS, clamp at 0, decode. */
function srgbChainCPU(src, n, m, sharpness, denoise) {
    const up = easuCPU(mapRgb(src, oetf), n, n, m, m);
    return mapRgb(rcasCPU(up.data, m, m, sharpness, denoise).data, (v) => eotf(Math.max(v, 0)));
}
const worstOf = (a, b, count) => { let w = 0; for (let i = 0; i < count; i++) for (let c = 0; c < 3; c++) { const d = Math.abs(a[i * 4 + c] - b[i * 4 + c]); if (!(d <= w)) w = d; } return w; };
const midOf = (d, count) => { let n = 0; for (let i = 0; i < count; i++) { const v = d[i * 4]; if (v > 0.06 && v < 0.94) n++; } return n; };

console.log("\n1. WITHOUT A DEVICE: the module's refusals, its constants, and the TSL it asks three for");
{
    let named = null; try { FT.easuNode({}, null, { rw: 1, rh: 1, dw: 1, dh: 1 }); } catch (e) { named = String(e.message); }
    ok("a TSL namespace missing a name is refused BY THAT NAME, before any graph is built", named !== null && /has no Fn\b/.test(named), named || "no throw");
    // a stand-in carrying every name the module asks for, so the refusal reached is the TRANSFER's and not need()'s
    const stand = Object.fromEntries(FT.TSL_NEEDS.map((k) => [k, () => { throw new Error("stand-in reached: " + k); }]));
    const refusal = (fn) => { try { fn(); return "no throw"; } catch (e) { return String(e.message); } };
    const rs = [refusal(() => FT.easuNode(stand, null, { transfer: "gamma" })), refusal(() => FT.rcasNode(stand, null, { transfer: "gamma" })),
                refusal(() => FT.makeFsrSpatial({}, {}, { transfer: "gamma" }))];
    ok("an unknown transfer is refused by name -- by EASU, by RCAS and by the driver -- before a node is built, and the refusal lists the transfers there are",
       rs.every((m) => /unknown transfer "gamma"/.test(m) && m.endsWith(FT.TRANSFERS.join(", "))) && FT.TRANSFERS.join() === "none,srgb", rs.join(" | "));
    let bn = null; try { FT.bilinearNode({}, null, { rw: 1, rh: 1, dw: 1, dh: 1 }); } catch (e) { bn = String(e.message); }
    ok("  and bilinearNode checks the namespace the way the FSR nodes do", bn !== null && /has no Fn\b/.test(bn), bn || "no throw");
    ok("the node's limiter constants ARE the reference's, so a change to one cannot leave the other behind",
       FT.RCAS_LIMIT_TSL === RCAS_LIMIT && FT.RCAS_EPS_TSL === RCAS_EPS, `limit ${FT.RCAS_LIMIT_TSL} vs ${RCAS_LIMIT}; eps ${FT.RCAS_EPS_TSL} vs ${RCAS_EPS}`);
    // the names are checked against the VENDORED build's export list rather than a live import, which needs a browser
    const tslSrc = fs.readFileSync(path.join(ENG, "vendor/three-webgpu/three.tsl.js"), "utf8");
    const needs = [...FT.TSL_NEEDS];
    const missing = needs.filter((n) => !new RegExp(`\\b${n}\\b`).test(tslSrc));
    ok(`every TSL name the module needs is exported by vendor/three-webgpu/three.tsl.js (${needs.length} names)`, needs.length > 10 && missing.length === 0,
       missing.length ? "missing: " + missing.join(", ") : needs.join(" "));
}

console.log("\n2. ON THE DEVICE: the nodes rendered on both of three's backends, held to fx/fsr/fsr.js");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. *** Section 1 is static; nothing here has rendered a node."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 180000,
        args: { N, M, U, src: Array.from(SRC), edge: Array.from(EDGE), flat: Array.from(FLAT), dip: Array.from(DIP),
                wob: Array.from(WHITE_ON_BLACK), bow: Array.from(BLACK_ON_WHITE) },
        script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const F = await import("/fx/fsr/fsrTsl.mjs");
        const out = {};
        for (const mode of ["webgpu", "webgl2"]) {
            try {
                const canvas = document.createElement("canvas"); canvas.width = a.M; canvas.height = a.M;
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
                const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
                const dataTex = (arr, n) => { const t = new THREE.DataTexture(new Float32Array(arr), n, n, THREE.RGBAFormat, THREE.FloatType); t.needsUpdate = true; return t; };
                const target = (n) => new THREE.RenderTarget(n, n, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
                const draw = async (node, n) => { const m = new THREE.NodeMaterial(); m.fragmentNode = node; const s = new THREE.Scene(); s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m));
                    const rt = target(n); renderer.setRenderTarget(rt); await renderer.renderAsync(s, ortho);
                    const px = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, n, n); return { rt, px: Array.from(px) }; };
                const easu = (tex, transfer = "none") => F.easuNode(T, tex, { rw: a.N, rh: a.N, dw: a.M, dh: a.M, transfer }).node;
                const rcas = (tex, n, sharpness, denoise, transfer = "none") => F.rcasNode(T, tex, { w: n, h: n, sharpness, denoise, transfer }).node;
                const o = {};
                const eMix = await draw(easu(dataTex(a.src, a.N)), a.M); o.easu = eMix.px;
                o.rcas1 = (await draw(rcas(eMix.rt.texture, a.M, 1, false), a.M)).px;
                o.rcasHalfDn = (await draw(rcas(eMix.rt.texture, a.M, 0.5, true), a.M)).px;
                o.easuEdge = (await draw(easu(dataTex(a.edge, a.N)), a.M)).px;
                const eFlat = await draw(easu(dataTex(a.flat, a.N)), a.M); o.easuFlat = eFlat.px;
                o.fsrFlat = (await draw(rcas(eFlat.rt.texture, a.M, 1, true), a.M)).px;
                const eS = await draw(easu(dataTex(a.src, a.N), "srgb"), a.M);
                o.srgb = (await draw(rcas(eS.rt.texture, a.M, 1, false, "srgb"), a.M)).px;
                const dip = dataTex(a.dip, a.U);
                o.dipNone = (await draw(rcas(dip, a.U, 1, false, "none"), a.U)).px;
                o.dipSrgb = (await draw(rcas(dip, a.U, 1, false, "srgb"), a.U)).px;
                o.wob = (await draw(rcas(dataTex(a.wob, a.U), a.U, 1, false), a.U)).px;
                o.bow = (await draw(rcas(dataTex(a.bow, a.U), a.U, 1, false), a.U)).px;
                // the decode WITHOUT the guard, on the value the dip produces: what the clamp is there to stop
                o.rawEotf = (await draw(T.vec4(T.sRGBTransferEOTF(T.vec3(-1.1)), 1.0), a.U)).px.slice(0, 4);

                // a REAL three.js scene through the three passes: a lit-free quad at an angle over a coloured background
                const scene = new THREE.Scene(); scene.background = new THREE.Color(0.05, 0.1, 0.2);
                const mat = new THREE.MeshBasicNodeMaterial(); mat.colorNode = T.vec3(0.9, 0.4, 0.1);
                const quad = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), mat); quad.rotation.z = 0.5236; scene.add(quad);
                const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10); cam.position.z = 5;
                const fsr = F.makeFsrSpatial(THREE, T, { renderWidth: a.N, renderHeight: a.N, displayWidth: a.M, displayHeight: a.M, type: THREE.FloatType });
                const outRT = target(a.M), before = target(8);
                renderer.setRenderTarget(before);
                await fsr.render(renderer, scene, cam, outRT);
                o.restored = renderer.getRenderTarget() === before;
                o.sceneLow = Array.from(await renderer.readRenderTargetPixelsAsync(fsr.sceneTarget, 0, 0, a.N, a.N));
                o.sceneOut = Array.from(await renderer.readRenderTargetPixelsAsync(outRT, 0, 0, a.M, a.M));
                // the scene MOVES before the stretch, and its expected frame is rendered into a target the driver
                // does not own -- otherwise a renderBilinear that skipped its own scene render would stretch the
                // frame render() left behind and match it exactly (this gate's T18 scored 0 RED that way first)
                quad.rotation.z = -0.35;
                const lowRef = new THREE.RenderTarget(a.N, a.N, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
                renderer.setRenderTarget(lowRef); await renderer.renderAsync(scene, cam);
                o.sceneLow2 = Array.from(await renderer.readRenderTargetPixelsAsync(lowRef, 0, 0, a.N, a.N));
                const bilRT = target(a.M); await fsr.renderBilinear(renderer, scene, cam, bilRT);
                o.sceneBil = Array.from(await renderer.readRenderTargetPixelsAsync(bilRT, 0, 0, a.M, a.M));
                fsr.dispose();
                out[mode] = o;
                renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 600) }; }
        }
        return out;
    }` });
    ok("the harness rendered the nodes on BOTH of three's backends", r.ok && r.result && !r.result.webgpu.err && !r.result.webgl2.err,
       r.ok ? `webgpu ${r.result.webgpu.err || "ok"}; webgl2 ${r.result.webgl2.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) for (const mode of ["webgpu", "webgl2"]) {
        const o = r.result[mode]; if (!o || o.err) continue;
        // WebGL2 reads back bottom-first; turn it over so row 0 is the top on both (see the header)
        const up = (px, n) => { if (mode === "webgpu") return px; const f = []; for (let y = n - 1; y >= 0; y--) f.push(...px.slice(y * n * 4, (y + 1) * n * 4)); return f; };
        const lens = [o.easu, o.rcas1, o.rcasHalfDn, o.easuEdge, o.easuFlat, o.fsrFlat, o.srgb, o.sceneOut, o.sceneBil].every((p) => p.length === M * M * 4) &&
                     o.dipNone.length === U * U * 4 && o.sceneLow.length === N * N * 4 && o.sceneLow2.length === N * N * 4;
        ok(`[${mode}] every readback is exactly w*h*4 floats -- no row padding shearing the picture`, lens, lens ? "" : "a length is off: a padded readback");
        if (!lens) continue;
        const E = up(o.easu, M), R1 = up(o.rcas1, M), RH = up(o.rcasHalfDn, M);
        const cE = easuCPU(SRC, N, N, M, M).data;
        const wE = worstOf(E, cE, M * M);
        ok(`*** [${mode}] the node's EASU is the CPU reference's, to ${wE.toExponential(2)} on all ${M * M * 3} channels ***`, wE < 1e-6,
           `worst ${wE.toExponential(3)} (the WGSL kernel reads 2.98e-7 against the same reference in fx/fsr/fsr-selfcheck.mjs)`);
        const wR1 = worstOf(R1, rcasCPU(cE, M, M, 1, false).data, M * M), wRH = worstOf(RH, rcasCPU(cE, M, M, 0.5, true).data, M * M);
        ok(`*** [${mode}] the node's RCAS is the CPU reference's on BOTH settings -- ${wR1.toExponential(2)} at sharpness 1, ${wRH.toExponential(2)} at 0.5 with denoise ***`,
           wR1 < 1e-6 && wRH < 1e-6, `sharp 1 ${wR1.toExponential(3)}; sharp 0.5 + denoise ${wRH.toExponential(3)}. A switch graded at one position is half a switch (fx/fsr/fsr-selfcheck.mjs's AE)`);
        // what the passes are FOR, on the device's own picture
        let viol = 0;
        const S = (x, y, c) => SRC[((y < 0 ? 0 : y > N - 1 ? N - 1 : y) * N + (x < 0 ? 0 : x > N - 1 ? N - 1 : x)) * 4 + c];
        for (let py = 0; py < M; py++) for (let px = 0; px < M; px++) {
            const fx = Math.floor((px + 0.5) * N / M - 0.5), fy = Math.floor((py + 0.5) * N / M - 0.5);
            for (let c = 0; c < 3; c++) { const n4 = [S(fx, fy, c), S(fx + 1, fy, c), S(fx, fy + 1, c), S(fx + 1, fy + 1, c)], v = E[(py * M + px) * 4 + c];
                if (v < Math.min(...n4) - 1e-6 || v > Math.max(...n4) + 1e-6) viol++; }
        }
        ok(`  [${mode}] and the node's OWN picture derings: ${viol} of ${M * M * 3} channels outside the four-nearest bounds`, viol === 0, `${viol} violations`);
        const mE = midOf(up(o.easuEdge, M), M * M), mB = midOf(bilinearCPU(EDGE, N, N, M, M).data, M * M);
        ok(`  [${mode}] and it is edge-adaptive on the pure diagonal: ${mE} intermediate pixels against bilinear's ${mB}`, mE > 0 && mE < mB / 2, `node ${mE}, bilinear ${mB}`);
        let wF = 0; const ff = up(o.fsrFlat, M), fe = up(o.easuFlat, M);
        for (let i = 0; i < M * M; i++) for (let c = 0; c < 3; c++) wF = Math.max(wF, Math.abs(ff[i * 4 + c] - [0.3, 0.6, 0.9][c]), Math.abs(fe[i * 4 + c] - [0.3, 0.6, 0.9][c]));
        ok(`  [${mode}] a constant field comes through EASU and RCAS as that constant (worst ${wF.toExponential(2)})`, wF < 1e-6, wF.toExponential(3));

        // the transfer a LINEAR scene needs, and the guard it forced
        const cS = srgbChainCPU(SRC, N, M, 1, false), wS = worstOf(up(o.srgb, M), cS, M * M), LSB = 1 / 255;
        ok(`*** [${mode}] transfer "srgb" is encode -> EASU -> RCAS -> clamp at 0 -> decode, with three's own transfer functions: ${wS.toExponential(2)}, ${(wS / LSB).toExponential(1)} of an 8-bit LSB ***`,
           wS < LSB / 50, `worst ${wS.toExponential(3)} against LSB/50 = ${(LSB / 50).toExponential(2)} -- pow() on the device against Math.pow is the whole difference, which is why this row is stated in display levels and the transfer-free rows are not`);
        const dN = up(o.dipNone, U)[DIP_AT * 4], dS = up(o.dipSrgb, U)[DIP_AT * 4], raw = o.rawEotf[0];
        const cDip = rcasCPU(DIP, U, U, 1, false).data[DIP_AT * 4];
        ok(`*** [${mode}] RCAS UNDERSHOOTS a local minimum -- 0.1 ringed by 0.5 resolves to ${dN.toFixed(4)} with no transfer, as the reference's ${cDip.toFixed(4)} -- and the "srgb" decode lands it on ${dS} instead of a NaN ***`,
           Math.abs(dN - cDip) < 1e-6 && dN < 0 && Number.isFinite(dS) && dS === 0,
           `unguarded, three's sRGBTransferEOTF(-1.1) reads ${raw} on this ${mode} device: pow of a negative base, carried through mix() because NaN * 0 is NaN`);

        const rw = up(o.wob, U)[DIP_AT * 4], rb = up(o.bow, U)[DIP_AT * 4];
        const cw = rcasCPU(WHITE_ON_BLACK, U, U, 1, false).data[DIP_AT * 4], cb = rcasCPU(BLACK_ON_WHITE, U, U, 1, false).data[DIP_AT * 4];
        ok(`*** [${mode}] the 0/0 in the limiter is guarded in the node: a lone WHITE pixel on black stays ${rw} and a lone BLACK pixel on white stays ${rb}, as the reference's ${cw} and ${cb} ***`,
           o.wob.length === U * U * 4 && Math.abs(rw - cw) < 1e-6 && Math.abs(rb - cb) < 1e-6,
           "unguarded, the ring's denominators are 0/0 there and WGSL's NaN-swallowing max() resolves the two to 4.0 and -3.0 (fx/fsr/fsr.js)");

        // a real scene through makeFsrSpatial: the device's own low-resolution frame, pushed through the CPU chain,
        // must be what the three passes produced -- which is the targets, their order and the transfer all at once
        const low = up(o.sceneLow, N), outp = up(o.sceneOut, M);
        const bg = [low[0], low[1], low[2]];
        let drawn = 0; for (let i = 0; i < N * N; i++) if (Math.abs(low[i * 4] - bg[0]) > 0.1) drawn++;
        const wSc = worstOf(outp, srgbChainCPU(new Float32Array(low), N, M, 1, false), M * M);
        ok(`*** [${mode}] a three.js SCENE through makeFsrSpatial is the CPU chain over the device's own ${N}x${N} frame, to ${wSc.toExponential(2)} (${(wSc / LSB).toExponential(1)} LSB) ***`,
           drawn > 50 && drawn < N * N - 50 && wSc < LSB / 50,
           `${drawn} of ${N * N} low-res pixels are the quad, the rest background ${bg.map((v) => v.toFixed(4)).join(",")}; worst ${wSc.toExponential(3)}`);
        // the comparison pane: the driver's bilinear stretch, held to bilinearCPU over the same device frame, and
        // then FSR1 against IT -- device against device, so the difference is the kernel and nothing else
        const low2 = up(o.sceneLow2, N), bilD = up(o.sceneBil, M);
        let moved = 0; for (let i = 0; i < N * N; i++) if (Math.abs(low2[i * 4] - low[i * 4]) > 0.1) moved++;
        const wBil = worstOf(bilD, bilinearCPU(new Float32Array(low2), N, N, M, M).data, M * M);
        ok(`  [${mode}] the driver's bilinear stretch is bilinearCPU over the frame it was asked for, to ${wBil.toExponential(2)} -- the scene moved first, ${moved} low-res pixels changed`,
           moved > 20 && wBil < 1e-6, `worst ${wBil.toExponential(3)}; the comparison pane reads the way EASU reads, through the same coordinates`);
        // FSR1 against the same kind of stretch of ITS frame, device against device, so the difference is the kernel
        const bilCpu = bilinearCPU(new Float32Array(low), N, N, M, M).data;
        let differs = 0; for (let i = 0; i < M * M; i++) if (Math.abs(outp[i * 4] - bilCpu[i * 4]) > 0.02) differs++;
        ok(`  [${mode}] ...and FSR1 is not a bilinear stretch of its frame: ${differs} of ${M * M} pixels differ by more than 0.02`, differs > 20, `${differs}`);
        ok(`  [${mode}] ...and the driver hands the renderer back the target it found`, o.restored === true, String(o.restored));
    }
}

// ---- v4726 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Each run against fsrTsl.mjs alone, restored after; the CPU reference untouched throughout, so every red is the node
// leaving it. Counts are FAIL lines across both backends.
//   T1  luma loses its green weighting (r weighted 1)            -> 6     T9  RCAS_LIMIT dropped from the lobe clamp  -> 6
//   T2  EASU's dering clamp removed                              -> 10    T10 the "srgb" decode's 0 guard removed     -> 4
//   T3  the flat-region fallback removed                         -> 8     T11 the "srgb" encode dropped from the taps -> 4
//   T4  one tap mis-placed (o at x = 2)                          -> 8     T12 the driver skips the EASU pass          -> 2
//   T5  the pixel mapping uses dw/rw                             -> 12    T13 the driver does not restore the target  -> 2
//   T6  RCAS's denoise measured on red                           -> 2     T14 the limiter constant drifts from fsr.js -> 5
//   T7  RCAS's sharpness ignored                                 -> 2     T15 need() checks nothing                   -> 1
//   T8  RCAS's 0/0 epsilon removed                               -> 2     T16 the driver accepts any transfer         -> 1
//   T17 bilinearNode's x weight swapped (fx for 1 - fx)          -> 2     T18 renderBilinear skips the scene render   -> 2
// *** T8 SCORED 0 RED FIRST, AND THAT WAS THE FIXTURE. *** The guard decides only a lone pixel against a flat ring of 0
// or 1, and every picture here had passed through EASU first, which leaves no such pixel. The lone-pixel rows were
// added for it; unguarded, WebGPU reads the documented 4.0 and -3.0 and WebGL2 reads 4.0 and 0.0 -- the two backends
// swallow the same NaN differently, which is one more reason the guard is arithmetic and not left to either.
// T6 and T7 are red only at the sharpness-0.5, denoise-on setting: the row that grades one position would pass both.
// *** T18 SCORED 0 RED FIRST TOO, AND THAT WAS THE GATE'S ORDER. *** renderBilinear ran straight after render() on an
// unchanged scene, so a driver that skipped its own scene render stretched the frame render() had left and matched
// exactly. The scene now moves between the two, and the expected frame comes from a target the driver does not own.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: SPEED -- nothing times the nodes against fx/fsr/fsrGPU.js's compute kernels or against bilinear; " +
    "HalfFloat targets, which makeFsrSpatial uses by default and this gate replaces with FloatType to grade the arithmetic; " +
    "the canvas as the output, where three's output transform and an 8-bit swapchain clamp RCAS's overshoot; " +
    "and the TEMPORAL half for a three.js scene, which needs the package's route -- the kernels on renderer.backend.device " +
    "against the GPUTexture behind a render target -- because every temporal pass in this tree is gfx/device.js compute.");
process.exitCode = fails ? 1 : 0;
