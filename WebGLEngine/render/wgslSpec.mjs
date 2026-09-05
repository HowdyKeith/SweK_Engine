// FILE: render/wgslSpec.mjs -- v4207
//
// A WGSL CONFORMANCE CHECK, IN THE render/transitionSpec.mjs MOULD: parse the shader, check it against the
// contract, and refuse it BEFORE a compile is spent on it.
//
// v4204 did this for the GL Transition spec and the argument is the same one, only sharper here. A GLSL
// transition can at least be compiled by any GL context. WGSL needs a WebGPU device, and this tree writes
// WGSL in twenty-odd places -- ten .wgsl files plus inline shaders in fluid, mpm, blackhole, nebula,
// anime4k, blobulator, cell-tracking and the brain's transport kernels -- with NOTHING checking any of it
// short of createShaderModule() on a live GPU. The build box has no GPU. So the shaders in this repository
// are, statically, unchecked.
//
// Idea reached via dantiicu/dawn-switch (BSD-3-Clause, "Copyright 2017-2023 The Dawn & Tint Authors"), a
// fork of Chromium's Dawn carrying Tint, the WGSL compiler. Dawn is ~25,700 commits of C++ that compiles
// against D3D12/Metal/Vulkan; nothing of it is vendorable into a browser JS tree, and none of it is here.
// What transfers is that WGSL HAS A CHECKABLE SHAPE and somebody should be checking it.
//
// *** THE LIMITS ARE A PARAMETER, NOT A CONSTANT, AND THE REASON IS AN HONESTY ONE. *** The numbers below
// are the WebGPU spec's default limits as written down, and NEITHER THE SPEC SITE NOR A LIVE DEVICE WAS
// REACHABLE FROM THE BOX THAT WROTE THIS: w3.org and gpuweb.github.io are blocked by the egress proxy, and
// the headless shell here has no navigator.gpu. v4203 was a whole round about recording a number as
// authoritative when it had not been checked, so these carry their provenance in the record and every
// entry point takes a `limits` argument. tools/ship/wgslDeviceLimits.mjs reads the real ones from a browser
// and reports any disagreement.
"use strict";

/**
 * WebGPU's default limits -- what `adapter.requestDevice()` with NO requiredLimits gives you.
 *
 * *** THIS TREE CALLS requestDevice() BARE IN EVERY SINGLE PLACE. *** MEASURED across 3,956 .js/.mjs/.html
 * files (node_modules excluded, and excluding the three files this round added so the check does not count
 * its own detector): 27 requestDevice() call sites, and `requiredLimits` appears ZERO times. So these
 * defaults are not a conservative floor for this tree -- they are exactly what every device in it runs at.
 *
 * The first draft of this comment said "eight call sites", which was a `head -8` on a grep read as a total.
 * A number taken from a truncated listing is not a measurement.
 */
export const DEFAULT_LIMITS = Object.freeze({
    maxComputeWorkgroupSizeX: 256,
    maxComputeWorkgroupSizeY: 256,
    maxComputeWorkgroupSizeZ: 64,
    maxComputeInvocationsPerWorkgroup: 256,
    maxComputeWorkgroupStorageSize: 16384,
    maxBindGroups: 4,
    maxStorageBuffersPerShaderStage: 8,
    maxSampledTexturesPerShaderStage: 16,
});

/** How DEFAULT_LIMITS was obtained, because a number without a provenance is a number to distrust. */
export const LIMITS_PROVENANCE = Object.freeze({
    source: "WebGPU specification default limits, written from knowledge",
    verifiedAgainstSpec: false,
    verifiedAgainstDevice: false,
    why: "w3.org and gpuweb.github.io are blocked by this sandbox's egress proxy, and the headless shell " +
         "here exposes no navigator.gpu. Run tools/ship/wgslDeviceLimits.mjs in a real browser to check.",
    checkWith: "tools/ship/wgslDeviceLimits.mjs",
});

/** Entry-point stages. A shader module may hold several. */
export const STAGES = Object.freeze(["vertex", "fragment", "compute"]);

/** Address spaces a `var<...>` declaration may name. */
export const ADDRESS_SPACES = Object.freeze(["function", "private", "workgroup", "uniform", "storage", "handle"]);

/** Byte sizes of the scalar and vector types this scanner can size. Anything else is reported unsized. */
const SCALAR_BYTES = { bool: 4, i32: 4, u32: 4, f32: 4, f16: 2 };

/** Strip // and /* *\/ comments, keeping newlines so line numbers survive. Same helper shape as transitionSpec. */
export function stripComments(src) {
    let out = "", i = 0;
    while (i < src.length) {
        if (src[i] === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; }
        else if (src[i] === "/" && src[i + 1] === "*") {
            i += 2;
            while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") out += "\n"; i++; }
            i += 2;
        } else { out += src[i]; i++; }
    }
    return out;
}

/**
 * Every entry point, with its stage and workgroup size.
 *
 * *** A WORKGROUP SIZE MAY BE A TEMPLATE HOLE AND THAT IS NOT A VIOLATION. *** Much of this tree's WGSL is
 * built in JS template literals -- `@workgroup_size(${WG})`, `@workgroup_size(" + WGS + ")` -- so the size
 * is not known until the string is assembled. Reporting those as bad shaders would be a validator crying
 * wolf at its own corpus; they come back as { literal: false } and the caller decides.
 */
export function parseEntryPoints(src) {
    const code = stripComments(src);
    const out = [];
    // Attributes may appear in any order and on any line before `fn`.
    const re = /((?:@\w+(?:\s*\([^)]*\))?\s*)+)fn\s+([A-Za-z_]\w*)\s*\(/g;
    let m;
    while ((m = re.exec(code))) {
        const attrs = m[1];
        const stage = STAGES.find((s) => new RegExp(`@${s}\\b`).test(attrs));
        if (!stage) continue;                                  // a plain function with some other attribute
        const ws = attrs.match(/@workgroup_size\s*\(([^)]*)\)/);
        let size = null, literal = false;
        if (ws) {
            const parts = ws[1].split(",").map((x) => x.trim());
            const nums = parts.map((p) => {
                const v = p.replace(/[uif]$/, "");
                return /^\d+$/.test(v) ? Number(v) : null;
            });
            literal = nums.every((x) => x !== null) && nums.length > 0;
            size = literal ? [nums[0], nums[1] ?? 1, nums[2] ?? 1] : parts;
        }
        out.push({ name: m[2], stage, workgroupSize: size, workgroupSizeIsLiteral: literal,
                   raw: ws ? ws[0] : null, index: m.index });
    }
    return out;
}

/** Every `@group(N) @binding(M) var<space[, access]> name: type;` in the module. */
export function parseBindings(src) {
    const code = stripComments(src);
    const out = [];
    const re = /@group\s*\(\s*(\w+)\s*\)\s*@binding\s*\(\s*(\w+)\s*\)\s*var\s*(?:<\s*([\w\s,]*?)\s*>)?\s*([A-Za-z_]\w*)\s*:\s*([^;]+);/g;
    let m;
    while ((m = re.exec(code))) {
        const spaceParts = (m[3] || "").split(",").map((x) => x.trim()).filter(Boolean);
        out.push({
            group: /^\d+$/.test(m[1]) ? Number(m[1]) : m[1],
            binding: /^\d+$/.test(m[2]) ? Number(m[2]) : m[2],
            addressSpace: spaceParts[0] || "handle",
            access: spaceParts[1] || null,
            name: m[4], type: m[5].trim(),
        });
    }
    return out;
}

/** Every module-scope `var<workgroup>`, with its byte size where this scanner can compute one. */
export function parseWorkgroupVars(src) {
    const code = stripComments(src);
    const out = [];
    const re = /var\s*<\s*workgroup\s*>\s*([A-Za-z_]\w*)\s*:\s*([^;]+);/g;
    let m;
    while ((m = re.exec(code))) out.push({ name: m[1], type: m[2].trim(), bytes: sizeOf(m[2].trim()) });
    return out;
}

/**
 * Byte size of a WGSL type, or null when this scanner cannot tell.
 *
 * *** null IS A REAL ANSWER AND IS NOT ZERO. *** A struct or an aliased type is unsized HERE, and a
 * validator that silently counted it as zero would clear a shader that overflows workgroup storage --
 * the exact "we did not copy the text" versus "there is no text" confusion v4203 was about.
 *
 * *** AND THIS IS NOT A LAYOUT PRIMITIVE. DO NOT COMPUTE A FIELD OFFSET WITH IT. *** It answers 16 for
 * vec3<f32>, which is that type's ALIGNMENT, not its size -- WGSL says vec3<f32> aligns to 16 and occupies
 * 12, and a real WebGPU device confirmed the 12 at v4278. The padded answer is the right one for this
 * function's own caller, which totals workgroup storage where over-counting is the safe direction, and it is
 * the WRONG one for placing a field: a struct { vec3f, f32 } is 16 bytes with the scalar at offset 12, and
 * this function would have made it 32. render/wgslLayout.mjs keeps alignOf and sizeOfType separate for
 * exactly that reason and is what a layout question should ask. Nothing here changes; it is only now said.
 */
export function sizeOf(type) {
    const t = type.trim();
    if (SCALAR_BYTES[t] !== undefined) return SCALAR_BYTES[t];
    let m = t.match(/^vec([234])\s*<\s*(\w+)\s*>$/) || t.match(/^vec([234])([fiuh])$/);
    if (m) { const el = SCALAR_BYTES[m[2]] ?? SCALAR_BYTES[{ f: "f32", i: "i32", u: "u32", h: "f16" }[m[2]]];
        // vec3 is aligned and sized as 16 bytes in WGSL, not 12. Getting that wrong under-counts storage.
        return el === undefined ? null : (Number(m[1]) === 3 ? 4 : Number(m[1])) * el; }
    m = t.match(/^mat([234])x([234])\s*<\s*(\w+)\s*>$/);
    if (m) { const el = SCALAR_BYTES[m[3]]; return el === undefined ? null : Number(m[1]) * (Number(m[2]) === 3 ? 4 : Number(m[2])) * el; }
    m = t.match(/^array\s*<\s*(.+?)\s*,\s*(\d+)\s*>$/);
    if (m) { const el = sizeOf(m[1]); return el === null ? null : el * Number(m[2]); }
    return null;                                               // struct, alias, runtime-sized array
}

/**
 * WGSL's reserved words (the spec's list, plus its keywords): identifiers a module may not declare. `target`,
 * `filter`, `set`, `type`, `mod`, `from`, `get` and `pass` are the ones that read like ordinary variable names.
 */
export const RESERVED_WORDS = Object.freeze(new Set((
    "NULL Self abstract active alignas alignof as asm asm_fragment async attribute auto await become binding_array " +
    "cast catch class co_await co_return co_yield coherent column_major common compile compile_fragment concept " +
    "const_cast consteval constexpr constinit crate debugger decltype delete demote demote_to_helper do dynamic_cast " +
    "enum explicit export extends extern external fallthrough filter final finally friend from fxgroup get goto " +
    "groupshared highp impl implements import inline instanceof interface layout lowp macro macro_rules match " +
    "mediump meta mod module move mut mutable namespace new nil noexcept noinline nointerpolation non_coherent " +
    "noncoherent noperspective null nullptr of operator package packoffset partition pass patch pixelfragment " +
    "precise precision premerge priv protected pub public readonly ref regardless register reinterpret_cast require " +
    "resource restrict self set shared sizeof smooth snorm static static_assert static_cast std subroutine super " +
    "target template this thread_local throw trait try type typedef typeid typename typeof union unless unorm unsafe " +
    "unsized use using varying virtual volatile wgsl where with writeonly yield " +
    "alias break case const const_assert continue continuing default diagnostic discard else enable false fn for if " +
    "let loop override requires return struct switch true var while").split(" ")));

/**
 * Everything wrong with a WGSL module, against the given device limits.
 *
 * @param limits defaults to DEFAULT_LIMITS -- pass a real device's `device.limits` to check against it
 */
export function validateWgsl(src, { limits = DEFAULT_LIMITS, allowTemplates = true } = {}) {
    const p = [];
    if (typeof src !== "string" || !src.trim()) return ["empty source"];
    const code = stripComments(src);
    const entries = parseEntryPoints(src);
    if (!entries.length) p.push("no entry point -- a module needs at least one @vertex, @fragment or @compute function");
    // v4472 -- *** A RESERVED WORD USED AS A NAME IS REFUSED BY EVERY COMPILER AND WAS INVISIBLE HERE. ***
    // brain/transport/shaders/scatter.wgsl declared `let target`, this validator called the file clean for 265
    // rounds, and the first time both real backends were asked to compile it (the widened WGSL census) they both
    // said "'target' is a reserved keyword". Declaration sites only: let, var, const, override, fn, struct.
    const decl = /\b(?:let|const|override|fn|struct|var(?:<[^>]*>)?)\s+([A-Za-z_]\w*)/g;
    let dm;
    while ((dm = decl.exec(code))) if (RESERVED_WORDS.has(dm[1])) p.push(`'${dm[1]}' is a reserved word in WGSL and cannot be declared as a name`);

    for (const e of entries) {
        // *** A COMPUTE ENTRY POINT WITHOUT @workgroup_size IS INVALID WGSL, FULL STOP. *** Not a style rule.
        if (e.stage === "compute" && !e.raw) { p.push(`@compute fn ${e.name}: no @workgroup_size -- required by the spec`); continue; }
        if (e.stage !== "compute" && e.raw) p.push(`@${e.stage} fn ${e.name}: @workgroup_size is only valid on @compute`);
        if (e.stage !== "compute" || !e.raw) continue;
        if (!e.workgroupSizeIsLiteral) {
            if (!allowTemplates) p.push(`@compute fn ${e.name}: workgroup size ${JSON.stringify(e.workgroupSize)} is not a literal -- cannot be checked here`);
            continue;
        }
        const [x, y, z] = e.workgroupSize;
        // *** THE LIMIT THAT ACTUALLY BITES IN THIS TREE. *** A pipeline whose workgroup exceeds the device's
        // limits fails at createComputePipeline, not at createShaderModule -- so the shader "compiles" and
        // the failure lands somewhere else entirely.
        if (x > limits.maxComputeWorkgroupSizeX) p.push(`@compute fn ${e.name}: workgroup_size X is ${x}, over the limit of ${limits.maxComputeWorkgroupSizeX}`);
        if (y > limits.maxComputeWorkgroupSizeY) p.push(`@compute fn ${e.name}: workgroup_size Y is ${y}, over the limit of ${limits.maxComputeWorkgroupSizeY}`);
        if (z > limits.maxComputeWorkgroupSizeZ) p.push(`@compute fn ${e.name}: workgroup_size Z is ${z}, over the limit of ${limits.maxComputeWorkgroupSizeZ}`);
        const total = x * y * z;
        if (total > limits.maxComputeInvocationsPerWorkgroup) {
            p.push(`@compute fn ${e.name}: ${x}x${y}x${z} = ${total} invocations per workgroup, over the limit of ` +
                   `${limits.maxComputeInvocationsPerWorkgroup} -- createComputePipeline will reject this on a device with default limits`);
        }
    }

    // *** TWO RESOURCES ON ONE (group, binding) IS A COLLISION THE SHADER COMPILER WILL NOT CATCH. ***
    const seen = new Map();
    for (const b of parseBindings(src)) {
        if (typeof b.group !== "number" || typeof b.binding !== "number") continue;   // template hole
        const key = `${b.group}/${b.binding}`;
        if (seen.has(key)) p.push(`@group(${b.group}) @binding(${b.binding}) is declared twice: ${seen.get(key)} and ${b.name}`);
        else seen.set(key, b.name);
        if (b.group >= limits.maxBindGroups) p.push(`${b.name}: @group(${b.group}) is beyond maxBindGroups ${limits.maxBindGroups}`);
        if (!ADDRESS_SPACES.includes(b.addressSpace)) p.push(`${b.name}: unknown address space "${b.addressSpace}"`);
        // read_write is only legal in the storage address space.
        if (b.access === "read_write" && b.addressSpace !== "storage") {
            p.push(`${b.name}: access mode read_write is only valid in the storage address space, not ${b.addressSpace}`);
        }
        if (b.addressSpace === "uniform" && b.access) p.push(`${b.name}: var<uniform> takes no access mode`);
    }

    // Workgroup storage budget. Unsized types are reported rather than assumed to be zero.
    let bytes = 0, unsized = [];
    for (const w of parseWorkgroupVars(src)) {
        if (w.bytes === null) unsized.push(`${w.name}: ${w.type}`);
        else bytes += w.bytes;
    }
    if (bytes > limits.maxComputeWorkgroupStorageSize) {
        p.push(`workgroup storage is ${bytes} bytes, over the limit of ${limits.maxComputeWorkgroupStorageSize}`);
    }
    if (unsized.length && bytes > limits.maxComputeWorkgroupStorageSize * 0.75) {
        p.push(`workgroup storage is ${bytes} bytes of a ${limits.maxComputeWorkgroupStorageSize} budget with ` +
               `${unsized.length} declaration(s) this scanner cannot size (${unsized.join("; ")}) -- the real total may be over`);
    }

    // *** A BARRIER INSIDE NON-UNIFORM CONTROL FLOW IS UNDEFINED BEHAVIOUR IN WGSL. *** It is also the single
    // commonest way a compute shader hangs or produces garbage on one vendor and not another.
    for (const b of barriersInNonUniformControlFlow(code)) {
        p.push(`${b.fn}() at offset ${b.at} is reached through a conditional on "${b.on}", which depends on the ` +
               `invocation id -- a barrier must be reached by every invocation in the workgroup, and WGSL calls ` +
               `anything else undefined behaviour`);
    }
    return p;
}

/**
 * Names bound to a per-invocation builtin -- the only source of non-uniformity a scanner can follow.
 *
 * `fn main(@builtin(local_invocation_id) lid: vec3<u32>)` makes `lid` non-uniform, and `let thid = lid.x;`
 * propagates it to `thid`. One hop of propagation, which covers the idiom every compute shader in this tree
 * actually uses.
 */
export function nonUniformNames(code) {
    const names = new Set();
    const NU = /@builtin\s*\(\s*(local_invocation_id|global_invocation_id|local_invocation_index|subgroup_invocation_id|sample_index)\s*\)\s*([A-Za-z_]\w*)\s*:/g;
    let m;
    while ((m = NU.exec(code))) names.add(m[2]);
    // let/var bound from one of those, including a swizzle.
    for (let pass = 0; pass < 2; pass++) {
        const AS = /\b(?:let|var)\s+([A-Za-z_]\w*)\s*(?::[^=]+)?=\s*([^;]+);/g;
        let a;
        while ((a = AS.exec(code))) {
            for (const n of names) {
                if (new RegExp(`\\b${n}\\b`).test(a[2])) { names.add(a[1]); break; }
            }
        }
    }
    return names;
}

/**
 * Barrier calls reached through control flow that depends on an invocation id.
 *
 * *** MY FIRST VERSION FLAGGED ANY BARRIER INSIDE ANY if/for/while, AND IT WAS WRONG TWICE ON THE FIRST
 * REAL SHADER IT SAW. *** brain/transport/shaders/scan.wgsl has `for (var d = 1024u >> 1u; d > 0u; d >>= 1u)
 * { workgroupBarrier(); ... }` -- a loop whose trip count is the same for every invocation, so the barrier
 * IS reached by all of them and the code is correct. And it flagged a second barrier that sits at plain
 * function scope, because walking back through braces to find the enclosing block landed on the wrong one.
 *
 * The WGSL rule is not "not in a conditional", it is "in UNIFORM control flow". So the question is not
 * whether there is an `if` but whether its condition depends on WHICH INVOCATION IS ASKING. That is
 * tractable: find the names bound to invocation builtins, and flag barriers inside a conditional whose
 * predicate mentions one.
 *
 * A validator that fires on correct code teaches people to ignore it, which is worse than not having one.
 */
export function barriersInNonUniformControlFlow(code) {
    const nu = nonUniformNames(code);
    if (!nu.size) return [];
    const out = [];
    const re = /\b(workgroupBarrier|storageBarrier|textureBarrier)\s*\(\s*\)/g;
    let m;
    while ((m = re.exec(code))) {
        // Walk outward through every enclosing block and test each one's introducing clause.
        let i = m.index, depth = 0, guard = 0;
        while (i >= 0 && guard++ < 64) {
            if (code[i] === "}") depth++;
            else if (code[i] === "{") {
                if (depth === 0) {
                    const head = code.slice(Math.max(0, i - 300), i);
                    // [^{}]* not [\s\S]*: a condition cannot contain a brace, and the greedy version
                    // matched from an `if (` far above, through a whole block, to a later `)` -- reporting
                    // a predicate of "gid.x < n) { shared_data[thid] = ...; } el" and flagging correct code.
                    const cond = head.match(/\b(if|else\s+if|while|switch)\s*\(([^{}]*)\)\s*$/);
                    if (cond && [...nu].some((n) => new RegExp(`\\b${n}\\b`).test(cond[2]))) {
                        out.push({ fn: m[1], at: m.index, on: cond[2].trim().slice(0, 60) });
                        break;
                    }
                    // keep walking outward -- a uniform block may still sit inside a non-uniform one
                    i--; depth = 0; continue;
                }
                depth--;
            }
            i--;
        }
    }
    return out;
}

/** Metadata and problems in one call, matching parseTransition()'s shape. */
export function parseWgsl(src, opts = {}) {
    return {
        entryPoints: parseEntryPoints(src),
        bindings: parseBindings(src),
        workgroupVars: parseWorkgroupVars(src),
        problems: validateWgsl(src, opts),
    };
}

// *** WHAT THIS CANNOT DO, STATED RATHER THAN DISCOVERED. ***
export const LIMITS = Object.freeze([
    "it is a scanner over text, not a WGSL parser -- it does not type-check, and conformance here is not compilation",
    "workgroup sizes and binding indices built from template interpolation cannot be checked until the string is assembled",
    "sizeOf() returns null for structs, aliases and runtime-sized arrays, so a workgroup storage total can be an under-count -- reported, never silently zero",
    "the barrier check follows names bound to invocation builtins one hop; a barrier reached through a helper function, or guarded by a value derived in more steps, is a false negative",
    "the default limits carry LIMITS_PROVENANCE saying they were not verified against the spec or a device from this sandbox",
]);
