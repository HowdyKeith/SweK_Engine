// WebGLEngine/tools/ship/shaderRefs-selfcheck.mjs -- v3560
//
// Run: node tools/ship/shaderRefs-selfcheck.mjs
// RUNTIME 217s MEASURED with date(1) around the run -- it walks the ~3100-file corpus four times and builds the
// reference graph SIX times (section 3 alone builds it three ways). CLOSE TO A FOREGROUND CALL'S ~300s LIMIT in
// this sandbox -- run it with setsid if it ever grows. Not remembered; v3211-v3213 found a wrong runtime in
// 59 of 82 headers and v3558 found one off by nearly three.
//
// *** SECTION 1 IS A SYNTHETIC TREE WHOSE ANSWER IS KNOWN BEFORE THE REAL ONE IS SCANNED, WHICH IS THE ONLY
// REASON THE REAL READING OF "REFERENCED: 0" MEANS ANYTHING. *** moduleRefs was built this way for a stated
// reason: pointed straight at the tree, its predecessors read 22, then 97, then 228 as they learned one route at
// a time, and every number was confident and uncheckable. A census reporting zero without a fixture cannot tell
// "nothing is referenced" from "the route is broken" -- and here the route genuinely fires on nothing real, so
// that is not a hypothetical, it is THE reading being made.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { shaderRefs, handSpelledCorpusFilters, selfExclusions, REGISTERS, ENG,
         MEASURED_V3560, reportLines } from "./shaderRefs.mjs";
import { referenceGraph, specifiers, resolveSpec, SOURCE_EXT, SHADER_EXT } from "./moduleRefs.mjs";
import { codeOnly, noComments } from "./sourceScan.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("shaderRefs-selfcheck -- can the census see a shader, and does the route actually fire?\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE FIXTURE: ONE FILE PER CLAIM, ANSWER KNOWN IN ADVANCE ***");
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "shaderfix-"));
    const W = (p, s) => { fs.mkdirSync(path.dirname(path.join(tmp, p)), { recursive: true }); fs.writeFileSync(path.join(tmp, p), s); return path.join(tmp, p); };

    // ONE FILE PER CLAIM so that one route resolving cannot cover for another -- moduleRefs' own discipline.
    // A ROUTE THAT EXISTS. My first fixture used fetch("./direct.glsl") and the check went RED -- correctly:
    // fetch is NOT one of moduleRefs' five routes, so my claim that "a literal specifier to a shader resolves
    // today" was only true through import()/src=/Worker/importScripts. THE FIXTURE CAUGHT ME OVERSTATING IT.
    W("loader.js", 'import x from "./helper.js";\nconst m = await import("./direct.glsl");\n');   // LITERAL -> referenced
    W("page.html", '<script src="./api.js"></script>');
    // AND WHY fetch IS DELIBERATELY NOT A ROUTE, driven rather than asserted: in this engine fetch("/x") is an
    // HTTP ENDPOINT (1329 relative fetch literals -- /net/info, /sync/settings, /brain/policy). Adding it would
    // resolve ZERO shaders and exactly ONE thing tree-wide, and that one is a FALSE POSITIVE:
    // server.html's fetch("/brain/policy") is an API route that resolveSpec completes to brain/policy.js.
    W("api.js", 'fetch("/endpoint").then(r => r.json());\n');
    W("endpoint.js", "export const HTTP_ROUTE_NOT_A_FILE = 1;\n");
    W("helper.js", 'export default 1;\nconst name = "composed.wgsl";\nconst p = "./" + name;\n'); // string  -> loader-capable
    W("changelog.js", '// v9999 -- rewrote changelogged.glsl to use fewer varyings\nexport const V = 1;\n'); // COMMENT -> unreferenced
    W("direct.glsl", "precision highp float;\n");
    W("composed.wgsl", "@compute fn main() {}\n");
    W("changelogged.glsl", "precision highp float;\n");
    W("sibling-a.wgsl", "// pairs with sibling-b.wgsl\n@compute fn main() {}\n");                 // shader names shader
    W("sibling-b.wgsl", "@compute fn main() {}\n");
    W("nobody.frag", "void main() {}\n");                                                        // named by NOTHING
    W("register.html", '<p>direct.glsl, composed.wgsl, changelogged.glsl, nobody.frag, sibling-b.wgsl</p>');

    const all = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : all.push(p); } };
    walk(tmp);
    const files = all.filter((f) => SOURCE_EXT.test(f) || SHADER_EXT.test(f));
    const raw = (f) => fs.readFileSync(f, "utf8");
    const read = (f) => (SHADER_EXT.test(f) ? raw(f) : noComments(raw(f)));
    const exclude = new Set(files.filter((f) => /register\.html$/.test(f)));   // the fixture's own register
    const G = referenceGraph(files, read, tmp, { exclude });
    const S = (n) => G.state.get(path.join(tmp, n));
    const mentionKind = (n) => {
        const st = S(n);
        if (st.state !== "mentioned-only") return null;
        return st.mentions.some((m) => !SHADER_EXT.test(m)) ? "loader-capable" : "sibling-only";
    };

    ok("!! *** A LITERAL SPECIFIER TO A SHADER RESOLVES -- THE ROUTE FIRES ***",
        S("direct.glsl").state === "referenced",
        "*** THIS IS THE CHECK THAT MAKES THE REAL TREE'S 'REFERENCED: 0' A READING RATHER THAN A DEAD ROUTE. " +
        "*** resolveSpec tries the LITERAL path before appending .js/.mjs, so it never needed teaching -- what " +
        "it needed was a corpus containing shaders. If this line ever goes red the zero downstream means nothing.");
    ok("!! a shader named in a STRING is mentioned-only / loader-capable, not dead",
        S("composed.wgsl").state === "mentioned-only" && mentionKind("composed.wgsl") === "loader-capable",
        "`\"./\" + name` is a COMPOSED path and no resolver may follow it. UNDECIDED is the honest state, and it " +
        "is what all six of pipeline.js's real loads land in on the real tree.");
    ok("!! *** a shader named only in a COMMENT is UNREFERENCED -- v3449's founding defect, in a new file type ***",
        S("changelogged.glsl").state === "unreferenced",
        "a changelog naming a shader must not rescue it. THIS IS THE LINE THAT SEPARATES noComments FROM RAW " +
        "TEXT, and on the real tree it is shaders/voxel.vert.glsl, rescued by main.js's ENGINE_VERSION comment.");
    ok("!! *** a shader named ONLY by another shader is sibling-only -- A SHADER CANNOT LOAD ANYTHING ***",
        S("sibling-b.wgsl").state === "mentioned-only" && mentionKind("sibling-b.wgsl") === "sibling-only",
        "no import, no fetch, no require. Opposite news to a mention by a .js, and ONE mentioned-only count " +
        "cannot separate them -- v3453's manifoldCensus shape, where boundary and non-manifold both read as " +
        "'not exactly two'.");
    ok("a shader named by nothing is unreferenced", S("nobody.frag").state === "unreferenced");
    ok("!! ...and the REGISTER does not rescue any of them", exclude.size === 1 &&
        ["composed.wgsl", "changelogged.glsl", "nobody.frag"].every((n) => !S(n).mentions.some((m) => /register\.html$/.test(m))),
        "v3223: A REGISTER OF ORPHANS IS NOT A CONSUMER OF THEM. register.html names five shaders and rescues " +
        "none -- which is what predictions.html would otherwise do to the whole real census.");

    ok("!! *** AND fetch IS CORRECTLY NOT A ROUTE: an HTTP endpoint must not resolve to a file ***",
        S("endpoint.js").state === "unreferenced",
        "api.js calls fetch(\"/endpoint\") and endpoint.js exists beside it. If fetch were a route, resolveSpec's " +
        "extension completion would turn an API PATH into a FILE REFERENCE. *** THAT IS NOT HYPOTHETICAL: on the " +
        "real tree the ONLY thing a fetch route would resolve is server.html's fetch(\"/brain/policy\") -> " +
        "brain/policy.js, and /brain/policy IS AN HTTP ENDPOINT. Zero shaders, one false positive. THE ROUTE WAS " +
        "MEASURED AND REFUSED. ***");

    fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE ROUTE THAT WOULD HAVE FIRED ON NOTHING, MEASURED ON THE REAL TREE ***");
{
    const all = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === "node_modules" || e.name.startsWith(".")) continue; const p = path.join(d, e.name); e.isDirectory() ? walk(p) : all.push(p); } };
    walk(ENG);
    let hits = 0;
    for (const s of all.filter((f) => SOURCE_EXT.test(f))) {
        let t; try { t = fs.readFileSync(s, "utf8"); } catch { continue; }
        for (const { spec } of specifiers(t)) { const h = resolveSpec(s, spec, ENG); if (h && SHADER_EXT.test(h)) hits++; }
    }
    report("literal specifiers resolving to a shader, whole tree", String(hits));
    ok("!! *** ADDING A SHADER ROUTE TO THE REGEX WOULD HAVE MATCHED ZERO ***", hits === 0,
        "and section 1 proves that is a fact about THE TREE and not about the resolver. Every real shader load " +
        "here is COMPOSED (pipeline.js: readText('./shaders/' + file)). *** A ROUTE THAT CAN NEVER MATCH IS " +
        "v3551'S TRAP WITH THE SIGN FLIPPED -- there, a question whose answer was structurally TRUE collapsed a " +
        "32-item list to 0; here it would have been structurally FALSE. NO ROUTE WAS ADDED. WHAT WAS MISSING " +
        "WAS THE CORPUS. ***");
    // ASSERTED BEHAVIOURALLY, NOT BY GREPPING THE SOURCE. My first version of this line tested for the ABSENCE
    // of the string /\.(js|mjs|html)$/ in moduleRefs.mjs -- and went red the moment I added SOURCE_EXT to that
    // very file. A CHECK THAT COUNTS ITS OWN DECLARATION AS THE THING IT WARNS ABOUT, in the round about a
    // census rescuing its own subjects. The property is that the corpus is the CALLER'S, so DRIVE it:
    const shaderOnly = all.filter((f) => SHADER_EXT.test(f));
    const g2 = referenceGraph(shaderOnly, (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } }, ENG, {});
    ok("!! moduleRefs itself was never narrowed -- it accepts ANY corpus, including one with no sources at all",
        g2.state.size === shaderOnly.length && shaderOnly.length > 0,
        "handed " + shaderOnly.length + " shader files and nothing else, referenceGraph returns a state for " +
        "every one. `files` is a PARAMETER. *** I TOLD KEITH THE INSTRUMENT WALKED .js|.mjs|.html. IT WALKS " +
        "NOTHING -- " + handSpelledCorpusFilters().length + " CALLERS DO, each spelling the same regex by hand, " +
        "and a narrowing repeated that many times reads from outside as a property of the instrument. ***");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE STRIPPER COSTS SIX ONE WAY AND ONE THE OTHER, DRIVEN NOT DESCRIBED ***");
{
    const all = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === "node_modules" || e.name.startsWith(".")) continue; const p = path.join(d, e.name); e.isDirectory() ? walk(p) : all.push(p); } };
    walk(ENG);
    const files = all.filter((f) => SOURCE_EXT.test(f) || SHADER_EXT.test(f));
    const raw = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } };
    const self = new Set(selfExclusions());
    const exclude = new Set(files.filter((f) => REGISTERS.includes(path.relative(ENG, f).split(path.sep).join("/")) || self.has(f)));
    const shaders = files.filter((f) => SHADER_EXT.test(f));
    const run = (strip) => {
        const G = referenceGraph(files, (f) => (SHADER_EXT.test(f) ? raw(f) : strip(raw(f))), ENG, { exclude });
        const c = { referenced: 0, "mentioned-only": 0, unreferenced: 0 };
        for (const s of shaders) c[G.state.get(s).state]++;
        return c;
    };
    const R = run((s) => s), N = run(noComments), C = run(codeOnly);
    for (const [n, c] of [["raw text", R], ["noComments (SHIPPED)", N], ["codeOnly", C]])
        report(n.padEnd(22), "referenced " + c.referenced + " / mentioned-only " + c["mentioned-only"] +
            " / unreferenced " + c.unreferenced);

    ok("!! codeOnly BLANKS STRINGS and loses the composed loads", C["mentioned-only"] < N["mentioned-only"],
        "a shader PATH lives in a string literal, so codeOnly cannot see pipeline.js naming its six .wgsl " +
        "files at all -- v3558's finding in a second place, one round later");
    ok("!! ...and RAW TEXT rescues a shader on a CHANGELOG COMMENT", R["mentioned-only"] > N["mentioned-only"],
        "shaders/voxel.vert.glsl is named inside main.js's ENGINE_VERSION comment and nowhere else. *** v3449'S " +
        "FOUNDING DEFECT -- THE VERSION MARKER EXTENDED EVERY ROUND SUPPRESSING A CENSUS -- STILL WORKING, IN A " +
        "FILE TYPE THAT CENSUS COULD NOT SEE. ***");
    ok("...so noComments is the only stripper that keeps the loads AND drops the changelog",
        N["mentioned-only"] < R["mentioned-only"] && N["mentioned-only"] > C["mentioned-only"],
        "not a preference: A PATH IS TEXT THE CODE CONTAINS; A CHANGELOG IS A COMMENT");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE CENSUS RESCUED FOUR SHADERS WITH ITS OWN HEADER, AND IS CLOSED ON ITSELF ***");
{
    const r = shaderRefs();
    const excluded = r.excluded;
    ok("!! the census excludes ITSELF and its gate", selfExclusions().length === 2,
        "*** ON THE FIRST RUN THIS FILE'S SUBJECT MATTER RESCUED ITS OWN SUBJECTS: the header names " +
        "svo-raymarch.glsl, cloth-collision.wgsl, xpbd-distance.wgsl and voxel.vert.glsl while explaining them, " +
        "and all four read as loader-capable because the census is a .mjs that could in principle load one. " +
        "sibling-only went 2 -> 0 and unreferenced 15 -> 13. THE NUMBERS WERE CORRUPTED BY THE ACT OF WRITING " +
        "THEM DOWN. Fourth collection: v3449's gate did it (165 vs 164), and moduleRefs -- built to DETECT " +
        "prose-rescue -- was itself prose-rescued. ***");
    ok("!! ...BY IDENTITY, so a rename cannot silently re-open it",
        selfExclusions().every((p) => path.isAbsolute(p)) &&
        !/shaderRefs/.test(fs.readFileSync(path.join(ENG, "tools/ship/shaderRefs.mjs"), "utf8")
            .match(/export function selfExclusions[\s\S]*?\n}/)[0]),
        "derived from import.meta.url rather than written as a string -- v3449's precedent exactly. A name " +
        "list would go stale the day somebody renames the file, and stale means SILENTLY re-opened.");
    ok("...and svo-raymarch.glsl reads UNREFERENCED once the census stops naming it",
        r.rows.find((x) => x.file === "physics/octree/svo-raymarch.glsl").state === "unreferenced",
        "which is the finding this whole round came from: 88 lines of WebGL2 that nothing loads");
    ok("the claims register is excluded too", excluded.includes("predictions.html"),
        "it describes every capability in the engine, so a CLAIM ABOUT a shader would stand as evidence of use");
}

// ---------------------------------------------------------------------------
console.log("\n5. THE CENSUS IS A CENSUS -- NOT RATCHETED, NOT SWEPT, AND IT HAS A FRONT DOOR");
{
    const r = shaderRefs();
    const kinds = { loader: r.rows.filter((x) => x.kind === "loader-capable").length,
                    sibling: r.rows.filter((x) => x.kind === "sibling-only").length,
                    unref: r.rows.filter((x) => x.state === "unreferenced").length };
    report("shader files", String(r.shaderCount));
    report("loader-capable / sibling-only / unreferenced",
        kinds.loader + " / " + kinds.sibling + " / " + kinds.unref);

    ok("!! all three classes are POPULATED, so none of them is a dead branch",
        kinds.loader > 0 && kinds.sibling > 0 && kinds.unref > 0,
        "a classification where one bucket is always empty is a distinction nobody is drawing");
    ok("!! nothing is ratcheted, deliberately", !("baseline" in MEASURED_V3560),
        "these files were in NO count before today, so a baseline frozen now would freeze MY FIRST LOOK at " +
        "them -- v3453's refusal to ratchet a count derived from shapes the author chose. Each is a judgement, " +
        "one at a time (v3451's instruction, and it is what the last three rounds have been doing).");
    ok("!! the hand-spelled corpus filters are COUNTED, not swept",
        handSpelledCorpusFilters().length >= 5,
        handSpelledCorpusFilters().length + " callers still spell /\\.(js|mjs|html)$/ by hand. *** THE " +
        "ANTIDOTE, WRITTEN IN ADVANCE: as callers import SOURCE_EXT this number FALLS -- DO NOT RAISE IT, and " +
        "DO NOT rewrite all of them in one script, which is v3202's sweep that deleted 61 live modules. ***");
    ok("the report prints and the tool exits zero",
        reportLines().length > 20 && /REFERENCED/.test(reportLines().join("\n")),
        "v3327's split: a reporting tool prints, the gate beside it is what exits nonzero");
    ok("...and graveyard's own population is untouched", !("actionable" in MEASURED_V3560),
        "shaders are a SEPARATE census. Folding them into graveyard's number would change a count whose " +
        "baseline means something, to describe files that were never in it.");
}

console.log(fails ? `\nshaderRefs-selfcheck: ${fails} FAILED` : "\nshaderRefs-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
