// WebGLEngine/render/aiPresenceOrbTsl.mjs
//
// tools/ship/nextRounds.mjs's ai-presence-orb-widget entry, closed. krispuckett/murmur-web (MIT) -- "responsive
// AI presence orbs for the web" -- has one runtime dependency (vgpu, its own WebGPU/WebGL2 device abstraction,
// separate from this tree's gfx/device.js), so the backlog entry's own "how" names the precedented move: hand-
// port the DESIGN into render/tslSource.mjs's own TSL convention, the way render/swiftShaderPass.js hand-ported
// krispuckett/SwiftUIShaders' Metal shaders rather than adopting a second rendering stack. This is the shader
// half; render/aiPresenceOrbState.mjs (read first -- it explains what WAS and was not independently confirmed
// against murmur-web's real source) is the pure-JS half, playing the role render/swiftShaderModel.mjs plays for
// swiftShaderPass.js: a CPU reference this file's rendered pixels are graded against.
//
// *** THE TECHNIQUE, READ FROM murmur-web's src/shaders/kit.ts DIRECTLY, NOT GUESSED: *** a star-shaped SDF
// sphere SOLVED ANALYTICALLY rather than raymarched (two fixed-point iterations in the general case); this
// port ships the UNDEFORMED special case only ("still" has no silhouette deformation, matching its own
// species description, "a quiet glass sphere"), where the analytic solve collapses to the textbook orthographic
// ray-sphere formula: for a sphere of radius R centred at the origin, viewed along -Z, a screen point at
// in-plane offset rho has entry height z = sqrt(R^2 - rho^2) and surface normal N = (rho.x, rho.y, z) / R --
// hand-cross-checked in the gate against the independent quadratic ray-sphere intersection formula, which must
// agree with this closed form exactly (both solve the same sphere, by two different routes).
//
// *** ONE FRESNEL TERM WAS NOT GIVEN AND WAS RECONSTRUCTED, NAMED HERE RATHER THAN LEFT SILENT: *** kit.ts's
// fetched description gives what fres is USED for (a transmission split "1 - 0.88*pow(fres,2.2)", a rim
// "pow(fres, 3.9 or 5.4)") but not the base fres = f(cosIncidence) formula itself. This port defines fres = 1 -
// ci (ci = cosine of incidence, 0 at the silhouette, 1 dead centre) -- the plainest read consistent with both
// quoted uses (fres=0 centre, fres=1 grazing) -- rather than a Schlick power this port cannot cite.
//
// *** HUE ROTATION IS DONE AS A DIRECT 2D ROTATION OF OKLab's (a,b), NOT VIA atan2. *** vendor/three-webgpu's
// TSL namespace has no atan2 (checked directly: grepping for it finds nothing, only single-argument atan) --
// but a hue shift by angle theta in OKLab's polar (C, h) form is exactly the same operation as rotating the
// Cartesian (a, b) pair by theta, which needs only cos/sin (both present) and avoids atan2's origin
// singularity besides. render/aiPresenceOrbState.mjs's lchToOklab/oklabToLch (JS, for the gate's own reference
// computation) and this shader's rotation therefore compute the identical transform two different ways.
"use strict";

/** Uniforms in a stable order -- setKnobs() writes by name, nothing depends on iteration order elsewhere. */
export const ORB_KNOBS = Object.freeze([
    "time", "speed", "glow", "depth", "hueShift", "presence", "clarity", "glintRate", "voice", "aspect",
]);

const R_BODY = 0.62;          // sphere radius in the -1..1 quad
const EDGE_FEATHER = 0.015;   // antialiased silhouette width, in the same units as R_BODY
const ETA = 1.0 / 1.2;        // refractive index, murmur's own MH_ETA (deliberately lowered from ~1.45)
const GLINT_WIDTH = 0.35;
const BASE_L = 0.30, BASE_C = 0.09, BASE_H = 3.6;   // OKLab base tone: a deliberately calm blue-violet, this port's own pick (murmur-web's actual per-species palette table was not part of what was fetched)

/**
 * Build the "still" orb from a TSL namespace (vendor/three-webgpu/three.tsl.js) and a THREE
 * (vendor/three-webgpu/three.webgpu.js), following render/badTvTsl.mjs's exact shape: a bare NodeMaterial whose
 * fragmentNode IS the effect, on a full-screen quad through an OrthographicCamera.
 * Returns { material, scene, camera, uniforms, setKnobs, setTime }.
 */
export function makeAiPresenceOrbTsl(THREE, TSL, { knobs = {} } = {}) {
    const need = ["Fn", "float", "vec2", "vec3", "vec4", "uv", "dot", "length", "normalize", "max", "min",
                  "clamp", "pow", "exp", "cos", "sin", "sqrt", "abs", "mix", "smoothstep", "select", "uniform", "negate"];
    for (const n of need) if (typeof TSL[n] !== "function") throw new Error(`aiPresenceOrbTsl: the TSL namespace has no ${n}()`);
    const { Fn, float, vec2, vec3, vec4, uv, dot, length, normalize, max, min, clamp, pow, exp, cos, sin, sqrt,
            abs, mix, smoothstep, select, uniform, negate } = TSL;

    const k0 = { time: 0, speed: 1, glow: 1, depth: 1, hueShift: 0, presence: 0.5, clarity: 0.6, glintRate: 0.3, voice: 0, aspect: 1, ...knobs };
    const uniforms = {}; for (const n of ORB_KNOBS) uniforms[n] = uniform(float(k0[n])).label(n);

    // OKLab -> linear sRGB, cube done as explicit x*x*x (not pow(x,3): l_/m_/s_ can be legitimately negative
    // for an out-of-gamut Lab, and pow() with a non-integral-looking runtime exponent is the wrong tool here
    // even though 3 is an integer -- multiplication is unambiguous for a negative base).
    const cube = (x) => x.mul(x).mul(x);
    const oklabToLinear = Fn(([L, a, b]) => {
        const l_ = L.add(a.mul(0.3963377773761749)).add(b.mul(0.2158037573099136));
        const m_ = L.sub(a.mul(0.1055613458156586)).sub(b.mul(0.0638541728258133));
        const s_ = L.sub(a.mul(0.0894841775298119)).sub(b.mul(1.2914855480194092));
        const l = cube(l_), m = cube(m_), s = cube(s_);
        return vec3(
            l.mul(4.0767416621).sub(m.mul(3.3077115913)).add(s.mul(0.2309699292)),
            l.mul(-1.2684380046).add(m.mul(2.6097574011)).sub(s.mul(0.3413193965)),
            l.mul(-0.0041960863).sub(m.mul(0.7034186147)).add(s.mul(1.7076147010)),
        );
    });
    const linearToSrgb1 = Fn(([c]) => select(c.lessThanEqual(0.0031308), c.mul(12.92), pow(max(c, 1e-6), 1 / 2.4).mul(1.055).sub(0.055)));
    const linearToSrgb = Fn(([c]) => vec3(linearToSrgb1(c.x), linearToSrgb1(c.y), linearToSrgb1(c.z)));

    // still.ts's own interior floor: presence lifts it, clarity suppresses it, live voice energy lifts it further.
    const floorAmt = Fn(() => {
        const base = float(0.016).add(uniforms.presence.mul(0.085));
        return base.mul(float(1.0).sub(uniforms.clarity.mul(0.5))).mul(float(1.0).add(uniforms.voice.mul(0.55)));
    });
    // one periodic glint (still.ts: "one slow internal glint", murmur's stated range ~11.5s at rate 0 down to ~7s at rate 1).
    const glint = Fn(() => {
        const period = float(11.5).sub(uniforms.glintRate.mul(4.5));
        const phase = uniforms.time.mod(period);
        const centered = select(phase.lessThan(period.mul(0.5)), phase, phase.sub(period));
        const arg = centered.mul(centered).div(GLINT_WIDTH * GLINT_WIDTH);
        return exp(negate(arg));
    });

    const main = Fn(() => {
        const p = uv().mul(2.0).sub(1.0);   // -1..1, symmetric orb: three's v=0-at-bottom vs device's v=0-at-top makes no visible difference
        // *** MEASURED, NOT ASSUMED CIRCULAR: A FULL-VIEWPORT ORTHOGRAPHIC QUAD STRETCHES ON A NON-SQUARE
        // CANVAS. *** A first render (900x600, a perfectly ordinary browser window) came back visibly
        // elliptical -- the camera's -1..1 NDC space maps to the canvas's ACTUAL pixel width and height, which
        // are equal only by coincidence. `aspect` = width/height is supplied by the caller (every real window
        // has one); scaling x by it before any distance/geometry math is done keeps a fixed NDC-y-space radius
        // R_BODY a true circle IN PIXELS on any aspect ratio, the same correction every full-screen-quad
        // effect that draws a screen-space SHAPE (as opposed to badTvTsl.mjs's screen-space colour warp, which
        // has no shape to distort) needs and a colour-only effect does not.
        const pc = vec2(p.x.mul(uniforms.aspect), p.y);
        const rho2 = dot(pc, pc);
        const rho = sqrt(rho2);
        const R = float(R_BODY);
        const zArg = max(R.mul(R).sub(rho2), 0.0);   // clamped: outside the disk this would go negative
        const z = sqrt(zArg);
        const N = vec3(pc, z).div(R);                 // sphere centred at the origin: outward normal = position / R
        const V = vec3(0.0, 0.0, -1.0);                // orthographic ray, into the screen
        const ci = clamp(N.z, 0.0, 1.0);               // = -dot(V, N) since V = (0,0,-1); cos(incidence)
        const fres = float(1.0).sub(ci);               // 0 dead centre, 1 at the silhouette -- see header

        // refraction: Snell's law with a total-internal-reflection guard (kit.ts's own formula, ETA lowered
        // from the physical ~1.45 on purpose so the interior does not visually swallow the whole sphere).
        const eta = float(ETA);
        const kTir = float(1.0).sub(eta.mul(eta).mul(float(1.0).sub(ci.mul(ci))));
        const refracted = select(kTir.lessThanEqual(0.0), V, normalize(V.mul(eta).add(N.mul(eta.mul(ci).sub(sqrt(max(kTir, 1e-6)))))));

        // interior contribution -- still.ts's floor plus one glint, scaled by depth (the state machine's own knob)
        const density = floorAmt().add(glint()).mul(uniforms.depth);

        // surface: fresnel rim + two specular lobes (a tight highlight, a broad soft one), a fixed light direction
        const rim = pow(fres, 4.5).mul(0.85);
        const L_DIR = normalize(vec3(0.45, 0.6, 0.65));
        const H = normalize(negate(V).add(L_DIR));
        const nh = max(dot(N, H), 0.0);
        const specTight = pow(nh, 96.0).mul(0.9);
        const specBroad = pow(nh, 4.0).mul(0.09);

        // colour: OKLab lightness driven by density*glow, a state-driven hue rotation of the base tone
        const Lc = clamp(float(BASE_L).add(density.mul(uniforms.glow)), 0.0, 1.0);
        const theta = uniforms.hueShift.mul(Math.PI);
        const a0 = float(BASE_C * Math.cos(BASE_H)), b0 = float(BASE_C * Math.sin(BASE_H));
        const aRot = a0.mul(cos(theta)).sub(b0.mul(sin(theta)));
        const bRot = a0.mul(sin(theta)).add(b0.mul(cos(theta)));
        const bodyLinear = oklabToLinear(Lc, aRot, bRot);

        const surfaceGlow = rim.add(specTight).add(specBroad).mul(uniforms.glow);
        const colorLinear = max(bodyLinear.add(vec3(surfaceGlow)), vec3(0.0));
        const colorSrgb = linearToSrgb(colorLinear);

        // *** smoothstep(edge0, edge1, x) NEEDS edge0 < edge1 -- "results are undefined" otherwise (GLSL spec,
        // and WGSL inherits the same contract). The mask wants to fall from 1 to 0 as rho RISES past R, which
        // is the opposite direction, so it is built as ONE MINUS the correctly-ordered rise (R-feather < R),
        // not as smoothstep(R, R-feather, rho) with the arguments swapped to fake a falling curve. *** MEASURED
        // RATHER THAN LEFT AS A GUESS: on the device the gate actually runs on, the swapped form is not merely
        // close, it is algebraically IDENTICAL -- (x-a)/(b-a) = 1-(x-b)/(a-b) exactly, and smoothstep's own
        // Hermite curve is point-symmetric (smoothstep(t) = 1-smoothstep(1-t)), so smoothstep(a,b,x) = 1 -
        // smoothstep(b,a,x) for EVERY x, not only inside the band -- confirmed both by hand and by a sabotage
        // that swaps the arguments back and renders bit-identical output. So this fix is spec-compliance, not
        // a rendering fix on THIS implementation: the guarantee spent is that some OTHER device is free to
        // implement smoothstep a different way when edge0 >= edge1, and this file does not ask any device to.
        const edgeMask = float(1.0).sub(smoothstep(R.sub(EDGE_FEATHER), R, rho));   // 1 inside the disk, 0 outside, antialiased
        return vec4(colorSrgb, edgeMask);
    });

    const material = new THREE.NodeMaterial();
    material.transparent = true;
    material.fragmentNode = main();
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
    return {
        material, scene, camera, uniforms,
        setTime(t) { uniforms.time.value = t; },
        setKnobs(k) { for (const n of ORB_KNOBS) if (k[n] != null) uniforms[n].value = k[n]; },
    };
}
