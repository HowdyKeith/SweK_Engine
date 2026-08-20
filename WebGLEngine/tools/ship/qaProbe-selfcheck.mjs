// WebGLEngine/tools/ship/qaProbe-selfcheck.mjs -- v2837
//
// Run: node tools/ship/qaProbe-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES the render-QA stress + probe hooks, and the wasm-gen-stats page that uses them.
//
// WHY THEY EXIST: getting wasmGenStats out of the engine was a NINE-STEP MANUAL RITUAL ending in a clipboard
// paste -- build, launch, open DevTools, fly around for two or three minutes, teleport once to stress the
// worker, then type a copy(JSON.stringify(...)) incantation and paste it back. Every one of those steps is
// something the harness already does, and the numbers belong in the same report as everything else.
//
// TWO THINGS THIS GATE INSISTS ON, because both are easy to get wrong in a way that looks fine:
//
//   A PROBE IS DATA, NEVER A VERDICT. It must not flip a page's pass/fail. A number nobody has a threshold for
//   yet is still worth collecting, and a page that renders perfectly should not go red because a debug hook was
//   renamed. If probes could fail pages, the first instinct on a red would be to delete the probe.
//
//   THE PROBE MUST NAME THE RIGHT GLOBALS. The manual recipe asked for chunkStreamer.stats() -- and
//   chunkStreamer is a module-scope const that is NOT on window, so that field would have come back null every
//   single time and nobody would have known the streamer numbers were missing rather than empty. The facade is
//   window.streamer. A probe that reads a name which does not exist fails SILENTLY, which is the whole reason
//   this check reads the manifest rather than trusting it.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const qa = fs.readFileSync(path.join(ENG, "tools", "render-qa", "render-qa.mjs"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "render-qa", "manifest.json"), "utf8"));
const main = fs.readFileSync(path.join(ENG, "main.js"), "utf8");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// 1. THE HOOKS EXIST AND ARE OPTIONAL
{
    ok("the harness supports a per-page probe", /if \(pg\.probe\)/.test(qa));
    ok("...and a per-page stress flight", /if \(pg\.stress\)/.test(qa));
    ok("both are OPT-IN, so every existing page behaves exactly as before", !/pg\.probe \|\| /.test(qa) && !/stress = true/.test(qa));
    ok("the probe result reaches the report record", /rec\.probe = probeResult/.test(qa));
    ok("...and a probe FAILURE is recorded rather than swallowed", /rec\.probeError = probeError/.test(qa));
}

// 2. A PROBE IS DATA, NOT A VERDICT -- the property that keeps it honest
{
    ok("a probe never flips the page's pass/fail", !/probeError\s*\)\s*\{?\s*rec\.ok\s*=/.test(qa) && !/rec\.ok = rec\.ok && !probeError/.test(qa));
    ok("...and the source says why", /DATA, not a verdict|never flips rec\.ok/i.test(qa));
    ok("a throwing probe is caught rather than killing the run", /__probeError/.test(qa) && /catch \(e\) \{ probeError/.test(qa));
}

// 3. THE STRESS FLIGHT DOES WHAT THE HUMAN WAS ASKED TO DO
{
    ok("it enables the streamer, as the manual recipe did", /window\.streamer.*setEnabled\(true\)/s.test(qa));
    ok("it sweeps the camera", /cam\.position\.x = Math\.cos/.test(qa));
    ok("...and TELEPORTS, which is the case that actually breaks a worker", /teleports/.test(qa) && /every chunk at once/i.test(qa));
    ok("it waits after the flight so the last generations land before reading", /waitForTimeout\(1200\)/.test(qa));
    ok("the source is honest that it cannot replace the FEEL", /cannot replace is the feel|feel was always half the decision/i.test(qa));
}

// 4. THE PROBE NAMES GLOBALS THAT ACTUALLY EXIST -- the silent-null trap
{
    const page = manifest.pages.find((p) => p.name === "wasm-gen-stats");
    ok("the wasm-gen-stats page is in the manifest", !!page);
    ok("...with both a stress flight and a probe", !!page && !!page.stress && !!page.probe);
    const probe = page ? String(page.probe) : "";
    ok("the probe reads window.world.wasmGenStats, which main.js exposes",
        /window\.world.*wasmGenStats/.test(probe) && /window\.world = world/.test(main));
    ok("the probe reads window.streamer, NOT the module-scope chunkStreamer that is not on window",
        /window\.streamer/.test(probe) && !/chunkStreamer/.test(probe) && /window\.streamer = \{/.test(main));
    ok("...and window.streamer really exposes stats()", /stats:\s*\(\) => chunkStreamer\.stats\(\)/.test(main));
    ok("the probe collects core count, so a slow worker can be read against the hardware", /hardwareConcurrency/.test(probe));
    ok("the probe collects the world seed, so a reading can be reproduced", /worldSeed/.test(probe));
    ok("the probe is JSON-round-tripped, so a live object cannot break serialisation", /JSON\.parse\(JSON\.stringify/.test(probe));
    ok("the stress flight is long enough to load the worker", !!page && page.stress.seconds >= 15, page ? page.stress.seconds + "s" : "");
    ok("...and teleports more than once", !!page && page.stress.teleports >= 2);
}

// 5. window.camera has to exist or the flight is a no-op that reports success
{
    ok("main.js exposes window.camera for the flight to move", /window\.camera = camera/.test(main));
    ok("the flight bails out safely when it does not", /if \(!cam \|\| !cam\.position\) return/.test(qa));
}

console.log("qaProbe-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
