// tools/roundhouse/androidPersistence-selfcheck.mjs
//
// Run: node tools/roundhouse/androidPersistence-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2935 -- THE PERSISTENCE PREDICTION IS NOW GRADABLE, AND THE PHONE STILL DOES NOT GET TO VOTE.
//
// androidPeer.mjs has registered two persistence predictions since the Android round: survivesDozeWithBootWakeLock
// = true, survivesMemoryPressure = false. Both were hardcoded AWAITING in the verdict tool with the note "needs
// an overnight uptime log". This round supplies the log: termux_boot_peer.sh, a Termux:Boot script that appends
// a started/finished pair to a ledger every boot, and gradePersistence(), which reads that ledger on the desktop
// and grades both predictions from the raw event pattern.
//
// The discipline is the one this whole apparatus is built on: the phone MEASURES (writes started/finished), the
// desktop ADJUDICATES (derives the verdict). The boot script never writes survivesDoze or survivesMemory. This
// gate plants synthetic ledgers -- the evidence -- and checks the adjudicator reads each correctly, including the
// direction that a REAP confirms the memory-pressure prediction rather than failing it.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gradePersistence } from "./androidVerdict.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const here = path.dirname(fileURLToPath(import.meta.url));
const L = (...lines) => lines.join("\n") + "\n";
const started = (boot, prev = "no") => `{"event":"started","boot":"${boot}","uptimeAtLaunch":42,"previousRunReaped":"${prev}","wakeLock":true}`;
const finished = (boot, exit = 0) => `{"event":"finished","boot":"${boot}","exit":${exit},"uptimeAtFinish":900}`;

// ---- 1. NO LEDGER -> AWAITING, NOT A GUESS ---------------------------------------------------------------------------
{
    const g = gradePersistence(null);
    ok("with no ledger, both survival claims stay AWAITING",
        g.doze.verdict === "AWAITING" && g.memory.verdict === "AWAITING",
        "no evidence, no verdict -- the tool says what to install rather than assuming an outcome");
}

// ---- 2. ONE BOOT IS NOT SURVIVAL ------------------------------------------------------------------------------------
{
    const g = gradePersistence(L(started("2026-01-01T00:00:00Z"), finished("2026-01-01T00:00:00Z")));
    ok("!! a single clean boot does NOT confirm Doze survival",
        g.doze.verdict === "AWAITING",
        "one boot only proves it ran once; survival across an idle/off period needs the device to come back a " +
        "SECOND time. Confirming on one boot would be the experiment flattering itself");
}

// ---- 3. MULTIPLE CLEAN BOOTS -> DOZE CONFIRMED ----------------------------------------------------------------------
{
    const g = gradePersistence(L(
        started("2026-01-01T00:00:00Z"), finished("2026-01-01T00:00:00Z"),
        started("2026-01-02T00:00:00Z"), finished("2026-01-02T00:00:00Z"),
        started("2026-01-03T00:00:00Z"), finished("2026-01-03T00:00:00Z"),
    ));
    ok("!! three clean boots across three sessions CONFIRMS survivesDozeWithBootWakeLock",
        g.doze.verdict === "CONFIRMED" && g.stats.cleanBoots === 3,
        "the peer started on boot and ran to completion after being off, three times -- which is what the " +
        "prediction (true) asserts. " + g.doze.why.slice(0, 60));
}

// ---- 4. A REAP CONFIRMS THE MEMORY-PRESSURE PREDICTION (which is FALSE) ----------------------------------------------
{
    // a started with no finished = the process vanished mid-run
    const g = gradePersistence(L(
        started("2026-01-01T00:00:00Z"), finished("2026-01-01T00:00:00Z"),
        started("2026-01-02T00:00:00Z"),                                     // <- reaped: no finished
        started("2026-01-03T00:00:00Z"), finished("2026-01-03T00:00:00Z"),
    ));
    ok("!! a reap (started with no finished) CONFIRMS survivesMemoryPressure = false",
        g.memory.verdict === "CONFIRMED" && g.stats.reaps === 1,
        "the OS killed the peer mid-run once. The prediction was that it does NOT survive memory pressure, so a " +
        "reap CONFIRMS it -- the direction matters: a reap is the predicted outcome, not a failure of the test");

    ok("...and the same ledger still confirms Doze survival from its clean boots",
        g.doze.verdict === "CONFIRMED",
        "two of the three boots finished cleanly, so Doze survival holds even though one run was reaped -- the " +
        "two predictions are graded independently from the same log");
}

// ---- 5. THE SURPRISING FALSIFICATION IS NAMED, NOT SILENTLY PASSED ---------------------------------------------------
{
    const lines = [];
    for (let i = 0; i < 12; i++) { lines.push(started(`2026-02-${String(i + 1).padStart(2, "0")}T00:00:00Z`)); lines.push(finished(`2026-02-${String(i + 1).padStart(2, "0")}T00:00:00Z`)); }
    const g = gradePersistence(L(...lines));
    ok("!! twelve clean boots with ZERO reaps is reported as SURPRISING, not as a quiet pass",
        g.memory.verdict === "FALSIFIED-SURPRISING",
        "the prediction was that the peer does NOT survive memory pressure. A long log with no reap would mean " +
        "it somehow does -- a reportable surprise, flagged distinctly rather than folded into a plain CONFIRMED/" +
        "FALSIFIED, because it would mean something unexplained is keeping a non-foreground process alive");
}

// ---- 6. THE BOOT SCRIPT PERFORMS SETUP BUT NEVER WRITES A VERDICT ----------------------------------------------------
{
    const script = fs.readFileSync(path.join(here, "termux_boot_peer.sh"), "utf8");
    ok("!! the boot script writes started/finished events but NEVER a survival verdict",
        /"event":"started"/.test(script) && /"event":"finished"/.test(script) &&
        !/survivesDoze|survivesMemoryPressure/.test(script.replace(/#.*/g, "")),
        "the ledger lines carry only observations (boot, uptime, exit); the words survivesDoze / " +
        "survivesMemoryPressure appear only in comments, never in emitted data. The phone measures, the desktop " +
        "adjudicates -- the same separation the symlink block keeps");

    ok("...and it holds a wake-lock with a signal-safe trap",
        /termux-wake-lock/.test(script) && /trap .*EXIT INT TERM/.test(script),
        "start-on-boot with the wake-lock is the SETUP the Doze prediction needs; releasing on any exit is the " +
        "same hardening termux_peer.sh got in v2928");

    ok("...and it targets the Termux:Boot directory, F-Droid build",
        /\.termux\/boot/.test(script) && /F-Droid/.test(script),
        "documents that Termux:Boot only runs these scripts on the F-Droid build (the Play Store build is " +
        "deprecated and silently will not), which is the single most common reason a persistence setup does nothing");
}

// ---- 7. THE CLI ACTUALLY PASSES A LEDGER FILE THROUGH (v2939 wire) ---------------------------------------------------
{
    // gradePersistence has read a ledger since v2935, but until v2939 the verdict CLI never handed it one -- it
    // read ref/phone/magmap and stopped. This confirms the 4th argument reaches the grader, so a real boot
    // ledger from a phone can be graded from the command line, not only through the programmatic extras path.
    const src = fs.readFileSync(path.join(here, "androidVerdict.mjs"), "utf8");
    ok("!! the verdict CLI reads a persistence-ledger file as its 4th argument",
        /ledgerFile/.test(src) && /extras\.persistenceLedger = fs\.readFileSync\(ledgerFile/.test(src),
        "the CLI destructures [refFile, phoneFile, magmapFile, ledgerFile] and reads the ledger as RAW TEXT " +
        "(it is JSON-lines, not JSON), handing it to gradePersistence. Before v2939 the ledger could only reach " +
        "the grader through the programmatic extras object, so a phone's real ledger had no command-line path in");

    ok("...and the usage string documents the ledger argument",
        /persistence-ledger/.test(src),
        "so an operator running the verdict tool sees that the boot ledger is the optional 4th argument");
}

// v3312 -- THIS FILE ENDED HERE, WITH `fails` INCREMENTED AND NEVER READ. It printed FAIL lines and exited 0,
// so every check above was a decoration: 670 gates in this tree report their verdict and this one did not.
// Found by tools/ship/gateMutation.mjs, which injects a forced failure and requires the process to say so --
// a grep could not have found it, because there was no wrong exit idiom here, there was no exit at all.
console.log(fails ? ("androidPersistence-selfcheck: " + fails + " FAILED") : "androidPersistence-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
