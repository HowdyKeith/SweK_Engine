// tools/ship/spacesimStart-selfcheck.mjs
//
// Run: node tools/ship/spacesimStart-selfcheck.mjs   (~0.29s — MEASURED v3941, was ~1s)
//
// v3165 -- THE PANEL COULD DRIVE A SIMULATOR IT COULD NOT LAUNCH.
//
// economy.html has had Status, Census, Resume and Probe since v3041, and "Resume" resumes a sim that is
// ALREADY RUNNING. The launch command sat in economyBridge.js as a `fix:` STRING -- printed as advice, never
// executed -- so every one of those buttons required Keith to have started the thing by hand first.
//
// *** SPAWNING IS NOT RUNNING, AND THAT IS THE WHOLE DESIGN. *** v3107 found ninety-nine kill sites that
// signalled a process and reported stopped:true without checking, and the fix was to report `signalled` rather
// than `stopped`. THE SAME MISTAKE IN REVERSE IS EASIER TO MAKE: spawn() hands back a child object immediately
// whether or not the binary exists, whether or not it compiles, whether or not it binds the port. A start that
// reports success on a successful spawn is reporting THAT NODE MANAGED TO ASK.
//
// So start() spawns and then POLLS THE SIM'S OWN ROUTE UNTIL IT ANSWERS. Until it answers, it has not started.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const B = createRequire(import.meta.url)(path.join(ENG, "ai-bridge", "economyBridge.js"));
const src = fs.readFileSync(path.join(ENG, "ai-bridge", "economyBridge.js"), "utf8");
const page = fs.readFileSync(path.join(ENG, "economy.html"), "utf8");

// ---- 1. STARTING IS VERIFIED, NOT ASSUMED --------------------------------------------------------------------
{
    ok("!! start() polls until the simulator ANSWERS, and only then reports started",
        /await answering\(\)\) return \{ ok: true, state: "STARTED"/.test(src) && /while \(Date\.now\(\) < deadline\)/.test(src),
        "spawn() returns a child object whether or not the binary exists, compiles or binds the port. REPORTING " +
        "SUCCESS ON A SUCCESSFUL SPAWN IS REPORTING THAT NODE MANAGED TO ASK -- v3107's kill-handle failure with " +
        "the arrow reversed");

    ok("!! a process that EXITED is distinguished from one that is merely slow",
        /_child\.exitCode !== null/.test(src) && /state: "EXITED"/.test(src) && /state: "NO-ANSWER"/.test(src),
        "a cargo build that is still linking is SLOW, not broken. Those are different answers and they send you " +
        "to different places -- one to the compiler output, one to a longer wait");

    ok("...and a slow one is NOT killed",
        /NOT\s+KILLED:\s+a\s+cargo\s+build\s+that\s+is\s+still\s+linking\s+is\s+not\s+a\s+failure/.test(src) && /stillRunning: _child\.exitCode === null/.test(src),
        "killing it would turn 'your first build takes four minutes' into 'it does not work', and the second " +
        "reading is the one somebody acts on");
}

// ---- 2. THREE ABSENCES, NAMED SEPARATELY -----------------------------------------------------------------------
{
    ok("!! no checkout, no cargo, and not-running are THREE answers",
        /state: "NO-CHECKOUT"/.test(src) && /state: "NO-CARGO"/.test(src) && /state: "ALREADY-RUNNING"/.test(src),
        "clone it / install Rust / start it -- three different places to go. Collapsing them into 'not " +
        "available' sends you to the wrong one two times in three");

    const st = await B.status();
    ok("!! status() reports each fact on its own evidence",
        typeof st.haveRepo === "boolean" && typeof st.haveCargo === "boolean" && typeof st.running === "boolean",
        "haveRepo " + st.haveRepo + ", haveCargo " + st.haveCargo + ", running " + st.running + " on this box. " +
        "v3040's law from the tunnel checkbox: TWO INDEPENDENT FACTS RESTORED ON ONE PIECE OF EVIDENCE is how a " +
        "control comes to lie");

    ok("!! and the checkout is FOUND, never guessed into existence",
        /if \(fsMod\.existsSync\(pathMod\.join\(c, "Cargo\.toml"\)\)\) return c;/.test(src) && /return null;/.test(src),
        "it checks for Cargo.toml at each candidate and returns null when there is none. A path returned on " +
        "hope would spawn cargo in the wrong directory and report its failure as the simulator's");
}

// ---- 3. THE FRONT DOOR -------------------------------------------------------------------------------------------
{
    ok("!! the page has a Start button beside the four that need a running sim",
        /id="bStart"/.test(page) && /\/economy\/start/.test(page) && /id="bStat"/.test(page),
        "A MODULE WITH NO CALLER IS UNFINISHED -- and a launch command that lives only as a `fix:` string is a " +
        "module with no caller wearing a docstring");

    ok("...and the page NAMES which absence it hit",
        /NOT STARTED \(" \+ r\.state \+ "\)/.test(page) && /NOT\s+FOUND\s+--\s+set\s+SPACESIM_DIR/.test(page),
        "it prints the state, the repo path or its absence, whether cargo is on PATH, and whether the base " +
        "answers. Four facts, because 'could not start' is not one of them");

    ok("!! and the long wait is EXPLAINED rather than left as a mystery timeout",
        /first\s+run\s+is\s+a\s+cargo\s+build/.test(page) && /waitMs = 180000/.test(src),
        "three minutes is a long time to watch a button. Saying WHY is the difference between waiting and " +
        "reloading the page");
}

console.log();
console.log("  ----  THIS BOX HAS NEITHER THE CHECKOUT NOR CARGO, so the paths exercised here are the REFUSALS.");
console.log("  ----  Whether a real `cargo run` comes up and answers on :8080 is Keith's to see -- and the");
console.log("  ----  button now reports which of the four things happened rather than a bare failure.");
if (fails) { console.log("spacesimStart-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("spacesimStart-selfcheck: all checks pass");
