// tools/ship/bun-audit.mjs — v2253
//
// The cell manager (brain/esPilot.mjs and everything it imports) is meant to compile to a standalone
// `bun build --compile` executable and run as a per-cell owner on the fleet. That only stays true if the
// subtree never pulls in something Bun's single-file compile can't carry: a CommonJS require, a native
// .node addon, child_process / worker_threads / cluster / dgram, or the process.binding/dlopen escape
// hatches. This walks the ENTRY's transitive relative-import graph and greps each file for those, so a
// Bun-hostile call sneaking into the owner path fails the ship ritual instead of the exe.
//
//   run: node tools/ship/bun-audit.mjs [entry.mjs]        (default: brain/esPilot.mjs)

import fs from "node:fs";
import path from "node:path";

const ENTRY = process.argv[2] || "brain/esPilot.mjs";

// resolve a relative import specifier to a real file on disk
function resolve(fromFile, spec) {
    if (!spec.startsWith(".")) return null;                       // bare specifier -> handled separately
    const base = path.resolve(path.dirname(fromFile), spec);
    const tries = [base, base + ".js", base + ".mjs", path.join(base, "index.js"), path.join(base, "index.mjs")];
    for (const t of tries) { try { if (fs.statSync(t).isFile()) return t; } catch { /* keep trying */ } }
    return null;
}

// strip comments so prose that mentions "require(" or "child_process" doesn't trip the scan
function decomment(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const HOSTILE = [
    { name: "CommonJS require()", re: /(^|[^.\w])require\s*\(/ },
    { name: "createRequire (require escape hatch)", re: /createRequire/ },
    { name: "child_process", re: /["']node:child_process["']|["']child_process["']/ },
    { name: "worker_threads", re: /["']node:worker_threads["']|["']worker_threads["']/ },
    { name: "cluster", re: /["']node:cluster["']|["']cluster["']/ },
    { name: "dgram", re: /["']node:dgram["']|["']dgram["']/ },
    { name: "native .node addon", re: /["'][^"']+\.node["']/ },
    { name: "process.binding/dlopen", re: /process\.(binding|dlopen)\s*\(/ },
];
// bare specifiers that are fine under Bun (native builtins / self) -> never flagged
const BARE_OK = new Set();

const graph = new Set();
const violations = [];
const queue = [path.resolve(ENTRY)];

while (queue.length) {
    const file = queue.shift();
    if (graph.has(file)) continue;
    graph.add(file);
    let src;
    try { src = fs.readFileSync(file, "utf8"); } catch { violations.push({ file, why: "could not read" }); continue; }
    const clean = decomment(src);

    for (const h of HOSTILE) if (h.re.test(clean)) violations.push({ file, why: h.name });

    // follow every relative import/export-from to keep walking the owner's real subtree
    const specs = [...clean.matchAll(/(?:import|export)[^"']*?from\s*["']([^"']+)["']/g)].map((m) => m[1])
        .concat([...clean.matchAll(/import\s*["']([^"']+)["']/g)].map((m) => m[1]));
    for (const s of specs) {
        if (s.startsWith(".")) { const r = resolve(file, s); if (r) queue.push(r); else violations.push({ file, why: `unresolved relative import "${s}"` }); }
        else if (!BARE_OK.has(s)) violations.push({ file, why: `bare/package import "${s}" (single-file compile carries only what it can bundle)` });
    }
}

const rel = (f) => path.relative(process.cwd(), f);
if (violations.length) {
    console.log(`bun surface FAIL -- ${violations.length} issue(s) in the cell-manager tree (entry: ${ENTRY}):`);
    for (const v of violations) console.log(`  ${rel(v.file)}: ${v.why}`);
    process.exit(1);
}
console.log(`bun surface OK -- ${graph.size} files clean under entry ${ENTRY} (no require/native/child_process/worker/cluster/dgram)`);
