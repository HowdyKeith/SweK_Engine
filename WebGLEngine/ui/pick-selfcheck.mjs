// WebGLEngine/ui/pick-selfcheck.mjs -- v4824
//
// Run: node ui/pick-selfcheck.mjs
//
// GATES ui/pick.mjs, the TARGET-SCORING utility, and the eight hand-written scans moved onto it in
// simulation/KaijuRivalry.js, KaijuManager.js, OgreScenario.js and Kaiju.js. The claim is behaviour identity, so
// the instrument is the loop being replaced: section 2 runs the hand-written pattern and pickMin side by side
// over thousands of lists built to hit its edges (ties, NaN, keys exactly at the bound, rejected items), and
// section 3 drives one migrated site, KaijuRivalry's findRivalTarget, through the real module against that
// same pattern written out over the same population.
//
// SABOTAGED, each restored:
//   A  pickMin's `<` made `<=`            -> RED, sections 1 and 2 (the LAST of a tie wins), and section 3
//   B  the bound made inclusive            -> RED, sections 1 and 2 (a key exactly at range^2 is picked)
//   C  keyOf skipped once an item is found -> RED, section 1's call-order row, and sections 2 and 3 (Kaiju's Math.random draws would shift)
//   D  one migrated site put back by hand  -> RED, section 4's census
"use strict";
import fs from "node:fs";
import { pickMin, pickMax } from "./pick.mjs";
import { makeKaijuRivalry } from "../simulation/KaijuRivalry.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

console.log("ui/pick-selfcheck -- the best candidate, found the way the hand-written loops found it\n");

console.log("1. THE CONTRACT");
{
    const a = pickMin([5, 3, 3, 9], (x) => x);
    ok("!! *** a tie goes to the FIRST candidate in iteration order ***", a.found && a.index === 1 && a.key === 3, JSON.stringify(a));
    const b = pickMin([4, 2, 7], (x) => x, 2);
    ok("!! *** the bound is EXCLUSIVE: a key exactly at it is not picked ***", !b.found && b.item === null && b.key === 2, JSON.stringify(b));
    const c = pickMin([], (x) => x);
    ok("  nothing to pick leaves the key at the bound, as the two loop variables were left", !c.found && c.key === Infinity && c.index === -1);
    const seen = [];
    pickMin(["a", "b", "c", "d"], (x, i) => { seen.push(x + i); return x === "b" ? null : 1; });
    ok("!! *** keyOf runs once per item, IN ORDER, rejected or not -- a key that draws randoms draws the same sequence ***",
        seen.join() === "a0,b1,c2,d3", seen.join());
    ok("  null and undefined both mean 'does not qualify'", !pickMin([1, 2], () => null).found && !pickMin([1, 2], () => undefined).found);
    ok("  a NaN key never beats anything, as NaN < x never did", pickMin([NaN, 4, NaN], (x) => x).index === 1);
    const m = new Map([["p", 8], ["q", 6], ["r", 6]]);
    ok("  any iterable: a Map's values() picks like an array", pickMin(m.values(), (x) => x).index === 1);
    const x = pickMax([1, 9, 9, 2], (v) => v);
    ok("!! pickMax mirrors it: largest key, first of a tie, exclusive bound", x.index === 1 && !pickMax([3], (v) => v, 3).found, JSON.stringify(x));
}

console.log("\n2. *** AGAINST THE LOOP IT REPLACES, OVER LISTS BUILT TO HIT ITS EDGES ***");
{
    // the pattern as every migrated site wrote it
    const handMin = (list, bound) => {
        let best = null, bestD2 = bound, at = -1;
        for (let i = 0; i < list.length; i++) { const v = list[i]; if (v === null) continue; if (v < bestD2) { bestD2 = v; best = v; at = i; } }
        return { at, bestD2 };
    };
    const handMax = (list) => {
        let at = -1, bestScore = -Infinity;
        for (let i = 0; i < list.length; i++) { const v = list[i]; if (v > bestScore) { bestScore = v; at = i; } }
        return { at, bestScore };
    };
    let s = 12345;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    let bad = 0, cases = 0, ties = 0, atBound = 0;
    for (let n = 0; n < 3000; n++) {
        const len = Math.floor(rnd() * 12);
        const bound = rnd() < 0.5 ? Infinity : Math.floor(rnd() * 6);
        const list = Array.from({ length: len }, () => {
            const r = rnd();
            return r < 0.12 ? null : r < 0.18 ? NaN : Math.floor(rnd() * 6);   // small integers: ties and bound hits are common
        });
        const h = handMin(list, bound), p = pickMin(list, (v) => v, bound);
        if (h.at !== p.index || !Object.is(h.bestD2, p.key)) bad++;
        const hm = handMax(list.map((v) => (v === null ? NaN : v))), pm = pickMax(list.map((v) => (v === null ? NaN : v)), (v) => v);
        if (hm.at !== pm.index) bad++;
        cases++;
        const vals = list.filter((v) => v !== null && !Number.isNaN(v));
        if (new Set(vals).size < vals.length) ties++;
        if (vals.includes(bound)) atBound++;
    }
    ok("!! *** pickMin and pickMax pick the same index, and leave the same key, as the hand-written loop on every case ***",
        bad === 0 && ties > 500 && atBound > 200, `${bad} disagreement(s) over ${cases} lists, ${ties} with a tie, ${atBound} with a key exactly at the bound`);
}

console.log("\n3. ONE MIGRATED SITE, THROUGH THE REAL MODULE: KaijuRivalry's findRivalTarget");
{
    const R = makeKaijuRivalry();
    const KINDS = ["lightning", "fire", "plasma", "ice", "rock", "cloud", "demon", "void"];
    let s = 99, bad = 0, picked = 0, tiesHit = 0;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let n = 0; n < 400; n++) {
        const pop = Array.from({ length: 2 + Math.floor(rnd() * 7) }, (_, i) => ({
            id: i, kind: KINDS[Math.floor(rnd() * KINDS.length)], tier: Math.floor(rnd() * 4),
            state: rnd() < 0.1 ? "dying" : "engaging", isAlive: () => true,
            // coordinates on a coarse lattice so equal distances happen
            position: { x: Math.floor(rnd() * 5) * 10, y: 0, z: Math.floor(rnd() * 5) * 10 },
        }));
        const k = pop[0], range = 25 + Math.floor(rnd() * 3) * 5;
        const got = R.findRivalTarget(k, range, pop);
        // the v4823 loop, written out
        let best = null, bestD2 = range * range, cands = [];
        if ((k.tier ?? 0) >= 2 && R.factionOf(k.kind) !== "unknown") for (const o of pop) {
            if (o === k || o.state === "dying" || (o.tier ?? 0) < 1 || !R.areRivals(k.kind, o.kind)) continue;
            const d2 = (o.position.x - k.position.x) ** 2 + (o.position.z - k.position.z) ** 2;
            cands.push(d2);
            if (d2 < bestD2) { bestD2 = d2; best = o; }
        }
        if ((got ? got.ref : null) !== best) bad++;
        if (best) picked++;
        if (best && cands.filter((d) => d === bestD2).length > 1) tiesHit++;
    }
    ok("!! *** the migrated site returns the same rival as the loop it replaced, including on exact distance ties ***",
        bad === 0 && picked > 30 && tiesHit > 0, `${bad} disagreement(s) over 400 populations; ${picked} picked a rival, ${tiesHit} of them through a tie`);
}

console.log("\n4. THE MIGRATED SITES, COUNTED IN THE SOURCE");
{
    const count = (f, re) => (fs.readFileSync(new URL("../simulation/" + f, import.meta.url), "utf8").match(re) || []).length;
    const want = { "KaijuRivalry.js": 1, "KaijuManager.js": 3, "OgreScenario.js": 3, "Kaiju.js": 1 };
    const got = Object.fromEntries(Object.keys(want).map((f) => [f, count(f, /\bpick(?:Min|Max)\(/g)]));
    ok("!! the eight scans are on ui/pick.mjs: 1 in KaijuRivalry, 3 in KaijuManager, 3 in OgreScenario, 1 in Kaiju",
        Object.keys(want).every((f) => got[f] === want[f]), JSON.stringify(got));
    const resolve = fs.readFileSync(new URL("../simulation/Kaiju.js", import.meta.url), "utf8");
    ok("  and Kaiju._resolveTarget still SORTS, by decision: a NaN distance sorts as equal there and a scan would skip it",
        /candidates\.sort\(\(a, b\) => a\.distSq - b\.distSq\)/.test(resolve));
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: the other seven migrated sites end to end -- they need a KaijuManager, an OgreScenario or a " +
    "brain threat field to run, so they rest on section 2's pattern identity and a line-by-line transcription, " +
    "with kaiju-selfcheck and the Ogre gates re-run against them. Also unchecked: the rest of the tree's scans of " +
    "this shape outside the four files the audit named.");
process.exit(fails ? 1 : 0);
