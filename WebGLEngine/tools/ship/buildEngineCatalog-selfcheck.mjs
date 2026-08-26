// WebGLEngine/tools/ship/buildEngineCatalog-selfcheck.mjs -- v4040
// ---------------------------------------------------------------------------------------------------------------
// GATES tools/ship/buildEngineCatalog.mjs -- the regenerator engine-catalog.json's `builtinDemos` never had.
//
// THREE THINGS HAD TO BE PROVEN, NOT ASSUMED, before this could run at ship time: that the parser finds the
// TOP-LEVEL id/label and never a nested decoy (every real DEMO_MODES entry carries sub-objects -- kaijuSim,
// controls, padControls -- that plausibly have their own "label"), that a regex literal inside a demo's own
// tick()/start() body cannot corrupt the brace-depth count (a bracket-shaped character inside `/[{}]/` is not a
// brace), and that a `\uXXXX` escape decodes to the real character rather than eating its own backslash (the
// first real bug this file caught, live, on "ARCHITECTURE — system diagram").
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDemoModes } from "./buildEngineCatalog.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

console.log("buildEngineCatalog-selfcheck -- DEMO_MODES parsed from source, not evaluated\n");

console.log("1. THE TRICKY CASES, ON A SYNTHETIC ARRAY BUILT TO CONTAIN THEM");
{
    const src = `
const DEMO_MODES = [
    { id: "plain", label: "Plain Demo" },
    // a comment naming id: "decoy" and label: "should not match" must not be read as a field
    // v4040 -- the pattern here matters: /\\{\\{\\{/ is three literal open-braces and ZERO closes, so it is a
    // genuinely UNBALANCED bracket count if read naively char-by-char -- a symmetric decoy like /[{}\\[\\]]/
    // (tried first, and it PASSED even with regex-detection deliberately disabled) has 3 opens and 3 closes and
    // proves nothing, because a naive counter nets back to zero by accident.
    { id: "with_regex", label: "Has A Regex",
      tick: (dt) => { const s = "x".replace(/\\{\\{\\{/g, ""); return s; } },
    { id: "nested_decoy",
      controls: { label: "WRONG - this is a nested control's own label, not the entry's" },
      kaijuSim: { id: "wrong-nested-id", stats: { label: "also wrong" } },
      label: "Real Label" },
    { id: "escaped", label: "Line one\\nLine two \\u2014 em dash \\u0026 amp" },
    { id: "single_quoted", label: 'Single Quotes' },
    { id: "template_lit", label: \`Template Literal\` },
    { id: "falls_back_to_id" },
    { label: "orphan label, no id at all" },
];
`;
    const demos = parseDemoModes(src);
    ok("!! all seven WITH an id are found (the id-less orphan is dropped, comment's fake id/label ignored)", demos.length === 7,
       "got " + demos.length + ": " + demos.map((d) => d.id).join(", "));
    const byId = Object.fromEntries(demos.map((d) => [d.id, d]));
    ok("plain entry reads correctly", byId.plain && byId.plain.label === "Plain Demo");
    ok("!! a regex literal inside tick() does not corrupt the brace count", !!byId.with_regex && byId.with_regex.label === "Has A Regex",
       "a naive brace counter would see /[{}\\[\\]]/ as three opens and no closes and never find this entry's own end");
    ok("!! a NESTED object's own \"label\"/\"id\" is never mistaken for the entry's", byId.nested_decoy && byId.nested_decoy.label === "Real Label" && byId.nested_decoy.id === "nested_decoy",
       "controls.label and kaijuSim.id are both wrong answers a depth-blind extractor would return");
    ok("!! \\uXXXX decodes to the real character, not \"uXXXX\" with the backslash eaten", byId.escaped && byId.escaped.label === "Line one\nLine two — em dash & amp",
       "got " + JSON.stringify(byId.escaped && byId.escaped.label));
    ok("single-quoted string values read", byId.single_quoted && byId.single_quoted.label === "Single Quotes");
    ok("template-literal string values read", byId.template_lit && byId.template_lit.label === "Template Literal");
    ok("!! a missing label falls back to the entry's own id, never blank", byId.falls_back_to_id && byId.falls_back_to_id.label === "falls_back_to_id");
    ok("!! an entry with NO id at all is dropped, not crashed on or defaulted", demos.every((d) => d.label !== "orphan label, no id at all"),
       "an id-less object cannot become a `?go=` link, so it is not a launchable demo -- silently defaulting one to id \"undefined\" would be worse than dropping it");
}

console.log("\n2. MISSING MARKER IS REPORTED AS \"COULD NOT PARSE\", NEVER AS ZERO");
{
    ok("!! no DEMO_MODES array at all -> null, not []", parseDemoModes("const OTHER_THING = [1,2,3];") === null,
       "an empty array and \"nothing here to read\" are different facts -- collapsing them is exactly how the real bug hid for three days");
    ok("an unclosed array -> null, not a wrong count", parseDemoModes("const DEMO_MODES = [ { id: \"x\" ") === null);
}

console.log("\n3. AGAINST THE REAL main.js, RIGHT NOW");
{
    const mainJs = fs.readFileSync(path.join(ENG, "main.js"), "utf8");
    const demos = parseDemoModes(mainJs);
    ok("!! the real file parses to a non-null, plausible list", Array.isArray(demos) && demos.length > 10 && demos.length < 200,
       demos ? demos.length + " entries" : "PARSE FAILED");
    const ids = demos.map((d) => d.id);
    ok("!! every id is non-empty and unique", ids.every((id) => id) && new Set(ids).size === ids.length,
       ids.length + " ids, " + new Set(ids).size + " unique");
    ok("...and every entry has a label (falls back to its own id, never blank)", demos.every((d) => d.label && d.label.length > 0));

    console.log("\n4. engine-catalog.json IS ACTUALLY THIS, NOT A STALE COPY");
    let cat = null;
    try { cat = JSON.parse(fs.readFileSync(path.join(ENG, "engine-catalog.json"), "utf8")); } catch {}
    ok("!! engine-catalog.json's builtinDemos MATCHES the live parse of main.js, id for id", (() => {
        if (!cat || !Array.isArray(cat.builtinDemos)) return false;
        const catIds = cat.builtinDemos.map((d) => d.id);
        return catIds.length === ids.length && catIds.every((id, i) => id === ids[i]);
    })(), "this is the check that would have caught the real bug: run `node tools/ship/buildEngineCatalog.mjs` if it fails");
    ok("...and apps + generatedFrom survive untouched", cat && Array.isArray(cat.apps) && cat.apps.length > 0 && cat.generatedFrom === "main.js",
       "this file's whole job is builtinDemos -- touching apps or generatedFrom would be an unasked-for second fix riding the first");
}

console.log(fails ? `\nbuildEngineCatalog-selfcheck: ${fails} FAILED` : "\nbuildEngineCatalog-selfcheck: all checks pass");
if (fails) process.exit(1);
