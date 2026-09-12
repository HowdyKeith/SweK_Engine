#!/usr/bin/env node
// WebGLEngine/physics/raceKnob-selfcheck.mjs -- v4577
//
// *** THE CHEAP SIBLING physics/raceKnob.mjs NEVER HAD, AND THE REASON IT NEEDS ONE. ***
//
// tools/ship/raceKnob-selfcheck.mjs is the real gate for this module and it is thorough -- seven sections, a
// bridge, a browser, and the eight adjudications driven for real. It is also 33,306 ms, which is over the
// sweep's 3,000 ms budget AND over its 20,000 ms cap, so it does not run at ship time. And it does not name
// MEASURED_V4527 anywhere in its code: the round's numbers are in its HEADER, as prose, which is precisely
// the shape tools/ship/frozenRecords.mjs stopped counting as a guardian at v4548.
//
// So at v4577 tools/ship/recordReach.mjs listed MEASURED_V4527 as guarded by NOTHING, and the only code that
// touched it was physics/raceKnob.mjs's own reportLines(), which PRINTS it. A record that is printed is not a
// record that is checked.
//
// ---- WHAT THIS GATE CHECKS, AND THE LINE IT DOES NOT CROSS --------------------------------------------------
//
// *** IT RUNS NO SIMULATION AND CLAIMS NOTHING ABOUT ONE. *** Re-deriving the eight adjudications is 2 x 90 s
// of driving per candidate, which is what the 33 s gate is for and is why that gate is 33 s. What is checkable
// for nothing is that the record AGREES WITH ITSELF AND WITH THE MODULE'S LIVE CONSTANTS:
//
//     every verdict is a FUNCTION of the record's own laps, lap times and off-asphalt counts, applied to
//     LAP_BOUND, OFF_BOUND and samples as this module exports them TODAY
//
// That is load-bearing rather than decorative. Move LAP_BOUND from 80 to 85 and speed gain 2 -- refused at
// 80.3 s "over the lap bound on seed 2" -- would no longer be refused by the rule the record cites, and this
// gate goes red while nothing else in the tree does. Same for OFF_BOUND: 0.3 is refused on 1,351 off-asphalt
// samples of 21,600, which is 6.25%, and it is refused because that is over 1%.
//
// It also holds the record's PROSE to the record's own numbers, because a summary sentence that drifts from
// the table beneath it is the defect this tree keeps finding (vba/runtimeGap.mjs v4462, frozenRecords v4548).
"use strict";
import fs from "node:fs";
import * as R from "./raceKnob.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const M = R.MEASURED_V4527;
const gains = M.rows.map((r) => r.speedGain);

console.log("1. THE RECORD'S POPULATION IS THE MODULE'S POPULATION, IN THE MODULE'S ORDER");
{
    ok("!! *** the eight rows are CANDIDATES, in CANDIDATES order ***",
       gains.length === R.CANDIDATES.length && gains.every((g, i) => g === R.CANDIDATES[i]),
       `record ${gains.join(", ")}  against  CANDIDATES ${[...R.CANDIDATES].join(", ")}. A row for a gain the ` +
       "module no longer offers, or a gain with no row, is a record describing a different experiment");
    ok("  every scored gain has a row and every row has a score",
       Object.keys(M.scores30s).length === gains.length &&
       gains.every((g) => typeof M.scores30s[g] === "number"),
       `${Object.keys(M.scores30s).length} scores for ${gains.length} rows`);
    // *** THIS ROW WAS `M.keySeconds === R.KEY_SECONDS` AND IT COULD NOT FAIL. ***
    // The record spells `keySeconds: KEY_SECONDS` -- it REFERENCES the constant rather than freezing a number
    // -- so that comparison asked the constant whether it equalled itself. Caught by sabotage and not by
    // reading: KEY_SECONDS 90 -> 60 left this gate at exit 0 with zero FAIL lines while every other sabotage
    // in the set reddened it. It is the exact defect this whole gate exists to repair, committed inside it.
    //
    // The honest property is the one that IS decidable: the field must stay a reference. Freeze it to a
    // literal and the record starts describing a horizon the module may already have left, which is what
    // every other field in it does and why every other field is checked against something.
    const SRC = fs.readFileSync(new URL("./raceKnob.mjs", import.meta.url), "utf8");
    const decl = SRC.slice(SRC.indexOf("export const MEASURED_V4527"));
    ok("!! the key horizon is a LIVE REFERENCE to KEY_SECONDS, not a number frozen beside it",
       /keySeconds:\s*KEY_SECONDS\b/.test(decl.slice(0, decl.indexOf("rows:"))),
       `the record reads ${M.keySeconds} s because KEY_SECONDS is ${R.KEY_SECONDS} s. Written as a literal it ` +
       "would be a second declaration of the same fact, and comparing the two would be a row that cannot fail " +
       "-- which is what stood here until a sabotage pass moved KEY_SECONDS and nothing went red");
}

console.log("\n2. EVERY VERDICT IS RE-DERIVED FROM THE RECORD'S NUMBERS AND THE MODULE'S LIVE BOUNDS");
{
    // The adjudicator refuses at both ends for two stated reasons. Both are recomputed here from the row --
    // NOT read out of the verdict string, which would be the string checking itself.
    const causes = (row) => {
        const seeds = [row.seed2, row.seed3];
        return {
            noLap: seeds.some((s) => s.laps === 0),
            overLap: seeds.some((s) => s.lapTime != null && s.lapTime > R.LAP_BOUND),
            offRate: Math.max(...seeds.map((s) => (s.off || 0) / M.samples)),
        };
    };
    const table = M.rows.map((row) => {
        const c = causes(row);
        return { row, ...c, overOff: c.offRate > R.OFF_BOUND,
                 shouldPass: !c.noLap && !c.overLap && !(c.offRate > R.OFF_BOUND) };
    });
    for (const t of table)
        console.log(`     ${String(t.row.speedGain).padEnd(5)} noLap ${t.noLap ? "y" : "n"}  overLap ` +
                    `${t.overLap ? "y" : "n"}  off ${(100 * t.offRate).toFixed(2)}%  ->  ` +
                    `${t.shouldPass ? "accept" : "refuse"}   record: ${t.row.verdict}`);
    ok("!! *** accepted EXACTLY when no bound is broken, refused exactly when one is ***",
       table.every((t) => t.shouldPass === (t.row.verdict === "accepted")),
       `LAP_BOUND ${R.LAP_BOUND} s, OFF_BOUND ${100 * R.OFF_BOUND}% of ${M.samples} wheel samples. Raise ` +
       "either bound and a refusal in this table stops following from the rule it cites, which is the whole " +
       "reason this row exists");
    ok("!! ...and each refusal names the cause that actually fired, not a different one",
       table.filter((t) => !t.shouldPass).every((t) => {
           const v = t.row.verdict;
           if (t.overLap) return /lap bound/.test(v);
           if (t.noLap && !t.overOff) return /no lap/.test(v);
           return /asphalt|off the road/.test(v);
       }),
       "a record that refused for the clock and wrote down the asphalt would be wrong in the direction " +
       "nothing else could see -- the string is graded against the recomputed cause, never against itself");
    const off03 = 100 * M.rows.find((r) => r.speedGain === 0.3).seed3.off / M.samples;
    ok("  the percentage quoted in 0.3's refusal is the one its own counts give",
       new RegExp("\\b" + off03.toFixed(1) + "%").test(M.rows.find((r) => r.speedGain === 0.3).verdict),
       `${M.rows.find((r) => r.speedGain === 0.3).seed3.off} of ${M.samples} = ${off03.toFixed(2)}%, ` +
       `quoted as "${M.rows.find((r) => r.speedGain === 0.3).verdict}"`);
}

console.log("\n3. THE ACCEPTED DRIVER AND ITS RANK FOLLOW FROM THE SCORES, WHICH IS THE ROUND'S WHOLE POINT");
{
    const order = [...gains].sort((a, b) => M.scores30s[b] - M.scores30s[a]);
    const firstAccepted = M.rows.find((r) => r.verdict === "accepted");
    ok("!! *** the accepted gain is the FIRST in score order that the key stands behind ***",
       M.accepted === firstAccepted.speedGain &&
       order.slice(0, order.indexOf(M.accepted)).every((g) => M.rows.find((r) => r.speedGain === g).verdict !== "accepted"),
       `score order ${order.join(" > ")}; accepted ${M.accepted}. The two refusals ahead of it are what makes ` +
       "this a held-out key rather than a leaderboard");
    ok("!! ...and acceptedRank is that position, counted rather than stated",
       M.acceptedRank === order.indexOf(M.accepted),
       `rank ${M.acceptedRank} against position ${order.indexOf(M.accepted)} in the score order`);
    ok("  the score's favourite is refused, which is the sentence the record is built to support",
       M.rows.find((r) => r.speedGain === order[0]).verdict !== "accepted",
       `favourite ${order[0]} at ${M.scores30s[order[0]]} m -- ` +
       `"${M.rows.find((r) => r.speedGain === order[0]).verdict}"`);
    // *** THE PROSE, HELD TO THE TABLE UNDER IT. ***
    const fav = order[0], favRow = M.rows.find((r) => r.speedGain === fav);
    ok("!! the record's `key` sentence quotes ITS OWN numbers -- gain, metres, off-samples and total",
       new RegExp("gain " + fav + "\\b").test(M.key) &&
       new RegExp("\\b" + Math.round(M.scores30s[fav]) + " m\\b").test(M.key) &&
       new RegExp("\\b" + favRow.seed3.off + "\\b").test(M.key) &&
       new RegExp("\\b" + M.samples.toLocaleString("en-US") + "\\b").test(M.key),
       `gain ${fav}, ${Math.round(M.scores30s[fav])} m, ${favRow.seed3.off} of ` +
       `${M.samples.toLocaleString("en-US")}. A summary that drifts from the table beneath it is what this ` +
       "tree found eleven times over at v4462 and again at v4548");
    ok("  and it names the rank the table gives",
       new RegExp("rank " + M.acceptedRank + "\\b").test(M.key), `rank ${M.acceptedRank}`);
}

console.log();
console.log("  ----  WHAT THIS DOES NOT CLAIM");
console.log("  ----  THAT THE SIMULATION STILL PRODUCES THESE NUMBERS. It runs no driving at all. Re-taking the");
console.log("  ----  eight adjudications is 2 x 90 s each, which is tools/ship/raceKnob-selfcheck.mjs's job and");
console.log("  ----  is why that gate is 33 s and outside the sweep. What is held here is that the record is");
console.log("  ----  consistent with itself and with LAP_BOUND, OFF_BOUND, KEY_SECONDS and CANDIDATES as this");
console.log("  ----  module exports them TODAY -- so a change to a bound cannot leave the record's stated");
console.log("  ----  reasons behind without anything saying so.");
if (fails) { console.log("\n[raceKnob-selfcheck] FAILED " + fails); process.exit(1); }
console.log("\n[raceKnob-selfcheck] all passed");
