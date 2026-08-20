// WebGLEngine/tools/ship/pageParse.mjs -- do the pages actually parse?
//
// THE HOLE THIS FILLS. The ship gate runs physicsSuite, rigidSuite, the policy selfcheck and three lockstep
// selfchecks. Every one of them tests a MODULE. Nothing has ever opened a PAGE. So 228 pages carrying 373 inline
// scripts and 2.5 MB of JavaScript have been shipping on the strength of nobody having clicked them.
//
// It has cost us three times in a fortnight, all caught by hand and none by a gate:
//   * v2492 -- a button's verification one-liner crashed on a quoting error and SHIPPED PAST THE GATE.
//   * v2504 -- `loadRepos && loadRepos()` where loadRepos was never declared. An undeclared identifier throws a
//     ReferenceError rather than short-circuiting, so the Publish button would have published, then errored.
//   * the wavefront-tomo demo -- caught only because that repo got a parse check this engine never had.
//
// WHAT THIS DOES AND DOES NOT PROVE. It proves every inline script PARSES. It does not prove any of them WORK --
// no DOM, no WebGL, no user. A page can parse perfectly and still be broken, and a typo in a string literal is
// invisible to a parser. This is the cheapest possible check that would have caught all three bugs above, and its
// value is exactly that: it catches the class of error where a page is dead on arrival, in 200ms, on every ship.
//
// Run: node tools/ship/pageParse.mjs [--verbose]
"use strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const VERBOSE = process.argv.includes("--verbose");

// <script> with a src= is a file, not inline: it is either a module the gate already covers, or a vendor blob we
// did not write. Only inline bodies are ours to be wrong about.
const INLINE = /<script(?![^>]*\ssrc=)([^>]*)>([\s\S]*?)<\/script>/gi;

function scriptsIn(html) {
    const out = [];
    for (const m of html.matchAll(INLINE)) {
        const attrs = (m[1] || "").toLowerCase();
        const body = m[2] || "";
        if (!body.trim()) continue;
        // application/json, text/template, x-shader -- data in a script tag, not JavaScript. Parsing a GLSL shader
        // as JS would fail loudly and teach us nothing.
        const type = (attrs.match(/type\s*=\s*["']?([^"'\s>]+)/) || [])[1] || "";
        if (type && !/^(text\/javascript|application\/javascript|module)$/.test(type)) continue;
        const isModule = /module/.test(type);
        const line = (html.slice(0, m.index).match(/\n/g) || []).length + 1;
        out.push({ body, isModule, line });
    }
    return out;
}

// A module can use import/export at the top level; a classic script cannot. Parse each as what it declares itself
// to be, or a legitimate module reports a false failure and a real classic error hides behind a permissive parse.
function parseOne(src, isModule) {
    try {
        if (isModule) new vm.SourceTextModule(src, { identifier: "page" });
        else new vm.Script(src);
        return null;
    } catch (e) {
        return (e && e.message) || String(e);
    }
}

if (typeof vm.SourceTextModule !== "function") {
    console.log("\npageParse needs --experimental-vm-modules to parse <script type=\"module\"> honestly.\n");
    console.log("  node --experimental-vm-modules tools/ship/pageParse.mjs\n");
    console.log("(It will not approximate: a check that reports false failures is worse than one that admits it");
    console.log(" cannot run. verify.mjs passes the flag for you.)\n");
    process.exit(2);
}

const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort();
const bad = [];
let checked = 0, bytes = 0;

for (const p of pages) {
    const html = fs.readFileSync(path.join(ROOT, p), "utf8");
    for (const s of scriptsIn(html)) {
        // NO FALLBACK, ON PURPOSE. Parsing a module as a classic script needs the import/export lines removed,
        // and my two attempts at that both produced FALSE FAILURES on good code: first "await is only valid in
        // async functions" (top-level await is legal in a module, illegal in a script), then "Unexpected string"
        // (a multi-line `import {\n a, b\n} from "x"` loses its first line and leaves the rest as garbage).
        //
        // A gate that cries wolf is worse than no gate: it teaches you to ignore it, and then it is decoration
        // with extra steps. So this REFUSES to guess. Run it with the flag or do not run it -- verify.mjs passes
        // the flag, and standalone it tells you rather than approximating.
        const err = parseOne(s.body, s.isModule);
        checked++; bytes += s.body.length;
        if (err) bad.push({ page: p, line: s.line, module: s.isModule, err });
        else if (VERBOSE) console.log("  ok    " + p + ":" + s.line + (s.isModule ? "  (module)" : ""));
    }
}

const kb = (bytes / 1024).toFixed(0);
if (bad.length) {
    console.log("\npageParse: " + bad.length + " of " + checked + " inline scripts DO NOT PARSE\n");
    for (const b of bad) console.log("  FAIL  " + b.page + ":" + b.line + (b.module ? " (module)" : "") + "\n          " + b.err);
    console.log("");
    process.exit(1);
}
console.log("pageParse: " + checked + " inline scripts in " + pages.length + " pages parse (" + kb + " KB)");
