#!/usr/bin/env node
// tools/ship/cssKeyframes-selfcheck.mjs -- v4222
//
// Run: node tools/ship/cssKeyframes-selfcheck.mjs      (pure, no DOM, no CSSOM)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES fx/cssKeyframes.mjs, and it does it against THE TREE'S OWN 82 @keyframes RULES rather than a fixture.
// That is the whole point: v4191 took the other half of this idea from gibbok/animatelo, measured the corpus
// that motivated it, and converted none of it. A converter tested only on examples it was written for proves
// nothing about the 82 rules that are actually here.
import {
    stripComments, offsetOf, camelCase, parseDeclarations, findKeyframeBlocks, parseKeyframeBody,
    toKeyframes, convert, waapiProblems, isPartial,
} from "../../fx/cssKeyframes.mjs";
import { validateKeyframes } from "../../ui/domAnimation.mjs";
import { codeOnly } from "./sourceScan.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("cssKeyframes-selfcheck -- the tree's own animations, read as data\n");

// ---- 1. OFFSETS --------------------------------------------------------------------------------------------
console.log("1. the selector is the offset");
{
    ok("from is 0 and to is 1", offsetOf("from") === 0 && offsetOf("to") === 1);
    ok("percentages divide by 100", offsetOf("50%") === 0.5 && offsetOf("0%") === 0 && offsetOf("100%") === 1);
    ok("decimal percentages work -- 12.5% is a real thing people write", offsetOf("12.5%") === 0.125);
    ok("case and whitespace do not matter", offsetOf("  FROM ") === 0 && offsetOf(" 25% ") === 0.25);
    ok("!! anything else is null, NOT 0 -- a silent 0 would animate at the wrong time",
        offsetOf("50") === null && offsetOf("half") === null && offsetOf("") === null && offsetOf("%") === null);
}

// ---- 2. THE PROPERTY NAME ----------------------------------------------------------------------------------
console.log("\n2. *** THE VENDOR-PREFIX CASE, WHICH keyframes-tool GETS WRONG ***");
{
    ok("hyphenated properties become camelCase", camelCase("background-color") === "backgroundColor");
    ok("...including three-part names", camelCase("border-top-left-radius") === "borderTopLeftRadius");
    // gibbok's regex is /[-_]([a-z])/g -> uppercase, with no case for a LEADING dash.
    const theirs = (s) => s.replace(/[-_]([a-z])/g, (m) => m[1].toUpperCase());
    ok("!! *** -webkit-transform is webkitTransform, NOT WebkitTransform ***",
        camelCase("-webkit-transform") === "webkitTransform",
        `keyframes-tool's regex gives "${theirs("-webkit-transform")}", which WAAPI ignores outright`);
    ok("...and the two really do differ, so this is not a hypothetical",
        theirs("-webkit-transform") !== camelCase("-webkit-transform"));
    // *** THE CHECK ABOVE DOES NOT ACTUALLY TEST THE LEADING-DASH BRANCH. *** Slicing the dash off before the
    // hyphen regex already leaves a lower-case `w`, so lower-casing the first character afterwards is a no-op
    // for `-webkit-`. Removing that branch left this whole file green. The branch only bites when the prefix
    // is written with a capital, which is where it is now pinned.
    ok("!! a CAPITALISED prefix is still lower-cased -- the branch the -webkit- case cannot reach",
        camelCase("-Webkit-transform") === "webkitTransform", 'without it: "WebkitTransform"');
    ok("a CSS custom property keeps its name exactly", camelCase("--swek-accent") === "--swek-accent");
    ok("an already-camelCase name is unchanged", camelCase("opacity") === "opacity");
}

// ---- 3. COMMENTS -------------------------------------------------------------------------------------------
console.log("\n3. *** STRIPPING COMMENTS WITHOUT EATING STRINGS, AND WITHOUT EATING THE FILE ***");
{
    ok("a real comment goes", stripComments("a /* gone */ b").replace(/\s+/g, " ").trim() === "a b");
    ok("!! a comment opener INSIDE A STRING is not a comment", /\/\*/.test(stripComments('content: "/*";')),
        'content: "/*" is a legal declaration');
    ok("an unterminated comment eats to the end rather than throwing", !/x/.test(stripComments("a /* x")));
    // *** THE MEASUREMENT THAT CHANGED THE DESIGN, AND WHAT IT DOES AND DOES NOT PROVE. ***
    const real = fs.readFileSync(path.join(ROOT, "demos_code", "home_assistant_control.js"), "utf8");
    const at = real.indexOf("@keyframes haRobotShake");
    const open = real.indexOf("/*");
    const close = real.indexOf("*/", open + 2);
    ok("!! the file that forced per-block stripping still contains its `/ha/*` hazard",
        open >= 0 && close > open && open < at && at < close,
        `a "/ha/*" in a line comment opens at ${open} and closes at ${close} -- ${close - open} chars, spanning the rule at ${at}`);
    ok("!! and both of that file's rules are found",
        findKeyframeBlocks(real).map((b) => b.name).join(",") === "haRobotShake,haRobotFlash");
    // The real file is NOT a discriminating test any more, and pretending otherwise would be the false
    // comfort this file exists to avoid: the apostrophe in "the bridge's /ha/*" makes the string-aware
    // stripper treat it as a string opener, which accidentally rescues that particular file. So the property
    // is pinned on an input that isolates it -- a block comment outside any string, before a rule.
    const synthetic = "/* a note that never closes until here */ x\n"
        + "/* an opener with no apostrophes to save it \n"
        + "@keyframes swallowed { from { opacity:0 } to { opacity:1 } }\n"
        + "still inside the comment */\n"
        + "@keyframes after { from { opacity:0 } to { opacity:1 } }";
    const names = findKeyframeBlocks(synthetic).map((b) => b.name);
    ok("!! a rule inside an OPEN block comment is still reported -- the stated trade of per-block stripping",
        names.includes("swallowed") && names.includes("after"),
        `found ${names.join(", ")}; stripping globally first would find only "after", losing a real rule ` +
        "whenever an unrelated /* appears upstream -- a false negative, which is silent");
    ok("...and stripping the whole file first really would lose it, so the trade is real",
        !findKeyframeBlocks.toString().includes("stripComments(String")
        && !stripComments(synthetic).includes("@keyframes swallowed"));
}

// ---- 4. FINDING THE BLOCKS ---------------------------------------------------------------------------------
console.log("\n4. brace matching, because a keyframes body is full of braces");
{
    const css = "@keyframes a { from { opacity:0 } to { opacity:1 } } .x { color:red }";
    const blocks = findKeyframeBlocks(css);
    ok("!! the block ends at ITS OWN closing brace, not the first inner one", blocks.length === 1
        && blocks[0].body.includes("to {") && !blocks[0].body.includes(".x"),
        "a lazy /\\{[\\s\\S]*?\\}/ would stop after `opacity:0 }` and return a fragment that still parses");
    ok("several blocks in one sheet are all found",
        findKeyframeBlocks("@keyframes a{from{opacity:0}}@keyframes b{to{opacity:1}}").length === 2);
    ok("a vendor-prefixed at-rule is found too", findKeyframeBlocks("@-webkit-keyframes a{to{opacity:1}}").length === 1);
    ok("a quoted animation name is unquoted", findKeyframeBlocks('@keyframes "my name"{to{opacity:1}}')[0].name === "my name");
    ok("an UNBALANCED block is refused rather than half-returned",
        findKeyframeBlocks("@keyframes a { from { opacity:0 }").length === 0);
    ok("no keyframes means an empty list, not a throw", findKeyframeBlocks(".x{color:red}").length === 0);
    ok("empty input is handled", findKeyframeBlocks("").length === 0 && findKeyframeBlocks(null).length === 0);
}

// ---- 5. ONE BLOCK, SEVERAL OFFSETS -------------------------------------------------------------------------
console.log("\n5. *** ONE DECLARATION SET CAN NAME SEVERAL OFFSETS, AND THIS TREE WRITES IT THAT WAY OFTEN ***");
{
    const { keyframes } = toKeyframes("0%,97%,100%{opacity:.85} 98%{opacity:.7}");
    ok("!! `0%,97%,100%{...}` becomes THREE frames, not one", keyframes.length === 4,
        keyframes.map((f) => f.offset).join(", "));
    ok("...each carrying the shared declarations", keyframes.filter((f) => f.opacity === ".85").length === 3);
    const ft = toKeyframes("from, to { opacity:1 } 50% { opacity:0 }").keyframes;
    ok("`from, to` fans out as well", ft.length === 3 && ft[0].offset === 0 && ft[2].offset === 1);
    ok("!! frames come back sorted by offset whatever order they were written in",
        ft.map((f) => f.offset).join(",") === "0,0.5,1");
    const decls = parseDeclarations("box-shadow:0 0 0 9px rgba(94,224,106,0); opacity:.5");
    ok("a value containing commas and parens survives declaration parsing",
        decls["box-shadow"] === "0 0 0 9px rgba(94,224,106,0)" && decls.opacity === ".5");
    ok("a trailing semicolon, or none, both parse",
        Object.keys(parseDeclarations("a:1;b:2;")).length === 2 && Object.keys(parseDeclarations("a:1;b:2")).length === 2);
    ok("an unparseable selector is REPORTED rather than dropped silently",
        parseKeyframeBody("bogus{opacity:1}").unknown.join() === "bogus");
}

// ---- 6. EASING ---------------------------------------------------------------------------------------------
console.log("\n6. *** THE EASING DEFAULT IS CSS's `ease`, NOT WAAPI's `linear` ***");
{
    const f = toKeyframes("from{opacity:0} to{opacity:1}").keyframes;
    ok("!! a frame with no animation-timing-function gets `ease`, which is what CSS itself uses",
        f.every((k) => k.easing === "ease"),
        "WAAPI defaults to linear, so converting without this changes how every animation moves");
    const g = toKeyframes("from{opacity:0;animation-timing-function:ease-in} to{opacity:1}").keyframes;
    ok("animation-timing-function becomes `easing`", g[0].easing === "ease-in" && !("animationTimingFunction" in g[0]));
    ok("...and a declared easing is not overwritten by the default", g[1].easing === "ease");
    const h = toKeyframes("from{opacity:0} to{opacity:1}", { easing: null }).keyframes;
    ok("{ easing: null } leaves it off, for a caller that wants WAAPI's own default",
        h.every((k) => !("easing" in k)));
}

// ---- 7. THE TREE'S OWN RULES -------------------------------------------------------------------------------
console.log("\n7. *** THE CORPUS: every @keyframes rule in this tree, converted ***");
let corpus = null;
{
    const files = [];
    (function walk(d) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (["node_modules", ".git", "vendor"].includes(e.name)) continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p);
            else if (/\.(html|css|js|mjs)$/.test(e.name)) files.push(p);
        }
    })(ROOT);
    // These DOCUMENT keyframes in prose rather than declaring any -- this file and the converter both write
    // `@keyframes NAME { ... }` as an example. Excluded by name and counted, not silently dropped.
    const DOCS = /^(fx\/cssKeyframes\.mjs|ui\/domAnimation\.mjs|tools\/ship\/cssKeyframes-selfcheck\.mjs|tools\/ship\/domAnimation-selfcheck\.mjs)$/;
    let blocks = 0, waapiOK = 0, houseOK = 0, partial = 0, unknown = 0, excluded = 0;
    const names = new Set(), inFiles = new Set(), badWaapi = [], houseWhy = {};
    for (const f of files) {
        const rel = path.relative(ROOT, f).replace(/\\/g, "/");
        if (DOCS.test(rel)) { excluded++; continue; }
        const src = fs.readFileSync(f, "utf8");
        if (!src.includes("keyframes")) continue;
        for (const b of findKeyframeBlocks(src)) {
            const { keyframes, unknown: unk } = toKeyframes(b.body);
            blocks++; names.add(b.name); inFiles.add(rel);
            if (unk.length) unknown++;
            const wp = waapiProblems(keyframes);
            if (!wp.length) waapiOK++; else badWaapi.push(`${rel}:${b.name} -- ${wp[0]}`);
            const hp = validateKeyframes(keyframes);
            if (!hp.length) houseOK++; else houseWhy[hp[0].replace(/frame \d+/, "frame N")] = (houseWhy[hp[0].replace(/frame \d+/, "frame N")] || 0) + 1;
            if (isPartial(keyframes)) partial++;
        }
    }
    corpus = { blocks, names: names.size, files: inFiles.size, waapiOK, houseOK, partial };
    console.log(`  ${blocks} blocks, ${names.size} distinct names, across ${inFiles.size} files (${excluded} documentation files excluded)`);
    ok("!! the tree really does carry a corpus worth converting", blocks >= 70 && names.size >= 70);
    ok("!! *** EVERY ONE OF THEM CONVERTS TO SOMETHING THE BROWSER WOULD ACCEPT ***", waapiOK === blocks,
        `${waapiOK}/${blocks} WAAPI-valid` + (badWaapi.length ? " -- " + badWaapi.slice(0, 3).join("; ") : ""));
    ok("...and not one has a selector the converter could not read", unknown === 0);
    console.log(`  house rule (ui/domAnimation.validateKeyframes): ${houseOK}/${blocks} pass, ${partial} are partial`);
    Object.entries(houseWhy).forEach(([k, v]) => console.log(`      ${String(v).padStart(3)}x  ${k}`));
    ok("!! *** THE HOUSE RULE REJECTS SOME OF THIS TREE'S OWN CSS, AND IT IS RIGHT TO ***",
        houseOK < blocks && houseOK > blocks * 0.7,
        `the gap is exactly the ${partial} PARTIAL animations -- @keyframes spin { to { transform:rotate(360deg) } } ` +
        `is one frame at offset 1, legal CSS and legal WAAPI, and the browser fills the start from the element's ` +
        `current value. validateKeyframes is a stricter rule for HAND-AUTHORED tables, where an implicit endpoint ` +
        `hides intent. Two different questions, and conflating them would condemn working animations`);
    ok("...so isPartial() separates the two populations exactly",
        partial === blocks - houseOK, `${partial} partial, ${blocks - houseOK} house-rule failures`);
}

// ---- 8. DISCIPLINE -----------------------------------------------------------------------------------------
console.log("\n8. it reads text and nothing else");
{
    const src = codeOnly(fs.readFileSync(path.join(ROOT, "fx", "cssKeyframes.mjs"), "utf8"));
    ok("no CSS parser dependency -- keyframes-tool needs `css` and Ramda, this needs neither",
        !/require\(|from "css"|ramda/i.test(src));
    ok("no DOM, no CSSOM, no stylesheet object", !/document|CSSStyleSheet|getComputedStyle|insertRule/.test(src));
    ok("it does not import ui/domAnimation.mjs -- the house rule stays that module's opinion, not this one's",
        !/domAnimation/.test(src));
    ok("convert() returns a plain object keyed by animation name",
        (() => { const c = convert("@keyframes a{from{opacity:0}to{opacity:1}}"); return Array.isArray(c.a) && c.a.length === 2; })());
}

console.log("\n----  WHAT THIS DOES NOT CLAIM");
console.log("      THAT THE CONVERTED ANIMATIONS LOOK THE SAME. This reads offsets, properties and timing");
console.log("      functions; it does not resolve `var()`, does not expand shorthands, and does not know what");
console.log("      the element's current value is -- so a PARTIAL animation converts faithfully and still");
console.log("      needs the live element to mean anything. Nor is anything rewired: the " + corpus.blocks + " rules still");
console.log("      run as CSS. What exists now is the ability to READ them, which engine/frameDirty.js and");
console.log("      ui/domAnimation.mjs's validator could not do at all before.");

console.log("\ncssKeyframes-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
