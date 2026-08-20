import { pathToFileURL, fileURLToPath } from "node:url";
// WebGLEngine/tools/ship/roundTripCensus.mjs -- v3138
//
// DERIVE THE ROUND-TRIP CONTROL COUNT INSTEAD OF REMEMBERING IT.
//
// unknownNotDefault-selfcheck carried `const ROUND_TRIP_UNGUARDED = 43;` with the comment "MEASURED at v3113,
// not chosen". It WAS measured -- once -- and then frozen. Adopt ten and it still says 43. Add ten and it still
// says 43. THAT IS A REMEMBERED RESULT PRESENTED AS A CURRENT MEASUREMENT, which is the failure mode
// coverage.mjs was written at v3084 to prevent, in a gate that did not use it.
//
// AND THE SCOPE WAS TYPED TOO: four files, main.js / server.html / ui/settingsHub.js / hosting.html. Deriving
// across the whole shipped tree finds round-trip controls in THIRTY-FOUR files, and only ONE of the original
// four appears at all. The number was not merely stale; it was pointed at the wrong part of the tree.
//
// *** THE DEFINITION IS STATED HERE RATHER THAN IMPLIED, because the count is only as meaningful as the
// question it answers. *** A control is ROUND-TRIP when all three hold:
//   1. its id is ASSIGNED (.value = / .checked =) within 400 characters after a fetch, .then or await
//   2. the SAME id is READ (.value / .checked, not followed by =) somewhere in the file
//   3. the file builds a request body (JSON.stringify or body:)
// The 400-character window is a heuristic and is the weakest part; it is stated so the next person can tighten
// it deliberately rather than discover it. Loosening rule 1 to "assigned anywhere" gives 158 rather than 114.
//
// STRINGS ARE PRESERVED ON PURPOSE. My first version used codeOnly(), which strips string literals -- so every
// getElementById("thing") became getElementById() and the census returned ZERO. THE IDS ARE STRINGS.
// SEVENTEENTH INSTANCE OF THAT FAMILY, and finding it took one run because zero is not a plausible answer.

import fs from "node:fs";
import path from "node:path";
import { noComments } from "./sourceScan.mjs";

const SET_RE = /(?:getElementById\(["'`]([\w-]+)["'`]\)|\$\(["'`]([\w-]+)["'`]\))\s*\.\s*(?:value|checked)\s*=/g;
const READ_RE = /(?:getElementById\(["'`]([\w-]+)["'`]\)|\$\(["'`]([\w-]+)["'`]\))\s*\.\s*(?:value|checked)\b(?!\s*=)/g;
export const FETCH_WINDOW = 400;

function shippedFiles(root) {
    const out = [];
    const walk = (d) => {
        let entries; try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            if (e.name === "node_modules" || e.name.startsWith(".")) continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p); else if (/\.(html|js)$/.test(e.name)) out.push(p);
        }
    };
    walk(root);
    return out;
}

/** @returns { total, files, perFile, guarded, scanned } -- every number DERIVED, none remembered. */
export function roundTripCensus(root) {
    const files = shippedFiles(root);
    let total = 0, distinct = 0, guarded = 0;
    const perFile = [];
    for (const f of files) {
        let raw; try { raw = fs.readFileSync(f, "utf8"); } catch { continue; }
        // v3138 -- EVERY test runs against the STRIPPED source, including the cheap pre-filters. My first
        // version tested `fetch(`, `JSON.stringify` and `loadKnownState(` against RAW, which gateQuality caught
        // as three new prose-matching offenders (22 against a baseline of 19). It is not only debt: A COMMENT
        // SAYING "we should fetch() this later" WOULD HAVE MADE THE FILE ELIGIBLE, and a commented-out
        // loadKnownState would have counted as adoption. The pre-filter is where it matters most, because it
        // decides whether a file is looked at at all.
        const code = noComments(raw);                     // STRINGS KEPT -- the ids are strings
        guarded += (code.match(/loadKnownState\s*\(/g) || []).length;
        if (!/JSON\.stringify|body:/.test(code) || !/fetch\s*\(/.test(code)) continue;
        const read = new Set();
        let m; READ_RE.lastIndex = 0;
        while ((m = READ_RE.exec(code))) read.add(m[1] || m[2]);
        const hit = [];
        SET_RE.lastIndex = 0;
        while ((m = SET_RE.exec(code))) {
            const id = m[1] || m[2];
            if (!read.has(id)) continue;
            const before = code.slice(Math.max(0, m.index - FETCH_WINDOW), m.index);
            if (/fetch\s*\(|\.then\s*\(|await\s/.test(before)) hit.push(id);
        }
        // v3176 -- TWO NUMBERS, TWO NAMES. `total` counted OCCURRENCES while `ids` was DEDUPLICATED, so this
        // module reported 114 while its own list held 103 distinct controls -- and per file, `count` disagreed
        // with `ids.length` for the same reason. TWO THINGS WEARING ONE LABEL, in a module I shipped at v3138
        // to fix a number that was wrong. The QUEUE LINE has said "114 round-trip controls" ever since; the
        // actionable list is 103, and the 11 are controls assigned more than once in one file.
        if (hit.length) { const uniq = [...new Set(hit)]; total += hit.length; distinct += uniq.length;
            perFile.push({ file: path.relative(root, f), count: hit.length, distinct: uniq.length, ids: uniq }); }
    }
    perFile.sort((a, b) => b.count - a.count);
    // total = OCCURRENCES, distinct = CONTROLS. Naming both stops the next reader picking one.
    return { total, distinct, files: perFile.length, perFile, guarded, scanned: files.length };
}

const ENGROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// v3219 -- A FRONT DOOR. *** RUNNING THIS FILE PRINTED NOTHING AND EXITED 0, WHICH READS AS A CLEAN BILL. ***
// EIGHT of this tree's analysis tools did that, not the two on record: an empty report and a tool that never
// ran are indistinguishable from a shell, and every one of them was ALSO reported by graveyard-selfcheck as an
// orphaned utility -- because its only consumer was its own gate. One main block answers both: the tool becomes
// runnable by a person, and it acquires a caller that is not a test.

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const r = roundTripCensus(ENGROOT);
    console.log("[roundTripCensus] " + r.total + " round-trip control occurrences, " + r.distinct + " distinct, across " + r.files + " files; " + r.guarded + " guarded.");
    console.log("[roundTripCensus] OCCURRENCES AND CONTROLS ARE DIFFERENT NUMBERS and both are printed, because");
    console.log("[roundTripCensus] collapsing them is how a census starts describing something nobody asked about.");
}
