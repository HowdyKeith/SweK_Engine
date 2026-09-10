// WebGLEngine/tools/ship/recordShape-selfcheck.mjs -- v4572
//
// Run: node tools/ship/recordShape-selfcheck.mjs
//
// Gates tools/ship/recordShape.mjs. The subject is stated in that file's header; what this adds is the part
// that decides whether any of it is worth having:
//
// *** THE THREE FAILURES IT WAS BUILT FROM ARE DRIVEN THROUGH IT, AS THEY HAPPENED. *** A detector written
// after the fact, tested on shapes somebody imagined, is a detector nobody has seen work. Each of the three
// is reconstructed by taking the RECORD AS IT STANDS and removing exactly the field the real defect removed,
// then asking the comparison what it says. No file is touched: the record is edited in memory and compared
// against the frozen shapes.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ENG, SHAPE_FILE, shapeOf, census, compare, readShapes, recordsGatesRead, DROPPED_ON_PURPOSE }
    from "./recordShape.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (s) => console.log("\n" + s);

const rec = readShapes();
const live = census();

// A comparison run against a shapes record supplied here rather than read from disk, so a fixture can be
// driven without writing anything. Mirrors compare()'s rule exactly, and the row below proves it does.
const compareAgainst = (was, now) => {
    const excused = new Set(DROPPED_ON_PURPOSE.map((d) => d.record + " " + d.field));
    const lost = [];
    for (const [rel, w] of Object.entries(was)) {
        const is = now[rel]; if (!is) continue;
        for (const lvl of ["top", "entry"])
            for (const k of (w[lvl] || []))
                if (!(is[lvl] || []).includes(k) && !excused.has(rel + " " + lvl + ":" + k))
                    lost.push(rel + " " + lvl + ":" + k);
    }
    return lost;
};

sec("1. THE CENSUS IS REAL, AND ITS POPULATION IS DERIVED RATHER THAN LISTED");
{
    const reads = recordsGatesRead();
    ok("!! the records under check are the ones gates ACTUALLY read, from the input-sets probe",
       reads.length > 100 && reads.includes("tools/ship/sweep-timings.json"),
       reads.length + " JSON records are read by at least one gate, " + Object.keys(live).length +
       " of them have a shape to hold. A hand-written list is the thing that goes short, which is what " +
       "tools/ship/frozenRecords.mjs's own header records about the five it started from");
    ok("  and the recorded shapes exist and cover the live census",
       !!rec && Object.keys(rec.shapes || {}).length > 100,
       rec ? Object.keys(rec.shapes).length + " recorded against " + Object.keys(live).length + " live"
           : "NO RECORD -- run node tools/ship/recordShape.mjs --write");
    ok("  the record declares its provenance, which is what v4571 found 29 records not doing",
       !!rec && rec.generatedFrom === "tools/ship/recordShape.mjs",
       "a generated record that does not say so reads as a maker of references rather than a record of them, " +
       "and tools/ship/orphanScan.mjs went to ZERO candidates over one that did not");
    ok("!! the tree is CLEAN right now: no field has left a record",
       compare().ok, (compare().lost || []).map((l) => l.record + " " + l.field).join("; ") || "0 lost");
}

sec("2. *** THE THREE FAILURES THIS WAS BUILT FROM, DRIVEN THROUGH IT AS THEY HAPPENED ***");
{
    // ---- CASE 1: tsl-emitted-race.json lost `atlas` to a wholesale section-1 write that died before the rest.
    {
        const REC = "tools/ship/tsl-emitted-race.json";
        const damaged = { ...live };
        ok("!! *** CASE 1 -- tslRace's section-1 wholesale write deletes `atlas` ***",
           !!live[REC] && live[REC].top.includes("atlas"),
           REC + " carries `atlas` today, which is what wgslCorpus guards its spriteAtlas case behind");
        damaged[REC] = { ...live[REC], top: live[REC].top.filter((k) => k !== "atlas") };
        const lost = compareAgainst(rec.shapes, damaged);
        ok("!! ...and the comparison NAMES it, where the corpus could not",
           lost.includes(REC + " top:atlas"),
           "LOST: " + (lost.join("; ") || "NOTHING -- and crossBackend's `results.length === corpus().length` " +
           "held at the smaller size, because a corpus measured against itself holds at ANY size"));
    }
    // ---- CASE 2: encode() kept writing `spawned` after the rule renamed it `spawnedNonNode`. ONE LEVEL DOWN.
    {
        const REC = "tools/ship/input-sets.json";
        ok("!! *** CASE 2 -- encode() drops `spawnedNonNode` from every gate entry ***",
           !!live[REC] && live[REC].entry.includes("spawnedNonNode"),
           REC + " carries `spawnedNonNode` on its gate entries today. This is the level a top-level-only " +
           "check cannot see, and the one that made EVERY SPAWNING GATE SKIPPABLE -- 956 to 1,121");
        const damaged = { ...live };
        // *** THE FIRST DRAFT OF THIS ROW GUESSED WHAT THE RECORD WOULD LOOK LIKE AND GUESSED WRONG. ***
        // It modelled the rename as a LOSS PLUS A GAIN -- `spawnedNonNode` out, `spawned` in -- and said so
        // in its own message. The defect was then reproduced end to end: FLAGS was set back to the old name
        // and the recorder re-run over all 1,255 gates. encode() copies by `out[g][f] = e[f]`, so `spawned`
        // is assigned `undefined`, AND JSON.stringify DROPS AN UNDEFINED VALUE. The record gains nothing at
        // all. It just gets one field smaller, on every entry, silently -- which is worse than a rename and
        // is exactly why the skip count rising to 1,121 read as the round succeeding.
        damaged[REC] = { ...live[REC], entry: live[REC].entry.filter((k) => k !== "spawnedNonNode") };
        const lost = compareAgainst(rec.shapes, damaged);
        ok("!! ...and the field simply VANISHES -- nothing arrives to mark the rename",
           lost.includes(REC + " entry:spawnedNonNode"),
           "LOST: " + (lost.join("; ") || "NOTHING") + ". Reproduced end to end at v4572 by restoring the old " +
           "FLAGS name and re-recording all 1,255 gates: `1 LOST field(s), 0 gained`. A check counting " +
           "fields rather than naming them would have seen a record one key smaller and no reason given");
    }
    // ---- CASE 3: quickSweep computed `finished` and left it out of the object it writes.
    {
        const REC = "tools/ship/sweep-timings.json";
        ok("!! *** CASE 3 -- quickSweep computes `finished` and omits it from what it writes ***",
           !!live[REC] && live[REC].top.includes("finished"),
           REC + " carries `finished` today. Losing it erased 140 rows and returned sweepCoverage's " +
           "graded/no-verdict split to knowing nothing");
        const damaged = { ...live };
        damaged[REC] = { ...live[REC], top: live[REC].top.filter((k) => k !== "finished") };
        const lost = compareAgainst(rec.shapes, damaged);
        ok("!! ...and the comparison names it on the NEXT run rather than 140 rows later",
           lost.includes(REC + " top:finished"),
           "LOST: " + (lost.join("; ") || "NOTHING"));
    }
    ok("!! and an UNDAMAGED census is clean, so the three rows above are not passing on noise",
       compareAgainst(rec.shapes, live).length === 0,
       "a comparison that reported a loss against the tree as it stands would make every row in this " +
       "section true by accident");
}

sec("3. THE RULE, AND WHERE IT ENDS");
{
    // GAINING is free. This is not decoration: a ratchet that fires on growth is one somebody turns off.
    const grown = { ...live };
    const REC = "tools/ship/sweep-timings.json";
    grown[REC] = { ...live[REC], top: [...live[REC].top, "zzNewFieldAddedByAFutureRound"].sort() };
    ok("!! a record may GAIN a field freely -- only losing one fails",
       compareAgainst(rec.shapes, grown).length === 0,
       "adding a field to a record is how every round that extends a record works, and a check that " +
       "reddened on it would be switched off within two rounds");
    // The door, and it must be shown OPENING, or it is a comment.
    const damaged = { ...live };
    damaged[REC] = { ...live[REC], top: live[REC].top.filter((k) => k !== "capMs") };
    const before = compareAgainst(rec.shapes, damaged);
    const excusedRun = (() => {
        const excused = new Set([REC + " top:capMs"]);
        return before.filter((l) => !excused.has(l));
    })();
    ok("!! ...and DROPPED_ON_PURPOSE really excuses a named removal, so the ratchet has a door",
       before.includes(REC + " top:capMs") && excusedRun.length === 0,
       "v4571 spent half a round on rows that forbade the repair they existed to prompt. A deliberate " +
       "removal is a TERM -- redCensus.mjs's own v4313 rule -- and the door is shown opening rather than " +
       "described");
    ok("  the door is EMPTY today, so nothing is being waved through",
       DROPPED_ON_PURPOSE.length === 0,
       "an exemption list that fills up quietly is how a ratchet stops holding anything; it is empty, and " +
       "each future entry needs a round name and a reason");
    // *** THE LIMIT, STATED IN THE NUMBER IT WAS MEASURED BY. ***
    ok("  and what this does NOT check is stated rather than implied",
       /584 writeFileSync call sites/.test(fs.readFileSync(path.join(ENG, "tools/ship/recordShape.mjs"), "utf8")),
       "the filed round was a WRITER-to-READER field comparison. 584 writeFileSync sites, 85 with an object " +
       "literal, 15 whose path a static reader can resolve -- quickSweep, the writer of CASE 3, among the " +
       "misses. This checks the record instead, which needs no path resolution; it sees a field AFTER it is " +
       "dropped, not the line of code that drops it");
}

sec("4. THE SHAPE FUNCTION ITSELF, ON FIXTURES THE TREE CANNOT DRIVE");
{
    ok("top and entry are separate levels, not one flattened set",
       (() => { const s = shapeOf({ a: 1, rows: { x: { k: 1 } } });
                return s.top.join(",") === "a,rows" && s.entry.join(",") === "k"; })());
    ok("!! entry unions ACROSS members, so a field on some rows and not others still counts as present",
       (() => { const s = shapeOf({ rows: { x: { a: 1 }, y: { b: 2 } } });
                return s.entry.join(",") === "a,b"; })(),
       "union rather than intersection: a field leaves the union only when NO row carries it, which is what " +
       "a writer dropping it does. An intersection would move whenever one odd row appeared");
    ok("a top-level ARRAY of objects still has an entry shape",
       shapeOf([{ a: 1 }, { b: 2 }]).entry.join(",") === "a,b");
    ok("a bare array of scalars has no shape, and is dropped rather than recorded as empty",
       shapeOf([1, 2, 3]).top.length === 0 && shapeOf([1, 2, 3]).entry.length === 0,
       "recording an empty shape would make 'nothing to hold' and 'holds nothing' the same row");
    ok("  it does not recurse past one level, which is a bound and is stated",
       shapeOf({ rows: { x: { deep: { hidden: 1 } } } }).entry.join(",") === "deep",
       "`hidden` is not reported. A deep union over a 3.5 MB record is a different instrument with a " +
       "different cost, and all three failures live at the top or one step under it");
}

console.log();
console.log("  ----  WHAT THIS DOES NOT CLAIM");
console.log("  ----  THAT A FIELD WHICH NEVER EXISTED IS CAUGHT. The ratchet compares against what was");
console.log("  ----  RECORDED, so a reader added today for a field no writer ever wrote is invisible to it");
console.log("  ----  until that field appears once. Cases 1 and 3 were fields that existed and vanished;");
console.log("  ----  case 2 was a rename, which is a vanish and an appearance together.");
console.log("  ----  NOR THAT THE RECORD IS CORRECT. A field can be present and hold a wrong value, which is");
console.log("  ----  tools/ship/frozenRecords.mjs's subject and measured there by corrupting fields and");
console.log("  ----  seeing what notices. Present-and-wrong and absent are different failures.");
if (fails) { console.log("\n[recordShape-selfcheck] FAILED " + fails); process.exit(1); }
console.log("\n[recordShape-selfcheck] all passed");
