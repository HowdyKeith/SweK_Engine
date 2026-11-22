// WebGLEngine/render/smaaPass.js -- UNNUMBERED (the version is chosen at ship time)
//
// SMAA 1x, A REAL GL POST-PROCESS PASS. Backlog: render/BACKLOG_2026-11-21_PLAYCANVAS.md, `smaa` (PlayCanvas src/extras/effects/smaa/). Keith: "lets do both playcanvas
// backlog items". render/fxaaPass.js blurs along an edge it guesses from four diagonal samples; SMAA finds the edge, walks along it to its two ends, looks the
// pattern of crossing edges up in a precomputed AREA table and blends each pixel with its neighbour by exactly the area the true edge covers -- sharper text and
// thin lines, less smear, the same cost class. Three passes over the finished frame:
//
//   1  EDGES     luma differences to the left and top neighbours over a threshold, kept only where they beat the local contrast (PlayCanvas's edge-ps), into RG8
//   2  WEIGHTS   for each edge pixel: the diagonal search, then the horizontal and vertical searches along the edge (the SEARCH table says how far the last
//                step reached), the crossing edges at both ends, the AREA table's coverage for that pattern and length, corner rounding (PlayCanvas's weights-ps)
//   3  BLEND     each pixel mixed with the neighbour across its edge by those weights (SMAA's neighbourhood blending)
//
// THE SHADERS ARE PLAYCANVAS'S (playcanvas@2.24.2, MIT; vendor/smaa/LICENSE), converted to GLSL ES 3.0 (textureLod, an out colour) by a script and otherwise as
// shipped; the blend drops PlayCanvas's reversible tone-map round trip, because the frames this tree hands an anti-aliasing pass are already LDR RGBA8 (the
// bloom composite), where it is the identity. The lookup tables are SMAA's, decoded once (vendor/smaa/smaaLookup.mjs).
//
// THE SAME CLASS SHAPE AS render/fxaaPass.js, so main.js's composite chain takes either in the anti-aliasing slot: ok, enabled, inputFBO (what the upstream
// pass composites into), outputFBO (null = the screen), resize(w, h), render(). If a shader fails to compile it disables itself and the normal path is untouched.
// Tuning as PlayCanvas's defaults: threshold 0.1, 16 search steps, 8 diagonal steps, corner rounding 25%.
//
// Held by tools/ship/smaaPass-selfcheck.mjs. NOT HERE: SMAA T2x/S2x/4x (temporal and multisample), predicated thresholding, a WebGPU version.
"use strict";
import { smaaLookup, AREA_WIDTH, AREA_HEIGHT, SEARCH_WIDTH, SEARCH_HEIGHT } from "../vendor/smaa/smaaLookup.mjs";

export const SMAA_VERT_GLSL = `#version 300 es
out vec2 uv0;
void main() {
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));   // one triangle over the screen
    uv0 = p;
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
export const SMAA_EDGE_GLSL = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 uv0;
out vec4 fragColor;
	uniform sampler2D smaaColorTexture;
	uniform vec4 smaaMetrics;
	uniform vec4 smaaParams;
	uniform float smaaExposure;
	#define SMAA_LOCAL_CONTRAST_ADAPTATION_FACTOR 2.0
	float smaaLuma(vec2 uv) {
		vec4 color = textureLod(smaaColorTexture, uv, 0.0);
		float luma = clamp(dot(color.rgb, vec3(0.2126, 0.7152, 0.0722)) * (color.a * smaaExposure), 0.0, 1.0e4);
		return sqrt(luma / (1.0 + luma));
	}
	void main(void) {
		vec2 texel = smaaMetrics.xy;
		float L = smaaLuma(uv0);
		float Lleft = smaaLuma(uv0 - vec2(texel.x, 0.0));
		float Ltop = smaaLuma(uv0 - vec2(0.0, texel.y));
		vec4 delta;
		delta.xy = abs(L - vec2(Lleft, Ltop));
		vec2 edges = step(vec2(smaaParams.x), delta.xy);
		if (dot(edges, vec2(1.0)) == 0.0) {
			discard;
		}
		float Lright = smaaLuma(uv0 + vec2(texel.x, 0.0));
		float Lbottom = smaaLuma(uv0 + vec2(0.0, texel.y));
		delta.zw = abs(L - vec2(Lright, Lbottom));
		vec2 maxDelta = max(delta.xy, delta.zw);
		float Lleftleft = smaaLuma(uv0 - vec2(2.0 * texel.x, 0.0));
		float Ltoptop = smaaLuma(uv0 - vec2(0.0, 2.0 * texel.y));
		delta.zw = abs(vec2(Lleft, Ltop) - vec2(Lleftleft, Ltoptop));
		maxDelta = max(maxDelta.xy, delta.zw);
		float finalDelta = max(maxDelta.x, maxDelta.y);
		edges.xy *= step(finalDelta, SMAA_LOCAL_CONTRAST_ADAPTATION_FACTOR * delta.xy);
		fragColor = vec4(edges, 0.0, 0.0);
	}`;
export const SMAA_WEIGHTS_GLSL = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 uv0;
out vec4 fragColor;
	uniform sampler2D smaaEdgesTexture;
	uniform sampler2D smaaAreaTexture;
	uniform sampler2D smaaSearchTexture;
	uniform vec4 smaaMetrics;
	uniform vec4 smaaParams;
	#define SMAA_AREATEX_MAX_DISTANCE 16.0
	#define SMAA_AREATEX_MAX_DISTANCE_DIAG 20.0
	#define SMAA_AREATEX_PIXEL_SIZE (1.0 / vec2(160.0, 80.0))
	#define SMAA_SEARCHTEX_SIZE vec2(66.0, 33.0)
	#define SMAA_SEARCHTEX_PACKED_SIZE vec2(64.0, 16.0)
	vec2 sampleEdges(vec2 uv) {
		return textureLod(smaaEdgesTexture, uv, 0.0).rg;
	}
	vec2 sampleEdgesOffset(vec2 uv, vec2 offset) {
		return sampleEdges(uv + offset * smaaMetrics.xy);
	}
	vec2 decodeDiagBilinearAccess(vec2 e) {
		e.r = e.r * abs(5.0 * e.r - 5.0 * 0.75);
		return round(e);
	}
	vec4 decodeDiagBilinearAccess(vec4 e) {
		e.rb = e.rb * abs(5.0 * e.rb - 5.0 * 0.75);
		return round(e);
	}
	vec2 searchDiag1(vec2 texcoord, vec2 dir, out vec2 e) {
		vec4 coord = vec4(texcoord, -1.0, 1.0);
		vec3 t = vec3(smaaMetrics.xy, 1.0);
		float maxSteps = smaaParams.z - 1.0;
		e = vec2(0.0);
		while (coord.z < maxSteps && coord.w > 0.9) {
			coord.xyz = t * vec3(dir, 1.0) + coord.xyz;
			e = sampleEdges(coord.xy);
			coord.w = dot(e, vec2(0.5));
		}
		return coord.zw;
	}
	vec2 searchDiag2(vec2 texcoord, vec2 dir, out vec2 e) {
		vec4 coord = vec4(texcoord, -1.0, 1.0);
		coord.x += 0.25 * smaaMetrics.x;
		vec3 t = vec3(smaaMetrics.xy, 1.0);
		float maxSteps = smaaParams.z - 1.0;
		e = vec2(0.0);
		while (coord.z < maxSteps && coord.w > 0.9) {
			coord.xyz = t * vec3(dir, 1.0) + coord.xyz;
			e = decodeDiagBilinearAccess(sampleEdges(coord.xy));
			coord.w = dot(e, vec2(0.5));
		}
		return coord.zw;
	}
	vec2 areaDiag(vec2 dist, vec2 e) {
		vec2 texcoord = vec2(SMAA_AREATEX_MAX_DISTANCE_DIAG) * e + dist;
		texcoord = SMAA_AREATEX_PIXEL_SIZE * texcoord + 0.5 * SMAA_AREATEX_PIXEL_SIZE;
		texcoord.x += 0.5;
		return textureLod(smaaAreaTexture, texcoord, 0.0).rg;
	}
	vec2 calculateDiagWeights(vec2 texcoord, vec2 e) {
		vec2 weights = vec2(0.0);
		vec4 d;
		vec2 end;
		if (e.r > 0.0) {
			d.xz = searchDiag1(texcoord, vec2(-1.0, 1.0), end);
			d.x += float(end.y > 0.9);
		} else {
			d.xz = vec2(0.0);
		}
		d.yw = searchDiag1(texcoord, vec2(1.0, -1.0), end);
		if (d.x + d.y > 2.0) {
			vec4 coords = vec4(-d.x + 0.25, d.x, d.y, -d.y - 0.25) * smaaMetrics.xyxy + texcoord.xyxy;
			vec4 c;
			c.xy = sampleEdgesOffset(coords.xy, vec2(-1.0, 0.0));
			c.zw = sampleEdgesOffset(coords.zw, vec2(1.0, 0.0));
			c.yxwz = decodeDiagBilinearAccess(c.xyzw);
			vec2 cc = vec2(2.0) * c.xz + c.yw;
			cc = mix(cc, vec2(0.0), step(vec2(0.9), d.zw));
			weights += areaDiag(d.xy, cc);
		}
		d.xz = searchDiag2(texcoord, vec2(-1.0, -1.0), end);
		if (sampleEdgesOffset(texcoord, vec2(1.0, 0.0)).r > 0.0) {
			d.yw = searchDiag2(texcoord, vec2(1.0, 1.0), end);
			d.y += float(end.y > 0.9);
		} else {
			d.yw = vec2(0.0);
		}
		if (d.x + d.y > 2.0) {
			vec4 coords = vec4(-d.x, -d.x, d.y, d.y) * smaaMetrics.xyxy + texcoord.xyxy;
			vec4 c;
			c.x = sampleEdgesOffset(coords.xy, vec2(-1.0, 0.0)).g;
			c.y = sampleEdgesOffset(coords.xy, vec2(0.0, -1.0)).r;
			c.zw = sampleEdgesOffset(coords.zw, vec2(1.0, 0.0)).gr;
			vec2 cc = vec2(2.0) * c.xz + c.yw;
			cc = mix(cc, vec2(0.0), step(vec2(0.9), d.zw));
			weights += areaDiag(d.xy, cc).gr;
		}
		return weights;
	}
	float searchLength(vec2 e, float offset) {
		vec2 scale = SMAA_SEARCHTEX_SIZE * vec2(0.5, -1.0);
		vec2 bias = SMAA_SEARCHTEX_SIZE * vec2(offset, 1.0);
		scale += vec2(-1.0, 1.0);
		bias += vec2(0.5, -0.5);
		scale *= 1.0 / SMAA_SEARCHTEX_PACKED_SIZE;
		bias *= 1.0 / SMAA_SEARCHTEX_PACKED_SIZE;
		return textureLod(smaaSearchTexture, scale * e + bias, 0.0).r;
	}
	float searchXLeft(vec2 texcoord, float end) {
		vec2 e = vec2(0.0, 1.0);
		while (texcoord.x > end && e.g > 0.8281 && e.r == 0.0) {
			e = sampleEdges(texcoord);
			texcoord = -vec2(2.0, 0.0) * smaaMetrics.xy + texcoord;
		}
		float offset = -(255.0 / 127.0) * searchLength(e, 0.0) + 3.25;
		return smaaMetrics.x * offset + texcoord.x;
	}
	float searchXRight(vec2 texcoord, float end) {
		vec2 e = vec2(0.0, 1.0);
		while (texcoord.x < end && e.g > 0.8281 && e.r == 0.0) {
			e = sampleEdges(texcoord);
			texcoord = vec2(2.0, 0.0) * smaaMetrics.xy + texcoord;
		}
		float offset = -(255.0 / 127.0) * searchLength(e, 0.5) + 3.25;
		return -smaaMetrics.x * offset + texcoord.x;
	}
	float searchYUp(vec2 texcoord, float end) {
		vec2 e = vec2(1.0, 0.0);
		while (texcoord.y > end && e.r > 0.8281 && e.g == 0.0) {
			e = sampleEdges(texcoord);
			texcoord = -vec2(0.0, 2.0) * smaaMetrics.xy + texcoord;
		}
		float offset = -(255.0 / 127.0) * searchLength(e.gr, 0.0) + 3.25;
		return smaaMetrics.y * offset + texcoord.y;
	}
	float searchYDown(vec2 texcoord, float end) {
		vec2 e = vec2(1.0, 0.0);
		while (texcoord.y < end && e.r > 0.8281 && e.g == 0.0) {
			e = sampleEdges(texcoord);
			texcoord = vec2(0.0, 2.0) * smaaMetrics.xy + texcoord;
		}
		float offset = -(255.0 / 127.0) * searchLength(e.gr, 0.5) + 3.25;
		return -smaaMetrics.y * offset + texcoord.y;
	}
	vec2 area(vec2 dist, float e1, float e2) {
		vec2 texcoord = vec2(SMAA_AREATEX_MAX_DISTANCE) * round(4.0 * vec2(e1, e2)) + dist;
		texcoord = SMAA_AREATEX_PIXEL_SIZE * texcoord + 0.5 * SMAA_AREATEX_PIXEL_SIZE;
		return textureLod(smaaAreaTexture, texcoord, 0.0).rg;
	}
	vec2 detectHorizontalCornerPattern(vec2 weights, vec4 texcoord, vec2 d) {
		vec2 leftRight = step(d.xy, d.yx);
		vec2 rounding = (1.0 - smaaParams.w) * leftRight;
		rounding /= leftRight.x + leftRight.y;
		vec2 factor = vec2(1.0);
		factor.x -= rounding.x * sampleEdgesOffset(texcoord.xy, vec2(0.0, 1.0)).r;
		factor.x -= rounding.y * sampleEdgesOffset(texcoord.zw, vec2(1.0, 1.0)).r;
		factor.y -= rounding.x * sampleEdgesOffset(texcoord.xy, vec2(0.0, -2.0)).r;
		factor.y -= rounding.y * sampleEdgesOffset(texcoord.zw, vec2(1.0, -2.0)).r;
		return weights * clamp(factor, 0.0, 1.0);
	}
	vec2 detectVerticalCornerPattern(vec2 weights, vec4 texcoord, vec2 d) {
		vec2 leftRight = step(d.xy, d.yx);
		vec2 rounding = (1.0 - smaaParams.w) * leftRight;
		rounding /= leftRight.x + leftRight.y;
		vec2 factor = vec2(1.0);
		factor.x -= rounding.x * sampleEdgesOffset(texcoord.xy, vec2(1.0, 0.0)).g;
		factor.x -= rounding.y * sampleEdgesOffset(texcoord.zw, vec2(1.0, 1.0)).g;
		factor.y -= rounding.x * sampleEdgesOffset(texcoord.xy, vec2(-2.0, 0.0)).g;
		factor.y -= rounding.y * sampleEdgesOffset(texcoord.zw, vec2(-2.0, 1.0)).g;
		return weights * clamp(factor, 0.0, 1.0);
	}
	void main(void) {
		vec2 texcoord = uv0;
		vec4 metrics = smaaMetrics;
		vec2 pixcoord = texcoord * metrics.zw;
		vec4 offset0 = metrics.xyxy * vec4(-0.25, -0.125, 1.25, -0.125) + texcoord.xyxy;
		vec4 offset1 = metrics.xyxy * vec4(-0.125, -0.25, -0.125, 1.25) + texcoord.xyxy;
		vec4 offset2 = metrics.xxyy * (vec4(-2.0, 2.0, -2.0, 2.0) * smaaParams.y) + vec4(offset0.xz, offset1.yw);
		vec4 weights = vec4(0.0);
		vec2 e = sampleEdges(texcoord);
		if (e.g > 0.0) {
			if (smaaParams.z > 0.0) {
				weights.rg = calculateDiagWeights(texcoord, e);
			}
			if (weights.r == -weights.g) {
				vec2 d;
				vec3 coords;
				coords.x = searchXLeft(offset0.xy, offset2.x);
				coords.y = offset1.y;
				d.x = coords.x;
				float e1 = textureLod(smaaEdgesTexture, coords.xy, 0.0).r;
				coords.z = searchXRight(offset0.zw, offset2.y);
				d.y = coords.z;
				d = abs(round(metrics.zz * d - pixcoord.xx));
				vec2 sqrtD = sqrt(d);
				float e2 = sampleEdgesOffset(coords.zy, vec2(1.0, 0.0)).r;
				weights.rg = area(sqrtD, e1, e2);
				coords.y = texcoord.y;
				weights.rg = detectHorizontalCornerPattern(weights.rg, coords.xyzy, d);
			} else {
				e.r = 0.0;
			}
		}
		if (e.r > 0.0) {
			vec2 d;
			vec3 coords;
			coords.y = searchYUp(offset1.xy, offset2.z);
			coords.x = offset0.x;
			d.x = coords.y;
			float e1 = textureLod(smaaEdgesTexture, coords.xy, 0.0).g;
			coords.z = searchYDown(offset1.zw, offset2.w);
			d.y = coords.z;
			d = abs(round(metrics.ww * d - pixcoord.yy));
			vec2 sqrtD = sqrt(d);
			float e2 = sampleEdgesOffset(coords.xz, vec2(0.0, 1.0)).g;
			weights.ba = area(sqrtD, e1, e2);
			coords.x = texcoord.x;
			weights.ba = detectVerticalCornerPattern(weights.ba, coords.xyxz, d);
		}
		fragColor = weights;
	}`;
export const SMAA_BLEND_GLSL = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 uv0;
out vec4 fragColor;
uniform sampler2D smaaColorTexture;
uniform sampler2D smaaBlendTexture;
uniform vec4 smaaMetrics;
void main(void) {
	vec2 texel = smaaMetrics.xy;
	vec4 a;
	a.x = textureLod(smaaBlendTexture, uv0 + vec2(texel.x, 0.0), 0.0).a;
	a.y = textureLod(smaaBlendTexture, uv0 + vec2(0.0, texel.y), 0.0).g;
	a.wz = textureLod(smaaBlendTexture, uv0, 0.0).xz;
	vec4 color = textureLod(smaaColorTexture, uv0, 0.0);
	if (dot(a, vec4(1.0)) >= 1.0e-5) {
		bool horizontal = max(a.x, a.z) > max(a.y, a.w);
		vec2 dir = horizontal ? vec2(texel.x, 0.0) : vec2(0.0, texel.y);
		vec2 fraction = horizontal ? a.xz : a.yw;
		vec2 weight = fraction / dot(fraction, vec2(1.0));
		vec4 positive = textureLod(smaaColorTexture, uv0 + dir, 0.0);
		vec4 negative = textureLod(smaaColorTexture, uv0 - dir, 0.0);
		color = weight.x * mix(color, positive, fraction.x) + weight.y * mix(color, negative, fraction.y);
	}
	fragColor = color;
}`;
export const SMAA_DEFAULTS = Object.freeze({ threshold: 0.1, maxSearchSteps: 16, maxSearchStepsDiag: 8, cornerRounding: 25 });

export class SmaaPass {
    constructor(gl, width, height, opts = {}) {
        this.gl = gl;
        this.width = Math.max(1, width | 0);
        this.height = Math.max(1, height | 0);
        Object.assign(this, SMAA_DEFAULTS, opts);
        this.ok = false;
        this.enabled = false;
        this.outputFBO = null;   // null = the screen; a downstream pass's input FBO otherwise (render/bloomPass.js's convention)
        try {
            this.progEdge = this._compile(SMAA_VERT_GLSL, SMAA_EDGE_GLSL);
            this.progWeights = this._compile(SMAA_VERT_GLSL, SMAA_WEIGHTS_GLSL);
            this.progBlend = this._compile(SMAA_VERT_GLSL, SMAA_BLEND_GLSL);
            this.vao = gl.createVertexArray();
            const L = smaaLookup();
            this.areaTex = this._texture(gl.RG8, gl.RG, AREA_WIDTH, AREA_HEIGHT, L.area);
            this.searchTex = this._texture(gl.R8, gl.RED, SEARCH_WIDTH, SEARCH_HEIGHT, L.search);
            this._buildTargets();
            this.ok = true;
        } catch (e) {
            console.warn("[smaa] disabled -- shader/setup failed:", e && e.message);
            this.ok = false;
        }
    }
    _compile(vsSrc, fsSrc) {
        const gl = this.gl, mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error("compile: " + log); } return s; };
        const vs = mk(gl.VERTEX_SHADER, vsSrc), fs = mk(gl.FRAGMENT_SHADER, fsSrc), p = gl.createProgram();
        gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p); gl.deleteShader(vs); gl.deleteShader(fs);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { const log = gl.getProgramInfoLog(p); gl.deleteProgram(p); throw new Error("link: " + log); }
        return p;
    }
    _texture(internal, format, w, h, data) {
        const gl = this.gl, t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.UNSIGNED_BYTE, data);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
        for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
        gl.bindTexture(gl.TEXTURE_2D, null);
        return t;
    }
    _target(internal, format) {
        const gl = this.gl, tex = this._texture(internal, format, this.width, this.height, null), fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return { tex, fbo };
    }
    _buildTargets() {
        const gl = this.gl;
        for (const t of [this.color, this.edges, this.weights]) if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
        this.color = this._target(gl.RGBA8, gl.RGBA);     // the frame, as the upstream pass composites it
        this.edges = this._target(gl.RG8, gl.RG);
        this.weights = this._target(gl.RGBA8, gl.RGBA);
    }
    resize(width, height) {
        width = Math.max(1, width | 0); height = Math.max(1, height | 0);
        if (width === this.width && height === this.height) return;
        this.width = width; this.height = height;
        if (this.ok) this._buildTargets();
    }
    /** The FBO an upstream pass (bloom) composites into instead of the screen. */
    get inputFBO() { return this.color && this.color.fbo; }
    _run(prog, fbo, textures) {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, this.width, this.height);
        gl.useProgram(prog);
        gl.uniform4f(gl.getUniformLocation(prog, "smaaMetrics"), 1 / this.width, 1 / this.height, this.width, this.height);
        const pl = gl.getUniformLocation(prog, "smaaParams"); if (pl) gl.uniform4f(pl, this.threshold, this.maxSearchSteps, this.maxSearchStepsDiag, this.cornerRounding / 100);
        const ex = gl.getUniformLocation(prog, "smaaExposure"); if (ex) gl.uniform1f(ex, 1.0);
        textures.forEach(([name, tex], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(gl.getUniformLocation(prog, name), i); });
        gl.bindVertexArray(this.vao); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
    }
    /** The stored frame through the three passes, to outputFBO (or the screen when null). */
    render() {
        if (!this.ok || !this.enabled) return;
        const gl = this.gl, blendOn = gl.isEnabled(gl.BLEND), depthOn = gl.isEnabled(gl.DEPTH_TEST);
        gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.edges.fbo); gl.viewport(0, 0, this.width, this.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);   // the edge pass discards where there is none
        this._run(this.progEdge, this.edges.fbo, [["smaaColorTexture", this.color.tex]]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.weights.fbo); gl.clear(gl.COLOR_BUFFER_BIT);
        this._run(this.progWeights, this.weights.fbo, [["smaaEdgesTexture", this.edges.tex], ["smaaAreaTexture", this.areaTex], ["smaaSearchTexture", this.searchTex]]);
        this._run(this.progBlend, this.outputFBO || null, [["smaaColorTexture", this.color.tex], ["smaaBlendTexture", this.weights.tex]]);
        if (blendOn) gl.enable(gl.BLEND); if (depthOn) gl.enable(gl.DEPTH_TEST);
        gl.activeTexture(gl.TEXTURE0);
    }
    destroy() {
        const gl = this.gl; if (!this.ok) return;
        for (const t of [this.color, this.edges, this.weights]) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
        gl.deleteTexture(this.areaTex); gl.deleteTexture(this.searchTex); for (const p of [this.progEdge, this.progWeights, this.progBlend]) gl.deleteProgram(p); gl.deleteVertexArray(this.vao); this.ok = false;
    }
}
