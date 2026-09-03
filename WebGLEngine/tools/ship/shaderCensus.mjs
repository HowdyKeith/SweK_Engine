// WebGLEngine/tools/ship/shaderCensus.mjs
// VERSION: v2 -- v4383 (v1 was v3274)
//
// HOW MANY SHADERS EXIST IN BOTH LANGUAGES, AND HOW FAR APART HAVE THEY DRIFTED.
//
// Keith raised Virtual-Machine/llvm-tutorial-book -- a working compiler front end -- and the reason it lands
// here is that SweK HAS THE PROBLEM AN IR SOLVES: some files carry WGSL, many more carry GLSL, and every effect
// that runs on both backends is AUTHORED TWICE. That is this project's signature defect (nine files declaring
// MODES, three declaring the gate walk) at its largest scale, in the place where drift is hardest to see,
// BECAUSE BOTH COMPILE AND BOTH LOOK RIGHT IN ISOLATION.
//
// *** BUT AN IR THAT COVERS 80% OF THE SHADERS LEAVES YOU MAINTAINING THREE THINGS -- GLSL, WGSL, AND A COMPILER
// THAT HANDLES MOST CASES. THAT IS WORSE THAN TWO. *** So this counts before anything is built: four near-
// identical pairs means the IR is over-engineering; twenty pairs with three disagreeing means it is overdue AND
// three bugs were found on the way. Same move as v3262's settings census.
//
// ---- *** v4383 -- THE COUNT THIS FILE FEEDS IS A TRIGGER FOR AN ARCHITECTURAL DECISION, AND IT WAS MEASURED
// ---- WITH AN INSTRUMENT THAT COUNTED THE WORD RATHER THAN THE LANGUAGE. ***
//
// v1 classified a file by testing its RAW SOURCE for six tokens, two of which -- the GLSL storage qualifiers
// spelled a-t-t-r-i-b-u-t-e and v-a-r-y-i-n-g -- are also ordinary English and ordinary JavaScript. Measured
// across this tree at v4383: FOUR of the fourteen files it called shader PAIRS carry no GLSL at all, and
// SEVENTY-TWO of the hundred and sixty-nine it called GLSL-only carry NO SHADER SOURCE OF ANY KIND. main.js and
// brain/brain.js were in that seventy-two, on changelog prose about HTML attributes. render/bloomFused.mjs was
// called a pair on the sentence "attribute any difference to the SAMPLING" -- the English verb.
//
// *** AND THE CORRECTION RUNS BOTH WAYS, WHICH IS THE PART THAT MAKES IT A FIX AND NOT A TRIM. *** classify()
// also finds TWO GLSL files v1 could not see -- render/atmosphere.mjs and render/solidTexture.mjs, three.js
// ShaderMaterial passes that carry no version directive because three prepends it. backendParity learned that
// at v4270 by tripping over badTvPass; this census never did. An instrument that was only ever too loose would
// have been easier to trust.
//
// THE FILE ALREADY KNEW, ONE DIRECTORY OVER. render/backendParity.mjs classify() has been reading this tree's
// shader languages since v4269 and gets both halves right. Two shader-language censuses stood here with
// different answers, and the one the IR trigger reads was the worse one. So this file no longer owns
// detectors: it walks, and classify() decides. Same move as singleSource's -- ONE DEFINITION, and the better
// of the two already existed.
//
// *** AND THE REASON IT IS BETTER IS NOT THE ONE THAT WAS OBVIOUS. *** classify() strips comments; v1 did not;
// this tree's instrument rule says that is the fix, and IT IS NOT. Measured by turning the stripping off and
// re-running: the pair count does not move at all, and five single-language files change hands. What moved the
// headline number is the MARKERS -- a version directive and a uniform declaration cannot occur in a sentence,
// where a-t-t-r-i-b-u-t-e and v-a-r-y-i-n-g are sentences all by themselves. The habit would have got the right
// answer here for the wrong reason, and the wrong reason would have been carried forward.
//
// The self-exclusion is gone with them. v1 skipped its own filename because its detectors were string literals
// and it counted itself; with the markers assembled inside backendParity there is nothing here to match, and
// shaderCensus-selfcheck's "a file that MENTIONS both is not a file that IMPLEMENTS both" check now proves
// that on every run instead of a hard-coded name asserting it.

import fs from "node:fs";
import path from "node:path";
import { classify, LANG, WGSL_MARKS, GLSL_MARK, GLSL_TELL } from "../../render/backendParity.mjs";
import { prose } from "./sourceScan.mjs";

// Gates are excluded because a selfcheck quoting a shader is not a shader; vendor and node_modules because
// they are not this tree's to translate. THIS IS AN EXCLUSION, NOT A DEFINITION OF WHICH FILES ARE GATES --
// singleSource-selfcheck carries that exemption by hand and by name.
const SKIP = /node_modules|[\\/]vendor[\\/]|-selfcheck\.mjs$/;

/**
 * Which files author WGSL, which author GLSL, which author both -- judged from CODE.
 *
 * `mentionOnly` is the population that made v1 wrong: a file whose COMMENTS claim a language its code does not
 * contain. It is returned rather than silently dropped, because the whole failure this census exists to catch
 * is a number nobody re-derives, and "how many files talk about a shader without shipping one" is the number
 * that says whether the instrument is reading text or reading code.
 */
export function shaderCensus(root) {
    const both = [], wgslOnly = [], glslOnly = [], mentionOnly = [];
    const walk = (dir) => {
        let ents = [];
        try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            const p = path.join(dir, e.name);
            if (SKIP.test(p) || e.name.startsWith(".")) continue;
            if (e.isDirectory()) { walk(p); continue; }
            if (!/\.(js|mjs)$/.test(e.name)) continue;
            let src = "";
            try { src = fs.readFileSync(p, "utf8"); } catch { continue; }
            const rel = path.relative(root, p);
            // *** A CHEAP GATE BEFORE THE EXPENSIVE ONE, AND IT IS NOT AN OPTIMISATION FOR ITS OWN SAKE. ***
            // prose() is the full lexer and this walk sees 2,265 files; running it on all of them put the gate
            // over the quick sweep's 3 s budget at v4383 -- out of the sweep that runs every round and into the
            // full one that runs rarely. A file whose RAW text holds no marker at all cannot hold one in its
            // code or in its comments either, since both are subsets of the raw text, so it is skipped whole.
            if (!(src.includes(GLSL_MARK) || WGSL_MARKS.some((m) => src.includes(m)) || GLSL_TELL.test(src))) continue;
            const code = classify(src);
            if (code === LANG.BOTH) both.push(rel);
            else if (code === LANG.WGSL) wgslOnly.push(rel);
            else if (code === LANG.GLSL) glslOnly.push(rel);
            // The comments alone, through the same classifier. A file whose prose names a language its code
            // does not carry is a MENTION; v1 counted 74 of these as shaders.
            let said = LANG.NONE;
            try { said = classify(prose(src)); } catch { said = LANG.NONE; }
            if (said !== LANG.NONE && said !== code && code !== LANG.BOTH) mentionOnly.push(rel);
        }
    };
    walk(root);
    return { both, wgslOnly, glslOnly, mentionOnly };
}

/**
 * How far apart are the two halves of a file that speaks both?
 *
 * *** THIS DELIBERATELY DOES NOT DIFF THE TEXT. *** GLSL and WGSL are different languages; their sources SHOULD
 * differ everywhere, and a character diff would report 90% and mean nothing. What is comparable is the SHAPE:
 * the numeric literals each half uses. IF ONE SIDE TUNES A CONSTANT AND THE OTHER DOES NOT, THE PICTURES
 * DIVERGE WHILE BOTH STILL COMPILE -- and that is the whole failure this census is for.
 */
export function pairShape(src) {
    const nums = (s) => [...new Set((s.match(/-?\d+\.\d+/g) || []))].sort();
    // Split on the first WGSL entry point: crude, and STATED AS CRUDE. A file interleaving both languages would
    // defeat it, and the count below says how many files that applies to so nobody trusts it blindly.
    //
    // *** THE MARKERS COME FROM backendParity AND THE SPLIT PATTERN IS ASSEMBLED, BECAUSE REMOVING THE
    // SELF-EXCLUSION CAUGHT THIS FILE COUNTING ITSELF A SECOND TIME. *** v1's skip list named this filename, so
    // nobody ever learned that pairShape's split -- written as a regex LITERAL holding all three stage
    // attributes -- made the census a WGSL file by its own detectors. The classifier moved out and the census
    // still matched, on the ONE marker left behind. A name in a skip list hides every reason it was added.
    const i = Math.min(...[...WGSL_MARKS, "fn" + " main("].map((m) => {
        const at = src.indexOf(m);
        return at < 0 ? Infinity : at;
    }));
    if (!Number.isFinite(i)) return null;
    const a = nums(src.slice(0, i)), b = nums(src.slice(i));
    const shared = a.filter((x) => b.includes(x));
    const onlyGlsl = a.filter((x) => !b.includes(x));
    const onlyWgsl = b.filter((x) => !a.includes(x));
    return { glslConstants: a.length, wgslConstants: b.length, shared: shared.length,
             onlyGlsl, onlyWgsl };
}
