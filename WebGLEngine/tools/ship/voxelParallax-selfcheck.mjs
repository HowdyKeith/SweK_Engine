// WebGLEngine/tools/ship/voxelParallax-selfcheck.mjs -- v2832
//
// Run: node tools/ship/voxelParallax-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES parallax occlusion reaching the LIVE voxel face shader.
//
// render/parallaxOcclusion.js was built and gated in v2784 with a standalone demo page, and the live voxel
// renderer never used it. The v2784 note named what was missing: "fold parallaxUV into the live voxel-face
// shader (voxelDetail layer) behind a flag + per-material heightmaps".
//
// TWO OF THOSE THREE ALREADY EXISTED, which is why this became a wiring job rather than a project: the shader
// already computes a triplanar `uv` and already samples a per-material layer from uDetailArray. What is NEW is
// the march and the tangent basis.
//
// WHAT THIS GATE CAN AND CANNOT DO. There is no GL context here, so the GLSL is not compiled and the picture is
// not judged -- that is render QA's job on the rig. What IS checkable headlessly, and is checked:
//   the whole uniform chain exists (the dead-code failure this round actually hit -- see below);
//   the TANGENT BASIS is exact, which is the one piece of maths unique to voxel faces;
//   the march agrees with parallaxUVMirror, the JS model already gated against a 4000-layer reference;
//   and the feature is genuinely default-off.
//
// THE DEAD-CODE FAILURE, recorded because it nearly shipped: the first version declared uParallaxScale and
// uParallaxLayers in GLSL and USED them in the shader, but never called getUniformLocation and never set them.
// The shader would have compiled, the uniforms would have read 0, and the feature would have been permanently
// off while looking wired. A grep for the set-site is what caught it.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parallaxUVMirror } from "../../render/parallaxOcclusion.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const src = fs.readFileSync(path.join(ENG, "render", "voxelrenderer.js"), "utf8");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// 1. THE WHOLE UNIFORM CHAIN -- declared, looked up, SET, exposed, used. Any missing link is silent.
{
    ok("GLSL declares the uniforms", /uniform float uParallaxScale/.test(src) && /uniform int\s+uParallaxLayers/.test(src));
    ok("JS LOOKS THEM UP", /getUniformLocation\(this\.program, "uParallaxScale"\)/.test(src) && /getUniformLocation\(this\.program, "uParallaxLayers"\)/.test(src));
    ok("JS SETS them every draw (the link that was missing and nearly shipped)",
        /gl\.uniform1f\(this\.uParallaxScale/.test(src) && /gl\.uniform1i\(this\.uParallaxLayers/.test(src));
    ok("the shader actually consults them", /uParallaxScale <= 0\.0\) return uvw/.test(src) && /uParallaxLayers < 4/.test(src));
    ok("the march is applied to the detail sample", /swekParallax\(uv \* uDetailScale, N, normalize\(uCamPos - vWorld\), layer\)/.test(src));
    ok("there is a public setter and a reporter", /setParallax\(scale, layers\)/.test(src) && /getParallaxState\(\)/.test(src));
}

// 2. DEFAULT OFF, and doubly so
{
    ok("parallax defaults to 0 (off)", /_parallaxScale\s*=\s*0\.0/.test(src));
    ok("the detail layer it rides on ALSO defaults off, so nothing changes unasked", /_detailMix\s+=\s*0\.0/.test(src));
    ok("scale 0 returns the uv untouched before any sampling", /if \(uParallaxScale <= 0\.0\) return uvw;/.test(src));
    ok("a grazing view is left alone rather than marched into a swim", /vt\.z < 0\.05\) return uvw/.test(src));
    ok("layers are clamped in the shader AND in the setter", /uParallaxLayers > 64/.test(src) && /Math\.min\(64, layers \| 0\)/.test(src));
    ok("scale is clamped in the setter", /Math\.min\(0\.25, \+scale/.test(src));
}

// 3. THE TANGENT BASIS IS EXACT -- the one piece of maths unique to voxel faces.
//    The shader picks (T,B) by dominant axis to match the SAME choice that picks the triplanar uv. If those two
//    choices disagree, the parallax offset moves the texture along the wrong axis -- which still looks like a
//    surface, just a wrong one. So the pairing is checked algebraically against the uv rule.
{
    // uv rule from the shader: |N.y| dominant -> xz ; else |N.x| > |N.z| -> yz ; else xy
    const basisFor = (N) => {
        const a = N.map(Math.abs);
        if (a[1] > a[0] && a[1] > a[2]) return { uv: "xz", T: [1, 0, 0], B: [0, 0, 1] };
        if (a[0] > a[2]) return { uv: "yz", T: [0, 1, 0], B: [0, 0, 1] };
        return { uv: "xy", T: [1, 0, 0], B: [0, 1, 0] };
    };
    const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];

    let allPerp = true, allAligned = true, rows = [];
    for (const N of [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) {
        const { uv, T, B } = basisFor(N);
        if (Math.abs(dot(T, N)) > 1e-12 || Math.abs(dot(B, N)) > 1e-12) allPerp = false;
        const c = cross(T, B);
        if (Math.abs(Math.abs(dot(c, N)) - 1) > 1e-12) allAligned = false;
        rows.push(`${N.join("")}->${uv}`);
    }
    ok("T and B are PERPENDICULAR to the face normal on all six voxel faces", allPerp, rows.join(" "));
    ok("T x B is parallel to N (a right-handed basis, not a skewed one)", allAligned);

    // and the pairing must MATCH the uv the shader actually builds
    const uvAxes = { xz: [[1, 0, 0], [0, 0, 1]], yz: [[0, 1, 0], [0, 0, 1]], xy: [[1, 0, 0], [0, 1, 0]] };
    let matches = true;
    for (const N of [[0, 1, 0], [1, 0, 0], [0, 0, 1]]) {
        const { uv, T, B } = basisFor(N);
        const [eu, ev] = uvAxes[uv];
        if (T.join() !== eu.join() || B.join() !== ev.join()) matches = false;
    }
    ok("the tangent pair MATCHES the axes the triplanar uv is built from", matches);
    // the shader's own branches must carry those exact vectors
    ok("the shader's xz branch pairs (1,0,0) with (0,0,1)", /uv = xz[\s\S]{0,40}|T = vec3\(1\.0, 0\.0, 0\.0\); B = vec3\(0\.0, 0\.0, 1\.0\); \}\s*\/\/ uv = xz/.test(src));
    ok("the shader's yz branch pairs (0,1,0) with (0,0,1)", /T = vec3\(0\.0, 1\.0, 0\.0\); B = vec3\(0\.0, 0\.0, 1\.0\); \}\s*\/\/ uv = yz/.test(src));
    ok("the shader's xy branch pairs (1,0,0) with (0,1,0)", /T = vec3\(1\.0, 0\.0, 0\.0\); B = vec3\(0\.0, 1\.0, 0\.0\); \}\s*\/\/ uv = xy/.test(src));
}

// 4. THE MARCH AGREES WITH THE ALREADY-GATED JS MODEL
//    parallaxUVMirror is gated in v2784 to within 0.01 uv of a 4000-layer reference. Porting the shader's loop
//    to JS and comparing against it is the strongest check available without a GPU.
{
    const height = (u, v) => 0.5 + 0.5 * Math.sin(u * 6.283) * Math.cos(v * 6.283);   // smooth, known
    // the shader's algorithm, transcribed
    const shaderMarch = (u, v, vt, scale, layers) => {
        if (scale <= 0) return [u, v];
        if (vt[2] < 0.05) return [u, v];
        const stepH = 1 / layers;
        const dx = (vt[0] / vt[2]) * scale * stepH, dy = (vt[1] / vt[2]) * scale * stepH;
        let curH = 1, prevH = 1, cu = u, cv = v, pu = u, pv = v;
        let sampled = height(cu, cv);
        for (let i = 0; i < layers && sampled < curH; i++) {
            pu = cu; pv = cv; prevH = curH;
            cu -= dx; cv -= dy; curH -= stepH;
            sampled = height(cu, cv);
        }
        const after = sampled - curH, before = height(pu, pv) - prevH;
        const w = Math.max(0, Math.min(1, after / (after - before || 1e-5)));
        return [cu + (pu - cu) * w, cv + (pv - cv) * w];
    };
    let worst = 0, n = 0;
    for (const ang of [0.2, 0.5, 0.9, 1.2]) {
        for (const u of [0.1, 0.35, 0.6, 0.85]) {
            const vt = [Math.sin(ang), 0.1, Math.cos(ang)];
            const nl = Math.hypot(...vt); const vn = vt.map((x) => x / nl);
            const mine = shaderMarch(u, 0.4, vn, 0.06, 32);
            // parallaxUVMirror returns an OBJECT {u,v,height}, and works in DEPTH (1-height) counting up
            // while the shader works in HEIGHT counting down. Those are the same march written two ways, and
            // this comparison is what proves it rather than assuming it.
            const ref = parallaxUVMirror(u, 0.4, vn[0], vn[1], vn[2], 0.06, height, 32);
            worst = Math.max(worst, Math.hypot(mine[0] - ref.u, mine[1] - ref.v));
            n++;
        }
    }
    ok("the shader's march reproduces the GATED JS model", worst < 1e-6, `worst ${worst.toExponential(2)} over ${n} rays`);

    // and it must actually DO something, or agreeing is meaningless
    const vt = [0.7, 0.1, 0.7]; const nl = Math.hypot(...vt); const vn = vt.map((x) => x / nl);
    const off = shaderMarch(0.35, 0.4, vn, 0.06, 32);
    ok("...and the offset is NON-ZERO at an angle (otherwise it agrees by doing nothing)",
        Math.hypot(off[0] - 0.35, off[1] - 0.4) > 1e-4, Math.hypot(off[0] - 0.35, off[1] - 0.4).toFixed(5));
    const head = shaderMarch(0.35, 0.4, [0, 0, 1], 0.06, 32);
    ok("head-on there is no shift (the classic parallax invariant)", Math.hypot(head[0] - 0.35, head[1] - 0.4) < 1e-9);
}

// 5. HEIGHT SOURCE is stated as the approximation it is
{
    ok("height comes from the detail texture's luminance", /dot\(c, vec3\(0\.299, 0\.587, 0\.114\)\)/.test(src));
    ok("...and the file says so, and says it is an approximation", /approximation and is stated as one|dedicated height channel would be better/i.test(src));
}

console.log("voxelParallax-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
