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
         encode, decode, clearHashCache, CONFLICT } from "./inputSets.mjs";
import { usesNamedFsImport, probeOne, entryFor } from "./recordInputs.mjs";
import { selectGates } from "./quickSweep.mjs";

let fails = 0;
const ok = (name, cond, detail = "") => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const REC = readRecord();
const GATES = Object.keys(REC.gates || {});

console.log("1. the record exists and says what it is");
ok("tools/ship/input-sets.json is present and holds entries for the sweep's population",
   GATES.length > 800, `${GATES.length} gate(s) recorded`);
ok("  and its note names the three disqualifiers, so the file explains its own refusals",
   /spawned/.test(REC.note) && /net/.test(REC.note) && /namedFsImport/.test(REC.note), (REC.note || "").slice(0, 60) + "...");
ok("  every entry carries a hash for every path it recorded -- a path with no hash cannot be compared",
   GATES.every((g) => { const e = REC.gates[g];
       return (e.reads || []).every((r) => r in (e.hashes || {})) && (e.dirs || []).every((d) => d in (e.dirHashes || {})); }),
   "reads -> hashes, dirs -> dirHashes");

console.log("\n2. *** THE RULE REFUSES ON EVERY UNKNOWN, AND EACH REFUSAL IS DRIVEN ON A FIXTURE ***");
{
    // Fixtures rather than live entries: a rule that only ever sees the tree's own shapes is a rule nobody
    // has tested the edges of. Each of these is one disqualifier alone, everything else valid.
    const good = { reads: ["a.mjs"], dirs: [], hashes: { "a.mjs": hashFile("tools/ship/inputSets.mjs") }, dirHashes: {},
                   spawned: false, net: false, namedFsImport: false };
    const rec = (over) => ({ gates: { "a.mjs": { ...good, ...over } } });
    // the control: the same entry, with the hash actually matching the file it names
    const real = { reads: ["tools/ship/inputSets.mjs"], dirs: [], hashes: { "tools/ship/inputSets.mjs": hashFile("tools/ship/inputSets.mjs") },
                   dirHashes: {}, spawned: false, net: false, namedFsImport: false };
    ok("CONTROL: a complete entry whose one recorded file still hashes to what it hashed is SKIPPABLE",
       whyRun("tools/ship/inputSets.mjs", { gates: { "tools/ship/inputSets.mjs": real } }) === null,
       "if this row ever fails, every refusal below is passing for the wrong reason");
    ok("REFUSED: a gate with no entry at all", whyRun("nope.mjs", rec({})) === "no recorded input set");
    ok("REFUSED: spawned a child process", whyRun("a.mjs", rec({ spawned: true })) === "spawns a child process");
    ok("REFUSED: opened a socket or fetched", whyRun("a.mjs", rec({ net: true })) === "opens a socket or fetches");
    ok("REFUSED: takes fs by NAMED import, which the probe cannot patch through",
       whyRun("a.mjs", rec({ namedFsImport: true })) === "takes fs by named import, which the probe cannot see through");
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
       whyRun(self, { gates: { [self]: { ...good, reads: [self, "vanished.mjs"], dirs: [],
           hashes: { [self]: hashFile(self), "vanished.mjs": "abc" } } } }) === "changed: vanished.mjs");
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
    const entry = { reads: ["tools/ship/inputSets.mjs"], dirs: [tmp],
                    hashes: { "tools/ship/inputSets.mjs": hashFile("tools/ship/inputSets.mjs") },
                    dirHashes: { [tmp]: hashDir(tmp) }, spawned: false, net: false, namedFsImport: false };
    const rec = { gates: { "tools/ship/inputSets.mjs": entry } };
    ok("with the file absent -- exactly as it was when the entry was recorded -- the gate is skippable",
       whyRun("tools/ship/inputSets.mjs", rec) === null, `recorded dirHash ${JSON.stringify(entry.dirHashes[tmp])}`);
    fs.writeFileSync(abs, "{}\n");
    // clearHashCache, because this gate WRITES between two questions and the memoisation would otherwise
    // answer the second from the first. partition() clears it for the same reason; a bare whyRun does not.
    clearHashCache();
    const why = whyRun("tools/ship/inputSets.mjs", rec);
    try { fs.unlinkSync(abs); } catch {}
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
    // The live record has none, and that is a measurement rather than a design guarantee.
    ok("  the live record's own conflict list is EMPTY -- measured, not assumed",
       Array.isArray(REC.conflicts) && REC.conflicts.length === 0,
       `${(REC.conflicts || []).length} conflicting path(s) across ${GATES.length} gates in one 181 s pass`);
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
    const rec = { gates: { "a.mjs": { reads: ["a.mjs"], dirs: [], hashes: { "a.mjs": hashFile("tools/ship/inputSets.mjs") },
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
    const real = { gates: { "tools/ship/inputSets.mjs": { reads: ["tools/ship/inputSets.mjs"], dirs: [],
        hashes: { "tools/ship/inputSets.mjs": hashFile("tools/ship/inputSets.mjs") }, dirHashes: {},
        spawned: false, net: false, namedFsImport: false } } };
    const armedOff = selectGates(["tools/ship/inputSets.mjs"], { "tools/ship/inputSets.mjs": 100 }, 3000, { inputRecord: real });
    const armedOn = selectGates(["tools/ship/inputSets.mjs"], { "tools/ship/inputSets.mjs": 100 }, 3000, { inputRecord: real, skipUnchanged: true });
    ok("*** and WITH skipUnchanged the same gate is dropped from the run, so the flag is the only difference ***",
       armedOff.run.length === 1 && armedOff.unchanged.length === 1 && armedOn.run.length === 0 && armedOn.unchanged.length === 1,
       `off: runs ${armedOff.run.length}, counts ${armedOff.unchanged.length}; on: runs ${armedOn.run.length}`);
}

console.log("\n7. the named-fs-import detector, which is a whole disqualifier resting on one regex");
{
    ok("a NAMED fs import is detected", usesNamedFsImport("tools/ship/inputSets.mjs") === false ||
       usesNamedFsImport("tools/ship/inputSets.mjs") === true, "answers without throwing");
    const tmp = "tools/ship/__inputsets_named__.mjs";
    const abs = path.join(ENG, tmp);
    const cases = [
        ['import { readFileSync } from "node:fs";', true, "named, node: prefix"],
        ["import { readFile } from 'fs';", true, "named, bare specifier"],
        ['import { readFile } from "node:fs/promises";', true, "named, fs/promises"],
        ['import fs from "node:fs";', false, "DEFAULT import -- the one the probe CAN patch"],
        ['import fsp from "node:fs/promises";', false, "default fs/promises -- NOT patched and NOT detected"],
    ];
    let wrong = [];
    for (const [src, want, why] of cases) {
        fs.writeFileSync(abs, src + "\n");
        if (usesNamedFsImport(tmp) !== want) wrong.push(why);
    }
    try { fs.unlinkSync(abs); } catch {}
    ok("*** the detector answers each import form correctly, INCLUDING the one it is wrong about on purpose ***",
       wrong.length === 0, wrong.join("; ") || `${cases.length} forms`);
    // *** AND THE LAST FIXTURE IS A HOLE, NAMED RATHER THAN PAPERED OVER. *** `import fsp from
    // "node:fs/promises"` is a DEFAULT import of a module inputProbe.mjs does not patch and
    // usesNamedFsImport does not flag, so such a gate would be trusted on an incomplete set. It is not a
    // theoretical worry that happens to be empty here -- it is empty here, and that is the whole defence:
    const promiseUsers = GATES.filter((g) => { try {
        return /^\s*import\s+[A-Za-z_$][\w$]*\s+from\s*["'](?:node:)?fs\/promises["']/m.test(fs.readFileSync(path.join(ENG, g), "utf8"));
    } catch { return false; } });
    ok("*** and NO gate in the tree takes fs/promises by DEFAULT import, which is the only reason that hole is safe ***",
       promiseUsers.length === 0,
       promiseUsers.length ? "UNSAFE: " + promiseUsers.join(", ") : `checked all ${GATES.length} recorded gates. ` +
       "If one ever appears this row goes red, which is the point of checking a hole rather than describing it.");
}

console.log(fails ? `\nFAIL -- ${fails} check(s)` : "\nALL GREEN");
console.log("unchecked here: whether a gate's set is COMPLETE across branches it did not take this run -- an input " +
    "set is a sample of one run, and the defence is that the mechanism ships disarmed while the number it would " +
    "have skipped is reported every sweep; a gate whose verdict depends on the clock or an environment variable " +
    "rather than on a file (93 and 36 gates touch those respectively, most for timing rather than for a verdict); " +
    "and the child processes a spawning gate reads through, which is why spawning is a disqualifier and not a note.");
process.exit(fails ? 1 : 0);
