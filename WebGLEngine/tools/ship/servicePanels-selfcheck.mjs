// WebGLEngine/tools/ship/servicePanels-selfcheck.mjs -- v3023
//
// Run: node tools/ship/servicePanels-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES the Terrain and Cross-Arch minipanels -- the last two services with state that outlives a click.
//
// Keith asked which SweK services run quietly with no gauge. The census found nine; four rounds have now closed
// four of them (roundhouse, rig jobs, and these two). The remaining five -- /bench, /device, /gates,
// /policymass, /ship -- are things you RUN rather than things that HUM, except policymass which is real debt
// already named in the bridge census baseline.
//
// EACH OF THESE TWO HAS A DISTINCTION A NAIVE RED/GREEN CHIP WOULD DESTROY, and that is the whole content:
//
//   TERRAIN: "not built" IS NOT AN ERROR. The engine runs fine without the wasm package -- world/terrainWasm.js
//   detects its absence and uses the JS path. A red chip beside "not built" is what sends someone hunting a
//   fault that does not exist. The bridge's own source says so in a comment; the panel has to say it too.
//
//   CROSS-ARCH: A DIFFERENCE IS THE MEASUREMENT, NOT A FAULT -- and v2998 added the sharper half: it is only
//   ATTRIBUTABLE when every other dimension matches. Reporting "differs" without naming WHAT differs invites
//   blaming the physics for a platform change.
import fs from "node:fs";
import { prose } from "./sourceScan.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const ui = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. BOTH ARE BUTTONS WITH CHIPS ------------------------------------------------------------------------
{
    for (const t of ["terrain", "crossarch"]) {
        ok(t + " has a gtab and a panel", new RegExp('data-tab="' + t + '"').test(ui) && new RegExp('data-panel="' + t + '"').test(ui));
    }
    ok("both carry a state chip", /id="tbStat"/.test(ui) && /id="caStat"/.test(ui),
       "a gauge you must open to read is not a gauge");
    ok("both read their bridge's own status route", /"\/terrain\/status"/.test(ui) && /"\/crossarch\/status"/.test(ui));
}

// ---- 2. TERRAIN: NOT-BUILT IS A CHOICE, NOT A FAULT -----------------------------------------------------------
{
    ok("!! the optional note is rendered WITH the state", /optional/.test(ui) && /opt-in fast path/.test(ui),
       "the bridge's source already says a red 'not built' reads as a broken engine; a panel that buried that would recreate the problem it warned about");
    ok("...and not-built is NOT coloured as an error", /built\?"#7fe0a4":"#9fb8ab"/.test(ui.replace(/\s/g, "")),
       "grey, not red -- the engine runs fine on the JS terrain path");
    ok("a missing toolchain is distinguished from a missing build", /missing \+/.test(ui) || /missing\.length/.test(ui),
       "no cargo is a different fact from not having pressed build");
    ok("!! the PATH note is surfaced when the toolchain looks absent", /pathNote/.test(ui),
       "v3004: the expensive failure is a tool that IS installed and invisible to this process, and on Windows the fix is restarting the SERVER not the shell");
}

// ---- 3. CROSS-ARCH: NAME WHAT DIFFERS, OR THE PHYSICS GETS BLAMED --------------------------------------------------
{
    ok("!! it shows this box AND the baseline", /this box:/.test(ui) && /baseline:/.test(ui),
       "a comparison with only one side shown is not a comparison");
    ok("!! a difference NAMES the dimension", /differs in /.test(ui),
       "'differs' alone invites blaming the physics for a platform change");
    ok("...and says a difference IS the measurement", /a difference here is THE MEASUREMENT/.test(ui),
       "an alarming label pushes a real finding toward being 'fixed'");
    ok("!! ...and that it is only attributable when everything else matches", /only attributable to architecture when every other dimension matches/.test(ui),
       "v2998's whole lesson, carried into the gauge rather than left in a module");
    ok("an ABSENT baseline is distinguished from a matching one", /absent &mdash; nothing to compare against/.test(ui),
       "no baseline and no difference look identical in a boolean, and only one of them means agreement");
}

// ---- 4. THE CENSUS THAT STARTED THIS IS CLOSING ------------------------------------------------------------------------
{
    const tabs = new Set([...ui.matchAll(/data-tab="([a-z0-9]+)"/g)].map((m) => m[1]));
    ok("!! four services gained a gauge since the question", ["roundhouse", "rigjob", "terrain", "crossarch"].every((t) => tabs.has(t)),
       tabs.size + " minipanels now -- the census found nine without one, and 'is there a button' turned out to be the cheapest test for the failure this whole session has been chasing");
    ok("both new panels degrade rather than rendering empty", (ui.match(/bridge unreachable/g) || []).length >= 3,
       "an empty gauge and a dead endpoint look identical, and only one means nothing is happening");
}

console.log(fails ? "\nservicePanels-selfcheck: " + fails + " FAILED" : "\nservicePanels-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
