// WebGLEngine/tools/ship/referenceKind-selfcheck.mjs -- v3449
//
// Run: node tools/ship/referenceKind-selfcheck.mjs
//
// *** A REFERENCE AND A MENTION ARE DIFFERENT THINGS, AND THE ORPHAN CENSUS COUNTS BOTH AS A CONSUMER. ***
//
// graveyard-selfcheck decides whether a module is dead with `(text.get(c) || "").includes(base)` -- a SUBSTRING
// MATCH ON THE BASENAME OVER RAW FILE TEXT. It cannot tell an import from a sentence. And this project writes a
// great many sentences: main.js carries a quarter-megabyte of changelog that names modules BY PATH, and
// predictions.html is a page of prose about the engine.
//
// THE PROVEN INSTANCE, AND IT IS THE ONE THAT MADE ME LOOK: lib/derivedCache.js has no importer outside its own
// gate. It reads as CONSUMED because main.js mentions it -- ON LINE 1552, INSIDE THE `ENGINE_VERSION` CHANGELOG
// STRING. *** THE VERSION MARKER I EXTEND EVERY SINGLE ROUND IS SUPPRESSING THE ORPHAN CENSUS. THE GATE GETS
// QUIETER THE MORE THE PROJECT DOCUMENTS ITSELF. ***
//
// A SECOND INSTANCE THE GATE COMMITS AGAINST ITSELF: simulation/RagdollDismember.js is imported by NOTHING, and
// main.js and ragdoll.html both merely NAME it -- so it never enters the gate-only list at all, and graveyard
// then reports its unwiredRegister entry as STALE and asks for that entry to be DELETED. THE REGISTER WAS RIGHT
// AND THE DETECTOR WAS WRONG; obeying that would have destroyed a correct record.
//
// ================================================================================================
// v3223 FOUND THIS EXACT HAZARD AND CLOSED ONE INSTANCE OF IT RATHER THAN THE CLASS
// ================================================================================================
//
// Its words: "A REGISTER OF ORPHANS IS NOT A CONSUMER OF THEM, AND MENTIONING ONE MUST NOT RESCUE IT" -- and the
// fix was to exclude tools/ship/unwiredRegister.mjs BY NAME. Correct, and one file wide. Measured now, the
// rescuers are led by predictions.html (41), main.js (39), tools/ship/reportingTools.mjs (15 -- A SECOND
// REGISTER, never excluded) and tools/ship/graveyard-selfcheck.mjs ITSELF (11 -- THE GATE'S OWN HEADER AND
// LISTS NAME THE MODULES IT IS JUDGING).
//
// ================================================================================================
// AND THE SAME DEFECT SITS ONE LEVEL UP, WHERE IT IS STRONGER
// ================================================================================================
//
// The scan also exempts whole DIRECTORIES as "dynamically loaded" when any file outside them mentions the
// directory path -- also a substring test. ONE PROSE MENTION EXEMPTS EVERY MODULE IN A DIRECTORY. 165
// directories are exempt, and NINETEEN of them are exempted by main.js's changelog alone.
//
// *** STATED CAREFULLY, BECAUSE THE CONCLUSION MAY BE RIGHT WHERE THE REASON IS NOT: those nineteen are mostly
// demos/, which probably ARE loaded by name. The defect is not that the answer is wrong, it is that THE
// EXEMPTION IS UNEARNED -- nothing distinguishes a directory genuinely loaded by a composed path from one a
// changelog happens to name, so a real dynamic family and a documented one are indistinguishable. ***
//
// ================================================================================================
// WHAT THIS GATE DOES, AND WHAT IT DELIBERATELY DOES NOT
// ================================================================================================
//
// IT MEASURES THE EXPOSURE AND RATCHETS IT. It does NOT rewrite graveyard's scan, and that is a decision rather
// than an omission: a first attempt at the replacement took the actionable count from 22 to 97 and then to 228
// depending on which routes the resolver knew about, and a number that moves that far under its own author is
// not yet a measurement. REWRITING A SHARED SCAN ON A NUMBER I CANNOT DEFEND IS THE v3202 SWEEP SHAPE, which
// deleted 61 live modules. So the exposure is named, counted and frozen HERE, and graveyard's verdicts are left
// exactly as they were -- with the honest consequence written down: ITS ACTIONABLE COUNT IS A FLOOR.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gateFiles } from "./staleness.mjs";
// v3450 -- THE RESOLVER IS NO LONGER PRIVATE TO THIS FILE. moduleRefs.mjs is the one definition and it is
// PROVEN ON A FIXTURE before it is pointed at anything; keeping a second copy here is how the earlier attempt
// drifted between runs, and it is the second-declaration defect this project names more often than any other.
import { referenceGraph } from "./moduleRefs.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const rel = (p) => path.relative(ENG, p).split(path.sep).join("/");

// THE GATE SET COMES FROM gateFiles(), NOT FROM A SECOND COPY OF THE PATTERN. staleness.mjs owns "a gate exists
// here" (v3041 found three definitions of it, v3442 a fourth), so this file asks by MEMBERSHIP and never
// re-derives -- which also keeps it out of singleSource's second-walker census by construction rather than by
// an exemption.
const GATES = new Set(gateFiles(ENG).map((p) => path.resolve(p)));
const isGate = (abs) => GATES.has(path.resolve(abs));

function corpus() {
    const all = [];
    (function walk(d) {
        let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of es) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) { if (!/node_modules|\.git/.test(p)) walk(p); }
            else if (/\.(js|mjs|html)$/.test(e.name)) all.push(p);
        }
    })(ENG);
    const text = new Map(all.map((f) => { try { return [f, fs.readFileSync(f, "utf8")]; } catch { return [f, ""]; } }));
    return { all, text };
}

const SELF = path.resolve(fileURLToPath(import.meta.url));
// THE TWO REGISTERS ALREADY ESTABLISHED AS NON-CONSUMERS, AND NO MORE. unwiredRegister is graveyard's own
// v3223 exclusion, and this file is the second instance found the same way -- by its own count coming back one
// too high. MIRRORING EXACTLY THOSE TWO IS WHAT MAKES THE NUMBER COMPARABLE TO WHAT GRAVEYARD SEES: widening
// the exclusion here to every register would pre-judge the fix this round deliberately does not ship, and would
// quietly lower the very exposure being measured. THE POINT IS THAT MORE REGISTERS EXIST AND ARE NOT EXCLUDED --
// reportingTools rescues 15 and graveyard itself 13, and those stay counted.
const EXCLUDED = new Set([SELF, path.resolve(ENG, "tools/ship/unwiredRegister.mjs")]);
const { all, text } = corpus();
// The graph is built with NO exclusions, because this file measures the exposure INCLUDING what the registers
// rescue -- excluding them here would quietly lower the very number being ratcheted. The two established
// exclusions are applied to the MENTION side only, below, where they mirror what graveyard actually does.
const GRAPH = referenceGraph(all, (f) => text.get(f) || "", ENG, { exclude: new Set() });
const RESOLVED = new Map(all.map((f) => [f, (GRAPH.refs.get(f) || []).map((r) => r.from)]));

/* ------------------------------------------------------------------------------------------------------------
 * 1. THE PROVEN INSTANCE -- a mention rescues a module, and the mention is a changelog line
 * --------------------------------------------------------------------------------------------------------- */
{
    const target = path.join(ENG, "lib", "derivedCache.js");
    const mainSrc = text.get(path.join(ENG, "main.js")) || "";
    const importers = (RESOLVED.get(target) || []).map(rel);
    const nonGate = importers.filter((f) => !isGate(path.join(ENG, f)));
    const mentionLine = mainSrc.split("\n").findIndex((l) => l.includes("derivedCache")) + 1;
    const onVersionLine = /const ENGINE_VERSION/.test((mainSrc.split("\n")[mentionLine - 1] || ""));

    ok("!! *** lib/derivedCache.js has NO non-gate importer, and main.js MENTIONS it on the ENGINE_VERSION line ***",
       nonGate.length === 0 && mentionLine > 0 && onVersionLine,
       `resolved importers: ${importers.join(", ") || "(none)"}; main.js names it at line ${mentionLine}, which is the ENGINE_VERSION changelog string. *** THE VERSION MARKER I EXTEND EVERY ROUND IS SUPPRESSING THE ORPHAN CENSUS: the substring test reads that sentence as a consumer, so THE GATE GETS QUIETER THE MORE THE PROJECT DOCUMENTS ITSELF. ***`);

    const rag = path.join(ENG, "simulation", "RagdollDismember.js");
    const ragImporters = (RESOLVED.get(rag) || []).map(rel);
    // *** MY FIRST VERSION OF THIS LINE SAID "IMPORTED BY NOTHING" AND WENT RED, CORRECTLY: it IS imported --
    // by its own selfcheck. The true property is that NO NON-GATE FILE IMPORTS IT, which is exactly the
    // distinction this whole file is about, and I lost it in the sentence one paragraph after making it. ***
    const ragNonGate = ragImporters.filter((f) => !isGate(path.join(ENG, f)));
    ok("!! ...and simulation/RagdollDismember.js has NO NON-GATE importer while reading as consumed",
       ragNonGate.length === 0 && ragImporters.length > 0,
       `resolved importers: ${ragImporters.join(", ")} -- its own gate and nothing else. main.js and ragdoll.html both NAME it, so graveyard never lists it and then reports its unwiredRegister entry as STALE, asking for the entry to be DELETED. THE REGISTER WAS RIGHT AND THE DETECTOR WAS WRONG.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. THE PER-FILE EXPOSURE -- ratcheted, with the rescuers named
 * --------------------------------------------------------------------------------------------------------- */

// v3449 -- MEASURED, AND IT MAY ONLY SHRINK. Every module here has NO resolved non-gate importer and is kept off
// the orphan census by a MENTION. Lowering this number means either wiring a module, deleting it, or teaching
// the census to resolve -- all three are progress. RAISING IT MEANS A NEW ORPHAN IS BEING HIDDEN BY PROSE.
// v3450 -- RAISED 164 -> 165, AND THE REASON IS WRITTEN HERE BECAUSE A RAISE WITHOUT ONE IS JUST A LOOSENED
// GATE. THE NEW ENTRY IS tools/ship/moduleRefs.mjs -- THE RESOLVER BUILT THIS ROUND TO DETECT PROSE-RESCUE --
// AND IT IS RESCUED BY PROSE: main.js's changelog names it, and so does the pointer added to
// graveyard-selfcheck's header. BOTH SENTENCES WERE WRITTEN THIS ROUND TO ANNOUNCE IT.
//
// *** THAT IS THE THIRD TIME IN THIS THREAD THE DEFECT HAS LANDED ON THE FILE STUDYING IT: v3449's gate rescued
// a module with its own header, its RagdollDismember line lost the reference/mention distinction one paragraph
// after making it, and now the resolver itself is held off the census by its own announcement. THE DEFECT IS
// NOT RARE AND IT IS NOT SOMEBODY ELSE'S -- documenting a module is the single commonest way to hide it. ***
//
// IT IS RAISED RATHER THAN EXCLUDED ON PURPOSE. moduleRefs.mjs is a REAL MODULE whose only consumers today are
// gates, which is exactly the population this number measures; excluding it would be the classifier deciding its
// own instrument does not count.
//
// *** v3451 -- I PREDICTED HERE THAT WIRING graveyard ONTO moduleRefs WOULD TAKE THIS BACK TO 164, AND THAT
// PREDICTION WAS WRONG. The wiring landed and the number did not move, FOR A PRECISE REASON: graveyard-selfcheck
// IS ITSELF A GATE, so it gave moduleRefs a GATE consumer, and this count measures modules with no NON-GATE
// importer. Nothing about the measured property changed, so nothing moved. *** THE INSTRUMENT WAS RIGHT AND THE
// PREDICTION WAS WRONG, WHICH IS THE ORDER THIS PROJECT WANTS -- and the prediction is left standing here rather
// than quietly deleted, because a forecast that was checked and failed is worth more than one that was never
// written down. IT DROPS WHEN A NON-GATE CALLER APPEARS, and no gate can supply one.
// v3453 -- 165 -> 166: physics/mesh/manifoldCensus.mjs, gate-only and named in main.js's changelog.
//
// *** AND THAT IS NOW A PATTERN WORTH NAMING RATHER THAN A THIRD PIECE OF BOOKKEEPING. EVERY ANALYSIS PRIMITIVE
// THIS PROJECT ADDS RAISES BOTH THIS COUNT AND graveyard's BY EXACTLY ONE, because the project's own two habits
// -- a primitive driven by its own gate, and a changelog sentence naming it -- ARE PRECISELY THE TWO CONDITIONS
// THESE NUMBERS MEASURE. moduleRefs.mjs at v3450, manifoldCensus.mjs here. SO THIS CEILING DRIFTS UPWARD ONE PER
// ROUND FOR AS LONG AS THE HABITS HOLD, AND A RATCHET THAT RISES EVERY ROUND STOPS BEING A RATCHET. ***
//
// IT IS STILL NOT LOOSENED AND STILL NOT EXEMPTED BY CATEGORY, because the exemption would swallow the real
// cases along with the benign ones. WHAT IT NEEDS IS THE DISTINCTION THE COUNT CANNOT CURRENTLY DRAW: a module
// named ONLY by a changelog against one named by something that might actually load it. That is the next round
// on this thread, and it is the same shape as the directory exemption still outstanding from v3449.
const RESCUED_CEILING = 166;

const rescued = [];
{
    for (const f of all) {
        if (isGate(f) || !/\.(js|mjs)$/.test(f)) continue;
        if (!/^export /m.test(text.get(f) || "")) continue;
        const res = [...new Set(RESOLVED.get(f) || [])];
        if (res.some((c) => !isGate(c))) continue;                 // genuinely consumed
        const base = path.basename(f);
        // *** THIS FILE EXCLUDES ITSELF, AND FINDING OUT WHY IS THE BEST EVIDENCE IN THE ROUND: on its first run
        // the count came back 165 against a ceiling of 164, because THIS GATE'S OWN HEADER NAMES THE MODULES IT
        // IS JUDGING and its substring pass counted that as a consumer. A GATE ABOUT PROSE RESCUING MODULES
        // RESCUED A MODULE WITH ITS OWN PROSE. *** That is precisely v3223's finding -- "a register of orphans is
        // not a consumer of them" -- and the right response is to close the CLASS rather than raise a number:
        // a file whose job is to NAME these modules is never their caller. Excluded by identity, not by a
        // hardcoded path, so it stays true if this file is ever renamed.
        const mentions = all.filter((c) => c !== f && !EXCLUDED.has(c) && !res.includes(c) && (text.get(c) || "").includes(base));
        if (mentions.length) rescued.push({ f: rel(f), by: mentions.map(rel) });
    }
    const freq = {};
    for (const r of rescued) for (const m of r.by) freq[m] = (freq[m] || 0) + 1;
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 6);
    say(`${rescued.length} module(s) have NO resolved non-gate importer and are held off the census by a mention`);
    for (const [k, v] of top) say(`   ${String(v).padStart(3)}  ${k}`);

    ok("!! *** the prose-rescued population may only SHRINK ***", rescued.length <= RESCUED_CEILING,
       `${rescued.length} against a ceiling of ${RESCUED_CEILING}. A RISE MEANS A NEW ORPHAN IS BEING HIDDEN BY A SENTENCE. Falling is progress by any of three routes -- wire it, delete it, or teach the census to resolve.`);
    ok("...and the ceiling has not been left behind by progress",
       RESCUED_CEILING - rescued.length <= 8,
       `ceiling ${RESCUED_CEILING}, actual ${rescued.length}. A RATCHET WITH SLACK IN IT IS A RATCHET HOLDING NOTHING (v3195).`);

    // *** v3223 CLOSED ONE INSTANCE AND NOT THE CLASS, AND THIS IS THE EVIDENCE. ***
    const registers = ["tools/ship/reportingTools.mjs", "tools/ship/graveyard-selfcheck.mjs"];
    const byRegister = registers.map((r) => [r, rescued.filter((x) => x.by.includes(r)).length]);
    ok("!! *** a REGISTER still rescues modules, and one of them is the census gate itself ***",
       byRegister.every(([, n]) => n > 0),
       byRegister.map(([r, n]) => `${r} rescues ${n}`).join("; ") + `. v3223 excluded tools/ship/unwiredRegister.mjs BY NAME for exactly this reason -- "A REGISTER OF ORPHANS IS NOT A CONSUMER OF THEM" -- and stopped at one file. THE GATE'S OWN HEADER AND LISTS NAME THE MODULES IT IS JUDGING, so it suppresses its own findings.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. THE SAME DEFECT ONE LEVEL UP, WHERE ONE SENTENCE EXEMPTS A WHOLE DIRECTORY
 * --------------------------------------------------------------------------------------------------------- */
{
    const causes = new Map();
    for (const f of all) {
        const dir = path.dirname(f), dirRel = rel(dir);
        if (!dirRel || dirRel === "." || causes.has(dir)) continue;
        for (const c of all) {
            if (c.startsWith(dir + path.sep)) continue;
            if ((text.get(c) || "").includes(dirRel)) { causes.set(dir, rel(c)); break; }
        }
    }
    const byMain = [...causes.entries()].filter(([, c]) => c === "main.js").map(([d]) => rel(d));
    say(`${causes.size} directories are exempted as "dynamically loaded"; ${byMain.length} of them by main.js`);
    ok("!! *** the directory exemption is a substring test too, so ONE SENTENCE EXEMPTS EVERY MODULE IN A FOLDER ***",
       byMain.length > 0,
       `${byMain.length} exempted by main.js's changelog: ${byMain.slice(0, 6).join(", ")}. *** STATED CAREFULLY: those are mostly demos/, which probably ARE loaded by name -- so the CONCLUSION may be right while the REASON is unearned. Nothing here distinguishes a directory genuinely reached by a composed path from one a changelog happens to name, and a real dynamic family and a documented one are indistinguishable. ***`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. THE CONSEQUENCE, STATED WHERE A READER OF THE OTHER GATE WILL MEET IT
 * --------------------------------------------------------------------------------------------------------- */
{
    const g = fs.readFileSync(path.join(ENG, "tools", "ship", "graveyard-selfcheck.mjs"), "utf8");
    ok("!! *** graveyard's actionable count is a FLOOR, not a measure, and its own header now says so ***",
       /FLOOR/.test(g) && /referenceKind/.test(g),
       "a reader who meets 22 without that sentence would take it for the debt. It is the debt THE SUBSTRING TEST CAN STILL SEE.");
    // *** v3941 -- THE DISTINCTION THIS GATE'S HEADER ASKS FOR WAS ATTEMPTED THREE WAYS AND REFUTED THREE
    // TIMES. *** The header names the next round on this thread: "a module named ONLY by a changelog against
    // one named by something that might actually load it". Each attempt below looked obvious, and each one is
    // recorded because a checked-and-failed attempt is worth more than an unwritten one -- the same reason the
    // v3451 prediction two hundred lines above is left standing after it turned out wrong.
    //
    // (1) STRIP COMMENTS AND THE CHANGELOG MENTIONS GO AWAY. They do not. Measured: 191 rescued on this walk,
    //     of which only 31 are named exclusively inside comments. THE PROSE IS IN STRING LITERALS AS OFTEN AS
    //     IN COMMENTS -- predictions.html carries `where: "vendor/krbn (MIT, LICENSE beside it..."` and
    //     reportingTools.mjs carries `blurb: "v3451 said READ THEM ONE AT A TIME..."`. noComments keeps strings,
    //     so it separates prose-in-a-comment from prose-in-a-string, which is not the distinction wanted;
    //     codeOnly blanks strings and would lose the genuine composed loads (shaderRefs measured that exact
    //     trade at v3560 and shipped noComments for the opposite reason). NO STRIPPER SEPARATES PROSE FROM A
    //     LOAD, because in this tree documentation is data as often as it is comment.
    //
    // (2) A DIRECTORY THAT REAL CODE ENUMERATES AT RUNTIME IS GENUINELY LOADED. True, and it does not help,
    //     because of who is doing the enumerating. 128 of the 191 live under a directory some file walks with
    //     readdirSync -- AND 92 OF THOSE 128 ARE tools/, WALKED BY artefactWriters-selfcheck AND doorKinds TO
    //     AUDIT IT. *** A CENSUS THAT READS A DIRECTORY IN ORDER TO JUDGE IT IS NOT A CONSUMER OF IT *** --
    //     v3223's law ("a register of orphans is not a consumer of them") arriving for a third time in a third
    //     disguise, now wearing a filesystem call instead of a substring. Counting those as consumption would
    //     have been this gate's own defect committed inside its own fix.
    //
    // (3) WHAT SURVIVES IS NARROW AND REAL: demos_code/, enumerated by tools/ship/launchIndex.mjs -- a NON-gate
    //     tool -- served as /demos_code/list by ai-bridge/server.js and booted by showcase.html via ?go=. Ten
    //     of the rescued modules are there, and no import-specifier resolver can ever see them, because the
    //     reference is a directory read. That is an EARNED exemption, unlike the substring one, and it is worth
    //     exactly ten. It is measured here and NOT wired in, because 191 - 10 does not reach the ceiling and
    //     shipping a partial resolver change mid-ratchet would move the number for a reason unrelated to the
    //     debt it tracks.
    //
    // *** SO THE THREE ATTEMPTS MOVED THIS NUMBER 196 -> 165 -> 63 -> 186 UNDER ONE AUTHOR IN ONE ROUND,
    // WHICH IS THE SAME SIGNAL THE LINE BELOW ALREADY RECORDS ABOUT 22 -> 97 -> 228. *** The instrument is not
    // ready and the ratchet is left exactly where it was; what this round adds is three closed doors, so the
    // next attempt starts after them rather than at them.
    ok("REPORTED: three routes to the changelog-vs-load distinction were measured and refused", true,
       "(1) comment-stripping separates prose-in-a-comment from prose-in-a-string, not prose from a load: only " +
       "31 of 191 are comment-only, the rest are blurbs and where-fields in string literals. (2) runtime " +
       "directory enumeration is real but 92 of its 128 hits are tools/ walked BY GATES AUDITING IT -- v3223's " +
       "law in a third disguise. (3) demos_code (10 modules, enumerated by the non-gate launchIndex.mjs and " +
       "booted via ?go=) is the one earned case and is too small to reach the ceiling alone. NOTHING WAS " +
       "WIRED IN: a number that moves 196 -> 165 -> 63 -> 186 under one author in one round is not a measurement.");
    ok("REPORTED: the replacement scan is NOT shipped, and that is a decision", true,
       "a first attempt moved the actionable count 22 -> 97 -> 228 depending on which routes the resolver knew about (import specifiers, then worker targets, then the directory exemption). *** A NUMBER THAT MOVES THAT FAR UNDER ITS OWN AUTHOR IS NOT YET A MEASUREMENT, and rewriting a SHARED scan on one is the v3202 sweep shape that deleted 61 live modules. *** The exposure is frozen here instead, and the rewrite is a round with a fixture rather than a guess.");
}

console.log(fails ? "\nreferenceKind-selfcheck: " + fails + " FAILED" : "\nreferenceKind-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
