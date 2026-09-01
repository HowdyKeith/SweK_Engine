// FILE: render/transitionPass.js -- v4204
//
// RUNS A GL TRANSITION. The host half of the spec: it supplies progress, ratio, getFromColor and getToColor,
// so a conforming transition never binds a texture and never learns what it is transitioning between.
//
// render/transitionSpec.mjs is the pure half -- parse, validate, assemble -- and has no GL in it at all, so
// the contract can be checked with no context. This file is the part that needs one.
//
// *** IT REFUSES A NON-CONFORMING TRANSITION BEFORE COMPILING IT, WHICH IS THE POINT OF HAVING A VALIDATOR
// AT ALL. *** A shader that samples its own texture or shadows `progress` COMPILES FINE and then renders
// wrong -- skewed on a non-square viewport, or frozen at whatever the shadowed uniform defaulted to. A
// compiler error is a message; a wrong picture is a bug report from a person three weeks later.
"use strict";

import { assemble, validateTransition, parseTransition } from "./transitionSpec.mjs";

const VERT = `attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
`;

function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        return { shader: null, log };
    }
    return { shader: sh, log: null };
}

/**
 * Build a transition pass from conforming GLSL.
 *
 * Returns { render, dispose, params, meta } or, on refusal, { error, problems } -- never throws for a bad
 * shader, because "this transition does not conform, here is why" is information and an exception in a
 * render loop is not.
 */
export function makeTransitionPass(gl, source, opts = {}) {
    const problems = validateTransition(source);
    if (problems.length && !opts.force) {
        return { error: "transition does not conform to the spec", problems, program: null };
    }
    const frag = assemble(source, opts);
    const v = compile(gl, gl.VERTEX_SHADER, VERT);
    if (!v.shader) return { error: "vertex shader failed to compile", problems: [v.log], program: null };
    const f = compile(gl, gl.FRAGMENT_SHADER, frag);
    if (!f.shader) {
        gl.deleteShader(v.shader);
        // *** CONFORMANCE IS NOT COMPILATION, AND transitionSpec.mjs SAYS SO IN ITS LIMITS. *** A file can
        // satisfy every rule the scanner knows and still be rejected by the driver, so the compile log is
        // returned rather than swallowed behind "invalid transition".
        return { error: "fragment shader failed to compile", problems: [f.log], program: null, assembled: frag };
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, v.shader); gl.attachShader(prog, f.shader);
    gl.bindAttribLocation(prog, 0, "aPos");
    gl.linkProgram(prog);
    gl.deleteShader(v.shader); gl.deleteShader(f.shader);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(prog);
        gl.deleteProgram(prog);
        return { error: "program failed to link", problems: [log], program: null };
    }

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    const parsed = parseTransition(source);
    const loc = (n) => gl.getUniformLocation(prog, n);
    const U = { from: loc("uFrom"), to: loc("uTo"), progress: loc("progress"), ratio: loc("ratio") };
    const paramLoc = new Map(parsed.params.map((p) => [p.name, loc(p.name)]));

    return {
        error: null, problems: [], program: prog, params: parsed.params, meta: parsed.meta, assembled: frag,
        /**
         * @param progress 0..1
         * @param ratio    viewport width/height. NOT derived from the canvas here: a pass may render into a
         *                 framebuffer whose shape differs from the canvas, and guessing that was the class
         *                 of bug the ratio parameter exists to avoid.
         */
        render(fromTex, toTex, progress, ratio, values = {}) {
            gl.useProgram(prog);
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fromTex); gl.uniform1i(U.from, 0);
            gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, toTex);   gl.uniform1i(U.to, 1);
            gl.uniform1f(U.progress, progress);
            gl.uniform1f(U.ratio, ratio);
            for (const p of parsed.params) {
                const l = paramLoc.get(p.name);
                if (!l) continue;                                  // optimised out; not an error
                const val = p.name in values ? values[p.name] : defaultValue(p);
                if (val === null || val === undefined) continue;
                applyUniform(gl, l, p.type, val);
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        },
        dispose() { gl.deleteProgram(prog); gl.deleteBuffer(buf); },
    };
}

/** Turn a spec default string -- "0.5", "vec2(1.0, 2.0)", "true" -- into a JS value. null when unparseable. */
export function defaultValue(p) {
    if (p.default === null || p.default === undefined) return null;
    const s = String(p.default).trim();
    if (p.type === "bool") return s === "true";
    if (p.type === "int" || p.type === "float") { const n = Number(s); return Number.isFinite(n) ? n : null; }
    const m = s.match(/^[iu]?vec[234]\s*\(([^)]*)\)$/);
    if (m) {
        const parts = m[1].split(",").map((x) => Number(x.trim())).filter((x) => Number.isFinite(x));
        const want = Number(p.type.slice(-1));
        // vec3(0.5) is legal GLSL and means (0.5, 0.5, 0.5) -- a splat, not a short list.
        if (parts.length === 1) return new Array(want).fill(parts[0]);
        return parts.length === want ? parts : null;
    }
    const n = Number(s);
    return Number.isFinite(n) ? new Array(Number(p.type.slice(-1))).fill(n) : null;
}

function applyUniform(gl, loc, type, v) {
    switch (type) {
        case "bool": return gl.uniform1i(loc, v ? 1 : 0);
        case "int": return gl.uniform1i(loc, v | 0);
        case "float": return gl.uniform1f(loc, v);
        case "vec2": return gl.uniform2fv(loc, v);
        case "vec3": return gl.uniform3fv(loc, v);
        case "vec4": return gl.uniform4fv(loc, v);
        case "ivec2": return gl.uniform2iv(loc, v);
        case "ivec3": return gl.uniform3iv(loc, v);
        case "ivec4": return gl.uniform4iv(loc, v);
        default: return undefined;                                 // sampler2D is bound by the caller
    }
}
