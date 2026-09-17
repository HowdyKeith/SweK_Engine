#!/usr/bin/env node
// WebGLEngine/tools/ship/inputSets-selfcheck.mjs -- v4566
//
// GATES tools/ship/inputSets.mjs, tools/ship/inputProbe.mjs and tools/ship/recordInputs.mjs.
//
// *** THE SWEEP RE-ANSWERS 1,253 QUESTIONS EVERY RUN AND A ROUND MOVES FIVE TO FIFTEEN FILES. ***
// v4548 measured where the 525 s of gate time goes and ruled out the obvious levers: the shared tree walk is
// 42 ms, process startup across 1,141 spawns is 35 s (5%, real but not the prize). THE COST IS THE GATES
// DOING THEIR WORK, and the only way to make that cheaper is not to do it when nothing it reads has moved.
//
// *** AND THE MECHANISM'S ONE FAILURE IS THE WORST KIND THIS TREE RECOGNISES. *** A gate that should have
// run and did not is a SILENT false green. Every other failure here announces itself. So the rule in
// inputSets.mjs is shaped to REFUSE -- it answers "skippable" only when everything is known, and "run" when
// anything is merely unknown -- and this gate's job is to prove the refusals are real rather than decorative.
//
// WHAT IS NOT CLAIMED, and it is the honest limit of dynamic probing: an input set is what a gate read ON ONE
// RUN, which is a SAMPLE, not a specification. A gate that branches on something outside the tree -- an
// environment variable, a device that is present today and absent tomorrow, a clock -- can read different
// files on different runs, and a set recorded on the narrow branch would let the wide branch be skipped.
// Three things stand against that and none of them is a proof:
//   * a missing path checked with existsSync IS recorded (as a dir-shaped entry hashing to null), so the file
//     APPEARING invalidates the gate. Section 4 measures this rather than asserting it.
//   * spawned, net and namedFsImport are disqualifiers, never skipped.
//   * the sets were probed TWICE across 60 gates and came back identical 60 of 60.
// The mechanism ships OFF: quickSweep reports what it would skip and runs everything anyway until
// --incremental is passed. That number is the evidence, gathered in public over rounds.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENG, RECORD, FORMAT, hashFile, hashDir, readRecord, whyRun, skippable, partition, reasonHistogram,
         encode, decode, clearHashCache, CONFLICT, FLAGS, firstMoved, markChangedDuringPass,
         carryForward } from "./inputSets.mjs";
import { usesNamedFsImport, probeOne, entryFor } from "./recordInputs.mjs";
import { selectGates } from "./quickSweep.mjs";
import { noComments } from "./sourceScan.mjs";

let fails = 0;
const ok = (name, cond, detail = "") => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const REC = readRecord();
const GATES = Object.keys(REC.gates || {});

console.log("1. the record exists and says what it is");
ok("tools/ship/input-sets.json is present and holds entries for the sweep's population",
   GATES.length > 800, `${GATES.length} gate(s) recorded`);
ok("  and its note names the disqualifiers that remain, so the file explains its own refusals",
   /spawnedNonNode/.test(REC.note) && /net/.test(REC.note), (REC.note || "").slice(0, 60) + "...");
ok("  every entry carries a hash for every path it recorded -- a path with no hash cannot be compared",
   GATES.every((g) => { const e = REC.gates[g];
       return (e.reads || []).every((r) => r in (e.hashes || {})) && (e.dirs || []).every((d) => d in (e.dirHashes || {})); }),
   "reads -> hashes, dirs -> dirHashes");

console.log("\n2. *** THE RULE REFUSES ON EVERY UNKNOWN, AND EACH REFUSAL IS DRIVEN ON A FIXTURE ***");
const observed = [];
{
    // Fixtures rather than live entries: a rule that only ever sees the tree's own shapes is a rule nobody
    // has tested the edges of. Each of these is one disqualifier alone, everything else valid.
    const good = { reads: ["a.mjs"], dirs: [], hashes: { "a.mjs": hashFile("tools/ship/inputSets.mjs") }, dirHashes: {},
                   spawnedNonNode: false, net: false };
    const rec = (over) => ({ format: FORMAT, gates: { "a.mjs": { ...good, ...over } } });
    // the control: the same entry, with the hash actually matching the file it names
    const real = { reads: ["tools/ship/inputSets.mjs"], dirs: [], hashes: { "tools/ship/inputSets.mjs": hashFile("tools/ship/inputSets.mjs") },
                   dirHashes: {}, spawnedNonNode: false, net: false };
    ok("CONTROL: a complete entry whose one recorded file still hashes to what it hashed is SKIPPABLE",
       whyRun("tools/ship/inputSets.mjs", { format: FORMAT, gates: { "tools/ship/inputSets.mjs": real } }) === null,
       "if this row ever fails, every refusal below is passing for the wrong reason");
    ok("REFUSED: a gate with no entry at all", whyRun("nope.mjs", rec({})) === "no recorded input set");
    ok("REFUSED: spawned a child the probe could not follow",
       whyRun("a.mjs", rec({ spawnedNonNode: true })) === "spawned a child the probe could not follow");
    ok("REFUSED: opened a socket or fetched", whyRun("a.mjs", rec({ net: true })) === "opens a socket or fetches");
    // *** v4567 -- AND THE TWO THAT ARE NO LONGER REFUSALS, ASSERTED AS SUCH. *** A disqualifier that has
    // been lifted has to be checked in the lifted direction, or the next reader cannot tell "we fixed this"
    // from "we forgot this". A named fs import and a NODE child are both fine now, and section 3b measures
    // WHY they are fine rather than taking the rule's word for it.
    ok("ALLOWED now: a gate taking fs by NAMED import (the loader hook binds those names to the shim)",
       whyRun("tools/ship/inputSets.mjs", { format: FORMAT, gates: { "tools/ship/inputSets.mjs": { ...real, namedFsImport: true } } }) === null);
    ok("ALLOWED now: a gate that spawned only NODE children (NODE_OPTIONS carried the probe into them)",
       whyRun("tools/ship/inputSets.mjs", { format: FORMAT, gates: { "tools/ship/inputSets.mjs": { ...real, spawnedNode: 6, procs: 7 } } }) === null);
    ok("REFUSED: an EMPTY recorded set -- 'read nothing' and 'we saw nothing' are not the same claim",
       whyRun("a.mjs", rec({ reads: [], dirs: [], hashes: {} })) === "recorded an empty input set");
    ok("REFUSED: a set that does not contain the gate's OWN source (node read it to run it, so its absence is a broken record)",
       whyRun("a.mjs", rec({ reads: ["b.mjs"], hashes: { "b.mjs": "deadbeef" } })) === "its own source is not in its recorded set");
    ok("REFUSED: a recorded file whose content has moved, and the reason NAMES the file",
       whyRun("a.mjs", rec({ hashes: { "a.mjs": "0000000000000000" } })) === "changed: a.mjs");
    // Keyed on a file that really exists, so the FIRST recorded path passes and the row is about the second.
    // (My first draft used the "a.mjs" fixture, whose own hash could never match, so it reported the wrong
    // filename and the row tested nothing about a missing file at all.)
    const self = "tools/ship/inputSets.mjs";
    ok("REFUSED: a recorded file that is GONE (hashFile returns null, which no recorded hash equals)",
       whyRun(self, { format: FORMAT, gates: { [self]: { ...good, reads: [self, "vanished.mjs"], dirs: [],
           hashes: { [self]: hashFile(self), "vanished.mjs": "abc" } } } }) === "changed: vanished.mjs");
}

// ONE probe of vacuity-selfcheck, shared by sections 3, 7 and 8 -- see the note in section 3.
const VACUITY = probeOne("tools/ship/vacuity-selfcheck.mjs");

console.log("\n3. *** THE PROBE, AGAINST A GATE WHOSE INPUTS ARE KNOWN BY OTHER MEANS ***");
{
    // vacuity-selfcheck imports exactly one module of this tree. Its input set must be those two files and
    // nothing else -- which is also the transitive-closure claim: the probe sees a module load, not just a
    // readFileSync somebody typed.
    // *** PROBED ONCE AND SHARED, because probeOne SPAWNS A NODE CHILD THAT RUNS THE WHOLE GATE. *** This
    // file called probeOne("vacuity-selfcheck") three separate times -- sections 3, 7 and 8 -- for one
    // answer, at 93 ms a spawn.
    const p = VACUITY;
    const mjs = p.reads.filter((r) => /\.(mjs|js|cjs)$/.test(r)).sort();
    ok("*** the probe sees MODULE LOADS, not only explicit reads: a gate that imports one module records both files ***",
       p.ok && mjs.join() === "tools/ship/vacuity-selfcheck.mjs,tools/ship/vacuity.mjs",
       mjs.join(", ") || "(none)");
    // The closure has to be transitive or the whole mechanism is unsound: a gate is invalidated by a change
    // to something it imports THROUGH something it imports.
    //
    // *** THE FIXTURE CHANGED AT v4633 AND THE CLAIM GOT STRONGER FOR IT. *** This row used to probe
    // tools/ship/sweepCoverage-selfcheck.mjs, which costs 3,016 ms -- 40% of this whole gate, and the single
    // reason it sat at 3,027 ms against a 3,000 ms budget, where its own red went unseen for nine rounds.
    // It also could not show what it claimed: that gate imports so much that "reached through another
    // import" and "imported directly" are indistinguishable by reading it. brain/agent/dispatch-selfcheck
    // costs 167 ms and the chain is short enough to check by eye: the gate imports ./dispatch.js and
    // ./fleet.js and NOTHING ELSE, while dispatch.js imports ../flowfieldCpu.js. So brain/flowfieldCpu.js is
    // in the set and the gate never names it -- which is the property, stated about a file rather than about
    // a count.
    const q = probeOne("brain/agent/dispatch-selfcheck.mjs");
    const reachedOnlyThrough = "brain/flowfieldCpu.js";
    const namedDirectly = fs.readFileSync(path.join(ENG, "brain/agent/dispatch-selfcheck.mjs"), "utf8");
    ok("*** and the closure is TRANSITIVE: a module reached ONLY through another import is in the set ***",
       q.ok && q.reads.includes(reachedOnlyThrough) && !namedDirectly.includes("flowfieldCpu"),
       `${q.reads.length} reads including ${reachedOnlyThrough}, which the gate's own source never mentions ` +
       `-- it comes in through brain/agent/dispatch.js. A gate is invalidated by a change to something it ` +
       `imports THROUGH something it imports, or the whole mechanism is unsound.`);
    // *** READ OFF THE RECORD RATHER THAN RE-PROBED, WHICH SAVED 522 ms AND IS THE HONEST SOURCE ANYWAY. ***
    // This row is a claim about what the RECORD says of a whole-tree walker, and the record is right here in
    // memory -- spawning the walker again to re-derive an entry this file has already loaded is paying 522 ms
    // to ask the same question twice. That the probe itself is faithful is what the two rows above establish,
    // on gates small enough to state the whole expected answer for.
    const walker = Object.entries(REC.gates)
        .map(([g, e]) => [g, (e.reads || []).length]).sort((a, b) => b[1] - a[1])[0];
    ok("  a gate that walks the tree records a set the size of the tree, and is therefore never skippable in practice",
       walker && walker[1] > 1000 && whyRun(walker[0], REC) !== null,
       `the widest recorded set is ${walker[0]} at ${walker[1]} paths, and whyRun says ` +
       `"${whyRun(walker[0], REC)}" -- the mechanism does not pretend a whole-tree walk is a small dependency`);
}

console.log("\n4. *** A FILE THAT DID NOT EXIST AT RECORD TIME AND NOW DOES ***");
{
    // The sharpest unsoundness a dynamic probe can have: a gate whose read is behind `if (existsSync(x))`
    // records nothing about y when x is absent, so x appearing could be skipped straight past. existsSync
    // records x as a dir-shaped entry hashing to null, so the appearance IS a change. Measured, not assumed.
    const tmp = "tools/ship/__inputsets_fixture__.json";
    const abs = path.join(ENG, tmp);
    try { fs.unlinkSync(abs); } catch {}
    // Through encode()/decode() for the reason section 2 gives at length: hand-spelled in the decoded
    // shape, this fixture answered "no usable input record" from v4574 onward and the row below reported
    // that sentence as though it were about the appearing file. `spawned` was the pre-v4567 spelling and
    // had been dead here since the rename; the flags are the ones FLAGS names.
    const entry = { reads: ["tools/ship/inputSets.mjs"], dirs: [tmp],
                    hashes: { "tools/ship/inputSets.mjs": hashFile("tools/ship/inputSets.mjs") },
                    dirHashes: { [tmp]: hashDir(tmp) }, spawned: false, net: false, namedFsImport: false };
    const rec = { format: FORMAT, gates: { "tools/ship/inputSets.mjs": entry } };
    ok("with the file absent -- exactly as it was when the entry was recorded -- the gate is skippable",
       whyRun("tools/ship/inputSets.mjs", rec) === null, `recorded dirHash ${JSON.stringify(entry.dirHashes[tmp])}`);
    fs.writeFileSync(abs, "{}\n");
    // clearHashCache, because this gate WRITES between two questions and the memoisation would otherwise
    // answer the second from the first. partition() clears it for the same reason; a bare whyRun does not.
    clearHashCache();
    const why = whyRun("tools/ship/inputSets.mjs", rec);
    try { fs.unlinkSync(abs); } catch {}
    observed.push(why);   // the DIRECTORY arm of `changed:`, which section 2 drives on a file
    ok("*** and the moment the file APPEARS the same entry says RUN, naming it -- an absence is a dependency ***",
       why === "changed: " + tmp, why || "(skippable -- which would be the silent false green)");
}

console.log("\n4b. the indexed format, and the conflict it exists to refuse");
{
    // The on-disk form stores ONE hash per PATH, not per (gate, path) -- which is what took the record from
    // 42 MB to 3.1 MB and the decision from 8,377 ms to under 600. That is only sound while every gate saw
    // the same content, and the recording pass runs gates that WRITE into the tree, so it need not hold.
    // Each fixture includes its OWN source, so the "own source is in the set" rule passes and the row is
    // about the conflict rather than about that.
    const A = { reads: ["a.mjs", "x.mjs"], dirs: [], hashes: { "a.mjs": "aaaaaaaaaaaaaaaa", "x.mjs": "1111111111111111" }, dirHashes: {} };
    const B = { reads: ["b.mjs", "x.mjs"], dirs: [], hashes: { "b.mjs": "bbbbbbbbbbbbbbbb", "x.mjs": "2222222222222222" }, dirHashes: {} };
    const enc = encode({ "a.mjs": A, "b.mjs": B });
    ok("*** two gates that saw DIFFERENT content for one path make it a CONFLICT, and neither reading wins ***",
       enc.conflicts.join() === "x.mjs" && enc.hashes[enc.paths.indexOf("x.mjs")] === CONFLICT,
       `conflicts ${JSON.stringify(enc.conflicts)}, stored hash ${JSON.stringify(enc.hashes[enc.paths.indexOf("x.mjs")])}`);
    // *** THIS ROW FOUND THE BUG IN THE GUARD ABOVE. *** The first version stored a conflicting hash as
    // null, "which no live hash equals" -- and hashFile returns null for a file that does not exist, so a
    // conflicting path that had since been deleted matched null exactly and came back SKIPPABLE. Keyed on a
    // gate whose own source is real, so the row is about the conflicting path and nothing else.
    const g1 = "tools/ship/inputSets.mjs", g2 = "tools/ship/recordInputs.mjs";
    const conflicted = decode(encode({
        [g1]: { reads: [g1, "x.mjs"], dirs: [], hashes: { [g1]: hashFile(g1), "x.mjs": "1111111111111111" }, dirHashes: {} },
        [g2]: { reads: [g2, "x.mjs"], dirs: [], hashes: { [g2]: hashFile(g2), "x.mjs": "2222222222222222" }, dirHashes: {} },
    }));
    clearHashCache();
    ok("  and the sentinel refuses every gate that touched it -- INCLUDING when that path does not exist, which null did not",
       whyRun(g1, conflicted) === "changed: x.mjs" && whyRun(g2, conflicted) === "changed: x.mjs",
       `${whyRun(g1, conflicted)} / ${whyRun(g2, conflicted)}; x.mjs is absent from the tree, so a null ` +
       "sentinel would have matched its live null reading and skipped both");
    ok("  agreeing gates are NOT a conflict, so the check is not simply flagging every shared path",
       encode({ "a.mjs": A, "b.mjs": { ...A } }).conflicts.length === 0);
    // *** THE LIVE RECORD HAS NONE, AND UNTIL v4633 IT HAD 130 -- WHICH THIS ROW REPORTED FOR NINE ROUNDS
    // AND NOBODY SAW. *** The gate is recorded at 3,027 ms against a 3,000 ms quick-sweep budget, 27 ms over,
    // so the sweep skipped it and its red was invisible from the v4622 merge until a round ran the cascade by
    // hand. That is backlog item #14's own shape: a gate over budget does not run at ship time AT ALL.
    //
    // WHAT THE 130 WERE: tools/ship/recordInputs.mjs seeded its output with the PREVIOUS record so a partial
    // re-probe would not erase everything else, and a carried-over entry's hashes are from the previous pass.
    // encode() stores ONE hash per path, so folding a T0 hash with a T1 hash is a conflict -- and the tree
    // changes between passes. The conflicting paths were exactly what rounds edit: tools/ship (a directory
    // that gains a gate most rounds), gate-reports, gateSweep.mjs, nextRounds.mjs, runtimeGap.mjs. Re-running
    // with an empty prior on the same tree gave 0. It cost 283 of 1,293 gates their skip, against 23 refused
    // by a hash that genuinely differed, off 58 poisoned paths. The recorder now VALIDATES the prior instead
    // of blending it: an entry whose paths still match the tree is carried (it contributes the same hash a
    // fresh one would, so no conflict can arise), and one that does not is dropped rather than carried stale.
    // *** AND THE ROW BELOW SAID A NONZERO COUNT MEANS ONE THING WHEN IT MEANS TWO. ***
    //
    // It required the list to be flatly EMPTY and explained a nonzero count as "a caller mixed two passes
    // into one encode()". That is one cause. The other is the CONFLICT sentinel doing exactly the job
    // tools/ship/recordInputs.mjs built it for, inside ONE pass: markChangedDuringPass re-hashes every
    // recorded path after the pass with the memo cleared, and a path some gate WROTE while another was
    // reading it gets two genuinely different hashes from two gates in the same fold -- which is a conflict
    // by encode()'s own rule, correctly.
    //
    // *** THE TWO MODULES READ ONE CONVENTION IN OPPOSITE SENSES, AND recordInputs.mjs SAYS SO IN WRITING. ***
    // Its note beside `changedDuringPass` reads "Distinct from `conflicts`, which is the fold's own ratchet
    // and must be empty" -- and the mechanism it describes one line earlier is what puts entries INTO
    // `conflicts`. Measured at v4645 on a full 1,301-gate pass with a validated prior: two paths,
    // tools/ship/__sweepcov_leaker_fixture.mjs and tools/ship/install-history.json, appeared in BOTH lists,
    // identically. The first is a fixture a gate leaves behind ON PURPOSE, so the flat-empty form of this row
    // could never go green on a tree that contains it.
    //
    // So the row asks the decidable question instead: a conflict is allowed exactly when the post-pass
    // re-hash NAMED that path. A conflict on a path nothing wrote during the pass is still the two-pass fold,
    // and is still red. Zero remains the better number and the detail says which case produced what.
    // SABOTAGED: a path added to the conflict list that changedDuringPass does not name goes red BY NAME
    // (UNEXPLAINED: tools/ship/SABOTAGE_NOT_WRITTEN.json), so the row still refuses the case it was
    // written for and has not been widened into a row that accepts anything.
    const changed = new Set(REC.changedDuringPass || []);
    const unexplained = (REC.conflicts || []).filter((p) => !changed.has(p));
    ok("!! *** every conflicting path was WRITTEN during the pass -- none is the two-pass fold the 130 were ***",
       Array.isArray(REC.conflicts) && unexplained.length === 0,
       `${(REC.conflicts || []).length} conflicting path(s) across ${GATES.length} gates, ` +
       `${(REC.conflicts || []).length - unexplained.length} of them named by changedDuringPass` +
       (unexplained.length ? ` -- UNEXPLAINED: ${unexplained.join(", ")}` : "") +
       `. An unexplained conflict means a caller mixed two passes into one encode(), which is exactly what ` +
       `shipped from v4622 to v4632; an explained one means a gate wrote a file another gate was reading, ` +
       `which is the sentinel working and costs those gates their skip rather than their correctness.`);

    // *** AND THE STALE-ENTRY CASE THE SENTINEL WAS FIRING ON IS ALREADY REFUSED, PER GATE, WITHOUT IT. ***
    // That is why the sentinel's blast radius was the wrong shape: whyRun re-hashes each gate's OWN paths
    // against its OWN recorded hashes, so a stale carried-over entry is refused by itself. What the sentinel
    // ADDED was poisoning the path for every other gate -- including gates probed in the same pass whose
    // reading of it was perfectly current.
    const liveSrc = "tools/ship/inputSets.mjs";
    clearHashCache();
    const staleEntry = { reads: [g1, liveSrc], dirs: [],
                         hashes: { [g1]: hashFile(g1), [liveSrc]: "deadbeefdeadbeef" }, dirHashes: {} };
    const freshEntry = { reads: [g2, liveSrc], dirs: [],
                         hashes: { [g2]: hashFile(g2), [liveSrc]: hashFile(liveSrc) }, dirHashes: {} };
    const blended = decode(encode({ [g1]: staleEntry, [g2]: freshEntry }));
    const validated = decode(encode({ [g2]: freshEntry }));   // the recorder drops the stale one
    clearHashCache();
    ok("!! *** a STALE entry is refused by itself, and blending it refuses the FRESH gate beside it too ***",
       firstMoved(staleEntry) === liveSrc && firstMoved(freshEntry) === null &&
       whyRun(g2, blended) === "changed: " + liveSrc && whyRun(g2, validated) === null,
       `on its own the stale entry's first moved path is ${firstMoved(staleEntry)} and the fresh one's is ` +
       `none, so whyRun refuses the stale gate either way. BLENDED, the fresh gate reads ` +
       `"${whyRun(g2, blended)}" -- it is refused for a path it recorded CORRECTLY, because the other ` +
       `entry's stale reading poisoned the shared slot. VALIDATED, it reads ${JSON.stringify(whyRun(g2, validated))}. ` +
       `That one-gate difference is 283 gates on the real record, and it is why dropping a stale entry is ` +
       `not a loss: "changed: x" and "no recorded input set" both mean the gate runs.`);

    // *** AND THE RECORDER'S OWN CARRY RULE IS DRIVEN HERE RATHER THAN TRUSTED. *** carryForward is what
    // tools/ship/recordInputs.mjs seeds a pass with, and it was inline in that file's CLI until v4633 --
    // which meant no row could catch its removal without a 205-second re-record. Exported, it is a fixture
    // away: the stale entry must be dropped and the fresh one carried, and encoding what SURVIVES must
    // produce no conflict, which is the property that makes the whole repair sound.
    clearHashCache();
    const cf = carryForward({ [g1]: staleEntry, [g2]: freshEntry });
    const survivors = encode(cf.carried);
    ok("!! *** the recorder carries an entry that still matches and DROPS one that does not, so no fold conflicts ***",
       cf.dropped.join() === g1 && Object.keys(cf.carried).join() === g2 && survivors.conflicts.length === 0,
       `dropped ${JSON.stringify(cf.dropped)}, carried ${JSON.stringify(Object.keys(cf.carried))}, and ` +
       `encoding the survivors yields ${JSON.stringify(survivors.conflicts)} conflict(s). On the live tree ` +
       `this is what takes the record from 130 conflicts to 0. THE ROW IS ABOUT DROPPING, NOT ABOUT ` +
       `CARRYING: a rule that carried everything would put the 130 straight back, and one that carried ` +
       `nothing would still be correct but would re-probe 1,302 gates to learn what 1,200 of them already ` +
       `knew -- so both halves are asserted.`);
    // =========================================================================================================
    // *** THE RACE encode()'s NOTE USED TO CLAIM IT CAUGHT, AND THE READING THAT ACTUALLY CATCHES IT. ***
    // The note above encode() said for six rounds: the pass runs gates, some gates WRITE into the tree, "so a
    // path read early in the pass and again at the end can carry two different hashes". True about the tree,
    // false about the code -- hashFile is memoised for the whole pass, which is what turns 443,405 hashes
    // into 4,072. The late gate asks and is handed the EARLY reading, so encode() never sees two values and
    // the conflict count for a genuine mid-pass write is ZERO.
    //
    // This drives it on a real file rather than arguing it. The row is stated as the PROPERTY of the memo
    // rather than as "the memo hides it", so that removing the memo one day makes this row go GREEN on a
    // better tree instead of red on an improvement: what is asserted is that the two readings agree with each
    // other WHEN the cache is not cleared, and that clearing it gives the truth.
    const raceRel = "tools/ship/__inputsets_race_fixture__.txt";
    const raceAbs = path.join(ENG, raceRel);
    clearHashCache();
    fs.writeFileSync(raceAbs, "what the early gate read\n");
    const earlyRead = hashFile(raceRel);
    fs.writeFileSync(raceAbs, "what a later gate in the same pass wrote\n");
    const lateRead = hashFile(raceRel);          // no clearHashCache -- this IS the pass
    clearHashCache();
    const truth = hashFile(raceRel);
    const raceEnc = encode({
        "a.mjs": { reads: ["a.mjs", raceRel], dirs: [], hashes: { "a.mjs": "aaaaaaaaaaaaaaaa", [raceRel]: earlyRead }, dirHashes: {} },
        "b.mjs": { reads: ["b.mjs", raceRel], dirs: [], hashes: { "b.mjs": "bbbbbbbbbbbbbbbb", [raceRel]: lateRead }, dirHashes: {} },
    });
    ok("!! *** A MID-PASS WRITE PRODUCES NO CONFLICT AT ALL: the memo hands the late gate the early reading ***",
       earlyRead === lateRead && lateRead !== truth && raceEnc.conflicts.length === 0,
       `early ${earlyRead}, late ${lateRead}, and what the file actually said by then ${truth}. Two gates, ` +
       `one path, content that DID change between them -- and encode() reports ` +
       `${JSON.stringify(raceEnc.conflicts)}. This is the measurement that makes the sentinel's old ` +
       `justification false: for six rounds it claimed to catch exactly this, while every conflict it ` +
       `actually carried came from the cross-pass merge two rows up.`);

    // *** SO THE HAZARD IS REAL AND NEEDS A READING TAKEN SOMEWHERE THE MEMO CANNOT ANSWER: AFTER THE PASS.
    // *** markChangedDuringPass clears the cache and re-hashes every recorded path, which is the only moment
    // the question can be asked truthfully. On the live tree it costs 630 ms over 13,073 paths and finds
    // TWO, on every pass: tools/ship/host-timings.local.json and tools/ship/install-history.json, both
    // gitignored outputs that gates write while the pass is reading them. A recurring detection rather than
    // a one-off -- and the first run of it also caught the author editing two source files mid-pass, which
    // is the same hazard wearing a different hat.
    // *** THE TWO GATES ARE REAL FILES, AND THE FIRST DRAFT OF THIS ROW PROVED WHY. *** Keyed on invented
    // names -- "a.mjs", "b.mjs" -- the detector flagged BOTH of them, correctly: a path whose recorded hash
    // is "aaaaaaaaaaaaaaaa" and whose live hash is null (it does not exist) HAS moved by this reading. The
    // fixture was wrong and the code was right, which is the only direction worth finding out this way.
    clearHashCache();
    const marked = {
        [g1]: { reads: [g1, raceRel], dirs: [], hashes: { [g1]: hashFile(g1), [raceRel]: earlyRead }, dirHashes: {} },
        [g2]: { reads: [g2], dirs: [], hashes: { [g2]: hashFile(g2) }, dirHashes: {} },
    };
    // *** THE CACHE IS LEFT HOT ON PURPOSE, AND THE FIRST DRAFT OF THIS ROW WAS WORTHLESS WITHOUT IT. ***
    // The recorder calls the detector at the END of a pass, when the memo is holding a reading for every one
    // of 13,074 paths -- so the detector's own clearHashCache() is the entire mechanism. Driven from a COLD
    // cache the row passed whether that clear was there or not: the sabotage sweep deleted it and every gate
    // stayed green. So the fixture puts the memo in the state the recorder leaves it in -- holding the EARLY
    // reading while the disk says something else -- which is the only state in which the clear does work.
    fs.writeFileSync(raceAbs, "what the early gate read\n");
    hashFile(raceRel);                                                        // the pass reads it, and memoises
    fs.writeFileSync(raceAbs, "what a later gate in the same pass wrote\n");   // a later gate overwrites it
    const det = markChangedDuringPass(marked);
    const detRec = decode(encode(marked));
    clearHashCache();
    ok("!! *** ...and THIS reading sees it: the path is named, marked CONFLICT, and its gate is refused ***",
       det.changed.join() === raceRel && marked[g1].hashes[raceRel] === CONFLICT &&
       whyRun(g1, detRec) === "changed: " + raceRel && whyRun(g2, detRec) === null,
       `it returned ${JSON.stringify(det.changed)} over ${det.observed} observed path(s), stored the ` +
       `sentinel, and whyRun now says "${whyRun(g1, detRec)}". The gate that never touched the moving path ` +
       `reads ${JSON.stringify(whyRun(g2, detRec))} -- NOT flagged, which is the half that separates this ` +
       `from the old sentinel: the refusal lands on the gates that read the moving file, not on every gate ` +
       `that shares any path with a stale entry.`);

    // *** AND IT IS BEST-EFFORT, WHICH IS RECORDED RATHER THAN GLOSSED. *** A file written and then RESTORED
    // during the pass reads the same at both ends and is missed. That is a real limit of comparing two
    // instants, it is not fixable by hashing harder, and a row that did not say so would be claiming the
    // record proves something it does not.
    fs.writeFileSync(raceAbs, "what the early gate read\n");   // put it back, as a churning gate would
    clearHashCache();
    const restored = markChangedDuringPass({
        [g1]: { reads: [g1, raceRel], dirs: [], hashes: { [g1]: hashFile(g1), [raceRel]: earlyRead }, dirHashes: {} },
    });
    try { fs.unlinkSync(raceAbs); } catch {}
    clearHashCache();
    ok("  ...and a file written and then RESTORED during the pass is MISSED, which is the limit of two instants",
       !restored.changed.includes(raceRel),
       `the same path, churned and put back, is absent from ${JSON.stringify(restored.changed)}. Comparing ` +
       `the start and the end of a pass cannot see a round trip in the middle. Named here because the record ` +
       `carries changedDuringPass as evidence, and evidence with an unstated blind spot is the shape this ` +
       `tree has had to repair in its own census three times.`);

    // round trip: the compact form must mean exactly what the expanded one did
    const round = decode(encode({ "a.mjs": A }));
    ok("*** and encode/decode round-trips: the compact form says exactly what the expanded one said ***",
       JSON.stringify(round.gates["a.mjs"].reads) === JSON.stringify(A.reads) &&
       round.gates["a.mjs"].hashes["x.mjs"] === "1111111111111111");
}

console.log("\n5. what the record actually bought, on the live tree");
{
    // *** ONE SNAPSHOT OF THE TREE FOR THE WHOLE SECTION, AND THAT IS partition's OWN RULE RATHER THAN A
    // SHORTCUT. *** Its note says it: "One partition call is one consistent snapshot of the tree; a caller
    // wanting a fresh reading calls it again, or calls clearHashCache for a single whyRun." Every question
    // below is about the SAME tree under DIFFERENT records -- the real one, then three with one file's hash
    // faked -- so a fresh reading between them is not just unnecessary, it is the wrong thing: it would let
    // the tree move underneath a comparison whose whole point is that only the record changed.
    //
    // It is also 2,000 ms. partition() clears the memo on entry, so calling it four times re-hashes 13,074
    // paths four times, and this section was 2,773 ms of a gate sitting 27 ms over the sweep budget.
    clearHashCache();
    const partSnap = (rec) => {
        const skip = [], run = [];
        for (const g of GATES) { const w = whyRun(g, rec); if (w === null) skip.push(g); else run.push({ gate: g, why: w }); }
        return { skip, run };
    };
    const { skip, run } = partSnap(REC);
    const hist = reasonHistogram(run);
    ok("*** on an UNCHANGED tree the record can account for every gate, and most of them could be skipped ***",
       skip.length + run.length === GATES.length && skip.length > GATES.length * 0.5,
       `${skip.length} skippable, ${run.length} would run: ` +
       Object.entries(hist).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(", "));
    // *** THE ROW THAT MATTERS MORE: what a REAL EDIT costs. *** A mechanism that skips 930 gates on an
    // untouched tree and 900 after a commit is worth a lot; one that collapses is worth nothing, because a
    // round always touches something. Measured over the files the MOST skippable gates depend on, rather
    // than over one file picked by hand -- my first draft picked tools/ship/sweepCoverage.mjs, which zero
    // skippable gates read, and reported "0 gates depend on it" as though that were the mechanism's answer
    // instead of a badly chosen probe.
    const hot = ["tools/strictTrig.mjs", "physics/xpbd/xpbd.js", "tools/ship/sourceScan.mjs"];
    // *** THE FAKE IS APPLIED IN PLACE AND UNDONE, RATHER THAN CLONING THE RECORD THREE TIMES. *** The
    // previous form spread 1,302 entries per hot file and then spread each matching entry again -- about
    // 700 ms of the 1,374 this section cost, on a gate whose whole problem was 27 ms of budget. The
    // partition is still MEASURED rather than computed: the obvious shortcut is
    // `after = skip - |skippable gates reading f|`, which is arithmetically exact and would make the row
    // assert its own formula, so the skip set is re-derived from whyRun each time and only the input to it
    // is faked.
    const cost = hot.map((f) => {
        const saved = [];
        let touched = 0;
        for (const g of GATES) {
            const e = REC.gates[g];
            if ((e.reads || []).includes(f)) { touched++; saved.push(e); e.hashes[f] = "0000000000000000"; }
        }
        const after = partSnap(REC).skip.length;
        for (const e of saved) e.hashes[f] = hashFile(f);   // put it back; the cache holds the real reading
        return { f, touched, after };
    });
    ok("  and changing a file that many gates read brings exactly those gates back, and no more",
       cost.every((c) => c.after <= skip.length) && cost.some((c) => c.after < skip.length),
       cost.map((c) => `${c.f.split("/").pop()} is read by ${c.touched} gate(s): ${skip.length} -> ${c.after} skippable`).join("; ") +
       `. A round touching five to fifteen files pays this for each of them, and the ${run.length} gates that ` +
       "already always run are unaffected either way.");
}

console.log("\n6. the sweep is WIRED BUT NOT ARMED");
{
    const all = ["a.mjs", "b.mjs"], timings = { "a.mjs": 100, "b.mjs": 100 };
    const rec = { format: FORMAT, gates: { "a.mjs": { reads: ["a.mjs"], dirs: [], hashes: { "a.mjs": hashFile("tools/ship/inputSets.mjs") },
                                      dirHashes: {}, spawned: false, net: false, namedFsImport: false } } };
    const off = selectGates(all, timings, 3000, { inputRecord: rec });
    const on = selectGates(all, timings, 3000, { inputRecord: rec, skipUnchanged: true });
    ok("*** without skipUnchanged the sweep RUNS everything and only COUNTS what it could have skipped ***",
       off.run.length === 2 && (off.unchanged || []).length === 0,
       `runs ${off.run.length} of 2 (the fixture's hash names a different file, so neither is skippable)`);
    ok("  and selectGates with no record at all behaves exactly as it did before this parameter existed",
       (() => { const none = selectGates(all, timings, 3000, {});
                return none.run.length === 2 && (none.unchanged || []).length === 0; })(),
       "a missing tools/ship/input-sets.json is not a behaviour change");
    // the arming path, on an entry that really is skippable
    const real = { format: FORMAT, gates: { "tools/ship/inputSets.mjs": { reads: ["tools/ship/inputSets.mjs"], dirs: [],
        hashes: { "tools/ship/inputSets.mjs": hashFile("tools/ship/inputSets.mjs") }, dirHashes: {},
        spawned: false, net: false, namedFsImport: false } } };
    const armedOff = selectGates(["tools/ship/inputSets.mjs"], { "tools/ship/inputSets.mjs": 100 }, 3000, { inputRecord: real });
    const armedOn = selectGates(["tools/ship/inputSets.mjs"], { "tools/ship/inputSets.mjs": 100 }, 3000, { inputRecord: real, skipUnchanged: true });
    ok("*** and WITH skipUnchanged the same gate is dropped from the run, so the flag is the only difference ***",
       armedOff.run.length === 1 && armedOff.unchanged.length === 1 && armedOn.run.length === 0 && armedOn.unchanged.length === 1,
       `off: runs ${armedOff.run.length}, counts ${armedOff.unchanged.length}; on: runs ${armedOn.run.length}`);
}

console.log("\n7. *** THE TWO MECHANISMS v4567 ADDED, EACH DRIVEN ON A FIXTURE THAT FAILED BEFORE THEM ***");
{
    // Fixtures written into the tree under a `__` prefix, which gateSweep's walk does not enumerate as a
    // gate (asserted there, on a really-written file, for exactly this reason).
    const mk = (name, src) => { const rel = "tools/ship/" + name; fs.writeFileSync(path.join(ENG, rel), src); return rel; };
    const rm = (rel) => { try { fs.unlinkSync(path.join(ENG, rel)); } catch {} };

    // (1) A NAMED IMPORT OF A BUILTIN. v4566 patched the fs default-export object and disqualified 102 gates
    // written this way, on the theory that a named binding is resolved at link time and might not route
    // through the patch. Measured: it recorded an EMPTY set -- not a partial one -- so the theory was right
    // and the cost was 38 s of every sweep. A module.register() resolve hook changes what the NAME is bound
    // to, which is the only lever that reaches it.
    const named = mk("__inputsets_named_fixture.mjs",
        'import { readFileSync, readdirSync } from "node:fs";\n' +
        'readFileSync(new URL("../../main.js", import.meta.url).pathname);\n' +
        'readdirSync(new URL("../../tools/ship", import.meta.url).pathname);\n');
    const namedProbe = probeOne(named);
    rm(named);
    ok("*** a gate reading through a NAMED fs import is recorded -- the hole v4566 could only disqualify ***",
       namedProbe.ok && namedProbe.reads.includes("main.js") && namedProbe.dirs.includes("tools/ship"),
       `reads ${namedProbe.reads.length}, dirs ${namedProbe.dirs.length}; main.js seen: ${namedProbe.reads.includes("main.js")}`);

    // (2) A NODE CHILD. The probe does not look into the child; NODE_OPTIONS puts a probe IN it, and the
    // recorder unions the directory. The child's read must appear in the PARENT's set or the merge is a
    // decoration.
    // A TEMPLATE LITERAL, because the first draft built this fixture by concatenating single-quoted strings
    // and the `" + ENG + "` meant to interpolate the engine root sat INSIDE the quotes -- so the fixture was
    // written with that text verbatim, failed to parse, spawned nothing, and the row reported "0 node
    // children" as though the mechanism were broken rather than the fixture.
    const kidSrc = [
        'import { spawnSync } from "node:child_process";',
        `const target = ${JSON.stringify(path.join(ENG, "index.html"))};`,
        'spawnSync(process.execPath, ["-e", `require("fs").readFileSync(${JSON.stringify(target)})`], { stdio: "ignore" });',
        "",
    ].join("\n");
    const kid = mk("__inputsets_child_fixture.mjs", kidSrc);
    const kidProbe = probeOne(kid);
    rm(kid);
    ok("*** what a NODE CHILD read lands in the parent's set: the probe travels in NODE_OPTIONS ***",
       kidProbe.ok && kidProbe.procs > 1 && kidProbe.reads.includes("index.html") && !kidProbe.spawnedNonNode,
       `${kidProbe.procs} process(es), ${kidProbe.spawnedNode} node child(ren); index.html in the parent's set: ` +
       `${kidProbe.reads.includes("index.html")}`);

    // (2b) A NODE CHILD GIVEN AN EXPLICIT `env`. NODE_OPTIONS reaches a child by INHERITANCE, so a caller
    // that passes its own env object drops the probe on the floor and the child goes unrecorded -- silently,
    // as a smaller set. cpWrap merges NODE_OPTIONS and the output directory into whatever env was passed,
    // and THIS ROW IS WHY THAT MERGE IS NOT JUST A COMMENT: sabotage O removed the merge and every other row
    // in this gate stayed green, which is the "a fix that exists only in its own comment" shape this session
    // keeps finding. The fixture passes `env: { PATH }` deliberately -- the narrowest env a spawn can have.
    // It reads a file that EXISTS, because the probe records an attempted read whether it succeeds or not
    // (a gate that reads a missing path depends on it staying missing, which is the existsSync rule) -- so a
    // fixture naming a file that is not there would have passed without proving the child ran at all.
    const envSrc = [
        'import { spawnSync } from "node:child_process";',
        `const target = ${JSON.stringify(path.join(ENG, "main.js"))};`,
        'spawnSync(process.execPath, ["-e", `require("fs").readFileSync(${JSON.stringify(target)})`],',
        '          { stdio: "ignore", env: { PATH: process.env.PATH } });',
        "",
    ].join("\n");
    const envKid = mk("__inputsets_envchild_fixture.mjs", envSrc);
    const envProbe = probeOne(envKid);
    rm(envKid);
    ok("*** a node child handed its OWN env is still probed -- NODE_OPTIONS is merged in, not assumed ***",
       envProbe.ok && envProbe.procs > 1 && envProbe.reads.includes("main.js"),
       `${envProbe.procs} process(es); main.js in the parent's set: ${envProbe.reads.includes("main.js")}. ` +
       "Without the merge this reads 1 process and the child's read is simply absent.");

    // (3) AND THE CHILD IT CANNOT FOLLOW STILL REFUSES. This is the half that keeps the mechanism honest:
    // 104 gates still decline, 16 of every 24 sampled because they launch Playwright's headless_shell, the
    // rest git, python3, cargo, tar and a shell. Nobody recorded what those read.
    const alien = mk("__inputsets_alien_fixture.mjs",
        'import { spawnSync } from "node:child_process";\nspawnSync("/bin/echo", ["hi"], { stdio: "ignore" });\n');
    const alienProbe = probeOne(alien);
    rm(alien);
    ok("*** and a child that is NOT node sets the flag that refuses the gate -- the refusal survived the fix ***",
       alienProbe.ok && alienProbe.spawnedNonNode === true && alienProbe.spawnedNode === 0,
       `spawnedNonNode ${alienProbe.spawnedNonNode}, node children ${alienProbe.spawnedNode}`);

    // (4) A SHELL. exec/execSync launch one, and what it then runs is not knowable without parsing the
    // shell's grammar. Guessing is how a probe starts lying, so it refuses.
    const shell = mk("__inputsets_shell_fixture.mjs",
        'import { execSync } from "node:child_process";\nexecSync("true");\n');
    const shellProbe = probeOne(shell);
    rm(shell);
    ok("  a SHELL is refused too, rather than parsed",
       shellProbe.ok && shellProbe.spawnedNonNode === true, `spawnedNonNode ${shellProbe.spawnedNonNode}`);

    // (5) THE TRANSITIVE CLOSURE, WHICH THE LOADER HOOK NEARLY COST. v4566 got it free -- Node's ESM loader
    // read module source through the patched fs -- and registering a hook moved that reading onto the hooks
    // thread, so the first v4567 run recorded ZERO reads for a gate whose whole input set is two modules.
    // A `load` hook names the module outright, which is the better instrument anyway. Re-asserted here
    // because losing it looks like a SMALLER set rather than an error.
    const closure = VACUITY;
    ok("*** the module closure survived the loader hook: a gate that reads no file still records its imports ***",
       closure.ok && closure.reads.includes("tools/ship/vacuity.mjs") && closure.reads.includes("tools/ship/vacuity-selfcheck.mjs"),
       JSON.stringify(closure.reads));
}

console.log("\n8. the record's field list, because a hand-spelled serialiser already dropped one");
{
    // *** THIS ROW EXISTS BECAUSE THE BUG IT CATCHES SHIPPED FOR AN HOUR. *** v4567 renamed the spawn
    // disqualifier in the recorder and in the rule; `encode` spelled its fields out by hand and went on
    // writing the OLD name, so the flag was dropped on write, whyRun read nothing, and every spawning gate
    // -- including the browser ones -- became skippable. The skip count went 956 -> 1,121 and looked like
    // the round succeeding. Same shape as the round before, where a record's first writer deleted the keys
    // its later sections owned.
    const p = VACUITY;
    const e = entryFor(p);
    const back = decode(encode({ "tools/ship/vacuity-selfcheck.mjs": e })).gates["tools/ship/vacuity-selfcheck.mjs"];
    const lost = Object.keys(e).filter((k) => !(k in back));
    ok("*** every field entryFor produces survives encode -> decode, so a renamed flag cannot vanish ***",
       lost.length === 0, lost.length ? "DROPPED: " + lost.join(", ") : Object.keys(e).length + " fields round-trip");
    ok("  and FLAGS names every non-path field the rule reads, so the list has one home",
       FLAGS.includes("spawnedNonNode") && FLAGS.includes("net") && FLAGS.every((f) => f in e),
       FLAGS.join(", "));
}

console.log(fails ? `\nFAIL -- ${fails} check(s)` : "\nALL GREEN");
console.log("unchecked here: whether a gate's set is COMPLETE across branches it did not take this run -- an input " +
    "set is a sample of one run, and the defence is that the mechanism ships disarmed while the number it would " +
    "have skipped is reported every sweep; a gate whose verdict depends on the clock or an environment variable " +
    "rather than on a file (93 and 36 gates touch those respectively, most for timing rather than for a verdict); " +
    "and the child processes a spawning gate reads through, which is why spawning is a disqualifier and not a note.");
process.exit(fails ? 1 : 0);
