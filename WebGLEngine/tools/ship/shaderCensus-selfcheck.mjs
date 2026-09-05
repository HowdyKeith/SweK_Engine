// WebGLEngine/tools/ship/shaderCensus-selfcheck.mjs
//
// Run: node tools/ship/shaderCensus-selfcheck.mjs   (~0.5s -- MEASURED)
//
// v3274 -- COUNT BEFORE BUILDING A COMPILER.
//
// Keith raised Virtual-Machine/llvm-tutorial-book (Crystal, ~56 stars, "lexer, parser and code generator are
// functional... chapter texts remain incomplete" -- a project that states which parts work) and asked the right
// question underneath it: compilers use an intermediate representation, and SweK writes shaders for TWO
// BACKENDS. Authoring once and emitting twice is exactly what an IR is for, and DRIFT BETWEEN TWO HAND-WRITTEN
// HALVES IS THIS PROJECT'S SIGNATURE DEFECT in the place it is hardest to see -- both compile, both look right.
//
// *** THE CENSUS SAYS NO, AND THE NUMBER IS THE ARGUMENT. *** The files that author both are counted here; the
// rest are single-language and never needed translating. An IR that covered 80% of ten files would leave GLSL,
// WGSL AND A COMPILER to maintain: THREE THINGS INSTEAD OF TWO.
//
// SAME MOVE AS v3262's SETTINGS CENSUS. Count first, especially when the thing to build is a compiler.
//
// ---- *** v4383 -- THE COUNT WAS THE TRIGGER FOR AN ARCHITECTURAL DECISION AND THE TRIGGER WAS MISREAD. ***
//
// v4380's register audit found this gate saying FOURTEEN where its entry said 4, and left the judgement for a
// round of its own: has the arithmetic inverted? It has not, and the reason is that four of the fourteen were
// never pairs. The census classified by testing RAW SOURCE for six tokens, two of which -- GLSL's storage
// qualifiers -- are ordinary English. render/bloomFused.mjs was a "shader pair" on the sentence "attribute any
// difference to the SAMPLING". SEVENTY-TWO of the 169 called GLSL-only carry no shader source at all, main.js
// and brain/brain.js among them. The census now delegates to render/backendParity.mjs classify(), which has
// read this tree's shader languages correctly since v4269, one directory over. IT CORRECTS UPWARD TOO: two
// three.js ShaderMaterial passes (render/atmosphere.mjs, render/solidTexture.mjs) carry no version directive
// because three prepends it, and v1 called them nothing at all.
//
// *** THE INSTRUMENT RULE WOULD HAVE BEEN RIGHT FOR THE WRONG REASON, AND A SABOTAGE SAID SO. *** Turning
// classify()'s comment stripping OFF costs this gate ZERO RED: the pair count does not move and five
// single-language files change hands, which is the mention-only line below. Comments were never what made the
// count wrong -- the MARKERS were. A version directive and a uniform declaration cannot occur in a sentence.
//
// THE HONEST NUMBERS: 10 both, 23 WGSL-only, 99 GLSL-only. The trigger v3274 named is TWENTY. Three to ten in
// eleven hundred rounds is a real climb and it is not the inversion, so THE COMPILER STAYS UNBUILT -- and the
// reason is now a measurement rather than a number nobody re-derived. What DID change is that the three-stage
// shape has been re-opened anyway, without an IR of this tree's own: docs/TSL-ROADMAP.md's step 4 says TSL is
// a three-stage shape SOMEBODY ELSE MAINTAINS -- the graph is the IR and three's two builders are the emitters
// -- which is the answer v3274 could not have written, because it costs no compiler at all.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { noComments } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const { shaderCensus, pairShape } = await import(pathToFileURL(path.join(HERE, "shaderCensus.mjs")).href);
const c = shaderCensus(ROOT);

{
    // ==========================================================================================================
    // *** v4414 -- THIS ASSERTION WAS RED FOR ~200 ROUNDS AND IT WAS MEASURING THE WRONG POPULATION. ***
    //
    // It gated `both.length <= 3` -- files whose TEXT contains markers of both languages -- as a proxy for
    // "how many shader pairs would an IR replace". Those are different questions, and
    // tools/ship/shaderPairs-selfcheck.mjs measures the gap: of the 14 files counted here, FIVE duplicate a
    // computation, two share only an entry-point name, and SEVEN share nothing at all.
    //
    // WORSE, THE POPULATION INCLUDES THE MACHINERY THAT WOULD BE THE IR. render/tslSource.mjs holds eleven
    // GLSL markers because it EMITS GLSL, so BUILDING THE IR RAISES THIS COUNT. A trigger that fires harder
    // the more the problem is solved cannot be the thing anyone acts on, and this one never fired for that
    // reason: v4380 watched it climb from 4 to 14 and correctly refused to draw the conclusion.
    //
    // SO THE INSTRUMENT IS REPLACED, NOT THE THRESHOLD WIDENED. The co-occurrence count is still REPORTED --
    // it was never wrong about what it measured -- and what is GATED is the count that bears on the decision.
    // ==========================================================================================================
    const { classifyPairs } = await import(pathToFileURL(path.join(HERE, "shaderPairs.mjs")).href);
    const pairs = classifyPairs(ROOT);
    const DUPLICATION_BASELINE = 5;   // v4414 -- MEASURED, in the units the claim is actually about.
    ok("!! *** only " + pairs.duplication.length + " files DUPLICATE a computation across the two languages ***",
        pairs.duplication.length <= DUPLICATION_BASELINE,
        pairs.duplication.map((r) => r.file).join(", ") + " -- against " + c.both.length +
        " that merely CO-OCCUR (" + pairs.disjoint.length + " of those share no function name at all, and two " +
        "of them are the author-once machinery itself). AN IR FOR FIVE CONSUMERS WOULD STILL BE A THIRD THING " +
        "TO MAINTAIN BESIDE THE TWO IT REPLACED. If THIS count climbs toward twenty the arithmetic inverts -- " +
        "and note that the three-stage shape v3274 pointed at was re-opened anyway, at v4319-v4320, and has " +
        "shipped ten rounds through render/tslSource.mjs since");

    ok("  ...and the co-occurrence count is still reported, because it was never wrong about what it measured",
        c.both.length >= pairs.duplication.length,
        c.both.length + " files carry text in both languages, against " + c.wgslOnly.length + " WGSL-only and " +
        c.glslOnly.length + " GLSL-only. THE NUMBER IS TRUE AND IT IS NOT THE DECISION'S NUMBER, which is the " +
        "whole finding of v4414 -- see tools/ship/shaderPairs-selfcheck.mjs");

    // *** v4470 MERGE -- BOTH INSTRUMENTS KEPT, BECAUSE THEY ANSWER DIFFERENT QUESTIONS. ***
    // The gate above is v4414's: what is GATED is the count that bears on the decision (files that actually
    // DUPLICATE a computation), because co-occurrence rises when the IR is built and a trigger that fires
    // harder the more the problem is solved cannot be acted on. What follows is main's v4383: v3274's OWN
    // named inversion point, held as its own assertion, and the instrument check that keeps raw-text
    // classification from creeping back. main's DUAL_BASELINE assertion is deliberately NOT carried over --
    // gating co-occurrence is the thing v4414 measured to be the wrong population -- but the number it
    // watched is still reported by the check above, so nothing is lost by dropping the threshold on it.
    const INVERSION = 20;   // v3274's own word: "if this count climbs toward twenty the arithmetic inverts"

    // *** THE TRIGGER, STATED AS ITS OWN CHECK SO IT CANNOT BE CONFUSED WITH THE BASELINE ABOVE. *** The
    // baseline says "nothing new has been hand-written since"; THIS says "the argument still holds at all".
    // Two thresholds under one assertion is how a drifting counter gets quietly re-based to wherever it landed.
    ok("!! ...and the count has NOT reached the inversion point v3274 named",
        c.both.length < INVERSION,
        c.both.length + " of " + INVERSION + ". At twenty, hand-writing the pair stops being cheaper than " +
        "lowering to an IR, and THAT is when to re-open llvm-tutorial-book's three-stage shape: parse, lower " +
        "to an IR, emit per target. docs/TSL-ROADMAP.md step 4 is the version of that answer which costs no " +
        "compiler: three's node graph IS the IR and its two builders ARE the emitters, maintained elsewhere");

    // *** THE INSTRUMENT CHECK, AND IT IS THE ONE THIS GATE WAS MISSING FOR ELEVEN HUNDRED ROUNDS. *** v1's
    // detectors are re-created HERE -- in a gate, where a shader token in a literal is harmless -- and the
    // census is held to DISAGREEING with them. If somebody puts raw-text classification back, this goes red
    // naming the phantom files rather than the count silently jumping again.
    const RAW_WGSL = /@compute\b|@fragment\b|@vertex\b|fn\s+main\s*\(|var<storage|var<uniform/;
    const RAW_GLSL = /gl_FragColor|gl_Position|precision\s+(highp|mediump|lowp)|\bvarying\b|\battribute\b|#version\s+300/;
    const rawBoth = [], rawGlsl = [];
    const walk = (dir) => {
        let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            const p = path.join(dir, e.name);
            if (/node_modules|[\\/]vendor[\\/]|-selfcheck\.mjs$|shaderCensus\.mjs$/.test(p) || e.name.startsWith(".")) continue;
            if (e.isDirectory()) { walk(p); continue; }
            if (!/\.(js|mjs)$/.test(e.name)) continue;
            let s = ""; try { s = fs.readFileSync(p, "utf8"); } catch { continue; }
            const w = RAW_WGSL.test(s), g = RAW_GLSL.test(s), rel = path.relative(ROOT, p);
            if (w && g) rawBoth.push(rel); else if (g) rawGlsl.push(rel);
        }
    };
    walk(ROOT);
    const phantomPairs = rawBoth.filter((f) => !c.both.includes(f));
    const phantomGlsl = rawGlsl.filter((f) => !c.glslOnly.includes(f) && !c.both.includes(f));
    ok("!! ...and the census reads CODE, not the word -- " + (phantomPairs.length + phantomGlsl.length) +
        " files the raw-text detectors would miscount",
        phantomPairs.length > 0 && !phantomPairs.some((f) => c.both.includes(f)) &&
        !phantomGlsl.some((f) => c.glslOnly.includes(f)),
        "phantom PAIRS (" + phantomPairs.length + "): " + phantomPairs.join(", ") + " -- phantom GLSL (" +
        phantomGlsl.length + "), among them " + phantomGlsl.filter((f) => /^(main\.js|brain\/brain\.js|tools\/ship\/sourceScan\.mjs)$/.test(f)).join(", ") +
        ". Two of v1's six GLSL tokens are ordinary English, so a changelog paragraph about an HTML attribute " +
        "read as a shader. IF THIS EVER REACHES ZERO PHANTOMS the check has stopped exercising anything and " +
        "the raw detectors above have been quietly aligned with the real ones");

    ok("!! ...and a file that MENTIONS both is not a file that IMPLEMENTS both",
        // v4383 -- THIS IS NOW A LIVE CHECK. v1 hard-coded its own filename into the census's SKIP list, so the
        // assertion could not fail and nobody learned that pairShape's split pattern -- a regex literal holding
        // all three stage attributes -- was STILL making the census a WGSL file by its own detectors. The name
        // came out of the skip list, the second self-count appeared immediately, and the markers are assembled
        // now. A NAME IN A SKIP LIST HIDES EVERY REASON IT WAS ADDED, not just the one somebody wrote down.
        !c.both.some((f) => /shaderCensus\.mjs$/.test(f)) && !c.wgslOnly.some((f) => /shaderCensus\.mjs$/.test(f)) &&
        !c.glslOnly.some((f) => /shaderCensus\.mjs$/.test(f)),
        "THE CENSUS MATCHED ITSELF ON ITS FIRST RUN -- its detectors were string literals, so it counted itself " +
        "as a shader pair. A TOOL COUNTING ITSELF AS AN INSTANCE OF THE THING IT COUNTS is the same error as " +
        "the gate that read its own warning text, six times over in this tree");

    // The population that made v1 wrong, reported live: files whose COMMENTS name a language their code does
    // not carry. Reported rather than gated -- prose about shaders is a good thing to write and this number
    // rises as the tree explains itself. What matters is that none of them is COUNTED, which is asserted above.
    ok("...and files that only TALK about a shader are named rather than counted",
        c.mentionOnly.every((f) => !c.both.includes(f) && !c.wgslOnly.includes(f) && !c.glslOnly.includes(f)),
        c.mentionOnly.length + " mention-only: " + c.mentionOnly.join(", ") + " -- classify()'s markers are " +
        "rarely written in prose, which is why this is 5 and v1's equivalent population was 74");

    // THE DRIFT NUMBERS ARE REPORTED, NOT ASSERTED, AND THE METHOD IS STATED AS CRUDE ON PURPOSE.
    // GLSL and WGSL SHOULD differ everywhere -- they are different languages -- so a text diff would say 90% and
    // mean nothing. What is comparable is the numeric constants each half uses: if one side tunes a value and
    // the other does not, THE PICTURES DIVERGE WHILE BOTH STILL COMPILE.
    const lines = [];
    for (const f of c.both) {
        // THROUGH noComments, AND NOT ONLY BECAUSE gateQuality ASKS. A shader file's comments are full of
        // numbers -- tuning notes, dates, version markers -- and pairShape compares NUMERIC CONSTANTS, so
        // comment text was polluting the very measurement. THE INSTRUMENT RULE PAID FOR ITSELF AGAIN.
        const s = pairShape(noComments(fs.readFileSync(path.join(ROOT, f), "utf8")));
        if (s) lines.push(f + ": shared " + s.shared + ", one-sided " + (s.onlyGlsl.length + s.onlyWgsl.length));
    }
    ok("...and the constant overlap per pair is reported for a human to judge",
        lines.length === c.both.length,
        lines.join(" | ") + ". THE SPLIT IS CRUDE -- it cuts at the first WGSL entry point and a file " +
        "interleaving both languages would defeat it -- SO IT IS REPORTED RATHER THAN GATED. A drift number " +
        "nobody can trust would be worse than none");
}

console.log();
console.log("  ----  THE VERDICT: DO NOT BUILD THE COMPILER. Ten files is not a translation problem, it is ten");
console.log("  ----  files, and four of the fourteen that used to be counted here were English prose. What DOES");
console.log("  ----  transfer from llvm-tutorial-book is its honesty about which parts work -- and its");
console.log("  ----  three-stage shape, which TSL already supplies without this tree maintaining any of it.");
if (fails) { console.log("shaderCensus-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("shaderCensus-selfcheck: all checks pass");
