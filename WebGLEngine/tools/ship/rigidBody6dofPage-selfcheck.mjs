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
//
// ROUND 21 -- RED SINCE bbb5bb3e, AND THE PAGE WAS NOT STALLED. The gate read a 150-tick window by its two ends
// and reported "5 -> 32, the loop stalled" and "600 -> 600, no hp lost" (65 s). Measured in the same browser: 60
// frames a second, 0.7 ms a frame, and 17 battles in 30 s, each 83..119 ticks long -- frame() calls newBattle()
// the tick a side is wiped out, and newBattle() sets tick = 0 and full hp, so the window's far end was a FRESH
// battle. Bisected: at 2404bf7f no battle ended in 1,802 ticks; from bbb5bb3e (fleetAssign's one-to-one pairing)
// every battle is a mutual duel ending with BOTH fleets dead -- 36 shot hits, 648 hp, no ram damage, every one a
// draw, which wins{} counts for neither side (filed: sixdof-page-every-battle-a-draw). The window is now sampled
// every 100 ms and summed across the page's own resets (8 s, green).
// Sabotages on the real page, restored and md5 verified -- 5 of 5 red:
//   A  `tick++` removed            4 red (0 ticks summed; hp; both reset rows). Its first run hung the harness:
//      the new wait for "10 ticks into a battle" had no ceiling; it has one (10 s), and A was re-run alone.
//   B  shot damage never applied   1 red (600 -> 600 at its lowest)
//   C  newBattle() keeps the tick  1 red (155 -> 155)
//   D  spawned at HP_MAX - 10      1 red (540)
//   E  RB.step() not applied       3 red (position, orientation, hp)
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
            //
            // *** ROUND 21: THE FIGHT IS READ ACROSS THE PAGE'S OWN RESETS. *** frame() calls newBattle() the tick
            // one side is wiped out, and newBattle() sets tick = 0 and respawns at full hp. Since bbb5bb3e
            // (fleetAssign's one-to-one pairing) every battle ends in 83..119 ticks, so a window of 150 ticks read
            // by its two ends compared a FRESH battle's tick and hp against the first one's: "5 -> 32, the loop
            // stalled" and "600 -> 600, no hp lost", on a loop measured at 60 frames a second, 0.7 ms a frame,
            // that had just finished several battles. Sampled every 100 ms (about 6 ticks), a reset is seen as the
            // tick going DOWN: ticks are summed across it, hp is taken at its lowest within a battle, and the
            // first battle's last sample is what the motion rows compare against its first.
            globalThis.__swekStep = "letting the fight run";
            const hpSum = (st) => st.A.concat(st.B).reduce((s, x) => s + x.hp, 0);
            const fightT0 = performance.now(), wins0 = initial.wins;
            let prev = initial, ticks = 0, ended = 0, minHp = hpSum(initial), firstLast = initial, inFirst = true;
            while (performance.now() - fightT0 < 60000 && ticks < 150) {
                globalThis.__swekStep = "fight tick " + prev.tick + ", " + ticks + " summed";
                await wait(100);
                const st = win.__sixdof.state();
                if (st.tick < prev.tick) { ended++; inFirst = false; ticks += st.tick; }
                else { ticks += st.tick - prev.tick; if (inFirst) firstLast = st; }
                minHp = Math.min(minHp, hpSum(st));
                prev = st;
            }
            const mid = prev, winsMid = mid.wins;

            // reset and confirm the tick counter and hp actually reset -- read IMMEDIATELY, before the running
            // requestAnimationFrame loop gets a chance to land a shot in an unusually fast opening exchange
            // (measured: waiting even 300ms here let 2 shots land and hp already read 564, not 600 -- a test
            // timing bug, not a page bug). Round 21: pressed only once the battle running is 10 ticks in, so
            // "reset to 0" is never read off a battle the page had just reset itself.
            const t1 = performance.now();
            while (performance.now() - t1 < 10000 && win.__sixdof.state().tick < 10) await wait(20);
            const beforeReset = win.__sixdof.state();
            win.__sixdof.newBattle();
            const afterReset = win.__sixdof.state();

            // the reset fight running afterward, summed across any reset of its own
            let p2 = afterReset, ticksAfter = 0;
            const t2 = performance.now();
            while (performance.now() - t2 < 4000) {
                await wait(100);
                const st = win.__sixdof.state();
                ticksAfter += st.tick < p2.tick ? st.tick : st.tick - p2.tick;
                p2 = st;
            }
            const afterResetRunning = p2;

            const allFinite = (st) => st.A.concat(st.B).every((s) =>
                s.pos.every(Number.isFinite) && s.vel.every(Number.isFinite) && s.q.every(Number.isFinite));

            return {
                booted: true,
                initialTick: initial.tick, ticks, ended, midTick: mid.tick,
                draws: ended - ((winsMid.A - wins0.A) + (winsMid.B - wins0.B)), winsA: winsMid.A - wins0.A, winsB: winsMid.B - wins0.B,
                initialA0: initial.A[0], midA0: firstLast.A[0],
                initialHpSum: hpSum(initial), minHpSum: minHp,
                midShots: mid.shots,
                allFiniteInitial: allFinite(initial), allFiniteMid: allFinite(mid) && allFinite(firstLast),
                beforeResetTick: beforeReset.tick,
                afterResetTick: afterReset.tick, afterResetHpSum: hpSum(afterReset),
                ticksAfterReset: ticksAfter, allFiniteAfterReset: allFinite(afterResetRunning),
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
        report("ticks run in the fight window, summed across the page's own resets", `${r.ticks} (from tick ${r.initialTick}; ${r.ended} battle(s) ended, the last at tick ${r.midTick} now)`);
        report("battles ended in the window: A won / B won / both fleets dead (a draw, counted by neither)", `${r.winsA} / ${r.winsB} / ${r.draws}`);
        report("hp sum (600 max) initial / lowest within a battle", `${r.initialHpSum} -> ${r.minHpSum}`);
        report("shots outstanding after 6s", r.midShots);

        ok("!! fleets spawn at the configured size (3 per side)", r.fleetSizesOk);
        ok("!! the tick counter actually advances -- the physics loop is really running, not stalled", r.ticks > 30, `${r.ticks} ticks summed across ${r.ended} reset(s)`);
        ok("!! ship A#0's position actually changed -- real force/torque is moving real rigidBody6dof state, not a static scene", JSON.stringify(r.initialA0.pos) !== JSON.stringify(r.midA0.pos), `${JSON.stringify(r.initialA0.pos)} -> ${JSON.stringify(r.midA0.pos)}`);
        ok("!! ship A#0's orientation actually changed -- the autopilot's torque is really turning the ship", JSON.stringify(r.initialA0.q) !== JSON.stringify(r.midA0.q));
        ok("!! total fleet hp is <= its starting value -- combat (weapon hits and/or ram damage) is doing something, never healing", r.minHpSum <= r.initialHpSum, `${r.initialHpSum} -> ${r.minHpSum}`);
        ok("!! total fleet hp actually DROPPED within a battle of a real fight (not merely non-increasing)", r.minHpSum < r.initialHpSum, `${r.initialHpSum} -> ${r.minHpSum} at its lowest`);
        ok("!! every ship's position/velocity/orientation stays finite -- no NaN/Infinity blowup, initial state", r.allFiniteInitial);
        ok("!! ...and after 6s of real combat", r.allFiniteMid);

        ok("!! Reset button (newBattle()) actually resets the tick counter", r.afterResetTick === 0 && r.beforeResetTick >= 10, `tick was ${r.beforeResetTick}, reads ${r.afterResetTick} right after reset`);
        ok("!! ...and restores full fleet hp (600 = 2 x 3 ships x 100 hp)", r.afterResetHpSum === 600, `${r.afterResetHpSum}`);
        ok("!! ...and the RESET fight keeps running afterward (tick advances again post-reset)", r.ticksAfterReset > 30, `${r.ticksAfterReset} ticks in 4 s after it`);
        ok("!! ...and stays numerically sane after a reset too", r.allFiniteAfterReset);
    }
}

console.log(fails ? `\nrigidBody6dofPage-selfcheck: ${fails} FAILED` : "\nrigidBody6dofPage-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
