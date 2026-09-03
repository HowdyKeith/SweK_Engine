// WebGLEngine/render/tslSource.mjs -- v4320, v4322 (a transplant into ANY shell: a race look), v4323 (one language at a time; linear sampling), v4324 (the vertex stage: a position node), v4325 (the shell names its own locals: a second layout), v4326 (a texture crosses into a shell), v4331 (a COMPUTE pass crosses), v4336 (one that READS a buffer as well as writing one), v4337 (an ATOMIC one), v4338 (one with WORKGROUP-SHARED memory)
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
 * A shell may also list the `textures` its prefix binds (v4326); a texture the fragment samples that the shell does not
 * bind, or a sampled texture where the shell declares no `sampler`, refuses by name.
 * Returns a device pipeline descriptor. Refuses by name: a varying the shell does not carry, a uniform the shell's struct lacks.
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
        // v4326 -- a texture crosses when the SHELL declares it. The shell lists the names its own prefix binds
        // (`textures`), and the transplant keeps the fragment's name as it is, because the graph labelled the texture
        // node with the shell's binding name. One it does not bind is refused by name rather than left dangling: the
        // device reads the bindings out of the shader and would throw at draw with nothing bound to it.
        const carried = shell.textures || [];
        for (const t of textures) if (!carried.includes(t)) throw new Error(`tslSource: the fragment samples "${t}", which the shell "${shell.name}" does not bind (it binds ${carried.join(", ") || "no textures"})`);
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
            for (const t of textures) if (new RegExp(`\\b${t}_sampler\\b`).test(b)) {   // a SAMPLED texture needs the shell's own sampler; a textureLoad does not
                if (!S.sampler) throw new Error(`tslSource: the fragment samples "${t}" through a sampler and the shell "${shell.name}" declares none (a textureLoad graph needs no sampler; a filtered one does)`);
                b = b.replace(new RegExp(`\\b${t}_sampler\\b`, "g"), S.sampler);
            }
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
    return { shaders: { ...(desc.wgsl ? { wgsl: desc.wgsl } : {}), ...(desc.glsl ? { glsl: desc.glsl } : {}) }, vs: "vs", fs: "fs", buffers: shell.buffers, uniforms: shell.uniforms, ...(shell.topology ? { topology: shell.topology } : {}), ...(shell.textures && shell.textures.length ? { textures: shell.textures } : {}), shell: shell.name, languages, displaced: !!vertexDisplacement((wgsl || glsl).vertex, wgsl ? "wgsl" : "glsl") };
}

// ---- v4331: A COMPUTE PASS CROSSES ---------------------------------------------------------------------------------
/**
 * THE SHELL A COMPUTE TRANSPLANT LANDS IN: what gfx/device.js expects of a compute module. `storage` is the buffers
 * it will bind BY NAME (device.compute() reads the bindings out of the shader text and refuses one nothing is bound
 * to), `uniforms` the fields of its single uniform struct, `uniformVar` what the body calls it.
 *
 * v4336 -- each storage entry may say its `access`: "read_write" (the default) or "read". three emits every buffer it
 * touches as read_write whether the graph writes to it or not, so the shell is where read-only is stated, and the
 * transplant matches a generated buffer to a shell entry BY ROLE -- which of them the body assigns to -- rather than
 * by the order three happened to declare them in. (Measured: for a pass that reads one buffer and writes another,
 * three gave binding 0 to the one it WRITES -- so a shell that declares its INPUT first, as render/gpuDriven.mjs's
 * cull pass does, gets them backwards under a positional mapping. Sabotage U at v4336 measured that: 2 red, six
 * device errors from assigning a read-only binding. It went 0 red first, when the shell happened to list the written
 * buffer first and position and role agreed -- which is why the sentence names a shell shape and not a universal.)
 *
 * v4338 -- `shared` declares the pass's workgroup-scoped arrays: [{ name, element, length }] becomes
 * `var<workgroup> name: array<element, length>;`. three names its own WorkgroupArray_NNN, which is module-local and
 * binds to nothing, so nothing would break by carrying that name through -- and the shell names it anyway, because a
 * generated identifier in a shipped module is a name that changes when three does. The count, element and length
 * must match what the pass actually declared, or it is refused by name.
 *
 * v4337 -- an entry may also say `atomic: true`, which declares its elements as atomic<T>. An atomic buffer is one a
 * pass WRITES even though nothing assigns to it: the write is inside atomicAdd(&buf.value[i], ...), so the role
 * detector looks for that too. It is the shape the cull pass has -- an instanceCount every invocation may increment
 * at once -- and the only kind of write where dropping the atomic still compiles, still runs, and quietly undercounts.
 *
 * There is NO GLSL HALF, and that is not an omission. WebGL2 has no compute stage; gfx/device.js says so by name
 * (`compute() needs { wgsl } -- a compute pipeline is WGSL-only`), and the pair contract every other transplant in
 * this file is held to does not apply here because the pair does not exist.
 */
export function computeShell({ name = "compute", storage = [{ name: "out", element: "f32" }], shared = [], uniforms = [], uniformArrays = [], uniformVar = "u", workgroupSize = 64 } = {}) {
    // v4363 -- the STRUCT element. An entry may give `struct: { name, fields: [{ name, type, atomic }] }` instead of an
    // element, and the shell declares that struct itself. Two rules, both refusals rather than compiler errors:
    // the atomic belongs to a FIELD (array<Cmd> is not an atomic buffer, one of Cmd's members is), and two entries
    // naming one struct must declare the same fields, because a struct name in a module is one layout.
    const structDecls = [], seenStruct = new Map();
    for (const b of storage) {
        if (!b.struct) continue;
        const t = b.struct;
        if (!t.name || !Array.isArray(t.fields) || !t.fields.length) throw new Error(`tslSource: storage "${b.name}" says struct and gives no { name, fields } for the shell to declare`);
        if (b.atomic) throw new Error(`tslSource: storage "${b.name}" is a struct element, so the atomic belongs to a FIELD (fields: [{ name, type, atomic: true }]) and not to the buffer`);
        if (b.element) throw new Error(`tslSource: storage "${b.name}" gives both an element and a struct; the struct IS the element`);
        const text = `struct ${t.name} { ${t.fields.map((f) => `${f.name}: ${f.atomic ? `atomic<${f.type}>` : f.type}`).join(", ")} };`;
        const had = seenStruct.get(t.name);
        if (had === undefined) { seenStruct.set(t.name, text); structDecls.push(text); }
        else if (had !== text) throw new Error(`tslSource: two storage entries declare a different struct ${t.name}; one name is one layout`);
    }
    const elementOf = (b) => b.struct ? b.struct.name : (b.atomic ? `atomic<${b.element || "u32"}>` : (b.element || "f32"));
    const decls = [
        ...storage.map((b, i) => `struct ${b.name}Buf { value: array<${elementOf(b)}> };\n@group(0) @binding(${i}) var<storage, ${b.access === "read" ? "read" : "read_write"}> ${b.name}: ${b.name}Buf;`),
        ...(uniforms.length ? [`struct ${uniformVar}Struct { ${uniforms.map((u) => `${u.name}: ${Object.keys(WGSL_TYPES).find((k) => WGSL_TYPES[k] === u.type)}`).join(", ")} };\n@group(0) @binding(${storage.length}) var<uniform> ${uniformVar}: ${uniformVar}Struct;`] : []),
    ];
    // v4364 -- a UNIFORM whose element is a FIXED-SIZE ARRAY, which is what struct Cull's `planes: array<vec4<f32>, 6>`
    // is and what a storage buffer stood in for until now. three emits a TSL uniformArray() as its own uniform BINDING
    // rather than as a member of the scalar struct, so the shell declares it as one too -- a second uniform, not a field.
    const arrayDecls = uniformArrays.map((a, i) => `struct ${a.name}Buf { value: array<${a.element || "vec4<f32>"}, ${a.length}> };\n@group(0) @binding(${storage.length + (uniforms.length ? 1 : 0) + i}) var<uniform> ${a.name}: ${a.name}Buf;`);
    const sharedDecls = shared.map((w) => `var<workgroup> ${w.name}: array<${w.element || "u32"}, ${w.length}>;`);
    return { name, storage, shared, uniforms, uniformArrays, uniformVar, workgroupSize, structs: structDecls, prefix: [...sharedDecls, ...structDecls, ...decls, ...arrayDecls].join("\n") };
}

/**
 * Read a struct declaration out of a WGSL text as { name, type, atomic } fields, normalising the whitespace three
 * emits (`instanceCount : atomic< u32 >`). Used to hold the shell's declaration to the graph's own: a struct is a
 * LAYOUT, and two spellings under one name is the CPU and the module disagreeing about bytes with nothing to say so.
 */
export function readStructDecl(wgsl, name) {
    const m = new RegExp(`struct\\s+${name}\\s*\\{([^}]*)\\}`).exec(wgsl);
    if (!m) return null;
    return m[1].split(",").map((f) => f.trim()).filter(Boolean).map((f) => {
        const i = f.indexOf(":");
        const fname = f.slice(0, i).trim(), t = f.slice(i + 1).replace(/\s+/g, "");
        const a = /^atomic<(.+)>$/.exec(t);
        return { name: fname, type: a ? a[1] : t, atomic: !!a };
    });
}
/**
 * Transplant three's emitted COMPUTE shader into that shell. three writes its own storage buffers under generated
 * names (NodeBuffer_529), its uniforms in an objectStruct, and -- measured, not guessed -- an `enable subgroups;`
 * directive with a @builtin(subgroup_size) parameter it never uses, because its own renderer asks the adapter for
 * that feature and gfx/device.js does not. Left in, the device refuses the module. Both are dropped here.
 *
 * Returns { wgsl, storage, uniforms, workgroupSize }. Refuses by name: a shader that is not a compute one, a
 * storage buffer the shell does not name, an unlabelled uniform, a type the device's uniform list does not carry.
 */
export function transplantCompute(wgsl, shell) {
    if (typeof wgsl !== "string" || !wgsl.includes("Three.js")) throw new Error("tslSource: not a three.js node-system shader");
    const ENTRY = new RegExp("@" + "compute\\s+@workgroup_size\\(\\s*(\\d+)");
    const at = wgsl.match(ENTRY);
    if (!at) throw new Error("tslSource: that shader has no compute entry point (a fragment or vertex belongs in transplantIntoShell)");
    if (Number(at[1]) !== shell.workgroupSize) throw new Error(`tslSource: three emitted @workgroup_size(${at[1]}) and the shell "${shell.name}" says ${shell.workgroupSize}; the dispatch count is computed from one of them and they must agree`);
    const found = [...wgsl.matchAll(/var<storage,\s*read(?:_write)?>\s*(\w+)\s*:/g)].map((m) => m[1]);
    if (found.length !== shell.storage.length) throw new Error(`tslSource: the graph touches ${found.length} storage buffer(s) and the shell "${shell.name}" names ${shell.storage.length} (${shell.storage.map((b) => b.name).join(", ") || "none"})`);
    // v4336 -- BY ROLE, NOT BY ORDER: a generated buffer the body assigns to is a written one, the rest are read.
    // *** v4372 -- AND FOR THIRTY-SIX ROUNDS IT READ `==` AS AN ASSIGNMENT. *** The pattern ended in `\]\s*=`, so
    // a body that COMPARES a storage read -- `if ( masks.value[ p ] == 0u )` -- matched on the first `=` of the
    // `==` and the buffer was classified as WRITTEN. render/carveTsl.mjs is the first pass in this arc to test a
    // buffer's value inline instead of binding it to a var first, and it was refused by name: "the pass writes
    // masks and the shell declares it read". NOTHING EVER SHIPPED WRONG FROM THIS -- it refuses, loudly, rather
    // than mis-declaring a binding -- but it is the species versionPreflight's header names: a guard that fires
    // on legitimate work, which is the kind people learn to route around. `=(?!=)` is the whole fix, and the
    // optional [-+*/] catches a compound assignment the old pattern also missed. `>=`, `<=` and `!=` were never
    // at risk: their operator sits between the `]` and the `=`, where the old pattern allowed only whitespace.
    const written = found.filter((g) => new RegExp(`\\b${g}\\.value\\[[^\\]]*\\]\\s*[-+*/]?=(?!=)`).test(wgsl) || new RegExp(`atomic\\w+\\(\\s*&${g}\\.value\\[`).test(wgsl));
    const readOnly = found.filter((g) => !written.includes(g));
    const wantW = shell.storage.filter((b) => b.access !== "read"), wantR = shell.storage.filter((b) => b.access === "read");
    // v4363 -- BY NAME WHERE THE GRAPH GIVES ONE. A TSL storage node that was .label()ed is emitted under that label
    // instead of NodeBuffer_NNN, and then nothing has to be inferred. It matters more than it looks: three declares its
    // buffers in the order the BODY FIRST USES them, not the order the graph created them, so two read-only buffers of
    // the same element type are told apart by position alone -- measured, and it crossed the frustum planes with the
    // per-instance extras in exactly this pass. Role and order stay the fallback for a graph that names nothing, and
    // the roles are still checked here, by name, so the read-only guarantee is not traded away for the convenience.
    const named = found.filter((g) => shell.storage.some((b) => b.name === g));
    let rename;
    if (named.length && named.length !== found.length) throw new Error(`tslSource: the graph names ${named.length} of its ${found.length} storage buffers (${named.join(", ")}) and leaves the rest generated; label them all or none, because a half-named set is matched half by name and half by guess`);
    if (named.length === found.length && found.length) {
        for (const b of shell.storage) if (!found.includes(b.name)) throw new Error(`tslSource: the shell "${shell.name}" names "${b.name}" and the graph's named buffers are ${found.join(", ")}`);
        for (const g of found) {
            const want = shell.storage.find((b) => b.name === g);
            const isW = written.includes(g);
            if (isW && want.access === "read") throw new Error(`tslSource: the pass writes "${g}" and the shell "${shell.name}" declares it read`);
            if (!isW && want.access !== "read") throw new Error(`tslSource: the shell "${shell.name}" declares "${g}" read_write and the pass never writes it`);
        }
        rename = new Map(found.map((g) => [g, g]));
    } else {
        if (written.length !== wantW.length || readOnly.length !== wantR.length) throw new Error(`tslSource: the graph writes ${written.length} buffer(s) and reads ${readOnly.length}, and the shell "${shell.name}" declares ${wantW.length} read_write and ${wantR.length} read (${shell.storage.map((b) => `${b.name}:${b.access || "read_write"}`).join(", ")})`);
        rename = new Map([...written.map((g, i) => [g, wantW[i].name]), ...readOnly.map((g, i) => [g, wantR[i].name])]);
    }
    // an atomic buffer must be declared atomic on BOTH sides or the module will not compile: three writes atomicAdd(&b.value[i])
    // and WGSL takes that pointer only into an atomic<T>. A shell that forgot is refused here, by name, not by the compiler.
    for (const [g, name] of rename) {
        const isAtomic = new RegExp(`atomic\\w+\\(\\s*&${g}\\.value\\[`).test(wgsl);
        const want = shell.storage.find((b) => b.name === name);
        if (want.struct) {
            // v4363 -- a struct element carries its atomic on a MEMBER, so the agreement is per field and by name.
            const members = [...new Set([...wgsl.matchAll(new RegExp(`\\b${g}\\.value\\[[^\\]]*\\]\\.(\\w+)`, "g"))].map((m) => m[1]))];
            const atomicMembers = [...new Set([...wgsl.matchAll(new RegExp(`atomic\\w+\\(\\s*&${g}\\.value\\[[^\\]]*\\]\\.(\\w+)`, "g"))].map((m) => m[1]))];
            for (const mm of members) {
                const f = want.struct.fields.find((x) => x.name === mm);
                if (!f) throw new Error(`tslSource: the pass touches "${name}.${mm}" and the shell "${shell.name}"'s struct ${want.struct.name} has no such field (${want.struct.fields.map((x) => x.name).join(", ")})`);
                if (atomicMembers.includes(mm) && !f.atomic) throw new Error(`tslSource: the pass touches "${name}.${mm}" atomically and the shell "${shell.name}" declares that field ${f.type} rather than atomic<${f.type}>`);
                if (!atomicMembers.includes(mm) && f.atomic) throw new Error(`tslSource: the shell "${shell.name}" declares "${name}.${mm}" atomic and the pass reaches it plainly, which WGSL does not allow`);
            }
            if (isAtomic && !atomicMembers.length) throw new Error(`tslSource: the pass touches "${name}" atomically without naming a member, and its shell element is the struct ${want.struct.name}`);
        } else {
            if (isAtomic && !want.atomic) throw new Error(`tslSource: the pass touches "${name}" atomically and the shell "${shell.name}" does not declare it atomic (atomic: true)`);
            if (!isAtomic && want.atomic) throw new Error(`tslSource: the shell "${shell.name}" declares "${name}" atomic and the pass never touches it atomically`);
        }
    }
    // v4363 -- and the struct the SHELL declares must be the one the graph built, field for field. The transplant keeps
    // the shell's declaration and drops three's, so a difference here is not a compile error later: it is the CPU writing
    // one layout while the module reads another, silently, which is the whole reason the shell owns declarations at all.
    for (const b of shell.storage) {
        if (!b.struct) continue;
        const got = readStructDecl(wgsl, b.struct.name);
        const spell = (fs2) => fs2.map((f) => `${f.name}: ${f.atomic ? `atomic<${f.type}>` : f.type}`).join(", ");
        if (!got) throw new Error(`tslSource: the shell "${shell.name}" declares struct ${b.struct.name} for "${b.name}" and the graph's shader declares no such struct`);
        const wantF = b.struct.fields.map((f) => ({ name: f.name, type: String(f.type).replace(/\s+/g, ""), atomic: !!f.atomic }));
        const same = got.length === wantF.length && got.every((f, i) => f.name === wantF[i].name && f.type === wantF[i].type && f.atomic === wantF[i].atomic);
        if (!same) throw new Error(`tslSource: struct ${b.struct.name} is { ${spell(got)} } in the graph and { ${spell(wantF)} } in the shell "${shell.name}" -- one name, two layouts`);
    }
    // v4364 -- the uniform ARRAYS three declared, each its own binding: `struct nameBuf { value : array< T, N > }`.
    // Refused by name when the shell does not carry it, when the element or the length differ, or when the graph left
    // it unlabelled -- a uniform nothing can bind by name is a buffer the device will ask for and never be handed.
    const uaFound = wgsl.split("var<uniform>").slice(1).map((t) => t.split(":")[0].trim()).filter((n) => n !== "object");
    const wantUA = shell.uniformArrays || [];
    if (uaFound.length !== wantUA.length) throw new Error(`tslSource: the graph declares ${uaFound.length} uniform array(s) (${uaFound.join(", ") || "none"}) and the shell "${shell.name}" declares ${wantUA.length} (${wantUA.map((a) => a.name).join(", ") || "none"})`);
    for (const n of uaFound) {
        if (/^(NodeBuffer_|nodeUniform)/.test(n)) throw new Error(`tslSource: the graph carries an UNLABELLED uniform array (${n}); label it (uniformArray(v, "vec4").label("planes")) so the device can bind it by name`);
        const want = wantUA.find((a) => a.name === n);
        if (!want) throw new Error(`tslSource: the graph's uniform array "${n}" is not in the shell "${shell.name}" (${wantUA.map((a) => a.name).join(", ") || "none"})`);
        const decl = new RegExp(`struct\\s+${n}Struct\\s*\\{\\s*value\\s*:\\s*array<\\s*([^,]+?)\\s*,\\s*(\\d+)\\s*>`).exec(wgsl);
        if (!decl) throw new Error(`tslSource: the graph's uniform "${n}" is not a fixed-size array, and the shell "${shell.name}" declares it one`);
        if (decl[1].replace(/\s+/g, "") !== String(want.element || "vec4<f32>").replace(/\s+/g, "") || Number(decl[2]) !== Number(want.length))
            throw new Error(`tslSource: the graph's "${n}" is array<${decl[1]}, ${decl[2]}> and the shell "${shell.name}" says array<${want.element || "vec4<f32>"}, ${want.length}>`);
    }
    const uniforms = uniformFields(wgsl, "wgsl");
    for (const u of uniforms) { const h = shell.uniforms.find((x) => x.name === u.name); if (!h) throw new Error(`tslSource: the compute pass's uniform "${u.name}" is not in the shell "${shell.name}"'s struct (${shell.uniforms.map((x) => x.name).join(", ") || "none"})`); if (h.type !== u.type) throw new Error(`tslSource: uniform "${u.name}" is ${u.type} in the pass and ${h.type} in the shell`); }
    // v4338 -- the workgroup-scoped arrays. three declares them above its entry, in a "// locals" section this
    // transplant used to drop entirely -- which would have left the body naming an array nothing declared.
    const sharedFound = [...wgsl.matchAll(/var<workgroup>\s*(\w+)\s*:\s*array<\s*(\w+)\s*,\s*(\d+)\s*>/g)].map((m) => ({ name: m[1], element: m[2], length: Number(m[3]) }));
    const wantShared = shell.shared || [];
    if (sharedFound.length !== wantShared.length) throw new Error(`tslSource: the pass declares ${sharedFound.length} workgroup array(s) and the shell "${shell.name}" declares ${wantShared.length} (${wantShared.map((w) => w.name).join(", ") || "none"})`);
    sharedFound.forEach((f, i) => { const w = wantShared[i];
        if ((w.element || "u32") !== f.element || Number(w.length) !== f.length) throw new Error(`tslSource: the pass's workgroup array is array<${f.element}, ${f.length}> and the shell "${shell.name}" says array<${w.element || "u32"}, ${w.length}>`); });
    const bodyAll = wgsl.slice(wgsl.indexOf(at[0]));
    let entry = bodyAll.slice(bodyAll.indexOf("fn main("));
    // three asks for a WGSL extension the device never requested, and takes a builtin only that extension defines
    entry = entry.replace(/,?\s*@builtin\(\s*subgroup_size\s*\)\s*\w+\s*:\s*u32/g, "");
    let b = entry;
    for (const [g, name] of rename) b = b.replace(new RegExp(`\\b${g}\\b`, "g"), name);
    sharedFound.forEach((f, i) => { b = b.replace(new RegExp(`\\b${f.name}\\b`, "g"), wantShared[i].name); });
    b = b.replace(/\bobject\.(\w+)/g, `${shell.uniformVar}.$1`);
    const code = `// transplanted from three's WGSL compute builder by render/tslSource.mjs\nvar<private> instanceIndex : u32;\n${shell.prefix}\n@` + `compute @workgroup_size(${shell.workgroupSize})\n${b}`;
    return { wgsl: code, shared: wantShared.map((w) => w.name), storage: shell.storage.map((b2) => b2.name), reads: wantR.map((b2) => b2.name), writes: wantW.map((b2) => b2.name), uniforms, uniformArrays: wantUA.map((a) => a.name), workgroupSize: shell.workgroupSize, shell: shell.name };
}
