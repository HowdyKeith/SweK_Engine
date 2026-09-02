// WebGLEngine/render/tslSource.mjs -- v4320, v4322 (a transplant into ANY shell: a race look), v4323 (one language at a time; linear sampling), v4324 (the vertex stage: a position node), v4325 (the shell names its own locals: a second layout)
//
// TSL AS A SOURCE FOR gfx/device.js. three's node builders compile a TSL graph to WGSL (WebGPU backend) and to
// GLSL (WebGL2 backend), and WebGPURenderer.debug.getShaderAsync hands the two texts out. What they hand out is a
// whole MATERIAL shell -- three's camera and object uniform groups, its varyings, its own bindings and entry name --
// which gfx/device.js does not speak. This module TRANSPLANTS the fragment: the helper functions three emitted
// and the body of its main(), with three's names rewritten to the device's (the varying to the device's uv, the
// object struct to the device's uniform struct, a labelled texture to the device's texture binding, the texture's
// sampler to the device's one sampler), inside the device's own full-screen shell (its vertex stage, its bindings
// at group 0). The result is a device pipeline descriptor whose fragment nobody wrote by hand, and whose picture
// the gate holds to the hand-written pipeline's, to the byte, on both backends.
//
// THE RULES ARE NARROW AND SAID: the graph must be a fragment-only effect (no camera or object matrices in the
// fragment), every uniform and texture must be LABELLED (an unlabelled nodeUniformN has no stable name to bind
// under, and the transplant refuses it), and the material must be a bare NodeMaterial with fragmentNode set (a
// MeshBasicNodeMaterial adds an opacity uniform and a clamp the effect did not ask for). Inside those rules the
// rewrite is textual and shown to be exact; outside them it refuses by name rather than emitting something that
// compiles and draws the wrong picture.
"use strict";

import { VERTEX_GLSL } from "./badTvDevicePass.mjs";

export const TRI_VS_WGSL = `struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VSOut; o.pos = vec4f(p[vi], 0.0, 1.0); o.uv = vec2f((p[vi].x + 1.0) * 0.5, 1.0 - (p[vi].y + 1.0) * 0.5); return o;
}`;
const WGSL_TYPES = { "f32": "f32", "vec2<f32>": "vec2", "vec3<f32>": "vec3", "vec4<f32>": "vec4", "mat4x4<f32>": "mat4", "i32": "i32", "u32": "u32" };
const GLSL_TYPES = { "float": "f32", "vec2": "vec2", "vec3": "vec3", "vec4": "vec4", "mat4": "mat4", "int": "i32", "uint": "u32" };
// v4325 -- the names a shell has for what three calls positionLocal, normalLocal, position and normal. A shell that
// carries no normal (the sprite layout has p, color, uv and nothing else) simply leaves those out, and a displacement
// that reads one is refused BY NAME rather than renamed into a variable the shell's vertex stage never declared.
export const DEFAULT_LOCALS = Object.freeze({ positionLocal: "pl", normalLocal: "nl", position: "p", normal: "n" });

/** Ask three for the shaders of one mesh: { wgsl | glsl: { vertex, fragment }, language }. The renderer must be initialised. */
export async function emitShaders(renderer, { scene, camera, mesh }) {
    const sh = await renderer.debug.getShaderAsync(scene, camera, mesh);
    return { language: renderer.backend.isWebGPUBackend ? "wgsl" : "glsl", vertex: sh.vertexShader, fragment: sh.fragmentShader };
}

/** The fields of three's fragment uniform struct, in order: [{ name, type }] (type in the device's vocabulary). Refuses an unlabelled one. */
export function uniformFields(fragment, language) {
    const out = [];
    if (language === "wgsl") {
        const m = fragment.match(/struct objectStruct \{([\s\S]*?)\};/);
        if (!m) return out;
        for (const line of m[1].split("\n")) { const f = line.trim().replace(/,$/, "").match(/^(\w+)\s*:\s*(.+)$/); if (!f) continue; const t = WGSL_TYPES[f[2].trim()]; if (!t) throw new Error(`tslSource: uniform ${f[1]} has type ${f[2]}, which the device's uniform list does not carry`); out.push({ name: f[1], type: t }); }
    } else {
        const m = fragment.match(/uniform fragment_object \{([\s\S]*?)\};/);
        if (!m) return out;
        for (const line of m[1].split("\n")) { const f = line.trim().replace(/;$/, "").match(/^(\w+)\s+f_(\w+)$/); if (!f) continue; const t = GLSL_TYPES[f[1]]; if (!t) throw new Error(`tslSource: uniform ${f[2]} has type ${f[1]}, which the device's uniform list does not carry`); out.push({ name: f[2], type: t }); }
    }
    for (const u of out) if (/^nodeUniform\d+$/.test(u.name)) throw new Error(`tslSource: the emitted ${language.toUpperCase()} carries an UNLABELLED uniform (${u.name}); label every uniform node (uniform(x).label("name")) so the device can bind it by name`);
    return out;
}
/** The textures three declared: [name]. Refuses an unlabelled one. */
export function textureNames(fragment, language) {
    const names = language === "wgsl" ? [...fragment.matchAll(/var (\w+) : texture_2d<f32>;/g)].map((m) => m[1]) : [...fragment.matchAll(/uniform sampler2D (\w+);/g)].map((m) => m[1]);
    for (const n of names) if (/^nodeUniform\d+$/.test(n)) throw new Error(`tslSource: the emitted ${language.toUpperCase()} carries an UNLABELLED texture (${n}); label the texture node (texture(t, uv).label("tDiffuse"))`);
    return names;
}
/**
 * The transplant: three's fragment -> the device's fragment, in the same language. Returns { code, uniforms, textures, varying }.
 * WGSL: the device shell is struct U at binding 0, one sampler `samp` at 1, textures from 2; entry `fs`, input uv at location 0.
 * GLSL: plain uniforms by name, `in vec2 vUv`, `out vec4 fragColor`, entry main.
 */
export function transplantFragment(fragment, language) {
    if (typeof fragment !== "string" || !fragment.includes("Three.js")) throw new Error("tslSource: not a three.js node-system shader");
    if (/\brender\./.test(fragment) || /cameraProjectionMatrix|modelViewMatrix/.test(fragment)) throw new Error("tslSource: the fragment reads camera or object matrices; only a fragment-only effect (uv in, colour out) can be transplanted");
    const uniforms = uniformFields(fragment, language), textures = textureNames(fragment, language);
    if (language === "wgsl") {
        const varying = (fragment.match(/fn main\(\s*@location\(\s*\d+\s*\)\s*(\w+)\s*:\s*vec2<f32>\s*\)/) || [])[1];
        if (!varying) throw new Error("tslSource: the WGSL fragment does not take exactly one vec2 varying (the uv)");
        if (/@location\(\s*\d+\s*\)\s*\w+\s*:\s*\w+[^)]*,\s*@location/.test(fragment.split("fn main(")[1] || "")) throw new Error("tslSource: the WGSL fragment takes more than one varying");
        const codes = (fragment.split("// codes")[1] || "").split("@fragment")[0].trim();
        const bodyAll = fragment.split("fn main(")[1]; const body = bodyAll.slice(bodyAll.indexOf("{") + 1, bodyAll.lastIndexOf("}"));
        let b = body.replace(/output\.color\s*=\s*([^;]+);\s*return output;/, "return $1;");
        if (!/return /.test(b)) throw new Error("tslSource: the WGSL main() does not end in output.color = ...; return output;");
        b = b.replace(new RegExp(`\\b${varying}\\b`, "g"), "uv").replace(/\bobject\.(\w+)/g, "u.$1");
        for (const t of textures) b = b.replace(new RegExp(`\\b${t}_sampler\\b`, "g"), "samp");
        const usesSampler = /\bsamp\b/.test(b) || /\bsamp\b/.test(codes);
        const U = uniforms.length ? `struct U { ${uniforms.map((u) => `${u.name}: ${Object.keys(WGSL_TYPES).find((k) => WGSL_TYPES[k] === u.type)}`).join(", ")} };\n@group(0) @binding(0) var<uniform> u: U;\n` : "";
        const tex = textures.map((t, i) => `@group(0) @binding(${2 + i}) var ${t}: texture_2d<f32>;`).join("\n");
        const code = `// transplanted from three's WGSL node builder by render/tslSource.mjs\n${U}${usesSampler ? "@group(0) @binding(1) var samp: sampler;\n" : ""}${tex}\n${TRI_VS_WGSL}\n${codes}\n@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {${b}}\n`;
        return { code, uniforms, textures, varying, usesSampler };
    }
    const varying = (fragment.match(/in vec2 (\w+);/) || [])[1];
    if (!varying) throw new Error("tslSource: the GLSL fragment does not take a vec2 varying (the uv)");
    if ((fragment.match(/^in /gm) || []).length > 1) throw new Error("tslSource: the GLSL fragment takes more than one varying");
    const codes = (fragment.split("// codes")[1] || "").split("// structs")[0].trim();
    const bodyAll = fragment.split("void main()")[1]; let b = bodyAll.slice(bodyAll.indexOf("{") + 1, bodyAll.lastIndexOf("}"));
    if (!/fragColor\s*=/.test(b)) throw new Error("tslSource: the GLSL main() does not write fragColor");
    b = b.replace(new RegExp(`\\b${varying}\\b`, "g"), "vUv");
    for (const u of uniforms) b = b.replace(new RegExp(`\\bf_${u.name}\\b`, "g"), u.name);
    const glslType = (t) => Object.keys(GLSL_TYPES).find((k) => GLSL_TYPES[k] === t);
    const code = `#version 300 es\n// transplanted from three's GLSL node builder by render/tslSource.mjs\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\n${uniforms.map((u) => `uniform ${glslType(u.type)} ${u.name};`).join("\n")}\n${textures.map((t) => `uniform sampler2D ${t};`).join("\n")}\nin vec2 vUv;\nout vec4 fragColor;\n${codes}\nvoid main() {${b}}\n`;
    return { code, uniforms, textures, varying, usesSampler: textures.length > 0 };
}
/**
 * A device pipeline descriptor from the two emitted fragments (one per backend, from two renderers): the device's
 * full-screen vertex stages, the transplanted fragments, the uniforms in three's order. Both fragments must agree on
 * the uniform list and the textures, or the descriptor refuses.
 */
export function devicePipelineFromTsl({ wgsl, glsl }) {
    const W = transplantFragment(wgsl, "wgsl"), G = transplantFragment(glsl, "glsl");
    if (W.uniforms.map((u) => u.name + ":" + u.type).join() !== G.uniforms.map((u) => u.name + ":" + u.type).join()) throw new Error(`tslSource: the WGSL and GLSL builders emitted different uniform lists (${W.uniforms.map((u) => u.name).join(",")} vs ${G.uniforms.map((u) => u.name).join(",")})`);
    if (W.textures.join() !== G.textures.join()) throw new Error(`tslSource: the WGSL and GLSL builders emitted different textures (${W.textures.join(",")} vs ${G.textures.join(",")})`);
    return { shaders: { wgsl: W.code, glsl: { vertex: VERTEX_GLSL, fragment: G.code } }, vs: "vs", fs: "fs", attributes: [], stride: 0,
             uniforms: W.uniforms.map((u) => ({ name: u.name, type: u.type })), textures: W.textures, transplant: { wgsl: W, glsl: G } };
}

// ---- v4322: the transplant into a HOST SHELL -- a fleet look's vertex stage, its uniform struct, its varyings -------------
/**
 * The semantic each of three's varyings carries, read from the VERTEX shader it emitted: { nodeVarying3: "uv", nodeVarying4: "normal", ... }.
 * three writes `varyings.nodeVaryingN = <attribute>;` (WGSL) or `nodeVaryingN = <attribute>;` (GLSL); an attribute this shell cannot supply refuses later.
 */
export function varyingSemantics(vertex, language) {
    const out = {};
    const re = language === "wgsl" ? /varyings\.(nodeVarying\d+)\s*=\s*(\w+);/g : /^\s*(nodeVarying\d+)\s*=\s*(\w+);/gm;
    for (const m of vertex.matchAll(re)) out[m[1]] = m[2];
    return out;
}
/**
 * v4324 -- THE VERTEX STAGE. A graph with a positionNode makes three's vertex shader compute `positionLocal = position;`
 * then reassign positionLocal from the graph (and normalLocal = normal beside it), BEFORE the varyings and the camera
 * matrices. Those statements -- the displacement -- are what a host shell can take: its own vertex stage keeps its own
 * transform (the fleet's record placement, its turn, the device's viewProj) and splices the displacement in where it
 * says `{{DISPLACE}}`, with three's names rewritten: positionLocal -> pl, normalLocal -> nl, position -> p, normal -> n,
 * object.<u> -> the shell's struct. Three's camera and model matrices never cross: they are the shell's.
 * Returns { statements, decls, uniforms, reads } or null when the vertex only copies (no displacement); `reads` is
 * three's names for the attributes and locals the statements touch, which the shell must have a name for (v4325).
 */
export function vertexDisplacement(vertex, language) {
    const bodyAll = vertex.split(language === "wgsl" ? "fn main(" : "void main()")[1] || "";
    const body = bodyAll.slice(bodyAll.indexOf("{") + 1, bodyAll.lastIndexOf("}"));
    const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
    const start = lines.findIndex((l) => /^positionLocal\s*=\s*position;/.test(l));
    if (start < 0) return null;
    const stop = lines.findIndex((l, i) => i > start && (/^varyings\.|^modelViewMatrix|^nodeVarying\d+\s*=|^gl_Position|^v_modelViewProjection/.test(l)));
    const mid = lines.slice(start + 1, stop < 0 ? lines.length : stop).filter((l) => !/^normalLocal\s*=\s*normal;/.test(l));
    const statements = mid.filter((l) => !/^(var |vec[234] |float |mat[234] |int |uint )/.test(l));
    if (!statements.length) return null;
    const decls = lines.filter((l) => language === "wgsl" ? /^var \w+ : /.test(l) : /^(vec[234]|float|mat[234]|int|uint) \w+;$/.test(l)).filter((l) => !/positionLocal|normalLocal|modelViewMatrix|v_positionView|v_modelViewProjection/.test(l));
    const used = decls.filter((d) => { const name = (d.match(language === "wgsl" ? /^var (\w+)/ : /(\w+);$/) || [])[1]; return name && statements.some((st) => new RegExp("\\b" + name + "\\b").test(st)); });
    const uniforms = [...new Set([...statements.join(" ").matchAll(language === "wgsl" ? /\bobject\.(\w+)/g : /\bv_(\w+)/g)].map((m) => m[1]))];
    const text = [...used, ...statements].join(" ");
    const reads = Object.keys(DEFAULT_LOCALS).filter((n) => new RegExp("\\b" + n + "\\b").test(text));
    return { statements, decls: used, uniforms, reads };
}
/**
 * Transplant an emitted fragment into a host shell. `shell` = { name, uniforms: [{ name, type }] (the shell's struct, in order --
 * the fragment's labelled uniforms must be among them), wgsl: { prefix (struct + bindings + helpers + VOut + the vertex stage),
 * uniformVar ("cam"), varyingParam ("v"), varyings: { uv: "v.local", normal: "v.n", color: "v.color" } }, glsl: { vertex, fragmentPrefix
 * (version, precision, uniforms, ins, out), varyings: { uv: "vLocal", normal: "vN", color: "vColor" } }, buffers, topology }.
 * Each language may name its own `locals` (v4325) -- what it calls three's positionLocal, normalLocal, position and normal --
 * and a shell that leaves one out (the sprite layout has no normal) refuses a displacement that reads it.
 * Returns a device pipeline descriptor. Refuses by name: a varying the shell does not carry, a uniform the shell's struct lacks, a texture.
 */
export function transplantIntoShell({ wgsl, glsl }, shell) {
    const desc = {};
    // v4323 -- ONE language is enough for the backend that emitted it: a page has one renderer and one device, both on the same
    // backend, so it emits the language it needs; the gate emits both. Neither is a refusal.
    const languages = ["wgsl", "glsl"].filter((l) => (l === "wgsl" ? wgsl : glsl));
    if (!languages.length) throw new Error("tslSource: transplantIntoShell needs the emitted { vertex, fragment } for wgsl or glsl");
    for (const language of languages) {
        const em = language === "wgsl" ? wgsl : glsl;
        if (typeof em.fragment !== "string" || typeof em.vertex !== "string") throw new Error(`tslSource: transplantIntoShell needs the emitted { vertex, fragment } for ${language}`);
        if (/\brender\./.test(em.fragment) || /cameraProjectionMatrix|modelViewMatrix/.test(em.fragment)) throw new Error("tslSource: the fragment reads camera or object matrices; a shell transplant carries only what its vertex stage passes");
        const uniforms = uniformFields(em.fragment, language), textures = textureNames(em.fragment, language);
        if (textures.length) throw new Error(`tslSource: a shell transplant carries no textures (the fragment samples ${textures.join(", ")})`);
        for (const u of uniforms) { const h = shell.uniforms.find((x) => x.name === u.name); if (!h) throw new Error(`tslSource: the fragment's uniform "${u.name}" is not in the shell "${shell.name}"'s struct (${shell.uniforms.map((x) => x.name).join(", ")})`); if (h.type !== u.type) throw new Error(`tslSource: uniform "${u.name}" is ${u.type} in the fragment and ${h.type} in the shell`); }
        const sem = varyingSemantics(em.vertex, language), S = shell[language];
        // the vertex stage: a displacement crosses only into a shell that says where ({{DISPLACE}} in its vertexTemplate)
        const disp = vertexDisplacement(em.vertex, language);
        let vertexText = null;
        if (disp) {
            if (!S.vertexTemplate || !S.vertexTemplate.includes("{{DISPLACE}}")) throw new Error(`tslSource: the graph moves vertices (a positionNode) and the shell "${shell.name}" has no {{DISPLACE}} in its vertex stage to take it`);
            for (const u of disp.uniforms) { if (/^nodeUniform\d+$/.test(u)) throw new Error(`tslSource: the vertex displacement reads an UNLABELLED uniform (${u}); label it`); const h = shell.uniforms.find((x) => x.name === u); if (!h) throw new Error(`tslSource: the displacement's uniform "${u}" is not in the shell "${shell.name}"'s struct`); }
            const locals = S.locals || DEFAULT_LOCALS;   // v4325: the shell's own names, so a shell without a normal refuses a displacement that reads one
            for (const n of disp.reads) if (!locals[n]) throw new Error(`tslSource: the displacement reads ${n}, which the shell "${shell.name}" does not carry (it carries ${Object.keys(locals).join(", ")})`);
            const rename = (t) => Object.keys(locals).sort((a, b) => b.length - a.length).reduce((acc, n) => acc.replace(new RegExp(`\\b${n}\\b`, "g"), locals[n]), t)
                .replace(language === "wgsl" ? /\bobject\.(\w+)/g : /\bv_(\w+)/g, language === "wgsl" ? `${S.uniformVar}.$1` : "$1");
            vertexText = S.vertexTemplate.replace("{{DISPLACE}}", [...disp.decls, ...disp.statements].map(rename).join("\n  "));
        } else if (S.vertexTemplate) vertexText = S.vertexTemplate.replace("{{DISPLACE}}", "");
        if (language === "wgsl") {
            const params = [...((em.fragment.match(/fn main\(([\s\S]*?)\)\s*->/) || [])[1] || "").matchAll(/@location\(\s*\d+\s*\)\s*(\w+)\s*:\s*([\w<>]+)/g)].map((m) => ({ name: m[1], type: m[2] }));
            const codes = (em.fragment.split("// codes")[1] || "").split("@fragment")[0].trim();
            const bodyAll = em.fragment.split("fn main(")[1]; let b = bodyAll.slice(bodyAll.indexOf("{") + 1, bodyAll.lastIndexOf("}"));
            b = b.replace(/output\.color\s*=\s*([^;]+);\s*return output;/, "return $1;");
            if (!/return /.test(b)) throw new Error("tslSource: the WGSL main() does not end in output.color = ...; return output;");
            for (const p of params) { const what = sem[p.name]; const to = what && S.varyings[what]; if (!to) throw new Error(`tslSource: the fragment reads varying ${p.name} (${what || "unknown"}), which the shell "${shell.name}" does not carry (it carries ${Object.keys(S.varyings).join(", ")})`); b = b.replace(new RegExp(`\\b${p.name}\\b`, "g"), to); }
            b = b.replace(/\bobject\.(\w+)/g, `${S.uniformVar}.$1`);
            const prefix = vertexText ? S.prefix.replace(S.vertexTemplate, vertexText) : S.prefix;
            if (vertexText && prefix === S.prefix) throw new Error("tslSource: the shell's prefix does not contain its own vertexTemplate, so the vertex could not be replaced");
            desc.wgsl = `// transplanted into the ${shell.name} shell from three's WGSL node builder by render/tslSource.mjs\n${prefix}\n${codes}\n@fragment fn fs(${S.varyingParam}: VOut) -> @location(0) vec4<f32> {${b}}\n`;
        } else {
            const ins = [...em.fragment.matchAll(/^in\s+\w+\s+(nodeVarying\d+);/gm)].map((m) => m[1]);
            const codes = (em.fragment.split("// codes")[1] || "").split("// structs")[0].trim();
            const bodyAll = em.fragment.split("void main()")[1]; let b = bodyAll.slice(bodyAll.indexOf("{") + 1, bodyAll.lastIndexOf("}"));
            if (!/fragColor\s*=/.test(b)) throw new Error("tslSource: the GLSL main() does not write fragColor");
            for (const n of ins) { const what = sem[n]; const to = what && S.varyings[what]; if (!to) throw new Error(`tslSource: the fragment reads varying ${n} (${what || "unknown"}), which the shell "${shell.name}" does not carry`); b = b.replace(new RegExp(`\\b${n}\\b`, "g"), to); }
            for (const u of uniforms) b = b.replace(new RegExp(`\\bf_${u.name}\\b`, "g"), u.name);
            desc.glsl = { vertex: vertexText || S.vertex, fragment: `${S.fragmentPrefix}\n${codes}\nvoid main() {${b}}\n` };
        }
    }
    return { shaders: { ...(desc.wgsl ? { wgsl: desc.wgsl } : {}), ...(desc.glsl ? { glsl: desc.glsl } : {}) }, vs: "vs", fs: "fs", buffers: shell.buffers, uniforms: shell.uniforms, ...(shell.topology ? { topology: shell.topology } : {}), shell: shell.name, languages, displaced: !!vertexDisplacement((wgsl || glsl).vertex, wgsl ? "wgsl" : "glsl") };
}
