// WebGLEngine/tools/ship/inlineHelpers-selfcheck.mjs -- v3049
//
// Run: node tools/ship/inlineHelpers-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// A HELPER USED IN A BLOCK THAT NEVER DEFINES IT.
//
// server.html carried this for at least ten versions: one script block called $(...) NINETEEN TIMES and never
// declared $. Five other blocks each declare their own copy, and every one of those is inside an IIFE or a
// module, so none of them was ever global. The offending block is a module, which has its own scope regardless.
//
// WHY NOTHING CAUGHT IT. Every existing check passes on this file: node --check parses each block fine (an
// undefined identifier is a RUNTIME error, not a syntax error), browserNodeGuard only looks at imports, and the
// page LOADS -- the header renders, most panels work. It fails only when the function runs. And because
// loadCrossdesk() is called at that module's top level, the throw took EVERYTHING BELOW IT with it: the whole
// rest of the block, including the NearShare panel, silently never ran. One uncaught ReferenceError in the
// console and several dead panels that look like they were never built.
//
// Keith found it by reading his console. This gate is the version that does not need him to.
//
// SCOPE, stated honestly: this is a lexical check for a SHORT NAMED LIST of helpers this tree actually uses. It
// is not a general undefined-identifier analyser -- that needs a real scope-resolving parser, and a checker that
// guessed would produce false alarms and get switched off. Adding a name here is cheap; guessing is not.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// Helpers that are ALWAYS block-local in this tree -- never loaded from a script src, never on window.
const HELPERS = ["$", "$$", "esc", "inp"];

const SKIP = /node_modules|[\\/]\.git|[\\/]vendor|GPU_Assets|demos_code/;
function walk(dir, out = []) {
    let entries = [];
    try { entries = fs.readdirSync(dir); } catch { return out; }
    for (const f of entries) {
        const p = path.join(dir, f);
        if (SKIP.test(p)) continue;
        let st; try { st = fs.statSync(p); } catch { continue; }
        if (st.isDirectory()) walk(p, out);
        else if (/\.html$/.test(f)) out.push(p);
    }
    return out;
}

function offenders(src) {
    const out = [];
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
    let m, i = -1;
    while ((m = re.exec(src)) !== null) {
        i++;
        const body = m[1];
        if (body.trim().startsWith("{")) continue;               // an importmap is JSON, not code
        const line = src.slice(0, m.index).split("\n").length;
        for (const h of HELPERS) {
            const e = h.replace(/\$/g, "\\$");
            const uses = (body.match(new RegExp("(?<![\\w$])" + e + "\\s*\\(", "g")) || []).length;
            if (!uses) continue;
            const declared = new RegExp("(?:function|const|var|let)\\s+" + e + "(?![\\w$])|(?<![\\w$])" + e + "\\s*=\\s*(?:function|\\(|document)").test(body);
            if (!declared) out.push({ block: i, line, helper: h, uses });
        }
    }
    return out;
}

// 1. THE CHECK ITSELF, over every page in the tree
{
    const bad = [];
    for (const p of walk(ENG)) {
        for (const o of offenders(fs.readFileSync(p, "utf8")))
            bad.push(path.relative(ENG, p).split(path.sep).join("/") + " block " + o.block + " (line ~" + o.line + "): " + o.helper + " used " + o.uses + "x, never declared");
    }
    ok("!! NO INLINE SCRIPT BLOCK USES A HELPER IT NEVER DECLARES", bad.length === 0,
        bad.length ? bad.slice(0, 6).join("  |  ") + (bad.length > 6 ? "  (+" + (bad.length - 6) + " more)" : "")
            : "checked " + HELPERS.join(" ") + " across every inline block in every page");
}

// 2. THE CHECK HAS DETECTION POWER. Without this the check above passes trivially once the tree is clean, and a
//    regex that silently stopped matching would look exactly like a fixed codebase.
{
    const planted = '<script type="module">\nfunction go(){ $("x").textContent = "hi"; }\ngo();\n</script>';
    const found = offenders(planted);
    ok("SABOTAGE: a planted block using $ without declaring it IS caught",
        found.length === 1 && found[0].helper === "$" && found[0].uses === 1);

    const fixed = '<script type="module">\nconst $ = (id) => document.getElementById(id);\nfunction go(){ $("x").textContent = "hi"; }\ngo();\n</script>';
    ok("...and declaring it clears the report", offenders(fixed).length === 0);

    const iife = '<script>\n(function(){ var $ = function(id){return document.getElementById(id);}; $("x"); })();\n</script>';
    ok("...an IIFE-local declaration counts for its own block", offenders(iife).length === 0);

    // The real shape of the bug: block A declares it, block B uses it. A cannot help B -- A's copy is IIFE-local
    // and B is a module either way.
    const twoBlocks = '<script>\n(function(){ var $ = function(id){return document.getElementById(id);}; $("a"); })();\n</script>\n<script type="module">\n$("b");\n</script>';
    ok("!! a declaration in ANOTHER block does not rescue the one that needs it",
        offenders(twoBlocks).length === 1 && offenders(twoBlocks)[0].block === 1,
        "this is exactly the server.html bug: five blocks each declare their own, all IIFE-local or module-local");

    ok("an importmap is not treated as code", offenders('<script type="importmap">\n{ "imports": {} }\n</script>').length === 0);
    ok("a src= script is not scanned (its body is not here)", offenders('<script src="/x.js"></script>').length === 0);
}

// 3. the specific regression, pinned by name
{
    const src = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
    ok("server.html's crossdesk block declares $ (the v3049 fix)",
        /const \$ = \(id\) => document\.getElementById\(id\);/.test(src) && /loadCrossdesk/.test(src));
    ok("...and loadCrossdesk still runs at that block's top level, so the fix is load-bearing", /^\s*loadCrossdesk\(\);/m.test(src),
        "if the call were removed the block would stop throwing for the wrong reason");
}

console.log("inlineHelpers-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
