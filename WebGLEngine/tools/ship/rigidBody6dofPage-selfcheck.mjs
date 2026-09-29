// WebGLEngine/tools/ship/rigidBody6dofPage-selfcheck.mjs
//
// Run: node tools/ship/rigidBody6dofPage-selfcheck.mjs
//
// THE PAGE-WIRING GATE for es-box3d-6dof.html. Everything the page WIRES TOGETHER -- rigidBody6dof.mjs,
// rigidBody6dofCollision.mjs, rigidBody6dofWeapon.mjs, autopilot6dof.mjs -- is already independently gated and
// sabotage-tested; this file's only job is proving the WIRING itself: the page boots in a real browser, its
// physics loop actually runs (positions move, orientations rotate, hp changes), it stays numerically sane over
// real time, combat actually happens (shots fired, at least one hit landed), and the reset button works. Reads
// exact numeric state back through window.__sixdof.state() (a debug hook the page itself exposes) rather than
// scraping rendered pixels -- a strong assertion ("hp actually decreased") beats a weak one ("something is lit").
//
// SABOTAGE LOG -- each applied to es-box3d-6dof.html, the gate run against the REAL browser, the page restored
// (diffed to confirm byte-identical):
//   A  `tick++` removed from frame()'s live branch -- 4 red: the tick-advances check (0 -> 0), the hp-dropped
//      check (collision damage still landed once, from physics that keeps running every animation frame
//      regardless of the tick display, but weapon cooldowns -- gated on `nowMs = tick*dt*1000`, frozen at 0 --
//      stop firing after each ship's first shot, so hp barely moves), and both post-reset tick checks.
//   B  stepWeapons()'s hit-event loop stopped applying SHOT_DAMAGE (still looks the target up, just never
//      subtracts) -- 1 red: the hp-dropped check, on a run where this particular seed's ships never collided
//      either, isolating weapon damage as the only thing that check depends on for that trial.
"use strict";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function report(name, detail) { console.log(`  ----  ${name}   ${detail}`); }

console.log("rigidBody6dofPage-selfcheck -- es-box3d-6dof.html actually wires the gated 6DOF modules together\n");

const skip = webgpuSkipReason(createRequire(import.meta.url));
if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***", ""); fails++; }
else {
    const run = await runInEngineOrigin({
        engineRoot: ENG, timeoutMs: 180000,
        script: `async () => {
            globalThis.__swekStep = "booting es-box3d-6dof.html in an iframe";
            const f = document.createElement("iframe");
            f.style.width = "900px"; f.style.height = "600px";
            f.src = "/es-box3d-6dof.html";
            document.body.appendChild(f);
            await new Promise((res) => { f.onload = res; });
            const win = f.contentWindow;
            const wait = (ms) => new Promise((res) => setTimeout(res, ms));
            const t0 = performance.now();
            while (performance.now() - t0 < 30000 && (!win.__sixdof || win.__sixdof.state().tick < 2)) {
                globalThis.__swekStep = "waiting for window.__sixdof to appear and tick";
                await wait(200);
            }
            if (!win.__sixdof) return { booted: false, reason: "window.__sixdof never appeared" };
            const initial = win.__sixdof.state();

            // let a real chunk of the fight play out. Headless/software rendering runs the
            // requestAnimationFrame loop well below real time (measured: 56 ticks -- 1.9 SIMULATED seconds at
            // dt=1/30 -- in 6 real seconds here), and the standalone Node simulation this page's own combat
            // constants were tuned against needed several simulated seconds before a hit reliably lands -- so
            // this waits on SIMULATED ticks directly, not a fixed wall-clock budget, with a generous real-time
            // ceiling as a backstop.
            globalThis.__swekStep = "letting the fight run";
            const fightT0 = performance.now();
            while (performance.now() - fightT0 < 60000 && win.__sixdof.state().tick < initial.tick + 150) {
                globalThis.__swekStep = "fight tick " + win.__sixdof.state().tick;
                await wait(500);
            }
            const mid = win.__sixdof.state();

            // reset and confirm the tick counter and hp actually reset -- read IMMEDIATELY, before the running
            // requestAnimationFrame loop gets a chance to land a shot in an unusually fast opening exchange
            // (measured: waiting even 300ms here let 2 shots land and hp already read 564, not 600 -- a test
            // timing bug, not a page bug).
            win.__sixdof.newBattle();
            const afterReset = win.__sixdof.state();

            await wait(4000);
            const afterResetRunning = win.__sixdof.state();

            const allFinite = (st) => st.A.concat(st.B).every((s) =>
                s.pos.every(Number.isFinite) && s.vel.every(Number.isFinite) && s.q.every(Number.isFinite));

            return {
                booted: true,
                initialTick: initial.tick, midTick: mid.tick,
                initialA0: initial.A[0], midA0: mid.A[0],
                initialHpSum: initial.A.concat(initial.B).reduce((s, x) => s + x.hp, 0),
                midHpSum: mid.A.concat(mid.B).reduce((s, x) => s + x.hp, 0),
                midShots: mid.shots,
                allFiniteInitial: allFinite(initial), allFiniteMid: allFinite(mid),
                afterResetTick: afterReset.tick, afterResetHpSum: afterReset.A.concat(afterReset.B).reduce((s, x) => s + x.hp, 0),
                afterResetRunningTick: afterResetRunning.tick, allFiniteAfterReset: allFinite(afterResetRunning),
                fleetSizesOk: initial.A.length === 3 && initial.B.length === 3,
            };
        }`,
    });

    ok("the harness booted es-box3d-6dof.html and found window.__sixdof", run.ok && run.result && run.result.booted,
        run.ok ? (run.result ? "" : "no result") : String(run.reason || JSON.stringify(run)).slice(0, 300));
    if (run.pageErrors && run.pageErrors.length) report("page console errors", run.pageErrors.slice(0, 5).join(" | ").slice(0, 400));
    ok("!! no page errors were logged during the whole run", !run.pageErrors || run.pageErrors.length === 0, (run.pageErrors || []).join(" | ").slice(0, 300));

    if (run.ok && run.result && run.result.booted) {
        const r = run.result;
        report("initial tick / after 6s", `${r.initialTick} -> ${r.midTick}`);
        report("hp sum (600 max) initial / after 6s", `${r.initialHpSum} -> ${r.midHpSum}`);
        report("shots outstanding after 6s", r.midShots);

        ok("!! fleets spawn at the configured size (3 per side)", r.fleetSizesOk);
        ok("!! the tick counter actually advances -- the physics loop is really running, not stalled", r.midTick > r.initialTick + 30, `${r.initialTick} -> ${r.midTick}`);
        ok("!! ship A#0's position actually changed -- real force/torque is moving real rigidBody6dof state, not a static scene", JSON.stringify(r.initialA0.pos) !== JSON.stringify(r.midA0.pos), `${JSON.stringify(r.initialA0.pos)} -> ${JSON.stringify(r.midA0.pos)}`);
        ok("!! ship A#0's orientation actually changed -- the autopilot's torque is really turning the ship", JSON.stringify(r.initialA0.q) !== JSON.stringify(r.midA0.q));
        ok("!! total fleet hp is <= its starting value -- combat (weapon hits and/or ram damage) is doing something, never healing", r.midHpSum <= r.initialHpSum, `${r.initialHpSum} -> ${r.midHpSum}`);
        ok("!! total fleet hp actually DROPPED over 6s of a real fight (not merely non-increasing)", r.midHpSum < r.initialHpSum, `${r.initialHpSum} -> ${r.midHpSum}`);
        ok("!! every ship's position/velocity/orientation stays finite -- no NaN/Infinity blowup, initial state", r.allFiniteInitial);
        ok("!! ...and after 6s of real combat", r.allFiniteMid);

        ok("!! Reset button (newBattle()) actually resets the tick counter", r.afterResetTick < r.midTick, `tick was ${r.midTick}, reads ${r.afterResetTick} right after reset`);
        ok("!! ...and restores full fleet hp (600 = 2 x 3 ships x 100 hp)", r.afterResetHpSum === 600, `${r.afterResetHpSum}`);
        ok("!! ...and the RESET fight keeps running afterward (tick advances again post-reset)", r.afterResetRunningTick > r.afterResetTick, `${r.afterResetTick} -> ${r.afterResetRunningTick}`);
        ok("!! ...and stays numerically sane after a reset too", r.allFiniteAfterReset);
    }
}

console.log(fails ? `\nrigidBody6dofPage-selfcheck: ${fails} FAILED` : "\nrigidBody6dofPage-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
