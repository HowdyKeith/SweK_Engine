// tools/ship/commentFalsePass-selfcheck.mjs
//
// Run: node tools/ship/commentFalsePass-selfcheck.mjs   (~4.2s MEASURED (gate-timings.json))
//
// v3141 -- A GATE THAT ASSERTS "THE CODE DOES X" AGAINST RAW SOURCE PASSES ON A COMMENT SAYING "WE SHOULD DO X".
//
// This session hit the prose-as-code family SEVENTEEN times, and at v3138 I committed the exact bug in the
// other direction: a pre-filter testing /fetch\(/ against RAW, where a comment saying "we should fetch() this
// later" would have made a file eligible. So: how many gates are doing that RIGHT NOW?
//
// THE CENSUS, and it is the "a crude count is an unasked question" shape with a NEGATIVE result.
//   142 gates read shipping source; 48 use sourceScan.
//   Of the 94 that do not, 43 assert a CODE IDIOM (no quote characters, contains a call or keyword) against a
//     variable holding file content -- 121 such regexes.
//   94 of those resolve to a real target file and can be tested mechanically.
//   THE TEST: does the regex match the RAW file and NOT the codeOnly() view? If so it is matching something
//     the comment stripper removed, which is a comment.
//   TWELVE FLAGGED. *** ZERO GENUINE. ***
//
// EVERY ONE OF THE TWELVE IS EXPLAINED BY THE INSTRUMENT, NOT BY THE GATE:
//   EIGHT are GLSL inside a TEMPLATE LITERAL (render/voxelrenderer.js). codeOnly blanks the whole string, so
//     "absent from codeOnly" means "inside a shader", not "inside a comment" -- v3121's finding exactly.
//   THREE target HTML files. codeOnly is a JAVASCRIPT instrument and HTML is not JavaScript.
//   ONE (deviceBridge) hunts a comment ON PURPOSE -- its regex literally contains an opening comment marker.
//
// SO THE ANSWER IS ZERO, AND THAT IS WORTH SHIPPING RATHER THAN CONCLUDING. A negative result nobody records
// gets re-investigated; a negative result in a gate gets RE-CHECKED EVERY RUN, and would catch the first real
// one the day it arrives.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
const SHIP = HERE;
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const { codeOnly } = await import(pathToFileURL(path.join(SHIP, "sourceScan.mjs")).href);

/** A flagged case is EXEMPT when the instrument, not the gate, explains it. Each reason is decidable. */
function exemptReason(targetRel, body, raw, index) {
    if (/\.html?$/.test(targetRel)) return "target is HTML and codeOnly is a JavaScript instrument";
    if (/\\\/\\\*|\/\*/.test(body)) return "the regex hunts a comment deliberately";
    // ODD number of backticks before the match means it sits inside a template literal -- a shader, usually.
    if (index >= 0 && raw.slice(0, index).split("`").length % 2 === 0) return "inside a template literal (a shader is not code to codeOnly)";
    return null;
}

const gates = fs.readdirSync(SHIP).filter((f) => f.endsWith("-selfcheck.mjs"));
let readsSource = 0, usesScan = 0, tested = 0;
const flagged = [], genuine = [];

for (const g of gates) {
    const s = fs.readFileSync(path.join(SHIP, g), "utf8");
    const fromFile = [...s.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*readFileSync/g)].map((m) => m[1]);
    if (!fromFile.length) continue;
    readsSource++;
    if (/sourceScan|codeOnly\(|noComments\(|prose\(/.test(s)) { usesScan++; continue; }
    const varPath = {};
    for (const m of s.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*fs\.readFileSync\(\s*path\.join\(([^)]*)\)/g)) {
        const parts = [...m[2].matchAll(/["'`]([^"'`]+)["'`]/g)].map((x) => x[1]);
        if (parts.length) varPath[m[1]] = parts.join("/");
    }
    for (const m of s.matchAll(/\/((?:[^\/\\\n\[]|\\.|\[[^\]]*\])+)\/([gimsuy]*)\s*\.test\(\s*([A-Za-z_$][\w$]*)/g)) {
        const [, body, flags, v] = m;
        if (/["'`]/.test(body)) continue;                                   // a STRING match is correct on raw
        if (!/\\\(|=>|await |async |function |\.\w+\\\(|===|!==|\breturn\b|\bthrow\b|\bcatch\b/.test(body)) continue;
        const rel = varPath[v]; if (!rel) continue;
        const cand = [path.join(ENG, rel), path.join(SHIP, rel), path.join(ENG, "tools", rel)].find((p) => fs.existsSync(p));
        if (!cand) continue;
        let re; try { re = new RegExp(body, flags.replace("g", "")); } catch { continue; }
        tested++;
        const raw = fs.readFileSync(cand, "utf8");
        if (!re.test(raw) || re.test(codeOnly(raw))) continue;              // fine either way
        const relTarget = path.relative(ENG, cand);
        const why = exemptReason(relTarget, body, raw, raw.search(re));
        flagged.push({ g, body: body.slice(0, 46), target: relTarget, why });
        if (!why) genuine.push({ g, body: body.slice(0, 46), target: relTarget });
    }
}

ok("!! the census actually ran over the gates",
    readsSource > 100 && tested > 50,
    readsSource + " gates read shipping source, " + usesScan + " use sourceScan (" +
    Math.round(usesScan / readsSource * 100) + "%), " + tested + " code-idiom assertions were resolvable and tested");

ok("!! NO gate passes on a comment",
    genuine.length === 0,
    flagged.length + " flagged as raw-only, ALL " + flagged.length + " explained by the instrument rather than " +
    "the gate" + (genuine.length ? "; GENUINE: " + JSON.stringify(genuine) : "") +
    ". A gate asserting 'the code does X' against raw source would pass on a comment saying 'we should do X' -- " +
    "which is the bug I committed at v3138 in a pre-filter, so the question was worth asking");

{
    const reasons = {};
    for (const f of flagged) reasons[f.why || "GENUINE"] = (reasons[f.why || "GENUINE"] || 0) + 1;
    ok("...and every exemption reason is DECIDABLE, not a name on a list",
        Object.keys(reasons).length >= 2 && !("GENUINE" in reasons),
        Object.entries(reasons).map(([k, n]) => n + " " + k).join("; ") +
        ". Each is checked by reading the target, not by matching a filename against an allow-list -- so a new " +
        "case in a new file is judged rather than waved through");

    ok("!! and the flagged set is NOT empty, so the detector is not merely silent",
        flagged.length > 0,
        "a census that found nothing at all would be indistinguishable from a broken scan. " + flagged.length +
        " cases were found, examined, and each explained -- which is a different claim from finding none");
}

console.log();
console.log("  ----  " + (readsSource - usesScan) + " gates still read shipping source without sourceScan. That is NOT");
console.log("        debt by itself: a regex hunting a STRING or an ID is CORRECT on raw source and would BREAK");
console.log("        under codeOnly, which is what v3106 measured when 28 of 38 conversions failed. Only the");
console.log("        code-idiom subset above is hazardous, and today none of it is actually wrong.");
if (fails) { console.log("commentFalsePass-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("commentFalsePass-selfcheck: all checks pass");
