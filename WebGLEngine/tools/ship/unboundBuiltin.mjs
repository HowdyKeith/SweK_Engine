// WebGLEngine/tools/ship/unboundBuiltin.mjs -- v3033
//
// A MODULE USED IN A BRANCH THAT NEVER RUNS HERE IS STILL A CRASH THERE.
//
// v3004 added a Windows-only pathNote to terrainBuildBridge and used os.homedir() inside it. `os` WAS NEVER
// IMPORTED. Every Linux and Mac run took the other side of the ternary, never evaluated the expression, and the
// gate passed on three platforms. Keith's Windows rig threw ReferenceError: os is not defined -- from inside the
// very fix that round wrote to stop platform-specific behaviour hiding.
//
// THAT IS THE SAME CLASS AS THE ESM URL-SCHEME CRASH (v2997) AND THE NULL pathNote (v3004), and it is the third
// time: code on a path this sandbox cannot execute. The answer each time has been the same -- READ IT INSTEAD OF
// RUNNING IT -- because a static question has the same answer on every platform.
//
// A DETECTOR THAT FLAGS EVERYTHING IS WORSE THAN NONE. My first pass reported forty hits across 193 bridges,
// almost all of them files that receive `path` as a parameter or import it as ESM. So a name counts as BOUND if
// it is required, imported, declared, destructured, or taken as a parameter -- and only an unbound one is a
// finding.
"use strict";
import fs from "node:fs";
import path from "node:path";

export const BUILTINS = ["os", "path", "fs", "crypto", "http", "https", "url", "zlib", "net", "dns"];

// *** v3681 -- THIS FILE DECLARED ITS OWN codeOnly AND IT DID NOT STRIP LINE COMMENTS. *** The docstring it
// carried said "Strip comments and string literals: prose that mentions os.homedir() is not a use of it" --
// AND `// os.homedir()` SURVIVED IT INTACT, so the one thing it promised was the one thing it did not do.
// PROSE-AS-CODE inside the guard written to prevent prose-as-code.
//
// MEASURED RATHER THAN ARGUED, by running both strippers over every .js and .mjs in the tree: they disagree on
// 2794 OF 2910 FILES, and TEN name-uses in the live tree are seen ONLY by the private one -- every one of them
// from a line comment (deadImportScan.mjs:fs, ev.html:fs, proseAudit.mjs:fs and seven more). NONE of the ten
// reaches a finding today, but only because isBound happens to rescue them from the RAW source: A SECOND
// ACCIDENT HOLDING UP THE FIRST.
//
// sourceScan.mjs IS THE SINGLE DEFINITION and deadImportScan's own header already says why -- "a fix applied to
// one tool is not a fix to the class". RE-EXPORTED rather than re-implemented, so the one importer of this
// name (unboundBuiltin-selfcheck) keeps working against ONE declaration instead of a second copy.
// IMPORTED **AND** RE-EXPORTED: a bare `export ... from` re-exports without BINDING THE NAME LOCALLY, so
// scan()'s own call to codeOnly threw ReferenceError -- and the gate exited 1 while printing ZERO "FAIL" lines,
// because a crash is not a failed assertion (v3605). Read the exit code, not the count.
import { codeOnly } from "./sourceScan.mjs";
import { SOURCE_EXT } from "./moduleRefs.mjs";   // v3684 -- one declaration of the corpus
export { codeOnly };

function usesMember(code, m) {
    return new RegExp("(?<![\\w.$])" + m + "\\.[a-zA-Z]").test(code);
}

/**
 * Bound by ANY legitimate means -- and read from the RAW source, not the stripped one.
 *
 * MY FIRST VERSION READ BOTH FROM THE STRIPPED CODE AND REPORTED 48 FALSE POSITIVES. codeOnly() blanks string
 * literals, so `require("os")` became `require("")` and THE BINDING EVIDENCE WAS THE THING I HAD JUST DELETED.
 * Usage must be read stripped (prose mentioning os.homedir() is not a use); bindings must be read RAW (the
 * module name lives inside a string). Same lesson as prose-as-code, arriving from the opposite direction.
 */
function isBound(code, m) {
    const pats = [
        "require\\(\\s*[\"'](?:node:)?" + m + "[\"']\\s*\\)",   // const os = require("os")
        "from\\s+[\"'](?:node:)?" + m + "[\"']",                 // import os from "node:os"
        // *** v3678 -- A NAME DECLARED LATER IN A MULTI-DECLARATOR LIST READ AS UNBOUND. *** This pattern
        // demanded the name IMMEDIATELY after const/let/var, so `let seed = 42, G, adj, from = -1, path = null;`
        // -- cosmic-map.html, real and correct -- reported `path` as an unbound node builtin. THE HOLE WAS
        // ALWAYS THERE and nothing had stood on it; widening the corpus to HTML is what walked onto it, which is
        // the argument for widening rather than writing a reason. It now allows the declarator list to run on
        // before the name, and still requires a DECLARATION keyword so an assignment alone does not count.
        "(?:const|let|var)\\s+(?:[^;\\n]*,\\s*)?(?:\\{[^}]*\\b" + m + "\\b[^}]*\\}|" + m + ")\\s*[=,;]", // declared or destructured, anywhere in the list
        "function[^(]*\\([^)]*\\b" + m + "\\b[^)]*\\)",          // function f(path)
        "\\(\\s*[^)]*\\b" + m + "\\b[^)]*\\)\\s*=>",             // (path) =>
    ];
    return pats.some((p) => new RegExp(p).test(code));
}

/** @returns {Array<{file,module}>} names used as a namespace but never bound. */
export function scan(dir) {
    const out = [];
    let files = [];
    // *** v3678 -- HTML IS IN THE CORPUS NOW, AND WIDENING WAS SAFE BECAUSE IT WAS MEASURED FIRST. *** This was
    // one of the TWENTY tools v3614 found scanning a corpus that SILENTLY OMITS EVERY HTML FILE, and the open
    // list has asked each of them for a widened filter OR a stated reason. I expected a reason here: `crypto`
    // and `url` are legitimate BROWSER globals, so the rule looked like it would not transfer and would flag
    // correct pages -- and this file's own header says A DETECTOR THAT FLAGS EVERYTHING IS WORSE THAN NONE.
    // MEASURED ACROSS ALL 379 PAGES FIRST: not one of the ten names is used as a namespace anywhere. ZERO
    // false positives available, so the widening costs no noise and buys a real guard.
    //
    // AND IT IS THE BROWSER HALF OF A DEFECT THIS TREE HAS HIT FOUR TIMES -- v3617, v3630, v3669 and v3674 were
    // all "a module a browser cannot load". Those were node: imports at module scope; this is the INLINE SCRIPT
    // version, where a page reaching for fs or path crashes on open with nothing to catch it.
    //
    // ONLY <script> BODIES ARE READ FROM A PAGE, never the markup: prose or an attribute containing "fs." is
    // not a use of fs, and scanning raw HTML would be the prose-as-code mistake this tree keeps recording.
    // v3684 -- SOURCE_EXT, NOT A THIRTEENTH HAND-SPELLING. v3614 named this debt ("twelve files that could
    // import moduleRefs' SOURCE_EXT") and I ADDED TO IT AT v3678 by writing the pattern out here myself.
    // The set is proven UNCHANGED by capturing both corpora before and after, because a shared constant that
    // quietly matches a different set is worse than the duplicate it replaced.
    try { files = fs.readdirSync(dir).filter((f) => SOURCE_EXT.test(f)); } catch { return out; }
    for (const f of files) {
        let src = "";
        try { src = fs.readFileSync(path.join(dir, f), "utf8"); } catch { continue; }
        if (/\.html$/.test(f)) src = [...src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join("\n");
        const code = codeOnly(src);
        for (const m of BUILTINS) {
            if (usesMember(code, m) && !isBound(src, m)) out.push({ file: f, module: m });
        }
    }
    return out;
}
