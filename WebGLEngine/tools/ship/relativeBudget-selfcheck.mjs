// WebGLEngine/tools/ship/relativeBudget-selfcheck.mjs -- v4672
//
// *** THE SHIP-TIME BUDGET IS AN ABSOLUTE WALL IN FRONT OF READINGS THAT ARE NOT ABSOLUTE. ***
//
// tools/ship/quickSweep.mjs decides membership with one comparison: timings[g] <= 3000. The right side is a
// constant. The left side is a millisecond count taken on whatever machine, at whatever load, ran the sweep
// that filed it -- and sweep-timings.json's own note has said since v4536 that "this box moves 12-36%
// between hours on unchanged code". So a gate whose honest cost is 2,800 ms, measured during a 26% hour, is
// filed at 3,528, exceeds the wall, and stops running. THE GATE WAS NOT SLOW. THE HOUR WAS. Nothing about
// the exile says which, which is precisely the defect budgetExile.mjs was written about in v4425 -- it found
// the door that cannot be opened; this is one of the two reasons gates walk through it.
//
// MEASURED ON THE REAL FILE (section 5 re-derives all four numbers from the timings as they stand): a box
// running 10% slow wrongly evicts 26 gates, 26% slow evicts 86, 50% slow evicts 170, 100% slow evicts 299.
//
// *** WHAT THIS GATE IS ACTUALLY GRADING. *** v4672 divides each reading by the measured scale of the
// capture pass that took it. Three properties make that safe rather than merely clever, and each has a
// section here that can fail:
//
//   IT MEASURES THE BOX, NOT THE GATES (1). Every ratio is one gate's newest uncontended reading over the
//   median of its own earlier ones, so the gate cancels and the machine is what remains.
//   IT REFUSES TO GUESS (2, 6). Fewer than SCALE_MIN_N paired gates and there is no scale -- and the answer
//   is `measured: false`, not a 1.0 that reads like an observation. 21 of this file's 22 passes are in that
//   state and the selection is byte-identical to the pre-v4672 rule for every gate they hold.
//   IT CANNOT EVICT, AND IT CANNOT RESCUE MUCH (3, 4). The divisor is clamped to [1, SCALE_MAX]: a FAST pass
//   moves nothing, and a gate readmitted by a slow one had a raw reading of at most budgetMs * SCALE_MAX.
//
// The clamp at 1 is not symmetry refused for tidiness. Dividing by this file's real 0.9853 -- a box that ran
// 1.5% FASTER than its own history -- makes the wall stricter and evicts five gates that sit four to ten
// milliseconds under it. Section 3 measures that, on the live record, every run.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readTimings, selectGates, boxScaleOf, scaleOfGate, scaleLookup, normalisedMs, runQuickSweep,
         SCALE_MIN_N, SCALE_MAX, DEFAULTS } from "./quickSweep.mjs";
import { enumerateGates } from "./gateSweep.mjs";
import { ABSORBING } from "./budgetExile.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);
const med = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length;
                     return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

console.log("relativeBudget-selfcheck -- is a gate evicted for being slow, or for the box being slow?\n");

const REC = readTimings(DEFAULTS.timingsFile, ENG);
const T = REC.timings || {}, AT = REC.at || {}, RING = REC.serialRing || {}, SAT = REC.serialAt || {};
const B = DEFAULTS.budgetMs;
const ALL = enumerateGates(ENG);

// =============================================================================================================
sec("1. *** THE SCALE IS A READING OF THE MACHINE, AND THE GATE CANCELS OUT OF IT ***");
{
    // A fixture, because the property wanted here is one the real file cannot exhibit on demand: a box that
    // was EXACTLY 30% slow. Gate costs are deliberately spread over three orders of magnitude and the
    // inflation is uniform -- if the statistic were picking up gate size rather than box speed, a population
    // this lopsided would not land on the factor.
    const mk = (f, n = 60) => {
        const ring = {}, at = {};
        for (let i = 0; i < n; i++) { const base = 20 + i * i * 7; ring["g" + i] = [base, base, base * f]; at["g" + i] = "P"; }
        return { ring, at };
    };
    const flat = mk(1.0), slow = mk(1.3), fast = mk(0.8);
    const sFlat = boxScaleOf(flat.ring, flat.at, "P");
    const sSlow = boxScaleOf(slow.ring, slow.at, "P");
    const sFast = boxScaleOf(fast.ring, fast.at, "P");
    say(`60 gates spanning ${20} to ${20 + 59 * 59 * 7} ms: flat box ${sFlat.scale}, 1.3x box ${sSlow.scale}, 0.8x box ${sFast.scale}`);
    ok("!! *** the statistic recovers the BOX factor from gates that differ 10,000-fold in cost ***",
        sFlat.scale === 1 && sSlow.scale === 1.3 && sFast.scale === 0.8 && sSlow.n === 60,
        `each ratio is one gate against ITS OWN history, so the gate divides out; ${sSlow.n} pairs`);

    // *** AND IT IS NOT READING ABSOLUTE SIZE. *** Multiply every number in the fixture by 1000 and the
    // ratios are untouched, so the scale must be. A statistic that drifted here would be measuring the tree.
    const big = { ring: {}, at: {} };
    for (const g of Object.keys(slow.ring)) { big.ring[g] = slow.ring[g].map((v) => v * 1000); big.at[g] = "P"; }
    ok("  scaling every reading by 1000x leaves the scale identical",
        boxScaleOf(big.ring, big.at, "P").scale === sSlow.scale,
        "the quantity is a RATIO, and a ratio of a scaled pair is the pair's ratio");

    // *** ONE PASS'S EVIDENCE IS ONLY ABOUT THAT PASS. *** Gates stamped with another pass must not
    // contribute, or the scale is an average of every hour the file remembers.
    const mixed = { ring: { ...slow.ring }, at: { ...slow.at } };
    for (let i = 0; i < 200; i++) { mixed.ring["x" + i] = [100, 100, 900]; mixed.at["x" + i] = "OTHER"; }
    ok("  200 gates from a different pass, with a 9x ratio, change nothing",
        boxScaleOf(mixed.ring, mixed.at, "P").scale === sSlow.scale && boxScaleOf(mixed.ring, mixed.at, "OTHER").scale === 9,
        "the stamp is the population, and each pass is asked separately");
}

// =============================================================================================================
sec("2. *** TOO FEW PAIRS IS NOT A SCALE OF 1 -- IT IS NO SCALE, AND IT SAYS SO ***");
{
    // *** THE BOUNDARY IS FOUND, NOT ASSUMED -- AND THE FIRST CUT OF THIS SECTION GOT THAT WRONG. *** It
    // built its fixture as `SCALE_MIN_N - 1` pairs, which means the fixture MOVES WITH THE CONSTANT: drop
    // the floor to 1 and the sabotage builds a 0-pair fixture, which is still below 1, and the row stays
    // green while the guard it grades is gone. That is a check whose expectation is derived from the thing
    // it is checking, which grades nothing -- and it survived the battery only because a hardcoded "29" in
    // the row underneath happened to notice. So the floor is now LOCATED by walking population sizes from a
    // fixed 1 to a fixed 200 and asking where the answer changes.
    const pairs = (n) => { const ring = {}, at = {};
        for (let i = 0; i < n; i++) { ring["g" + i] = [100, 300]; at["g" + i] = "P"; }
        return boxScaleOf(ring, at, "P"); };
    let found = null;
    for (let n = 1; n <= 200 && found === null; n++) if (pairs(n).measured) found = n;
    const short = pairs(29), just = pairs(30);
    say(`the floor sits at ${found} pairs, found by walking 1..200; 29 pairs -> measured ${short.measured}, ` +
        `scale ${short.scale}; 30 pairs -> measured ${just.measured}, scale ${just.scale}`);
    ok("!! *** below the floor the answer is `measured: false`, which is a different claim from `1.0` ***",
        found === 30 && found === SCALE_MIN_N &&
        short.measured === false && short.scale === 1 && just.measured === true && just.scale === 3,
        `both would print "1" in a scale column; only one of them is an observation. The fixture's real ` +
        `factor is 3x, so a floor that merely ROUNDED would have shown it -- this one withholds it. THE ` +
        `LITERALS 29 AND 30 ARE THE POINT: moving SCALE_MIN_N reddens this row and makes the next round ` +
        `restate what population it believes a median over gates needs, rather than sliding the fixture ` +
        `along with the constant.`);
    ok("  and the reason names the shortfall in numbers a reader can act on",
        /\b29\b/.test(short.why) && /\b30\b/.test(short.why) && !short.why.includes("undefined"),
        short.why);

    // A gate whose pass has no entry at all is the same state, reached the other way, and it is the state
    // 338 of this tree's gates are actually in.
    const noRec = scaleOfGate({ at: { g: "P" }, boxScale: {} }, "g");
    const noStamp = scaleOfGate({ at: {}, boxScale: {} }, "g");
    ok("  an absent entry and an absent stamp both answer 1, unmeasured",
        noRec.scale === 1 && noRec.measured === false && noStamp.scale === 1 && noStamp.measured === false,
        "a pass nobody measured must not be presented as a pass that came out ordinary");

    // *** AND A HAND-WRITTEN `measured: true` IS THE ONLY WAY TO GET A DIVISOR. *** An entry missing the
    // flag is refused, so a half-written record cannot quietly start moving gates.
    const half = scaleOfGate({ at: { g: "P" }, boxScale: { P: { scale: 1.5, n: 99 } } }, "g");
    ok("  an entry without `measured: true` is refused even though it carries a scale",
        half.scale === 1 && half.measured === false,
        "scale 1.5 present and ignored -- the flag is the claim, and the number is only its value");
}

// =============================================================================================================
sec("3. *** THE CLAMP AT 1: A FAST PASS MOVES NOTHING, AND ON THIS FILE THAT SAVES FIVE GATES ***");
{
    const opt = { crossings: REC.crossings || {} };
    const base = selectGates(ALL, T, B, opt);
    const norm = selectGates(ALL, T, B, { ...opt, scaleOf: scaleLookup(REC) });
    const measured = ALL.filter((g) => scaleOfGate(REC, g).measured);
    const scales = [...new Set(measured.map((g) => (REC.boxScale[AT[g]] || {}).scale))].sort((a, b) => a - b);
    say(`${ALL.length} gates, ${measured.length} with a measured pass scale; scales in the file: ${scales.join(", ")}`);
    say(`base: ${base.run.length} run / ${base.skipped.length} skipped -- normalised: ${norm.run.length} / ${norm.skipped.length}, ` +
        `${norm.rescaled.length} readings moved, ${norm.admitted.length} readmitted`);

    // *** THE PROPERTY, DERIVED FROM THE RECORD RATHER THAN FROM THE FUNCTION UNDER TEST. *** A gate that
    // would be evicted by symmetric division is computed here with plain arithmetic on the raw file; the
    // clamped rule's own skipped set is then required to be a SUBSET of the unnormalised one. If the clamp
    // were ever dropped, the subset relation is what breaks, and it breaks by exactly these names.
    const symEvicted = ALL.filter((g) => {
        const e = REC.boxScale[AT[g]];
        return T[g] != null && T[g] <= B && e && e.measured && T[g] / e.scale > B;
    });
    const skippedBase = new Set(base.skipped);
    const newlySkipped = norm.skipped.filter((g) => !skippedBase.has(g));
    say(`symmetric division would evict ${symEvicted.length}: ` +
        (symEvicted.map((g) => `${path.basename(g)} ${T[g]}`).join(", ") || "(none)"));
    ok("!! *** NORMALISATION NEVER EVICTS: the clamped rule's skip set is a subset of the unclamped one ***",
        newlySkipped.length === 0 && norm.skipped.length <= base.skipped.length,
        `${newlySkipped.length} gates newly skipped. The population this is asserted over is non-empty and ` +
        `non-trivial: ${symEvicted.length} gate(s) sit under the wall by a margin smaller than this file's ` +
        `own measured 1.5% box variation, and a symmetric correction throws every one of them out -- for a ` +
        `box that was never slow.`);
    ok("  and the correction is live rather than inert: readings did move",
        norm.rescaled.length > 0 && norm.rescaled.every((r) => r.scale > 0 && r.ms !== r.raw),
        `${norm.rescaled.length} readings divided by a measured scale. A run where this went to zero would ` +
        `mean the whole rule had quietly stopped applying, which is the failure a green subset row cannot see.`);
}

// =============================================================================================================
sec("4. *** THE CAP: WHAT A WRONG SCALE CAN COST IS BOUNDED, AND THE BOUND IS TESTABLE ***");
{
    // The scale is measured on UNCONTENDED readings and applied to timings[g], which is usually a CONTENDED
    // one. Nothing in the record can test that assumption -- there is no parallel ring -- so it is bounded
    // instead of trusted. A record claiming an absurd 5x box is the adversary.
    const wild = { at: { a: "P", b: "P", c: "P" }, boxScale: { P: { scale: 5, n: 999, measured: true } } };
    const times = { a: B * SCALE_MAX - 100, b: B * SCALE_MAX + 100, c: B * 8 };
    const sel = selectGates(["a", "b", "c"], times, B, { scaleOf: scaleLookup(wild) });
    say(`a record claiming a 5x box, against SCALE_MAX ${SCALE_MAX}: ` +
        Object.entries(times).map(([g, ms]) => `${g} ${ms}ms -> ${normalisedMs(ms, 5).toFixed(0)}ms`).join(", "));
    ok("!! *** the worst a wrong scale can do is admit a gate at budgetMs * SCALE_MAX, never beyond ***",
        sel.run.includes("a") && sel.skipped.includes("b") && sel.skipped.includes("c") &&
        scaleOfGate(wild, "a").scale === SCALE_MAX,
        `${times.a} ms readmitted, ${times.b} and ${times.c} refused. Without the cap the 5x claim would ` +
        `readmit a ${B * 8} ms gate into a ${B} ms ship -- the assumption being wrong would then be ` +
        `unbounded, and it is instead worth at most ${(SCALE_MAX - 1) * 100}% of one gate's budget.`);
    ok("  and every gate selectGates admits by this rule obeys that bound on the real record",
        selectGates(ALL, T, B, { crossings: REC.crossings || {}, scaleOf: scaleLookup(REC) })
            .admitted.every((g) => T[g] <= B * SCALE_MAX),
        "asserted over the live population as well as the fixture -- today that population is empty, which " +
        "is why the fixture above exists and carries the row");
    // *** AND THE CAP'S VALUE IS PEGGED, NOT JUST ITS EXISTENCE. *** Every row above grades that a cap is
    // there; none of them would notice it moving to 10, because each fixture is sized from the constant. The
    // value is a judgement -- how much of a wrong assumption the ship is willing to be wrong by -- and a
    // round that changes it should have to say so here rather than inherit the sentence above.
    ok("  the cap is 2x, and that number is a decision this row makes a round restate to change",
        SCALE_MAX === 2,
        `a gate readmitted by a slow pass costs the ship at most ${DEFAULTS.budgetMs * SCALE_MAX} ms instead ` +
        `of ${DEFAULTS.budgetMs}. Two is where the measured spread stops being a box and starts being a ` +
        `finding: this file's own passes sit within 1.5% of their history, v4536 recorded 12-36% between ` +
        `hours, and v4562 measured 8-way contention at a 2.41x median -- so a 2x correction already spans ` +
        `every box effect the tree has ever measured, and past it the right answer is to retake the reading.`);
}

// =============================================================================================================
sec("5. *** THE SCENARIO THE ROUND IS FOR: A SLOW BOX, AND WHAT IT COSTS WITH AND WITHOUT THE REPAIR ***");
{
    // Take the tree's real readings, run them through a box that is f times slow, and let the writer's own
    // statistic measure that box from a ring inflated the same way. Nothing here is hand-fed a scale: the
    // number the selection divides by is the number boxScaleOf derives, which is the composition that
    // actually ships.
    const pool = ALL.filter((g) => T[g] != null && AT[g] && AT[g] !== "unknown -- before v4408");
    const rows = [];
    // The factors below the cap are LITERALS -- they are the numbers this round measured and quotes, and a
    // list that slid with the constant would quietly restate the finding every time somebody retuned it. The
    // last one is derived, because its only job is to be past the cap, and a hardcoded 2.5 stops being that
    // the moment SCALE_MAX moves: the first cut of this section did exactly that, and raising SCALE_MAX to 3
    // made `rows.find(r => r.f > SCALE_MAX)` undefined, whereupon the row's own detail string dereferenced it
    // and the GATE DIED. A gate that throws where it meant to fail reports nothing at all, which is strictly
    // worse than a red -- ship-time sees a death and not a finding.
    for (const f of [1.0, 1.1, 1.26, 1.5, 2.0, SCALE_MAX + 0.5]) {
        const ring = {}, sAt = {}, times = {}, at = {};
        for (const g of pool) { times[g] = T[g] * f; at[g] = "SLOW"; ring[g] = [100, 100, 100 * f]; sAt[g] = "SLOW"; }
        const bs = boxScaleOf(ring, sAt, "SLOW");
        const rec = { at, boxScale: { SLOW: bs } };
        const wrong = pool.filter((g) => T[g] <= B && times[g] > B);            // evicted for the box alone
        const back = new Set(selectGates(wrong, times, B, { scaleOf: scaleLookup(rec) }).run);
        rows.push({ f, scale: bs.scale, wrong: wrong.length, saved: back.size });
        say(`box ${f.toFixed(2)}x -> scale measured ${bs.scale}: ${wrong.length} gates evicted for the box, ${back.size} recovered`);
    }
    const hurt = rows.filter((r) => r.wrong > 0);
    const covered = rows.filter((r) => r.f <= SCALE_MAX);
    ok("!! *** every gate evicted purely by a slow box comes back, up to the cap ***",
        covered.every((r) => r.saved === r.wrong) && hurt.length >= 4 && hurt[0].wrong >= 20,
        `${covered.map((r) => `${r.saved}/${r.wrong} at ${r.f}x`).join(", ")}. The row is asserted over a ` +
        `NON-EMPTY harm: at 1.0x nothing is evicted and nothing needs saving, which any rule at all would ` +
        `pass, so the assertion requires the damage to exist before crediting the repair.`);
    const beyond = rows.find((r) => r.f > SCALE_MAX) || { f: 0, saved: 0, wrong: 0 };
    ok("  and beyond the cap it declines rather than pretending, which is the cap working",
        beyond.f > SCALE_MAX && beyond.saved < beyond.wrong && beyond.saved > 0,
        `at ${beyond.f}x it recovers ${beyond.saved} of ${beyond.wrong} and leaves ${beyond.wrong - beyond.saved} out. ` +
        `A box that far gone is not a correction's problem -- it is a finding, and the readings taken on it ` +
        `should be retaken. SCALE_MAX is where the rule stops guessing.`);
}

// =============================================================================================================
sec("6. *** A RECORD THAT KNOWS NOTHING SELECTS EXACTLY AS THE TREE DID BEFORE v4672 ***");
{
    const opt = { crossings: REC.crossings || {} };
    const before = selectGates(ALL, T, B, opt);                                   // no scaleOf at all
    const empty = selectGates(ALL, T, B, { ...opt, scaleOf: scaleLookup({ at: AT, boxScale: {} }) });
    const same = (a, b) => a.run.join("\u0000") === b.run.join("\u0000") && a.skipped.join("\u0000") === b.skipped.join("\u0000") &&
                           a.unmeasured.join("\u0000") === b.unmeasured.join("\u0000") && a.onProbation.join("\u0000") === b.onProbation.join("\u0000");
    const unmeasuredGates = ALL.filter((g) => !scaleOfGate(REC, g).measured);
    const live = selectGates(ALL, T, B, { ...opt, scaleOf: scaleLookup(REC) });
    const liveSame = unmeasuredGates.every((g) => (live.run.includes(g) === before.run.includes(g)) &&
                                                  (live.skipped.includes(g) === before.skipped.includes(g)));
    say(`${unmeasuredGates.length} of ${ALL.length} gates belong to a pass with no measured scale -- 21 of the ` +
        `file's 22 capture passes are too old to have paired ring history`);
    ok("!! *** an empty boxScale is byte-identical to the pre-v4672 rule, in all four returned sets ***",
        same(before, empty) && before.run.length > 1000,
        `a tree that has never run the new writer -- every foreign box, and this one until the backfill -- ` +
        `keeps the exact selection it had. The rule is opt-in on EVIDENCE, not on a version number.`);
    ok("  and on the live record, the gates with no measured scale are decided identically too",
        liveSame && unmeasuredGates.length > 100,
        `${unmeasuredGates.length} gates, none of them moved by a scale that was never taken`);
}

// =============================================================================================================
sec("7. *** THE RECORD ON DISK REPRODUCES FROM THE RING, SO IT CANNOT OUTLIVE ITS OWN REPAIR ***");
{
    const scale = REC.boxScale || {};
    const keys = Object.keys(scale);
    const serialStamps = new Set(Object.values(SAT));
    const direct = keys.filter((k) => serialStamps.has(k));
    const eq = (a, b) => a && b && a.scale === b.scale && a.n === b.n && a.measured === b.measured;
    const bad = direct.filter((k) => !eq(scale[k], boxScaleOf(RING, SAT, k)));
    // An `at`-stamp alias must be the same object's values as some serial stamp's -- a sweep files one
    // measurement under both of the two stamps it writes, and an alias pointing at nothing measurable is a
    // hand edit.
    const alias = keys.filter((k) => !serialStamps.has(k));
    const orphan = alias.filter((k) => !direct.some((d) => eq(scale[k], scale[d])));
    say(`${keys.length} boxScale entries: ${direct.length} keyed by a serial capture stamp, ${alias.length} aliased to an \`at\` stamp`);
    for (const k of direct) say(`  ${k}  scale ${scale[k].scale}  n ${scale[k].n}`);
    ok("!! *** every stored scale recomputes, to the digit, from the serialRing still in the file ***",
        keys.length > 0 && bad.length === 0 && direct.length > 0,
        `${bad.length} entries disagree with boxScaleOf run over the ring now. A scale edited by hand, or ` +
        `left behind by a rule that changed, reddens here -- which is the guard this tree has had to add ` +
        `after the fact more than once.`);
    ok("  and no alias points at a measurement that does not exist",
        orphan.length === 0 && alias.length > 0,
        `${alias.length} \`at\` aliases, ${orphan.length} orphaned`);
    // *** THE WRITTEN FIELD IS REACHED BY THE READER. *** A field written and never read is this session's
    // most-repeated defect; the live selection above proves the path, and this proves the file carries it.
    const raw = JSON.parse(fs.readFileSync(path.join(ENG, DEFAULTS.timingsFile), "utf8"));
    ok("  the field is in the file on disk, not only in the object the reader assembles",
        !!raw.boxScale && Object.keys(raw.boxScale).length === keys.length,
        `${Object.keys(raw.boxScale || {}).length} entries read straight off the JSON`);
    // *** AND THE FILE'S OWN NOTE EXPLAINS IT -- ASSERTED AGAINST THE WRITER, NOT AGAINST THE FILE. *** The
    // note is a string quickSweep emits on every write, so the copy ON DISK only mentions a v4672 field once
    // a v4672 sweep has run. Grading the disk copy would red on any clone that has not swept yet, which is a
    // statement about sweep history wearing the costume of a statement about documentation. The writer is
    // where the fact lives, so the writer is what is read.
    const writer = fs.readFileSync(path.join(ENG, "tools", "ship", "quickSweep.mjs"), "utf8");
    const noteBlock = (writer.match(/note:\s*"[\s\S]*?",\n\s{12}\/\//) || [""])[0];
    ok("  and the note the writer emits explains the field, as it does every other field in there",
        /`boxScale` \(v4672\)/.test(noteBlock) && /SCALE_MIN_N/.test(noteBlock) && /SCALE_MAX/.test(noteBlock),
        `${noteBlock.length} characters of note text, carrying the field name, the floor and the cap`);
}

// =============================================================================================================
sec("8. *** THE WRITTEN-DOWN RULE MOVED WITH THE CODE ***");
{
    // budgetExile.ABSORBING exists so a check can fail on the rule rather than on a paraphrase of it. The
    // rule changed this round, and a stale copy of it there would be the file's own complaint turned inward.
    say(ABSORBING.skipRule);
    ok("!! *** budgetExile's stated skip rule names the divisor, not just the recorded time ***",
        /divid/i.test(ABSORBING.skipRule) && /scale/i.test(ABSORBING.skipRule) && /SCALE_MAX/.test(ABSORBING.skipRule),
        "the module whose whole subject is a rule that outlived its repair is the last place to leave one");
}

// =============================================================================================================
sec("9. *** AND THE SWEEP ACTUALLY HANDS IT THE RECORD -- THE COMPOSITION, NOT THE FUNCTION ***");
{
    // *** A RULE selectGates KNOWS AND runQuickSweep NEVER PASSES IT IS A MECHANISM NOBODY INVOKES. *** Every
    // section above drives selectGates directly, which is exactly the shape that lets a round ship a correct
    // function wired to nothing -- this session's most-repeated defect, and budgetExile.demonstrateAbsorbing
    // is in the tree for the same reason. So: a fixture filing ONE cheap gate at 1.8x the budget, beside a
    // boxScale saying the pass that took that reading ran on a 1.9x box. The real sweep is then run over it.
    // If the wiring is missing the gate is exiled and `ran` is 0, whatever selectGates would have decided.
    const gate = "ev/tools/es-tactics-selfcheck.mjs";
    const rel = path.join("tools", "ship", ".relativeBudget-fixture-timings.json");
    const abs = path.join(ENG, rel);
    const P = "2026-01-01T00:00:00.000Z";
    const seed = (boxScale) => fs.writeFileSync(abs, JSON.stringify({ captured: null, budgetMs: B,
        capMs: DEFAULTS.capMs, timings: { [gate]: Math.round(B * 1.8) }, codes: { [gate]: 0 },
        at: { [gate]: P }, boxScale }, null, 1));
    const sweep = () => runQuickSweep({ gates: [gate], budgetMs: B, timingsFile: rel, root: ENG,
                                        write: false, workers: 1, serialSliceMs: 0, log: () => {} });
    try {
        seed({ [P]: { scale: 1.9, n: 500, measured: true } });
        const withScale = await sweep();
        seed({});                                    // the control: identical but for the measurement
        const without = await sweep();
        say(`${gate} filed at ${Math.round(B * 1.8)} ms against a ${B} ms budget: ` +
            `with a 1.9x pass scale it ran ${withScale.ran} / skipped ${withScale.skippedOverBudget}; ` +
            `with no scale it ran ${without.ran} / skipped ${without.skippedOverBudget}`);
        ok("!! *** runQuickSweep PASSES THE SCALE: the same gate and the same reading go both ways on it ***",
            withScale.ran === 1 && withScale.skippedOverBudget === 0 &&
            without.ran === 0 && without.skippedOverBudget === 1,
            `the control is what makes this a statement about the wiring rather than about the budget -- ` +
            `one fixture differing in a single field, through the real sweep, with opposite outcomes. ` +
            `${Math.round(B * 1.8)} / 1.9 = ${Math.round(B * 1.8 / 1.9)} ms, under the wall.`);
    } finally {
        try { fs.unlinkSync(abs); } catch { /* scratch: a failed unlink is not a finding */ }
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: the ship-time budget is a fixed 3,000 ms wall in front of millisecond readings " +
    "taken on a box that moves 12-36% between hours. A gate over the wall only because of the hour it was " +
    "measured in is exiled for a property of the machine, and nothing about the exile says which. v4672 " +
    "divides each reading by the measured speed of the capture pass that took it." +
    "\nWHAT IS NOT CLAIMED: that the scale applies exactly to the number it divides. It is measured on " +
    "UNCONTENDED readings (serialRing) and applied to timings[g], which is usually a CONTENDED sample -- " +
    "that assumes a slow box slows both alike, and nothing in the record can test it, because there is no " +
    "parallel ring. Section 4 is the answer: the assumption is BOUNDED rather than trusted, clamped below " +
    "at 1 so it can never evict and above at SCALE_MAX so a wrong scale is worth at most one budget's " +
    "width of one gate." +
    "\nAND NOT CLAIMED: that any gate's recorded time is right. This grades the comparison, not the reading. " +
    "tools/ship/sweepRotation.mjs is what re-measures, and costOf() is what a consumer should ask for a cost.");
process.exit(fails ? 1 : 0);
