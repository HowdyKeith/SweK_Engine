// tools/ship/commentFalsePass-selfcheck.mjs
//
// Run: node tools/ship/commentFalsePass-selfcheck.mjs   (9.6 s -- OVER the 3,000 ms sweep budget, see below)
//
// v3141 -- A GATE THAT ASSERTS "THE CODE DOES X" AGAINST RAW SOURCE PASSES ON A COMMENT SAYING "WE SHOULD DO X".
//
// This session hit the prose-as-code family SEVENTEEN times, and at v3138 I committed the exact bug in the
// other direction: a pre-filter testing /fetch\(/ against RAW, where a comment saying "we should fetch() this
// later" would have made a file eligible. So: how many gates are doing that RIGHT NOW?
//
// THE CENSUS, and it is the "a crude count is an unasked question" shape with a NEGATIVE result.
//   Gates that read shipping source are counted; those using sourceScan are already safe and are set aside.
//   Of the rest, the ones asserting a CODE IDIOM (no quote characters, contains a call or keyword) against a
//     variable holding file content are resolved to their target file and tested mechanically.
//   THE TEST: does the regex match the RAW file and NOT the codeOnly() view? If so it is matching something
//     the comment stripper removed, which is a comment.
//   EVERY FLAGGED CASE MUST BE EXPLAINED BY THE INSTRUMENT, decidably, by reading the target. Any that is not
//     is a GENUINE false pass and this gate goes red on it.
//
// *** THE COUNTS USED TO LIVE IN THIS HEADER AND THEY WENT STALE, WHICH IS THE FAULT THIS FILE IS ABOUT. ***
// It read "142 gates read shipping source; 48 use sourceScan ... TWELVE FLAGGED. ZERO GENUINE" and listed the
// twelve by reason. At v4571 the live reading is 569 / 239 / 277 tested / 24 flagged, and the reason mix is
// different too. Not one of those numbers was wrong when written; every one of them was a MOVING QUANTITY
// written down as a fixed one, in prose, where nothing re-derives it -- which is the same defect as a gate
// believing a comment. The gate PRINTS all of them on every run. So the header states the shape and the run
// states the numbers, and the one place they are still written down is a paragraph that says they are a
// reading taken at v3141.
//
// SO THE ANSWER IS ZERO, AND THAT IS WORTH SHIPPING RATHER THAN CONCLUDING. A negative result nobody records
// gets re-investigated; a negative result in a gate gets RE-CHECKED EVERY RUN, and would catch the first real
// one the day it arrives.
//
// *** AND IT NEARLY DID NOT GET RE-CHECKED. *** This gate costs 9.6 s and the sweep budget is 3,000 ms, so no
// ship-time step has run it since it was written -- it reached the killed bucket v4568 opened, and the red it
// had been holding was found there, unread, along with four others. A gate nothing runs is a comment.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
const SHIP = HERE;
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const { codeOnly } = await import(pathToFileURL(path.join(SHIP, "sourceScan.mjs")).href);

/** Licence boilerplate: the text a copy is REQUIRED to reproduce. */
const LICENCE_TEXT = /Copyright|Permission is hereby granted|THE SOFTWARE IS PROVIDED|SPDX-License-Identifier|WITHOUT WARRANTY OF ANY KIND/;

/** Is `index` inside a comment block that IS a licence notice -- a copyright line and the grant beside it?
 *  Read from the TARGET, by walking out to the edges of the comment run the match sits in. */
function inLicenceNotice(raw, index) {
    const lines = raw.split("\n");
    let at = 0, li = 0;
    for (; li < lines.length; li++) { const next = at + lines[li].length + 1; if (index < next) break; at = next; }
    const isComment = (l) => /^\s*(\/\/|\*|\/\*)/.test(l) || /^\s*$/.test(l);
    if (!/^\s*(\/\/|\*|\/\*)/.test(lines[li] || "")) return false;
    let lo = li, hi = li;
    while (lo > 0 && isComment(lines[lo - 1])) lo--;
    while (hi < lines.length - 1 && isComment(lines[hi + 1])) hi++;
    const block = lines.slice(lo, hi + 1).join("\n");
    return /Copyright/.test(block) &&
           /Permission is hereby granted|THE SOFTWARE IS PROVIDED|WITHOUT WARRANTY|SPDX-License-Identifier/.test(block);
}

/** A flagged case is EXEMPT when the instrument, not the gate, explains it. Each reason is decidable. */
function exemptReason(targetRel, body, raw, index, hit) {
    if (/\.html?$/.test(targetRel)) return "target is HTML and codeOnly is a JavaScript instrument";
    if (/\\\/\\\*|\/\*/.test(body)) return "the regex hunts a comment deliberately";
    // *** AN ASSERTION NO CODE COULD SATISFY IS NOT AN ASSERTION ABOUT CODE. ***
    // Found at v4571, by running this gate for the first time in a long while -- it costs 9.6 s against a
    // 3,000 ms sweep budget, so nothing at ship time had reached it. It reported ONE GENUINE case:
    // tools/ship/qrChannel-selfcheck.mjs asserting /Copyright \(c\) 2009 Kazuhiko Arase/ against
    // ui/qrDecode.mjs, a vendored copy reproducing the MIT notice in full as MIT requires of a copy.
    //
    // That is not the defect this file hunts, and the difference is not a matter of degree. The hazard is a
    // gate reading a comment that says "we should do X" and concluding the code does X -- a statement of
    // INTENT standing in for behaviour. A copyright notice states no intent about behaviour: it IS the
    // artifact being asserted about, it lives in a comment BY DEFINITION, and there is no arrangement of code
    // that could satisfy "this file carries the notice" instead. codeOnly stripping it is the stripper doing
    // its job, not the gate being fooled.
    //
    // TWO CONDITIONS, BOTH READ FROM THE TARGET, so this stays a decidable class and not a name on a list:
    // the matched TEXT is licence boilerplate, AND it sits inside a comment block that carries a copyright
    // line and the grant beside it. A genuine code idiom that happened to fall inside a licence header would
    // fail the first condition and still be flagged.
    //
    // THE POPULATION IS ONE TODAY and the census says so rather than the exemption implying more: five
    // licence-text assertions exist across three gates (copiedOutsideVendor, procBrush, qrChannel), and four
    // never reach this function because they carry quote characters or no code idiom at all. This one reaches
    // it because `\(c\)` -- an escaped paren in an English sentence -- reads as a call to the idiom filter.
    //
    // AND THE OBVIOUS FIX WAS MEASURED AND REJECTED: tightening that filter to require a word character
    // before `\(` -- so `fetch\(` counts and `\(c\)` does not -- drops 214 of the 277 assertions this census
    // tests, because `if \(`, `for \(` and `while \(` are code and put a SPACE there too. It would have made
    // the detector nearly blind and this gate green, which is the trade this file exists to refuse.
    if (index >= 0 && LICENCE_TEXT.test(hit || "") && inLicenceNotice(raw, index))
        return "a licence notice, which must be a comment -- no code could satisfy the claim";
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
        const hit = raw.match(re);
        const why = exemptReason(relTarget, body, raw, hit ? hit.index : -1, hit ? hit[0] : "");
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
