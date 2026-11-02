// WebGLEngine/tools/ship/sixdofPageFight-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/sixdofPageFight-selfcheck.mjs      (a browser; ~15 s)
//
// THE GATE OF tools/ship/sixdofPageFight.mjs (and its command, tools/ship/sixdofPageFightCmd.mjs): the five pilots in es-box3d-6dof.html's own fight, as brain/SIXDOF_PAGE_FIGHT_WIP.md registers it.
// *** NOTHING HERE EXECUTES THE COMMAND, AND SECTIONS 1-5 FLY NO REGISTERED BATTLE SEED. *** The miniature flies scratch battle seeds (990101-990102); the command's guards are held as the library functions they
// are, plus the order the command calls them in -- so no single sabotage of a guard can start the registered round (the GPU Brain round's gate once did, by running its command with the guard sabotaged away).
// Section 6 was written after the registered run's file was committed and read: it flies a sample of 12 registered battles again, to hold the file to the page's code. Those seeds are spent; flying them
// again chooses nothing.
//
//   1  THE REGISTRATION, AS CODE: the five pilots in their order, each brain held to its file's hash; the battle seeds fresh and apart from every block a page run had flown; the plan (every pair from both
//      sides on the same seeds, then the mirrors); the sign test against an exact BigInt reference at every split of 100; the readings at their edges; the duel's floor beside them
//   2  THE VERDICT'S ARITHMETIC ON PLANTED FILES: a pairing counted from both sides (x wins on A as side A and on B as side B), H1, H2 and H3 read as registered, a tie for first is not H3, the mirrors and
//      timeouts reported; C-determinism and C-pilots each able to fail
//   3  THE ROUND'S CONTROL FLOW, with a stub browser: C-pilots first, and when it fails nothing is flown on the battle seeds
//   4  THE ROUND ON A MINIATURE, in the page's own browser: all five pilots on two scratch seeds through the command's own script -- C-pilots holds, every matchup's lineup is the plan's, every battle a
//      legal row, C-determinism holds, the verdict reads the result, and the result says it did not use the registered seeds
//   5  THE COMMAND: it parses before it refuses, refuses before it runs, never overwrites, and prints no score
//   6  THE VERDICT, AS CODE, FROM THE COMMITTED FILE: the file is the registered run (every battle legal by the page's own rule); C-pilots and C-determinism held; a sample of 12 battles flown again is the
//      file's; H1 met, H2's four readings and H3 met by verdictOf(); the four predictions as the file decides them; the note's tables tied to the file
//
// SABOTAGE LOG (2026-11-02) -- each applied with the byte-safe runner, this gate run, the file restored byte-identical (sha256); the number is the rows that went red, by name:
//   F1 the plan from one side only 3 (the plan row, and sections 2 and 4 throwing: each section turns an exception into a named FAIL, so a crash is never read as 0 red) | F2 the sign test one-sided 2
//   F3 the level at 0.05 1 | F4 side B counted as side A 3 | F5 H1 met the other way 2 | F6 H3 not strict 1 | F7 C-pilots not enforced 1 | F8 C-pilots ignoring the fingerprints 1 | F9 C-determinism always ok 1
//   F10 the seeds over a used block 1 | F11 C-pilots echoing the asked id 1 | F12 a matchup echoing the plan's lineup 1 | F13 the command printing the result 1 | F14 the command never refusing 1
//   F15 parseArgs accepting anything 1
//   FOUND BEFORE THE SABOTAGES: (1) this gate's own BigInt reference for the sign test scaled by 10^18 and truncated every p under 1e-18 to zero, so the agreement row went red on a correct library; the
//   reference now shifts n + 64 bits first. (2) F11 and F12 would have gone 0 red against the first draft -- a page that flies what it is asked cannot tell an echo from a reading -- so the probe that asks
//   for a choice the page does not hold ('imported') was added before they were run; they went 1 red each.
// SABOTAGE LOG, SECTION 6 (2026-11-02, after the verdict) -- the same runner, with the committed results file, the note, the page or the library edited; every file restored byte-identical:
//   W1 the file not flagged as the registered seeds 1 | W2 the first close-gpu battle's winner flipped 4 (the legality, the flown-again sample, H3's totals and the note) | W3 C-determinism 99 of 100 1
//   W4 C-pilots not ok 1 | W5 a page fingerprint in the file changed 1 | W7 the note's H1 numbers drifted 1 | W8 a note totals row drifted 1 | W9 the note saying P4 right 1 | W10 the note's timeouts drifted 1
//   W11 the page's shot damage at 7 1 (the flown-again sample: the file is held to the page's code) | W12 the level at 0.05 3 (the edges, H2, the note). (No W6: a reading cannot be flipped by one string.)
//   FOUND BY THE REGISTERED RUN'S OWN DATA, before these sabotages: section 6's first draft went red on a correct file. Its legality rule said "a timeout exactly when the battle ran 900 ticks", and one
//   battle (the Default's mirror, seed 80084) is a kill landed ON the 900th tick. The rule is now the page's own (legalRow above); section 4's miniature had the same latent bug. No reading changes.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as F from "./sixdofPageFight.mjs";
import { LEAD_FLOOR } from "./train6dofLeague.mjs";
import { webgpuSkipReason, runInEngineOrigin } from "./webgpuHarness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ----  " + m);
const t0 = Date.now();
const J = JSON.stringify;
// A battle row [winner, timeout, ticks, hull A, hull B] is LEGAL by the page's own rule: a timeout ran the 900 ticks with both fleets alive and went to the fleet with more hull (equal: a draw); any other battle
// ended with at least one fleet at zero hull, its winner the side that still has some (both at zero: a draw). A first draft said "a timeout exactly when the battle ran 900 ticks", and the registered run
// holds a kill landed ON the 900th tick (the Default's mirror, seed 80084), which is not a timeout: the rule was wrong, the row was right.
const byHull = (a, b) => (a > b ? "A" : b > a ? "B" : "draw");
const legalRow = (x) => (x[1] === 1 ? x[2] === 900 && x[3] > 0 && x[4] > 0 && x[0] === byHull(x[3], x[4]) : x[1] === 0 && x[2] > 0 && x[2] <= 900 && (x[3] === 0 || x[4] === 0) && x[0] === byHull(x[3], x[4]));

console.log("1. THE REGISTRATION, AS CODE");
try {
    ok("!! the five pilots are the page's own choices in the registered order -- the PD autopilot, the fruit fly's Default, League and close-quarters pilots, the GPU Brain's -- and the four brains are held to the registered hashes",
        J(F.PILOT_IDS) === J(["scripted", "shipped", "league", "close", "gpu"]) && J(F.PILOTS.map((p) => p.hash)) === J([null, "215e26d9", "32789ff9", "360580a7", "0ffd8554"]) && J(F.BRAINS) === J(["shipped", "league", "close", "gpu"]) && Object.isFrozen(F.PILOTS));
    const node = F.nodeControls();
    ok("!! ...and each brain's FILE is that pilot: imported the way the page imports it, its hash is the registered one", F.BRAINS.every((id) => node[id].hash === F.PILOTS.find((p) => p.id === id).hash), F.BRAINS.map((id) => `${id} ${node[id].hash}`).join(", "));
    const used = new Set(F.USED_BATTLE_SEEDS);
    ok("!! the battle seeds are 80001-80100, frozen, and clear of every block a page run had flown (the page's gate 1-120, v4895's balance run 1-300) and of this gate's scratch seeds",
        F.SEEDS.length === 100 && F.SEEDS[0] === 80001 && F.SEEDS[99] === 80100 && Object.isFrozen(F.SEEDS) && F.SEEDS.every((s) => !used.has(s) && s < 990000) && used.has(1) && used.has(300));
    const pl = F.plan(), pairs = new Set(pl.filter((m) => !m.mirror).map((m) => m.a + ">" + m.b));
    ok("!! the plan: every pair of the five from BOTH sides (20 matchups), then each pilot against itself (5), every one on all 100 seeds, mirrors last",
        pl.length === 25 && pairs.size === 20 && F.PILOT_IDS.every((x) => F.PILOT_IDS.every((y) => x === y || (pairs.has(x + ">" + y) && pairs.has(y + ">" + x)))) &&
        pl.slice(20).every((m) => m.mirror && m.a === m.b) && pl.every((m) => J(m.seeds) === J(F.SEEDS)), `${pl.length} matchups, ${pl.length * 100} battles`);
    // the exact reference: 2 * sum_{i<=k} C(n,i) / 2^n in BigInt, made a double at the end by shifting n + 64 bits first, so even 2 / 2^100 keeps its digits (a first draft scaled by 10^18 and truncated
    // every p under 1e-18 to zero -- the gate's own reference was wrong, not the library)
    const ref = (w, l) => { const n = w + l, k = Math.min(w, l); if (n === 0) return 1; let c = 1n, s = 0n; for (let i = 0; i <= k; i++) { s += c; c = (c * BigInt(n - i)) / BigInt(i + 1); } const sh = BigInt(n + 64); return Math.min(1, Number(((2n * s) << sh) / (2n ** BigInt(n))) * Math.pow(2, -(n + 64))); };
    let worst = 0, flips = 0;
    for (let w = 0; w <= 100; w++) { const p = F.signTest(w, 100 - w), r = ref(w, 100 - w); worst = Math.max(worst, Math.abs(p - r) / Math.max(r, 1e-300)); if ((p < F.ALPHA) !== (r < F.ALPHA)) flips++; }
    ok("!! the sign test is the exact two-sided binomial: at every split of 100 decisive battles it agrees with a BigInt reference to 1e-9, and no split falls on the other side of 0.01",
        worst < 1e-9 && flips === 0 && F.signTest(0, 0) === 1 && F.signTest(5, 5) === 1 && F.signTest(10, 0) === 2 / 1024 && F.signTest(0, 10) === 2 / 1024, `worst relative error ${worst.toExponential(1)}`);
    ok("!! the readings at their edges: 64-36 is 'x better' (p 0.0066) and 63-37 is not (p 0.012); 36-64 is 'y better'; 10-0 is 'x better'; 9-1 is not (p 0.021); an even split never is; the level is 0.01",
        F.ALPHA === 0.01 && F.readingOf("x", "y", 64, 36) === "x better" && F.readingOf("x", "y", 63, 37) === "no difference shown" && F.readingOf("x", "y", 36, 64) === "y better" &&
        F.readingOf("x", "y", 10, 0) === "x better" && F.readingOf("x", "y", 9, 1) === "no difference shown" && F.readingOf("x", "y", 50, 50) === "no difference shown", `p(64,36) ${F.signTest(64, 36).toFixed(4)}, p(63,37) ${F.signTest(63, 37).toFixed(4)}`);
    ok("  the duel's floor, reported beside it and testing nothing, IS train6dofLeague.mjs's LEAD_FLOOR at its edges (8 is x better, 7 is not, -8 is y better)",
        F.FLOOR === LEAD_FLOOR && F.floorReading("x", "y", 8) === "x better" && F.floorReading("x", "y", 7) === "no difference shown" && F.floorReading("x", "y", -8) === "y better");
} catch (e) { ok("section 1 ran without throwing", false, String(e && e.stack || e).split("\n").slice(0, 2).join(" ").slice(0, 240)); }

console.log("\n2. THE VERDICT'S ARITHMETIC ON PLANTED FILES");
try {
    // a planted file: battles chosen so every reading is known in advance. rows are [winner, timeout, ticks, hpA, hpB].
    const row = (w, to = 0) => [w, to, 300, w === "A" ? 50 : 0, w === "B" ? 50 : 0];
    const many = (spec) => spec.flatMap(([w, n, to]) => Array.from({ length: n }, () => row(w, to)));
    const planted = (lean) => {   // lean(x, y) -> [x's wins as side A, x's losses as side A, draws] of 100; side B is the same from x's view
        const ms = [];
        for (const m of F.plan()) {
            if (m.mirror) { ms.push({ a: m.a, b: m.b, mirror: true, out: many([["A", 50, 0], ["B", 45, 1], ["draw", 5, 0]]) }); continue; }
            const [w, l, d] = lean(m.a, m.b);
            ms.push({ a: m.a, b: m.b, mirror: false, out: many([["A", w, 0], ["B", l, 0], ["draw", d, 0]]) });
        }
        return { pilots: [...F.PILOT_IDS], matchups: ms };
    };
    const rank = { close: 5, shipped: 4, league: 3, gpu: 2, scripted: 1 };
    // the stronger pilot wins 70 of 100 as side A and loses 25 (5 draws) -- from either side, so a both-sides count gives it 140 wins and 50 losses
    const f1 = planted((a, b) => (rank[a] > rank[b] ? [70, 25, 5] : [25, 70, 5])), v1 = F.verdictOf(f1), sg = v1.pairs.find((p) => p.x === "shipped" && p.y === "gpu");
    ok("!! a pairing is counted from BOTH sides from x's point of view: x's wins on side A are 'A', on side B they are 'B' (the planted shipped-gpu pairing: 140 wins, 50 losses, 10 draws of 200)",
        sg.games === 200 && sg.wins === 140 && sg.losses === 50 && sg.draws === 10 && sg.lead === 90 && sg.reading === "shipped better" && sg.floorReading === "shipped better", J(sg));
    ok("!! H1, H2 and H3 read as registered: the Default ahead of the GPU pilot is 'carries over'; each brain ahead of the autopilot 'beats the autopilot'; the close-quarters pilot strictly first is H3 met",
        v1.h1.met && v1.h1.reading === "carries over" && v1.h2.every((h) => h.reading === "beats the autopilot") && J(v1.h2.map((h) => h.pilot)) === J(F.BRAINS) && v1.h3.met && v1.h3.totals[0].id === "close", J(v1.h3.totals.map((t) => t.id + " " + t.lead)));
    const rank2 = { gpu: 5, scripted: 4, shipped: 3, league: 2, close: 1 }, v2 = F.verdictOf(planted((a, b) => (rank2[a] > rank2[b] ? [70, 25, 5] : [25, 70, 5])));
    ok("!! ...and the other way: the GPU pilot ahead is 'reverses', a brain behind the autopilot 'loses to the autopilot', the close-quarters pilot last is H3 not met",
        !v2.h1.met && v2.h1.reading === "reverses" && v2.h2.find((h) => h.pilot === "gpu").reading === "beats the autopilot" && v2.h2.find((h) => h.pilot === "close").reading === "loses to the autopilot" && !v2.h3.met, J(v2.h2.map((h) => h.pilot + ": " + h.reading)));
    const v3 = F.verdictOf(planted(() => [48, 47, 5]));
    ok("!! a near-even pairing is 'no difference shown' (from both sides, 95 wins against 95 losses), and a TIE FOR FIRST is not H3", v3.h1.reading === "no difference shown" && v3.h2.every((h) => h.reading === "no difference shown") && !v3.h3.met, J(v3.h1.pair));
    ok("  the mirrors, timeouts and battle count are reported (the planted mirrors: 50 side-A wins, 45 side-B, 5 draws, 45 timeouts each)",
        v1.mirrors.length === 5 && v1.mirrors.every((m) => m.aWins === 50 && m.bWins === 45 && m.draws === 5 && m.timeouts === 45) && v1.battles === 2500 && v1.timeouts === 225 && v1.medianTicks === 300);
    const ms = f1.matchups, again = { a: "shipped", b: "gpu", out: ms.find((m) => m.a === "shipped" && m.b === "gpu").out.map((r) => [...r]) }, dOk = F.determinismCheck(ms, again);
    again.out[37] = ["B", 0, 301, 0, 50]; const dBad = F.determinismCheck(ms, again);
    ok("!! C-determinism can fail: the same battles again is ok (100 of 100), one battle different is not (99 of 100)", dOk.ok && dOk.same === 100 && !dBad.ok && dBad.same === 99, `${dOk.same}, then ${dBad.same}`);
    const node = F.nodeControls(), page = { pilots: Object.fromEntries(F.BRAINS.map((id) => [id, { hash: node[id].hash, lineup: id, fps: [...node[id].fps], error: null }])) };
    const bent = (fn) => { const p = JSON.parse(J(page)); fn(p.pilots); return F.cPilotsCheck(p, node); };
    const good = F.cPilotsCheck(page, node), badHash = bent((p) => { p.league.hash = "deadbeef"; }), badLine = bent((p) => { p.gpu.lineup = "hand"; }), badFp = bent((p) => { p.close.fps[1] = "00000000"; });
    ok("!! C-pilots can fail, and says by name why: the page holding another file, a team that flew another choice, a pilot function that does not fly Node's fingerprints",
        good.ok && !badHash.ok && /league: the page holds deadbeef/.test(badHash.problems.join()) && !badLine.ok && /gpu: the page's team A flew "hand"/.test(badLine.problems.join()) && !badFp.ok && /close: .*fingerprints/.test(badFp.problems.join()), badFp.problems.join("; "));
} catch (e) { ok("section 2 ran without throwing", false, String(e && e.stack || e).split("\n").slice(0, 2).join(" ").slice(0, 240)); }

console.log("\n3. THE ROUND'S CONTROL FLOW, with a stub browser");
try {
    const calls = [], stub = (reply) => async (o) => { calls.push(o.args.run); return reply(o); };
    const node = F.nodeControls();
    const wrongPage = { ok: true, result: { pilots: Object.fromEntries(F.BRAINS.map((id) => [id, { hash: "00000000", lineup: id, fps: node[id].fps, error: null }])) } };
    const r = await F.runRound({ seeds: [990201], node, harness: stub(() => wrongPage) });
    ok("!! C-pilots comes FIRST, and when it fails nothing is flown on the battle seeds: one browser call (the controls), no plan, the reason recorded", calls.length === 1 && calls[0] === false && /C-pilots failed/.test(r.stopped || "") && !r.matchups, `${calls.length} call(s); ${r.stopped}`);
    const dead = await F.runRound({ seeds: [990201], node, harness: async () => ({ ok: false, reason: "no browser" }) });
    ok("  a browser that does not run is recorded as stopped, not as a result", /did not run the controls: no browser/.test(dead.stopped || "") && !dead.matchups);
} catch (e) { ok("section 3 ran without throwing", false, String(e && e.stack || e).split("\n").slice(0, 2).join(" ").slice(0, 240)); }

console.log("\n4. THE ROUND ON A MINIATURE, in the page's own browser (scratch battle seeds 990101-990102)");
try {
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const seeds = [990101, 990102], r = await F.runRound({ seeds, timeoutMs: 600000 });
        ok("the miniature ran to the end in the page's browser", !r.stopped && Array.isArray(r.matchups), r.stopped || "");
        if (!r.stopped && r.matchups) {
            ok("!! C-pilots held in BOTH browsers: every brain is the registered file on the page, its team flew it, and the page's own pilot function flew Node's fingerprints on the control duel seeds",
                r.cPilots.ok && r.cPilotsAgain.ok, [...r.cPilots.problems, ...r.cPilotsAgain.problems].join("; "));
            const pl = F.plan(F.PILOT_IDS, seeds);
            ok("!! every matchup is the plan's, in its order, and the page's lineup for it is the pair asked for (side A, side B)",
                r.matchups.length === pl.length && r.matchups.every((m, i) => m.a === pl[i].a && m.b === pl[i].b && !!m.mirror === !!pl[i].mirror && J(m.lineup) === J([m.a, m.b])), `${r.matchups.length} matchups`);
            ok("!! every battle is a legal row by the page's own rule: a timeout ran the 900 ticks with both fleets alive and went to the fleet with more hull; any other battle ended with a fleet at zero hull, won by the side that still has some", r.matchups.every((m) => m.out.length === 2 && m.out.every(legalRow)), `${r.matchups.reduce((n, m) => n + m.out.length, 0)} battles`);
            ok("!! C-determinism held: the determinism matchup flown again gave the same battles", r.cDeterminism && r.cDeterminism.ok && r.cDeterminism.same === 2, J(r.cDeterminism));
            ok("  the page's own C-pilots report is kept in the result as evidence: each brain's hash, lineup and fingerprints", F.BRAINS.every((id) => r.cPilotsPage[id] && r.cPilotsPage[id].lineup === id && r.cPilotsPage[id].fps.length === 2));
            // C-pilots must read the PAGE's lineup, not echo the id it asked for: a choice the page does not hold has to come back as the hand pilot it falls back to
            const probe = await runInEngineOrigin({ engineRoot: F.ENG, timeoutMs: 240000, script: F.BROWSER_SCRIPT,
                args: { controlDuelSeeds: [...F.CONTROL_DUEL_SEEDS], run: true, controlIds: ["shipped", "imported"], plan: [{ a: "imported", b: "scripted", seeds: [990301] }], determinism: null, maxTicks: F.MAX_TICKS } });
            ok("!! C-pilots reads the page's OWN lineup: asked for 'imported', which the page does not hold, it reports the hand pilot the page fell back to (and 'shipped' as shipped)",
                probe.ok && probe.result.pilots.imported.lineup === "hand" && probe.result.pilots.imported.hash === null && probe.result.pilots.shipped.lineup === "shipped", probe.ok ? J(probe.result.pilots.imported.lineup) : String(probe.reason));
            ok("!! ...and so does every matchup: a battle asked for 'imported' against the autopilot records the lineup the page flew (the hand pilot, then the PD autopilot), not the one asked for",
                probe.ok && J(probe.result.matchups[0].lineup) === J(["hand", "scripted"]), probe.ok ? J(probe.result.matchups[0].lineup) : "");
            const v = F.verdictOf(r);
            ok("  the verdict reads the miniature (10 pairings of 4 battles each, the five totals, the mirrors), and the result says it did not use the registered seeds",
                v.pairs.length === 10 && v.pairs.every((p) => p.games === 4) && v.h3.totals.length === 5 && v.mirrors.length === 5 && r.registeredSeeds === false && J(r.seeds) === J([990101, 990102, 2]));
        }
    }
} catch (e) { ok("section 4 ran without throwing", false, String(e && e.stack || e).split("\n").slice(0, 2).join(" ").slice(0, 240)); }

console.log("\n5. THE COMMAND (held, never executed)");
try {
    const src = fs.readFileSync(path.join(HERE, "sixdofPageFightCmd.mjs"), "utf8"), code = src.replace(/\/\/.*$/gm, "");
    let typo = null; try { F.parseArgs(["--seeds", "3"]); } catch (e) { typo = e.message; }
    const atParse = code.indexOf("parseArgs(process.argv"), atRefuse = code.indexOf("refuseExisting(opts.results)"), atRun = code.indexOf("await runRound(");
    ok("!! the command never overwrites a results file and refuses an option it does not know: refuseExisting() refuses a file that exists, parseArgs() refuses a typo, and the command calls them in that order before runRound(), exiting 2 on either",
        /never overwritten/.test(F.refuseExisting("/any/r.json", () => true) || "") && F.refuseExisting("/any/r.json", () => false) === null && /unknown option "--seeds"/.test(typo || "") &&
        atParse > 0 && atRefuse > atParse && atRun > atRefuse && /process\.exit\(2\)/.test(code.slice(atRefuse, atRefuse + 120)) && /process\.exit\(2\)/.test(code.slice(atParse, atParse + 160)), typo);
    ok("  ...and it prints no score: the result goes to the file, and the console says only where (the registration reads the committed file)",
        !/verdictOf|readingOf|pairTally|signTest|JSON\.stringify\(result, null/.test(code) && /commit it before reading it/.test(code) && (code.match(/console\.log\(/g) || []).length === 1);
} catch (e) { ok("section 5 ran without throwing", false, String(e && e.stack || e).split("\n").slice(0, 2).join(" ").slice(0, 240)); }

console.log("\n6. THE VERDICT, AS CODE, FROM THE COMMITTED FILE (brain/sixdofPageFightResults.json, committed unread at 37c14c8b)");
try {
    // Written AFTER the file was read. Every reading is re-derived here by verdictOf() from the file, the note's tables are tied to it, and a sample of its battles is flown again in the page's browser,
    // so the file is held to the page's code at this head. The registered seeds were read once, by the registered run, and are spent: flying a sample again chooses nothing.
    const R = JSON.parse(fs.readFileSync(F.DEFAULT_RESULTS, "utf8")), v = F.verdictOf(R), node = F.nodeControls(), pl = F.plan();
    ok("!! the file is the registered run: the registration, seeds 80001-80100 and flagged so, the five pilots, not stopped, and the 25 matchups of the plan in its order, 100 legal battles each, each lineup the pair asked for",
        R.registration === F.REGISTRATION && J(R.seeds) === J([80001, 80100, 100]) && R.registeredSeeds === true && J(R.pilots) === J(F.PILOT_IDS) && !R.stopped && R.maxTicks === F.MAX_TICKS &&
        R.matchups.length === 25 && R.matchups.every((m, i) => m.a === pl[i].a && m.b === pl[i].b && !!m.mirror === !!pl[i].mirror && J(m.lineup) === J([m.a, m.b]) && m.out.length === 100 && m.out.every(legalRow)));
    ok("!! C-pilots held in both browsers, and the page's own report in the file is the registered files flying Node's fingerprints at this head",
        R.cPilots.ok && R.cPilotsAgain.ok && F.BRAINS.every((id) => R.cPilotsPage[id].hash === F.PILOTS.find((p) => p.id === id).hash && R.cPilotsPage[id].lineup === id && R.cPilotsPage[id].fps.join() === node[id].fps.join()));
    ok("!! C-determinism held: the shipped-against-gpu matchup flown again gave the same battles, 100 of 100", R.cDeterminism.ok === true && R.cDeterminism.a === "shipped" && R.cDeterminism.b === "gpu" && R.cDeterminism.same === 100 && R.cDeterminism.of === 100);
    const idx = [0, 36, 67, 99], sample = [{ a: "close", b: "gpu" }, { a: "scripted", b: "league" }, { a: "gpu", b: "shipped" }].map((m) => ({ ...m, seeds: idx.map((i) => F.SEEDS[i]) }));
    const want = sample.map((m) => { const fm = R.matchups.find((x) => !x.mirror && x.a === m.a && x.b === m.b); return idx.map((i) => fm.out[i]); });
    const re = await runInEngineOrigin({ engineRoot: F.ENG, timeoutMs: 240000, script: F.BROWSER_SCRIPT, args: { controlDuelSeeds: [...F.CONTROL_DUEL_SEEDS], run: true, plan: sample, determinism: null, maxTicks: F.MAX_TICKS } });
    ok("!! the page at this head flies the file's battles: a sample of 12 (three matchups, four seeds each, both orders of side), flown again in the page's browser, is the file's to the last tick and hull point",
        re.ok && re.result.matchups.every((m, k) => J(m.out) === J(want[k]) && J(m.lineup) === J([sample[k].a, sample[k].b])), re.ok ? `${re.result.matchups.reduce((n, m, k) => n + m.out.filter((r, i) => J(r) === J(want[k][i])).length, 0)} of 12` : String(re.reason));
    const h1 = v.h1.pair;
    ok(`!! H1 IS MET by the registered rule applied to the file: the fruit fly's Default against the GPU pilot, W${h1.wins}/L${h1.losses}/D${h1.draws} from both sides, p ${h1.p.toPrecision(2)} under 0.01: carries over`,
        v.h1.met === true && v.h1.reading === "carries over" && h1.games === 200 && h1.p < F.ALPHA && h1.wins > h1.losses);
    ok("!! H2 by the rule: the close-quarters pilot beats the autopilot, the League pilot LOSES to it, the Default and the GPU pilot show no difference",
        J(v.h2.map((h) => [h.pilot, h.reading])) === J([["shipped", "no difference shown"], ["league", "loses to the autopilot"], ["close", "beats the autopilot"], ["gpu", "no difference shown"]]), v.h2.map((h) => h.pilot + ": " + h.reading).join("; "));
    ok("!! H3 IS MET: the close-quarters pilot's total is strictly the highest; the order is close, the Default, the autopilot, the GPU pilot, the League pilot",
        v.h3.met === true && J(v.h3.totals.map((t) => t.id)) === J(["close", "shipped", "scripted", "gpu", "league"]) && J(v.h3.totals.map((t) => t.lead)) === J([672, -13, -38, -180, -441]), v.h3.totals.map((t) => `${t.id} ${t.lead}`).join(", "));
    const pred = { P1: v.h1.met, P2: v.h2.every((h) => h.reading === "beats the autopilot"), P3: v.h3.met, P4: v.timeouts / v.battles < 0.1 };
    ok(`!! the four predictions, read off the file: P1 right (H1 met), P2 wrong (one of four beats the autopilot), P3 right (H3 met), P4 wrong (${v.timeouts} of ${v.battles} timed out)`,
        pred.P1 === true && pred.P2 === false && pred.P3 === true && pred.P4 === false, J(pred));
    const note = fs.readFileSync(path.join(F.ENG, F.REGISTRATION), "utf8"), at = note.indexOf("\n## The verdict"), vt = at >= 0 ? note.slice(at) : "";
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), stands = (x) => new RegExp("(?<![0-9])" + esc(x) + "(?![0-9])").test(vt), sg = (n) => (n > 0 ? "+" + n : String(n));
    const mA = v.mirrors.reduce((n, m) => n + m.aWins, 0), mB = v.mirrors.reduce((n, m) => n + m.bWins, 0);
    const frags = [...v.pairs.map((p) => `| \`${p.x}\` vs \`${p.y}\` | W${p.wins}/L${p.losses}/D${p.draws} | ${sg(p.lead)} | ${p.p.toPrecision(2)} | ${p.reading} | ${p.timeouts} |`),
                   ...v.h3.totals.map((t) => `| \`${t.id}\` | W${t.wins}/L${t.losses}/D${t.draws} | ${sg(t.lead)} |`), ...v.mirrors.map((m) => `| \`${m.id}\` | ${m.aWins} | ${m.bWins} | ${m.draws} | ${m.timeouts} |`),
                   `W${h1.wins}/L${h1.losses}/D${h1.draws} (p ${h1.p.toPrecision(2)})`, `${mB} to ${mA} over the 500 (p ${F.signTest(mA, mB).toPrecision(2)}`, `${v.timeouts} of the ${v.battles.toLocaleString("en-US")} battles timed out (${(100 * v.timeouts / v.battles).toFixed(1)}%)`,
                   `${v.medianTicks} ticks (${(v.medianTicks / 30).toFixed(1)} s)`, "H1 is met", "H3 is met", ...Object.keys(pred).map((k) => `**${k}: ${pred[k] ? "right" : "wrong"}.**`)];
    const missing = frags.filter((x) => !stands(x));
    ok("!! the note's verdict carries the file's tables and numbers and each prediction's outcome as the file decides it (no digit may touch a fragment's ends)", at > 0 && missing.length === 0, missing.length ? "missing: " + missing.join(" || ").slice(0, 300) : `${frags.length} fragments`);
} catch (e) { ok("section 6 ran without throwing", false, String(e && e.stack || e).split("\n").slice(0, 2).join(" ").slice(0, 240)); }

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: why the standoff pilots do not carry their duel result to the page (a guess is named in the note), and whether the page's default lineup should change (asked first).");
process.exit(fails ? 1 : 0);
