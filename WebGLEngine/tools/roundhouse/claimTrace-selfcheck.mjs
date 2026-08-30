// tools/roundhouse/claimTrace-selfcheck.mjs
//
// Run: node tools/roundhouse/claimTrace-selfcheck.mjs   (~605s MEASURED (gate-timings.json))
//
// v3182 -- IS A CLAIMED NUMBER SUPPORTED BY DATA ANYONE CAN GET BACK TO?
//
// The lab's gates are dense with measured numbers written into prose, which is the tree's best habit. *** BUT A
// NUMBER WITHOUT ITS CONFIGURATION IS NOT A RESULT, IT IS AN ANECDOTE *** -- and this session was bitten by
// exactly that four times: kh's "76%" was ONE MODE'S error carried as the device's verdict; "114 round-trip
// controls" was OCCURRENCES reported as controls; "119 orphans" undercounted by a third; "no PDF path exists"
// was a narrow grep. Every one was a claim the data no longer supported, and nothing compared them.
//
// *** MEASURED: 34 numeric claims across 9 lab gates, and only 8 -- 24% -- can be reproduced by running the
// device they name at ANY DECLARED MODE. *** Sweeping every mode instead of the default recovered only ONE, so
// "wrong mode" is not the explanation.
//
// THE EXPLANATION IS THAT THE REST ARE CONFIG-SPECIFIC AND THE CONFIG WAS NOT WRITTEN DOWN. A pair like
// 0.05226212549 / 0.05226212465 is a REFINEMENT SEQUENCE at two grid settings; 373.15 is an INPUT; 0.005 and
// 0.02 are TOLERANCES; blackhole's twelve-digit values come from one knob setting. EVERY ONE IS LEGITIMATE.
// NONE can be re-derived from the prose alone.
//
// *** AND THE SPLIT IS THE FINDING, NOT THE RATIO. *** khGrowthKey and khMichalke are 100% traceable -- they
// cite an EXTERNAL key and a DEFAULT-MODE output. escapeBudget is 11 of 11 untraceable -- every number from a
// sweep. THE GATES THAT CITE SOMETHING OUTSIDE THEMSELVES ARE THE ONES ANYBODY CAN CHECK.
//
// A REPORT, NOT A RULE. It cannot tell a tolerance from a stale measurement -- both are numbers the device does
// not currently emit -- and failing a build on that would punish every gate that states a threshold. What it
// CAN say is: HERE ARE THE CLAIMS NOBODY CAN CHECK WITHOUT ASKING THE AUTHOR.

import path from "node:path";
import fsMod from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const C = await import(pathToFileURL(path.join(HERE, "claimTrace.mjs")).href);
const D = await import(pathToFileURL(path.join(HERE, "devices.mjs")).href);
const K = await import(pathToFileURL(path.join(HERE, "knobGate.mjs")).href);

// v3216 -- *** THIS WAS A HAND-TYPED LIST OF TWENTY-FIVE MODES, AND IT WENT STALE THE MOMENT DEVICES LEARNED
// TO DECLARE THEIR OWN. *** It was written at v3182, before the v3189-v3194 arc made 33 of 34 devices EXPORT
// their modes, and it has never been updated: it has no "apery", no "exact", no "hold", no "sabotage", and none
// of the modes added since -- angles, angleFreq, angleLinear, integrator, yield, creep, cap, creepFree.
//
// THE COST IS THAT THE RATCHET HAS BEEN RECORDING TRACEABLE CLAIMS AS UNTRACEABLE. Measured: sweeping the
// DERIVED mode set instead of this list takes zeta from ONE untraceable claim to ZERO -- its control, Apery's
// constant, is emitted as `closedForm` by the apery mode this list does not contain -- and gyroscope from FOUR
// to ONE. v3182's finding that "sweeping every mode recovered only ONE of 27" was true about the lab it
// measured, and the lab changed underneath it.
//
// A SECOND DECLARATION OF WHICH MODES EXIST is the defect singleSource-selfcheck exists to catch and the one
// v3211 spent a round removing. deviceModeTable() is the tree's one answer; this asks it.
const TABLE = await (await import(pathToFileURL(path.join(HERE, "deviceModes.mjs")).href)).deviceModeTable(D, K.checkMode);
const MODES = [...new Set(Object.values(TABLE).flat())].sort();
// v4005 -- THE TABLE GOES IN, not just the flattened union. Passing only MODES made claimTrace re-derive each
// device's modes by asking checkMode, which answers "yes" to everything for the 18 devices that do not
// validate -- 7,499 builds instead of 461, and the gate timed out at 3000s with no output at all. The union is
// still passed because claimTrace keeps it as the fallback for a caller with no table.
const r = await C.claimTrace(ENG, D, K, { modes: MODES, table: TABLE });

// ---- 1. THE TRACE RUNS AND SPLITS ------------------------------------------------------------------------------
{
    ok("!! the lab's numeric claims are traced against the devices that produced them",
        r.gates >= 6 && r.total >= 20,
        r.total + " claims across " + r.gates + " gates naming exactly one device. A gate naming TWO is SKIPPED " +
        "rather than guessed at -- attributing a number to whichever device was mentioned first would be a " +
        "CONFIDENT WRONG ANSWER, which is worse than no answer");

    // v3218 -- *** THIS ASSERTED THAT MOST CLAIMS ARE UNTRACEABLE, AND IT WENT RED BECAUSE THAT STOPPED BEING
    // TRUE. *** `r.unreproducible > r.total / 2` froze a ROUND'S OUTCOME as an invariant -- one of the named
    // species on this project's list -- so the gate failed the moment traceability improved. Deriving the mode
    // set from deviceModeTable() (the parallel v3216 round) recovered four claims and took the tally to 22 of
    // 47: TWENTY-FIVE ARE NOW REPRODUCIBLE, and "most cannot" is simply false.
    //
    // A CHECK THAT GOES RED WHEN THE THING IT MEASURES GETS BETTER TEACHES PEOPLE TO EDIT GATES INSTEAD OF
    // READING THEM. The durable claim was never "most fail" -- it is that a SUBSTANTIAL, NAMED remainder is
    // config-specific, which the per-gate ratchet below already enforces and which is where the work is. This
    // now asserts that the split is REAL AND REPORTED: both sides non-empty, so neither a lab where everything
    // traces nor one where nothing does could pass it silently.
    //
    // *** IF THE UNTRACEABLE SIDE EVER REACHES ZERO, THIS LINE GOES RED AND SHOULD BE DELETED WITH THE RATCHET,
    // NOT WEAKENED -- a lab with no untraceable claims does not need a gate watching the number. ***
    ok("!! *** the traceable/untraceable split is real, and both sides are reported ***",
        r.unreproducible > 0 && (r.total - r.unreproducible) > 0,
        r.unreproducible + " of " + r.total + " -- only " + (r.total - r.unreproducible) + " reproducible. " +
        "v3182 measured that sweeping every declared mode recovered ONLY ONE, and THAT MEASUREMENT EXPIRED " +
        "WHEN THE LAB LEARNED TO DECLARE ITS MODES: this gate swept a HAND-TYPED LIST of 25 written before the " +
        "v3189-v3194 arc, and deriving the set from deviceModeTable() at v3216 recovered FOUR MORE (zeta's " +
        "Apery constant, blobKelvinBind, and three of gyroscope's four) and took the tally 26 -> 22. So 'wrong " +
        "mode' explained more than anyone thought, and the rest is still config-specific. The remainder is not the " +
        "explanation. They are CONFIG-SPECIFIC and the config was not written down");

    ok("!! and the SPLIT is the finding, not the ratio",
        (() => {
            const clean = r.rows.filter((x) => x.unmatched.length === 0).map((x) => x.gate);
            const dirty = r.rows.filter((x) => x.unmatched.length === x.claims).map((x) => x.gate);
            return clean.length >= 2 && dirty.length >= 2;
        })(),
        "fully traceable: " + r.rows.filter((x) => !x.unmatched.length).map((x) => x.gate).join(", ") +
        " -- these cite an EXTERNAL key or a DEFAULT-MODE output. Fully untraceable: " +
        r.rows.filter((x) => x.unmatched.length === x.claims).map((x) => x.gate).join(", ") +
        " -- every number from a sweep. THE GATES THAT CITE SOMETHING OUTSIDE THEMSELVES ARE THE ONES ANYBODY " +
        "CAN CHECK");
}

// ---- 2. IT REFUSES TO BE A RULE, AND USES THE RIGHT INSTRUMENT ---------------------------------------------------
{
    const src = fsMod.readFileSync(path.join(HERE, "claimTrace.mjs"), "utf8");
    ok("!! nothing here fails a build on an unmatched number",
        !/process\.exit/.test(src) && !/throw new Error/.test(src),
        "it CANNOT tell a tolerance from a stale measurement -- both are numbers the device does not currently " +
        "emit -- and failing on that would punish EVERY GATE THAT STATES A THRESHOLD. v3103: a report is where " +
        "a real judgement goes when source alone cannot decide");

    ok("!! modes are read through checkMode, never through build()",
        /K\.checkMode\(d, m\)/.test(src) || /checkMode\(d, m\)/.test(src),
        "build() SILENTLY DEFAULTS an unknown mode -- v3144 measured 26 of 26 devices doing it -- so asking " +
        "build() which modes exist returns EVERY STRING YOU TRY. That exact mistake cost a whole measurement at " +
        "v3174, in a session where the finding was already written down");

    ok("...and a gate naming two devices is SKIPPED rather than attributed",
        /if \(named\.length !== 1\) continue;/.test(src),
        "a number attributed to the wrong device would be re-derived, disagree, and be reported as a stale " +
        "claim -- a finding manufactured by the instrument");
}

// ---- 4. v3185: THE RATCHET -- THE 26 ARE FROZEN, AND NOTHING MAY ADD TO THEM ---------------------------------
// v3182 measured 26 untraceable claims and could do nothing about them: FIXING ONE MEANS STATING THE CONFIG
// THAT PRODUCED ITS NUMBER, which is domain knowledge its author has and I do not. *** GUESSING A CONFIG WOULD
// BE FABRICATING PROVENANCE *** -- inventing the very thing this arc exists to make trustworthy, which would be
// worse than the gap.
//
// So the existing 26 stay, NOT APPROVED, and the ratchet stops the pile growing.
//
// *** A TALLY, NOT A LIST, AND v3142 IS WHY. *** That round stored a baseline as a set of file+rule KEYS,
// planted a sabotage, AND IT PASSED -- several tells in one file collapse to one key, so a file going from
// three to five was INVISIBLE. Here a gate going from 2 untraceable claims to 5 is the same failure. A
// violation is A NEW GATE **OR** A GATE WHOSE COUNT ROSE, and those two get different messages because "this
// appeared" and "this got worse" send you to different places.
{
    const base = JSON.parse(fsMod.readFileSync(path.join(HERE, "claim-trace-baseline.json"), "utf8"));
    const now = {};
    for (const x of r.rows) if (x.unmatched.length) now[x.gate] = x.unmatched.length;

    if (process.env.SWEK_FREEZE_CLAIM_TRACE === "1") {
        base.gates = now; base.total = r.total; base.untraceable = r.unreproducible;
        fsMod.writeFileSync(path.join(HERE, "claim-trace-baseline.json"), JSON.stringify(base, null, 1));
        console.log("  ----  RE-FROZEN at " + r.unreproducible + " untraceable across " + Object.keys(now).length + " gates.");
    }

    const appeared = Object.keys(now).filter((g) => !(g in base.gates));
    const grew = Object.keys(now).filter((g) => g in base.gates && now[g] > base.gates[g])
                                 .map((g) => g + " (" + base.gates[g] + " -> " + now[g] + ")");
    const shrunk = Object.keys(base.gates).filter((g) => (now[g] || 0) < base.gates[g])
                                          .map((g) => g + " (" + base.gates[g] + " -> " + (now[g] || 0) + ")");

    ok("!! no gate has NEW untraceable claims",
        appeared.length === 0,
        // v4075 -- *** THIS NAMED TWENTY-TWO GATES AND NOT ONE COUNT, so bellBind's single claim and
        // tempering's nine read identically and there was no way to tell where the weight was. Same defect
        // this session fixed in boundaryLint, whose failure printed four newcomers out of eleven. A list
        // without magnitudes is a set membership test wearing a report's clothes.
        appeared.length ? "APPEARED: " + appeared.map((g) => g + " (" + now[g] + ")").join(", ") : "none. A gate that starts citing numbers nobody " +
        "can re-derive is the pile growing, and the pile is already 26");

    ok("!! *** and no gate's untraceable count has GROWN ***",
        grew.length === 0,
        grew.length ? "GREW: " + grew.join(", ") : "none. v3142 STORED A LIST OF KEYS, PLANTED A SABOTAGE AND IT " +
        "PASSED -- a file going from three tells to five was invisible because they collapse to one key. A " +
        "TALLY catches it and a list does not");

    ok("...and a SHRUNK count is reported, so a win can be recorded rather than kept as headroom",
        true,
        shrunk.length ? "SHRUNK: " + shrunk.join(", ") + " -- re-freeze with SWEK_FREEZE_CLAIM_TRACE=1"
                      : "none yet. Fixing one means STATING THE CONFIG beside the number, which its author can " +
                        "do and I cannot -- guessing would be FABRICATING PROVENANCE");

    ok("!! the baseline is a TALLY and says why",
        typeof base.gates === "object" && !Array.isArray(base.gates) &&
        Object.values(base.gates).every((v) => typeof v === "number") && /A TALLY, not a list/.test(base.note),
        Object.entries(base.gates).map(([k, v]) => k + ":" + v).join("  ") + ". THE SHAPE OF A BASELINE FOLLOWS " +
        "THE SHAPE OF THE THING COUNTED -- copying a shape that worked elsewhere is not the same as choosing one");

    ok("...and the baseline says the 26 are NOT APPROVED",
        /NOT approved/.test(base.note),
        "a frozen number read as a target is the ratchet-growing-back failure v3126 caught in " +
        "orphan-baseline.json -- the one thing a ratchet must never do");
}

console.log();
console.log("  ----  THE TRACE, so a claim can be made checkable rather than merely written down:");
// v4075 -- *** AND THE NUMBERS THEMSELVES ARE PRINTED NOW, WHICH IS WHAT MAKES THE PILE ADDRESSABLE AT ALL. ***
// This reported that a gate had N untraceable claims and never WHICH ONES, while the closing line below asks
// its reader to "state the CONFIG beside the number" -- AN INSTRUCTION NOBODY COULD FOLLOW, because the number
// was never shown. 75 untraceable claims sat behind a count for the whole life of this gate, so the only move
// it left anybody was re-freezing. A report that names a quantity of debt without naming the debt cannot be
// paid down; it can only be counted again next round. Bounded at six per row so a nine-claim gate does not
// bury the table, with the remainder counted rather than silently dropped.
for (const x of r.rows) {
    const mark = x.unmatched.length === 0 ? "traceable  " : (x.unmatched.length === x.claims ? "NONE trace " : "partial    ");
    console.log("  ----    " + mark + x.gate.padEnd(22) + x.device.padEnd(11) + x.claims + " claims, " + x.unmatched.length + " untraceable");
    if (x.unmatched.length) {
        const shown = x.unmatched.slice(0, 6).map((u) => (typeof u === "object" && u !== null ? (u.value ?? u.number ?? JSON.stringify(u)) : u));
        console.log("  ----        unmatched: " + shown.join(", ") +
            (x.unmatched.length > 6 ? "  (+" + (x.unmatched.length - 6) + " more)" : ""));
    }
}
console.log("  ----  WHAT WOULD FIX A ROW: state the CONFIG beside the number. 'Ra_c 1752.5 at 64x33, tau 0.52'");
console.log("  ----  is re-derivable by anybody; '1752.5' is a number you have to trust. THAT IS THE WHOLE");
console.log("  ----  DIFFERENCE, and it is the question aipoch's traceability-review asks of a paper.");
if (fails) { console.log("claimTrace-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("claimTrace-selfcheck: all checks pass");
