// WebGLEngine/tools/ship/shaderRefs.mjs -- v3560
// ---------------------------------------------------------------------------------------------------------------
// DOES ANYTHING LOAD THIS SHADER? -- THE FILE TYPE THE ORPHAN CENSUS COULD NOT SEE.
//
// Keith asked whether any of v3558's remaining unwired features could be tested through render-QA. Looking at
// physics/octree/svoGenerator.js turned up physics/octree/svo-raymarch.glsl -- 88 lines of real WebGL2 that
// NOTHING LOADS -- and then the larger fact: graveyard's actionable pile is 104 and NOT ONE SHADER COULD EVER
// HAVE BEEN IN IT, because the corpus is .js/.mjs/.html.
//
// *** AND THE BLINDNESS IS NOT WHERE I FIRST SAID IT WAS, WHICH IS THE FIRST FINDING. *** I told Keith
// "moduleRefs walks .js|.mjs|.html only". IT WALKS NOTHING -- `files` is a PARAMETER, and resolveSpec tries the
// literal path before appending .js/.mjs, so a specifier naming "./x.glsl" resolves through any of the five
// existing routes TODAY. What is narrow is every CALLER: NINE SITES SPELL /\.(js|mjs|html)$/ BY HAND. A
// narrowing repeated in nine callers is indistinguishable, from the outside, from a property of the instrument
// -- and I read it as one. The gate proves the corpus is the caller's by handing referenceGraph a corpus of
// shaders ALONE, rather than by grepping this claim out of moduleRefs' source.
//
// *** AND I OVERSTATED IT ONCE MORE, WHICH THE FIXTURE CAUGHT. *** My first fixture wrote
// `await fetch("./direct.glsl")` and the check went RED, correctly: FETCH IS NOT ONE OF THE FIVE ROUTES. So a
// shader resolves through import()/src=/new Worker/importScripts, and NOT through the idiom a browser would
// actually use to load one.
//
// ADDING fetch WAS THEN MEASURED AND REFUSED, WHICH IS THE BETTER ANSWER: this engine has 1329 relative fetch
// literals and they are HTTP ENDPOINTS -- /net/info, /sync/settings, /brain/policy. A fetch route resolves ZERO
// shaders and exactly ONE thing tree-wide, and that one is A FALSE POSITIVE: server.html's fetch("/brain/policy")
// completed to brain/policy.js by the same extension-completion that helps everywhere else. TREATING AN API PATH
// AS A FILE REFERENCE WOULD HAVE BEEN A NEW DEFECT SOLD AS A FIX. The fixture pins the refusal so nobody adds it
// later on the grounds that it looks obvious -- it does.
//
// ---- THE ROUTE THAT WOULD HAVE FIRED ON NOTHING -----------------------------------------------------------------
//
// The obvious move was to add shader extensions to moduleRefs' specifier regex. *** MEASURED FIRST, AND IT WOULD
// HAVE MATCHED ZERO: not one literal specifier anywhere in this tree resolves to a shader file. *** Every real
// shader load here is COMPOSED -- brain/transport/pipeline.js does `readText("./shaders/" + file)` with the
// basename supplied separately -- which moduleRefs' own header says it must never pretend to follow.
//
// SO NO ROUTE WAS ADDED. A check whose answer is structurally fixed is not evidence (v3551, where widening
// hasOwnGate collapsed 32 to 0), and a route that can never match is the same error with the sign flipped. What
// was missing was never a route: IT WAS THE CORPUS.
//
// ---- WHAT THE MENTION SCAN NEEDED, AND IT IS v3558'S LESSON AGAIN --------------------------------------------
//
// A shader path lives in a STRING (`"./shaders/" + file`), and a changelog naming a shader lives in a COMMENT.
// Measured three ways over the same corpus:
//
//     RAW TEXT      referenced 0 / mentioned-only 9 / unreferenced 14
//     noComments    referenced 0 / mentioned-only 8 / unreferenced 15     <- SHIPPED
//     codeOnly      referenced 0 / mentioned-only 3 / unreferenced 20
//
// codeOnly BLANKS STRINGS and loses all six of pipeline.js's real composed loads. RAW TEXT rescues
// shaders/voxel.vert.glsl on a mention inside main.js's ENGINE_VERSION CHANGELOG COMMENT -- v3449's founding
// case, in a new file type, still working. noComments is the one stripper that keeps the loads and drops the
// changelog, and that is not a preference: A PATH IS TEXT THE CODE CONTAINS, A CHANGELOG IS A COMMENT.
//
// ---- AND A SHADER CORPUS NEEDS A DISTINCTION THE MODULE CORPUS NEVER DID -------------------------------------
//
// *** A SHADER CANNOT LOAD ANYTHING. *** It has no import, no fetch, no require. So when the only file naming
// cloth-collision.wgsl is cloth-finalize.vert, that mention CANNOT be a composed load -- it is a comment, and it
// is opposite news to the six named by pipeline.js. One "mentioned-only" count cannot separate them, which is
// the same shape as v3453's manifoldCensus (boundary and non-manifold are opposite news and one "not exactly
// two" count cannot tell them apart). So every mention carries a KIND:
//
//     loader-capable  named in the CODE of a .js/.mjs/.html -- a composed path plausibly reaches it. UNDECIDED.
//     sibling-only    named ONLY by another shader -- cannot be a load. A comment.
//
// NOTHING HERE IS RATCHETED AND NOTHING IS DELETED. This is a census: the shaders it lists have never been in any
// count, so a baseline frozen today would be freezing my first look at them. Each is a judgement, one at a time.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { referenceGraph, SOURCE_EXT, SHADER_EXT } from "./moduleRefs.mjs";
import { noComments, codeOnly } from "./sourceScan.mjs";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Files whose NAMING of a shader must not count. v3223's rule, unchanged: A REGISTER IS NOT A CONSUMER.
 * predictions.html is the claims registry -- it describes every capability in the engine, so leaving it in would
 * let a CLAIM ABOUT a shader stand as evidence the shader is used, which is the register defect exactly.
 * main.js is NOT excluded: it is a real source and its changelog is a COMMENT, which the stripper already drops.
 */
export const REGISTERS = ["predictions.html"];

/**
 * *** AND THIS FILE EXCLUDES ITSELF, BECAUSE IT RESCUED FOUR SHADERS WITH ITS OWN HEADER ON THE FIRST RUN. ***
 *
 * The header above NAMES svo-raymarch.glsl, cloth-collision.wgsl, xpbd-distance.wgsl and voxel.vert.glsl while
 * explaining them, and every one promptly read as loader-capable BECAUSE THE CENSUS IS A .mjs THAT COULD IN
 * PRINCIPLE LOAD ONE. sibling-only went 2 -> 0 and unreferenced 15 -> 13: the numbers I had just measured were
 * corrupted by the act of writing them down.
 *
 * FOURTH COLLECTION OF THIS EXACT SHAPE -- v3449's gate rescued a module with its own header (165 vs 164),
 * moduleRefs.mjs (built to DETECT prose-rescue) was itself prose-rescued, and here it is in a new file type.
 * *** DOCUMENTING A MODULE IS THE SINGLE COMMONEST WAY TO HIDE IT. ***
 *
 * CLOSED BY IDENTITY, NOT BY NAME, so a rename cannot silently re-open it -- v3449's precedent exactly. The
 * gate beside it is excluded the same way and for the same reason: a file whose subject is the census is not a
 * consumer of what it counts.
 */
export function selfExclusions() {
    const me = fileURLToPath(import.meta.url);
    return [me, me.replace(/\.mjs$/, "-selfcheck.mjs")];
}

export function walkTree(root) {
    const out = [];
    const walk = (dir) => {
        let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            if (e.name === "node_modules" || e.name.startsWith(".")) continue;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) walk(p); else out.push(p);
        }
    };
    walk(root);
    return out;
}

const rel = (root, f) => path.relative(root, f).split(path.sep).join("/");

/**
 * The census. Corpus = sources PLUS shader files, which is the whole change -- shaders enter as TARGETS.
 * They are kept as sources too rather than filtered out, because a shader naming a sibling is a real (if weak)
 * mention and hiding it would be deciding the question this file exists to report.
 */
export function shaderRefs({ root = ENG } = {}) {
    const all = walkTree(root);
    const files = all.filter((f) => SOURCE_EXT.test(f) || SHADER_EXT.test(f));
    const raw = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } };
    // A SHADER'S OWN TEXT IS NOT STRIPPED: it is scanned for what it NAMES, and its comments are where a sibling
    // reference lives. Source text IS stripped of comments, so a changelog cannot rescue a shader.
    const read = (f) => (SHADER_EXT.test(f) ? raw(f) : noComments(raw(f)));
    const self = new Set(selfExclusions());
    const exclude = new Set(files.filter((f) => REGISTERS.includes(rel(root, f)) || self.has(f)));

    const G = referenceGraph(files, read, root, { exclude });
    const shaders = files.filter((f) => SHADER_EXT.test(f));

    const rows = shaders.map((f) => {
        const st = G.state.get(f);
        const mentions = (st.mentions || []).map((m) => rel(root, m));
        const kind = st.state !== "mentioned-only" ? null
            : (mentions.some((m) => !SHADER_EXT.test(m)) ? "loader-capable" : "sibling-only");
        return { file: rel(root, f), state: st.state, kind,
                 by: (st.by || []).map((b) => rel(root, b.from)), mentions };
    });
    rows.sort((a, b) => a.file.localeCompare(b.file));
    return { rows, corpus: files.length, shaderCount: shaders.length, excluded: [...exclude].map((f) => rel(root, f)) };
}

/**
 * How many callers still spell the corpus filter by hand. A CENSUS WITH AN ANTIDOTE, not a sweep.
 *
 * *** SCANNED WITH codeOnly, AND THE FIRST VERSION WAS NOT. *** Reading raw text, this counted its own gate --
 * whose header EXPLAINS the regex in a comment and quotes it inside a message string -- and the number went
 * 9 -> 10 the moment I documented the finding. FIFTH TIME THIS ROUND'S OWN SHAPE LANDED ON THIS ROUND'S OWN
 * FILES. A hand-spelled corpus filter is a REGEX LITERAL IN CODE, which is neither a comment nor a string, so
 * codeOnly is the correct stripper here -- the opposite call from the mention scan above, and for the opposite
 * reason. (v3558: codeOnly for an IDIOM, noComments for TEXT THE CODE CONTAINS.)
 */
export function handSpelledCorpusFilters({ root = ENG } = {}) {
    const out = [];
    const self = new Set(selfExclusions());
    for (const f of walkTree(root)) {
        if (!/\.mjs$/.test(f) || /moduleRefs\.mjs$/.test(f) || self.has(f)) continue;
        let t; try { t = codeOnly(fs.readFileSync(f, "utf8")); } catch { continue; }
        if (/\/\\\.\(js\|mjs\|html\)\$\//.test(t)) out.push(rel(root, f));
    }
    return out.sort();
}

export const MEASURED_V3560 = {
    literalSpecifiersResolvingToAShader: 0,
    literalRouteNote:
        "THE OBVIOUS FIX WOULD HAVE FIRED ON NOTHING. Adding shader extensions to moduleRefs' specifier regex " +
        "matches zero, because every real shader load in this tree is COMPOSED -- pipeline.js does " +
        "readText('./shaders/' + file). A route that can never match is v3551's trap with the sign flipped, so " +
        "no route was added. What was missing was the CORPUS.",
    blindnessLocation:
        "moduleRefs is NOT narrow -- `files` is a parameter and resolveSpec tries the literal path first. NINE " +
        "CALLERS spell /\\.(js|mjs|html)$/ by hand, and a narrowing repeated in nine places reads from outside " +
        "as a property of the instrument. I told Keith the instrument was blind; it was the callers.",
    fetchRouteRefused: { shadersResolved: 0, treeWideResolved: 1, andThatOneIsAFalsePositive: true,
        note: "MY FIRST FIXTURE USED fetch AND WENT RED, CORRECTLY -- it is not one of the five routes, so my " +
              "claim that a literal shader specifier resolves today was overstated. Adding it was then measured " +
              "and REFUSED: 1329 relative fetch literals in this engine are HTTP ENDPOINTS, it resolves zero " +
              "shaders, and its single tree-wide hit is server.html's fetch('/brain/policy') completed to " +
              "brain/policy.js -- an API path read as a file. A NEW DEFECT SOLD AS A FIX. The fixture pins the " +
              "refusal so nobody adds it later because it looks obvious." },
    stripperSweep: { raw: { mentionedOnly: 9, unreferenced: 14 },
                     noComments: { mentionedOnly: 8, unreferenced: 15 },
                     codeOnly: { mentionedOnly: 3, unreferenced: 20 } },
    stripperNote:
        "codeOnly blanks STRINGS and loses all six of pipeline.js's composed loads; RAW TEXT rescues " +
        "shaders/voxel.vert.glsl on a mention inside main.js's CHANGELOG COMMENT -- v3449's founding defect, in " +
        "a new file type, still working. noComments keeps the loads and drops the changelog.",
    shaderCannotLoad:
        "A shader has no import, fetch or require, so a mention BY ANOTHER SHADER cannot be a load. " +
        "cloth-collision.wgsl and xpbd-distance.wgsl are named only by sibling shaders. Opposite news to the " +
        "six named by pipeline.js, and one mentioned-only count cannot separate them -- v3453's shape.",
    svoRaymarch:
        "physics/octree/svo-raymarch.glsl is 88 lines of WebGL2 whose own header names the test it is owed " +
        "(validate ray stepping on the rig against a CPU march through svoAt). Nothing loads it, and it was " +
        "invisible to every census in the tree. It is the reason this round exists.",
    notRatcheted:
        "A CENSUS, NOT DEBT. These files have never been in any count, so freezing a baseline today would " +
        "freeze my first look at them. Each is a judgement, one at a time -- v3451's instruction.",
};

// ---- FRONT DOOR -------------------------------------------------------------------------------------------------
export function reportLines() {
    const L = [];
    const r = shaderRefs();
    L.push("[shaderRefs] Does anything load this shader? -- the file type the orphan census could not see");
    L.push("");
    L.push("  " + r.shaderCount + " standalone shader files in a corpus of " + r.corpus +
           "   (registers excluded from the mention scan: " + r.excluded.join(", ") + ")");
    L.push("");
    const by = (s, k = null) => r.rows.filter((x) => x.state === s && (k === null || x.kind === k));
    L.push("  REFERENCED (a literal specifier resolves): " + by("referenced").length);
    for (const x of by("referenced")) L.push("    " + x.file + "   <- " + x.by.join(", "));
    if (!by("referenced").length)
        L.push("    *** NONE, AND THAT IS THE HEADLINE. Every real shader load in this tree is a COMPOSED path,");
    if (!by("referenced").length)
        L.push("    which no resolver may pretend to follow. The fixture proves the route CAN fire.");
    L.push("");
    L.push("  MENTIONED-ONLY / loader-capable (named in the CODE of a file that CAN load -- UNDECIDED): " +
           by("mentioned-only", "loader-capable").length);
    for (const x of by("mentioned-only", "loader-capable")) L.push("    " + x.file + "   <- " + x.mentions.join(", "));
    L.push("");
    L.push("  MENTIONED-ONLY / sibling-only (named ONLY by another shader -- A SHADER CANNOT LOAD ANYTHING): " +
           by("mentioned-only", "sibling-only").length);
    for (const x of by("mentioned-only", "sibling-only")) L.push("    " + x.file + "   <- " + x.mentions.join(", "));
    L.push("");
    L.push("  UNREFERENCED (nothing names it in code): " + by("unreferenced").length);
    for (const x of by("unreferenced")) L.push("    " + x.file);
    L.push("");
    const hand = handSpelledCorpusFilters();
    L.push("  " + hand.length + " callers still spell the corpus filter by hand rather than importing SOURCE_EXT:");
    for (const h of hand) L.push("    " + h);
    L.push("  (a census with an antidote -- as callers adopt it this falls; DO NOT RAISE THE NUMBER, and do not");
    L.push("   sweep all of them in one script, which is v3202's shape)");
    L.push("");
    L.push("  NOTHING IS RATCHETED. These files were in no count before today, so a baseline frozen now would");
    L.push("  freeze my first look at them. " + MEASURED_V3560.svoRaymarch);
    return L;
}

// A REPORTING TOOL MUST PRINT AND EXIT ZERO; the gate beside it is what exits nonzero.
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
