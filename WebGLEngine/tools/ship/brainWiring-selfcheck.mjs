// WebGLEngine/tools/ship/brainWiring-selfcheck.mjs -- v3025
//
// Run: node tools/ship/brainWiring-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ui/brainWiring.js -- one place that knows how to drive a brain.
//
// v3024 wired the avatar's lights to the roundhouse and put the polling loop INLINE IN server.html. That works
// exactly once. The moment a second surface wants the same lights -- the render panel, gauges3000, an
// avatar-mode window -- the natural move is to COPY THE LOOP, and then two things decide what a state means and
// one of them will be older.
//
// THAT IS THE DUPLICATED-TABLE CLASS THIS TREE HAS NOW PAID FOR SEVEN TIMES: five spatial structures that never
// met, two claims parsers disagreeing on their first run, two implementations of "this box's score" one round
// apart, two policy engines avoided only by importing, two queue paths, two bridges declaring "/bench" (one of
// them dead for thirty-five rounds), and a fingerprint field hand-copied into two rows.
//
// SO THE LOOP MOVED BEFORE A SECOND CALLER EXISTED, rather than after one had already drifted. That is the only
// version of this fix that is cheap.
import { attachBrain, DEFAULT_MS } from "../../ui/brainWiring.js";
import { prose } from "./sourceScan.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const src = fs.readFileSync(path.join(ENG, "ui", "brainWiring.js"), "utf8");
const ui = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. IT OWNS THE POLLING, NOT THE MEANING ---------------------------------------------------------------
{
    ok("!! it imports readActivity rather than reimplementing it", /tools\/roundhouse\/activity\.mjs/.test(src) && /A\.readActivity/.test(src),
       "the same function the fleet view, the minipanel and the peer itself use -- this file owns the loop, not the interpretation");
    ok("...and defines no state names of its own", !/"unattended"|"running"|"idle"/.test(src.replace(/\/\/.*$/gm, "").replace(/"unknown"/g, "")),
       "the only literal state it writes is the unknown fallback, which is a decision about a FAILED FETCH rather than about activity");
    ok("the default interval is a named constant", DEFAULT_MS >= 5000, DEFAULT_MS + "ms");
}

// ---- 2. A LOST BRIDGE IS NOT AN IDLE ENGINE -------------------------------------------------------------------
{
    let got = null;
    const bot = { setBrain: (a) => { got = a; } };
    const w = attachBrain(bot, { intervalMs: 9e6, fetchImpl: async () => { throw new Error("down"); } });
    await w.tick();
    ok("!! a failed fetch sets UNKNOWN, not idle", got && got.state === "unknown",
       "showing idle would be the avatar quietly asserting something nobody measured");
    ok("...and it still calls setBrain rather than leaving the last state lit", got !== null,
       "a stale light is worse than a dim one, because it keeps claiming a run that may have ended");
    w.stop();
}

// ---- 3. IT REFUSES TO ATTACH TO NOTHING, OUT LOUD -----------------------------------------------------------------
{
    const n = attachBrain(null);
    ok("!! no robot handle returns a stated refusal", /no robot handle with setBrain/.test(n.why || ""),
       "attaching to nothing and saying so beats a silent no-op that looks wired");
    ok("...and still returns a usable shape", typeof n.stop === "function" && typeof n.tick === "function",
       "a caller must not have to null-check the thing that was supposed to simplify its life");
    const half = attachBrain({});
    ok("a robot without setBrain is refused too", /no robot handle/.test(half.why || ""),
       "an object that is not a robot is a likelier mistake than a null");
}

// ---- 4. IT CAN BE STOPPED ---------------------------------------------------------------------------------------------
{
    const w = attachBrain({ setBrain() {} }, { intervalMs: 9e6, fetchImpl: async () => { throw new Error("x"); } });
    ok("!! stop() exists", typeof w.stop === "function",
       "a page that swaps views must not leak a timer -- the same rule fitPlot's detach carries");
    w.stop();
    ok("...and a stopped wiring does not keep ticking", (await w.tick()) === null,
       "stop must mean stopped, not merely 'the interval was cleared'");
}

// ---- 5. THE CALLER IS ONE LINE, AND THERE IS ONLY ONE -----------------------------------------------------------------
{
    ok("!! server.html calls attachBrain", /attachBrain\(window\._swekRobot\)/.test(ui));
    ok("!! ...and no longer polls inline", !/setInterval\(tick, 20000\)/.test(ui),
       "the loop it used to own is gone, not merely duplicated somewhere quieter");
    ok("there is exactly ONE place with the loop", (fs.readdirSync(path.join(ENG, "ui")).filter((f) => /brainWiring/.test(f)).length) === 1);
    ok("...and the reason is recorded", /BEFORE a second caller could copy it/.test(prose(ui)) || /BEFORE A SECOND CALLER EXISTED/.test(prose(src)),
       "moving it after the copy exists is the expensive version, and the file has to say which one this was");
}

console.log(fails ? "\nbrainWiring-selfcheck: " + fails + " FAILED" : "\nbrainWiring-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
