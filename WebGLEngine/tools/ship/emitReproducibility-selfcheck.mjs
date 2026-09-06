// WebGLEngine/tools/ship/emitReproducibility-selfcheck.mjs -- v4484
//
// Run: node tools/ship/emitReproducibility-selfcheck.mjs
//
// Grades tools/ship/emitReproducibility.mjs and the eight writes it now guards.
//
// *** THIS GATE DOES NOT RE-EMIT, AND THAT IS DELIBERATE. *** The emit costs 25 seconds of browser and three.js
// per artifact, and the three gates that pay it already grade reproducibility as of this round -- the check
// rides along on a cost somebody else has to pay anyway. What this gate does is make sure THAT arrangement is
// real: that every write site calls the comparison, that the register matches the files on disk, and that the
// comparison itself can tell identical from moved. Duplicating the emit here would be a second expensive run
// proving what the first one already proved.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as E from "./emitReproducibility.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...p) => fs.readFileSync(path.join(ENG, ...p), "utf8");
const stripLineComments = (t) => t.replace(/^\s*\/\/.*$/gm, " ");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const M = E.MEASURED_AT_V4484;

// ---- 1. *** THE REGISTER IS THE FILES ON DISK, NOT A LIST SOMEBODY TYPED *** ----------------------------------
{
    const present = E.ARTIFACTS.filter((a) => fs.existsSync(path.join(ENG, a.file)));
    const sizes = present.map((a) => ({ f: a.file, n: fs.statSync(path.join(ENG, a.file)).size }));
    for (const s of sizes) say(`${s.f.padEnd(36)} ${String(s.n).padStart(6)} bytes`);
    ok("!! *** THERE ARE FOUR EMITTED ARTIFACTS, AND v4480's SURVEY COUNTED THREE ***",
        present.length === M.artifacts && present.length === 4 && M.v4480SaidArtifacts === 3,
        "the survey looked for tsl-emitted-{race,physics,compute} and a glob that wants a hyphen after " +
        "'emitted' does not match tsl-emitted.json, which ends there");

    const largest = sizes.reduce((a, b) => (b.n > a.n ? b : a));
    ok("...and the one it missed is the LARGEST of the set, not a stray",
        largest.f === M.largestArtifact && largest.n === M.largestBytes &&
        sizes.find((s) => /race/.test(s.f)).n === M.raceBytes,
        `${largest.f} at ${largest.n} bytes against race's ${M.raceBytes}. It holds the badTv and blackbody ` +
        "pair and wgslCorpus compiles two entries out of it");

    // *** A GLOB THAT WOULD MISS IT AGAIN, RUN AS THE CONTROL. ***
    const all = fs.readdirSync(path.join(ENG, "tools/ship")).filter((f) => /^tsl-emitted/.test(f));
    const hyphenGlob = all.filter((f) => /^tsl-emitted-/.test(f));
    ok("!! CONTROL: the pattern that caused the miss still misses it, so the finding is mechanical not anecdotal",
        all.length === 4 && hyphenGlob.length === 3 && !hyphenGlob.includes("tsl-emitted.json"),
        `tsl-emitted* matches ${all.length}, tsl-emitted-* matches ${hyphenGlob.length}. One hyphen is the ` +
        "whole difference between the survey's answer and the truth");
}

// ---- 2. THE READERS: A COUNT THAT WAS RIGHT WHILE ITS MEMBERS WERE WRONG --------------------------------------
{
    const real = E.CONTENT_READERS.filter((f) => /tsl-emitted/.test(stripLineComments(read(f))));
    ok("every file the register calls a content reader really loads an artifact, in code and not in a comment",
        real.length === E.CONTENT_READERS.length && real.length === M.contentReaders,
        `${real.length} readers: ${real.map((f) => f.replace("tools/ship/", "")).join(", ")}`);

    // *** THE ONE v4480 COUNTED AND THE ONE IT MISSED. ***
    const bp = stripLineComments(read("render/backendParity.mjs"));
    ok("!! *** render/backendParity.mjs NAMES an artifact and loads none -- it was counted as a reader ***",
        !/tsl-emitted/.test(bp) && /tsl-emitted/.test(read("render/backendParity.mjs")) &&
        !E.CONTENT_READERS.includes("render/backendParity.mjs"),
        "it appears only in a comment. Strip the comments and the mention is gone");
    ok("...and tools/ship/pipelineGaps-selfcheck.mjs DOES load them and was left out",
        E.CONTENT_READERS.includes("tools/ship/pipelineGaps-selfcheck.mjs") &&
        /tsl-emitted|ARTIFACTS/.test(stripLineComments(read("tools/ship/pipelineGaps-selfcheck.mjs"))),
        "*** SO THE COUNT OF 5 WAS RIGHT AND THE SET WAS WRONG: *** four real readers plus one false one came " +
        "to the same number as five real ones, and only listing the members shows it. v4482 met the same " +
        "shape when a per-type mean was quoted as an extremum");
}

// ---- 3. *** THE COMPARISON CAN TELL IDENTICAL FROM MOVED, DRIVEN NOT GREPPED *** -------------------------------
{
    const a = { at: "v1", note: "prose", wgsl: "AAA", glsl: "BBB" };
    const same = E.compareEmit(a, { ...a });
    const moved = E.compareEmit(a, { ...a, glsl: "CCC" });
    const stampOnly = E.compareEmit(a, { ...a, at: "v2", note: "different prose" });
    const first = E.compareEmit(null, a);
    const partial = E.compareEmit({ ...a, extra: "X" }, { wgsl: "AAA" });
    say(`same=${same.same} moved=${moved.same}(${moved.moved}) stampOnly=${stampOnly.same} first=${first.first} partial=${partial.same}`);
    ok("!! identical input reads same, a moved key reads moved BY NAME, and both are computed not asserted",
        same.same && same.checked.length === 2 && !moved.same && moved.moved.join() === "glsl",
        "compareEmit returns which key moved, so a red row names the shader that drifted rather than the file");
    ok("!! the round stamp and its prose are EXCLUDED, and named as excluded rather than silently skipped",
        stampOnly.same && !stampOnly.checked.includes("at") && !stampOnly.checked.includes("note"),
        "`at` and `note` move when a human edits them, which is not the emitter drifting. Everything else counts");
    ok("a first run with no stored copy reports `first` and does not fail",
        first.first && first.same && first.detail.includes("first run"),
        "a fresh checkout has no artifact to compare against and that is not a regression");
    ok("!! ...and a partial write compares only the keys it CARRIES, which is what the five-write file needs",
        partial.same && partial.checked.join() === "wgsl",
        "a read-modify-write site adds one key to a file holding others; keys only the stored copy has are " +
        "another write's business");
}

// ---- 4. *** THE BASELINE TRAP, REPRODUCED AND THEN FIXED, IN ONE RUN *** ---------------------------------------
{
    const tmp = path.join(ENG, "tools/ship/__emitrepro-probe.json");
    try {
        // The stored artifact: two keys, as a full run leaves it.
        fs.writeFileSync(tmp, JSON.stringify({ at: "v1", core: "CORE", extra: "EXTRA" }, null, 1));
        const baseline = E.snapshot(fs, tmp);

        // Write 1 rewrites from scratch and DROPS `extra` -- exactly what tslRace's first write does.
        const w1 = E.writeIfReproducible(fs, tmp, { at: "v1", core: "CORE" }, baseline);
        // Write 2 merges `extra` back. Against the file as it now stands, `extra` looks new.
        const merged = { ...JSON.parse(fs.readFileSync(tmp, "utf8")), extra: "EXTRA" };
        const wrongWay = E.compareEmit(E.snapshot(fs, tmp), merged);     // the first draft's comparison
        const rightWay = E.writeIfReproducible(fs, tmp, merged, baseline);

        say(`write 1 vs baseline: ${w1.same}; merge vs the mid-run file: ${wrongWay.same}; merge vs the baseline: ${rightWay.same}`);
        ok("!! *** THE FIRST WRITE ERASES THE EVIDENCE THE LATER ONES NEED -- reproduced here on purpose ***",
            w1.same && !wrongWay.same && wrongWay.moved.join() === "extra" && rightWay.same,
            "comparing a merge against the file as it stands mid-run compares it against a state THIS RUN " +
            "created, and reports drift while the file ends byte-identical to the commit. That is what four " +
            "of the eight writes did before the baseline was snapshotted, and it is why snapshot() exists");
        const final = JSON.parse(fs.readFileSync(tmp, "utf8"));
        ok("...and the file still ends equal to what it started as, which is the whole point",
            JSON.stringify(final) === JSON.stringify(baseline),
            "the drift was in the check, not in the data");
    } finally { try { fs.unlinkSync(tmp); } catch {} }
    ok("CONTROL: the probe leaves no artifact behind",
        !fs.existsSync(path.join(ENG, "tools/ship/__emitrepro-probe.json")),
        "gateActivity's rule: a gate that leaves a file behind grows the population it measures");
}

// ---- 5. *** EVERY WRITE SITE CALLS THE COMPARISON -- COUNTED IN CODE, NOT IN COMMENTS *** ----------------------
{
    const gates = [...new Set(E.ARTIFACTS.map((a) => a.writer))];
    let guarded = 0, bare = [];
    for (const g of gates) {
        const code = stripLineComments(read(g));
        guarded += (code.match(/writeIfReproducible\(/g) || []).length;
        const raw = (code.match(/fs\.writeFileSync\(EMITTED/g) || []).length;
        if (raw) bare.push(`${g} has ${raw} unguarded write(s)`);
    }
    say(`${gates.length} writer gates, ${guarded} guarded writes, ${bare.length} unguarded`);
    ok("!! *** ALL EIGHT WRITES COMPARE BEFORE THEY WRITE, AND NONE IS LEFT BARE ***",
        guarded === M.writes && guarded === 8 && bare.length === 0 && gates.length === M.writerGates,
        bare.join("; ") || "every writeFileSync to an emitted artifact goes through the comparison now. " +
        "It costs nothing: by the time a gate reaches its write, the expensive emit has already happened");

    const declared = E.ARTIFACTS.reduce((n, a) => n + a.writes, 0);
    ok("...and the register's per-artifact write counts add up to the same eight",
        declared === M.writes,
        `${E.ARTIFACTS.map((a) => `${a.file.replace("tools/ship/tsl-emitted", "").replace(".json", "") || "(base)"}:${a.writes}`).join(" ")} = ${declared}`);

    // *** THIS ROW WENT ZERO-RED ON A TOKEN. *** Its first draft asked whether tslRace-selfcheck mentions
    // EMITTED_BASELINE, and a sabotage that set it to `undefined` -- disabling the baseline entirely -- kept
    // the name and passed. A grep for an identifier is satisfied by the identifier, which is v4480's family
    // and the fourth instance this session. What is graded now is the ASSIGNMENT and the USE: the baseline
    // must come from snapshot(), and every one of the file's writes must be handed it.
    const raceCode = stripLineComments(read("tools/ship/tslRace-selfcheck.mjs"));
    const assigned = /const EMITTED_BASELINE = snapshot\(fs, EMITTED\);/.test(raceCode);
    const passedIn = (raceCode.match(/writeIfReproducible\(fs, EMITTED, [\s\S]*?, EMITTED_BASELINE\)/g) || []).length;
    ok("!! and the five-write file takes a pre-run baseline AND hands it to all five writes",
        assigned && passedIn === M.writesGradedAgainstAPreRunBaseline && passedIn === 5 &&
        E.ARTIFACTS.find((a) => /race/.test(a.file)).writes === M.writesGradedAgainstAPreRunBaseline,
        `assigned from snapshot(): ${assigned}; writes given the baseline: ${passedIn} of 5. The other three ` +
        "gates write once each, where reading the file at the write is the same thing. *** THE BEHAVIOUR " +
        "itself is graded by section 4, which reproduces the trap with real calls, and by tslRace's own five " +
        "rows at run time -- this row grades the wiring, and says so rather than implying more ***");
}

// ---- 6. THE SHAPE OF THE FOUR, AND THE ONE THAT CARRIES ONE LANGUAGE FOR A REASON ------------------------------
{
    // *** READ GUARDED, BECAUSE AN UNGUARDED ONE HERE KILLED SECTION 1's RED. *** A sabotage that renamed a
    // register row to a file that does not exist made this JSON.parse throw, and the crash took the whole run
    // down -- including the row in section 1 that had ALREADY diagnosed it correctly. v4434's shape and the
    // third instance in three rounds: a later section must not be able to destroy an earlier section's finding.
    const rows = E.ARTIFACTS.map((a) => {
        let j = null;
        try { j = JSON.parse(read(a.file)); } catch { j = null; }
        return { a, j, lang: j ? E.carriesBothLanguages(j) : { wgsl: false, glsl: false, both: false }, three: j && j.three };
    });
    const missing = rows.filter((r) => r.j === null).map((r) => r.a.file);
    ok("every file the register names is on disk and parses",
        missing.length === 0, missing.length ? "missing or unparsable: " + missing.join(", ") : `${rows.length} artifacts read`);
    for (const r of rows) say(`${r.a.file.padEnd(36)} declared ${r.a.languages} -- wgsl ${r.lang.wgsl}, glsl ${r.lang.glsl}`);
    ok("!! every artifact carries the languages its register row declares, detected by CONTENT not by key name",
        rows.every((r) => (r.a.languages === 2 ? r.lang.both : r.lang.wgsl && !r.lang.glsl)),
        "the compute artifact's texts are called `emitted` and `transplanted`, so a name-based detector would " +
        "have called it empty -- which is exactly what the first draft of this did");
    ok("!! *** THREE CARRY BOTH AND THE COMPUTE ONE CARRIES WGSL ALONE, BECAUSE WebGL2 HAS NO COMPUTE STAGE ***",
        rows.filter((r) => r.lang.both).length === M.dualLanguageArtifacts &&
        rows.filter((r) => r.lang.wgsl && !r.lang.glsl).length === M.wgslOnlyArtifacts,
        "there is no GLSL counterpart to emit. The survey's blanket 'both texts written to disk' is true of " +
        "three and structurally impossible for the fourth, and an exception nobody states is " +
        "indistinguishable from an omission");
    ok("...and all four are pinned to the same three version, so the set was emitted by one builder",
        rows.every((r) => r.three === M.three),
        `three ${M.three}. Two artifacts from different builders would make the corpus's WGSL a mixture`);

    // *** THE MARKERS ARE BUILT FROM FRAGMENTS SO THIS FILE DOES NOT CLASSIFY ITSELF. ***
    const mod = read("tools/ship/emitReproducibility.mjs");
    ok("!! the detector's markers are assembled, not spelled, so backendParity does not read this as a shader",
        /"@" \+ "compute"/.test(mod) && /"#" \+ "version"/.test(mod),
        "render/backendParity.mjs classifies files by looking for exactly those strings. Spelling them here " +
        "would make this module a WGSL-bearing shader -- the trap v4462, v4479 and v4483 each sprang");
}

console.log("emitReproducibility-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
