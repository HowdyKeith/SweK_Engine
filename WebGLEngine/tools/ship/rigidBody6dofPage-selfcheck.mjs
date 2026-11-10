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
// 2026-11-02 -- THE PAGE'S DEFAULT IS THE CLOSE-QUARTERS PILOT, so this gate chooses the PD autopilot explicitly and says so in a row. Sabotaged with the byte-safe runner: the explicit choice removed,
// 1 red (the measured-under-the-PD-autopilot row: the lineup it measured was the close-quarters pilot's).
// 2026-11-04 -- THE READ WAITS FOR TICKS, NOT FOR THE CLOCK (Keith's item 5 of five). Under a loaded sweep the position row went red alone -- A#0's
// position the same at both ends, every other row green, the tick row included -- and the gate was green alone. The page's own stepper
// says how: in 2 of 200 seeds (4 and 148) ship A#0 turns from tick 2 and holds its place until tick 37 or 47, and a 90 s ceiling on a
// slow page could end the read inside that span. The ceiling no longer decides when to read: the read waits for the battle's end, or 150
// ticks with hit points down, and the clock only says whether the page has STOPPED (no new tick in 30 s; 600 s in all is the last guard;
// the harness allows 900 s). Two rows hold it: where the battle was read, and the misreading reproduced through runBattles(). Sabotaged
// with the byte-safe runner, every one red by name: R1 the read cut by the clock again, half a second in 3 | R2 the page's tick stopped
// (es-box3d-6dof.html's tick++ made void 0) 9, the read row saying 'STOPPED: no new tick in 30 s, at tick 0' | R3 the reproduction steps
// seed 1, whose ship moves at once 1 | R4 it reads ship B#0 1 | R5 the shortest battle said to be 45 ticks 1.
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
        engineRoot: ENG, timeoutMs: 900000,   // 2026-11-04: the fight is read by its ticks (see below), so the script may take as long as a loaded page needs to make them
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
            // 2026-11-02 -- the page's DEFAULT is the close-quarters pilot since Keith's call on brain/SIXDOF_PAGE_FIGHT_WIP.md's ranking. This gate measures what it always measured -- the page's physics and
            // its balance UNDER THE PD AUTOPILOT -- so it chooses the autopilot explicitly, before the first battle, and records the lineup it measured under
            win.__sixdof.roster.setSpecs({ A: "scripted", B: "scripted" });
            win.__sixdof.newBattle();
            const initial = win.__sixdof.state();
            let mid = initial, battleEnded = false, endWins = initial.wins, finiteThroughout = allFinite(initial), samples = 1;
            globalThis.__swekStep = "letting the fight run";
            // 2026-11-04 -- THE READ WAITS FOR TICKS, NOT FOR THE CLOCK. Until today a 90 s ceiling could end the read mid-battle, and under a
            // loaded sweep it did: ship A#0's position read the same at both ends while every other row passed, the tick row included (more than
            // 30 ticks in). The page's own stepper says how: in 2 of 200 seeds (4 and 148) A#0 turns from tick 2 and does not move until tick 37
            // or 47 -- a read inside that span calls a live ship static -- and a battle lasts 84 ticks or more, so a read at its end never is
            // (measured, and held by a row below). So the clock no longer decides when to read. What it still decides is whether the page has
            // STOPPED: no new tick in 30 s ends the read and is said so, by name, in its own row; 600 s in all is the last guard.
            const fightT0 = performance.now();
            let lastTick = initial.tick, lastTickAt = fightT0, stopped = null;
            while (true) {
                await wait(20);
                const st = win.__sixdof.state(); samples++;
                if (st.tick < mid.tick || st.wins.A !== mid.wins.A || st.wins.B !== mid.wins.B || st.wins.draws !== mid.wins.draws) { battleEnded = true; endWins = st.wins; break; }
                if (!allFinite(st)) finiteThroughout = false;
                mid = st;
                globalThis.__swekStep = "fight tick " + st.tick;
                if (st.tick >= initial.tick + 150 && hpSum(st) < hpSum(initial)) break;
                const now = performance.now();
                if (st.tick !== lastTick) { lastTick = st.tick; lastTickAt = now; }
                else if (now - lastTickAt > 30000) { stopped = "no new tick in 30 s, at tick " + st.tick; break; }
                if (now - fightT0 > 600000) { stopped = "600 s in all, at tick " + st.tick; break; }
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

            // v4895: THE BALANCE, measured the way the page re-tuned it -- 120 battles run headless from seed 1 (no drawing), after everything above has been read
            const w0 = win.__sixdof.state().wins, rb = win.__sixdof.runBattles(120, 1, 4000), w1 = win.__sixdof.state().wins, tk = rb.map((x) => x.ticks).sort((a, b) => a - b);
            const bal = { A: rb.filter((x) => x.w === "A").length, B: rb.filter((x) => x.w === "B").length, draw: rb.filter((x) => x.w === "draw").length, timeout: rb.filter((x) => x.timeout).length, counted: [w1.A - w0.A, w1.B - w0.B, w1.draws - w0.draws, w1.timeouts - w0.timeouts], medianTicks: tk[tk.length >> 1], n: rb.length };
            const lineupMeasured = [win.__sixdof.roster.lineup.A && win.__sixdof.roster.lineup.A.id, win.__sixdof.roster.lineup.B && win.__sixdof.roster.lineup.B.id];
            // 2026-11-04: the misreading the position row used to make, through the page's own headless stepper -- runBattles(1, seed, k) leaves
            // the battle at tick k + 1 -- for the two seeds of 200 whose ship A#0 turns before it moves
            const turnFirst = [4, 148].map((seed) => {
                const S = win.__sixdof, at = (k) => { S.runBattles(1, seed, k); const st = S.state(); return { tick: st.tick, pos: JSON.stringify(st.A[0].pos), q: JSON.stringify(st.A[0].q) }; };
                const first = at(-1); let movedAt = null, turnedAt = null;
                for (let k = 0; k <= 80 && (movedAt === null || turnedAt === null); k++) { const x = at(k); if (movedAt === null && x.pos !== first.pos) movedAt = x.tick; if (turnedAt === null && x.q !== first.q) turnedAt = x.tick; }
                return { seed, firstTick: first.tick, movedAt, turnedAt };
            });
            win.__sixdof.roster.setSpecs({ A: "auto", B: "auto" });   // the page's own default again, as a fresh page finds it
            return {
                booted: true, bal, lineupMeasured, turnFirst, stopped, shortestBattle: tk[0],
                initialTick: initial.tick, midTick: mid.tick,
                initialA0: initial.A[0], midA0: mid.A[0],
                initialHpSum: hpSum(initial), midHpSum: hpSum(mid),
                midShots: mid.shots, battleEnded, samples, fightMs, winsBefore: initial.wins, winsAfter: endWins,
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
        ok("!! the page's physics and balance below are measured under the PD AUTOPILOT, chosen explicitly: the page's default has been the close-quarters pilot since 2026-11-02, and this gate measures what it always measured",
            JSON.stringify(run.result.lineupMeasured) === JSON.stringify(["scripted", "scripted"]), JSON.stringify(run.result.lineupMeasured));
        const r = run.result;
        report("initial tick / last tick of that battle", `${r.initialTick} -> ${r.midTick}   (${r.battleEnded ? "the battle ended" : "no end seen"}, ${r.samples} samples in ${r.fightMs} ms)`);
        report("hp sum (600 max) initial / last sample", `${r.initialHpSum} -> ${r.midHpSum}`);
        report("shots outstanding at the last sample", r.midShots);

        ok("!! fleets spawn at the configured size (3 per side)", r.fleetSizesOk);
        ok("!! the tick counter actually advances -- the physics loop is really running, not stalled", r.midTick > r.initialTick + 30, `${r.initialTick} -> ${r.midTick}`);
        ok("!! *** the battle was read where this gate means to read it -- at its own end, or 150 ticks in with hit points down -- and never where a clock ran out: a page that stops is said to have stopped, here, by name ***",
            !r.stopped && (r.battleEnded || (r.midTick >= r.initialTick + 150 && r.midHpSum < r.initialHpSum)), r.stopped ? `STOPPED: ${r.stopped} (${r.samples} samples in ${r.fightMs} ms)` : `${r.battleEnded ? "at the battle's end" : "150 ticks in, hp down"}, tick ${r.midTick}, ${r.fightMs} ms`);
        {   // 2026-11-04: why the read waits for ticks -- the misreading it used to make, reproduced through the page's own stepper
            const tf = r.turnFirst || [];
            ok("!! *** THE MISREADING THE POSITION ROW USED TO MAKE, REPRODUCED: in seeds 4 and 148 ship A#0 turns from tick 2 and holds its place for 20 ticks or more -- a read inside that span calls a live ship static -- and every battle of the 120 below lasts longer than that span, so a read at a battle's end does not ***",
                tf.length === 2 && tf.every((x) => x.firstTick === 1 && x.turnedAt === 2 && x.movedAt !== null && x.movedAt - x.turnedAt >= 20 && x.movedAt < r.shortestBattle), `${tf.map((x) => `seed ${x.seed}: turned at ${x.turnedAt}, moved at ${x.movedAt}`).join("; ")}; the shortest battle ${r.shortestBattle} ticks`);
        }
        ok("!! ship A#0's position actually changed -- real force/torque is moving real rigidBody6dof state, not a static scene", JSON.stringify(r.initialA0.pos) !== JSON.stringify(r.midA0.pos), `${JSON.stringify(r.initialA0.pos)} -> ${JSON.stringify(r.midA0.pos)}`);
        ok("!! ship A#0's orientation actually changed -- the autopilot's torque is really turning the ship", JSON.stringify(r.initialA0.q) !== JSON.stringify(r.midA0.q));
        ok("!! total fleet hp is <= its starting value -- combat (weapon hits and/or ram damage) is doing something, never healing", r.midHpSum <= r.initialHpSum, `${r.initialHpSum} -> ${r.midHpSum}`);
        ok("!! total fleet hp actually DROPPED over one real battle (not merely non-increasing)", r.midHpSum < r.initialHpSum, `${r.initialHpSum} -> ${r.midHpSum}`);
        ok("!! every ship's position/velocity/orientation stays finite -- no NaN/Infinity blowup, initial state", r.allFiniteInitial);
        ok("!! ...and at every 20 ms sample of that battle", r.allFiniteMid);

        {   // v4895: every battle that ENDS is counted -- as an A win, a B win or a draw. Since the one-to-one target assignment (bbb5bb3e) every battle ends with both fleets dead, which the page counted for neither side ("battles A:0 B:0" for ever)
            const tot = (w) => w.A + w.B + w.draws;
            ok("!! *** a battle that ended was COUNTED: A wins + B wins + draws went up by exactly one (a mutual kill is a draw, not a nothing) ***", !r.battleEnded || tot(r.winsAfter) === tot(r.winsBefore) + 1, `${JSON.stringify(r.winsBefore)} -> ${JSON.stringify(r.winsAfter)} (${r.battleEnded ? "the battle ended" : "no end seen in the window"})`);
            report("battles counted on this run (A / B / draws)", `${r.winsAfter.A} / ${r.winsAfter.B} / ${r.winsAfter.draws}`);
        }
        {   // v4895: the balance the page was re-tuned to (nextRounds: sixdof-page-every-battle-a-draw). 120 headless battles: a draw was 100% of them before; now the winner is decided, neither side owns it, and a fight lasts
            const b = r.bal, decided = b.A + b.B;
            report("120 headless battles (A / B / draws / undecided at 30 s)", `${b.A} / ${b.B} / ${b.draw} / ${b.timeout}   median ${(b.medianTicks / 30).toFixed(1)} s`);
            ok("!! *** every one of those 120 battles was COUNTED by the page itself (wins.A / wins.B / wins.draws rose by exactly the tally, and each timeout is counted as one) ***", b.counted[0] === b.A && b.counted[1] === b.B && b.counted[2] === b.draw && b.counted[3] === b.timeout, `counted ${b.counted.join(" / ")} against ${b.A} / ${b.B} / ${b.draw} / ${b.timeout}`);
            ok("!! *** the paired fight is DECIDED: a winner in at least 85% of 120 battles (it was a mutual kill in 22 of 22 before the first shot was staggered) ***", decided >= 0.85 * b.n, `${decided} of ${b.n}`);
            ok("!! ...neither side owns it: each fleet wins at least 35% of the decided battles (a coin: ~50% +- 9 at this n)", b.A >= 0.35 * decided && b.B >= 0.35 * decided, `A ${b.A}, B ${b.B}`);
            ok("!! ...draws (a mutual kill or equal hp at the 30 s timeout) are under 16%, and under a third of battles run out the clock", b.draw < 0.16 * b.n && b.timeout < 0.33 * b.n, `draws ${b.draw}, undecided at the timeout ${b.timeout}`);
            ok("!! ...and a battle is a fight: the median is over 2 simulated seconds and under the timeout (damage and standoff stay at the pilots' own 18 and 50: re-tuning them needs the pilot retrained, see the page)", b.medianTicks > 60 && b.medianTicks < 900, `${(b.medianTicks / 30).toFixed(1)} s`);
        }
        ok("!! Reset button (newBattle()) actually resets the tick counter", r.afterResetTick < r.midTick, `tick was ${r.midTick}, reads ${r.afterResetTick} right after reset`);
        ok("!! ...and restores full fleet hp (600 = 2 x 3 ships x 100 hp)", r.afterResetHpSum === 600, `${r.afterResetHpSum}`);
        ok("!! ...and the RESET fight keeps running afterward (tick advances again post-reset)", r.afterResetRunningTick > r.afterResetTick, `${r.afterResetTick} -> ${r.afterResetRunningTick}`);
        ok("!! ...and stays numerically sane after a reset too", r.allFiniteAfterReset);
    }
}

console.log(fails ? `\nrigidBody6dofPage-selfcheck: ${fails} FAILED` : "\nrigidBody6dofPage-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
