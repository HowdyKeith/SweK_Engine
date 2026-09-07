#!/usr/bin/env node
// WebGLEngine/tools/ship/raceKnob-selfcheck.mjs -- v4527
//
// THE RACE AS A LAB SCENE: a driver is a knob, the proposer wants the fast one, and the key is a track it never saw.
// physics/raceKnob.mjs registers race-speed on the drive-policy instrument through physics/knobRegistry.mjs; the lab
// page carries a race scene with the speedGain param; the bridge's lab-scene-run route runs the proposer and STORES the
// accepted driver's replay, which lab-replay serves and race-brain.html plays back.
//
// Section 1, THE CONTRACT: registered with its knob, replay and ready; the triage row joined and registered; the page's
// race scene exposes the knob the row names; unready, the adjudicator refuses BY NAME and the score is -Infinity.
// Section 2, THE SCORE: the training-track metres, highest at 0.3, falling with the gain from 0.5 up -- and the fastest
// driver (0.15) loses metres to the grass, which is the first sign the score and the key will disagree.
// Section 3, THE ADJUDICATOR, TWO-SIDED BY NAME: refuses 0.15 and 0.3 for the asphalt, 2 for the clock, 4 and 8 for no
// lap; accepts 0.5, 0.8 and 1.2; every refusal names its seed and cause; a non-number is refused.
// Section 4, THROUGH THE REGISTRY: runProposer walks the score's order and accepts 0.5 at rank 2 behind two refusals;
// nothing is adopted at tier propose.
// Section 5, THE REPLAY: the record replays to its own fingerprint with no policy, a flipped input does not, the
// record names the driver by hash.
// Section 6, THE BRIDGE, DRIVEN FOR REAL: lab-replay is 404 by name before a run; lab-scene-run accepts 0.5, stores the
// record where SWEK_LAB_REPLAY_DIR points (the tree stays clean), and lab-replay serves the same fingerprint; the
// served record replays.
// Section 7, IN THE BROWSER: the lab page's race scene steps the car and says it is not real time; the stored record
// replays in the page's own wasm to node's fingerprint; race-brain's button says what it needs when no bridge answers.
//
// MEASURED AT THE ROUND (v4527, this box): 30 s scores on seed 1: 0.3 -> 275.4 m, 0.15 -> 264.3, 0.5 -> 263.1, 0.8 -> 226.9, 1.2 -> 176.8,
// 2 -> 123.5, 4 -> 69.8, 8 -> 38.7 (1.0 s for the eight); the eight adjudications (2 x 90 s each) in 5.6 s: 0.15 and 0.3 refused
// for seed 3's asphalt (0.15 also no lap there), 0.5 / 0.8 / 1.2 accepted with seed 2 laps 39.3 / 44.8 / 56.5 s, 2 refused at 80.3 s,
// 4 and 8 no lap; runProposer: tried 8, adjudicated 3, best 0.3 refused, accepted 0.5 at rank 2, 3.1 s; the record: seed 2, 90 s,
// 5400 ticks, fleet 0df0f92e, driver af2454c8, fingerprint b69eb211, 394,403 bytes in 0.5 s, replayed to b69eb211; the bridge
// route accepted 0.5 and stored the record in 3.6 s; the browser: the lab scene at 8 checkpoints after 6 s (11.9 s simulated), the
// record replayed in the page's wasm to b69eb211 in 324 ms. Whole gate 35 s.
//
// SABOTAGE (the round): A OFF_BOUND 1 (the asphalt ignored) -> 5 red (0.3 accepted at rank 0, and the record and the route carry
// the wrong knob); B LAP_BOUND 1000 -> 1 red (2 accepted); C replayRecord playing the log backwards -> 2 red (9da1cd28, the served
// record too); D the bridge storing no replay -> 3 red, ONE OF THEM A CRASH: the browser section read `.seed` off a record that was
// never served -- guarded now, it fails by name; E the score a constant -> 4 red (favourite 0.15, the greedy pick, the walk);
// F the page renaming the knob -> 1 red (and physics/labScenes-selfcheck's own row).
//
// Run: node tools/ship/raceKnob-selfcheck.mjs      (~40 s: the adjudicator is 2 x 90 s of box3d per candidate)
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import * as R from "../../physics/raceKnob.mjs";
import * as D from "../../brain/drivePolicy.mjs";
import * as P from "../../physics/proposers.mjs";
import * as K from "../../physics/knobRegistry.mjs";
import * as L from "../../physics/labScenes.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);
const timed = (f) => { const t0 = performance.now(); const r = f(); return { r, ms: performance.now() - t0 }; };

// ---------------------------------------------------------------------------------------------------------------------------------
sec("1. THE CONTRACT: registered, joined, on the page, and honest about the wasm it needs");
{
    ok("unready, the adjudicator refuses BY NAME and the score is -Infinity (a control that says why it cannot decide)",
        !R.isReady() && R.adjudicate(0.5).pass === false && /not initialised/.test(R.adjudicate(0.5).evidence.reason) && R.score(0.5) === -Infinity);
    P.resetRegistry(); K.registerAll();
    const p = P.getProposer("race-speed");
    ok("race-speed is registered on the drive-policy instrument with the speedGain knob, a replay and a ready()",
        !!p && p.instrument === "drive-policy" && p.knobs.join() === R.KNOB && typeof p.replay === "function" && typeof p.ready === "function" && p.tier === "propose");
    const row = L.joinRegistered(P.listProposers()).find((r) => r.scene === "race");
    ok("the triage row is a candidate, MEASURED, responds yes, and joins to race-speed", !!row && row.eligible === "candidate" && row.provenance === L.PROVENANCE.MEASURED && row.responds === "yes" && row.registered && row.proposerIds.join() === "race-speed" && row.knob === R.KNOB);
    const page = fs.readFileSync(path.join(ENG, "physics-lab.html"), "utf8"), body = page.slice(page.indexOf("const SCENES = {"));
    const m = /\n  race: \{[\s\S]*?params: \[([\s\S]*?)\],\n/.exec(body);
    ok("physics-lab.html's race scene exposes exactly the knob the row names, and says NOT REAL TIME", !!m && [...m[1].matchAll(/name: "([^"]+)"/g)].map((x) => x[1]).join() === R.KNOB && /NOT REAL TIME/.test(body.slice(m.index, m.index + 3000)));
    ok("the proposer offers both failure modes (below 0.5 and from 2 up) as well as the good band", R.propose().includes(0.15) && R.propose().includes(8) && R.propose().includes(0.5) && !R.propose({ current: 0.5 }).includes(0.5));
    const t0 = performance.now(); await R.ready();
    ok("ready() loads the vendored wasm once and is idempotent", R.isReady() && (await R.ready()) === true, `${(performance.now() - t0).toFixed(0)} ms`);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("2. THE SCORE: training-track metres, highest at a small gain, and the fastest driver already losing metres to the grass");
let scores = null;
{
    const { r, ms } = timed(() => R.CANDIDATES.map((g) => [g, R.score(g)]));
    scores = new Map(r);
    report(`30 s on seed ${R.SCORE_SEED}: ` + r.map(([g, m]) => `${g} -> ${m.toFixed(1)} m`).join(", ") + ` in ${ms.toFixed(0)} ms`);
    const best = r.slice().sort((a, b) => b[1] - a[1])[0][0];
    ok("*** the score's favourite is 0.3, and it falls monotonically with the gain from 0.5 up ***", best === 0.3 && [0.5, 0.8, 1.2, 2, 4, 8].every((g, i, a) => i === 0 || scores.get(g) < scores.get(a[i - 1])), `favourite ${best}`);
    ok("  the fastest driver (0.15) scores BELOW 0.3: it is already leaving the road on the training track", scores.get(0.15) < scores.get(0.3) && scores.get(0.15) > scores.get(0.8));
    ok("  a gain that is not a positive number scores -Infinity", R.score(-1) === -Infinity && R.score(NaN) === -Infinity && R.score("0.5") === -Infinity);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("3. THE ADJUDICATOR, TWO-SIDED BY NAME: the asphalt at the fast end, the clock at the slow end");
const verdicts = new Map();
{
    const t0 = performance.now();
    for (const g of R.CANDIDATES) verdicts.set(g, R.adjudicate(g));
    report(`8 candidates x 2 seeds x ${R.KEY_SECONDS} s in ${((performance.now() - t0) / 1000).toFixed(1)} s: ` + R.CANDIDATES.map((g) => `${g} ${verdicts.get(g).pass ? "PASS" : "refused"}`).join(", "));
    const v = (g) => verdicts.get(g);
    ok("*** 0.15 and 0.3 are refused for the asphalt on a track the score never saw (seed 3 named in the reason) ***", !v(0.15).pass && !v(0.3).pass && /seed 3: .*off the asphalt/.test(v(0.3).evidence.reason) && /off the asphalt/.test(v(0.15).evidence.reason), v(0.3).evidence.reason);
    ok("  and 0.15 also fails to lap seed 3 at all (it hits a building)", /seed 3: no lap/.test(v(0.15).evidence.reason));
    ok("*** 0.5, 0.8 and 1.2 are accepted: both tracks lapped inside the bounds ***", [0.5, 0.8, 1.2].every((g) => v(g).pass && v(g).evidence.runs.every((r) => r.laps >= 1 && r.lapTime <= R.LAP_BOUND && r.offFrac <= R.OFF_BOUND)));
    ok("*** 2 is refused for the CLOCK: seed 2's lap is over the 80 s bound by three tenths, and its wheels never left the road ***", !v(2).pass && /seed 2: lap 80\.[0-9] s over the 80 s bound/.test(v(2).evidence.reason) && v(2).evidence.runs.every((r) => r.off === 0), v(2).evidence.reason);
    ok("  4 and 8 are refused for no lap on either seed", [4, 8].every((g) => !v(g).pass && /seed 2: no lap/.test(v(g).evidence.reason) && /seed 3: no lap/.test(v(g).evidence.reason)));
    ok("  the lap times the accepted band earns are monotone in the gain on both seeds (the key MOVES with the knob)", [0.5, 0.8, 1.2].every((g, i, a) => i === 0 || v(g).evidence.runs.every((r, k) => r.lapTime > v(a[i - 1]).evidence.runs[k].lapTime)), [0.5, 0.8, 1.2].map((g) => v(g).evidence.runs.map((r) => r.lapTime.toFixed(1)).join("/")).join(", "));
    ok("  every verdict carries the evidence grantLicence re-checks: the seeds, a run per seed with a fingerprint, the bounds and the law", R.CANDIDATES.every((g) => { const e = v(g).evidence; return e.seedGain === undefined && e.speedGain === g && e.seeds.join() === R.KEY_SEEDS.join() && e.runs.length === 2 && e.runs.every((r) => /^[0-9a-f]{8}$/.test(r.fingerprint)) && e.lapBound === R.LAP_BOUND && e.offBound === R.OFF_BOUND && typeof e.law === "string"; }));
    ok("  a non-number and a non-positive gain are refused by name without running anything", !R.adjudicate("fast").pass && /finite and positive/.test(R.adjudicate("fast").evidence.reason) && !R.adjudicate(0).pass);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("4. THROUGH THE REGISTRY: runProposer walks the score's order and accepts the fastest driver the key will stand behind");
let run = null;
{
    const { r, ms } = timed(() => P.runProposer("race-speed"));
    run = r;
    report(`tried ${r.tried}, adjudicated ${r.adjudicated}, best ${r.best} (score ${r.bestScore.toFixed(1)}), accepted ${r.accepted} at rank ${r.acceptedRank} in ${ms.toFixed(0)} ms`);
    ok("*** the greedy pick is 0.3 and its verdict is a refusal; the accepted candidate is 0.5 at rank 2 ***", r.best === 0.3 && r.verdict.pass === false && r.accepted === 0.5 && r.acceptedRank === 2 && r.acceptedVerdict.pass === true);
    ok("  exactly three candidates were adjudicated (0.3, 0.15, 0.5) and the rest carry no verdict, which is not a refusal", r.adjudicated === 3 && r.scored.slice(0, 3).map((s) => s.candidate).join() === "0.3,0.15,0.5" && r.scored.slice(3).every((s) => s.verdict === undefined));
    ok("  nothing is adopted: the tier is propose and the static path was taken", r.adopted === false && r.tier === "propose" && r.searched === null);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("5. THE REPLAY: the accepted driver's race as a record that plays back without the driver");
let rec = null;
{
    const { r, ms } = timed(() => R.replay(run.accepted));
    rec = r;
    report(`record: seed ${rec.seed}, ${rec.seconds} s, ${rec.ticks} ticks, fleet ${rec.fleet}, driver ${rec.weightsHash}, fingerprint ${rec.fingerprint}, ${JSON.stringify(rec).length} bytes in ${ms.toFixed(0)} ms`);
    ok("the record is a swek-race-replay of the held-out seed with the accepted knob, the driver's hash and its weights, one input per tick", rec.kind === "swek-race-replay" && rec.scene === "race" && rec.knob[R.KNOB] === 0.5 && rec.seed === R.KEY_SEEDS[0] && rec.weightsHash === D.weightsHash(R.driverOf(0.5)) && rec.weights.length === D.WEIGHT_COUNT && rec.log.length === rec.ticks && rec.ticks === Math.round(rec.seconds * 60) && /NOT REAL TIME/.test(rec.note));
    const back = R.replayRecord(rec);
    ok("*** replayRecord runs the log with no policy and reaches the record's fingerprint and results ***", back.same && back.fingerprint === rec.fingerprint && JSON.stringify(back.results) === JSON.stringify(rec.results), back.fingerprint);
    const bad = JSON.parse(JSON.stringify(rec)); bad.log[1200][0].steer = -bad.log[1200][0].steer || 0.5;
    ok("  one flipped input at tick 1200 and the playback is a different fingerprint: the log is the race", !R.replayRecord(bad).same);
    let threw = null; try { R.replayRecord({ kind: "other" }); } catch (e) { threw = e.message; }
    ok("  a record that is not a replay is refused by name", /not a swek-race-replay/.test(threw || ""));
    ok("  the accepted driver laps the held-out track twice in the record", rec.results[0].laps >= 2 && rec.results[0].lapTime < R.LAP_BOUND);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("6. THE BRIDGE, DRIVEN FOR REAL: the route accepts, stores the replay where it is told to, and serves it back");
let served = null;
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swek-lab-replays-"));
    process.env.SWEK_LAB_REPLAY_DIR = dir;
    const bridge = await import("../../ai-bridge/fingerprintBridge.js").then((m) => m.default || m);
    const call = (url) => new Promise((resolve, reject) => {
        const req = { method: "GET", url }; let status = 200;
        const res = { writeHead: (code) => { status = code; }, end: (body) => { try { resolve({ status, body: JSON.parse(body) }); } catch (e) { reject(e); } } };
        if (!bridge.handle(req, res)) resolve({ status: 0, body: { ok: false, error: "not-owned" } });
    });
    const before = await call("/roundhouse/lab-replay?scene=race");
    ok("before any run, lab-replay is 404 BY NAME and says what to do", before.status === 404 && before.body.error === "no-replay" && /Initiate AI workers/.test(before.body.message));
    ok("  a scene name that is not a name is refused", (await call("/roundhouse/lab-replay?scene=..%2Fx")).body.error === "bad-scene");
    const t0 = performance.now(); const r = await call("/roundhouse/lab-scene-run?scene=race"); const ms = performance.now() - t0;
    const rr = r.body.runs && r.body.runs[0];
    report(`lab-scene-run: ${r.status}, accepted ${rr && rr.accepted} at rank ${rr && rr.acceptedRank}, replay ${rr && rr.replay && rr.replay.fingerprint} (${rr && rr.replay && rr.replay.bytes} bytes) in ${ms.toFixed(0)} ms`);
    ok("*** the route accepts 0.5, applies nothing, and STORES the accepted driver's replay in the directory it was pointed at ***", r.status === 200 && r.body.applied === false && rr && rr.accepted === 0.5 && rr.replay && !rr.replay.error && rr.replay.stored.startsWith(dir) && fs.existsSync(rr.replay.stored) && rr.replay.fingerprint === rec.fingerprint && rr.replay.ticks === rec.ticks);
    ok("  the tree carries no replay: the default store is git-ignored and this run wrote elsewhere", !fs.existsSync(path.join(ENG, "tools", "roundhouse", "lab-replays", "race.json")) && /lab-replays\//.test(fs.readFileSync(path.join(ENG, "..", ".gitignore"), "utf8")));
    served = await call("/roundhouse/lab-replay?scene=race");
    ok("*** lab-replay serves the stored record: the same fingerprint, and it replays here to that fingerprint ***", served.status === 200 && served.body.ok && served.body.replay.fingerprint === rec.fingerprint && R.replayRecord(served.body.replay).same && /NOT REAL TIME/.test(served.body.note));
    fs.rmSync(dir, { recursive: true, force: true }); delete process.env.SWEK_LAB_REPLAY_DIR;
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("7. IN THE BROWSER: the lab's race scene steps the car, the stored record replays in the page's wasm to node's fingerprint, and race-brain says what it needs");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    // sabotage D crashed this section (TypeError on a record that was never served) where it should fail by name
    else if (!served || !served.body || !served.body.ok || !served.body.replay) ok("the browser had a served record to replay", false, "lab-replay served nothing, so there is nothing to play back -- section 6 says why");
    else {
        const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 120000, args: { rec: served.body.replay }, script: `async (a) => {
            const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
            const f = document.createElement("iframe"); f.style.width = "1000px"; f.style.height = "700px"; f.src = "/physics-lab.html"; document.body.appendChild(f);
            await sleep(4000);
            const d = f.contentDocument, w = f.contentWindow, sel = d.getElementById("sceneSel");
            sel.value = "race"; sel.dispatchEvent(new w.Event("change")); await sleep(6000);
            const status = d.getElementById("status").textContent, params = d.getElementById("params").textContent;
            const D = await import("/brain/drivePolicy.mjs"); const { box3d } = await import("/physics/box3d/box3dLoader.js"); const { worldFromModule } = await import("/render/slugTicker.mjs");
            const st = await box3d.init(); if (!st.ready) return { error: "box3d: " + st.reason };
            const worldFrom = () => worldFromModule(box3d._mod, [0, -9.81, 0]);
            const t0 = performance.now(); const back = D.replay(worldFrom, { seed: a.rec.seed, seconds: a.rec.seconds, fleet: a.rec.fleet, log: a.rec.log, ticks: a.rec.ticks }); const replayMs = performance.now() - t0;
            const g = document.createElement("iframe"); g.style.width = "900px"; g.style.height = "600px"; g.src = "/race-brain.html"; document.body.appendChild(g);
            await sleep(7000); const gd = g.contentDocument; gd.getElementById("labReplay").click(); await sleep(1500);
            return { status, params, fingerprint: back.fingerprint, laps: back.results[0].laps, replayMs, lab: gd.getElementById("lab").textContent };
        }` });
        if (!r.ok) { ok("the browser ran the lab's race scene and the replay", false, r.reason || (r.pageErrors || []).join(" | ")); }
        else {
            const F = r.result;
            report(`lab status after 6 s: ${F.status}; replay in the page's wasm ${F.fingerprint} in ${(F.replayMs || 0).toFixed(0)} ms; race-brain: ${F.lab}`);
            ok("*** physics-lab.html's race scene steps the car through checkpoints and says it is not real time ***", /checkpoints ([1-9]|[1-9][0-9])/.test(F.status) && /not real time/.test(F.status) && /Speed gain/.test(F.params), F.status);
            ok("*** the stored record replays in the browser's box3d to node's fingerprint, with the same laps ***", F.fingerprint === rec.fingerprint && F.laps === rec.results[0].laps, `${F.fingerprint} vs ${rec.fingerprint}`);
            ok("  race-brain's replay button says what it needs when no bridge answers, rather than throwing", /bridge did not answer/.test(F.lab));
        }
        if (r.pageErrors && r.pageErrors.filter((e) => !/404/.test(e)).length) report("page errors: " + r.pageErrors.filter((e) => !/404/.test(e)).slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: the Initiate button pressed in a browser against a live bridge (the harness has no sidecar; the route is driven through handle() and the page's handler is lab-scene-run-selfcheck's); the trained brain as a candidate (the knob is the hand policy's gain, a trained policy has no single knob); a lab bound other than 80 s and 1% (the lab's, said so in the triage row's caution).");
process.exit(fails ? 1 : 0);
