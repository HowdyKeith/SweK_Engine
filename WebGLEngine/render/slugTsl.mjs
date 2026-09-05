// WebGLEngine/render/slugTsl.mjs -- v4484
//
// *** THE SLUG FRAGMENT AS TSL NODES, MEASURED BEFORE ANY MATERIAL IS PROMISED. *** docs/TSL-ROADMAP.md step 7 item 4
// (task 4) asked whether a TSL Slug material is worth building for the three pages that carry three 0.178, and said:
// write the fragment as nodes, emit it through WebGPURenderer.debug.getShaderAsync, and count what three emits before
// committing. This module is that fragment -- Eric Lengyel's reference (text/slugShaderWgsl.js slugCoreWgsl, ported
// once more, this time as a graph): CalcRootCode over the three sign bits (see the note at it), the two quadratic solvers, CalcBandLoc,
// CalcCoverage, and SlugRender's two band loops with their early breaks, reading the curve atlas (rgba16float) and
// the band atlas (rg16uint) by textureLoad. It reads the shipped vertex stage's varyings by NAME (texcoord, banding,
// glyph -- the glyph words flat -- and color), so that render/tslSource.mjs can carry the emitted fragment into the
// shipped Slug pipeline's own shell (slugShell below): the SlugDilate vertex stage, the uniform struct, the two
// textures, all hand-written and unchanged, with three's fragment where slugShaderWgsl's fragment was.
//
// WHAT THE EMISSION MEASURED (v4484): see tools/ship/slugTsl-selfcheck.mjs's header for the numbers. Two facts fixed
// the route before a pixel was drawn. (1) three 0.178's WebGPU backend uploads an RGIntegerFormat DataTexture only as
// RG32Sint or RG32Uint ("Unsupported texture type with RGIntegerFormat" for UnsignedShortType), so a material on
// three's OWN renderer would need the band atlas repacked at twice the bytes; the stand-in textures below are
// RG32Uint for that reason, and only for emission. (2) three types a texture node 'uvec4' only when it is a
// DataTexture of UnsignedIntType, so the stand-in must be one, or the builder emits texture_2d<f32> for integer data.
//
// Copyright notice: the algorithm is Slug's (Eric Lengyel, MIT OR Apache-2.0) -- text/slugShaderWgsl.js SLUG_NOTICE.
"use strict";
import { slugShaderWgsl, SLUG_BINDINGS } from "../text/slugShaderWgsl.js";
import { slugShaderSource } from "../text/slugShader.js";
import { glslForDevice, slugVertexBuffers, SLUG_UNIFORMS } from "./slugDevice.mjs";

/** The graph's nodes: the core as Fn()s over two labelled texture nodes. `logWidth` is baked, as the WGSL bakes it. */
export function slugNodes(TSL, { logWidth = 12, curve, band, evenOdd = false, weight = false } = {}) {
    const { Fn, If, Loop, Break, int, uint, float, vec2, vec4, ivec2, uvec2, select, abs, sqrt, max, min, clamp, fract, textureLoad } = TSL;
    for (const n of ["Fn", "If", "Loop", "Break", "select", "textureLoad", "ivec2", "uvec2", "fract"]) if (typeof TSL[n] !== "function") throw new Error(`slugTsl: the TSL namespace has no ${n}()`);
    if (!Number.isInteger(logWidth) || logWidth < 1 || logWidth > 14) throw new Error("slugTsl: logWidth must be an integer in [1, 14]");
    if (!curve || !band) throw new Error("slugTsl: slugNodes needs the two texture nodes (curve, band)");
    const HALF = 1.0 / 65536.0;

    // *** three 0.178 HAS NO FLOAT-TO-UINT BITCAST. *** Its bitcast() node is 'bitcast<f32>' only (the WGSL builder's method
    // table), so asuint(y) >> 31 cannot be written as a node. The root code needs exactly the three SIGN BITS (the shifts and
    // masks in the reference are a fast way to gather them), so they are gathered by comparison instead -- and that reads
    // -0.0 as positive where asuint reads its sign bit. A control point can be -0.0 only if the atlas stored one and the
    // sample's y is +0.0; the gate measures the pictures against the shipped fragment and would see it.
    const signBit = (y) => select(y.lessThan(0.0), uint(1), uint(0));
    const calcRootCode = Fn(([y1, y2, y3]) => {
        const shift = signBit(y1).bitOr(signBit(y2).shiftLeft(uint(1))).bitOr(signBit(y3).shiftLeft(uint(2)));
        return uint(0x2E74).shiftRight(shift).bitAnd(uint(0x0101));
    }).setLayout({ name: "calcRootCode", type: "uint", inputs: [{ name: "y1", type: "float" }, { name: "y2", type: "float" }, { name: "y3", type: "float" }] });

    const solveHorizPoly = Fn(([p12, p3]) => {
        const a = p12.xy.sub(p12.zw.mul(2.0)).add(p3), b = p12.xy.sub(p12.zw);
        const ra = float(1.0).div(a.y), rb = float(0.5).div(b.y);
        const d = sqrt(max(b.y.mul(b.y).sub(a.y.mul(p12.y)), 0.0));
        const t1 = b.y.sub(d).mul(ra).toVar(), t2 = b.y.add(d).mul(ra).toVar();
        If(abs(a.y).lessThan(HALF), () => { t1.assign(p12.y.mul(rb)); t2.assign(t1); });
        return vec2(a.x.mul(t1).sub(b.x.mul(2.0)).mul(t1).add(p12.x), a.x.mul(t2).sub(b.x.mul(2.0)).mul(t2).add(p12.x));
    }).setLayout({ name: "solveHorizPoly", type: "vec2", inputs: [{ name: "p12", type: "vec4" }, { name: "p3", type: "vec2" }] });

    const solveVertPoly = Fn(([p12, p3]) => {
        const a = p12.xy.sub(p12.zw.mul(2.0)).add(p3), b = p12.xy.sub(p12.zw);
        const ra = float(1.0).div(a.x), rb = float(0.5).div(b.x);
        const d = sqrt(max(b.x.mul(b.x).sub(a.x.mul(p12.x)), 0.0));
        const t1 = b.x.sub(d).mul(ra).toVar(), t2 = b.x.add(d).mul(ra).toVar();
        If(abs(a.x).lessThan(HALF), () => { t1.assign(p12.x.mul(rb)); t2.assign(t1); });
        return vec2(a.y.mul(t1).sub(b.y.mul(2.0)).mul(t1).add(p12.y), a.y.mul(t2).sub(b.y.mul(2.0)).mul(t2).add(p12.y));
    }).setLayout({ name: "solveVertPoly", type: "vec2", inputs: [{ name: "p12", type: "vec4" }, { name: "p3", type: "vec2" }] });

    // three drops a conversion applied to a FUNCTION PARAMETER (int(offset) with offset a uint param emitted as `glyphLoc.x + offset`,
    // which GLSL refuses), so the parameter is typed int and the caller converts -- a conversion of a variable survives.
    const calcBandLoc = Fn(([glyphLoc, offset]) => {
        const x0 = glyphLoc.x.add(offset);
        return ivec2(x0.bitAnd(int((1 << logWidth) - 1)), glyphLoc.y.add(x0.shiftRight(int(logWidth))));
    }).setLayout({ name: "calcBandLoc", type: "ivec2", inputs: [{ name: "glyphLoc", type: "ivec2" }, { name: "offset", type: "int" }] });

    const calcCoverage = Fn(([xcov, ycov, xwgt, ywgt, flags]) => {
        const coverage = max(abs(xcov.mul(xwgt).add(ycov.mul(ywgt))).div(max(xwgt.add(ywgt), HALF)), min(abs(xcov), abs(ycov))).toVar();
        if (evenOdd) {
            If(flags.bitAnd(int(0x1000)).equal(int(0)), () => { coverage.assign(clamp(coverage, 0.0, 1.0)); })
                .Else(() => { coverage.assign(float(1.0).sub(abs(float(1.0).sub(fract(coverage.mul(0.5)).mul(2.0))))); });
        } else coverage.assign(clamp(coverage, 0.0, 1.0));
        if (weight) coverage.assign(sqrt(coverage));
        return coverage;
    }).setLayout({ name: "calcCoverage", type: "float", inputs: [{ name: "xcov", type: "float" }, { name: "ycov", type: "float" }, { name: "xwgt", type: "float" }, { name: "ywgt", type: "float" }, { name: "flags", type: "int" }] });

    // *** THE LOAD IS LABELLED, NOT THE TEXTURE NODE, AND THE TEXTURE NODE WAS BUILT WITH A UV. *** v4326's finding again: a
    // texture node built without a uv turns the uv-transform matrix on and every clone keeps it, so the first draft emitted
    // textureLod(nodeUniform0, ivec2((f_nodeUniform1 * vec3(float(loc), 1.0)).xy), 0.0) -- a filtered read of an integer
    // atlas through an unlabelled mat3 -- where a texelFetch by name was wanted. A label on the base node is lost by the clone.
    const fetchCurve = (loc) => textureLoad(curve, loc).label("curveTexture");
    const fetchBand = (loc) => uvec2(textureLoad(band, loc).label("bandTexture").xy);

    const slugRender = Fn(([renderCoord, emsPerPixel, bandTransform, glyphData]) => {
        const pixelsPerEm = float(1.0).div(emsPerPixel);
        const bandMax = ivec2(glyphData.z, glyphData.w.bitAnd(int(0x00FF)));
        const bandIndex = clamp(ivec2(renderCoord.mul(bandTransform.xy).add(bandTransform.zw)), ivec2(0, 0), bandMax);
        const glyphLoc = glyphData.xy;
        const xcov = float(0.0).toVar(), xwgt = float(0.0).toVar();
        const hbandData = fetchBand(ivec2(glyphLoc.x.add(bandIndex.y), glyphLoc.y)).toVar();
        const hbandLoc = calcBandLoc(glyphLoc, int(hbandData.y)).toVar();
        Loop({ start: int(0), end: int(hbandData.x), type: "int", condition: "<" }, ({ i }) => {
            const curveLoc = ivec2(fetchBand(ivec2(hbandLoc.x.add(i), hbandLoc.y))).toVar();
            const p12 = fetchCurve(curveLoc).sub(vec4(renderCoord, renderCoord)).toVar();
            const p3 = fetchCurve(ivec2(curveLoc.x.add(int(1)), curveLoc.y)).xy.sub(renderCoord).toVar();
            If(max(max(p12.x, p12.z), p3.x).mul(pixelsPerEm.x).lessThan(-0.5), () => { Break(); });
            const code = calcRootCode(p12.y, p12.w, p3.y).toVar();
            If(code.notEqual(uint(0)), () => {
                const r = solveHorizPoly(p12, p3).mul(pixelsPerEm.x).toVar();
                If(code.bitAnd(uint(1)).notEqual(uint(0)), () => { xcov.addAssign(clamp(r.x.add(0.5), 0.0, 1.0)); xwgt.assign(max(xwgt, clamp(float(1.0).sub(abs(r.x).mul(2.0)), 0.0, 1.0))); });
                If(code.greaterThan(uint(1)), () => { xcov.subAssign(clamp(r.y.add(0.5), 0.0, 1.0)); xwgt.assign(max(xwgt, clamp(float(1.0).sub(abs(r.y).mul(2.0)), 0.0, 1.0))); });
            });
        });
        const ycov = float(0.0).toVar(), ywgt = float(0.0).toVar();
        const vbandData = fetchBand(ivec2(glyphLoc.x.add(bandMax.y).add(int(1)).add(bandIndex.x), glyphLoc.y)).toVar();
        const vbandLoc = calcBandLoc(glyphLoc, int(vbandData.y)).toVar();
        Loop({ start: int(0), end: int(vbandData.x), type: "int", condition: "<" }, ({ i }) => {
            const curveLoc = ivec2(fetchBand(ivec2(vbandLoc.x.add(i), vbandLoc.y))).toVar();
            const p12 = fetchCurve(curveLoc).sub(vec4(renderCoord, renderCoord)).toVar();
            const p3 = fetchCurve(ivec2(curveLoc.x.add(int(1)), curveLoc.y)).xy.sub(renderCoord).toVar();
            If(max(max(p12.y, p12.w), p3.y).mul(pixelsPerEm.y).lessThan(-0.5), () => { Break(); });
            const code = calcRootCode(p12.x, p12.z, p3.x).toVar();
            If(code.notEqual(uint(0)), () => {
                const r = solveVertPoly(p12, p3).mul(pixelsPerEm.y).toVar();
                If(code.bitAnd(uint(1)).notEqual(uint(0)), () => { ycov.subAssign(clamp(r.x.add(0.5), 0.0, 1.0)); ywgt.assign(max(ywgt, clamp(float(1.0).sub(abs(r.x).mul(2.0)), 0.0, 1.0))); });
                If(code.greaterThan(uint(1)), () => { ycov.addAssign(clamp(r.y.add(0.5), 0.0, 1.0)); ywgt.assign(max(ywgt, clamp(float(1.0).sub(abs(r.y).mul(2.0)), 0.0, 1.0))); });
            });
        });
        return calcCoverage(xcov, ycov, xwgt, ywgt, glyphData.w);
    }).setLayout({ name: "slugRender", type: "float", inputs: [{ name: "renderCoord", type: "vec2" }, { name: "emsPerPixel", type: "vec2" }, { name: "bandTransform", type: "vec4" }, { name: "glyphData", type: "ivec4" }] });

    return { calcRootCode, solveHorizPoly, solveVertPoly, calcBandLoc, calcCoverage, slugRender };
}

/**
 * The stand-in three scene the builders emit FROM: a quad whose geometry carries the shipped varyings as attributes
 * (texcoord, banding, glyph as four ints, color), and two DataTextures in the shapes three can type -- the curve atlas
 * float RGBA, the band atlas RG32Uint (see the header). Nothing here is drawn by three; it is what getShaderAsync needs.
 */
export function makeSlugTsl(THREE, TSL, { logWidth = 12, evenOdd = false, weight = false } = {}) {
    const { Fn, attribute, varying, fwidth, texture, uv } = TSL;
    // *** DATA-LESS, ON PURPOSE. *** With data, three's WebGPU backend uploads them during getShaderAsync, and on this box's
    // SwiftShader that upload took the whole page down for a FloatType RGBA texture and for an RG32Uint one alike (measured:
    // three variants, three dead contexts; a UnsignedByteType texture uploads fine). Nothing here is drawn by three, so the
    // stand-ins carry a type and a size and no bytes: the builder still types the band node uvec4 and emits texture_2d<u32>.
    const curveTex = new THREE.DataTexture(null, 4, 4, THREE.RGBAFormat, THREE.FloatType);
    curveTex.magFilter = curveTex.minFilter = THREE.NearestFilter;
    const bandTex = new THREE.DataTexture(null, 4, 4, THREE.RGIntegerFormat, THREE.UnsignedIntType);
    bandTex.magFilter = bandTex.minFilter = THREE.NearestFilter;
    const curve = texture(curveTex, uv()), band = texture(bandTex, uv());   // WITH a uv: see slugNodes
    const N = slugNodes(TSL, { logWidth, curve, band, evenOdd, weight });
    const texcoord = varying(attribute("texcoord", "vec2"), "vTexcoord");
    const banding = varying(attribute("banding", "vec4"), "vBanding"); banding.setInterpolation("flat");
    const glyph = varying(attribute("glyph", "ivec4"), "vGlyph"); glyph.setInterpolation("flat");
    const color = varying(attribute("color", "vec4"), "vColor");
    const material = new THREE.NodeMaterial();
    material.fragmentNode = Fn(() => color.mul(N.slugRender(texcoord, fwidth(texcoord), banding, glyph)))();
    const geo = new THREE.PlaneGeometry(2, 2);
    geo.setAttribute("texcoord", new THREE.BufferAttribute(new Float32Array(8), 2));
    geo.setAttribute("banding", new THREE.BufferAttribute(new Float32Array(16), 4));
    geo.setAttribute("glyph", new THREE.BufferAttribute(new Int32Array(16), 4));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(16).fill(1), 4));
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mesh = new THREE.Mesh(geo, material); scene.add(mesh);
    return { material, scene, camera, mesh, nodes: N, textures: { curve: curveTex, band: bandTex } };
}

/**
 * The shipped Slug pipeline as a SHELL for the transplant: its vertex stage (SlugDilate, SlugUnpack, the four rows), its
 * uniform struct, its two textures, its VSOut -- everything in text/slugShaderWgsl.js up to the fragment -- and the same
 * head of the GLSL pair. The fragment three emitted lands where slugShaderWgsl's own fragment was, reading the varyings
 * by the names the shipped stage gives them.
 */
export function slugShell(logWidth = 12, defines = {}) {
    const wgsl = slugShaderWgsl(logWidth, defines).wgsl;
    const cut = wgsl.indexOf("\nfn slugFetchCurve");
    if (cut < 0) throw new Error("slugTsl: text/slugShaderWgsl.js changed shape; the shell cuts at its fetch functions");
    const prefix = wgsl.slice(0, cut);
    const g = glslForDevice(logWidth, defines);
    const gcut = g.fragment.indexOf("\nuint CalcRootCode");
    if (gcut < 0) throw new Error("slugTsl: text/slugShader.js changed shape; the shell cuts at CalcRootCode");
    const fragmentPrefix = g.fragment.slice(0, gcut).replace(/\n\s*\n/g, "\n");
    return { name: "slug", uniforms: SLUG_UNIFORMS.map((u) => ({ ...u })), buffers: slugVertexBuffers(), topology: null, textures: ["curveTexture", "bandTexture"],
             blend: "premultiplied", depthWrite: false, depthCompare: "always",
             wgsl: { prefix, uniformVar: "slug", varyingParam: "in", varyingType: "VSOut", varyings: { texcoord: "in.texcoord", banding: "in.banding", glyph: "in.glyph", color: "in.color" }, locals: {} },
             glsl: { vertex: g.vertex, fragmentPrefix, varyings: { texcoord: "vTexcoord", banding: "vBanding", glyph: "vGlyph", color: "vColor" }, locals: {} } };
}
export { SLUG_BINDINGS, slugShaderSource };
