// WebGLEngine/tools/ship/stableWrite.mjs -- v4826
//
// WRITE A RECORD THAT CARRIES A STAMP WITHOUT DIRTYING THE TREE: the file is rewritten only when its CONTENT changed, and the stamp (a version, a date) is then the one
// it was written with, not the one it is being checked under.
//
// *** THREE GATES WROTE A TRACKED FILE ON EVERY RUN, EACH WITH A STAMP THAT MOVED WITH THE CLOCK OR THE VERSION. *** tools/ship/traderPolicy-selfcheck.mjs stamped two
// files `measuredAt: <this engine's version>`, tools/ship/rigCanvas-selfcheck.mjs stamped rig-expected.json `written: <now>`, and the first run of either in a new
// version (or on a new day) rewrote one line of a committed file. A ship's step 4b runs gates AFTER `git add`, so v4822's commit swept both traders in behind its own
// staging; v4826's flake probe, run over 72 live-page gates, found the second by `git status` afterwards. The trader gate's own header (v4534) had named the species -- "a
// measurement of the box, embedded in a record of the thing, dirties the tree on every run" -- and fixed the wall-clock field it saw, not the version field beside it.
//
// So this is the one definition: build(stamp) returns the whole document with the stamp where the caller wants it; if the document, minus the stamp, equals what is on
// disk minus ITS stamp, nothing is written -- not the bytes, not the mtime -- and the document returned carries the stamp already there. `legacy` names older spellings of
// the stamp (trader's `measuredAt`): a file written under one hands its value over, once.
"use strict";
import fs from "node:fs";

/**
 * stableWrite(file, build, { stampName, stampValue, legacy = [], space = 1, newline = false })
 * Returns { doc, wrote, kept } -- `kept` is true when the content was unchanged and the prior stamp was kept.
 */
export function stableWrite(file, build, { stampName, stampValue, legacy = [], space = 1, newline = false } = {}) {
    if (!stampName) throw new Error("stableWrite: stampName is required");
    let text0 = null, prior = null;
    try { text0 = fs.readFileSync(file, "utf8"); prior = JSON.parse(text0); } catch (e) { /* none yet, or not JSON: written fresh below */ }
    const strip = (d) => { const o = { ...d }; delete o[stampName]; for (const k of legacy) delete o[k]; return o; };
    const was = prior && typeof prior === "object" ? (prior[stampName] != null ? prior[stampName] : legacy.map((k) => prior[k]).find((v) => v != null)) : undefined;
    const fresh = build(stampValue), kept = was != null && JSON.stringify(strip(prior)) === JSON.stringify(strip(fresh));
    const doc = kept ? build(was) : fresh, text = JSON.stringify(doc, null, space) + (newline ? "\n" : "");
    const wrote = text !== text0; if (wrote) fs.writeFileSync(file, text);
    return { doc, wrote, kept };
}
