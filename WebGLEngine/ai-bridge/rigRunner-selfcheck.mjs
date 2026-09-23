// WebGLEngine/ai-bridge/rigRunner-selfcheck.mjs — v2559
//
// Run: node ai-bridge/rigRunner-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// THE PAGE KEITH ASKED FOR DID NOT EXIST.
//
// "You made a page with all the tests I am supposed to click on, like 30 of them... It sounded like you did a lot
// of prep so it would be 1 click tests and result shown."
//
// I looked. predictions.html has 28 claims -- which IS the ~30 he remembers -- and ZERO buttons: it shows what was
// MEASURED, not what he can RUN. physics-verified.html computes live, also no buttons. Nothing in the tree or the
// last four transcripts is a click-to-run checklist. IT WAS DESCRIBED AND NEVER BUILT, and he was remembering the
// description. Saying so was worth more than quietly building something and calling it the one he meant.
//
// So: rig.html + ai-bridge/rigRunner.js. 106 selfchecks discovered FROM DISK (not a hand-written list, which would
// drift the moment someone adds one and would look like a shorter page rather than an error) plus 8 things only a
// human at the rig can do. 114 clickable items. He asked if there were more than 30.
//
// ---- THE ONE RULE THIS FILE ENFORCES -------------------------------------------------------------------------
//
// THE VERDICT IS THE PROCESS EXIT CODE. NOT TEXT SCRAPED OUT OF STDOUT.
//
// v2544's incident: a ship gate was bypassed because piping through `tail` ate the exit status, and the entire
// ship ritual got folded into one command as a result. A page that grepped stdout for "all checks pass" would
// rebuild that exact bug in a browser, prettier. A CONTROL THAT CANNOT FAIL IS DECORATION.
//
// ---- RIG-ONLY, STATED --------------------------------------------------------------------------------------
//
// This proves the RUNNER: discovery, real exit codes, refusal of bad input, and that a sabotaged check comes back
// RED. IT DOES NOT PROVE THE BROWSER ROUND-TRIP -- ai-bridge/server.js will not boot in this sandbox (no
// node_modules, no network for npm install; see v2545's freshMachine work). The route is wired and server.js
// parses. THE CLICK ITSELF IS UNVERIFIED HERE AND ONLY KEITH CAN SEE IT.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { writeFixture, dropFixture, reclaimMutations, armExitSweep } from "../tools/ship/fixtureLitter.mjs";
armExitSweep();

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const { discover, runOne, RIG_ONLY, handle } = require(path.join(here, "rigRunner.js"));

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

// ---- 1. it finds the checks, from disk ------------------------------------------------------------------------
{
    const c = discover();
    ok("it discovers selfchecks FROM DISK, not from a hand-written list", c.length > 50,
       c.length + " found -- a hand list would drift the moment someone adds one, and the drift would look like a SHORTER PAGE rather than an error");
    ok("...and every one it names actually exists", c.every((x) => fs.existsSync(path.join(here, "..", x.rel))));
    ok("...including the ones written this session", c.some((x) => x.name === "upAxis") && c.some((x) => x.name === "ferroThermal"),
       "upAxis (v2557), ferroThermal (v2558)");
    ok("plus the things only a human at the rig can do", RIG_ONLY.length >= 8,
       RIG_ONLY.length + " rig-only items -> " + (c.length + RIG_ONLY.length) + " clickable things in total. Keith asked if there were more than 30.");
    ok("...and each rig-only item says WHAT IT UNBLOCKS", RIG_ONLY.every((r) => r.why && r.why.length > 40),
       "'rebuild the wasm' is a chore; 'rebuild the wasm, it blocks five things' is a decision");
}

// ---- 2. THE VERDICT IS THE EXIT CODE --------------------------------------------------------------------------
{
    const r = await new Promise((res) => runOne("physics/upAxis-selfcheck.mjs", res));
    ok("a passing check comes back GREEN with exit 0", r.ok === true && r.code === 0,
       "exit " + r.code + " in " + r.ms + "ms");
    ok("...and its REAL output comes back with it", r.out.includes("upAxis-selfcheck"),
       r.out.length + " bytes of actual stdout, for reading -- but the VERDICT is the code, not this text");

    // SABOTAGE. If this cannot go red, the page is wallpaper.
    // NOTE: this must sabotage the ASSERTION, not the SYNTAX. The first attempt inserted a `&&` that made the
    // file unparseable -- the process died with exit 1 and never printed a word, and the "failure text comes
    // back" check below caught it. A CRASH AND A FAILURE ARE BOTH RED AND THEY ARE NOT THE SAME RED: a crash
    // tells you nothing about the physics, and a page that cannot tell them apart would report a broken import
    // as a broken world.
    //
    // *** v4661 -- AND IT MUST NOT BE A GATE THE SWEEP IS RUNNING. ***
    // v4649 ledgered the mutation so a killed run could be undone, and that was the wrong half. The sweep is
    // EIGHT WAY PARALLEL: this gate edited physics/upAxis-selfcheck.mjs on disk while another worker was
    // running that same file, so upAxis went red in every sweep and green every time anybody ran it alone.
    // Three rounds read that as a Windows physics finding. No ledger can fix it -- the mutation is legitimate
    // and it is restored -- so the answer is that the subject is a COPY nothing else runs.
    //
    // The copy is `__`-prefixed, which is this tree's mark for a transient fixture: gateSweep's walk refuses
    // to enumerate those as gates (asserted there), so the sweep cannot pick it up no matter how many workers
    // are running. It is written through the fixture registry, so a death drops it and the next run reclaims
    // it. What this gate proves is unchanged -- that the RUNNER reports a failure as a failure -- and it now
    // proves it without touching a file anybody else is reading.
    const reclaimed = reclaimMutations();
    ok("!! *** the tree carries no gate left mutated by a killed run ***", reclaimed.length === 0,
       reclaimed.length ? "RECLAIMED " + reclaimed.join(", ") + " -- a previous run died between a sabotage " +
           "and its restore. The tree is repaired now and this row is how you find out it happened; a run " +
           "that swallowed it would hand the next sweep a red gate with no author"
         : "nothing stranded -- the ledger outside the engine tree is empty");

    const LIVE = path.join(here, "..", "physics", "upAxis-selfcheck.mjs");
    const liveBefore = fs.readFileSync(LIVE, "utf8");
    // BESIDE the original: a copy in another directory cannot resolve the relative imports the gate
    // makes, and the first version of this read red for that reason rather than for the sabotage.
    const PROBE = "physics/__rigrunner_probe-selfcheck.mjs";
    const sab = liveBefore.replace("Math.abs(w.readTransforms()[1] - 5) < 0.3", "false");
    ok("!! the gate this one copies is in the state it expects before anything is written", sab !== liveBefore,
       sab !== liveBefore ? "the assertion the sabotage replaces is present in the original, so the copy below " +
                            "changes the subject rather than testing nothing"
                          : "THE SABOTAGE STRING IS ABSENT from physics/upAxis-selfcheck.mjs, so nothing was " +
                            "written. Check it against HEAD before reading anything else here");
    if (sab !== liveBefore) {
        try {
            // The COPY, unmodified first: it must be green, or the sabotage below proves nothing.
            writeFixture(PROBE, liveBefore);
            const good = await new Promise((res) => runOne(PROBE, res));
            ok("!! a COPY of that gate, untouched, is green through the runner",
               good.ok === true && good.code === 0,
               `exit ${good.code} in ${good.ms}ms -- the copy is the subject now, and a copy that was already ` +
               "red would make the row below meaningless");
            writeFixture(PROBE, sab);
            const bad = await new Promise((res) => runOne(PROBE, res));
            ok("A SABOTAGED CHECK COMES BACK RED (the page can fail)", bad.ok === false && bad.code !== 0,
               "exit " + bad.code + " -- if this were green the whole page would be decoration");
            ok("...and it FAILED rather than crashed (the failure text comes back to the browser)",
               bad.out.includes("FAIL") && bad.out.includes("RISES"),
               "a red row can be READ, not just counted -- and a crash would have printed nothing, which is a different red");
        } finally {
            dropFixture(PROBE);
        }
    }
    // *** THE REGRESSION ROW, AND IT IS THE POINT OF THE ROUND. *** Whatever this gate did above, the gate it
    // copied is byte-for-byte what it was. A run that fails this has put a red in somebody else's sweep.
    const liveAfter = fs.readFileSync(LIVE, "utf8");
    ok("!! *** and physics/upAxis-selfcheck.mjs is UNTOUCHED -- nothing here edits a gate the sweep may be running ***",
       liveAfter === liveBefore && !fs.existsSync(path.join(here, "..", PROBE)),
       liveAfter === liveBefore
         ? `${liveBefore.length} bytes, unchanged, and the probe copy is gone. For three rounds this gate ` +
           "edited that file in place and an 8-way sweep read it mid-edit"
         : "THE LIVE GATE CHANGED. Whatever else this run reported, it has just handed the next sweep a red " +
           "gate with no author -- which is exactly the failure this row exists for");
}

// ---- 3. it refuses what it should -----------------------------------------------------------------------------
// /rig/run takes a path from a browser. A page that will spawn any file a request names is not a checklist, it is
// a remote shell.
{
    for (const [label, rel] of [
        ["a file that does not exist", "physics/nope-selfcheck.mjs"],
        ["something that is not a selfcheck", "ai-bridge/server.js"],
        ["a path traversal", "../../../../etc/passwd"],
        ["a traversal wearing the right suffix", "../../../tmp/evil-selfcheck.mjs"],
        ["nothing at all", ""],
    ]) {
        const r = await new Promise((res) => runOne(rel, res));
        ok("REFUSES: " + label, r.ok === false, "exit " + r.code + " -- /rig/run takes a path FROM A BROWSER; a runner that spawns whatever it is handed is a remote shell, not a checklist");
    }
}

// ---- 4. the route is wired (but the click is rig-only) --------------------------------------------------------
{
    const src = fs.readFileSync(path.join(here, "server.js"), "utf8");
    ok("server.js routes /rig through the runner", /rigRunner\.js"\)\.handle\(req, res\)/.test(src));
    ok("handle() ignores requests that are not /rig", handle({ method: "GET", url: "/doctor" }, {}) === false,
       "it must not swallow another route's request");
    ok("RIG-ONLY, SAID OUT LOUD: the browser round-trip is UNVERIFIED here", true,
       "ai-bridge/server.js will not boot in this sandbox (no node_modules, no network for npm install -- v2545). The runner is proven and the route parses. THE CLICK ITSELF ONLY KEITH CAN SEE.");
}

console.log(fails ? "\nrigRunner-selfcheck: " + fails + " FAILED" : "\nrigRunner-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
