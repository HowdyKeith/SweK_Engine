// WebGLEngine/tools/ship/aircraftPage-selfcheck.mjs
//
// Run: node tools/ship/aircraftPage-selfcheck.mjs
//
// THE PAGE-WIRING GATE for es-aircraft.html. Everything the page WIRES TOGETHER -- aeroSurface.mjs,
// aircraftAssembly.mjs, rigidBody6dof.mjs, autopilotAircraft.mjs -- is already independently gated and
// sabotage-tested; this file's only job is proving the WIRING itself: the page boots in a real browser, its
// flight loop actually runs (positions move, orientations rotate, the heading schedule advances), it stays
// numerically sane over real time, and the reset button works. Reads exact numeric state back through
// window.__aircraftDemo.state() (a debug hook the page itself exposes) rather than scraping rendered pixels.
//
// SABOTAGE LOG -- each applied to es-aircraft.html, the gate run against the REAL browser, the page restored
// (diffed to confirm byte-identical). Counts are what actually ran, not predicted:
//   A  `tick++` removed from stepFleet()'s own increment -- 4 red: the tick-advances check (stuck at 0), the
//      heading-switch/orientation check (also frozen -- the schedule itself is gated on `tick`, so with it
//      stuck the heading index never advances either, even though the underlying physics loop keeps running
//      every animation frame), and both post-reset tick checks.
//   B  ENGINE_THRUST set to 0 (no page-level engine at all) -- FIRST RUN: 0 red. The original sane-cruise-range
//      check (15-60 m/s) was too loose to catch a real but gradual ~1 m/s decline over the gate's own ~12-
//      simulated-second observation window -- a genuine gap, not a pass, caught by re-checking the sabotage's
//      own result rather than trusting the log's first prediction. Fixed by adding a SECOND check comparing
//      speed against its OWN initial value (measured on the real page: flat-to-slightly-rising with the real
//      engine, a clear ~1 m/s drop without it) -> re-sabotaged, now 1 red: the new decline check, while the
//      aircraft still flies and turns under aerodynamics alone (nothing crashes) -- exactly the real physics
//      this page's own header describes rigidBody6dof.mjs as having no gravity/no built-in engine for.
"use strict";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function report(name, detail) { console.log(`  ----  ${name}   ${detail}`); }

console.log("aircraftPage-selfcheck -- es-aircraft.html actually wires the gated aircraft modules together\n");

const skip = webgpuSkipReason(createRequire(import.meta.url));
if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***", ""); fails++; }
else {
    const run = await runInEngineOrigin({
        engineRoot: ENG, timeoutMs: 180000,
        script: `async () => {
            globalThis.__swekStep = "booting es-aircraft.html in an iframe";
            const f = document.createElement("iframe");
            f.style.width = "900px"; f.style.height = "600px";
            f.src = "/es-aircraft.html";
            document.body.appendChild(f);
            await new Promise((res) => { f.onload = res; });
            const win = f.contentWindow;
            const wait = (ms) => new Promise((res) => setTimeout(res, ms));
            const t0 = performance.now();
            while (performance.now() - t0 < 30000 && (!win.__aircraftDemo || win.__aircraftDemo.state().tick < 2)) {
                globalThis.__swekStep = "waiting for window.__aircraftDemo to appear and tick";
                await wait(200);
            }
            if (!win.__aircraftDemo) return { booted: false, reason: "window.__aircraftDemo never appeared" };
            const initial = win.__aircraftDemo.state();

            // let a real chunk of flight play out -- headless/software rendering runs well below real time
            // (measured directly on the sibling rigidBody6dofPage-selfcheck.mjs gate), so this waits on
            // SIMULATED ticks, with a generous real-time ceiling as a backstop. THE THRESHOLD MATTERS: every
            // aircraft starts ALREADY ALIGNED with its own first held heading (headingIdx=0 === its initial
            // orientation), so orientation genuinely does not change until that aircraft's OWN first scheduled
            // heading switch -- fleet[2] (the earliest-phased aircraft, phaseTicks=600 of LEG_TICKS=900) switches
            // first, at tick 300. Waiting only ~150 ticks (an earlier version of this gate did) catches every
            // aircraft still correctly holding its untouched first heading and misreads that as broken wiring.
            globalThis.__swekStep = "letting the flight run";
            const flightT0 = performance.now();
            while (performance.now() - flightT0 < 90000 && win.__aircraftDemo.state().tick < initial.tick + 340) {
                globalThis.__swekStep = "flight tick " + win.__aircraftDemo.state().tick;
                await wait(500);
            }
            const mid = win.__aircraftDemo.state();

            // reset and confirm the tick counter and lead aircraft's position actually reset -- read
            // IMMEDIATELY, before the running requestAnimationFrame loop has a chance to move it again.
            win.__aircraftDemo.newPatrol();
            const afterReset = win.__aircraftDemo.state();

            await wait(4000);
            const afterResetRunning = win.__aircraftDemo.state();

            const allFinite = (st) => st.fleet.every((s) =>
                s.pos.every(Number.isFinite) && s.vel.every(Number.isFinite) && s.q.every(Number.isFinite) && Number.isFinite(s.facingCos));
            const speed = (s) => Math.hypot(s.vel[0], s.vel[1], s.vel[2]);

            return {
                booted: true,
                initialTick: initial.tick, midTick: mid.tick,
                fleetSize: initial.fleet.length,
                initial0: initial.fleet[0], mid0: mid.fleet[0],
                initialTurner: initial.fleet[2], midTurner: mid.fleet[2],   // fleet[2] is the earliest-phased aircraft -- see the wait-budget comment above
                initialSpeed0: speed(initial.fleet[0]), midSpeed0: speed(mid.fleet[0]),
                allFiniteInitial: allFinite(initial), allFiniteMid: allFinite(mid),
                afterResetTick: afterReset.tick, afterReset0Pos: afterReset.fleet[0].pos,
                afterResetRunningTick: afterResetRunning.tick, allFiniteAfterReset: allFinite(afterResetRunning),
            };
        }`,
    });

    ok("the harness booted es-aircraft.html and found window.__aircraftDemo", run.ok && run.result && run.result.booted,
        run.ok ? (run.result ? "" : "no result") : String(run.reason || JSON.stringify(run)).slice(0, 300));
    if (run.pageErrors && run.pageErrors.length) report("page console errors", run.pageErrors.slice(0, 5).join(" | ").slice(0, 400));
    ok("!! no page errors were logged during the whole run", !run.pageErrors || run.pageErrors.length === 0, (run.pageErrors || []).join(" | ").slice(0, 300));

    if (run.ok && run.result && run.result.booted) {
        const r = run.result;
        report("initial tick / after real flight time", `${r.initialTick} -> ${r.midTick}`);
        report("lead aircraft speed initial / after flight", `${r.initialSpeed0.toFixed(3)} -> ${r.midSpeed0.toFixed(3)} m/s`);

        ok("!! the fleet spawns at the configured size (3 aircraft)", r.fleetSize === 3, `${r.fleetSize}`);
        ok("!! the tick counter actually advances -- the flight loop is really running, not stalled", r.midTick > r.initialTick + 30, `${r.initialTick} -> ${r.midTick}`);
        // NOT proof of aerodynamics specifically -- constant thrust plus the initial cruise velocity alone would
        // move the craft even with zero aerodynamic force; a frozen sim is what this actually rules out. The
        // orientation and speed-decline checks below are what actually exercise the aerodynamic force path.
        ok("!! aircraft #0's position actually changed -- real rigidBody6dof state is really advancing, not a static scene", JSON.stringify(r.initial0.pos) !== JSON.stringify(r.mid0.pos), `${JSON.stringify(r.initial0.pos)} -> ${JSON.stringify(r.mid0.pos)}`);
        ok("!! aircraft #2 (the earliest-phased, whose own first scheduled heading switch falls within this window) actually changed orientation -- the autopilot's control surfaces are really turning it", JSON.stringify(r.initialTurner.q) !== JSON.stringify(r.midTurner.q), `heading#${r.initialTurner.headingIdx} -> heading#${r.midTurner.headingIdx}`);
        ok("!! aircraft #0's speed stays in a sane cruise range (no stall, no runaway)", r.midSpeed0 > 15 && r.midSpeed0 < 60, `${r.midSpeed0.toFixed(2)} m/s`);
        // measured on the real page: with the page's own ENGINE_THRUST, speed is flat-to-slightly-RISING over
        // this window (drag roughly balanced, cruise still settling upward) -- a meaningful DECLINE within the
        // same window is what a missing/zeroed engine looks like (measured directly: ~1 m/s over ~12s), so this
        // catches that with real margin rather than relying on the much looser sane-range check above alone.
        ok("!! aircraft #0's speed does not meaningfully decline -- the page-level engine is really countering drag", r.midSpeed0 > r.initialSpeed0 - 0.3, `${r.initialSpeed0.toFixed(3)} -> ${r.midSpeed0.toFixed(3)} m/s`);
        ok("!! every aircraft's position/velocity/orientation/facingCos stays finite -- no NaN/Infinity, initial state", r.allFiniteInitial);
        ok("!! ...and after real flight time", r.allFiniteMid);

        ok("!! Reset button (newPatrol()) actually resets the tick counter", r.afterResetTick < r.midTick, `tick was ${r.midTick}, reads ${r.afterResetTick} right after reset`);
        ok("!! ...and respawns aircraft #0 back near the origin", Math.hypot(r.afterReset0Pos[0], r.afterReset0Pos[1], r.afterReset0Pos[2]) < 200, `pos=${JSON.stringify(r.afterReset0Pos)}`);
        ok("!! ...and the RESET flight keeps running afterward (tick advances again post-reset)", r.afterResetRunningTick > r.afterResetTick, `${r.afterResetTick} -> ${r.afterResetRunningTick}`);
        ok("!! ...and stays numerically sane after a reset too", r.allFiniteAfterReset);
    }
}

console.log(fails ? `\naircraftPage-selfcheck: ${fails} FAILED` : "\naircraftPage-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
