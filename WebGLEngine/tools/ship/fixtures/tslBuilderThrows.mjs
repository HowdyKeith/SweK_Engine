// WebGLEngine/tools/ship/fixtures/tslBuilderThrows.mjs -- v4627
//
// *** A SHADER THAT DELIBERATELY FAILS TO BUILD. THIS IS A FIXTURE, NOT A BROKEN FILE. ***
//
// It exists to prove that tools/ship/webgpuHarness.mjs's renderThreeTslToPixels FAILS a render whose shader
// threw, rather than returning ok:true and a frame of zeros. Until v4627 it did the latter, and that is not a
// theoretical hole: render/murmurKitTsl.mjs used MH_SPREAD without importing it, the colour rail rendered
// black at every input, and the bisect that followed spent most of a round eliminating the palette, the OKLab
// decode, the stop walk and two theories about Fn -- every one of which measured correct -- because the one
// thing nothing measured was whether the shader compiled at all.
//
// three.js does not throw when a TSL builder raises. It CATCHES the exception, logs it to the console as
// "THREE.TSL: <error> in <fn> at <file:line>", and substitutes a node that generates zero, so renderer.render
// returns cleanly and the RenderTarget reads back all zeros. The harness captures that console error; the
// check being gated here is that it refuses to call such a render a success.
//
// The throw is explicit rather than an undefined identifier, so that no reader, linter or census has to
// wonder whether this file is simply wrong. It is wrong ON PURPOSE and only ever imported by a gate.
"use strict";

export const THROW_MARKER = "tslBuilderThrows: this builder fails on purpose";

export function makeThrowingProbe(THREE, TSL) {
    const { Fn, vec4 } = TSL;
    const main = Fn(() => {
        // Raised while three.js BUILDS the fragment graph, which is the moment a real builder bug raises too.
        throw new Error(THROW_MARKER);
        // eslint-disable-next-line no-unreachable
        return vec4(1.0, 1.0, 1.0, 1.0);
    });
    const material = new THREE.NodeMaterial();
    material.transparent = false; material.depthTest = false; material.depthWrite = false;
    material.fragmentNode = main();
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
    return { material, scene, camera, uniforms: {}, setKnobs() {}, setTime() {} };
}
