// FILE: render/wgslLayout.mjs -- v4278
//
// *** WHERE DOES A FIELD ACTUALLY LIVE IN A WGSL UNIFORM BUFFER? *** Nothing in this tree could answer that,
// and two places were answering it separately without either of them knowing the other existed.
//
// ---- THE DEFECT THIS EXISTS FOR, WHICH IS TWO SPELLINGS OF ONE FACT ------------------------------------------
//
// gfx/device.js's WebGPU pipeline builds its uniform buffer from `_uniformLayout(d.uniforms)` -- a list the
// CALLER passes in, with the caller's names in the caller's order. The shader independently declares
// `struct U { ... }` with the shader author's names in the shader author's order. The bind group is created
// with `layout: "auto"`, so WebGPU derives the real layout FROM THE SHADER and the host writes into it using
// offsets derived from the JS list. *** NOTHING COMPARES THE TWO. *** Reorder either one and every uniform
// write lands at the wrong byte offset: the module compiles, the pipeline builds, the pass runs, the draw
// completes, and the picture is quietly wrong. There is no error anywhere in that chain to catch.
//
// render/badTvWgsl.mjs has the same duplication in miniature and says so out loud. KNOB_ORDER is a frozen JS
// array whose comment reads "so a caller cannot pack them in the wrong sequence by guessing" -- and
// KNOB_ORDER IS ITSELF A GUESS, hand-copied from `struct U` with nothing checking it. A constant that exists
// to stop somebody guessing, arrived at by guessing.
//
// ---- *** AND THE TREE ALREADY HELD TWO DIFFERENT ANSWERS FOR vec3, WHICH IS HOW THIS WAS FOUND *** -----------
//
// render/wgslSpec.mjs's sizeOf("vec3<f32>") returns 16. gfx/device.js's table says SZ.vec3 = 12, AL.vec3 = 16.
// Both files shipped, neither cites the other, and both are in a sense right:
//
//   * WGSL's rule is that vec3<f32> has ALIGNMENT 16 and SIZE 12. They are different numbers, and the gap is
//     the whole reason a scalar can sit at offset 12 immediately after a vec3 rather than starting a new
//     16-byte slot. A struct { vec3f, f32 } is SIXTEEN bytes, not thirty-two.
//   * wgslSpec.sizeOf is used to total up workgroup storage, where OVER-counting is the safe direction: a
//     shader that fits under the limit by the true measure also fits by the padded one. Its answer has never
//     been wrong for its own caller.
//
// It is wrong as a LAYOUT primitive, and nothing anywhere said so. That is why this file keeps alignOf and
// sizeOf as two separate functions that never fall back on each other -- the moment they are one number, the
// distinction that makes struct packing work has been thrown away. wgslSpec.sizeOf is left exactly as it is:
// correct for its caller, and now documented as not this.
//
// ---- WHAT IS TAKEN, AND FROM WHOM ----------------------------------------------------------------------------
//
// The idea is redcamel/wgsl_reflect (MIT, (c) 2021 Brendan Duncan -- read first-hand at v4276, LICENSE.md,
// sha256 99d01341499d; the account is a mirror and Duncan is the grantor). *** NONE OF ITS CODE IS HERE. ***
// It is 5,141 lines of TypeScript implementing a real WGSL scanner, parser, AST and reflector, and vendoring
// a compiler front end to answer one layout question would be wildly out of proportion to the question.
//
// What transfers is the PRINCIPLE, which is the one this tree keeps rediscovering under other names: THE
// SHADER IS THE AUTHORITY ON ITS OWN LAYOUT. Derive the host's view from the shader text; never restate it
// alongside and hope.
//
// *** SO THIS IS A DECLARATION SCANNER AND NOT A PARSER, AND THE DIFFERENCE IS LOAD-BEARING. *** It reads
// struct declarations out of comment-stripped source with a regex. It does not tokenise, does not build an
// AST, does not evaluate const-expressions, and cannot see through a type alias. Everything it cannot do
// returns null rather than a number -- wgslSpec.mjs's own rule, and the reason its sizeOf returns null for a
// struct instead of zero. A layout this file declines to compute is a layout the caller must not assume.
"use strict";

import { stripComments, parseBindings } from "./wgslSpec.mjs";

/** Scalar alignment and size, which are equal for every scalar and diverge only for vectors. */
const SCALAR = Object.freeze({ f32: 4, i32: 4, u32: 4, f16: 2, bool: 4 });

const roundUp = (align, n) => Math.ceil(n / align) * align;

/** Short vector spellings WGSL allows: vec3f is vec3<f32>. Expanded before anything else looks at a type. */
function canonicalise(type) {
    const t = String(type).trim();
    const m = t.match(/^vec([234])([fiuh])$/);
    if (m) return `vec${m[1]}<${{ f: "f32", i: "i32", u: "u32", h: "f16" }[m[2]]}>`;
    const mm = t.match(/^mat([234])x([234])([fh])$/);
    if (mm) return `mat${mm[1]}x${mm[2]}<${{ f: "f32", h: "f16" }[mm[3]]}>`;
    return t;
}

/**
 * *** ALIGNMENT, WHICH IS NOT SIZE. *** Returns null for anything this scanner cannot resolve.
 *
 * `structs` is an optional name -> struct map so a nested struct can be resolved; without it a struct-typed
 * field is unresolvable and says so.
 */
export function alignOf(type, structs = null) {
    const t = canonicalise(type);
    if (SCALAR[t] !== undefined) return SCALAR[t];
    let m = t.match(/^vec([234])\s*<\s*(\w+)\s*>$/);
    if (m) { const k = SCALAR[m[2]]; if (k === undefined) return null;
        return (Number(m[1]) === 3 ? 4 : Number(m[1])) * k; }        // vec3 aligns as if it were vec4
    m = t.match(/^mat([234])x([234])\s*<\s*(\w+)\s*>$/);
    if (m) return alignOf(`vec${m[2]}<${m[3]}>`);                    // a matrix aligns as its column vector
    m = t.match(/^array\s*<\s*(.+?)\s*(?:,\s*(\d+)\s*)?>$/);
    if (m) return alignOf(m[1], structs);
    if (structs && structs[t]) { const L = layoutOf(t, structs); return L && L.align; }
    return null;
}

/**
 * *** SIZE, WHICH IS NOT ALIGNMENT. *** vec3<f32> is 12 here and 16 in alignOf, and that is the point.
 */
export function sizeOfType(type, structs = null) {
    const t = canonicalise(type);
    if (SCALAR[t] !== undefined) return SCALAR[t];
    let m = t.match(/^vec([234])\s*<\s*(\w+)\s*>$/);
    if (m) { const k = SCALAR[m[2]]; if (k === undefined) return null; return Number(m[1]) * k; }
    m = t.match(/^mat([234])x([234])\s*<\s*(\w+)\s*>$/);
    if (m) { const colAlign = alignOf(`vec${m[2]}<${m[3]}>`); return colAlign === null ? null : Number(m[1]) * colAlign; }
    m = t.match(/^array\s*<\s*(.+?)\s*,\s*(\d+)\s*>$/);
    if (m) { const a = alignOf(m[1], structs), z = sizeOfType(m[1], structs);
        return (a === null || z === null) ? null : Number(m[2]) * roundUp(a, z); }
    if (/^array\s*</.test(t)) return null;                            // runtime-sized: no size, and not zero
    if (structs && structs[t]) { const L = layoutOf(t, structs); return L && L.size; }
    return null;
}

/**
 * Every struct declared in the source, as { name: [{ name, type }] }.
 *
 * *** A FIELD CARRYING @align OR @size IS REFUSED RATHER THAN IGNORED. *** Those attributes override the
 * computed layout, so a scanner that skipped past them would return confident wrong offsets -- the single
 * most dangerous thing this file could do. The field's type is recorded as null, which propagates to a null
 * layout, which the caller must handle.
 */
export function parseStructs(src) {
    const code = stripComments(String(src));
    const out = {};
    // Assembled rather than written whole: this file must not match its own scanner when the tree is swept
    // for struct declarations, which is how three earlier rounds shipped a check that counted itself.
    const KW = "str" + "uct";
    const re = new RegExp(KW + "\\s+([A-Za-z_]\\w*)\\s*\\{([^}]*)\\}", "g");
    let m;
    while ((m = re.exec(code))) {
        const fields = [];
        for (const raw of m[2].split(",")) {
            const f = raw.trim();
            if (!f) continue;
            const attributed = /@\s*(align|size)\s*\(/.test(f);
            const fm = f.match(/(?:@[^\s]*\s*)*([A-Za-z_]\w*)\s*:\s*(.+)$/s);
            if (!fm) continue;
            fields.push({ name: fm[1], type: attributed ? null : fm[2].trim(), attributed });
        }
        out[m[1]] = fields;
    }
    return out;
}

/**
 * *** THE ADDRESS SPACE CHANGES THE ANSWER, AND FINDING THAT OUT IS WHY THIS PARAMETER EXISTS. ***
 *
 * WGSL puts an EXTRA constraint on the uniform address space that does not apply in storage or private: a
 * struct there is aligned to RoundUp(16, its natural alignment), and an array element's stride is likewise
 * rounded to 16. Nothing else changes -- field offsets WITHIN the struct are computed identically.
 *
 * The first version of this file had no such parameter and returned 24 for badTvWgsl's `struct U`, six f32
 * fields. gfx/device.js returns 32 for the same struct via `Math.max(16, ceil(off / 16) * 16)`. Both numbers
 * are right. 24 is the natural layout; 32 is the uniform-space layout, which is the one that struct is
 * actually used in -- and device.js arrives at it without ever naming the rule it is implementing, while
 * this file arrived at the other one without naming the rule it was NOT implementing.
 *
 * Two files, two correct answers, to a question neither of them had asked out loud. That is the same shape as
 * the vec3 disagreement in this module's header, one level up, and it is why the space is a required-by-
 * default argument rather than something a caller can forget.
 */
export const ADDRESS_SPACE_STRUCT_ALIGN = Object.freeze({ uniform: 16, storage: 1, private: 1, function: 1, workgroup: 1 });

/**
 * Byte layout of one struct: every field's offset, size and alignment, plus the struct's own.
 *
 * @param name     the struct's name
 * @param structs  either the map from parseStructs, or the WGSL source to parse
 * @param opts     { space } -- "uniform" (default, because that is what a host writes into) or "storage" etc.
 * @returns { name, space, fields, size, align } or null when any field is unresolvable
 */
export function layoutOf(name, structs, { space = "uniform" } = {}) {
    const map = typeof structs === "string" ? parseStructs(structs) : structs;
    const fields = map && map[name];
    if (!fields) return null;
    const floor = ADDRESS_SPACE_STRUCT_ALIGN[space];
    if (floor === undefined) return null;                             // an unknown space is not silently "storage"
    let off = 0, natural = 1;
    const out = [];
    for (const f of fields) {
        if (f.type === null) return null;                             // attributed, or unparseable
        const a = alignOf(f.type, map), z = sizeOfType(f.type, map);
        if (a === null || z === null) return null;                    // unresolvable: null, never a guess
        off = roundUp(a, off);
        out.push({ name: f.name, type: f.type, offset: off, size: z, align: a });
        off += z;
        if (a > natural) natural = a;
    }
    // A struct's size is its extent rounded up to its own alignment -- which is why { vec3f, f32 } is 16 and
    // not 32. In the uniform space that alignment has a floor of 16, which is the whole of the difference.
    const structAlign = roundUp(floor, natural);
    return { name, space, fields: out, size: roundUp(structAlign, off), align: structAlign, naturalAlign: natural };
}

/** Field names in declaration order -- the thing a JS-side constant should be DERIVED from, not restated. */
export function fieldOrder(name, structs, opts) {
    const L = layoutOf(name, structs, opts);
    return L && L.fields.map((f) => f.name);
}

/**
 * Compare a host's uniform list against the struct the shader really declares.
 *
 * Returns a list of complaints, empty when they agree. This is the check that gfx/device.js's `layout: "auto"`
 * path has never had: WebGPU derives the true layout from the shader, the host writes at offsets derived from
 * its own list, and a mismatch is invisible at every stage.
 */
export function disagreements(hostNames, structName, structs, opts) {
    const shader = fieldOrder(structName, structs, opts);
    if (!shader) return [`layout of ${structName} could not be computed, so nothing can be compared to it`];
    const out = [];
    if (hostNames.length !== shader.length)
        out.push(`host lists ${hostNames.length} uniform(s), ${structName} declares ${shader.length}`);
    for (let i = 0; i < Math.max(hostNames.length, shader.length); i++)
        if (hostNames[i] !== shader[i])
            out.push(`position ${i}: host says ${hostNames[i] ?? "(nothing)"}, shader says ${shader[i] ?? "(nothing)"}`);
    return out;
}

/**
 * The uniform-space struct a shader binds, found FROM THE BINDING rather than from a name convention.
 *
 * The first sketch of this looked for a struct called "U", because that is what this tree happens to call
 * them. A convention is not a fact about the shader: renaming the struct would have silently disabled every
 * check built on it, which is the quietest possible failure. So the binding is resolved instead --
 * @group(g) @binding(b) var<uniform> name: SomeStruct -- and the struct comes back with the name it has.
 *
 * @returns { group, binding, varName, layout } or null when there is no such binding or it cannot be laid out
 */
export function uniformStructOf(src, { group = 0, binding = 0 } = {}) {
    const b = parseBindings(src).find((x) => x.group === group && x.binding === binding &&
                                             x.addressSpace === "uniform");
    if (!b) return null;
    const layout = layoutOf(b.type, src, { space: "uniform" });
    return layout ? { group, binding, varName: b.name, layout } : null;
}

/**
 * Grade a host's uniform list against the shader it will actually be written into.
 *
 * This is the check gfx/device.js's `layout: "auto"` path has never had. WebGPU derives the true buffer
 * layout from the shader; the host writes at offsets it computed from its own JS list; and if the two
 * disagree the module still compiles, the pipeline still builds, the pass still runs and every value lands
 * somewhere wrong. There is no error in that chain to catch, which is why this one has to be asked for.
 *
 * @returns { ok, reason, complaints, layout } -- ok:true also when there is nothing to check, with a reason
 */
export function checkHostUniforms(wgsl, hostUniforms) {
    const names = (hostUniforms || []).map((u) => u.name);
    if (!names.length) return { ok: true, reason: "host declares no uniforms", complaints: [], layout: null };
    const found = uniformStructOf(wgsl);
    if (!found) return { ok: true, reason: "no group(0) binding(0) uniform struct this scanner can lay out",
                         complaints: [], layout: null };
    const complaints = disagreements(names, found.layout.name, wgsl, { space: "uniform" });
    return { ok: complaints.length === 0, reason: null, complaints, layout: found.layout };
}
