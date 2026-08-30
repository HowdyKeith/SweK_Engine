// WebGLEngine/physics/fire/fireMesh.js — v2280
//
// mattatz/THREE.Fire (MIT) ported to our three.module.js: a ray-marched volumetric fire that lives in the
// box3d mesh overlay so toppling, burning buildings actually burn. Changes from the 2016 original: it's an ES
// class instead of a global THREE.Fire; getInverse(m) -> copy(m).invert() (getInverse was removed from three);
// and the Fire.png profile texture is generated procedurally on a canvas, so there's no binary asset to carry.
// Shader (GLSL1, ashima simplex noise + turbulence + ray-march) is verbatim from the original.
//
// Usage: const fire = createFire(); fire.scale.set(w, h, d); fire.position.copy(pos); scene.add(fire);
//        each frame: fire.update(performanceNowSeconds);

import * as THREE from "/vendor/three/three.module.js";
import { SNOISE3_BLOCK } from "../../shaders/ashimaNoise.js";   // v4177 -- one copy of Ashima, not two

const FireShader = {
    defines: { ITERATIONS: "20", OCTIVES: "3" },
    uniforms: {
        fireTex: { value: null },
        color: { value: null },
        time: { value: 0.0 },
        seed: { value: 0.0 },
        invModelMatrix: { value: new THREE.Matrix4() },
        scale: { value: new THREE.Vector3(1, 1, 1) },
        noiseScale: { value: new THREE.Vector4(1, 2, 1, 0.3) },
        magnitude: { value: 1.3 },
        lacunarity: { value: 2.0 },
        gain: { value: 0.5 },
    },
    vertexShader: [
        "varying vec3 vWorldPos;",
        "void main() {",
        "gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
        "vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;",
        "}",
    ].join("\n"),
    fragmentShader: [
        "uniform vec3 color;",
        "uniform float time;",
        "uniform float seed;",
        "uniform mat4 invModelMatrix;",
        "uniform vec3 scale;",
        "uniform vec4 noiseScale;",
        "uniform float magnitude;",
        "uniform float lacunarity;",
        "uniform float gain;",
        "uniform sampler2D fireTex;",
        "varying vec3 vWorldPos;",
        // v4177 -- Ashima's simplex now comes from shaders/ashimaNoise.js instead of being pasted here.
        // The port of Ramotion/aquarelle needs the SAME snoise(vec3) -- byte-identical after whitespace
        // normalisation -- and two pasted copies of a noise function is a worse hazard than two copies of
        // most things: a near-miss does not fail, it just looks slightly different, and nothing can tell
        // you which copy is the odd one. The extraction is gated on this shader assembling BYTE-IDENTICAL
        // to what it was before (sha256 42bca5fb), the way packGlb's extraction was proved at v4176.
        ...SNOISE3_BLOCK,
        "float turbulence(vec3 p) {",
        "float sum = 0.0; float freq = 1.0; float amp = 1.0;",
        "for(int i = 0; i < OCTIVES; i++) { sum += abs(snoise(p * freq)) * amp; freq *= lacunarity; amp *= gain; }",
        "return sum;",
        "}",
        "vec4 samplerFire (vec3 p, vec4 scale) {",
        "vec2 st = vec2(sqrt(dot(p.xz, p.xz)), p.y);",
        "if(st.x <= 0.0 || st.x >= 1.0 || st.y <= 0.0 || st.y >= 1.0) return vec4(0.0);",
        "p.y -= (seed + time) * scale.w;",
        "p *= scale.xyz;",
        "st.y += sqrt(st.y) * magnitude * turbulence(p);",
        "if(st.y <= 0.0 || st.y >= 1.0) return vec4(0.0);",
        "return texture2D(fireTex, st);",
        "}",
        "vec3 localize(vec3 p) { return (invModelMatrix * vec4(p, 1.0)).xyz; }",
        "void main() {",
        "vec3 rayPos = vWorldPos;",
        "vec3 rayDir = normalize(rayPos - cameraPosition);",
        "float rayLen = 0.0288 * length(scale.xyz);",
        "vec4 col = vec4(0.0);",
        "for(int i = 0; i < ITERATIONS; i++) {",
        "rayPos += rayDir * rayLen;",
        "vec3 lp = localize(rayPos);",
        "lp.y += 0.5;",
        "lp.xz *= 2.0;",
        "col += samplerFire(lp, noiseScale);",
        "}",
        "col.a = col.r;",
        "gl_FragColor = col;",
        "}",
    ].join("\n"),
};

// the fire-profile texture (replaces Fire.png): X = radial distance (0 center -> 1 edge), Y = height. Hot
// (white/yellow) at the bottom-center, cooling to red then transparent up + out. Red channel drives opacity.
function makeFireTexture(size) {
    size = size || 64;
    const c = (typeof document !== "undefined") ? document.createElement("canvas") : null;
    if (!c) return null;
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
        const hv = y / (size - 1);            // 0 top row .. 1 bottom row (canvas space)
        const height = 1 - hv;                // fire height: bottom row = 0 (hot), top row = 1 (cool)
        for (let x = 0; x < size; x++) {
            const radial = x / (size - 1);    // 0 center .. 1 edge
            let heat = (1 - height) * (1 - radial * 0.85);
            heat = Math.max(0, Math.min(1, heat));
            const r = Math.min(255, heat * 3.2 * 255);
            const g = Math.min(255, Math.max(0, (heat - 0.30) * 2.3 * 255));
            const b = Math.min(255, Math.max(0, (heat - 0.72) * 4.0 * 255));
            const o = (y * size + x) * 4;
            img.data[o] = r | 0; img.data[o + 1] = g | 0; img.data[o + 2] = b | 0; img.data[o + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.flipY = false;   // we already authored bottom-row = hot; RIG: flip if flames read upside down
    return tex;
}

class Fire extends THREE.Mesh {
    constructor(fireTex, color) {
        const material = new THREE.ShaderMaterial({
            defines: Object.assign({}, FireShader.defines),
            uniforms: THREE.UniformsUtils.clone(FireShader.uniforms),
            vertexShader: FireShader.vertexShader,
            fragmentShader: FireShader.fragmentShader,
            transparent: true, depthWrite: false, depthTest: false,
        });
        if (fireTex) { fireTex.magFilter = fireTex.minFilter = THREE.LinearFilter; fireTex.wrapS = fireTex.wrapT = THREE.ClampToEdgeWrapping; }
        material.uniforms.fireTex.value = fireTex;
        material.uniforms.color.value = color || new THREE.Color(0xeeeeee);
        material.uniforms.invModelMatrix.value = new THREE.Matrix4();
        material.uniforms.scale.value = new THREE.Vector3(1, 1, 1);
        material.uniforms.seed.value = Math.random() * 19.19;
        super(new THREE.BoxGeometry(1, 1, 1), material);
        this.frustumCulled = false;
    }
    update(time) {
        const inv = this.material.uniforms.invModelMatrix.value;
        this.updateMatrixWorld();
        inv.copy(this.matrixWorld).invert();      // three r123+: getInverse removed
        if (time !== undefined) this.material.uniforms.time.value = time;
        this.material.uniforms.scale.value = this.scale;
    }
}

// one shared texture across all flames (cheap). Pass opts.color for a tint.
let _sharedTex = null;
export function createFire(opts = {}) {
    if (!_sharedTex) _sharedTex = makeFireTexture(opts.texSize || 64);
    return new Fire(opts.texture || _sharedTex, opts.color);
}

export { Fire, FireShader, makeFireTexture };
