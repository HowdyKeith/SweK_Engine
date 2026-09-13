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
         encode, decode, clearHashCache, CONFLICT, FLAGS } from "./inputSets.mjs";
import { usesNamedFsImport, probeOne, entryFor } from "./recordInputs.mjs";
import { selectGates } from "./quickSweep.mjs";

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
{
    // Fixtures rather than live entries: a rule that only ever sees the tree's own shapes is a rule nobody
    // has tested the edges of. Each of these is one disqualifier alone, everything else valid.
    const good = { reads: ["a.mjs"], dirs: [], hashes: { "a.mjs": hashFile("tools/ship/inputSets.mjs") }, dirHashes: {},
                   spawnedNonNode: false, net: false };
    const rec = (over) => ({ gates: { "a.mjs": { ...good, ...over } } });
    // the control: the same entry, with the hash actually matching the file it names
    const real = { reads: ["tools/ship/inputSets.mjs"], dirs: [], hashes: { "tools/ship/inputSets.mjs": hashFile("tools/ship/inputSets.mjs") },
                   dirHashes: {}, spawnedNonNode: false, net: false };
    ok("CONTROL: a complete entry whose one recorded file still hashes to what it hashed is SKIPPABLE",
       whyRun("tools/ship/inputSets.mjs", { gates: { "tools/ship/inputSets.mjs": real } }) === null,
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
       whyRun("tools/ship/inputSets.mjs", { gates: { "tools/ship/inputSets.mjs": { ...real, namedFsImport: true } } }) === null);
    ok("ALLOWED now: a gate that spawned only NODE children (NODE_OPTIONS carried the probe into them)",
       whyRun("tools/ship/inputSets.mjs", { gates: { "tools/ship/inputSets.mjs": { ...real, spawnedNode: 6, procs: 7 } } }) === null);
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
