// WebGLEngine/render/aerial.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// *** SLICE 9 OF snowflow-lift (part 1): AERIAL PERSPECTIVE WITH THE NEAR-SKY BLUR AND THE FORWARD LOBE, FROM Noniv/snowflow_demo (MIT, vendor/snowflow). ***
// A distant surface does not fade to a fixed fog colour: by definition a surface at total extinction is INVISIBLE, so what reaches the eye from it is the sky in that exact direction. Upstream's applyAerial is
// built on that: the height-falloff transmittance (aerialTransmittance, already in snowGpu), then an inscatter colour that CROSSFADES between
//   near   the colour that fills a SHORT ground-level path -- the whole sky hemisphere, dominated by the bright cool dome overhead, so the sky LUT is read at a BLURRED mip (3) with the direction tilted
//          upward by 0.42, plus the sun's FORWARD LOBE (Mie g 0.62, x 5.5 x 0.16 x the sun colour), which is what keeps haze warm where you look toward the sun; and
//   exact  the sky LUT at the exact direction and the exact mip 0 -- the same number the sky dome draws,
// by smoothstep(0.55, 0.995, extinction), so a fully hazed surface and the sky pixel beside it are the same colour and the far edge of the terrain has nothing to draw an edge with. The whole inscatter, lobe
// included, is crossfaded (adding the lobe on top of the exact sample double-counts it: a saturated wall of haze -- upstream's account).
//
// OURS: aerialNearSky / aerialInscatterSky / applyAerial as CPU twins over the mip chain of render/skyBake.mjs (sampleSkyLevel), AERIAL_WGSL (the same three functions plus aerialTransmittance, the sky fetches
// swapped for skyAtLevel over the chain, bodies otherwise unchanged), AERIAL_KERNEL_WGSL (a table of queries through them, for the gate).
"use strict";
import { sampleSkyLevel, phaseMie, SKY_LEVELS, PHASE_MIE_WGSL, SKY_MIP_SAMPLE_WGSL, aerialTransmittance } from "./skyBake.mjs";

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };

/** the colour that fills a short, ground-level path: the sky read at mip 3 with the direction tilted up by 0.42 */
export function aerialNearSky(chain, w, h, viewDir) { return sampleSkyLevel(chain, w, h, normalize([viewDir[0], viewDir[1] + 0.42, viewDir[2]]), 3.0); }

/** the inscatter colour for a path of a given total extinction: near (blurred, tilted, plus the forward lobe) crossfaded onto the exact sky sample by smoothstep(0.55, 0.995, ext) */
export function aerialInscatterSky(chain, w, h, viewDir, sunDir, sunColor, ext) {
    const exact = sampleSkyLevel(chain, w, h, normalize(viewDir), 0.0), mu = dot(viewDir, sunDir), fwd = phaseMie(mu, 0.62) * 5.5, nearSky = aerialNearSky(chain, w, h, viewDir);
    const near = nearSky.map((v, i) => v + sunColor[i] * fwd * 0.16), k = smoothstep(0.55, 0.995, ext);
    return near.map((v, i) => v + (exact[i] - v) * k);
}

/** upstream's applyAerial: extinction from the transmittance, the inscatter for that extinction, and the shaded colour mixed toward it by the extinction */
export function applyAerial(chain, w, h, color, camPos, worldPos, viewDir, sunDir, sunColor, density, heightFalloff, fogStart, strength) {
    const t = aerialTransmittance(camPos, worldPos, density, heightFalloff, fogStart), ext = Math.min(1, Math.max(0, 1 - Math.pow(t, strength))), ins = aerialInscatterSky(chain, w, h, viewDir, sunDir, sunColor, ext);
    return color.map((v, i) => v + (ins[i] - v) * ext);
}

/** The functions as WGSL text for a shader that defines PI, SKY_W, SKY_H, SKY_LEVELS and a storage buffer `skyLut` holding the chain (includes the mip sampler, phaseMie and aerialTransmittance). */
export const AERIAL_WGSL = /* wgsl */ `
${PHASE_MIE_WGSL}
${SKY_MIP_SAMPLE_WGSL}
// ---- upstream lib/atmosphere.wgsl aerialTransmittance, body unchanged
fn aerialTransmittance(
    camPos: vec3f,
    worldPos: vec3f,
    density: f32,
    heightFalloff: f32,
    fogStart: f32
) -> f32 {
    let d = worldPos - camPos;
    let dist = max(0.0, length(d) - fogStart);
    if (dist <= 0.0) { return 1.0; }

    let dy = d.y;
    var integral: f32;
    if (abs(dy) < 0.01) {
        integral = exp(-heightFalloff * camPos.y) * dist;
    } else {
        let k = heightFalloff;
        integral = (exp(-k * camPos.y) - exp(-k * worldPos.y)) / (k * dy) * length(d);
        integral = integral * (dist / max(1e-4, length(d)));
    }

    return exp(-density * max(0.0, integral));
}

// ---- upstream aerialNearSky / aerialInscatterSky / applyAerial: bodies unchanged except the sky fetch (skyAtLevel over the chain in place of textureSampleLevel on the LUT)
fn aerialNearSky(viewDir: vec3f) -> vec3f {
    let d = normalize(viewDir + vec3f(0.0, 0.42, 0.0));
    return skyAtLevel(d, 3.0);
}

fn aerialInscatterSky(
    viewDir: vec3f,
    sunDir: vec3f, sunColor: vec3f, ext: f32
) -> vec3f {
    let exact = skyAtLevel(normalize(viewDir), 0.0);

    let mu = dot(viewDir, sunDir);
    let fwd = phaseMie(mu, 0.62) * 5.5;
    let near = aerialNearSky(viewDir) + sunColor * fwd * 0.16;

    return mix(near, exact, smoothstep(0.55, 0.995, ext));
}

fn applyAerial(
    color: vec3f,
    camPos: vec3f,
    worldPos: vec3f,
    viewDir: vec3f,
    sunDir: vec3f,
    sunColor: vec3f,
    density: f32,
    heightFalloff: f32,
    fogStart: f32,
    strength: f32
) -> vec3f {
    let t = aerialTransmittance(camPos, worldPos, density, heightFalloff, fogStart);
    let ext = clamp(1.0 - pow(t, strength), 0.0, 1.0);
    let inscatter = aerialInscatterSky(viewDir, sunDir, sunColor, ext);
    return mix(color, inscatter, ext);
}
`;

/**
 * OURS, not upstream's: applyAerial with the two evaluations that cannot show skipped (snow-beauty-pass-cost item 3). Same arithmetic; (1) an extinction under 0.002 returns the colour, since the mix would move it by under
 * 0.2% of the distance to the sky (below one level of an 8-bit target for any colour a tone-mapper takes); (2) the crossfade weight k is 0 below extinction 0.55 and 1 above 0.995, and there only the sample that has weight
 * is read (the exact sky read is a mip-0 trilinear fetch and the near read a mip-3 one, so a surface in the clear reads one sky sample and a hazed one reads one, where the upstream body reads both everywhere).
 */
export const AERIAL_LEAN_WGSL = /* wgsl */ `
fn applyAerialLean(
    color: vec3f,
    camPos: vec3f,
    worldPos: vec3f,
    viewDir: vec3f,
    sunDir: vec3f,
    sunColor: vec3f,
    density: f32,
    heightFalloff: f32,
    fogStart: f32,
    strength: f32
) -> vec3f {
    let t = aerialTransmittance(camPos, worldPos, density, heightFalloff, fogStart);
    let ext = clamp(1.0 - pow(t, strength), 0.0, 1.0);
    if (ext < 0.002) { return color; }
    let k = smoothstep(0.55, 0.995, ext);
    var inscatter: vec3f;
    if (k >= 1.0) {
        inscatter = skyAtLevel(normalize(viewDir), 0.0);
    } else {
        let mu = dot(viewDir, sunDir);
        let fwd = phaseMie(mu, 0.62) * 5.5;
        let near = aerialNearSky(viewDir) + sunColor * fwd * 0.16;
        inscatter = near;
        if (k > 0.0) { inscatter = mix(near, skyAtLevel(normalize(viewDir), 0.0), k); }
    }
    return mix(color, inscatter, ext);
}
`;

/**
 * A table of applyAerial queries as a compute kernel. Bindings: 0 out (rw f32, 3 per query), 1 skyLut (ro, the chain), 2 queries (ro f32, 24 per query: color3, cam3, world3, view3, sun3, sunColor3, density,
 * heightFalloff, fogStart, strength, pad x3 = 28 -> stride 28). Dispatch ceil(n / 64).
 */
export const AERIAL_QSTRIDE = 28;
export const AERIAL_KERNEL_WGSL = aerialKernel("applyAerial", "");
/** the same kernel through applyAerialLean */
export const AERIAL_LEAN_KERNEL_WGSL = aerialKernel("applyAerialLean", AERIAL_LEAN_WGSL);
function aerialKernel(fn, extra) { return /* wgsl */ `
@group(0) @binding(0) var<storage, read_write> outBuf: array<f32>;
@group(0) @binding(1) var<storage, read> skyLut: array<f32>;
@group(0) @binding(2) var<storage, read> queries: array<f32>;
const PI: f32 = 3.14159265359;
const SKY_W: i32 = 64;
const SKY_H: i32 = 32;
const SKY_LEVELS: i32 = ${SKY_LEVELS};
${AERIAL_WGSL}
${extra}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= arrayLength(&queries) / ${AERIAL_QSTRIDE}u) { return; }
    let o = i * ${AERIAL_QSTRIDE}u;
    let color = vec3f(queries[o], queries[o + 1u], queries[o + 2u]);
    let cam = vec3f(queries[o + 3u], queries[o + 4u], queries[o + 5u]);
    let world = vec3f(queries[o + 6u], queries[o + 7u], queries[o + 8u]);
    let view = vec3f(queries[o + 9u], queries[o + 10u], queries[o + 11u]);
    let sun = vec3f(queries[o + 12u], queries[o + 13u], queries[o + 14u]);
    let sunC = vec3f(queries[o + 15u], queries[o + 16u], queries[o + 17u]);
    let r = ${fn}(color, cam, world, view, sun, sunC, queries[o + 18u], queries[o + 19u], queries[o + 20u], queries[o + 21u]);
    outBuf[i * 3u] = r.x;
    outBuf[i * 3u + 1u] = r.y;
    outBuf[i * 3u + 2u] = r.z;
}
`; }

export function reportLines() {
    return ["[aerial] aerial perspective: transmittance by height-falloff extinction; the inscatter crossfades from a BLURRED, upward-tilted sky read with Mie forward lobe (g 0.62) onto the exact sky sample by smoothstep(0.55, 0.995, extinction)",
        "  at total extinction a surface and the sky pixel beside it are the same colour; the near-sky read is mip 3 of the sky chain"];
}
