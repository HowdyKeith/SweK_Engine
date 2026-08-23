// WebGLEngine/tools/ship/patchBase.mjs -- v3374
//
// *** A PATCH WITHOUT A STATED BASE CAN HAVE ITS MERGE VERIFIED BUT NOT ITS CLAIMS AUDITED. ***
//
// v3373 corrected an overreach of mine. An incoming patch carried a status report whose wiring claims did not
// hold at the merge point, and I published that as "those claims were WRONG". Keith's correction: the patch was
// produced against an EARLIER TREE, and a claim written against an earlier base can be ACCURATE THERE and
// simply not hold where it lands. I HAD ALREADY NOTED THAT PATCH SHIPPED NO PATCH.md AND NO STATED BASE, and
// judged it against my tree anyway.
//
// THE DIFFERENCE IS NOT PEDANTRY AND IT IS EXACTLY THIS PROJECT'S SIGNATURE DEFECT -- TWO THINGS WEARING ONE
// LABEL:
//     STATED, AND IT MATCHES     -- claims can be audited against that base
//     STATED, AND IT DIFFERS     -- claims are auditable but must be read AT THE BASE, not here
//     NOT STATED                 -- the merge is still verifiable; THE CLAIMS ARE NOT AUDITABLE AT ALL
// The third is not a worse version of the second. IT IS AN ABSENCE OF EVIDENCE, and reporting it as a mismatch
// would be a confident wrong answer about a tree nobody saw.
//
// THE TWO REAL CASES THIS WAS BUILT FROM, both applied this session:
//     swek_patch_v3358          PATCH.md: "incremental patch v3357 -> v3358 ... Rebased onto v3357" -- STATED,
//                               matched the tree, applied and checked against it.
//     patch_v3366_strict_config NO PATCH.md AT ALL. Merge verified 16/16 byte-identical; claims UNAUDITABLE.
//
// makeIncremental.mjs already writes a `baseline` into outgoing packages, so the ENGINE'S OWN format declares
// one. THE GAP IS ON THE RECEIVING SIDE: nothing read it back.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { readCentralDirectory } from "../roundhouse/safeExtract.mjs";
import { inflateEntry } from "./moduleHistory.mjs";

export const UNSTATED = "unstated", MATCHES = "matches", DIFFERS = "differs";

/** Pull a stated base out of a patch note. Accepts the shapes actually seen, not an invented schema. */
export function statedBase(text) {
    if (!text) return null;
    const pats = [
        /incremental patch\s+v(\d{3,5})\s*(?:->|→|to)\s*v\d{3,5}/i,
        /\brebased onto\s+v(\d{3,5})/i,
        /\bbase(?:d on|line)?\s*:?\s*v(\d{3,5})/i,
    ];
    for (const re of pats) { const m = re.exec(text); if (m) return "v" + m[1]; }
    return null;
}

/** Read a patch root and report what it declares. NEVER guesses a base from file contents. */
export function inspectPatch(patchRoot) {
    let note = null;
    for (const name of ["PATCH.md", "PATCH.MD", "patch.md", "README.md"]) {
        const p = path.join(patchRoot, name);
        if (fs.existsSync(p)) { try { note = fs.readFileSync(p, "utf8"); } catch {} break; }
    }
    const base = statedBase(note);
    return { note: note !== null, base, files: countFiles(patchRoot) };
}

function countFiles(root) {
    let n = 0;
    const walk = (d) => { let e; try { e = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const x of e) { const p = path.join(d, x.name); if (x.isDirectory()) walk(p); else n++; } };
    walk(root); return n;
}

/**
 * *** THE VERDICT SEPARATES "I CHECKED AND IT DIFFERS" FROM "I HAVE NO WAY TO TELL". ***
 * treeVersion is read from the tree, never passed in as a convenience -- a caller supplying both sides of a
 * comparison is the shape that lets a mismatch be argued away.
 */
export function auditable(patchRoot, treeVersion) {
    const info = inspectPatch(patchRoot);
    if (!info.base) {
        return { ...info, verdict: UNSTATED, claimsAuditable: false,
            why: "no stated base. THE MERGE IS STILL VERIFIABLE -- file-by-file against the tree -- but any " +
                 "claim the patch makes about what is wired refers to a tree nobody here has seen, so it can " +
                 "be neither confirmed nor contradicted. Reporting such a claim as WRONG is a confident wrong " +
                 "answer, which is exactly what v3373 had to correct" };
    }
    const same = info.base === treeVersion;
    return { ...info, verdict: same ? MATCHES : DIFFERS, claimsAuditable: true,
        why: same ? "stated base equals the tree; claims can be audited directly"
                  : "stated base " + info.base + " differs from the tree at " + treeVersion + ". CLAIMS ARE " +
                    "AUDITABLE BUT MUST BE READ AT THE BASE -- a claim true at " + info.base + " that fails " +
                    "here is a MERGE-POINT observation, not an error by its author" };
}

/** The tree's own marker, read rather than supplied. */
export function treeVersionOf(engRoot) {
    try {
        const m = /const ENGINE_VERSION = "(v\d+)"/.exec(fs.readFileSync(path.join(engRoot, "main.js"), "utf8"));
        return m ? m[1] : null;
    } catch { return null; }
}

/**
 * *** THE SAME QUESTION, ASKED OF A ZIP THAT HAS NOT BEEN EXTRACTED. *** A patch arrives as a zip in Downloads,
 * and asking "does it state a base" should not require unpacking it first -- unpacking is the commitment this
 * is meant to inform.
 *
 * THE ZIP READING IS DELEGATED, NOT REIMPLEMENTED. safeExtract owns readCentralDirectory and moduleHistory owns
 * inflateEntry, whose header says plainly that reading a zip container is ITS job and that its gate asserts the
 * BRIDGE holds no zip logic of its own. A THIRD READER HERE WOULD BE THE SECOND-DECLARATION DEFECT IN THE ONE
 * PLACE THIS TREE HAS ALREADY WRITTEN THE RULE DOWN.
 */
export function inspectZip(zipPath) {
    let buf, entries;
    try { buf = fs.readFileSync(zipPath); } catch (e) { return { readable: false, why: "unreadable: " + e.code }; }
    try { entries = readCentralDirectory(buf); } catch (e) { return { readable: false, why: "not a readable zip: " + e.message }; }
    // A patch note may sit at the root or one level down under the package folder. NAMED SHAPES ONLY -- a
    // search for any *.md would pick up a changelog and read a version out of the wrong document.
    const wanted = /(^|\/)(PATCH\.md|PATCH\.MD|patch\.md)$/;
    const hit = entries.find((e) => wanted.test(String(e.name || "").replace(/\\/g, "/")));
    if (!hit) return { readable: true, note: false, base: null, entries: entries.length };
    let text = null;
    try { text = inflateEntry(buf, hit).toString("utf8"); } catch (e) { return { readable: true, note: true, base: null, entries: entries.length, why: "note found but not inflatable: " + e.message }; }
    return { readable: true, note: true, base: statedBase(text), entries: entries.length, noteName: hit.name };
}

/**
 * *** v3941 -- THE TOP-LEVEL SHAPE OF AN UNEXTRACTED ZIP, ASKED THROUGH THE ONE READER. ***
 *
 * sysadminBridge needed this and had grown its OWN central-directory walk to get it -- 0x02014b50 in the
 * bridge, in code, which is the fourth reader this file's header refuses in advance and which patchScanDoor's
 * gate correctly went red on. The bridge could not simply call readCentralDirectory either: the tree's layering
 * is BRIDGES DELEGATE TO TOOLS AND TOOLS DELEGATE TO safeExtract, and moduleHistory's gate holds exactly that
 * line for moduleHistoryBridge. So the question belongs here, beside inspectZip, which is already "the same
 * question asked of a zip that has not been extracted".
 *
 * Returns { ok: true, names } or { ok: false, why } -- a REFUSAL WITH ITS REASON rather than an empty list,
 * because the caller's fail-open branch has to be able to tell "no entries" from "could not read".
 */
export function topLevelNames(zipPath) {
    let buf, entries;
    try { buf = fs.readFileSync(zipPath); } catch (e) { return { ok: false, why: "cannot read " + zipPath + ": " + ((e && e.code) || e) }; }
    try { entries = readCentralDirectory(buf); } catch (e) { return { ok: false, why: "not a readable zip: " + e.message }; }
    const names = entries.map((e) => String(e.name || ""));
    if (!names.length) return { ok: false, why: "the central directory listed no entries" };
    return { ok: true, names };
}

/** The zip form of the verdict. Identical three states, so a caller cannot get a different answer by format. */
export function auditableZip(zipPath, treeVersion) {
    const z = inspectZip(zipPath);
    if (!z.readable) return { ...z, verdict: UNSTATED, claimsAuditable: false, why: z.why };
    if (!z.base) return { ...z, verdict: UNSTATED, claimsAuditable: false,
        why: "no stated base in the archive. The merge is still verifiable once extracted; the claims are not auditable." };
    const same = z.base === treeVersion;
    return { ...z, verdict: same ? MATCHES : DIFFERS, claimsAuditable: true,
        why: same ? "stated base equals the tree" : "stated base " + z.base + " differs from the tree at " + treeVersion +
             " -- claims must be read AT THE BASE, which is the NORMAL case for a focused patch" };
}
