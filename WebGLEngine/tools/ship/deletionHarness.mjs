// WebGLEngine/tools/ship/deletionHarness.mjs
// VERSION: v1 -- v3326
//
// DELETE EVERY CHARACTER IN TURN AND ASK WHETHER IT STILL PARSES.
//
// From the radiation-hardened-quine thread (mame/radiation-hardened-quine, via [[external-repos-2]]). Keith was
// shown a triple-redundancy scheme with a proof that a majority vote recovers the payload after any single
// deletion. THE PROOF WAS CORRECT AND IRRELEVANT: it assumed the decoder RUNS. Measured on a working
// triple-redundant program, 75 of 131 deletions never reached the vote at all -- JavaScript must PARSE the whole
// file before executing one line of it.
//
// *** THE REDUNDANCY IS IN THE DATA; THE FRAGILITY IS IN THE GRAMMAR. *** That is the whole finding, and this
// harness is the only thing that can tell the two apart. A test that checked OUTPUT would score 56/56 on the
// deletions that happened to execute and report a perfect result.
//
// WHAT IT MEASURED, AND EVERY NUMBER HERE IS FROM RUNNING IT:
//   `0;` per line ................. 9 positions, ZERO syntax failures
//   bare `0` per line (ASI only) ... 6 positions, ZERO failures
//   `/*//*/ 101 /*//*/ | /*//*/ 0`  36 positions, 15 failures   <- the "hardened" pattern
//   comment-only lines `/*x*/` .... 18 positions,  5 failures
//
// *** THE PROPOSED HARDENING WAS WORSE THAN NOTHING, AND THE HARNESS IS HOW ANYONE COULD KNOW. *** `| 0` padding
// adds TWO new single points of failure: delete the pipe and `101  0` is two adjacent literals; delete the zero
// and `101 |` is a trailing operator. Both are syntax errors where there had been none.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * @param {string} src        the text to attack
 * @param {(mutant:string)=>boolean} parses   does this mutant still parse?
 * @returns {{ positions, failures, survived, failingChars, worst }}
 *
 * *** THE CHECK IS INJECTED, NOT ASSUMED. *** A harness that hard-coded `new Function()` would only ever be
 * about JavaScript -- and the same question is worth asking of GLSL, of a .bat file, of JSON. What it must NOT
 * do is score the deletions that happened to survive: FAILURES ARE THE MEASUREMENT.
 */
export function deletionSurvey(src, parses) {
    if (typeof src !== "string" || !src.length) throw new TypeError("deletionSurvey needs a non-empty string");
    if (typeof parses !== "function") throw new TypeError("deletionSurvey needs a parse predicate");
    const failing = [];
    for (let i = 0; i < src.length; i++) {
        if (!parses(src.slice(0, i) + src.slice(i + 1))) failing.push({ index: i, ch: src[i] });
    }
    const byChar = {};
    for (const f of failing) byChar[f.ch] = (byChar[f.ch] || 0) + 1;
    return {
        positions: src.length,
        failures: failing.length,
        survived: src.length - failing.length,
        // WHICH CHARACTER, NOT JUST HOW MANY. "15 failures" is a score; "the pipe and the zero" is a diagnosis,
        // and it points straight at the construct that has to change.
        failingChars: Object.entries(byChar).sort((a, b) => b[1] - a[1]).map(([ch, n]) => ({ ch, n })),
        worst: failing.slice(0, 8),
    };
}

/** Parse predicate for JavaScript, via `node --check` -- the real parser, not a regex approximation. */
export function jsParses(mutant) {
    const f = path.join(os.tmpdir(), "swek-del-" + process.pid + ".js");
    try {
        fs.writeFileSync(f, mutant);
        execFileSync(process.execPath, ["--check", f], { stdio: "ignore" });
        return true;
    } catch { return false; }
    finally { try { fs.unlinkSync(f); } catch {} }
}

/** A receipt in this tree's shape. */
export function survivalReceipt(r) {
    if (!r.failures) return r.positions + " positions, ZERO syntax failures -- survives every single deletion.";
    return r.positions + " positions, " + r.failures + " syntax failure(s) (" +
        (100 * r.failures / r.positions).toFixed(0) + "%). Fragile characters: " +
        r.failingChars.map((c) => JSON.stringify(c.ch) + " x" + c.n).join(", ") +
        ". EACH IS A DELIMITER WHOSE ABSENCE THE GRAMMAR CANNOT ABSORB.";
}
