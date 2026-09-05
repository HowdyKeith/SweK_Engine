// tools/ship/pageRequirements-selfcheck.mjs
//
// Run: node tools/ship/pageRequirements-selfcheck.mjs   (~0.1s)
//
// v3170 -- TERASOLOGY'S module.txt IDEA: A COMPONENT STATES ITS OWN REQUIREMENTS.
//
// Their modules carry a module.txt declaring dependencies instead of a build file. THE PART THAT TRANSFERS IS
// NOT THE FILE FORMAT -- it is that a component states what it needs instead of leaving it to be discovered.
//
// MEASURED BEFORE BUILDING: 49 pages in the render-qa manifest and ZERO declaring anything. Its keys are
// name / url / canvas / wait / checks / ... -- ALL ABOUT HOW TO TEST A PAGE, NONE ABOUT WHAT IT NEEDS TO RUN.
//
// *** THE TREE HAS PAID FOR THIS TWICE ALREADY. *** population.html was a pure planner that never made a GL
// context, so nothing would ever have compiled its shaders (v3120). economy.html was linked from server.html
// and absent from the manifest (v3135). Both are "nobody knew what this page needed", and both were found by
// accident rather than by asking.
//
// *** DERIVED, NEVER TYPED. *** A hand-written needs:["webgl2"] would be a SECOND DECLARATION ABOUT ONE THING,
// and this session has found that shape five times. The requirement is READ FROM THE PAGE, so it cannot
// disagree with the page.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const P = await import(pathToFileURL(path.join(ENG, "tools", "render-qa", "pageRequirements.mjs")).href);

const rows = P.manifestRequirements(ENG);
const tally = {};
for (const r of rows) for (const n of (r.needs || [])) tally[n] = (tally[n] || 0) + 1;

// ---- 1. EVERY MANIFEST PAGE RESOLVES, AND ITS NEEDS ARE READ FROM IT ------------------------------------------
{
    ok("!! every page in the manifest is readable and classified",
        rows.length > 40 && rows.every((r) => r.ok),
        rows.length + " pages, 0 unreadable. A page the manifest names and the tree does not have is a broken " +
        "row that render-qa would open as a 404 and judge as a failure");

    ok("!! the capability tally is DERIVED from source, not declared",
        Object.keys(tally).length >= 3 && tally.webgl2 > 5,
        Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + "=" + v).join(", ") +
        ". Before this, ZERO of 49 declared anything -- the manifest said how to TEST a page and never what it " +
        "NEEDS");

    ok("!! a page that cannot be READ has UNKNOWN needs, not none",
        (() => { const r = P.requirementsOf(path.join(ENG, "no-such-page-xyzzy.html"));
                 return r.ok === false && r.needs === null && !!r.why; })(),
        "returning [] would read as 'needs nothing', THE MOST PERMISSIVE POSSIBLE ANSWER TO A QUESTION THAT " +
        "FAILED -- and a headless box would then open a page it cannot judge and call the result a verdict");
}

// ---- 2. THE POINT: A BOX KNOWS WHAT IT IS NOT ENTITLED TO AN OPINION ABOUT ----------------------------------------
{
    const j = P.judgeable(rows, ["bridge", "worker", "wasm", "audio"]);
    ok("!! a headless box can name the pages it CANNOT judge, before opening them",
        j.can.length > 20 && j.cannot.length > 5 && j.can.length + j.cannot.length === rows.length,
        j.can.length + " judgeable, " + j.cannot.length + " not, on a box with no GPU and no camera. v3120 " +
        "established that UNSUPPORTED and FAILED must stay apart -- one word for 'this laptop has no float " +
        "targets' and 'this shader is broken' makes every limited machine look defective. THAT DISTINCTION " +
        "LIVED INSIDE ONE PAGE; now it is a property of the RUN");

    ok("...and each unjudgeable page names WHICH capability is missing",
        j.cannot.every((r) => Array.isArray(r.missing) && r.missing.length > 0),
        j.cannot.slice(0, 3).map((r) => r.name + "[" + r.missing.join(",") + "]").join(" ") +
        ". 'cannot judge' is not an answer; 'cannot judge, needs webgpu' sends somebody to a machine that has one");

    ok("!! a FULLY capable box can judge everything",
        P.judgeable(rows, Object.keys(P.CAPABILITIES)).cannot.length === 0,
        "the classification must not exclude a page from a box that genuinely has everything -- a filter that " +
        "matched nothing would be v3126's renderQaDoor failure, where a green run over ZERO pages is the " +
        "failure that looks most like success");
}

// ---- 3. THE PROBES LOOK FOR CALLS, NOT FOR PROSE ----------------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(ENG, "tools", "render-qa", "pageRequirements.mjs"), "utf8");
    ok("!! comments are stripped before any probe runs",
        /replace\(\/<!--\[\\s\\S\]\*\?-->\/g/.test(src) && /const strip =/.test(src),
        "v3153 and v3169 each caught a check counting ITS OWN WARNING as the thing it warns about. This file " +
        "would have been the third: it names every capability it detects, in comments, above the detector");

    ok("!! a page that only MENTIONS a capability does not require it",
        (() => {
            const tmp = path.join(ENG, "tools", "render-qa", ".__req_probe.html");
            fs.writeFileSync(tmp, "<!-- this page talks about getContext('webgl2') in a comment -->\n<p>webgl2</p>");
            const r = P.requirementsOf(tmp);
            fs.rmSync(tmp, { force: true });
            return r.ok && r.needs.length === 0;
        })(),
        "PLANTED AND SHOWN FAILING rather than assumed: a comment naming the call, and the bare word in body " +
        "text, both produce NO requirement. Every probe looks for the CALL");
}

console.log();
// ---- v3171: THE RUNNER USES IT, AND ONLY WHEN TOLD ----------------------------------------------------------
// v3170 derived the requirements and stopped short of using them, deliberately -- and its closing note said so.
// THAT NOTE IS NOW WRONG AND IS REPLACED RATHER THAN LEFT: a trailer describing an undone thing that got done
// is a stale claim in the file most likely to be believed.
{
    const runner = fs.readFileSync(path.join(ENG, "tools", "render-qa", "render-qa.mjs"), "utf8");

    ok("!! the runner can skip what it cannot judge",
        /--have/.test(runner) && /manifestRequirements/.test(runner) && /judgeable\(/.test(runner),
        "v3120's law moved UP A LEVEL: it established that UNSUPPORTED and FAILED must stay apart, and that " +
        "distinction lived INSIDE one page. A box now states what it HAS, and every page it cannot judge is " +
        "named BEFORE the browser opens it");

    ok("!! *** with no --have flag NOTHING is skipped ***",
        /if \(HAVE\.length\) \{/.test(runner) && /const HAVE = \(arg\("--have", ""\)/.test(runner),
        "opt-in, and that is not timidity: A RUNNER THAT QUIETLY SKIPPED PAGES would be the failure " +
        "renderQaDoor already names. You must SAY what the box has before it may excuse itself from anything");

    ok("!! an EMPTY page set after filtering EXITS NONZERO",
        /NO\s+PAGES\s+LEFT\s+after\s+capability\s+filtering/.test(runner) && /process\.exit\(1\)/.test(runner),
        "v3126's renderQaDoor law: A FILTER THAT MATCHES NOTHING EXITS NONZERO, because a green run over ZERO " +
        "pages is the failure that looks most like success -- and one typo in --have produces exactly that");

    ok("...and the skipped pages are NAMED, not counted",
        /CANNOT JUDGE \$\{r\.name\} -- needs \$\{r\.missing\.join/.test(runner),
        "'17 skipped' tells you nothing; 'water needs webgl2, float_target' tells you which machine to move to");

    // *** v4452 -- AND THE BUTTON CAN REACH IT NOW, WHICH IT COULD NOT FOR THE FLAG'S WHOLE LIFE. ***
    // Every line above checks the RUNNER. renderQaBridge.run() destructured {only, updateBaselines, base,
    // video, all} and nothing else, so the mechanism v3171 built existed and server.html could not send it --
    // v3563's own words while fixing the flag beside it: "A FRONT DOOR THAT CANNOT REACH A FLAG THE TOOL
    // DOCUMENTS IS HALF A DOOR." MEASURED at v4452: 36 of this tree's 38 GPU-shaped pages derive "needs
    // webgpu", and on a box with no adapter every one comes back FAILED rather than unjudgeable -- 36 red
    // results that mean nothing, which is how a report stops being read.
    const bridge = fs.readFileSync(path.join(ENG, "ai-bridge", "renderQaBridge.js"), "utf8");
    const page = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
    ok("!! *** the bridge accepts --have and passes it through ***",
        /function run\(\{ only, updateBaselines, base, video, all, have \}/.test(bridge) &&
        /args\.push\("--have", String\(have\)\)/.test(bridge),
        "destructured AND pushed: an option a function accepts and never forwards is the same dead control " +
        "one layer in, and harder to see");
    ok("!! ...and the page offers it, on the ONE path both run buttons share",
        /id="rqHave"/.test(page) && (page.match(/getElementById\("rqHave"\)/g) || []).length >= 2,
        "read in rqStart (the per-page and subset runs) and in the full-sweep button, from a single input -- " +
        "two inputs would let a sweep and a single-page run disagree about what the box is claimed to have");
    // v4452 -- AND THE DETECTOR ITSELF, WHICH NOTHING ASSERTED. Sabotage E removed the import tell and every
    // gate stayed green: the two pages it misclassifies are named here so the widening cannot be undone in
    // silence. DERIVED by running the classifier, not by trusting a list.
    // v4461 -- pathToFileURL, not a raw path: on Windows path.join yields "C:\\...\\x.js" and dynamic import()
// requires a file:// URL, so this line CRASHES ON THE BOX THIS ENGINE IS DEVELOPED ON. Caught by
// tools/ship/windowsImport-selfcheck.mjs, which exists for exactly this and had been red on it.
    // THIS ONE IS v4452'S, added three rounds ago for the import-tell assertion below.
    const { requirementsOf } = await import(pathToFileURL(path.join(ENG, "tools", "render-qa", "pageRequirements.mjs")).href);
    const viaImport = ["gfx-device.html", "nebula-device.html"];
    const got = viaImport.map((f) => ({ f, needs: (requirementsOf(path.join(ENG, f)).needs || []) }));
    ok("!! *** a page whose device comes from an IMPORT is still derived as needing webgpu ***",
        got.every((g) => g.needs.includes("webgpu")),
        got.map((g) => g.f + " -> [" + g.needs.join(",") + "]").join("; ") +
        ". These hold their WGSL in a string and call gfx/device.js, which asks navigator.gpu four times. " +
        "Matching only the direct call left them RUN AND FAILED on a box with no adapter -- the collapse of " +
        "unsupported into broken that the whole --have mechanism exists to prevent");

    ok("...and blank still means skip nothing",
        /\|\|""\)\.trim\(\)\|\|undefined/.test(page.replace(/\s/g, "")),
        "an empty box must send NO flag rather than an empty one, so the default behaviour is unchanged and " +
        "a green run still covers every page unless somebody said otherwise");
}

console.log();
console.log("  ----  STILL NOT DONE (v4452: the flag is REACHABLE now, the set is still typed): a box could");
console.log("  ----  DETECT its own capabilities rather than be told them. Not built this round because");
console.log("  ----  Playwright is not installed in the sandbox it was written in, and shipping a");
console.log("  ----  browser-launching probe nothing here can run is the untested-code this tree refuses.");
console.log("  ----  The older note, still true about the remaining half:");
console.log("  ----  own capabilities, but detection from Node cannot see a GPU the browser will get, so the");
console.log("  ----  honest version of that needs the browser to report back -- a different round.");
if (fails) { console.log("pageRequirements-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("pageRequirements-selfcheck: all checks pass");
