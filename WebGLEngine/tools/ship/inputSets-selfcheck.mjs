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
import { ENG, RECORD, hashFile, hashDir, readRecord, whyRun, skippable, partition, reasonHistogram,
         encode, decode, clearHashCache, CONFLICT, FLAGS, FORMAT } from "./inputSets.mjs";
import { usesNamedFsImport, probeOne, entryFor, conflictReport } from "./recordInputs.mjs";
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
    // *** v4556 -- TWELVE FIXTURES ANSWERED ONE SENTENCE FOR EIGHT ROUNDS, AND THE CONTROL ROW IS THE ONLY
    // REASON ANYBODY COULD TELL WHICH SENTENCE. *** whyRun grew a FIRST LINE -- `rec.format !== FORMAT` --
    // because the encoding is INDEXED: a record written under another layout does not fail to decode, it
    // decodes to the WRONG PATHS, hashes them, finds them unchanged and skips the gate. Correct, and every
    // fixture below was hand-spelled in the DECODED shape with no envelope around it, so from that day each
    // one returned "no usable input record" and NONE of them was about the disqualifier it names. Thirteen
    // of this gate's fourteen reds were that one line arriving.
    //
    // *** THE FIX IS NOT TO ADD `format` TO TWELVE LITERALS. *** A fixture hand-built in a shape the
    // mechanism never produces is a check aimed beside its subject: readRecord() goes through decode(),
    // decode() always stamps the envelope, so NO LIVE CALLER CAN HAND whyRun WHAT THESE ROWS WERE HANDING
    // IT. They go through encode()/decode() -- the shipped serialiser -- so the envelope is whatever the
    // recorder writes today and the next required field lands in every fixture without an edit here.
    const SELF = "tools/ship/inputSets.mjs", OTHER = "tools/ship/recordInputs.mjs";
    const mkRec = (gates) => decode(encode(gates));
    const rec1 = (entry, key = SELF) => mkRec({ [key]: entry });
    // *** AND THE BASE IS VALID, WHICH THE OLD ONE WAS NOT. *** The battery's own comment said "one
    // disqualifier alone, everything else valid", and its base recorded `a.mjs` hashing to the bytes of
    // inputSets.mjs -- a path that does not exist, so the base was ALREADY refusable as `changed: a.mjs`.
    // THREE rows stood on it -- spawnedNonNode, net, and the own-source row, whose "b.mjs" hashed to
    // "deadbeef" and was therefore a missing file AND a changed one -- and they were green only because the
    // check they test is read ABOVE the hash loop. MEASURED by moving the hash loop above the flags: two of
    // the three then answer "changed: a.mjs", a refusal with nothing to do with their subject, and the
    // third survives only that particular reorder. The repaired battery is ALL GREEN under the same
    // reordered rule, which is the claim: every row below carries its own REVERT -- the same fixture with
    // the one mutation undone, which must be SKIPPABLE -- so the mutation is provably the only thing that
    // moved, whatever order the rule reads its checks in.
    const base = () => ({ reads: [SELF], dirs: [], hashes: { [SELF]: hashFile(SELF) }, dirHashes: {},
                          spawnedNonNode: false, spawnedNode: 0, procs: 1, net: false,
                          namedFsImport: false, reachesUnrecorded: false });
    const over = (o) => ({ ...base(), ...o });
    const control = () => whyRun(SELF, rec1(base()));
    ok("CONTROL: a complete entry whose one recorded file still hashes to what it hashed is SKIPPABLE",
       control() === null, "if this row ever fails, every refusal below is passing for the wrong reason");

    // Each row: what the fixture must say, and what the SAME fixture says with the mutation undone. A row
    // is green only when the first is the named refusal AND the second is null.
    const BATTERY = [
        // *** THE TWO THE OLD BATTERY DROVE WITH NOTHING, AND THE FIRST IS THE ONE THAT BROKE IT. ***
        { name: "REFUSED: a record with NO envelope -- the exact shape this gate used to hand-build",
          reason: "no usable input record (missing, or a different format)",
          detail: "the indexed form decodes to the wrong paths under another layout, so a missing format is not a formality",
          run: () => whyRun(SELF, { gates: { [SELF]: base() } }) },
        { name: "REFUSED: a record stamped with a format this build does not speak",
          reason: "no usable input record (missing, or a different format)",
          run: () => whyRun(SELF, { ...rec1(base()), format: FORMAT + 1 }) },
        { name: "REFUSED: a gate with no entry at all",
          reason: "no recorded input set",
          run: () => whyRun("nope.mjs", rec1(base())),
          back: () => whyRun(SELF, rec1(base())) },
        { name: "REFUSED: spawned a child the probe could not follow",
          reason: "spawned a child the probe could not follow",
          run: () => whyRun(SELF, rec1(over({ spawnedNonNode: true }))) },
        { name: "REFUSED: opened a socket or fetched",
          reason: "opens a socket or fetches",
          run: () => whyRun(SELF, rec1(over({ net: true }))) },
        // *** DRIVEN BY NOTHING UNTIL NOW, AND IT IS THE LARGEST REFUSAL THE LIVE RECORD MAKES: *** 133 of
        // the 486 gates that would run do so because their recorded set does not carry a module their
        // source can reach. A refusal costing a third of the run had no fixture at all.
        { name: "REFUSED: reaches a module its recorded set does not carry (the static closure, at record time)",
          reason: "reaches a module its recorded set does not carry",
          detail: "133 of the live record's 486 runs are this one",
          run: () => whyRun(SELF, rec1(over({ reachesUnrecorded: true }))) },
        { name: "REFUSED: an EMPTY recorded set -- 'read nothing' and 'we saw nothing' are not the same claim",
          reason: "recorded an empty input set",
          run: () => whyRun(SELF, rec1(over({ reads: [], dirs: [], hashes: {} }))) },
        // One variable: a set of one REAL file with its REAL hash, which is simply not this gate's source.
        // The old row recorded "b.mjs" hashing to "deadbeef", so it was also a changed file and a missing
        // one, and passed on the order of the two checks rather than on the claim.
        { name: "REFUSED: a set that does not contain the gate's OWN source (node read it to run it, so its absence is a broken record)",
          reason: "its own source is not in its recorded set",
          run: () => whyRun(SELF, rec1(over({ reads: [OTHER], hashes: { [OTHER]: hashFile(OTHER) } }))),
          back: () => whyRun(SELF, rec1(over({ reads: [SELF, OTHER],
                                               hashes: { [SELF]: hashFile(SELF), [OTHER]: hashFile(OTHER) } }))) },
        { name: "REFUSED: a recorded file whose content has moved, and the reason NAMES the file",
          reason: "changed: " + SELF,
          run: () => whyRun(SELF, rec1(over({ hashes: { [SELF]: "0000000000000000" } }))) },
        { name: "REFUSED: a recorded file that is GONE (hashFile returns null, which no recorded hash equals)",
          reason: "changed: vanished.mjs",
          run: () => whyRun(SELF, rec1(over({ reads: [SELF, "vanished.mjs"],
                                              hashes: { [SELF]: hashFile(SELF), "vanished.mjs": "abc" } }))),
          back: () => control() },
        // *** v4567 -- AND THE TWO THAT ARE NO LONGER REFUSALS, ASSERTED IN THE LIFTED DIRECTION. *** A
        // disqualifier that has been lifted has to be checked as lifted, or the next reader cannot tell
        // "we fixed this" from "we forgot this". Section 7 measures WHY each is safe rather than taking
        // the rule's word for it. Their revert is the control, so these rows say the flag changes nothing.
        { name: "ALLOWED now: a gate taking fs by NAMED import (the loader hook binds those names to the shim)",
          reason: null, run: () => whyRun(SELF, rec1(over({ namedFsImport: true }))) },
        { name: "ALLOWED now: a gate that spawned only NODE children (NODE_OPTIONS carried the probe into them)",
          reason: null, run: () => whyRun(SELF, rec1(over({ spawnedNode: 6, procs: 7 }))) },
    ];
    for (const b of BATTERY) {
        clearHashCache();
        const got = b.run(), rev = (b.back || control)();
        observed.push(got);
        const said = got === b.reason;
        ok(b.name, said && rev === null,
           (said ? "" : `SAID ${JSON.stringify(got)} rather than ${JSON.stringify(b.reason)}; `) +
           (rev === null ? "reverted: skippable" : `REVERTED FIXTURE IS NOT SKIPPABLE: ${rev}`) +
           (b.detail ? " -- " + b.detail : ""));
    }
}

console.log("\n2b. *** AND THE LIST OF REFUSALS HAS ONE HOME: THE RULE'S OWN SOURCE ***");
{
    // *** THIS IS THE ROW v4574 SHOULD HAVE TURNED RED. *** What went wrong above was not that a fixture
    // was wrong -- it was that a refusal was ADDED to whyRun and nothing in this file had to change, so
    // twelve rows quietly started answering the new one instead of their own subjects. Two of the rule's
    // nine refusals had no fixture at all when this was written: the format check, and `reachesUnrecorded`,
    // which is the single largest reason the live record gives for running a gate.
    //
    // So the list is HARVESTED from the rule's source rather than typed here, and each entry must have been
    // OBSERVED coming out of a fixture above. Add a tenth refusal and this gate goes red naming it.
    // noComments(), because a row that reads the rule's PROSE is a row its own explanation can satisfy --
    // the shape this session has now found four times.
    const src = noComments(fs.readFileSync(path.join(ENG, "tools/ship/inputSets.mjs"), "utf8"));
    const at = src.indexOf("export function whyRun");
    let depth = 0, end = src.length;
    for (let i = src.indexOf("{", at); i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}" && --depth === 0) { end = i; break; }
    }
    const body = at >= 0 ? src.slice(at, end) : "";
    const literals = [...body.matchAll(/return\s+"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
    const seen = observed.filter((o) => typeof o === "string");
    const undriven = literals.filter((L) => !seen.some((o) => o.startsWith(L)));
    ok("*** the rule's whyRun body was located and it returns the refusals this gate is about ***",
       at >= 0 && literals.length >= 8, `${literals.length} refusal(s) harvested from ${body.length} chars of code`);
    ok("*** every refusal whyRun can return is DRIVEN by a fixture above -- a new one reddens this row ***",
       undriven.length === 0 && literals.length >= 8,
       undriven.length ? "DRIVEN BY NOTHING: " + undriven.map((u) => JSON.stringify(u)).join(", ")
                       : `${literals.length} refusal(s), ${new Set(seen).size} distinct sentence(s) observed`);
}

console.log("\n3. *** THE PROBE, AGAINST A GATE WHOSE INPUTS ARE KNOWN BY OTHER MEANS ***");
{
    // vacuity-selfcheck imports exactly one module of this tree. Its input set must be those two files and
    // nothing else -- which is also the transitive-closure claim: the probe sees a module load, not just a
    // readFileSync somebody typed.
    const p = probeOne("tools/ship/vacuity-selfcheck.mjs");
    const mjs = p.reads.filter((r) => /\.(mjs|js|cjs)$/.test(r)).sort();
    ok("*** the probe sees MODULE LOADS, not only explicit reads: a gate that imports one module records both files ***",
       p.ok && mjs.join() === "tools/ship/vacuity-selfcheck.mjs,tools/ship/vacuity.mjs",
       mjs.join(", ") || "(none)");
    // The closure has to be transitive or the whole mechanism is unsound: a gate is invalidated by a change
    // to something it imports THROUGH something it imports.
    const q = probeOne("tools/ship/sweepCoverage-selfcheck.mjs");
    const deep = ["tools/ship/gateSweep.mjs", "tools/ship/redCensus.mjs", "tools/ship/vacuity.mjs"];
    ok("*** and the closure is TRANSITIVE: modules reached through another import are in the set ***",
       q.ok && deep.every((d) => q.reads.includes(d)),
       `${q.reads.length} reads including ${deep.filter((d) => q.reads.includes(d)).join(", ")}`);
    ok("  a gate that walks the tree records a set the size of the tree, and is therefore never skippable in practice",
       (() => { const w = probeOne("tools/ship/sourceExtensions-selfcheck.mjs"); return w.ok && w.reads.length > 1000; })(),
       "the mechanism does not pretend a whole-tree walk is a small dependency");
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
                    dirHashes: { [tmp]: hashDir(tmp) },
                    spawnedNonNode: false, spawnedNode: 0, procs: 1, net: false,
                    namedFsImport: false, reachesUnrecorded: false };
    const rec = decode(encode({ "tools/ship/inputSets.mjs": entry }));
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
    // *** v4556 -- THIS ROW ASSERTED A PROPERTY OF THE CALENDAR AND NOT OF THE MECHANISM. *** It required
    // the live conflict list to be EMPTY, which is the claim that nobody edited the tree during the 181 s
    // recording pass -- and the pass is exactly long enough for that to be untrue. The record taken on
    // 2026-09-13 carries four, every one a file the rounds running at the time were moving:
    // physics/character/fallBody.mjs, physics/character/terrainWalk.mjs, simulation/BotManager.js and
    // world/surfaceProbe.mjs. So the row went red WHILE THE CONFLICT MACHINERY WAS DOING ITS JOB, which is
    // the "a check that goes red on success" shape, and a reader would have gone looking for a bug in
    // encode().
    //
    // THE COUNT IS REPORTED AND THE INVARIANT IS ASSERTED. What belongs to the mechanism is that a
    // conflicting path REFUSES every gate that touched it -- measured here on the live record rather than
    // on the fixture two rows up, because the sentinel has to survive the round trip through the file.
    // MEASURED: 72 of 1,267 gates read one of the four and 0 of 72 are skippable -- 5.7% of the population
    // paying for the pass not being hermetic. (My first reading was 198, which is the sum of the four
    // per-path counts and therefore counts a gate reading three of them three times; the row reports the
    // DISTINCT population, which is the only one that means anything as a fraction.) That price is the
    // finding; zero conflicts was never a property anything guaranteed.
    const liveConflicts = Array.isArray(REC.conflicts) ? REC.conflicts : [];
    const touching = GATES.filter((g) => (REC.gates[g].reads || []).some((r) => liveConflicts.includes(r)));
    const clash = partition(touching, REC).skip;
    ok("*** every gate that touched a CONFLICTING path is refused, on the LIVE record and not just a fixture ***",
       clash.length === 0 && (liveConflicts.length === 0 || touching.length > 0),
       `${liveConflicts.length} conflicting path(s) across ${GATES.length} gates, recorded ${REC.at}: ` +
       `${touching.length} gate(s) read one and ${clash.length} of those are skippable` +
       (liveConflicts.length ? " -- " + liveConflicts.join(", ") + ". The tree moved under the pass; the sentinel " +
        "is what makes that cost skips rather than correctness."
                          : ". The live population is EMPTY, so this row claims nothing today and the two " +
        "fixture rows above carry the sentinel's whole weight -- said here rather than left to look like evidence."));
    // *** v4556 -- AND THE PASS NOW SAYS SO OUT LOUD, WHICH IS THE HALF THAT WAS MISSING. *** The sentinel
    // has refused correctly since v4566 and the recorder has never PRINTED a conflict, so the operator who
    // caused one -- by editing the tree during a 181 s pass -- had no way to learn that 72 gates had just
    // stopped being skippable. Driven on the same two-gate fixture, and on an agreeing pair, because a
    // report that fires on everything is no more use than one that fires on nothing.
    const clashing = { "a.mjs": A, "b.mjs": B }, agreeing = { "a.mjs": A, "b.mjs": { ...A } };
    const said = conflictReport(encode(clashing), clashing);
    ok("*** the recorder REPORTS a conflict, with its price in gates -- it has been silent about them since v4566 ***",
       typeof said === "string" && said.includes("x.mjs") && /\b2 of 2 gate\(s\)/.test(said), said || "(said nothing)");
    ok("  and says nothing when the pass did not contradict itself, so the report is not noise",
       conflictReport(encode(agreeing), agreeing) === null);

    // round trip: the compact form must mean exactly what the expanded one did
    const round = decode(encode({ "a.mjs": A }));
    ok("*** and encode/decode round-trips: the compact form says exactly what the expanded one said ***",
       JSON.stringify(round.gates["a.mjs"].reads) === JSON.stringify(A.reads) &&
       round.gates["a.mjs"].hashes["x.mjs"] === "1111111111111111");
}

console.log("\n5. what the record actually bought, on the live tree");
{
    const { skip, run } = partition(GATES, REC);
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
    const cost = hot.map((f) => {
        const faked = { ...REC, gates: { ...REC.gates } };
        let touched = 0;
        for (const g of GATES) { const e = faked.gates[g];
            if ((e.reads || []).includes(f)) { touched++; faked.gates[g] = { ...e, hashes: { ...e.hashes, [f]: "0000000000000000" } }; } }
        return { f, touched, after: partition(GATES, faked).skip.length };
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
    // Through encode()/decode(), for section 2's reason: hand-spelled these carried no envelope, so
    // selectGates was reading "no usable input record" for BOTH fixtures and the armed row below could
    // never show a difference between the flag being on and off.
    const flags = { spawnedNonNode: false, spawnedNode: 0, procs: 1, net: false,
                    namedFsImport: false, reachesUnrecorded: false };
    const rec = decode(encode({ "a.mjs": { reads: ["a.mjs"], dirs: [], hashes: { "a.mjs": hashFile("tools/ship/inputSets.mjs") },
                                           dirHashes: {}, ...flags } }));
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
    const real = decode(encode({ "tools/ship/inputSets.mjs": { reads: ["tools/ship/inputSets.mjs"], dirs: [],
        hashes: { "tools/ship/inputSets.mjs": hashFile("tools/ship/inputSets.mjs") }, dirHashes: {}, ...flags } }));
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
    const closure = probeOne("tools/ship/vacuity-selfcheck.mjs");
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
    const p = probeOne("tools/ship/vacuity-selfcheck.mjs");
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
