// WebGLEngine/tools/ship/runtimeGap-selfcheck.mjs -- v4451
//
// Run: node tools/ship/runtimeGap-selfcheck.mjs
//
// Grades vba/runtimeGap.mjs -- #129, "the VBA Transmitter as the SweK runtime: what is missing besides threads".
//
// *** THE CENSUS IS RE-DERIVED HERE, NEVER READ BACK. *** A frozen table of file counts is a number nobody
// re-takes, and this tree has shipped rounds about exactly that. Every figure below is counted from the
// working tree on each run and compared to what the module recorded, so the module going stale is a red.
//
// *** AND THE THREE EVIDENCE CLASSES ARE HELD APART BY A CHECK, NOT BY A HEADING. *** measured / language /
// archive are claims of three different strengths, and the failure mode of a round like this is a tidy table
// where "VBA has no closures" and "the transmitter's HTTP server works" look equally established. The second
// rests on an archive NO EXCEL HAS EVER RUN AGAINST from this box.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as R from "../../vba/runtimeGap.mjs";
import { PARTS, PROVISIONAL, READ_AGAINST } from "../../vba/archiveManifest.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const SKIP = /node_modules|\/vendor\/|\/dist\//;
function sources(dir = ENG, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (SKIP.test(p)) continue;
        if (e.isDirectory()) sources(p, out);
        else if (/\.(mjs|js)$/.test(e.name)) out.push({ path: p, text: fs.readFileSync(p, "utf8") });
    }
    return out;
}

const files = sources();

// *** THE BYTES THE `has: true` ROWS HAVE TO POINT AT. *** Real VBA in this tree -- five modules, no archive
// needed to read them. A row crediting VBA with a capability must name a token that appears here (or a marker
// the manifest really holds), because the first draft of this gate accepted the `has` column on its word.
const VBA_SRC = (function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const q = path.join(dir, e.name);
        if (SKIP.test(q)) continue;
        if (e.isDirectory()) walk(q, out);
        else if (/\.(bas|cls|frm)$/i.test(e.name)) out.push({ path: q, text: fs.readFileSync(q, "utf8") });
    }
    return out;
})(ENG);
const VBA_CODE = VBA_SRC.map((f) => f.text.split("\n").filter((l) => !/^\s*'/.test(l)).join("\n")).join("\n");
const c = R.census(files);
const rows = R.ranked(c);

// ---- 1. *** THE ORDERING IS THE FINDING, AND THREADS ARE NEAR THE BOTTOM OF IT *** ---------------------------
{
    say(`${c.files} runtime source files (vendor, node_modules and dist excluded), comment-stripped`);
    for (const r of rows) say(`    ${r.capability.padEnd(22)} ${String(r.files).padStart(5)}  ${r.pct.toFixed(1)}%`);
    const idx = rows.findIndex((r) => r.capability === "workers/threads");
    const threads = rows[idx], closures = rows.find((r) => r.capability === "closures as values");
    // ALL TWELVE, not the three the first draft compared. Nine of the frozen counts were decoration until
    // the sabotage pass asked what would happen if one drifted, and asyncAwait had ALREADY drifted by one.
    const KEY = { "ES modules": "esModules", "closures as values": "closures", "async/await": "asyncAwait",
        "typed arrays": "typedArrays", "Promises": "promises", "fetch/XHR": "fetchXhr",
        "performance.now": "performanceNow", "requestAnimationFrame": "raf", "WebGL": "webgl",
        "WebGPU": "webgpu", "workers/threads": "threads", "WebAssembly": "wasm" };
    const drift = rows.filter((r) => c.counts[r.capability] !== R.MEASURED_AT_V4451[KEY[r.capability]])
        .map((r) => `${r.capability} ${R.MEASURED_AT_V4451[KEY[r.capability]]} -> ${c.counts[r.capability]}`);
    ok("the census re-derives to what the module recorded, EVERY row of it -- a stale table is a red",
        c.files === R.MEASURED_AT_V4451.files && drift.length === 0 &&
        Object.keys(KEY).length === rows.length,
        drift.length ? "drifted: " + drift.join(", ") : `${c.files} files, all 12 rows match`);
    ok("!! *** THREADS ARE THE SECOND-SMALLEST GAP OF TWELVE, WHICH INVERTS THE ITEM'S SCALE ***",
        idx === R.MEASURED_AT_V4451.threadsRank - 1 && idx >= rows.length - 2,
        `#129 asks what is missing "besides threads"; threads rank ${idx + 1} of ${rows.length}, ` +
        `${threads.files} files at ${threads.pct.toFixed(1)}%`);
    ok("...and first-class functions are two orders of magnitude more of this tree than threads are",
        Math.round(closures.files / threads.files) === R.MEASURED_AT_V4451.closuresOverThreads &&
        closures.files / threads.files > 100,
        `${closures.files} / ${threads.files} = ${Math.round(closures.files / threads.files)}x. A runtime with ` +
        "threads and no closures runs 0.6% of what one with closures and no threads runs");
}

// ---- 2. THE STRIP CHANGED THE HEADLINE ROW, WHICH IS WHY IT IS NOT OPTIONAL --------------------------------
{
    say("");
    const rawC = { files: files.length, counts: {} };
    for (const k of Object.keys(R.PATTERNS)) rawC.counts[k] = 0;
    for (const f of files) for (const [k, re] of Object.entries(R.PATTERNS)) if (re.test(f.text)) rawC.counts[k]++;
    const dThreads = rawC.counts["workers/threads"] - c.counts["workers/threads"];
    const dTyped = rawC.counts["typed arrays"] - c.counts["typed arrays"];
    say(`  raw vs comment-stripped: threads ${rawC.counts["workers/threads"]} -> ${c.counts["workers/threads"]}, ` +
        `typed arrays ${rawC.counts["typed arrays"]} -> ${c.counts["typed arrays"]}`);
    ok("!! stripping comments MOVES the headline row -- a third of the 'threaded' files were prose about threads",
        dThreads > 0 && dThreads / rawC.counts["workers/threads"] > 0.25 && dTyped > 0,
        `${dThreads} of ${rawC.counts["workers/threads"]} thread hits were comment-only. The row the whole item ` +
        "is built on is the one an unstripped census would have inflated most, in proportion");
    // ---- *** AND THE STRIP DOES NOT CATCH STRING LITERALS, WHICH IS HOW THIS ROUND COUNTED ITSELF *** -------
    // A capability name inside a quoted string is prose too, and stripComments leaves it. This round's own two
    // files carry the twelve names in note text and in the key table above, so five rows read one higher than
    // the tree without them. Derived, not asserted: recount with those two paths dropped.
    const MINE = /vba\/runtimeGap\.mjs$|tools\/ship\/runtimeGap-selfcheck\.mjs$/;
    const without = R.census(files.filter((f) => !MINE.test(f.path.replace(/\\/g, "/"))));
    const self = {};
    for (const k of Object.keys(R.PATTERNS)) if (c.counts[k] !== without.counts[k]) self[k] = c.counts[k] - without.counts[k];
    say(`  this round's own 2 files inflate ${Object.keys(self).length} of 12 rows: ` +
        (Object.entries(self).map(([k, n]) => `${k} +${n}`).join(", ") || "nothing"));
    ok("!! *** THE MODULE DEFINING THE CENSUS MATCHES ALL TWELVE OF ITS OWN PATTERNS *** -- derived, not argued",
        JSON.stringify(self) === JSON.stringify(R.MEASURED_AT_V4451.selfCount) &&
        without.files === c.files - 2,
        `all ${Object.keys(R.PATTERNS).length} rows inflated. runtimeGap.mjs holds the PATTERNS table, so every ` +
        "regex's literal text is IN it -- and a regex source is a string, which is prose the comment strip " +
        "cannot reach. The same false-positive class as the check above, one layer in, in the instrument itself");
    ok("...and the headline survives it: a 2-file distortion in rows of 22 to 3,506, and threads still rank last but one",
        without.counts.WebAssembly === R.MEASURED_AT_V4451.wasmWithoutSelf &&
        without.counts["workers/threads"] === R.MEASURED_AT_V4451.threadsWithoutSelf &&
        without.counts["workers/threads"] > without.counts.WebAssembly &&
        c.counts["workers/threads"] === c.counts.WebAssembly,
        `with this round: threads ${c.counts["workers/threads"]} tie WebAssembly ${c.counts.WebAssembly} and ` +
        `rank 11 on the stable sort. Without it: ${without.counts["workers/threads"]} against ` +
        `${without.counts.WebAssembly}, second-smallest outright. The tie is an artefact of my own strings`);
}

// ---- 3. *** THREE CLASSES OF EVIDENCE, KEPT APART BY A CHECK *** --------------------------------------------
{
    say("");
    const byEv = {};
    for (const r of R.VBA_SIDE) byEv[r.evidence] = (byEv[r.evidence] || 0) + 1;
    say("  VBA rows by evidence class: " + Object.entries(byEv).map(([k, v]) => k + " " + v).join(", "));
    ok("every capability the census counts has exactly one VBA row, and no row is invented",
        R.VBA_SIDE.length === rows.length &&
        rows.every((r) => R.VBA_SIDE.filter((v) => v.capability === r.capability).length === 1),
        `${R.VBA_SIDE.length} rows against ${rows.length} counted capabilities`);
    ok("every row declares its evidence class, and only the three exist",
        R.VBA_SIDE.every((r) => R.EVIDENCE.includes(r.evidence) && typeof r.note === "string" && r.note.length > 20));
    ok("every `has: true` row is language or archive, and every `has: false` row names NO corroborator",
        R.VBA_SIDE.filter((r) => r.has).every((r) => r.evidence === "archive" || r.evidence === "language") &&
        R.VBA_SIDE.filter((r) => !r.has).every((r) => r.via === null),
        "the `via` column exists only to be earned, so an absent capability must not carry one");

    // ---- *** THE CHECK THAT TWO SABOTAGES GOT PAST, AND THE REASON THIS SECTION WAS REWRITTEN *** -----------
    // Flipping `closures as values` to has:true -- crediting VBA with the one capability the whole finding is
    // about -- was a SILENT PASS against the first draft, because the draft only asked whether a row declared
    // an evidence class, and a flipped row keeps the class it already had. A label is not a check. So each
    // has:true row must name bytes, and the bytes must be here.
    const missing = [];
    for (const r of R.VBA_SIDE.filter((x) => x.has)) {
        const v = r.via;
        if (!v) { missing.push(r.capability + ": no `via` at all"); continue; }
        if (v.kind === "vba-source") {
            const hits = VBA_SRC.filter((f) => f.text.includes(v.token)).map((f) => path.relative(ENG, f.path));
            if (!VBA_CODE.includes(v.token)) missing.push(`${r.capability}: \`${v.token}\` is in NO in-tree VBA code`);
            else say(`  ${r.capability.padEnd(22)} <- ${v.token} in ${hits.join(", ")}`);
        } else if (v.kind === "manifest") {
            const part = PARTS.find((p2) => p2.id === v.part);
            const has = part && [...part.decisive, ...part.shared].includes(v.marker);
            if (!has) missing.push(`${r.capability}: manifest part \`${v.part}\` has no marker \`${v.marker}\``);
            else say(`  ${r.capability.padEnd(22)} <- manifest ${v.part} / ${v.marker}`);
        } else missing.push(`${r.capability}: unknown corroborator kind \`${v.kind}\``);
    }
    ok("!! *** EVERY CAPABILITY VBA IS CREDITED WITH POINTS AT BYTES THAT ARE REALLY THERE ***",
        missing.length === 0 && R.VBA_SIDE.filter((r) => r.has).length === R.MEASURED_AT_V4451.hasRows,
        missing.length ? missing.join("; ")
            : `${R.MEASURED_AT_V4451.hasRows} credited rows, each corroborated. Crediting VBA with closures ` +
              "now requires inventing a VBA file that uses them");
    ok("...and the corroborators are not all of one kind, so neither half of the check can go inert",
        R.VBA_SIDE.filter((r) => r.via && r.via.kind === "vba-source").length >= 2 &&
        R.VBA_SIDE.filter((r) => r.via && r.via.kind === "manifest").length >= 1 && VBA_SRC.length >= 5,
        `${VBA_SRC.length} in-tree VBA modules read, ${VBA_CODE.split("\n").length} non-comment lines`);
    ok("the absent rows are counted, not eyeballed -- nine of the twelve are language facts of absence",
        R.VBA_SIDE.filter((r) => !r.has && r.evidence === "language").length === R.MEASURED_AT_V4451.languageRowsAbsent,
        "this constant read 8 in the first draft against nine real rows, and nothing checked it: the exact " +
        "frozen-number-nobody-re-takes shape the header of this gate complains about, in the gate's own module");

    const arch = R.archiveRows();
    say("  archive-backed rows: " + arch.map((r) => r.capability).join(", "));
    ok("!! *** and only ONE row still rests on the archive, because pointing them at bytes promoted the other ***",
        arch.length === R.MEASURED_AT_V4451.archiveRows && arch[0].capability === "WebGL" &&
        R.VBA_SIDE.find((r) => r.capability === "fetch/XHR").evidence === "language",
        "a network stack and a GPU renderer are the two anyone would guess are hardest, and they are the two " +
        "VBA has -- but the HTTP client is visible in this tree's own .bas files, so only GL needs the archive");
}

// ---- 4. THE ARCHIVE ROWS REST ON AN ARCHIVE NOTHING HERE HAS RUN -------------------------------------------
{
    say("");
    const ids = PARTS.map((p) => p.id);
    say(`  manifest read against ${READ_AGAINST}, provisional ${PROVISIONAL}, parts: ${ids.join(", ")}`);
    ok("the archive rows name parts the manifest actually has",
        ids.includes("transmitter") && ids.includes("engine") && PROVISIONAL === false,
        "PROVISIONAL is false because a real listing was scanned -- which makes the marker names solid and " +
        "says nothing at all about whether the code RUNS");
    // *** UNWRAPPED BEFORE MATCHING, BECAUSE A PROSE REGEX AGAINST RAW SOURCE IS THE TREE'S OWN NAMED DEBT. ***
    // gateQuality-selfcheck went red on the first draft of this check by name: a sentence that reads on one
    // line today wraps onto two the next time somebody edits the page, and the assertion quietly stops
    // matching -- which for a NEGATIVE claim like this one would silently retire the caveat. Comment markers
    // and newlines are collapsed to single spaces and the phrase is matched with \s+ between its words, so
    // rewrapping cannot move it.
    const unwrap = (f) => fs.readFileSync(path.join(ENG, f), "utf8")
        .replace(/\n\s*\/\/\s?/g, " ").replace(/<!--|-->/g, " ").replace(/\s+/g, " ");
    const excel = unwrap("excel.html"), server = unwrap("server.html");
    ok("!! and the pages still say plainly that NO EXCEL HAS EVER RUN AGAINST IT",
        /NO\s+EXCEL\s+HAS\s+EVER\s+RUN\s+AGAINST\s+IT/i.test(server) || /no\s+Excel\s+has\s+ever\s+run/i.test(excel),
        "this round adds a capability table, not a verification. Anything in it marked `archive` is the " +
        "weakest claim in the file and must not be read as measured");
    ok("...and this module claims nothing it cannot support: no row is tagged `measured` on the VBA side",
        R.VBA_SIDE.every((r) => r.evidence !== "measured"),
        "the file counts are measured; VBA's capabilities are not measurable from a box with no Excel, and " +
        "labelling one of them `measured` is exactly the promotion this section exists to prevent");
}

console.log("runtimeGap-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
