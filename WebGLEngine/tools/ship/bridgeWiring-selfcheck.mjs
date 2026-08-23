// WebGLEngine/tools/ship/bridgeWiring-selfcheck.mjs -- v3953
//
// Run: node tools/ship/bridgeWiring-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// *** A BRIDGE server.js REQUIRES AND NEVER CALLS IS A ROUTE THAT 404s FOREVER. ***
//
// blobBrainBridge was required at the top of server.js and dispatched NOWHERE: the identifier appeared exactly
// once in the whole file, on the require itself. So /ai/brain/blob/policy answered 404 for its entire life, and
// fx/avatar/blobGravity.js quietly fell back to its baked weights every single time -- a feature that fails
// closed and silent, which this tree has a standing name for. Keith's render-qa reported it on two pages.
//
// THE REQUIRE IS WHAT MAKES IT INVISIBLE. Orphan detection asks "does anything reference this module", and the
// require IS a reference -- so a bridge can be imported, look wired, and never be offered a single request.
// That is a different question from "is this module reachable", and it needs its own check.
//
// WHAT THIS ASSERTS: every `const X = require("./...")` in server.js is USED somewhere other than its own
// declaration. It does not try to prove the dispatch is correct -- only that one exists, which is the difference
// between a route that can work and a route that cannot.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SERVER = path.join(ENG, "ai-bridge", "server.js");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("bridgeWiring-selfcheck -- a required bridge that is never called is a 404 with a good excuse\n");

// *** LINE-BASED, AND THE BLOCK-COMMENT STRIP IS DELIBERATELY GONE. ***
//
// The first version of this gate did `.join("\n").replace(/\/\*[\s\S]*?\*\//g, "")` and produced a `code` string
// containing ZERO occurrences of blobBrainBridge -- not one, zero, including the real dispatch line. server.js is
// seventeen thousand lines and somewhere in it a `/*` sits inside a string or a regex literal, so that pattern
// swallowed everything from there to the next `*/`. The gate then failed on a file that was correct, which is
// the fourth hand-rolled text scan to misfire in this stretch of work.
//
// Keeping the analysis PER LINE removes the whole class: a line either starts with // or it does not, and no
// regex ever spans a construct it does not understand. Prose still cannot masquerade as a call site, which was
// the only thing the stripping was for.
const raw = fs.readFileSync(SERVER, "utf8");
const lines = raw.split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l));
const code = lines.join("\n");

const decls = [...code.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*"\.\/([^"]+)"\s*\)/g)]
    .map((m) => ({ name: m[1], mod: m[2] }));

ok("!! server.js's local requires were found", decls.length > 50, decls.length + " local require(s)");

{
    console.log("\n1. *** EVERY BRIDGE THAT IS REQUIRED IS ALSO CALLED ***");
    // *** COUNTED ON EVERY LINE EXCEPT THE DECLARATION'S OWN, AND THAT DETAIL IS THE WHOLE CHECK. ***
    // `const blobBrainBridge = require("./blobBrainBridge.js")` contains the name TWICE -- as the identifier and
    // again inside the module path -- and almost every bridge here is named after its file. Counting matches
    // across the whole text therefore gives >= 2 for an entirely unwired module, so the first version of this
    // check PASSED with the dispatch deliberately deleted. It was measuring a naming convention, not a call.
    const orphans = decls.filter((d) => {
        const re = new RegExp("(?<![.\\w$])" + d.name.replace(/\$/g, "\\$") + "(?![\\w$])", "g");
        const declLine = new RegExp("\\bconst\\s+" + d.name.replace(/\$/g, "\\$") + "\\s*=\\s*require\\(");
        let uses = 0;
        for (const l of lines) { if (declLine.test(l)) continue; uses += (l.match(re) || []).length; }
        return uses === 0;                                  // referenced nowhere but its own require
    });
    ok("!! no bridge is required and then never dispatched",
       orphans.length === 0,
       orphans.length
           ? "REQUIRED BUT NEVER CALLED: " + orphans.map((o) => o.name + " (./" + o.mod + ")").join(", ") +
             " -- every route it owns answers 404, and the require makes it look wired"
           : "checked " + decls.length + " requires; each is referenced beyond its declaration");
}

// The specific one that cost two pages, named so a future tidy-up cannot quietly drop it again. Its ordering is
// load-bearing and the require's own comment says why: gpuBrainBridge.owns() claims the whole /ai/brain prefix,
// so the SPECIFIC route must be offered the request before the general one.
{
    console.log("\n2. ...AND THE ONE THAT WAS MISSING IS WIRED IN THE RIGHT ORDER");
    const blob = code.indexOf("blobBrainBridge.handle(");
    const gpu = code.indexOf("gpuBrainBridge.owns(");
    ok("!! blobBrainBridge is actually dispatched", blob > 0,
       "/ai/brain/blob/policy 404'd for its whole life without this line");
    ok("!! ...and BEFORE gpuBrainBridge, which owns the /ai/brain prefix",
       blob > 0 && gpu > 0 && blob < gpu,
       "the general owner would swallow the specific route otherwise -- the require's own v2439 comment says " +
       "'registered BEFORE gpuBrainBridge', which is the instruction that was never carried out");
}

console.log(fails ? `\nbridgeWiring-selfcheck: ${fails} FAILED` : "\nbridgeWiring-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
