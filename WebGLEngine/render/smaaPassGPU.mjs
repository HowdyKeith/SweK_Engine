// WebGLEngine/render/smaaPassGPU.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// SMAA 1x AND A TWO-FRAME TEMPORAL RESOLVE (T2x), FOR WEBGPU. render/smaaPass.js is SMAA for the WebGL2 chain; this is the same three passes for a WebGPU page
// (Keith: "SMAA for WebGPU pages ... and SMAA T2x (temporal)"). The edge and weight shaders are PlayCanvas's WGSL (playcanvas@2.24.2, MIT; vendor/smaa/LICENSE),
// turned from PlayCanvas's WGSL dialect into plain WGSL by a script (each texture and sampler given a binding at group 0 in order from 1, the uniforms one struct at
// binding 0 read as U., uv0 a private set from the fragment input) and otherwise as shipped; the blend is SMAA's neighbourhood blending without PlayCanvas's tone-map
// round trip, as in the WebGL2 pass. The lookup tables are vendor/smaa/smaaLookup.mjs's.
//
//   const aa = createSmaaGPU(device, { width, height, outputFormat, temporal })
//   draw the scene into aa.inputView (rgba8unorm), then aa.encode(encoder, targetView, { moved }) runs edges, weights, blend (and the resolve) into targetView
//   aa.jitter(frame) -> [jx, jy] in pixels: with temporal on, the scene is drawn with this subpixel offset (render/jitter.mjs jitterProjection), alternating
//                       (+1/4, -1/4) and (-1/4, +1/4) as SMAA T2x does; without it, [0, 0]
//
// REPROJECTION (2026-11-22; Keith: "SMAA T2x with real reprojection"). encode(enc, target, { reproject: { invViewProj, prevViewProj, depth } }) keeps the history across a
// MOVING camera: each pixel is unprojected through the current frame's inverse view-projection at its depth and taken through the previous frame's view-projection,
// exactly render/motionVectors.mjs's motionVectorsCPU (SMAA_REPROJECT_WGSL below; the gate holds the two to each other), and the history is sampled there; a pixel
// whose history falls off the screen or behind the previous eye has none. `depth` is a number (one plane of NDC depth for every pixel: the splat page's, which has no
// depth buffer -- what lies off that plane is reprojected wrong by its parallax, and the neighbourhood clamp is what keeps that from ghosting) or the view of an
// r32float texture of NDC depth per pixel. Without `reproject`, as before: the history is dropped when the camera moves.
//
// DEPTH AND DISOCCLUSION (2026-11-22; Keith: "1 and 2 and 3"). `depth` may also be the view of the page's own DEPTH BUFFER (a depth32float texture made with
// TEXTURE_BINDING: its values are the NDC depth the reprojection wants, for a projection whose depth runs 0 to 1 -- or -1 to 1 for one drawn into r32float). The resolve
// writes each pixel's depth beside its history, so the next frame knows what was where. A pixel whose history sat on something NEARER last frame -- a surface
// that was hidden and has just come out from behind -- takes no history: last frame's surface at the reprojected texel is unprojected through last frame's
// inverse view-projection, and if its view depth is under this surface's expected view depth by more than `disocclusion` (a fraction, 0.02 by default; 0 turns
// the test off) the history there belongs to the occluder. Judged only when this frame and the last both had a depth texture. flight-gpu.html ?aa=t2x is the page
// that uses it (its scene draws into the input, its own depth buffer the depth).
//
// THE TEMPORAL RESOLVE (T2x), SAID AS IT IS. Each frame is SMAA 1x of a jittered picture; the resolve averages it with the last resolved frame, the history first CLAMPED to
// the current frame's 3 x 3 neighbourhood (so a change that is not jitter cannot ghost far). WITHOUT `reproject` THE HISTORY IS DROPPED WHEN THE CAMERA MOVES (encode's
// `moved`): a moving camera gets SMAA 1x, a still one the two-frame average; with it (above) the history follows the camera. SMAA's own T2x also looks up subsample-specific areas in its full
// table; the vendored table is the compact 1x one, which has none -- so this is 1x per frame plus the two-sample resolve, not the reference T2x to the bit.
// Held by tools/ship/smaaPassGPU-selfcheck.mjs.
"use strict";
import { smaaLookup, AREA_WIDTH, AREA_HEIGHT, SEARCH_WIDTH, SEARCH_HEIGHT } from "../vendor/smaa/smaaLookup.mjs";
import { SMAA_DEFAULTS } from "./smaaPass.js";
import { mat4Invert } from "./motionVectors.mjs";

const PRE = `struct Uni { smaaMetrics: vec4f, smaaParams: vec4f, smaaExposure: f32 };
@group(0) @binding(0) var<uniform> U: Uni;
struct FragmentInput { @location(0) uv0: vec2f };
struct FragmentOutput { @location(0) color: vec4f };
`;
export const SMAA_VS_WGSL = `
struct VOut { @builtin(position) pos: vec4f, @location(0) uv0: vec2f };
@vertex fn vertexMain(@builtin(vertex_index) i: u32) -> VOut {
    let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));   // one triangle over the target; uv (0, 0) at the top left, as WebGPU textures are
    var o: VOut; o.uv0 = p; o.pos = vec4f(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0); return o;
}`;
export const SMAA_EDGE_WGSL = PRE + `var<private> uv0: vec2f;
@group(0) @binding(1) var smaaColorTexture: texture_2d<f32>;
@group(0) @binding(2) var smaaColorTextureSampler: sampler;
	const SMAA_LOCAL_CONTRAST_ADAPTATION_FACTOR: f32 = 2.0;
	fn smaaLuma(uv: vec2f) -> f32 {
		let color = textureSampleLevel(smaaColorTexture, smaaColorTextureSampler, uv, 0.0);
		let luma = clamp(dot(color.rgb, vec3f(0.2126, 0.7152, 0.0722)) * (color.a * U.smaaExposure), 0.0, 1.0e4);
		return sqrt(luma / (1.0 + luma));
	}
	@fragment
	fn fragmentMain(input: FragmentInput) -> FragmentOutput {
		uv0 = input.uv0;
		var output: FragmentOutput;
		let texel = U.smaaMetrics.xy;
		let L = smaaLuma(uv0);
		let Lleft = smaaLuma(uv0 - vec2f(texel.x, 0.0));
		let Ltop = smaaLuma(uv0 - vec2f(0.0, texel.y));
		var delta = vec4f(abs(L - vec2f(Lleft, Ltop)), 0.0, 0.0);
		var edges = step(vec2f(U.smaaParams.x), delta.xy);
		if (dot(edges, vec2f(1.0)) == 0.0) {
			discard;
		}
		let Lright = smaaLuma(uv0 + vec2f(texel.x, 0.0));
		let Lbottom = smaaLuma(uv0 + vec2f(0.0, texel.y));
		delta = vec4f(delta.xy, abs(L - vec2f(Lright, Lbottom)));
		var maxDelta = max(delta.xy, delta.zw);
		let Lleftleft = smaaLuma(uv0 - vec2f(2.0 * texel.x, 0.0));
		let Ltoptop = smaaLuma(uv0 - vec2f(0.0, 2.0 * texel.y));
		delta = vec4f(delta.xy, abs(vec2f(Lleft, Ltop) - vec2f(Lleftleft, Ltoptop)));
		maxDelta = max(maxDelta.xy, delta.zw);
		let finalDelta = max(maxDelta.x, maxDelta.y);
		edges = edges * step(vec2f(finalDelta), SMAA_LOCAL_CONTRAST_ADAPTATION_FACTOR * delta.xy);
		output.color = vec4f(edges, 0.0, 0.0);
		return output;
	}`;
export const SMAA_WEIGHTS_WGSL = PRE + `var<private> uv0: vec2f;
@group(0) @binding(1) var smaaEdgesTexture: texture_2d<f32>;
@group(0) @binding(2) var smaaEdgesTextureSampler: sampler;
@group(0) @binding(3) var smaaAreaTexture: texture_2d<f32>;
@group(0) @binding(4) var smaaAreaTextureSampler: sampler;
@group(0) @binding(5) var smaaSearchTexture: texture_2d<f32>;
@group(0) @binding(6) var smaaSearchTextureSampler: sampler;
	const SMAA_AREATEX_MAX_DISTANCE: f32 = 16.0;
	const SMAA_AREATEX_MAX_DISTANCE_DIAG: f32 = 20.0;
	const SMAA_AREATEX_PIXEL_SIZE: vec2f = vec2f(1.0 / 160.0, 1.0 / 80.0);
	const SMAA_SEARCHTEX_SIZE: vec2f = vec2f(66.0, 33.0);
	const SMAA_SEARCHTEX_PACKED_SIZE: vec2f = vec2f(64.0, 16.0);
	fn sampleEdges(uv: vec2f) -> vec2f {
		return textureSampleLevel(smaaEdgesTexture, smaaEdgesTextureSampler, uv, 0.0).rg;
	}
	fn sampleEdgesOffset(uv: vec2f, offset: vec2f) -> vec2f {
		return sampleEdges(uv + offset * U.smaaMetrics.xy);
	}
	fn decodeDiagBilinearAccess2(e: vec2f) -> vec2f {
		return round(vec2f(e.r * abs(5.0 * e.r - 5.0 * 0.75), e.g));
	}
	fn decodeDiagBilinearAccess4(e: vec4f) -> vec4f {
		return round(vec4f(e.r * abs(5.0 * e.r - 5.0 * 0.75), e.g, e.b * abs(5.0 * e.b - 5.0 * 0.75), e.a));
	}
	struct DiagSearch {
		result: vec2f,
		e: vec2f
	}
	fn searchDiag1(texcoord: vec2f, dir: vec2f) -> DiagSearch {
		var coord = vec4f(texcoord, -1.0, 1.0);
		let t = vec3f(U.smaaMetrics.xy, 1.0);
		let maxSteps = U.smaaParams.z - 1.0;
		var e = vec2f(0.0);
		while (coord.z < maxSteps && coord.w > 0.9) {
			coord = vec4f(t * vec3f(dir, 1.0) + coord.xyz, coord.w);
			e = sampleEdges(coord.xy);
			coord.w = dot(e, vec2f(0.5));
		}
		return DiagSearch(coord.zw, e);
	}
	fn searchDiag2(texcoord: vec2f, dir: vec2f) -> DiagSearch {
		var coord = vec4f(texcoord, -1.0, 1.0);
		coord.x += 0.25 * U.smaaMetrics.x;
		let t = vec3f(U.smaaMetrics.xy, 1.0);
		let maxSteps = U.smaaParams.z - 1.0;
		var e = vec2f(0.0);
		while (coord.z < maxSteps && coord.w > 0.9) {
			coord = vec4f(t * vec3f(dir, 1.0) + coord.xyz, coord.w);
			e = decodeDiagBilinearAccess2(sampleEdges(coord.xy));
			coord.w = dot(e, vec2f(0.5));
		}
		return DiagSearch(coord.zw, e);
	}
	fn areaDiag(dist: vec2f, e: vec2f) -> vec2f {
		var texcoord = vec2f(SMAA_AREATEX_MAX_DISTANCE_DIAG) * e + dist;
		texcoord = SMAA_AREATEX_PIXEL_SIZE * texcoord + 0.5 * SMAA_AREATEX_PIXEL_SIZE;
		texcoord.x += 0.5;
		return textureSampleLevel(smaaAreaTexture, smaaAreaTextureSampler, texcoord, 0.0).rg;
	}
	fn calculateDiagWeights(texcoord: vec2f, e: vec2f) -> vec2f {
		var weights = vec2f(0.0);
		let metrics = U.smaaMetrics;
		var d = vec4f(0.0);
		if (e.r > 0.0) {
			let search = searchDiag1(texcoord, vec2f(-1.0, 1.0));
			d.x = search.result.x + select(0.0, 1.0, search.e.y > 0.9);
			d.z = search.result.y;
		}
		let search1 = searchDiag1(texcoord, vec2f(1.0, -1.0));
		d.y = search1.result.x;
		d.w = search1.result.y;
		if (d.x + d.y > 2.0) {
			let coords = vec4f(-d.x + 0.25, d.x, d.y, -d.y - 0.25) * metrics.xyxy + texcoord.xyxy;
			let decoded = decodeDiagBilinearAccess4(vec4f(sampleEdgesOffset(coords.xy, vec2f(-1.0, 0.0)), sampleEdgesOffset(coords.zw, vec2f(1.0, 0.0))));
			let c = decoded.yxwz;
			var cc = vec2f(2.0) * c.xz + c.yw;
			cc = mix(cc, vec2f(0.0), step(vec2f(0.9), d.zw));
			weights += areaDiag(d.xy, cc);
		}
		let search2 = searchDiag2(texcoord, vec2f(-1.0, -1.0));
		d.x = search2.result.x;
		d.z = search2.result.y;
		if (sampleEdgesOffset(texcoord, vec2f(1.0, 0.0)).r > 0.0) {
			let search3 = searchDiag2(texcoord, vec2f(1.0, 1.0));
			d.y = search3.result.x + select(0.0, 1.0, search3.e.y > 0.9);
			d.w = search3.result.y;
		} else {
			d.y = 0.0;
			d.w = 0.0;
		}
		if (d.x + d.y > 2.0) {
			let coords = vec4f(-d.x, -d.x, d.y, d.y) * metrics.xyxy + texcoord.xyxy;
			let right = sampleEdgesOffset(coords.zw, vec2f(1.0, 0.0));
			let c = vec4f(
				sampleEdgesOffset(coords.xy, vec2f(-1.0, 0.0)).g,
				sampleEdgesOffset(coords.xy, vec2f(0.0, -1.0)).r,
				right.g,
				right.r
			);
			var cc = vec2f(2.0) * c.xz + c.yw;
			cc = mix(cc, vec2f(0.0), step(vec2f(0.9), d.zw));
			weights += areaDiag(d.xy, cc).gr;
		}
		return weights;
	}
	fn searchLength(e: vec2f, offset: f32) -> f32 {
		var scale = SMAA_SEARCHTEX_SIZE * vec2f(0.5, -1.0);
		var bias = SMAA_SEARCHTEX_SIZE * vec2f(offset, 1.0);
		scale += vec2f(-1.0, 1.0);
		bias += vec2f(0.5, -0.5);
		scale *= 1.0 / SMAA_SEARCHTEX_PACKED_SIZE;
		bias *= 1.0 / SMAA_SEARCHTEX_PACKED_SIZE;
		return textureSampleLevel(smaaSearchTexture, smaaSearchTextureSampler, scale * e + bias, 0.0).r;
	}
	fn searchXLeft(start: vec2f, end: f32) -> f32 {
		var texcoord = start;
		var e = vec2f(0.0, 1.0);
		while (texcoord.x > end && e.g > 0.8281 && e.r == 0.0) {
			e = sampleEdges(texcoord);
			texcoord = -vec2f(2.0, 0.0) * U.smaaMetrics.xy + texcoord;
		}
		let offset = -(255.0 / 127.0) * searchLength(e, 0.0) + 3.25;
		return U.smaaMetrics.x * offset + texcoord.x;
	}
	fn searchXRight(start: vec2f, end: f32) -> f32 {
		var texcoord = start;
		var e = vec2f(0.0, 1.0);
		while (texcoord.x < end && e.g > 0.8281 && e.r == 0.0) {
			e = sampleEdges(texcoord);
			texcoord = vec2f(2.0, 0.0) * U.smaaMetrics.xy + texcoord;
		}
		let offset = -(255.0 / 127.0) * searchLength(e, 0.5) + 3.25;
		return -U.smaaMetrics.x * offset + texcoord.x;
	}
	fn searchYUp(start: vec2f, end: f32) -> f32 {
		var texcoord = start;
		var e = vec2f(1.0, 0.0);
		while (texcoord.y > end && e.r > 0.8281 && e.g == 0.0) {
			e = sampleEdges(texcoord);
			texcoord = -vec2f(0.0, 2.0) * U.smaaMetrics.xy + texcoord;
		}
		let offset = -(255.0 / 127.0) * searchLength(e.gr, 0.0) + 3.25;
		return U.smaaMetrics.y * offset + texcoord.y;
	}
	fn searchYDown(start: vec2f, end: f32) -> f32 {
		var texcoord = start;
		var e = vec2f(1.0, 0.0);
		while (texcoord.y < end && e.r > 0.8281 && e.g == 0.0) {
			e = sampleEdges(texcoord);
			texcoord = vec2f(0.0, 2.0) * U.smaaMetrics.xy + texcoord;
		}
		let offset = -(255.0 / 127.0) * searchLength(e.gr, 0.5) + 3.25;
		return -U.smaaMetrics.y * offset + texcoord.y;
	}
	fn area(dist: vec2f, e1: f32, e2: f32) -> vec2f {
		var texcoord = vec2f(SMAA_AREATEX_MAX_DISTANCE) * round(4.0 * vec2f(e1, e2)) + dist;
		texcoord = SMAA_AREATEX_PIXEL_SIZE * texcoord + 0.5 * SMAA_AREATEX_PIXEL_SIZE;
		return textureSampleLevel(smaaAreaTexture, smaaAreaTextureSampler, texcoord, 0.0).rg;
	}
	fn detectHorizontalCornerPattern(weights: vec2f, texcoord: vec4f, d: vec2f) -> vec2f {
		let leftRight = step(d.xy, d.yx);
		var rounding = (1.0 - U.smaaParams.w) * leftRight;
		rounding /= leftRight.x + leftRight.y;
		var factor = vec2f(1.0);
		factor.x -= rounding.x * sampleEdgesOffset(texcoord.xy, vec2f(0.0, 1.0)).r;
		factor.x -= rounding.y * sampleEdgesOffset(texcoord.zw, vec2f(1.0, 1.0)).r;
		factor.y -= rounding.x * sampleEdgesOffset(texcoord.xy, vec2f(0.0, -2.0)).r;
		factor.y -= rounding.y * sampleEdgesOffset(texcoord.zw, vec2f(1.0, -2.0)).r;
		return weights * clamp(factor, vec2f(0.0), vec2f(1.0));
	}
	fn detectVerticalCornerPattern(weights: vec2f, texcoord: vec4f, d: vec2f) -> vec2f {
		let leftRight = step(d.xy, d.yx);
		var rounding = (1.0 - U.smaaParams.w) * leftRight;
		rounding /= leftRight.x + leftRight.y;
		var factor = vec2f(1.0);
		factor.x -= rounding.x * sampleEdgesOffset(texcoord.xy, vec2f(1.0, 0.0)).g;
		factor.x -= rounding.y * sampleEdgesOffset(texcoord.zw, vec2f(1.0, 1.0)).g;
		factor.y -= rounding.x * sampleEdgesOffset(texcoord.xy, vec2f(-2.0, 0.0)).g;
		factor.y -= rounding.y * sampleEdgesOffset(texcoord.zw, vec2f(-2.0, 1.0)).g;
		return weights * clamp(factor, vec2f(0.0), vec2f(1.0));
	}
	@fragment
	fn fragmentMain(input: FragmentInput) -> FragmentOutput {
		uv0 = input.uv0;
		var output: FragmentOutput;
		let texcoord = uv0;
		let metrics = U.smaaMetrics;
		let pixcoord = texcoord * metrics.zw;
		let offset0 = metrics.xyxy * vec4f(-0.25, -0.125, 1.25, -0.125) + texcoord.xyxy;
		let offset1 = metrics.xyxy * vec4f(-0.125, -0.25, -0.125, 1.25) + texcoord.xyxy;
		let offset2 = metrics.xxyy * (vec4f(-2.0, 2.0, -2.0, 2.0) * U.smaaParams.y) + vec4f(offset0.xz, offset1.yw);
		var weights = vec4f(0.0);
		var e = sampleEdges(texcoord);
		if (e.g > 0.0) {
			if (U.smaaParams.z > 0.0) {
				let diag = calculateDiagWeights(texcoord, e);
				weights = vec4f(diag, weights.zw);
			}
			if (weights.r == -weights.g) {
				let left = searchXLeft(offset0.xy, offset2.x);
				let y = offset1.y;
				let e1 = textureSampleLevel(smaaEdgesTexture, smaaEdgesTextureSampler, vec2f(left, y), 0.0).r;
				let right = searchXRight(offset0.zw, offset2.y);
				let d = abs(round(metrics.zz * vec2f(left, right) - pixcoord.xx));
				let sqrtD = sqrt(d);
				let e2 = sampleEdgesOffset(vec2f(right, y), vec2f(1.0, 0.0)).r;
				let horizontal = detectHorizontalCornerPattern(area(sqrtD, e1, e2), vec4f(left, texcoord.y, right, texcoord.y), d);
				weights = vec4f(horizontal, weights.zw);
			} else {
				e.r = 0.0;
			}
		}
		if (e.r > 0.0) {
			let up = searchYUp(offset1.xy, offset2.z);
			let x = offset0.x;
			let e1 = textureSampleLevel(smaaEdgesTexture, smaaEdgesTextureSampler, vec2f(x, up), 0.0).g;
			let down = searchYDown(offset1.zw, offset2.w);
			let d = abs(round(metrics.ww * vec2f(up, down) - pixcoord.yy));
			let sqrtD = sqrt(d);
			let e2 = sampleEdgesOffset(vec2f(x, down), vec2f(0.0, 1.0)).g;
			let vertical = detectVerticalCornerPattern(area(sqrtD, e1, e2), vec4f(texcoord.x, up, texcoord.x, down), d);
			weights = vec4f(weights.xy, vertical);
		}
		output.color = weights;
		return output;
	}`;
export const SMAA_BLEND_WGSL = PRE + `
@group(0) @binding(1) var smaaColorTexture: texture_2d<f32>;
@group(0) @binding(2) var smaaColorTextureSampler: sampler;
@group(0) @binding(3) var smaaBlendTexture: texture_2d<f32>;
@group(0) @binding(4) var smaaBlendTextureSampler: sampler;
@fragment fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;
    let uv0 = input.uv0; let texel = U.smaaMetrics.xy;
    var a: vec4f;
    a.x = textureSampleLevel(smaaBlendTexture, smaaBlendTextureSampler, uv0 + vec2f(texel.x, 0.0), 0.0).a;
    a.y = textureSampleLevel(smaaBlendTexture, smaaBlendTextureSampler, uv0 + vec2f(0.0, texel.y), 0.0).g;
    let here = textureSampleLevel(smaaBlendTexture, smaaBlendTextureSampler, uv0, 0.0); a.w = here.x; a.z = here.z;
    var color = textureSampleLevel(smaaColorTexture, smaaColorTextureSampler, uv0, 0.0);
    if (dot(a, vec4f(1.0)) >= 1.0e-5) {
        let horizontal = max(a.x, a.z) > max(a.y, a.w);
        let dir = select(vec2f(0.0, texel.y), vec2f(texel.x, 0.0), horizontal);
        let fraction = select(a.yw, a.xz, horizontal);
        let weight = fraction / dot(fraction, vec2f(1.0));
        let positive = textureSampleLevel(smaaColorTexture, smaaColorTextureSampler, uv0 + dir, 0.0);
        let negative = textureSampleLevel(smaaColorTexture, smaaColorTextureSampler, uv0 - dir, 0.0);
        color = weight.x * mix(color, positive, fraction.x) + weight.y * mix(color, negative, fraction.y);
    }
    output.color = color;
    return output;
}`;
/** The T2x resolve: the current SMAA frame averaged with the history clamped to the current 3 x 3 neighbourhood (the current frame alone when U.smaaParams.x is 0: no
 *  history); written twice, to the target and to the next frame's history. */
/** THE REPROJECTION, render/motionVectors.mjs's motionVectorsCPU in WGSL: pixel p of a w x h frame at NDC depth d -> (u, v) it had last frame and whether it had one. */
export const SMAA_REPROJECT_WGSL = `
fn reprojectQ(p: vec2i, size: vec2i, d: f32, invCur: mat4x4f, vpPrev: mat4x4f) -> vec4f {   // (u, v, valid, the view depth it would have had last frame)
    let u = (f32(p.x) + 0.5) / f32(size.x); let v = (f32(p.y) + 0.5) / f32(size.y);
    let w4 = invCur * vec4f(2.0 * u - 1.0, 1.0 - 2.0 * v, d, 1.0);
    if (w4.w == 0.0) { return vec4f(0.0); }
    let q = vpPrev * vec4f(w4.xyz / w4.w, 1.0);
    if (q.w <= 0.0) { return vec4f(0.0); }
    return vec4f((q.x / q.w + 1.0) * 0.5, (1.0 - q.y / q.w) * 0.5, 1.0, q.w);
}
fn reprojectUV(p: vec2i, size: vec2i, d: f32, invCur: mat4x4f, vpPrev: mat4x4f) -> vec3f { return reprojectQ(p, size, d, invCur, vpPrev).xyz; }`;
export const SMAA_RESOLVE_WGSL = `
struct R { invCur: mat4x4f, vpPrev: mat4x4f, invPrev: mat4x4f, p: vec4f, q: vec4f };   // p = (use history, reproject, plane depth, depth from the texture); q = (disocclusion tolerance, judge it, 0, 0)
@group(0) @binding(0) var<uniform> RU: R;
@group(0) @binding(1) var curTex: texture_2d<f32>;
@group(0) @binding(2) var histTex: texture_2d<f32>;
@group(0) @binding(3) var depthTex: texture_2d<f32>;
@group(0) @binding(4) var histSampler: sampler;
@group(0) @binding(5) var prevDepthTex: texture_2d<f32>;   // what the last frame's resolve wrote as its depth
${SMAA_REPROJECT_WGSL}
struct Out2 { @location(0) color: vec4f, @location(1) history: vec4f, @location(2) depth: f32 };
@fragment fn fragmentMain(@builtin(position) pos: vec4f) -> Out2 {
    let p = vec2i(pos.xy); let size = vec2i(textureDimensions(curTex)); let cur = textureLoad(curTex, p, 0);
    var lo = cur; var hi = cur;
    for (var dy = -1; dy <= 1; dy++) { for (var dx = -1; dx <= 1; dx++) { let c = textureLoad(curTex, clamp(p + vec2i(dx, dy), vec2i(0), size - 1), 0); lo = min(lo, c); hi = max(hi, c); } }
    var useHist = RU.p.x > 0.5;
    var raw = textureLoad(histTex, p, 0);
    let d = select(RU.p.z, textureLoad(depthTex, p, 0).r, RU.p.w > 0.5);
    if (useHist && RU.p.y > 0.5) {
        let r = reprojectQ(p, size, d, RU.invCur, RU.vpPrev);
        let inside = r.z > 0.5 && r.x >= 0.0 && r.x <= 1.0 && r.y >= 0.0 && r.y <= 1.0;
        useHist = inside;
        raw = textureSampleLevel(histTex, histSampler, r.xy, 0.0);
        if (useHist && RU.q.y > 0.5) {   // DISOCCLUSION: what was at that texel last frame, and how far from last frame's eye
            let t = clamp(vec2i(floor(r.xy * vec2f(size))), vec2i(0), size - 1);
            let tu = (f32(t.x) + 0.5) / f32(size.x); let tv = (f32(t.y) + 0.5) / f32(size.y);
            let w4 = RU.invPrev * vec4f(2.0 * tu - 1.0, 1.0 - 2.0 * tv, textureLoad(prevDepthTex, t, 0).r, 1.0);
            if (w4.w > 0.0 && 1.0 / w4.w < r.w * (1.0 - RU.q.x)) { useHist = false; }
        }
    }
    let hist = clamp(raw, lo, hi);
    let c = select(cur, 0.5 * (cur + hist), useHist);
    var o: Out2; o.color = c; o.history = c; o.depth = d; return o;
}`;
/** SMAA T2x's two subpixel offsets, in pixels (y down), alternating by frame. */
export const T2X_JITTER = Object.freeze([Object.freeze([0.25, -0.25]), Object.freeze([-0.25, 0.25])]);

export function createSmaaGPU(device, { width, height, outputFormat = "rgba8unorm", temporal = false, disocclusion = 0.02, ...tune } = {}) {
    const BU = globalThis.GPUBufferUsage, TU = globalThis.GPUTextureUsage, P = { ...SMAA_DEFAULTS, ...tune };
    const tex = (w, h, format, usage) => device.createTexture({ size: [w, h], format, usage });
    const L = smaaLookup(), area = tex(AREA_WIDTH, AREA_HEIGHT, "rg8unorm", TU.TEXTURE_BINDING | TU.COPY_DST), search = tex(SEARCH_WIDTH, SEARCH_HEIGHT, "r8unorm", TU.TEXTURE_BINDING | TU.COPY_DST);
    device.queue.writeTexture({ texture: area }, L.area, { bytesPerRow: AREA_WIDTH * 2 }, [AREA_WIDTH, AREA_HEIGHT]);
    device.queue.writeTexture({ texture: search }, L.search, { bytesPerRow: SEARCH_WIDTH }, [SEARCH_WIDTH, SEARCH_HEIGHT]);
    const lin = device.createSampler({ magFilter: "linear", minFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
    const uni = device.createBuffer({ size: 48, usage: BU.UNIFORM | BU.COPY_DST }), uniT = device.createBuffer({ size: 224, usage: BU.UNIFORM | BU.COPY_DST });
    const noDepth = tex(1, 1, "r32float", TU.TEXTURE_BINDING);   // bound when a page gives no depth texture
    const vs = device.createShaderModule({ code: SMAA_VS_WGSL });
    const pipe = (code, targets) => device.createRenderPipeline({ layout: "auto", vertex: { module: vs, entryPoint: "vertexMain" }, fragment: { module: device.createShaderModule({ code }), entryPoint: "fragmentMain", targets: targets.map((format) => ({ format })) }, primitive: { topology: "triangle-list" } });
    const pEdge = pipe(SMAA_EDGE_WGSL, ["rg8unorm"]), pWeights = pipe(SMAA_WEIGHTS_WGSL, ["rgba8unorm"]), pBlendOut = pipe(SMAA_BLEND_WGSL, [outputFormat]);
    const pBlendCur = temporal ? pipe(SMAA_BLEND_WGSL, ["rgba8unorm"]) : null, pResolve = temporal ? pipe(SMAA_RESOLVE_WGSL, [outputFormat, "rgba8unorm", "r32float"]) : null;
    const self = { temporal, frame: 0, width: 0, height: 0, inputView: null, params: P, historyValid: false };
    let T = {};
    const build = (w, h) => {
        for (const t of Object.values(T)) t.destroy();
        const RT = TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING;
        T = { color: tex(w, h, "rgba8unorm", RT | TU.COPY_SRC), edges: tex(w, h, "rg8unorm", RT | TU.COPY_SRC), weights: tex(w, h, "rgba8unorm", RT), ...(temporal ? { cur: tex(w, h, "rgba8unorm", RT), hA: tex(w, h, "rgba8unorm", RT), hB: tex(w, h, "rgba8unorm", RT), dA: tex(w, h, "r32float", RT), dB: tex(w, h, "r32float", RT) } : {}) };
        self.width = w; self.height = h; self.inputView = T.color.createView(); self.inputTexture = T.color; self.edgesTexture = T.edges; self.historyValid = false; self._lastHadDepth = false;
        const bg = (p, entries) => device.createBindGroup({ layout: p.getBindGroupLayout(0), entries: entries.map((resource, binding) => ({ binding, resource })) });
        self._bg = {
            edge: bg(pEdge, [{ buffer: uni }, T.color.createView(), lin]),
            weights: bg(pWeights, [{ buffer: uni }, T.edges.createView(), lin, area.createView(), lin, search.createView(), lin]),
            blendOut: bg(pBlendOut, [{ buffer: uni }, T.color.createView(), lin, T.weights.createView(), lin]),
            ...(temporal ? { blendCur: bg(pBlendCur, [{ buffer: uni }, T.color.createView(), lin, T.weights.createView(), lin]),
                resolveA: (dv) => bg(pResolve, [{ buffer: uniT }, T.cur.createView(), T.hA.createView(), dv || noDepth.createView(), lin, T.dA.createView()]), resolveB: (dv) => bg(pResolve, [{ buffer: uniT }, T.cur.createView(), T.hB.createView(), dv || noDepth.createView(), lin, T.dB.createView()]) } : {}),
        };
    };
    build(Math.max(1, width | 0), Math.max(1, height | 0));
    const pass = (enc, view, p, group, ...extra) => {
        const rp = enc.beginRenderPass({ colorAttachments: [view, ...extra].map((v) => ({ view: v, loadOp: "clear", clearValue: [0, 0, 0, 0], storeOp: "store" })) });
        rp.setPipeline(p); rp.setBindGroup(0, group); rp.draw(3); rp.end();
    };
    self.resize = (w, h) => { w = Math.max(1, w | 0); h = Math.max(1, h | 0); if (w !== self.width || h !== self.height) build(w, h); };
    self.jitter = (frame = self.frame) => (temporal ? T2X_JITTER[frame & 1].slice() : [0, 0]);
    /** The three passes (and with temporal on, the resolve) into `target`. `moved`: the camera moved since the last frame, so the history is dropped -- unless
     *  `reproject` ({ invViewProj, prevViewProj, depth: number | r32float view }) says where each pixel was last frame. */
    self.encode = (enc, target, { moved = false, reproject = null } = {}) => {
        const m = new Float32Array([1 / self.width, 1 / self.height, self.width, self.height, P.threshold, P.maxSearchSteps, P.maxSearchStepsDiag, P.cornerRounding / 100, 1, 0, 0, 0]);
        device.queue.writeBuffer(uni, 0, m);
        pass(enc, T.edges.createView(), pEdge, self._bg.edge);   // cleared first: the edge pass discards where there is no edge
        pass(enc, T.weights.createView(), pWeights, self._bg.weights);
        if (!temporal) { pass(enc, target, pBlendOut, self._bg.blendOut); self.frame++; return; }
        pass(enc, T.cur.createView(), pBlendCur, self._bg.blendCur);
        const useHist = self.historyValid && (!moved || !!reproject), readA = (self.frame & 1) === 0;   // even frames read A and write B, odd ones the other way
        const R = new Float32Array(56), dTex = reproject && typeof reproject.depth === "object" ? reproject.depth : null;
        const judge = !!(dTex && self._lastHadDepth && disocclusion > 0 && useHist);   // both frames' depth real, and the test on
        if (reproject) { R.set(reproject.invViewProj, 0); R.set(reproject.prevViewProj, 16); if (judge) R.set(mat4Invert(reproject.prevViewProj), 32); }
        R.set([useHist ? 1 : 0, reproject ? 1 : 0, reproject && typeof reproject.depth === "number" ? reproject.depth : 0, dTex ? 1 : 0], 48);
        R.set([disocclusion, judge ? 1 : 0, 0, 0], 52);
        device.queue.writeBuffer(uniT, 0, R);
        pass(enc, target, pResolve, (readA ? self._bg.resolveA : self._bg.resolveB)(dTex), (readA ? T.hB : T.hA).createView(), (readA ? T.dB : T.dA).createView());
        self._lastHadDepth = !!dTex;
        self.lastUsedHistory = useHist;   // whether this frame took any history in (a move without `reproject` drops it)
        self.historyValid = true; self.frame++;
    };
    self.destroy = () => { for (const t of Object.values(T)) t.destroy(); noDepth.destroy(); area.destroy(); search.destroy(); uni.destroy(); uniT.destroy(); };
    return self;
}
