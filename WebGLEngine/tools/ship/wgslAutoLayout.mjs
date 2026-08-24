// WebGLEngine/tools/ship/wgslAutoLayout.mjs -- v3980
//
// WHAT `layout: "auto"` ACTUALLY DERIVES, WHICH IS NOT WHAT THE DECLARATIONS SAY.
//
// A WebGPU default (auto) pipeline layout is built from the entry point's RESOURCE INTERFACE, and WGSL defines
// that as the resource variables STATICALLY ACCESSED by the entry point -- that is, reachable through its
// transitive call graph. A `@group(0) @binding(0) var<uniform> P : Params;` that the entry point never reads,
// directly or through a function it calls, IS NOT IN THE LAYOUT. It is not an unused-but-present slot; the slot
// does not exist, and createBindGroup fails on it with "binding index 0 not present in the bind group layout".
//
// That is invisible when shaders are ASSEMBLED BY CONCATENATION, which is how every WebGPU page in this tree
// builds them: a shared COMMON prefix declares the uniform and defines helpers that use it, then each stage
// appends its own bindings and its own main(). Reading the source of one stage, binding 0 is right there at the
// top and looks used -- by ui()/vi()/ci(), a few lines below it. But if that stage's main() calls none of those
// helpers, the helpers are unreachable, P is unreachable with them, and binding 0 silently leaves the layout
// while the JS that fills the bind group still counts from zero. The declaration and the interface disagree,
// and only the GPU ever says so.
//
// *** THIS SHIPPED. fluid-webgpu.html's `normalize` stage indexes u/v with arrayLength() and plain arithmetic
// and so never touches P; every other stage in that file reads P.nx. The page threw
// "In entries[0], binding index 0 not present in the bind group layout. Expected layout: [{ binding: 1, ... }
// ... { binding: 8, ... }]" on every frame, cascading into invalid bind groups and invalid command buffers. ***
//
// So this module answers the question the eye cannot: for each entry point, WHICH DECLARED BINDINGS SURVIVE.
// It resolves `CONST + `...`` concatenation the way the page does, walks the call graph the way WGSL does, and
// reports the difference. A gate reads it; nothing here talks to a GPU, so it runs on a box that has none --
// which is the point, because the box that HAD one was the user's browser.
import fs from "node:fs";
import path from "node:path";

// *** THESE ARE FACTORIES, NOT SHARED CONSTANTS, AND THAT IS LOAD-BEARING. A module-level /g/ regex carries
// lastIndex across calls, and `.test()` ADVANCES it -- so an earlier `ENTRY.test(code)` left the cursor part
// way through some other shader and the next call began searching from there. Measured while writing this
// file: it silently skipped 4 of the 13 shaders in fluid-webgpu-3d.html, including two that declare body
// bindings. A scanner that quietly drops its inputs reports "no problems" for the wrong reason, which is worse
// than no scanner at all. Fresh objects per call cannot carry state between them.
const TEMPLATE_LITERAL = () => /`(?:[^`\\]|\\[\s\S])*`/g;
const DECL = () => /@group\(\s*(\d+)\s*\)\s*@binding\(\s*(\d+)\s*\)\s*var\s*(?:<([^>]*)>)?\s*([A-Za-z_]\w*)/g;
const ENTRY = () => /@(compute|vertex|fragment)\b[^;{]*?\bfn\s+([A-Za-z_]\w*)\s*\(/g;
const FN = () => /\bfn\s+([A-Za-z_]\w*)\s*\(/g;

/** Body of the function whose signature ends at `from`, by brace matching. Returns "" if unbalanced. */
function bodyAfter(src, from) {
    const open = src.indexOf("{", from);
    if (open < 0) return "";
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        const ch = src[i];
        if (ch === "{") depth++;
        else if (ch === "}") { depth--; if (depth === 0) return src.slice(open + 1, i); }
    }
    return "";
}

/** End index (exclusive) of the template literal that starts at `i`, or -1. */
function litEnd(src, i) {
    for (let k = i + 1; k < src.length; k++) {
        if (src[k] === "\\") { k++; continue; }
        if (src[k] === "`") return k + 1;
    }
    return -1;
}

/**
 * Every WGSL source a file assembles, keyed by the name it is assigned to.
 *
 * Shaders here are built by CONCATENATION, and the chain is not always one identifier plus one literal:
 * fluid-webgpu-3d.html writes `w.stamp = COMMON + `<bindings>` + BODYFN + `<main>`;` -- bindings in the first
 * literal, the entry point in the last, helper functions spliced between them from another const. Matching a
 * single literal at a time sees a fragment with bindings and no entry point, then a fragment with an entry
 * point and no bindings, and rejects both; that dropped 3 of 13 shaders in that one file. So this walks the
 * WHOLE `+`-chain forward from the assignment and joins it, which is what the page itself does at runtime.
 * @returns {Array<{name:string, code:string}>}
 */
export function extractShaders(src) {
    // pass 1 -- plain `const NAME = `...`` literals, so a chain term naming one can be resolved
    const consts = new Map();
    for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_]\w*)\s*=\s*(`(?:[^`\\]|\\[\s\S])*`)\s*;/g)) {
        consts.set(m[1], m[2].slice(1, -1));
    }
    const out = [];
    const start = /(?:(?:const|let|var)\s+)?([A-Za-z_][\w.]*)\s*=[ \t]*/g;
    for (const m of src.matchAll(start)) {
        let i = m.index + m[0].length;
        const parts = [];
        let sawLiteral = false;
        for (;;) {
            while (i < src.length && /\s/.test(src[i])) i++;
            if (src[i] === "`") {
                const e = litEnd(src, i);
                if (e < 0) break;
                parts.push(src.slice(i + 1, e - 1));
                sawLiteral = true;
                i = e;
            } else {
                const id = /^[A-Za-z_]\w*/.exec(src.slice(i, i + 64));
                if (!id) break;
                parts.push(consts.get(id[0]) || "");
                i += id[0].length;
            }
            while (i < src.length && /[ \t]/.test(src[i])) i++;
            if (src[i] !== "+") break;
            i++;
        }
        if (!sawLiteral) continue;
        const code = parts.join("\n");
        if (!code.includes("@binding(")) continue;
        if (!ENTRY().test(code)) continue;   // a declarations-only fragment such as COMMON is not a shader
        out.push({ name: m[1], code });
    }
    return out;
}

/**
 * The resource interface WebGPU will derive, per entry point.
 * @returns {Array<{entry:string, stage:string, declared:Array, reached:Array, dropped:Array}>}
 */
export function resourceInterfaces(code) {
    const declared = [];
    for (const m of code.matchAll(DECL())) {
        declared.push({ group: +m[1], binding: +m[2], space: (m[3] || "").replace(/\s+/g, ""), name: m[4] });
    }
    const fns = new Map();
    for (const m of code.matchAll(FN())) fns.set(m[1], bodyAfter(code, m.index + m[0].length));

    const entries = [];
    for (const m of code.matchAll(ENTRY())) entries.push({ stage: m[1], name: m[2] });

    return entries.map((e) => {
        const seenFn = new Set();
        const touched = new Set();
        const walk = (fnName) => {
            if (seenFn.has(fnName)) return;
            seenFn.add(fnName);
            const body = fns.get(fnName);
            if (body == null) return;
            for (const id of body.match(/\b[A-Za-z_]\w*\b/g) || []) {
                if (fns.has(id)) walk(id);
                else touched.add(id);
            }
        };
        walk(e.name);
        const reached = declared.filter((d) => touched.has(d.name));
        const dropped = declared.filter((d) => !touched.has(d.name));
        return { entry: e.name, stage: e.stage, declared, reached, dropped };
    });
}

/**
 * The bindings that will be MISSING from a pipeline built from this module with `layout: "auto"`.
 *
 * The unit here is the PIPELINE, not the entry point, and the difference matters: a render pipeline's auto
 * layout is the UNION of its vertex and fragment interfaces (each slot getting the visibility of whichever
 * stages reached it), so a uniform read only in vs() is present in the layout even though fs() never touches
 * it. Reporting per-entry-point instead calls that a defect and buries the real ones -- measured at v3980, it
 * turned 4 true positives into 18 hits. A binding is only genuinely absent when NO entry point reaches it.
 *
 * Each source in this tree backs exactly one pipeline, so the union over its entry points is the layout.
 */
export function droppedBindings(code) {
    const ifaces = resourceInterfaces(code);
    if (!ifaces.length) return [];
    const reached = new Set();
    for (const ri of ifaces) for (const d of ri.reached) reached.add(d.binding + "@" + d.group);
    return ifaces[0].declared.filter((d) => !reached.has(d.binding + "@" + d.group));
}

/**
 * WHICH KINDS of pipeline this file builds with an auto layout, compute and render answered separately.
 *
 * "Does the file contain layout:auto anywhere" is too blunt to be a gate: these pages build their compute
 * pipelines through one helper and their render pipelines inline, so a file that fixed its compute layouts
 * would still trip on the render ones and stay red forever after the bug was gone. A gate nobody can turn
 * green teaches people to ignore it.
 */
export function autoLayoutKinds(src) {
    const kinds = { compute: false, render: false };
    for (const m of src.matchAll(/create(Compute|Render)Pipeline\s*\(/g)) {
        const k = m[1] === "Compute" ? "compute" : "render";
        // Brace-match this call's OWN descriptor. A fixed-width window instead read past the closing brace into
        // whatever came next, so an explicit compute pipeline sitting one line above an auto render pipeline
        // was scored as auto itself -- the gate's own fixture caught that.
        const desc = bodyAfter(src, m.index + m[0].length - 1);
        if (/layout:\s*["']auto["']/.test(desc)) kinds[k] = true;
    }
    return kinds;
}

/** True when the file builds any pipeline with an auto-derived layout. */
export function usesAutoLayout(src) { const k = autoLayoutKinds(src); return k.compute || k.render; }

const SKIP_DIRS = new Set(["node_modules", ".git", "vendor", "dist", "build", "coverage"]);

/** Walk the tree and return every entry point that will lose a declared binding to `layout: "auto"`. */
export function scanTree(root) {
    const files = [];
    (function walk(d) {
        let ents;
        try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            if (SKIP_DIRS.has(e.name)) continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p);
            // A selfcheck's fixtures are DELIBERATELY broken shaders -- that is what makes them fixtures. Scanning
            // them reports this module's own test data as tree defects, and worse, it would make the gate green
            // only by having no fixture at all. Pages and modules are scanned; the things that test them are not.
            else if (/\.(html|js|mjs)$/.test(e.name) && !/-selfcheck\.mjs$/.test(e.name)) files.push(p);
        }
    })(root);

    const hits = [];
    for (const f of files) {
        let src;
        try { src = fs.readFileSync(f, "utf8"); } catch { continue; }
        if (!src.includes("@binding(")) continue;
        const kinds = autoLayoutKinds(src);
        if (!kinds.compute && !kinds.render) continue;
        for (const sh of extractShaders(src)) {
            const ifaces = resourceInterfaces(sh.code);
            if (!ifaces.length) continue;
            // a module whose entry points are all compute backs a compute pipeline, and vice versa
            const kind = ifaces.every((r) => r.stage === "compute") ? "compute" : "render";
            if (!kinds[kind]) continue;
            const dropped = droppedBindings(sh.code);
            if (dropped.length) hits.push({ file: path.relative(root, f), shader: sh.name, kind, dropped });
        }
    }
    return hits;
}
