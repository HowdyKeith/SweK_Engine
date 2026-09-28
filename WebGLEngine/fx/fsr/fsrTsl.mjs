// fx/fsr/fsrTsl.mjs -- v4726 -- FSR1 FOR A THREE.JS SCENE: EASU and RCAS as TSL nodes, and the three passes that put
// a WebGPURenderer's scene through them.
//
// *** WHY THIS FILE EXISTS WHEN fx/fsr/ ALREADY HAS FSR1 TWICE. *** fx/fsr/fsr.js is the CPU reference and
// fx/fsr/fsrKernels.js the WGSL, run through gfx/device.js on flat f32 buffers. Neither can touch a three.js scene:
// gfx/device.js creates its own GPUDevice, and a device cannot sample another device's textures. Every page that
// renders through vendor/three-webgpu -- the TSL pages -- therefore had no way to upscale what it drew, which is
// the gap backlog item pmndrs-upscaler-tsl named. A TSL node compiles through three's OWN pipeline, on whichever
// backend three picked, so it needs nothing from three's internals.
//
// *** NOT THE PACKAGE'S ROUTE, AND THE PACKAGE SAYS WHY ITS ROUTE IS DIFFERENT. *** @pmndrs/upscaler@0.2.0's README:
// "The passes are hand-written WGSL dispatched straight on the renderer's GPUDevice -- no TSL, no WebGL fallback."
// Its TSL nodes (upscale / upscaleScene / upscaleSpatial) wrap compute passes it encodes on renderer.backend.device,
// reaching the GPUTexture behind a render target through renderer.backend.get(texture).texture -- two internals its
// own internal/threeWebGPU.ts documents and throws on. That route is the one the TEMPORAL chain needs, because every
// temporal pass in this tree is gfx/device.js compute; it is a later rung. For the SPATIAL half a fragment node is
// enough, and it is the shape three.js itself chose: three ships an official spatial FSR1Node (not vendored here).
//
// *** HELD TO THE SAME CPU REFERENCE AS THE WGSL, STATEMENT BY STATEMENT. *** Every expression below is the one in
// easuCPU / rcasCPU, in the reference's lettering and in the same order of operations, including both of this tree's
// deliberate departures from ffx_fsr1.h: exact reciprocals instead of the APrxLo bit tricks, and RCAS's epsilon on
// the ring's vanishing denominators (the 0/0 note in fx/fsr/fsr.js). fx/fsr/fsrTsl-selfcheck.mjs holds the device's
// picture to the CPU's.
//
// ---- THE COLOUR DOMAIN -------------------------------------------------------------------------------------------
// EASU expects PERCEPTUAL input. fx/fsr/fsr.js does not choose a transfer function and neither does the package
// ("callers that use the spatial path are responsible for supplying the intended color domain"). A three.js render
// target holds LINEAR working-space colour, so a caller handing it straight to EASU gets a correct answer to a
// different question. `transfer: "srgb"` is the explicit way to ask the intended one: each tap is encoded with
// three's own sRGBTransferOETF before EASU sees it, and RCAS's result is decoded with sRGBTransferEOTF, so three's
// output transform applies once and not twice. The default is "none", which is what the reference computes.
//
// *** RCAS LEAVES [0, 1] AT BOTH ENDS, AND THE DECODE CANNOT TAKE THE LOW ONE. *** fx/fsr/fsrGPU.js records the
// overshoot at a local peak (1.000 in, 1.166 out). The same arithmetic undershoots at a local MINIMUM: a 0.1 texel
// ringed by 0.5 resolves to (-0.1875 * 2.0 + 0.1) / 0.25 = -1.1. three's sRGBTransferEOTF is
// mix(pow(0.9478672986 c + 0.0521327014, 2.4), 0.0773993808 c, c <= 0.04045), and WGSL's pow of a negative base is
// NaN -- which mix() then carries through, because NaN * 0 is NaN. So the "srgb" decode clamps at 0 first, the guard
// the package's own temporal RCAS takes before its tonemap inversion (`max(pix, vec3f(0.0))`). The "none" path is
// left unclamped, as the reference is.
"use strict";

/** The TSL names this file uses, checked up front so a three upgrade that drops one fails here by name. */
export const TSL_NEEDS = Object.freeze(["Fn", "float", "int", "vec3", "vec4", "ivec2", "uniform", "textureLoad", "screenCoordinate",
               "max", "min", "abs", "clamp", "floor", "inverseSqrt", "select", "exp2", "sRGBTransferOETF", "sRGBTransferEOTF"]);

export const TRANSFERS = Object.freeze(["none", "srgb"]);
export const RCAS_LIMIT_TSL = 0.25 - 1 / 16;   // fx/fsr/fsr.js RCAS_LIMIT, restated where the node needs a literal
export const RCAS_EPS_TSL = 1e-6;              // fx/fsr/fsr.js RCAS_EPS

function need(TSL) {
    for (const n of TSL_NEEDS) if (TSL[n] === undefined) throw new Error(`fx/fsr/fsrTsl: the TSL namespace has no ${n}`);
}
function transferOf(t) {
    if (!TRANSFERS.includes(t)) throw new Error(`fx/fsr/fsrTsl: unknown transfer ${JSON.stringify(t)} -- one of ${TRANSFERS.join(", ")}`);
    return t;
}

/**
 * EASU as a fragment node. `tex` is a three Texture at render resolution (a render target's texture, or a
 * DataTexture); the node computes one DISPLAY pixel from screenCoordinate, so it is meant for a full-screen draw into
 * a target of display size. Returns { node, uniforms } -- uniforms.{rw, rh, dw, dh} are float uniforms the caller may
 * move when either size changes.
 */
export function easuNode(TSL, tex, { rw, rh, dw, dh, transfer = "none" } = {}) {
    need(TSL); transferOf(transfer);
    const { Fn, float, int, vec3, vec4, ivec2, uniform, textureLoad, screenCoordinate, max, min, abs, clamp, floor,
            inverseSqrt, select, sRGBTransferOETF } = TSL;
    const u = { rw: uniform(float(rw)), rh: uniform(float(rh)), dw: uniform(float(dw)), dh: uniform(float(dh)) };
    const node = Fn(() => {
        // a clamped load of one render-resolution texel, rgb -- the WGSL's ld(). The coordinates are whole numbers
        // held in floats (floor of a sum of small integers), so the int() conversion is exact.
        const ld = (x, y) => {
            const c = textureLoad(tex, ivec2(int(clamp(x, 0.0, u.rw.sub(1.0))), int(clamp(y, 0.0, u.rh.sub(1.0))))).xyz;
            return transfer === "srgb" ? sRGBTransferOETF(c) : c;
        };
        // EASU's luma is GREEN-WEIGHTED (0.5r + g + 0.5b), not Rec.709 -- the reference's own weighting
        const lum = (c) => c.x.mul(0.5).add(c.y).add(c.z.mul(0.5));

        // the output pixel in render-texture space: integer base + sub-texel offset. screenCoordinate is the pixel
        // centre, (px + 0.5), on both backends -- three flips WebGL2's gl_FragCoord to WebGPU's top-left origin.
        const ppx0 = screenCoordinate.x.mul(u.rw).div(u.dw).sub(0.5).toVar();
        const ppy0 = screenCoordinate.y.mul(u.rh).div(u.dh).sub(0.5).toVar();
        const fx = floor(ppx0), fy = floor(ppy0);
        const ppx = ppx0.sub(fx).toVar(), ppy = ppy0.sub(fy).toVar();

        //     b c            the 12-tap footprint, in the reference's own lettering
        //   e f g h
        //   i j k l
        //     n o
        const cB = ld(fx, fy.sub(1.0)).toVar(), cC = ld(fx.add(1.0), fy.sub(1.0)).toVar();
        const cE = ld(fx.sub(1.0), fy).toVar(), cF = ld(fx, fy).toVar();
        const cG = ld(fx.add(1.0), fy).toVar(), cH = ld(fx.add(2.0), fy).toVar();
        const cI = ld(fx.sub(1.0), fy.add(1.0)).toVar(), cJ = ld(fx, fy.add(1.0)).toVar();
        const cK = ld(fx.add(1.0), fy.add(1.0)).toVar(), cL = ld(fx.add(2.0), fy.add(1.0)).toVar();
        const cN = ld(fx, fy.add(2.0)).toVar(), cO = ld(fx.add(1.0), fy.add(2.0)).toVar();
        const lB = lum(cB), lC = lum(cC), lE = lum(cE), lF = lum(cF), lG = lum(cG), lH = lum(cH);
        const lI = lum(cI), lJ = lum(cJ), lK = lum(cK), lL = lum(cL), lN = lum(cN), lO = lum(cO);

        // edge analysis at f, g, j, k, blended by the sub-texel position (FsrEasuSetF)
        const dirX = float(0.0).toVar(), dirY = float(0.0).toVar(), len = float(0.0).toVar();
        const set = (w, lA, lB_, lC_, lD, lE_) => {
            const rX = float(1.0).div(max(max(abs(lD.sub(lC_)), abs(lC_.sub(lB_))), 1e-5));
            const dX = lD.sub(lB_);
            dirX.addAssign(dX.mul(w));
            const lX = clamp(abs(dX).mul(rX), 0.0, 1.0);
            len.addAssign(lX.mul(lX).mul(w));
            const rY = float(1.0).div(max(max(abs(lE_.sub(lC_)), abs(lC_.sub(lA))), 1e-5));
            const dY = lE_.sub(lA);
            dirY.addAssign(dY.mul(w));
            const lY = clamp(abs(dY).mul(rY), 0.0, 1.0);
            len.addAssign(lY.mul(lY).mul(w));
        };
        const ippx = float(1.0).sub(ppx), ippy = float(1.0).sub(ppy);
        set(ippx.mul(ippy), lB, lE, lF, lG, lJ);
        set(ppx.mul(ippy), lC, lF, lG, lH, lK);
        set(ippx.mul(ppy), lF, lI, lJ, lK, lN);
        set(ppx.mul(ppy), lG, lJ, lK, lL, lO);

        // kernel shaping: normalise (a flat region falls back to axis-aligned, zero strength), square the strength,
        // then stretch along the edge and squeeze across it. The reference's select() keeps dirY's tiny value.
        const dirR0 = dirX.mul(dirX).add(dirY.mul(dirY));
        const zro = dirR0.lessThan(1.0 / 32768.0);
        const dirR = select(zro, float(1.0), inverseSqrt(max(dirR0, 1e-12)));
        const dx = select(zro, float(1.0), dirX).mul(dirR).toVar(), dy = dirY.mul(dirR).toVar();
        const len2 = len.mul(0.5).mul(len.mul(0.5)).toVar();
        const stretch = dx.mul(dx).add(dy.mul(dy)).div(max(abs(dx), abs(dy)));
        const lenX = float(1.0).add(stretch.sub(1.0).mul(len2)).toVar(), lenY = float(1.0).sub(len2.mul(0.5)).toVar();
        const lob = float(0.5).add(float((1.0 / 4.0 - 0.04) - 0.5).mul(len2)).toVar();
        const clp = float(1.0).div(lob).toVar();

        // accumulation (FsrEasuTapF), then the dering clamp over the 4 NEAREST texels only
        const acc = vec3(0.0).toVar(), wsum = float(0.0).toVar();
        const tap = (ox, oy, col) => {
            const offX = float(ox).sub(ppx), offY = float(oy).sub(ppy);
            const vx = offX.mul(dx).add(offY.mul(dy)).mul(lenX);
            const vy = offX.mul(dy.negate()).add(offY.mul(dx)).mul(lenY);
            const d2 = min(vx.mul(vx).add(vy.mul(vy)), clp);
            const wB0 = float(2.0 / 5.0).mul(d2).sub(1.0), wA0 = lob.mul(d2).sub(1.0);
            const wB = float(25.0 / 16.0).mul(wB0.mul(wB0)).sub(25.0 / 16.0 - 1.0);
            const w = wB.mul(wA0.mul(wA0));
            acc.addAssign(col.mul(w)); wsum.addAssign(w);
        };
        tap(0, -1, cB); tap(1, -1, cC);
        tap(-1, 0, cE); tap(0, 0, cF); tap(1, 0, cG); tap(2, 0, cH);
        tap(-1, 1, cI); tap(0, 1, cJ); tap(1, 1, cK); tap(2, 1, cL);
        tap(0, 2, cN); tap(1, 2, cO);
        const mn = min(min(cF, cG), min(cJ, cK)), mx = max(max(cF, cG), max(cJ, cK));
        return vec4(min(mx, max(mn, acc.div(wsum))), 1.0);
    })();
    return { node, uniforms: u };
}

/**
 * RCAS as a fragment node, at display resolution over `tex` (EASU's output). `sharpness` in [0, 1] as rcasCPU,
 * `denoise` FSR1's FSR_RCAS_DENOISE on green. With transfer "srgb" the input is taken as already encoded (EASU's
 * "srgb" output) and the result is decoded back to linear, clamped at 0 first -- see the header.
 */
export function rcasNode(TSL, tex, { w, h, sharpness = 1, denoise = false, transfer = "none" } = {}) {
    need(TSL); transferOf(transfer);
    const { Fn, float, int, vec3, vec4, ivec2, uniform, textureLoad, screenCoordinate, max, min, abs, clamp, floor,
            exp2, sRGBTransferEOTF } = TSL;
    const u = { w: uniform(float(w)), h: uniform(float(h)), sharpness: uniform(float(sharpness)),
                denoise: uniform(float(denoise ? 1 : 0)) };
    const node = Fn(() => {
        const ld = (x, y) => textureLoad(tex, ivec2(int(clamp(x, 0.0, u.w.sub(1.0))), int(clamp(y, 0.0, u.h.sub(1.0))))).xyz;
        const x = floor(screenCoordinate.x), y = floor(screenCoordinate.y);
        //   b
        // d e f      the cross, at display resolution
        //   h
        const b = ld(x, y.sub(1.0)).toVar(), d = ld(x.sub(1.0), y).toVar(), e = ld(x, y).toVar();
        const f = ld(x.add(1.0), y).toVar(), hh = ld(x, y.add(1.0)).toVar();

        // the ring bounds the negative lobe; the epsilon says "this side imposes nothing" where a denominator
        // vanishes (flat black, flat white), so neither backend's NaN semantics decide the pixel
        const mn4 = min(min(b, d), min(f, hh)), mx4 = max(max(b, d), max(f, hh));
        const hitMin = mn4.div(max(mx4.mul(4.0), vec3(RCAS_EPS_TSL)));
        const hitMax = vec3(1.0).sub(mx4).div(min(mn4.mul(4.0).sub(4.0), vec3(-RCAS_EPS_TSL)));
        const lobeRGB = max(hitMin.negate(), hitMax);
        const peak = exp2(float(-2.0).mul(float(1.0).sub(u.sharpness)));
        const lobe = max(float(-RCAS_LIMIT_TSL), min(max(lobeRGB.x, max(lobeRGB.y, lobeRGB.z)), 0.0)).mul(peak).toVar();

        // FSR1's FSR_RCAS_DENOISE, measured on GREEN; a uniform switch rather than a second graph, and exactly a
        // multiply by 1 when it is off
        const mn = min(min(b.y, d.y), min(f.y, hh.y)), mx = max(max(b.y, d.y), max(f.y, hh.y));
        const nz = clamp(abs(float(0.25).mul(b.y.add(d.y).add(f.y).add(hh.y)).sub(e.y)).div(max(mx.sub(mn), 1e-4)), 0.0, 1.0);
        lobe.mulAssign(float(1.0).sub(u.denoise.mul(nz).mul(0.5)));

        const rcpL = float(1.0).div(lobe.mul(4.0).add(1.0));
        const pix = lobe.mul(b.add(d).add(f).add(hh)).add(e).mul(rcpL);   // NOT clamped, as the reference
        return vec4(transfer === "srgb" ? sRGBTransferEOTF(max(pix, vec3(0.0))) : pix, 1.0);
    })();
    return { node, uniforms: u };
}

/**
 * Plain bilinear as a fragment node, transcribed from bilinearCPU and reading the way EASU reads -- textureLoad at
 * screenCoordinate -- so a comparison against FSR1 differs in the KERNEL and in nothing else. Linear values, no
 * transfer: this is what a hardware-filtered stretch computes.
 *
 * *** WHY NOT texture(target, uv()), WHICH IS THE OBVIOUS ONE-LINER. *** fsr-three.html's first draft stretched the
 * low-resolution target that way, and on three's WebGL2 backend the picture came out UPSIDE DOWN beside an upright
 * FSR1 pane -- measured by screenshot in this sandbox's headless Chromium. A comparison whose two panes disagree
 * about which way is up is not a comparison, so both now read through the same coordinates.
 */
export function bilinearNode(TSL, tex, { rw, rh, dw, dh } = {}) {
    need(TSL);
    const { Fn, float, int, vec4, ivec2, uniform, textureLoad, screenCoordinate, clamp, floor } = TSL;
    const u = { rw: uniform(float(rw)), rh: uniform(float(rh)), dw: uniform(float(dw)), dh: uniform(float(dh)) };
    const node = Fn(() => {
        const ld = (x, y) => textureLoad(tex, ivec2(int(clamp(x, 0.0, u.rw.sub(1.0))), int(clamp(y, 0.0, u.rh.sub(1.0))))).xyz;
        const sx = screenCoordinate.x.mul(u.rw).div(u.dw).sub(0.5).toVar(), sy = screenCoordinate.y.mul(u.rh).div(u.dh).sub(0.5).toVar();
        const x0 = floor(sx), y0 = floor(sy), fx = sx.sub(x0).toVar(), fy = sy.sub(y0).toVar();
        const ifx = float(1.0).sub(fx), ify = float(1.0).sub(fy);
        const c = ld(x0, y0).mul(ifx).mul(ify).add(ld(x0.add(1.0), y0).mul(fx).mul(ify))
            .add(ld(x0, y0.add(1.0)).mul(ifx).mul(fy)).add(ld(x0.add(1.0), y0.add(1.0)).mul(fx).mul(fy));
        return vec4(c, 1.0);
    })();
    return { node, uniforms: u };
}

/**
 * THE THREE PASSES FOR A SCENE: the scene at render resolution into `sceneTarget`, EASU into `easuTarget` at
 * display resolution, RCAS into `output` (null = the canvas, through three's output transform). The targets are
 * HalfFloat by default -- `type` takes THREE.FloatType when a caller needs the full mantissa, as the gate does.
 *
 * Nothing here jitters the camera or keeps history: this is FSR1, one frame in and one frame out.
 */
export function makeFsrSpatial(THREE, TSL, { renderWidth, renderHeight, displayWidth, displayHeight,
                                             sharpness = 1, denoise = false, transfer = "srgb", type = null } = {}) {
    transferOf(transfer);
    const opts = { type: type == null ? THREE.HalfFloatType : type, minFilter: THREE.NearestFilter,
                   magFilter: THREE.NearestFilter, depthBuffer: false };
    const sceneTarget = new THREE.RenderTarget(renderWidth, renderHeight, { ...opts, depthBuffer: true });
    const easuTarget = new THREE.RenderTarget(displayWidth, displayHeight, opts);
    const quad = (node) => {
        const m = new THREE.NodeMaterial(); m.fragmentNode = node; m.depthTest = false; m.depthWrite = false;
        const s = new THREE.Scene(); s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m));
        return { scene: s, material: m };
    };
    const easu = easuNode(TSL, sceneTarget.texture, { rw: renderWidth, rh: renderHeight, dw: displayWidth, dh: displayHeight, transfer });
    const rcas = rcasNode(TSL, easuTarget.texture, { w: displayWidth, h: displayHeight, sharpness, denoise, transfer });
    const bil = bilinearNode(TSL, sceneTarget.texture, { rw: renderWidth, rh: renderHeight, dw: displayWidth, dh: displayHeight });
    const qE = quad(easu.node), qR = quad(rcas.node), qB = quad(bil.node), ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return {
        sceneTarget, easuTarget, easu, rcas, bilinear: bil,
        /** Render `scene` through the chain. `output` is a RenderTarget or null for the canvas. */
        async render(renderer, scene, camera, output = null) {
            const prev = renderer.getRenderTarget();
            renderer.setRenderTarget(sceneTarget); await renderer.renderAsync(scene, camera);
            renderer.setRenderTarget(easuTarget); await renderer.renderAsync(qE.scene, ortho);
            renderer.setRenderTarget(output); await renderer.renderAsync(qR.scene, ortho);
            renderer.setRenderTarget(prev);
        },
        /** The same low-resolution frame, stretched bilinearly instead -- the comparison FSR1 has to beat. */
        async renderBilinear(renderer, scene, camera, output = null) {
            const prev = renderer.getRenderTarget();
            renderer.setRenderTarget(sceneTarget); await renderer.renderAsync(scene, camera);
            renderer.setRenderTarget(output); await renderer.renderAsync(qB.scene, ortho);
            renderer.setRenderTarget(prev);
        },
        dispose() { sceneTarget.dispose(); easuTarget.dispose(); qE.material.dispose(); qR.material.dispose(); qB.material.dispose(); },
    };
}
