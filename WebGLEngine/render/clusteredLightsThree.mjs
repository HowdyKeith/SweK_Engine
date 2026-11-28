// WebGLEngine/render/clusteredLightsThree.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE ENGINE'S LIGHTING ON THREE.JS PAGES. Keith, 2026-11-28: "lets do 3, 4, 5 and 6" -- 5 being the clustered lights, shadows and fog on the game's three.js pages, which
// render/clusteredLights.mjs's WebGL2 binding cannot reach: it binds raw GL textures to units it picks, and three.js owns its programs and its texture units. So this is a
// THREE-NATIVE TWIN that shares everything that decides the picture and owns only the plumbing:
//   the SAME frame data   render/clusteredLights.mjs build / packCells / packLights / packFaces, uploaded as THREE.DataTextures (rows and texels as the raw binding's)
//   the SAME shader       CLUSTERED_GLSL, put into three's own materials by onBeforeCompile: clusteredLight(world position, world normal, view, diffuse colour) is added
//                         to the material's direct diffuse after three's own lights (MeshStandardMaterial, MeshPhongMaterial, MeshLambertMaterial)
//   the SAME atlas        the faces allocateAtlas lays out, each drawn by three into one depth target (a THREE.DepthTexture compared LessEqual: sampler2DShadow, 2 x 2 PCF)
//   the SAME fog          render/volumetricFog.mjs's FOG_FS_GLSL / FOG_SHAFTS_FS_GLSL as a THREE.RawShaderMaterial pass over a scene target's colour and depth
// so tools/ship/clusteredLightsThree-selfcheck.mjs can hold a three.js page to the raw WebGL2 page of the same scene, pixel for pixel.
//
//   const L = createClusteredLightingThree(THREE, renderer, opts)     opts as createClusteredLighting's (space, viewCells, maxPerCell, atlasSize, slots, cascades, ...)
//   L.update(lights, camera, cookies?)    camera: { view, proj, near, far } (GL style, as the raw binding's) -- L.cameraOf(threeCamera) makes one from a THREE camera
//   L.renderShadows(scene)                every atlas face drawn from `scene` (depth only; objects with userData.noShadow left out)
//   L.patch(material)                     the material lit by the clusters too (call once; three compiles it with the chunk)
//   L.createFog({ lighting: true|false }) -> { render(sceneTarget, threeCamera, params, { fogLights }) }    the fog pass to the screen (or { target })
// NOT HERE: soft shadows (CLUSTERED_SOFT needs the atlas read raw beside the comparison; three binds one sampler per texture), skinned or morphed shadow casters drawn
// moved (the depth pass draws three's own skinning, but the clustered light reads the raw world position only through the patched vertex shader -- skinned meshes are
// not patched), WebGPU (three's WebGPU renderer has its own node materials).
"use strict";
import { DEFAULTS, build, packCells, packLights, packFaces, buildClusters, CLUSTERED_GLSL } from "./clusteredLights.mjs";
import { FOG_VS_GLSL, FOG_FS_GLSL, FOG_SHAFTS_FS_GLSL, fogLightsOf, MAX_FOG_LIGHTS, FOG_DEFAULTS } from "./volumetricFog.mjs";

const noVersion = (src) => src.replace(/^#version 300 es\s*/, "");
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export function createClusteredLightingThree(THREE, renderer, opts = {}) {
    const O = { ...DEFAULTS, ...opts }, dims = O.space === "view" ? O.viewCells : O.cells, N = dims[0] * dims[1] * dims[2], maxFaces = O.slots * O.slots;
    if (O.maxPerCell > 64) throw new Error("clusteredLightsThree: maxPerCell is at most 64");
    const dataTex = (w, h, format, data) => { const t = new THREE.DataTexture(data, w, h, format, THREE.FloatType); t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t; };
    const cellsData = new Float32Array((O.maxPerCell + 1) * N), lightsData = new Float32Array(36 * O.maxLights), facesData = new Float32Array(24 * maxFaces);
    const cellsTex = dataTex(O.maxPerCell + 1, N, THREE.RedFormat, cellsData), lightsTex = dataTex(9, O.maxLights, THREE.RGBAFormat, lightsData), facesTex = dataTex(6, maxFaces, THREE.RGBAFormat, facesData);
    let cookieTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType); cookieTex.minFilter = cookieTex.magFilter = THREE.LinearFilter; cookieTex.needsUpdate = true; let cookieSource = null;
    const depth = new THREE.DepthTexture(O.atlasSize, O.atlasSize, THREE.UnsignedIntType); depth.compareFunction = THREE.LessEqualCompare; depth.minFilter = depth.magFilter = THREE.LinearFilter;
    const atlas = new THREE.WebGLRenderTarget(O.atlasSize, O.atlasSize, { depthTexture: depth, depthBuffer: true });
    // ALLOCATED AND CLEARED NOW, not at the first renderShadows: three gives a DepthTexture its storage only when its target is first bound, and a page with no shadowed
    // light never draws the atlas -- the shadow sampler then met three's placeholder texture and EVERY patched draw failed ("mismatch between texture format and sampler
    // type"; battleship3d.html, found 2026-11-28). Cleared to 1, the atlas hides nothing.
    { const prev = renderer.getRenderTarget(); renderer.setRenderTarget(atlas); renderer.clear(false, true, false); renderer.setRenderTarget(prev); }
    const U = {
        uClusterCells: { value: cellsTex }, uClusterLights: { value: lightsTex }, uShadowFaces: { value: facesTex }, uShadowAtlas: { value: depth }, uCookies: { value: cookieTex },
        uClusterMin: { value: new THREE.Vector3() }, uClusterSize: { value: new THREE.Vector3(1, 1, 1) }, uClusterDims: { value: [dims[0], dims[1], dims[2]] }, uClusterMaxPerCell: { value: O.maxPerCell },
        uLightCount: { value: 0 }, uClusterMode: { value: 0 }, uSunIndex: { value: -1 }, uSunCascades: { value: 0 }, uShadowBias: { value: O.bias }, uAtlasTexel: { value: 1 / O.atlasSize },
        uClusterView: { value: new THREE.Matrix4() }, uClusterProj: { value: new THREE.Vector4(1, 1, 0.1, 100) }, uCascadeSplits: { value: new THREE.Vector4() },
    };
    const self = { options: O, uniforms: U, atlasTarget: atlas, clusters: null, atlas: null, lights: [], camera: null };
    /** A THREE camera as the { view, proj, near, far } the clusters and cascades take. */
    self.cameraOf = (cam) => { cam.updateMatrixWorld(); return { view: Array.from(cam.matrixWorldInverse.elements), proj: Array.from(cam.projectionMatrix.elements), near: cam.near, far: cam.far }; };
    self.update = (lights, camera = null, cookies = null) => {
        if (lights.length > O.maxLights) throw new Error(`clusteredLightsThree: ${lights.length} lights, at most ${O.maxLights}`);
        const B = build(O, lights, camera), C = B.C, view = C.mode === "view"; Object.assign(self, { clusters: C, atlas: B.A, lights, camera, sun: B.sun, cascades: B.cascades, splits: B.splits });
        if (cookies && cookies !== cookieSource) { cookieTex.dispose(); cookieTex = new THREE.DataTexture(cookies.data, cookies.size, cookies.size, THREE.RGBAFormat, THREE.UnsignedByteType); cookieTex.minFilter = cookieTex.magFilter = THREE.LinearFilter; cookieTex.needsUpdate = true; U.uCookies.value = cookieTex; cookieSource = cookies; }
        cellsData.set(packCells(C, N, O.maxPerCell, Float32Array)); cellsTex.needsUpdate = true;
        lightsData.set(packLights(lights, B.A, O.maxLights)); lightsTex.needsUpdate = true;
        facesData.set(packFaces(B.A, maxFaces)); facesTex.needsUpdate = true;
        U.uClusterMin.value.fromArray(C.min); U.uClusterSize.value.fromArray(C.size); U.uClusterDims.value = [...C.dims]; U.uLightCount.value = lights.length; U.uClusterMode.value = view ? 1 : 0;
        U.uSunIndex.value = B.sun ?? -1; U.uSunCascades.value = B.cascades || 0; U.uCascadeSplits.value.fromArray(B.splits);
        if (camera) U.uClusterView.value.fromArray(camera.view); U.uClusterProj.value.set(view ? C.P00 : 1, view ? C.P11 : 1, view ? C.near : 0.1, view ? C.far : 100);
        return { cells: N, overflow: C.overflow, faces: B.A.faces.length, unshadowed: B.A.unshadowed.length, cascades: B.cascades, space: O.space };
    };
    // the depth pass: one camera whose projection IS the face's view-projection (its world matrix the identity), every visible mesh drawn depth-only
    const shadowCam = new THREE.Camera(); shadowCam.matrixAutoUpdate = false; shadowCam.matrixWorldAutoUpdate = false;
    const depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
    self.renderShadows = (scene) => {
        if (!self.atlas) return;
        const prevTarget = renderer.getRenderTarget(), prevAuto = renderer.autoClear, prevOverride = scene.overrideMaterial, prevBg = scene.background, hidden = [];
        scene.traverse((o) => { if (o.userData && o.userData.noShadow && o.visible) { o.visible = false; hidden.push(o); } });
        renderer.autoClear = false; scene.overrideMaterial = depthMat; scene.background = null;
        renderer.setRenderTarget(atlas); atlas.scissorTest = false; atlas.viewport.set(0, 0, O.atlasSize, O.atlasSize); renderer.setRenderTarget(atlas); renderer.clear(false, true, false);
        for (const f of self.atlas.faces) {
            const [x, y, w, h] = f.rect.map((v) => Math.round(v * O.atlasSize));
            atlas.viewport.set(x, y, w, h); atlas.scissor.set(x, y, w, h); atlas.scissorTest = true; renderer.setRenderTarget(atlas);
            shadowCam.projectionMatrix.fromArray(f.viewProj); shadowCam.projectionMatrixInverse.copy(shadowCam.projectionMatrix).invert(); shadowCam.matrixWorld.identity(); shadowCam.matrixWorldInverse.identity();
            renderer.render(scene, shadowCam);
        }
        atlas.scissorTest = false; atlas.viewport.set(0, 0, O.atlasSize, O.atlasSize);
        for (const o of hidden) o.visible = true;
        scene.overrideMaterial = prevOverride; scene.background = prevBg; renderer.autoClear = prevAuto; renderer.setRenderTarget(prevTarget);
    };
    /** Light a three material by the clusters too: its direct diffuse gains clusteredLight(world position, world normal, view, its diffuse colour). */
    self.patch = (material) => {
        const prev = material.onBeforeCompile;
        material.onBeforeCompile = (shader, r) => {
            if (prev) prev.call(material, shader, r);
            Object.assign(shader.uniforms, U);
            shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vClWorld;").replace("#include <project_vertex>", "#include <project_vertex>\n{ vec4 clw = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\n clw = instanceMatrix * clw;\n#endif\n vClWorld = (modelMatrix * clw).xyz; }");
            shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\n${CLUSTERED_GLSL}\nvarying vec3 vClWorld;`)
                .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\n{ vec3 clN = normalize(inverseTransformDirection(normal, viewMatrix)); vec3 clV = normalize(cameraPosition - vClWorld); reflectedLight.directDiffuse += clusteredLight(vClWorld, clN, clV, diffuseColor.rgb); }");
        };
        const key = material.customProgramCacheKey ? material.customProgramCacheKey.bind(material) : () => "";
        material.customProgramCacheKey = () => key() + "|swek-clustered";
        material.needsUpdate = true; material.userData.swekClustered = true;
        return material;
    };
    /** The fog pass (render/volumetricFog.mjs's own GLSL) over a scene target with a depth texture; with lighting, the sun's shafts and the chosen lights' glow. */
    self.createFog = ({ lighting = true, fogLights: fogLights0 = null } = {}) => {
        const fu = { uColor: { value: null }, uDepth: { value: null }, uInvViewProj: { value: new THREE.Matrix4() }, uEye: { value: new THREE.Vector3() }, uFog: { value: new THREE.Vector4() }, uFog2: { value: new THREE.Vector4() },
            uAmbient: { value: new THREE.Vector3() }, uLightDir: { value: new THREE.Vector3() }, uLightColor: { value: new THREE.Vector3() }, uSteps: { value: new THREE.Vector2() },
            ...(lighting ? { ...U, uFogLights: { value: new Int32Array(MAX_FOG_LIGHTS) }, uFogLightCount: { value: 0 } } : {}) };
        const mat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: noVersion(FOG_VS_GLSL), fragmentShader: noVersion(lighting ? FOG_SHAFTS_FS_GLSL : FOG_FS_GLSL), uniforms: fu, depthTest: false, depthWrite: false });
        const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(9), 3)); geo.setDrawRange(0, 3);
        const quad = new THREE.Mesh(geo, mat); quad.frustumCulled = false; const fs = new THREE.Scene(); fs.add(quad); const oc = new THREE.Camera();
        return {
            material: mat,
            // colorTexture: the picture to fog when it is not sceneTarget's own (three tone-maps only what it draws to the screen: a page that wants the raw pass's
            // order -- tone map, then fog -- draws the scene to a float target, tone-maps it into another, and fogs that with the first one's depth; lights-three.html)
            render(sceneTarget, cam, params = {}, { fogLights = fogLights0, target = null, colorTexture = null } = {}) {
                const P = { ...FOG_DEFAULTS, ...params }, L = norm(P.lightDir); cam.updateMatrixWorld();
                fu.uColor.value = colorTexture || sceneTarget.texture; fu.uDepth.value = sceneTarget.depthTexture;
                fu.uInvViewProj.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).invert(); fu.uEye.value.setFromMatrixPosition(cam.matrixWorld);
                fu.uFog.value.set(P.density, P.falloff, P.baseHeight, P.albedo); fu.uFog2.value.set(P.g, P.maxDistance, P.up === "z" ? 1 : 0, P.jitter ? 1 : 0);
                fu.uAmbient.value.fromArray(P.ambient); fu.uLightDir.value.fromArray(L); fu.uLightColor.value.fromArray(P.lightColor); fu.uSteps.value.set(P.steps, 0);
                if (lighting) { const fl = fogLightsOf(self.lights, fogLights, fu.uEye.value.toArray()); fu.uFogLights.value.fill(0); fu.uFogLights.value.set(fl); fu.uFogLightCount.value = fl.length; }
                const prev = renderer.getRenderTarget(); renderer.setRenderTarget(target); renderer.render(fs, oc); renderer.setRenderTarget(prev);
            },
            dispose() { mat.dispose(); geo.dispose(); },
        };
    };
    self.dispose = () => { for (const t of [cellsTex, lightsTex, facesTex, cookieTex, depth]) t.dispose(); atlas.dispose(); depthMat.dispose(); };
    void buildClusters;
    return self;
}
