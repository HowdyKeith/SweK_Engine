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
//   (A and B were run against the window as it stood before v4778: a fixed 60 s ceiling, see below.)
//
// *** v4778 -- IT FAILED 3 RUNS IN 7 ALONE, AND THE CAUSE WAS THE WINDOW, NOT THE FRAME RATE. *** The fight window
// waited for "tick >= initial + 150" under a 60 s ceiling. Since brain/fleetAssign.mjs (bbb5bb3e) gave every ship
// its own opposite number, a battle on this page is a synchronous exchange that wipes BOTH fleets in 84-119 ticks
// -- measured in Node through the page's own modules, eight seeds, every one a tie from shot damage alone, zero
// contacts; the same eight with the old nearestEnemy() selection ran five to the 3000-tick cap -- and the page
// then calls newBattle() itself, tick back to 0, hp back to 600. So the 150 could never be reached inside one
// battle: every run rode the whole 60 s ceiling (which was the gate's entire 65 s cost) and read whatever battle
// was on at that instant, and a battle a few ticks old reads "11 -> 17" and "600 -> 600". The window is now ONE
// battle the gate starts itself and follows to its end, polled every 20 ms; see the script. Seven runs alone after
// it, all exit 0, battles of 85-115 ticks, 3225-3700 ms each. Re-sabotaged against the new window, page restored
// and compared byte-identical each time:
//   C  `tick++` replaced with `void 0` -- 3 red by name: the tick-advances check (0 -> 0) and the first and third
//      reset checks (0 -> 0); the window rode its 90 s backstop, the run took 151 s.
//   D  BOTH damage paths stopped (stepWeapons() no longer subtracts SHOT_DAMAGE, resolveCollisions() no longer
//      subtracts the ram dmg) -- 1 red: the hp-dropped check (600 -> 600, 5378 ticks, no battle end). Shot damage
//      ALONE removed stayed GREEN on its run: ram damage still took hp 600 -> 510, which that row's own wording
//      ("weapon hits and/or ram damage") accepts -- B above isolated the weapon only on a seed that never collided.
//   E  (the review of that fix) `tick = 0` dropped from newBattle() -- 1 red: the first reset check (154 -> 154,
//      4.2 s). The window then crossed into the page's own next battle without seeing an end (3 -> 154, hp 600 ->
//      564), so "mid is from the same battle" rests on the page resetting its tick, and that is what this row reads.
// The old window's comment carried the rtx line's reading "56 ticks -- 1.9 SIMULATED seconds at dt=1/30 -- in 6
// real seconds here", which tools/ship/aircraftPage-selfcheck.mjs still cites as headless running below real time.
// It is kept as that host's reading; this box does not reproduce it: three runs alone at the review, battles of
// 93-109 ticks in 1556-1884 ms, about 57-60 ticks per real second.
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
            const hpSum = (st) => st.A.concat(st.B).reduce((s, x) => s + x.hp, 0);
            const allFinite = (st) => st.A.concat(st.B).every((s) =>
                s.pos.every(Number.isFinite) && s.vel.every(Number.isFinite) && s.q.every(Number.isFinite));

            // v4778: the fight window is ONE BATTLE, started here and followed to its own end. The page calls
            // newBattle() itself the frame after either fleet is wiped (tick back to 0, hp back to 600), and since
            // brain/fleetAssign.mjs gave every ship its own opposite number, each battle is a synchronous exchange
            // that wipes both fleets in 84-119 ticks (measured, eight seeds in Node through the page's own modules;
            // the browser agreed, a reset every ~1-2 s at ~60 ticks/s). The old window -- "wait until tick reaches
            // initial + 150, 60 s ceiling" -- could never be met inside one battle, so it always rode the ceiling
            // and read whatever battle happened to be on at that instant: 3 runs in 7 caught one a few ticks old,
            // hp still 600. So: start a fresh battle at a known tick, poll it every 20 ms, and stop when it ENDS
            // (the tick went backwards or a win was scored -- only the page's own reset does either; hp going UP
            // is deliberately NOT read as an end, so the never-healing row below still sees a heal) or, for a
            // longer battle, once it is 150 ticks in with hp down. "mid" is always the last sample of the SAME
            // battle "initial" opened. The real-time ceiling is only a backstop for a stalled page.
            win.__sixdof.newBattle();
            const initial = win.__sixdof.state();
            let mid = initial, battleEnded = false, finiteThroughout = allFinite(initial), samples = 1;
            globalThis.__swekStep = "letting the fight run";
            const fightT0 = performance.now();
            while (performance.now() - fightT0 < 90000) {
                await wait(20);
                const st = win.__sixdof.state(); samples++;
                if (st.tick < mid.tick || st.wins.A !== mid.wins.A || st.wins.B !== mid.wins.B) { battleEnded = true; break; }
                if (!allFinite(st)) finiteThroughout = false;
                mid = st;
                globalThis.__swekStep = "fight tick " + st.tick;
                if (st.tick >= initial.tick + 150 && hpSum(st) < hpSum(initial)) break;
            }
            const fightMs = Math.round(performance.now() - fightT0);

            // reset and confirm the tick counter and hp actually reset -- read IMMEDIATELY, before the running
            // requestAnimationFrame loop gets a chance to land a shot in an unusually fast opening exchange
            // (measured: waiting even 300ms here let 2 shots land and hp already read 564, not 600 -- a test
            // timing bug, not a page bug).
            win.__sixdof.newBattle();
            const afterReset = win.__sixdof.state();

            // v4778: waits on the reset battle's own tick, not a fixed 4 s
            let afterResetRunning = afterReset;
            const resetT0 = performance.now();
            while (performance.now() - resetT0 < 30000 && afterResetRunning.tick <= afterReset.tick + 30) {
                await wait(50);
                afterResetRunning = win.__sixdof.state();
            }

            return {
                booted: true,
                initialTick: initial.tick, midTick: mid.tick,
                initialA0: initial.A[0], midA0: mid.A[0],
                initialHpSum: hpSum(initial), midHpSum: hpSum(mid),
                midShots: mid.shots, battleEnded, samples, fightMs,
                allFiniteInitial: allFinite(initial), allFiniteMid: finiteThroughout,
                afterResetTick: afterReset.tick, afterResetHpSum: hpSum(afterReset),
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
        report("initial tick / last tick of that battle", `${r.initialTick} -> ${r.midTick}   (${r.battleEnded ? "the battle ended" : "no end seen"}, ${r.samples} samples in ${r.fightMs} ms)`);
        report("hp sum (600 max) initial / last sample", `${r.initialHpSum} -> ${r.midHpSum}`);
        report("shots outstanding at the last sample", r.midShots);

        ok("!! fleets spawn at the configured size (3 per side)", r.fleetSizesOk);
        ok("!! the tick counter actually advances -- the physics loop is really running, not stalled", r.midTick > r.initialTick + 30, `${r.initialTick} -> ${r.midTick}`);
        ok("!! ship A#0's position actually changed -- real force/torque is moving real rigidBody6dof state, not a static scene", JSON.stringify(r.initialA0.pos) !== JSON.stringify(r.midA0.pos), `${JSON.stringify(r.initialA0.pos)} -> ${JSON.stringify(r.midA0.pos)}`);
        ok("!! ship A#0's orientation actually changed -- the autopilot's torque is really turning the ship", JSON.stringify(r.initialA0.q) !== JSON.stringify(r.midA0.q));
        ok("!! total fleet hp is <= its starting value -- combat (weapon hits and/or ram damage) is doing something, never healing", r.midHpSum <= r.initialHpSum, `${r.initialHpSum} -> ${r.midHpSum}`);
        ok("!! total fleet hp actually DROPPED over one real battle (not merely non-increasing)", r.midHpSum < r.initialHpSum, `${r.initialHpSum} -> ${r.midHpSum}`);
        ok("!! every ship's position/velocity/orientation stays finite -- no NaN/Infinity blowup, initial state", r.allFiniteInitial);
        ok("!! ...and at every 20 ms sample of that battle", r.allFiniteMid);

        ok("!! Reset button (newBattle()) actually resets the tick counter", r.afterResetTick < r.midTick, `tick was ${r.midTick}, reads ${r.afterResetTick} right after reset`);
        ok("!! ...and restores full fleet hp (600 = 2 x 3 ships x 100 hp)", r.afterResetHpSum === 600, `${r.afterResetHpSum}`);
        ok("!! ...and the RESET fight keeps running afterward (tick advances again post-reset)", r.afterResetRunningTick > r.afterResetTick, `${r.afterResetTick} -> ${r.afterResetRunningTick}`);
        ok("!! ...and stays numerically sane after a reset too", r.allFiniteAfterReset);
    }
}

console.log(fails ? `\nrigidBody6dofPage-selfcheck: ${fails} FAILED` : "\nrigidBody6dofPage-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
