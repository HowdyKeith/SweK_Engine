// WebGLEngine/render/aiPresenceOrbPresent.mjs
//
// The HDR present pass tools/ship/nextRounds.mjs's ai-presence-orb-widget entry named honestly as not done at
// first ship: "No separate exposure/bloom/tone-curve/dither HDR present pass (murmur-web's own linear-light
// rgba16float pipeline) -- this port renders straight sRGB." render/aiPresenceOrbTsl.mjs's shader now supports
// a `linear:true` mode (the "scene" half); this file is the second pass -- sample that scene's HDR output from
// a render target and turn it into display pixels -- plus the render-target plumbing that chains the two.
//
// *** murmur-web's OWN PRESENT PASS WAS FETCHED AND READ DIRECTLY (src/shaders/wgsl/post/present.wgsl), NOT
// GUESSED. *** Its own header states the pipeline's shape exactly: "The one place linear HDR becomes pixels.
// Every species renders radiance into an rgba16float target and ends here, so exposure, bloom, the tone curve,
// the dither and the sRGB encode are written once." Its fs_main, in order: sample scene -> add bloom*params.bloom
// -> applyExposure(color,exposure) -> saturation -> vignette -> knee(colour.rgb, 0.90) per channel -> luminance-
// shaped grain dither -> clamp -> linearToSrgb -> a final (noise-0.5)/255 dither on the encoded byte. This file
// follows that order for the four things actually asked for (exposure, bloom, tone-curve, dither) and drops two
// knobs on purpose, in murmur's own words: its header explains vignette and grain are "held at zero" for an orb
// specifically -- "a vignette darkens the edges of a FRAME, and this frame is a circular presence whose edge is
// the thing being drawn, so a vignette would eat the rim the whole kit exists to make crisp" and "grain on a 46
// pt chip is not film, it is noise" (this widget is 44 CSS px -- the same scale murmur's own authors named).
// Saturation is left out too: at the default saturation=1 it is a mathematical no-op, so there is nothing to
// port, only a knob nobody asked for to add.
//
// *** THE TONE CURVE IS murmur-web's OWN "HOUSE KNEE", NOT ACES OR REINHARD -- WHICH VENDOR ALREADY SHIPS. ***
// vendor/three-webgpu/three.tsl.js exports real, callable acesFilmicToneMapping/reinhardToneMapping TSL nodes
// (grep confirms it; no hand-porting needed to USE them) but present.wgsl's own header explains, verbatim, why
// its author rejected ACES for this: "ACES performs film emulation for ... physically-simulated imagery,
// whereas this uses an already-authored grade" -- render/aiPresenceOrbTsl.mjs's BASE_L/BASE_C/BASE_H OKLab
// palette is exactly that, "this port's own pick", not raw simulated radiance -- "applying ACES would grade an
// already graded picture twice." The house knee(x,k) is hand-ported instead, k=0.90 exact: identity below the
// knee (the authored colour passes through untouched), an exponential roll-off above it (only emission pushed
// over 1.0 by glow/bloom gets compressed), asymptotic to 1 -- "preserves the authored values below the knee
// point and only compresses emission above 1.0 for bloom, exactly the job this picture needs and nothing more."
//
// *** THE DITHER IS THE SAME FORMULA TWICE OVER, NOT A COINCIDENCE. *** present.wgsl's own ign(pixel,frame) is
// Jorge Jimenez's 2014 SIGGRAPH "interleaved gradient noise" -- and vendor/three-webgpu independently exports
// the SAME core formula as interleavedGradientNoise(position) (grep-confirmed, exact constants match). Hand-
// ported here rather than called, for one reason: murmur's own version adds a temporal offset,
// `pixel + 5.588238*(frame%64)`, animating the pattern across a 64-frame cycle so persistence of vision
// integrates it into smooth noise rather than a fixed, static screen-door texture sitting on the widget's own
// smooth gradients forever -- the vendored function takes only a position, no frame. `frame` is threaded from
// the caller's own render loop (one integer, incremented mod 64 per rendered frame).
//
// *** BLOOM IS DELIBERATELY NOT murmur-web's OWN TECHNIQUE. *** Its real pipeline (src/shaders/wgsl/post/
// {bright,down,up}.wgsl) is a genuine multi-mip Karis-averaged dual-filter chain -- a 13-tap firefly-suppressing
// downsample, repeated across several halved render targets, built for a full-screen scene with many small,
// sparse, isolated bright points (the exact failure case Karis averaging exists to tame). This orb is a single
// smooth analytic sphere with one coherent specular lobe and one soft fresnel rim -- broad, not sparse -- on a
// canvas that tops out at 88 physical px (44 CSS px * devicePixelRatio capped at 2). A multi-render-target mip
// chain built to suppress fireflies nothing here produces, sized for a scene a hundred times larger, is not a
// simplification of the real technique so much as a different technique altogether at this scale. What ships
// instead: one soft luminance threshold, this FILE's own already-established smoothstep idiom (matching
// aiPresenceOrbTsl.mjs's own edge mask, not murmur's inaccessible third-party luminanceThreshold -- see below)
// and a single 3x3 tent filter tap, the standard, widely-published binomial [1,2,1;2,4,2;1,2,1]/16 kernel, done
// in ONE pass with 9 unrolled texture reads rather than a downsample/blur/upsample render-target chain an
// effect this size could never show the difference of. Named honestly, not silently substituted.
//
// *** THREE FORMULAS WERE NOT REACHABLE AND ARE RECONSTRUCTED, NAMED HERE RATHER THAN LEFT SILENT: ***
// present.wgsl imports applyExposure/luminance/linearToSrgb3/luminanceThreshold from a separate npm package
// (`@vgpu/wgsl-std/color`) outside this repository, not fetched. Reconstructed as the plainest standard reads:
// applyExposure(c,e) = c*e (a simple linear stop, matching three.js's own renderer.toneMappingExposure
// convention, not a pow(2,e) EV-stops form this port never saw); luminance(c) = dot(c, vec3(0.2126,0.7152,
// 0.0722)), the standard ITU-R BT.709 relative-luminance weights; linearToSrgb3 is NOT reconstructed at all --
// it is the exact same IEC 61966-2-1 transfer function render/aiPresenceOrbTsl.mjs already implements and this
// file duplicates verbatim (a fixed, two-line, unchanging standard formula -- not the kind of thing sharing a
// module buys anything for).
//
// *** A REAL, MEASURED BUG FOUND BUILDING THIS, IN CODE THIS ROUND DID NOT WRITE: *** THREE.WebGPURenderer
// defaults renderer.outputColorSpace to "srgb" -- confirmed by direct measurement (a flat 0.3/0.1/0.5 linear
// fragment read back as 149/89/188, the EXACT sRGB-encoded values, not the raw 76/26/128 a passthrough would
// give). render/aiPresenceOrbTsl.mjs's own linearToSrgb() ALREADY encodes before returning, which means every
// existing direct-to-canvas caller (ui/aiPresenceOrbWidget.js, ai-presence-orb.html, before this round) was
// silently DOUBLE-sRGB-encoding: correct in shape (still a recognisable glass orb) but visibly washed out
// against the intended OKLab palette. THREE.NoColorSpace does NOT fix it -- measured identical output with and
// without setting it, an empty string the setter apparently treats as "no override" -- THREE.LinearSRGBColorSpace
// does (measured raw passthrough after setting it). Both the scene and present renderers this file's pipeline
// builds set it explicitly; ui/aiPresenceOrbWidget.js and ai-presence-orb.html now do too, fixing the
// pre-existing bug at the same call sites this round already had to touch to wire the new pass in.
"use strict";
import { makeAiPresenceOrbTsl } from "./aiPresenceOrbTsl.mjs";

export const PRESENT_KNOBS = Object.freeze(["exposure", "bloomIntensity", "frame"]);

const KNEE_K = 0.90;                 // murmur-web's own present.wgsl constant, exact
const BLOOM_THRESHOLD = 0.85;        // this port's own pick -- see header: no source formula was reachable
const BLOOM_SOFT = 0.25;
const BLOOM_RADIUS_PX = 2.5;         // tap spacing in physical pixels, so the blur scales with canvas size/DPR rather than a fixed UV fraction
// the standard, widely-published binomial 3x3 tent kernel [1,2,1; 2,4,2; 1,2,1] / 16 -- weights sum to 16, each
// normalised by /16 below so the filter is unity-gain (checked in the gate).
const TENT_TAPS = Object.freeze([
    { dx: 0, dy: 0, w: 4 },
    { dx: -1, dy: -1, w: 1 }, { dx: 1, dy: -1, w: 1 }, { dx: -1, dy: 1, w: 1 }, { dx: 1, dy: 1, w: 1 },
    { dx: 0, dy: -1, w: 2 }, { dx: 0, dy: 1, w: 2 }, { dx: -1, dy: 0, w: 2 }, { dx: 1, dy: 0, w: 2 },
]);

/**
 * The present pass alone: samples `sceneTexture` (an HDR render target's .texture, linear colour + the scene's
 * own edgeMask in alpha) and returns display-ready sRGB. Exposed separately from makeAiPresenceOrbHdrPipeline()
 * below so the gate can test its own math (bloom threshold, knee curve, dither) without needing a real GPU
 * render-target round-trip for every assertion.
 * Returns { material, scene, camera, uniforms, setKnobs }.
 */
export function makeAiPresenceOrbPresentTsl(THREE, TSL, sceneTexture, { knobs = {} } = {}) {
    const need = ["Fn", "float", "vec2", "vec3", "vec4", "uv", "dot", "max", "pow", "exp", "clamp", "mix",
                  "smoothstep", "select", "uniform", "negate", "texture", "fract"];
    for (const n of need) if (typeof TSL[n] !== "function") throw new Error(`aiPresenceOrbPresent: the TSL namespace has no ${n}()`);
    const { Fn, float, vec2, vec3, vec4, uv, dot, max, exp, clamp, smoothstep, select, uniform, negate, texture: sampleTex, fract } = TSL;

    const k0 = { exposure: 1.0, bloomIntensity: 0.6, frame: 0, ...knobs };
    const uniforms = {}; for (const n of PRESENT_KNOBS) uniforms[n] = uniform(float(k0[n])).label(n);
    uniforms.resolution = uniform(vec2(1, 1)).label("resolution");

    // linearToSrgb -- the exact same IEC 61966-2-1 formula render/aiPresenceOrbTsl.mjs already carries; see this
    // file's own header for why this one function is duplicated rather than shared.
    const linearToSrgb1 = Fn(([c]) => select(c.lessThanEqual(0.0031308), c.mul(12.92), TSL.pow(max(c, 1e-6), 1 / 2.4).mul(1.055).sub(0.055)));
    const linearToSrgb = Fn(([c]) => vec3(linearToSrgb1(c.x), linearToSrgb1(c.y), linearToSrgb1(c.z)));

    // murmur-web's present.wgsl own knee(x,k), exact: identity below k, exponential compression above it,
    // asymptotic to 1 -- see this file's header for the "house knee, not ACES" reasoning quoted from its source.
    const knee = Fn(([x]) => {
        const k = float(KNEE_K);
        const compressed = k.add(float(1.0).sub(k).mul(float(1.0).sub(exp(negate(x.sub(k)).div(max(float(1.0).sub(k), 1e-3))))));
        return select(x.lessThan(k), x, compressed);
    });

    // murmur-web's present.wgsl own ign(pixel,frame), exact constants -- see header for why hand-ported rather
    // than calling vendor's interleavedGradientNoise (the temporal frame offset it does not carry).
    const ign = Fn(([pixel, frame]) => {
        const p = pixel.add(vec2(5.588238).mul(frame.mod(64.0)));
        return fract(float(52.9829189).mul(fract(dot(p, vec2(0.06711056, 0.00583715)))));
    });

    // reconstructed (this port's own pick, not vendored -- see header): standard Rec.709 relative luminance.
    const luminance = Fn(([c]) => dot(c, vec3(0.2126, 0.7152, 0.0722)));

    // *** A REAL, MEASURED BUG FOUND BUILDING THIS: SAMPLING A RenderTarget.texture VIA TSL's texture() COMES
    // BACK Y-FLIPPED RELATIVE TO A DIRECT RENDER, ON THIS VENDORED BUILD's forceWebGL BACKEND. *** Confirmed by
    // controlled measurement, not assumed: rendering the scene shader directly put its brightest pixel (the
    // specular highlight) at (18,19) on a 32px canvas; sampling the SAME scene rendered into a RenderTarget and
    // read back through an unflipped texture(rt.texture, uv()) put it at (18,12) -- the exact mirror of 19
    // around the canvas's own vertical centre (15.5+3.5 vs 15.5-3.5). Flipping the V component the sampler
    // reads restores (18,19) exactly. Applied ONLY at the point of sampling sceneTexture below -- bloom's own
    // tap offsets stay in the present pass's own, unflipped, normal screen-space uv().
    const sceneUv = Fn(([p]) => vec2(p.x, float(1.0).sub(p.y)));

    // soft threshold via THIS FILE's own smoothstep idiom (matching aiPresenceOrbTsl.mjs's own edge mask, not
    // murmur's inaccessible third-party luminanceThreshold) -- see header for the bloom-scope reasoning.
    const brightAt = Fn(([samplePos]) => {
        const c = sampleTex(sceneTexture, sceneUv(samplePos)).rgb;
        const w = smoothstep(BLOOM_THRESHOLD - BLOOM_SOFT, BLOOM_THRESHOLD + BLOOM_SOFT, luminance(c));
        return c.mul(w);
    });

    const main = Fn(() => {
        const p = uv();
        const direct = sampleTex(sceneTexture, sceneUv(p));
        const alpha = direct.a;   // the scene's own antialiased silhouette, carried through UNCHANGED -- bloom
                                   // brightens near the rim, it does not bleed past the widget's own crisp edge;
                                   // see header for why that is this widget's own design language, not a gap.

        const texel = vec2(1.0, 1.0).div(uniforms.resolution);
        let bloom = null;
        for (const { dx, dy, w } of TENT_TAPS) {
            const samplePos = p.add(texel.mul(vec2(dx, dy)).mul(BLOOM_RADIUS_PX));
            const term = brightAt(samplePos).mul(w / 16);
            bloom = bloom ? bloom.add(term) : term;
        }

        let color = direct.rgb.add(bloom.mul(uniforms.bloomIntensity));   // bloom add-in, murmur's own order
        color = color.mul(uniforms.exposure);                              // applyExposure -- reconstructed, see header
        color = vec3(knee(color.x), knee(color.y), knee(color.z));         // the house knee, per channel, murmur's own order
        color = clamp(color, vec3(0.0), vec3(1.0));

        const noise = ign(p.mul(uniforms.resolution), uniforms.frame);
        const srgb = linearToSrgb(color).add(vec3(noise.sub(0.5).div(255.0)));   // the final byte-quantisation dither, murmur's own order
        return vec4(srgb, alpha);
    });

    const material = new THREE.NodeMaterial();
    material.transparent = true;
    material.fragmentNode = main();
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
    return {
        material, scene, camera, uniforms,
        setKnobs(k) { for (const n of PRESENT_KNOBS) if (k[n] != null) uniforms[n].value = k[n]; },
        setResolution(w, h) { uniforms.resolution.value.set(w, h); },
    };
}

/**
 * The full two-pass pipeline: the scene (render/aiPresenceOrbTsl.mjs, linear:true) rendered into an HDR
 * (half-float) render target, then this file's own present pass sampling it. `render(renderer)` does both
 * passes; callers drive it exactly like a single makeAiPresenceOrbTsl() material before this round, minus the
 * direct renderer.render(fx.scene, fx.camera) call, which render(renderer) now does internally.
 * Returns { sceneFx, presentFx, target, setKnobs, setPresentKnobs, resize, render }.
 */
export function makeAiPresenceOrbHdrPipeline(THREE, TSL, { sceneKnobs = {}, presentKnobs = {} } = {}) {
    const sceneFx = makeAiPresenceOrbTsl(THREE, TSL, { knobs: sceneKnobs, linear: true });
    const target = new THREE.RenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false });
    const presentFx = makeAiPresenceOrbPresentTsl(THREE, TSL, target.texture, { knobs: presentKnobs });
    let frame = 0;
    return {
        sceneFx, presentFx, target,
        setKnobs(k) { sceneFx.setKnobs(k); },
        setPresentKnobs(k) { presentFx.setKnobs(k); },
        resize(w, h) {
            target.setSize(Math.max(1, w), Math.max(1, h));
            presentFx.setResolution(w, h);
        },
        render(renderer) {
            // the render-to-target shape render/aquarellePass.js and render/badTvPass.js already use in this
            // tree (ShaderMaterial, not NodeMaterial, but the renderer.setRenderTarget() mechanism is the same
            // renderer-level API either way -- see this file's header for why the vendored but unused
            // PassNode/RenderPipeline TSL kit was not adopted instead).
            const prevTarget = renderer.getRenderTarget();
            renderer.setRenderTarget(target);
            renderer.render(sceneFx.scene, sceneFx.camera);
            renderer.setRenderTarget(prevTarget);

            frame = (frame + 1) % 64;
            presentFx.setKnobs({ frame });
            renderer.render(presentFx.scene, presentFx.camera);
        },
    };
}
