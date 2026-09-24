// WebGLEngine/tools/ship/orphanSets-selfcheck.mjs -- v4673
//
// *** A RATCHET THAT COUNTS CANNOT TELL PAYDOWN FROM CHURN, AND FOR TEN DAYS THIS TREE'S THREE ORPHAN
// RATCHETS DID EXACTLY THAT. ***
//
// tools/ship/orphanSets.mjs replaces three bare integers -- ORPHAN_UTIL_BASELINE 159, RESCUED_CEILING 288,
// RITUAL_CEILING 39 -- with three recorded SETS. The header there carries the measurement; this file grades
// the rule.
//
// THE ROW THAT MATTERS IS SECTION 2. A count ratchet compares lengths, so paying one module down and
// admitting one new orphan is INVISIBLE to it: same number, different tree. That is not a hypothetical --
// graveyard measured 157 under a ceiling of 159 on the day this round started, holding two open slots, and
// the prose-rescued population netted five real paydowns against eighteen arrivals into a single "+14" that
// attributed nothing. Section 2 drives that exact substitution and shows the count passing where the set
// fails, which is the whole reason the slack tolerance was deleted rather than ported.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RECORDED, POPULATIONS, ratchet, ADMITTED_V4673, PAID_DOWN_SINCE_FC12EEF } from "./orphanSets.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("orphanSets-selfcheck -- can the orphan ratchet say WHAT moved, not just THAT it moved?\n");

// =============================================================================================================
sec("1. *** THE RULE NAMES BOTH DIRECTIONS, AND NEITHER IS INFERRED FROM THE OTHER ***");
{
    const base = RECORDED.orphanUtils;
    const same = ratchet("orphanUtils", base);
    const plus = ratchet("orphanUtils", [...base, "zzz/invented.mjs"]);
    const minus = ratchet("orphanUtils", base.slice(1));
    say(`the recorded sets: ${POPULATIONS.map((p) => `${p} ${RECORDED[p].length}`).join(", ")}`);
    ok("!! *** an unchanged census is silent; an arrival is named; a departure is named ***",
        same.arrived.length === 0 && same.left.length === 0 &&
        plus.arrived.length === 1 && plus.arrived[0] === "zzz/invented.mjs" && plus.left.length === 0 &&
        minus.left.length === 1 && minus.left[0] === base[0] && minus.arrived.length === 0,
        `arrival reported as "${plus.arrived[0]}", departure as "${minus.left[0]}" -- the two are computed ` +
        `independently, so one cannot be derived by negating the other`);
    ok("  an unknown population throws rather than answering about nothing",
        (() => { try { ratchet("notAPopulation", []); return false; } catch { return true; } })(),
        "a typo'd name must not silently grade an empty set, which passes forever");
}

// =============================================================================================================
sec("2. *** THE ROW THE ROUND EXISTS FOR: A COUNT PASSES THE SUBSTITUTION, A SET DOES NOT ***");
{
    // One module paid down, one fresh orphan arrived. Identical LENGTH, different TREE.
    const base = RECORDED.proseRescued;
    const churned = [...base.slice(1), "zzz/a-new-orphan.mjs"];
    const R = ratchet("proseRescued", churned);
    const countWouldPass = churned.length <= base.length;         // the retired rule, spelled out here
    say(`${base.length} recorded, ${churned.length} measured after one paydown and one arrival`);
    ok("!! *** THE RETIRED COUNT RULE PASSES THIS TREE AND THE SET RULE CATCHES IT ***",
        countWouldPass === true && R.arrived.length === 1 && R.arrived[0] === "zzz/a-new-orphan.mjs" &&
        R.left.length === 1 && R.left[0] === base[0],
        `length ${churned.length} <= ${base.length} so the ceiling is satisfied and reports nothing, while ` +
        `the set names BOTH the arrival and the paydown. This is not a contrived case: the prose-rescued ` +
        `population did exactly this five times over between fc12eef and v4673, and the row printed one ` +
        `number that hid all five.`);
    // *** AND THE SLACK IS GONE, WHICH IS THE OTHER HALF. *** Under a count, a paydown BANKS a slot.
    const bankedTwo = ratchet("proseRescued", [...base.slice(2), "zzz/x.mjs", "zzz/y.mjs"]);
    ok("  two paydowns do not bank two slots for two arrivals",
        bankedTwo.arrived.length === 2 && bankedTwo.now === bankedTwo.recorded,
        `the census total is unchanged at ${bankedTwo.now}, and both arrivals are still named. A DEPARTURE ` +
        `IS NOT A VACANCY -- which is why the retired "ceiling - actual <= 8" tolerance has nothing left to ` +
        `protect and was deleted rather than carried across.`);
}

// =============================================================================================================
sec("3. *** THE RECORDED SETS ARE WELL-FORMED, AND NON-TRIVIALLY POPULATED ***");
{
    const bad = [];
    for (const p of POPULATIONS) {
        const v = RECORDED[p];
        if (!v.length) bad.push(`${p} is EMPTY -- an empty recorded set admits every future orphan silently`);
        if (new Set(v).size !== v.length) bad.push(`${p} has duplicate entries`);
        if (v.some((m) => /-selfcheck\.mjs$/.test(m))) bad.push(`${p} contains a GATE, which these populations exclude by definition`);
        if (v.some((m) => m.startsWith("/") || m.includes("\\"))) bad.push(`${p} has a non-repo-relative path`);
        if (v.some((m) => !fs.existsSync(path.join(ENG, m)))) bad.push(`${p} names a file that does not exist: ${v.filter((m) => !fs.existsSync(path.join(ENG, m))).join(", ")}`);
    }
    ok("!! *** every recorded name is a real, non-gate, repo-relative module and no list is empty ***",
        bad.length === 0 && POPULATIONS.length === 3,
        bad.length ? bad.join(" | ") : `${POPULATIONS.length} populations, ${POPULATIONS.reduce((n, p) => n + RECORDED[p].length, 0)} names, all resolving to files on disk`);
    // A NAME THAT NO LONGER EXISTS IS THE QUIET FAILURE: the module was deleted, the census stopped seeing
    // it, and the record kept a slot open that nothing will ever fill. Asserted above rather than reported.
}

// =============================================================================================================
sec("4. *** ritualHidden IS A SUBSET OF proseRescued, BECAUSE IT IS DERIVED AS ONE ***");
{
    // referenceKind computes `ritual` by FILTERING `rescued`. That makes containment a structural fact, not a
    // coincidence -- and a hand edit to one list without the other is the likeliest way this record rots.
    const resc = new Set(RECORDED.proseRescued);
    const strays = RECORDED.ritualHidden.filter((m) => !resc.has(m));
    ok("!! *** no module is recorded as ritual-hidden without being recorded as prose-rescued ***",
        strays.length === 0 && RECORDED.ritualHidden.length > 0 &&
        RECORDED.ritualHidden.length < RECORDED.proseRescued.length,
        strays.length ? `STRAYS: ${strays.join(", ")}`
                      : `${RECORDED.ritualHidden.length} of ${RECORDED.proseRescued.length} rescued modules are held off the census by the ship ritual's own closing paragraph`);
}

// =============================================================================================================
sec("5. *** THE RECKONING MATCHES THE RECORD: ADMITTED ARE IN, PAID DOWN ARE OUT ***");
{
    const inAny = (m) => POPULATIONS.some((p) => RECORDED[p].includes(m));
    const missing = ADMITTED_V4673.filter((a) => !inAny(a.module)).map((a) => a.module);
    const lingering = PAID_DOWN_SINCE_FC12EEF.filter(inAny);
    say(`${ADMITTED_V4673.length} modules admitted at v4673; ${PAID_DOWN_SINCE_FC12EEF.length} paid down since fc12eef`);
    ok("!! *** every admitted module is actually in a recorded set, and every paid-down one is in none ***",
        missing.length === 0 && lingering.length === 0 && ADMITTED_V4673.length > 0,
        (missing.length ? `ADMITTED BUT NOT RECORDED: ${missing.join(", ")} ` : "") +
        (lingering.length ? `PAID DOWN BUT STILL RECORDED: ${lingering.join(", ")}` : "") ||
        `the admission list is a reckoning of the baseline and not a separate opinion about it -- a module ` +
        `named as admitted while absent from every set would be an explanation for debt that is not there`);
    const top = [...ADMITTED_V4673].sort((a, b) => b.gates - a.gates).slice(0, 4);
    say(`most-imported admissions: ${top.map((a) => `${a.module} (${a.gates} gates)`).join(", ")}`);
}

// =============================================================================================================
sec("6. *** EVERY RECORDED POPULATION IS ACTUALLY CHECKED BY A GATE ***");
{
    // *** A POPULATION NOBODY ASSERTS ON IS A LIST, NOT A RATCHET. *** Adding a fourth set here and wiring it
    // nowhere would leave this file looking richer and grading nothing, which is this tree's most-repeated
    // defect. The consumers are read from disk rather than trusted.
    const consumers = ["tools/ship/graveyard-selfcheck.mjs", "tools/ship/referenceKind-selfcheck.mjs"]
        .map((f) => fs.readFileSync(path.join(ENG, f), "utf8")).join("\n");
    const unchecked = POPULATIONS.filter((p) => !new RegExp('ratchet\\("' + p + '"').test(consumers));
    ok("!! *** no recorded population is unguarded: each one is passed to ratchet() by a real gate ***",
        unchecked.length === 0,
        unchecked.length ? `UNGUARDED: ${unchecked.join(", ")}` : `all ${POPULATIONS.length} are asserted on`);
    // *** AND THE RETIRED CEILINGS ARE NOT STILL LIVE. *** A number left behind beside the set is the two
    // spellings of one rule this session has spent rounds removing.
    const live = [...consumers.matchAll(/const (ORPHAN_UTIL_BASELINE|RESCUED_CEILING|RITUAL_CEILING) = (\d+)/g)]
        .map((m) => `${m[1]} = ${m[2]}`);
    ok("  and no retired ceiling constant is still holding a number",
        live.length === 0,
        live.length ? `STILL NUMERIC: ${live.join(", ")}` : "all three read from the recorded set instead");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: three ratchets guarded the orphan census and all three stored a COUNT. A count " +
    "says it moved and can never say what moved -- so a breach reading '167 now vs 159 recorded' named " +
    "nobody, and recovering the twelve arrivals cost a git worktree at fc12eef and four census runs. The " +
    "record is a SET now, the count is derived from it, and both directions are printed." +
    "\nWHAT IS NOT CLAIMED: that any recorded module SHOULD be an orphan. This grades the bookkeeping, not " +
    "the debt. tools/ship/orphanSets.mjs is a register in the sense tools/ship/unwiredRegister.mjs is -- " +
    "debt with a name on it -- and the twenty-six admitted at v4673 are recorded so the next arrival is " +
    "visible against them, not excused by them." +
    "\nAND NOT CLAIMED: that the two populations the admissions expose -- four COMMANDS invoked by a composed " +
    "path, and four SHARED GATE HELPERS with 8 to 36 distinct gate importers -- are correctly filed as " +
    "orphans. They are not, and naming them changes what the census MEASURES, which is a round that must " +
    "not run while this baseline is being established.");
process.exit(fails ? 1 : 0);
