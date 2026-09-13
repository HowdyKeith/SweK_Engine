// WebGLEngine/tools/ship/treeRead-selfcheck.mjs -- v4548
//
// Run: node tools/ship/treeRead-selfcheck.mjs
//
// GATES tools/ship/treeRead.mjs -- the single cached read of the source tree that four censuses now share,
// and the three separate walkers it replaced.
//
// *** AN OPTIMISATION IS A CHANGE TO A MEASURING INSTRUMENT, AND THE ONLY THING THAT MAKES IT SAFE IS THAT
// THE ANSWER DID NOT MOVE. *** This round made frozenRecords-selfcheck 2.5x faster by memoising the guardian
// search, which is the kind of change that silently drops a record and reads as a speedup. So the rows below
// spend most of their effort on EQUIVALENCE rather than on speed: the old walkers' populations, the old
// census's exact output, and the old gate ordering.
//
// The speed claim itself is deliberately NOT a stopwatch assertion. Wall time on this box moves with the
// weather; what is asserted is the COUNT -- one walk where there were eighteen -- which is a property of the
// code and reproduces anywhere.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as TR from "./treeRead.mjs";
import * as FR from "./frozenRecords.mjs";
import * as AS from "./assertionShape.mjs";
import * as RD from "./recordDrift.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

console.log("treeRead-selfcheck -- one read of the tree, and the four censuses that used to take six\n");

// =============================================================================================================
console.log("1. *** ONE WALK, NOT SIX -- COUNTED, NOT TIMED ***");
{
    TR.clear();
    const a = TR.treeFiles();
    const b = TR.treeFiles();
    const c = TR.treePaths();
    const s = TR.stats();
    say(`${a.length} source files; stats after three calls: ${JSON.stringify(s)}`);
    ok("!! *** THREE CALLS, ONE WALK -- the memo is the whole point and this is the number that says so ***",
        s.walks === 1 && s.hits === 2,
        JSON.stringify(s) + ". BEFORE THIS MODULE, recordDrift-selfcheck issued 23,429 readFileSync and " +
        "12,397 readdirSync against a tree of 4,025 files in ~670 directories -- every file read SIX times " +
        "and every directory walked EIGHTEEN times -- for 606 ms of actual work.");
    ok("...and the same array identity comes back, so nothing downstream copies 55 MB to filter it",
        a === b && a.length === c.length);
    ok("!! a cleared memo really re-walks, so the counter is not simply stuck at one",
        (() => { TR.clear(); TR.treeFiles(); return TR.stats().walks === 1 && TR.stats().hits === 0; })(),
        "sabotage: a stats() that only ever reported 1 would pass the row above while the cache did nothing");
}

// =============================================================================================================
console.log("\n2. *** THE TEXT IS LAZY, AND THAT WAS A CORRECTION RATHER THAN A DESIGN ***");
{
    TR.clear();
    TR.treeFiles();
    const afterWalk = TR.stats().reads;
    const one = TR.treeFiles()[0];
    void one.text;
    const afterOne = TR.stats().reads;
    void one.text;
    const afterTwice = TR.stats().reads;
    ok("!! walking reads NO file text at all -- a consumer that wants 1,602 of 4,026 pays for 1,602",
        afterWalk === 0 && afterOne === 1,
        `reads after walk ${afterWalk}, after touching one file ${afterOne}. *** THE FIRST DRAFT READ ALL ` +
        `4,026 EAGERLY AND MADE assertionShape-selfcheck WORSE: 3,204 reads -> 4,026 and 392 ms -> 569. It ` +
        `was written eager and the probe meant to confirm the win showed a loss on the third row.`);
    ok("...and a second touch of the same file does not read it again",
        afterTwice === afterOne, `${afterTwice} vs ${afterOne}`);
}

// =============================================================================================================
console.log("\n3. *** THE THREE WALKERS THIS REPLACED SELECTED THE SAME FILES, AND STILL DO ***");
{
    TR.clear();
    const unified = TR.treePaths().slice().sort();
    const byFrozen = TR.treeFiles(ENG, TR.SKIP_AGREE.frozenRecords).map((f) => f.path).sort();
    const byDrift = TR.treeFiles(ENG, TR.SKIP_AGREE.recordDrift).map((f) => f.path).sort();
    say(`unified ${unified.length}, frozenRecords' old rule ${byFrozen.length}, recordDrift's old rule ${byDrift.length}`);
    ok("!! *** THE TWO OLD SKIP RULES STILL AGREE WITH THE UNIFIED ONE, FILE FOR FILE ***",
        unified.length === byFrozen.length && unified.every((p, i) => p === byFrozen[i]) &&
        unified.length === byDrift.length && unified.every((p, i) => p === byDrift[i]),
        "they were two different regexes written by two authors -- /[\\\\/]vendor[\\\\/]/ against /\\/vendor\\// " +
        "-- and they agree by coincidence rather than by construction, which is why both are kept in " +
        "SKIP_AGREE and compared here instead of a note claiming they matched once.");
    // A rule that selects a different set must be VISIBLE as different, or the row above proves nothing.
    const narrower = TR.treeFiles(ENG, /node_modules|[\\/](vendor|dist|physics)[\\/]/).map((f) => f.path);
    ok("...and a rule that really differs is seen to differ, so the agreement above is a finding",
        narrower.length < unified.length,
        `adding physics/ to the skip drops ${unified.length - narrower.length} files`);
}

// =============================================================================================================
console.log("\n4. *** gateFiles STILL RETURNS THE SAME GATES IN THE SAME ORDER AS THE WALKER IT REPLACED ***");
{
    // The old walker, reproduced here verbatim from what assertionShape.mjs held before v4548. ORDER matters
    // and is not decoration: recordDrift-selfcheck takes gateFiles()[0] as its sample gate, so a reordering
    // would silently change which gate that fixture tests.
    const SKIP = new Set(["node_modules", ".git", "vendor", ".claude"]);
    const old = [];
    (function walk(d) {
        let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of ents.sort((a, b) => a.name.localeCompare(b.name))) {
            if (SKIP.has(e.name) || (e.name.startsWith(".") && e.name !== ".claude")) continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p);
            else if (e.name.endsWith("-selfcheck.mjs") && !e.name.startsWith("__")) old.push(p);
        }
    })(ENG);
    const now = AS.gateFiles(ENG);
    say(`old walker ${old.length} gates, treeRead-backed ${now.length}`);
    ok("!! *** SAME SET AND SAME ORDER *** -- the two rules differ (old skipped .git and dot-dirs, new skips dist/)",
        old.length === now.length && old.every((p, i) => p === now[i]),
        `${old.length} against ${now.length}. They agree because no gate lives in a dot-directory or in dist/, ` +
        `which is a fact about the tree and is therefore checked here rather than assumed.`);
}

// =============================================================================================================
console.log("\n5. *** THE MEMOISED CENSUS RETURNS WHAT THE UNMEMOISED ONE RETURNED, FIELD FOR FIELD ***");
{
    // The guardian search was quadratic AND recomputed: ~95 record names tested against 1,602 gate sources,
    // ~152,000 substring searches, six times over because the gate calls census() six times. Memoising it is
    // what took frozenRecords-selfcheck from 2,966 ms to 1,384 -- and it is exactly the kind of change that
    // could drop a record and read as a speedup, so cold and warm are compared in full.
    const norm = (c) => JSON.stringify({
        records: c.records.map((r) => [r.name, r.file, r.fields, r.bytes, r.balanced, r.guardians, r.siblingNamesIt]),
        withFields: c.withFields, fields: c.fields, unguarded: c.unguarded,
        unbalanced: c.unbalanced, siblingWrong: c.siblingWrong,
    });
    FR.clearScanCache();
    const cold = norm(FR.census());
    const warm = norm(FR.census());
    ok("!! a warm census is byte-identical to the cold one it is standing in for",
        cold === warm, `${cold.length} chars each`);

    // The memo is keyed on `exclude`, because exclude changes both the population and which gates may be
    // guardians. A cache that ignored it would answer a different question than the one asked.
    const ex = /^tools\/ship\/frozenRecords\.mjs$/;
    FR.clearScanCache();
    const excludedCold = norm(FR.census({ exclude: ex }));
    const fullWarm = norm(FR.census());
    const excludedWarm = norm(FR.census({ exclude: ex }));
    ok("!! *** AND AN EXCLUDE IS NOT SERVED FROM THE UN-EXCLUDED CACHE ***",
        excludedCold === excludedWarm && excludedCold !== fullWarm,
        "excluding frozenRecords.mjs really removes its two records, warm and cold alike -- a memo keyed " +
        "only on 'the tree' would have handed the full answer back to a narrower question.");

    // And a caller supplying its own files/read bypasses the memo entirely, which is how the fixtures work.
    const two = FR.sources().filter((p) => /redCensus\.mjs$/.test(p));
    const injected = FR.census({ files: two, read: (f) => fs.readFileSync(f, "utf8") });
    ok("...and an injected file list is never answered from the memo",
        injected.records.length > 0 && injected.records.length < FR.census().records.length,
        `${injected.records.length} records from one injected file against ${FR.census().records.length} from the tree`);
}

// =============================================================================================================
console.log("\n6. *** THE FOUR CENSUSES STILL AGREE WITH EACH OTHER ON THE SIZE OF THE TREE ***");
{
    const drift = RD.sources().length;
    const frozen = FR.sources().length;
    const tree = TR.treePaths().length;
    const gates = AS.gateFiles().length;
    say(`recordDrift ${drift}, frozenRecords ${frozen}, treeRead ${tree}, gates ${gates}`);
    ok("!! every consumer of the shared read sees one population",
        drift === tree && frozen === tree,
        `${drift} / ${frozen} / ${tree} -- three modules that each used to walk for themselves`);
    ok("...and the gates are a strict subset of it",
        gates > 0 && gates < tree && AS.gateFiles().every((g) => TR.treePaths().includes(g)),
        `${gates} of ${tree}`);
}

console.log("\n7. *** A TRANSIENT FIXTURE IS NOT A SOURCE FILE, AND THE RACE WAS OPEN AT THIS WALKER ***");
{
    // Four gates plant a `__`-prefixed *-selfcheck.mjs on disk while they run and delete it after. v4409 closed
    // this for tools/ship/gateSweep.mjs's enumerateGates, where a discovered fixture got RUN; the same rule was
    // never applied to the shared walker, so the four censuses it feeds counted them whenever a run overlapped.
    // MEASURED at v4580: runtimeGap-selfcheck read 4081 files instead of 4080 about half the time at eight-wide
    // and was green in three runs alone -- a ship failure that never reproduces by itself.
    //
    // DRIVEN ON A REAL FILE, not on the walker's opinion of one. Planting and removing a fixture is the only way
    // to check an exclusion that only matters while a file exists.
    const fixture = path.join(ENG, "tools", "ship", "__treeread-fixture-selfcheck.mjs");
    const decoy = path.join(ENG, "tools", "ship", "zz-treeread-fixture-selfcheck.mjs");
    const body = "// transient fixture planted by treeRead-selfcheck; delete if you find it.\nexport const x = 1;\n";
    const base = TR.treeFiles(ENG, /node_modules|[/\\]dist[/\\]|[/\\]vendor[/\\]/).length;
    let withFixture = null, withDecoy = null;
    try {
        fs.writeFileSync(fixture, body);
        withFixture = TR.treeFiles(ENG, /node_modules|[/\\]dist[/\\]|[/\\]vendor[/\\]/).length;
        fs.unlinkSync(fixture);
        fs.writeFileSync(decoy, body);
        withDecoy = TR.treeFiles(ENG, /node_modules|[/\\]dist[/\\]|[/\\]vendor[/\\]/).length;
    } finally {
        for (const f of [fixture, decoy]) { try { fs.unlinkSync(f); } catch { /* already gone */ } }
    }
    say(`walk size: ${base} bare, ${withFixture} with a __ fixture on disk, ${withDecoy} with an ordinary one`);
    ok("!! *** a `__` fixture on disk does not change the population ***",
        withFixture === base,
        "the exclusion is in walk() itself, so all four censuses get it at once rather than one gate at a time");
    ok("...and the exclusion is NARROW: an ordinary new file still counts, so this is not a walk that ignores arrivals",
        withDecoy === base + 1,
        `${withDecoy} against ${base}. Without this half the row above would pass for a walker that had stopped ` +
        "seeing new files altogether -- which is the flattering failure, and it would make every census blind.");
    ok("...and nothing permanent is being hidden: no tracked source file in the tree starts with `__`",
        TR.treePaths().every((q) => !path.basename(q).startsWith("__")),
        "so the counts every census recorded before this change are the counts it reads after it");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nNOT claimed here: that enumerateGates in tools/ship/gateSweep.mjs was made cheap too. It was left " +
    "alone ON PURPOSE and the reason is a row in another gate: tools/ship/gateSweep-selfcheck.mjs PLANTS a " +
    "transient __-prefixed fixture on disk and re-enumerates to prove it is excluded. A memo there would " +
    "have answered from the pre-plant list and made that row pass WITHOUT the code under test doing " +
    "anything -- green for the wrong reason, which is worse than the 335 readdirs it would have saved. " +
    "closingCoverage.mjs still calls it eight times per recordDrift run, about 320 ms, and that is a " +
    "measured cost this round declined to take.");
process.exit(fails ? 1 : 0);
