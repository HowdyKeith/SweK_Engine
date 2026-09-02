// WebGLEngine/render/blackbodyTsl.mjs -- v4319
//
// PHYSICS AS TSL NODES: the blackbody of render/blackbodyWgsl.mjs (Planck's dimensionless shape and Wien's root by
// Newton) written once as TSL functions -- a Loop for the iteration -- so any node material can take Wien's peak as
// a node, and graded by the same key the WGSL and GLSL are: on both backends the picture's brightest column on the
// n = 5 row sits on x_lambda = 4.965114, and the root itself rides in the blue channel to a byte.
"use strict";

import { wienRootNewton, planckShape as planckCpu } from "../physics/thermal/blackbody.mjs";

export { wienRootNewton };
export const NEWTON_STEPS = 24;
/** The functions: { planckShape(x, n), wienRoot(n), wienResidual(x, n) } as TSL Fn nodes from a TSL namespace. */
export function blackbodyNodes(TSL) {
    const { Fn, float, exp, pow, Loop, select } = TSL;
    for (const n of ["Fn", "float", "exp", "pow", "Loop", "select"]) if (typeof TSL[n] !== "function") throw new Error(`blackbodyTsl: the TSL namespace has no ${n}()`);
    const planckShape = Fn(([x, n]) => select(x.lessThanEqual(0.0), float(0.0), select(x.lessThan(1e-3), pow(x, n.sub(1.0)), pow(x, n).div(exp(x).sub(1.0)))));
    // Newton from x = n, as the WGSL: the root sits just below n; a start at 1 finds the trivial root 0 (measured at v4318)
    const wienRoot = Fn(([n]) => { const x = float(n).toVar(); Loop({ start: 0, end: NEWTON_STEPS }, () => { const em = exp(x.negate()); const f = x.sub(n.mul(float(1.0).sub(em))); const df = float(1.0).sub(n.mul(em)); x.assign(x.sub(f.div(df))); }); return x; });
    const wienResidual = Fn(([x, n]) => x.sub(n.mul(float(1.0).sub(exp(x.negate())))));
    return { planckShape, wienRoot, wienResidual };
}
/**
 * The key material: x across [xLo, xHi], n down [nLo, nHi] (three's uv: n = nLo at the bottom row); red+green carry
 * shape / shape(root) in 16 bits, blue carries the root over `rootScale`. Returns { material, scene, camera, uniforms }.
 */
export function makeBlackbodyKeyTsl(THREE, TSL, { xLo = 0, xHi = 12, nLo = 5, nHi = 5, rootScale = 8 } = {}) {
    const { Fn, float, vec4, uv, uniform } = TSL;
    const nodes = blackbodyNodes(TSL);
    const uniforms = { xLo: uniform(float(xLo)).label("xLo"), xHi: uniform(float(xHi)).label("xHi"), nLo: uniform(float(nLo)).label("nLo"), nHi: uniform(float(nHi)).label("nHi"), rootScale: uniform(float(rootScale)).label("rootScale") };
    const material = new THREE.NodeMaterial();   // bare: the graph is the fragment, the uniforms labelled, so render/tslSource.mjs can transplant it
    material.fragmentNode = Fn(() => {
        const x = uniforms.xLo.add(uniforms.xHi.sub(uniforms.xLo).mul(uv().x));
        const n = uniforms.nLo.add(uniforms.nHi.sub(uniforms.nLo).mul(uv().y));
        const root = nodes.wienRoot(n);
        const e = nodes.planckShape(x, n).div(nodes.planckShape(root, n)).clamp(0.0, 1.0);
        return vec4(e.mul(255.0).floor().div(255.0), e.mul(255.0).fract(), root.div(uniforms.rootScale), 1.0);
    })();
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
    return { material, scene, camera, uniforms, nodes };
}
/** The CPU's numbers for the key: the root, and the byte the blue channel should carry. */
export function keyCpu(n = 5, rootScale = 8) { const root = wienRootNewton(n); return { root, blueByte: Math.round(root / rootScale * 255), peak: planckCpu(root, n) }; }
