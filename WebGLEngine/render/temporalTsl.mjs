// render/temporalTsl.mjs -- v4727 -- THE TEMPORAL CHAIN FOR A THREE.JS SCENE, AS TSL: its inputs first.
//
// fx/fsr/fsrTsl.mjs put a three.js scene through FSR1. The temporal half -- jitter, motion, dilation, depth clip,
// locks, the reactive mask, the jitter-aware resolve and the rectified accumulate -- exists in render/ as CPU
// references and gfx/device.js kernels, and fsr.html runs it every frame on pictures it draws itself. Nothing
// could run it on a three.js scene, because gfx/device.js makes its own device. This module is the same chain
// written as TSL, one pass at a time, each held to the CPU reference that pass already has
// (render/temporalTsl-selfcheck.mjs). v4727 is the INPUTS: the jitter, and the motion field every later pass reads.
//
// ---- THE JITTER ------------------------------------------------------------------------------------------------
// applyJitter writes render/jitter.mjs's jitterProjection into the camera, NEGATED -- the sense fsr.html settled at
// v4638 (jitterProjection moves the IMAGE by +j, the resolve assumes the SAMPLE moved by +j). The gate renders a
// three.js scene both ways and measures which one the resolve reconstructs.
//
// ---- THE MOTION FIELD ------------------------------------------------------------------------------------------
// (du, dv, valid, zPrev) at DISPLAY resolution, in render/motionVectors.mjs's convention exactly: uvPrev - uvCurr in
// UV units, uv (0,0) at the top-left, zPrev the clip-space z this surface would have had last frame. Two sources
// write it, and the split is the point:
//
//   * SURFACES are written by a subclass of three's own VelocityNode, drawn as the override material of an
//     unjittered, geometry-only pass. It carries each OBJECT's previous model matrix, so a spinning mesh moves in
//     the field and not only the camera -- render/objectMotion.mjs's question, answered by the renderer that knows
//     the matrices. three's node writes ndcCurrent - ndcPrevious; this one writes the tree's four channels.
//   * THE BACKGROUND -- every pixel the pass did not draw -- is completed from depth: the far plane unprojected
//     through the current camera and reprojected through the previous one, which is motionVectorsCPU's own
//     arithmetic on a pixel whose depth is the far plane. A sky that stays invalid would never accumulate.
//
// *** DISPLAY RESOLUTION, UNJITTERED, AND THAT IS THIS TREE'S CHAIN RATHER THAN FSR2'S. *** FSR2 reads render-
// resolution depth and motion and dilates them before sampling at display pixels. fsr.html's chain, whose CPU
// references this module is held to, takes both at display resolution through the unjittered camera, so this does
// the same: a second draw of the scene with a trivial fragment, at display size. That costs a geometry pass; it
// buys a field every downstream reference can be graded against without an upsampling step nothing in render/ has.
//
// *** THE CAMERA'S HISTORY IS THE CHAIN'S, NOT THE NODE'S. *** three's VelocityNode keeps the previous camera per
// frameId. This chain draws the same camera twice a frame (jittered colour, unjittered motion), so the previous
// camera is SET by the caller -- setPreviousCamera -- and each object's previous matrix is kept here, written after
// the object is drawn in this pass and nowhere else.
//
// ---- THREE THINGS ABOUT THREE, MEASURED BEFORE OR BY A ROW --------------------------------------------------------
//   * *** A DATA PASS MUST SET blending = NoBlending, OR ITS FOURTH CHANNEL SCALES THE OTHER THREE. *** A NodeMaterial
//     is created with NormalBlending, and three keeps blending on for an OPAQUE material into a render target:
//     vec4(0.1, 0.2, 0.3, 0.4) into a cleared float target reads back (0.04, 0.08, 0.12, 0.4). The first run of
//     this gate read every surface pixel's `valid` as its zPrev and its motion scaled by it -- off by a third of a
//     pixel -- while the far-plane completion passed, because the far plane's zPrev is 1. fx/fsr/fsrTsl.mjs never
//     met it: EASU and RCAS write alpha 1. Every material this module makes is NoBlending.
//   * An MRT output reaches a RenderTarget texture ONLY BY NAME. mrt({ output, velocity }) into a count-2 target
//     whose textures are unnamed draws NOTHING -- not the colour either -- on both backends, silently. Named
//     "output" and "velocity" it draws. This module uses no MRT; the note is here for the next one that does.
//   * Both backends store the same WINDOW depth in a depth texture. What differs is the clip range the camera's
//     projection produces: [0, 1] for renderer.coordinateSystem === WebGPUCoordinateSystem, [-1, 1] for WebGL's.
//     clipDepth maps one to the other, and every depth this chain hands a later pass is CLIP z, the unit
//     motionVectorsCPU and disocclusionCPU are written in.
"use strict";
import { jitterProjection } from "./jitter.mjs";

export const TEMPORAL_TSL_NEEDS = Object.freeze(["Fn", "float", "int", "vec2", "vec4", "ivec2", "uniform", "textureLoad",
    "screenCoordinate", "select", "cameraProjectionMatrix", "modelViewMatrix", "positionLocal", "positionPrevious"]);

function need(TSL) {
    for (const n of TEMPORAL_TSL_NEEDS) if (TSL[n] === undefined) throw new Error(`render/temporalTsl: the TSL namespace has no ${n}`);
}

/**
 * Jitter a three.js camera for THIS frame's colour render: `base` is its unjittered projection (a Matrix4 the
 * caller keeps), (jx, jy) render/jitter.mjs's offset in render-resolution pixels. Writes the jittered projection and
 * its inverse; call restoreProjection after the colour pass so the motion pass sees the unjittered one.
 */
export function applyJitter(camera, base, jx, jy, rw, rh) {
    const j = jitterProjection(base.elements, -jx, -jy, rw, rh);   // NEGATED -- see the header
    camera.projectionMatrix.fromArray(j);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    return j;
}
export function restoreProjection(camera, base) {
    camera.projectionMatrix.copy(base);
    camera.projectionMatrixInverse.copy(base).invert();
}

/** True when the renderer's projections produce clip z in [-1, 1] (WebGL's convention) rather than [0, 1]. */
export function glClip(THREE, renderer) { return renderer.coordinateSystem === THREE.WebGLCoordinateSystem; }
/** Window depth (what a depth texture holds, both backends) to clip z in the camera's convention. */
export function clipDepth(windowDepth, gl) { return gl ? windowDepth * 2 - 1 : windowDepth; }

/**
 * The surface half of the motion field: an instance of a VelocityNode subclass whose output is the tree's
 * (du, dv, valid, zPrev). Use it as the fragmentNode of an override material on an UNJITTERED camera.
 * node.setPreviousCamera(projection, view) before each draw; the first draw of an object sees itself as its own
 * previous (zero object motion), which is the first-frame rule the rest of the chain already keeps.
 */
export function makeMotionNode(THREE, TSL) {
    need(TSL);
    if (typeof THREE.VelocityNode !== "function") throw new Error("render/temporalTsl: this three build exports no VelocityNode");
    const { vec4, select, cameraProjectionMatrix, modelViewMatrix, positionLocal, positionPrevious } = TSL;
    const prev = new WeakMap();
    class MotionNode extends THREE.VelocityNode {
        constructor() { super(); this.nodeType = "vec4"; }
        setPreviousCamera(projection, view) {
            this.previousProjectionMatrix.value.copy(projection);
            this.previousCameraViewMatrix.value.copy(view);
        }
        // per object, BEFORE it is drawn: its matrix from the last time THIS pass drew it
        update({ object }) {
            let m = prev.get(object);
            if (!m) { m = object.matrixWorld.clone(); prev.set(object, m); }
            this.previousModelWorldMatrix.value.copy(m);
        }
        updateAfter({ object }) {
            const m = prev.get(object);
            if (m) m.copy(object.matrixWorld); else prev.set(object, object.matrixWorld.clone());
        }
        setup() {
            const cur = cameraProjectionMatrix.mul(modelViewMatrix).mul(positionLocal);
            const was = this.previousProjectionMatrix.mul(this.previousCameraViewMatrix.mul(this.previousModelWorldMatrix)).mul(positionPrevious);
            // uv = ((x + 1) / 2, (1 - y) / 2), so uvPrev - uvCurr = ((xp - xc) / 2, (yc - yp) / 2)
            const xc = cur.x.div(cur.w), yc = cur.y.div(cur.w), xp = was.x.div(was.w), yp = was.y.div(was.w);
            const ok = was.w.greaterThan(0.0);   // behind the previous eye: no answer, as motionVectorsCPU says
            return vec4(select(ok, xp.sub(xc).mul(0.5), 0.0), select(ok, yc.sub(yp).mul(0.5), 0.0),
                        select(ok, 1.0, 0.0), select(ok, was.z.div(was.w), 0.0));
        }
    }
    return new MotionNode();
}

/**
 * The completion pass: a fragment node over the surface pass's two outputs. Where the surface pass drew (window
 * depth < 1) the motion is passed through; where it did not, the far plane is carried through motionVectorsCPU's
 * arithmetic with the current INVERSE and previous FORWARD view-projections (uniforms.invVPCur / vpPrev, Matrix4s
 * the caller fills each frame). Output vec4 (du, dv, valid, zPrev), and a second node, `depthNode`, gives the
 * CLIP depth as vec4(z, 0, 0, 1) for the passes that read depth.
 */
export function motionCompleteNodes(THREE, TSL, motionTex, depthTex, { w, h, gl }) {
    need(TSL);
    const { Fn, float, int, vec4, ivec2, uniform, textureLoad, screenCoordinate, select } = TSL;
    const u = { invVPCur: uniform(new THREE.Matrix4()), vpPrev: uniform(new THREE.Matrix4()),
                w: uniform(float(w)), h: uniform(float(h)) };
    const texel = () => ivec2(int(screenCoordinate.x), int(screenCoordinate.y));
    const clipOf = (d) => (gl ? d.mul(2.0).sub(1.0) : d);
    const node = Fn(() => {
        const wd = textureLoad(depthTex, texel()).x;
        const m = textureLoad(motionTex, texel());
        const uu = screenCoordinate.x.div(u.w), vv = screenCoordinate.y.div(u.h);
        const d = clipOf(wd);
        const p = u.invVPCur.mul(vec4(uu.mul(2.0).sub(1.0), float(1.0).sub(vv.mul(2.0)), d, 1.0));
        const world = vec4(p.x.div(p.w), p.y.div(p.w), p.z.div(p.w), 1.0);
        const q = u.vpPrev.mul(world);
        const ok = p.w.notEqual(0.0).and(q.w.greaterThan(0.0));
        const pu = q.x.div(q.w).add(1.0).mul(0.5), pv = float(1.0).sub(q.y.div(q.w)).mul(0.5);
        const far = vec4(select(ok, pu.sub(uu), 0.0), select(ok, pv.sub(vv), 0.0), select(ok, 1.0, 0.0), select(ok, q.z.div(q.w), 0.0));
        return select(wd.lessThan(1.0), m, far);
    })();
    const depthNode = Fn(() => vec4(clipOf(textureLoad(depthTex, texel()).x), 0.0, 0.0, 1.0))();
    return { node, depthNode, uniforms: u };
}

/**
 * The input stage of the chain for one frame, with its targets: the surface pass (override material, unjittered
 * camera) into `surface` (rgba float + a depth texture), then the completion into `motion` and the clip depth into
 * `depth`. `render(renderer, scene, camera)` draws all three; the caller has restored the unjittered projection.
 */
export function makeMotionStage(THREE, TSL, { w, h, gl, type = null }) {
    const T = type == null ? THREE.FloatType : type;
    const surface = new THREE.RenderTarget(w, h, { type: T, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    surface.depthTexture = new THREE.DepthTexture(w, h); surface.depthTexture.type = THREE.FloatType;
    const flat = { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false };
    const motion = new THREE.RenderTarget(w, h, flat), depth = new THREE.RenderTarget(w, h, flat);
    const motionNode = makeMotionNode(THREE, TSL);
    const override = new THREE.NodeMaterial(); override.fragmentNode = motionNode; override.blending = THREE.NoBlending;
    const comp = motionCompleteNodes(THREE, TSL, surface.texture, surface.depthTexture, { w, h, gl });
    const quad = (node) => { const m = new THREE.NodeMaterial(); m.fragmentNode = node; m.depthTest = false; m.depthWrite = false; m.blending = THREE.NoBlending;
        const s = new THREE.Scene(); s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); return { scene: s, material: m }; };
    const qM = quad(comp.node), qD = quad(comp.depthNode), ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const prevP = new THREE.Matrix4(), prevV = new THREE.Matrix4(), vp = new THREE.Matrix4();
    let frames = 0;
    return {
        surface, motion, depth, motionNode, uniforms: comp.uniforms,
        /** Whether the field just rendered carries a previous frame -- frame one's is every object against itself. */
        get hasHistory() { return frames > 1; },   // after a render: motionVectors.hasHistory's own rule
        async render(renderer, scene, camera) {
            camera.updateMatrixWorld();
            if (frames === 0) { prevP.copy(camera.projectionMatrix); prevV.copy(camera.matrixWorldInverse); }
            motionNode.setPreviousCamera(prevP, prevV);
            vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
            comp.uniforms.invVPCur.value.copy(vp).invert();
            comp.uniforms.vpPrev.value.multiplyMatrices(prevP, prevV);
            const prevTarget = renderer.getRenderTarget(), prevOverride = scene.overrideMaterial, prevBg = scene.background;
            scene.overrideMaterial = override; scene.background = null;
            // the draw clears depth to 1 on its own; the completion reads depth and not the cleared colour, so the
            // renderer's clear colour is left as the caller set it
            renderer.setRenderTarget(surface); await renderer.renderAsync(scene, camera);
            scene.overrideMaterial = prevOverride; scene.background = prevBg;
            renderer.setRenderTarget(motion); await renderer.renderAsync(qM.scene, ortho);
            renderer.setRenderTarget(depth); await renderer.renderAsync(qD.scene, ortho);
            renderer.setRenderTarget(prevTarget);
            prevP.copy(camera.projectionMatrix); prevV.copy(camera.matrixWorldInverse);
            frames++;
        },
        dispose() { surface.dispose(); motion.dispose(); depth.dispose(); override.dispose(); qM.material.dispose(); qD.material.dispose(); },
    };
}
