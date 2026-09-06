// WebGLEngine/tools/ship/auditCap-selfcheck.mjs -- v4490
//
// Run: node tools/ship/auditCap-selfcheck.mjs
//
// Grades tools/ship/auditCap.mjs: the cap the register audit runs under, derived from what the register's
// gates actually take instead of typed above them.
//
// *** SECTION 4 REPRODUCES THE MISTAKE THE ROUND BEFORE THIS ONE MADE, FROM ITS OWN TWO PROBES. *** v4489
// re-froze at 120,000 ms and at 300,000 ms, saw a different gate killed each time, and concluded that no cap
// satisfies registerDrift's timeout rule. 300,000 sits between the two slowest gates. The measured runtimes
// are here, so the claim is replayable and so is its refutation.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as A from "./auditCap.mjs";
import { REGISTER_AUDIT } from "./register-audit.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...p) => fs.readFileSync(path.join(ENG, ...p), "utf8");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const M = A.MEASURED_AT_V4490;
const rowFor = (gate) => REGISTER_AUDIT.rows.find((r) => r.gate === gate);

// ---- 1. *** THE CAP IS A FUNCTION OF THE MEASUREMENT, AND THE FREEZE READS IT FROM HERE *** -------------------
{
    const freezer = read("tools", "ship", "freezeRegisterAudit.mjs");
    ok("*** the freeze derives its default rather than carrying a number ***",
        /derivedCap\(\)/.test(freezer) && /from "\.\/auditCap\.mjs"/.test(freezer),
        "SWEK_AUDIT_CAP_MS still overrides, which is what an override is for");
    // *** THE POINT IS THAT NO CAP LITERAL SURVIVES IN THAT FILE. *** A default left beside the call is the
    // v4471 shape exactly: an override added, the wrong number kept, and whoever forgets the variable gets it.
    const codeOnly = freezer.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    ok("!! ...and no cap-sized literal is left in the freeze's code for the next round to read as the default",
        !/\b(120000|300000|600000|900000)\b/.test(codeOnly),
        "an override beside a stale default is how v4471 left this, and it lasted nineteen rounds");
    ok("the rule is stated as a rule, so a later round changes the RULE and not a number",
        A.RULE.multiple === 2 && A.RULE.roundToMs === 60000 && A.RULE.why.length > 40,
        `${A.RULE.multiple}x the slowest, rounded up to ${A.RULE.roundToMs / 1000} s -- ${A.RULE.why}`);
    ok("*** and the derived cap is what the module records, computed rather than quoted ***",
        A.derivedCap() === M.derivedCapMs && M.derivedCapMs === 900000,
        `${A.derivedCap()} ms from a slowest of ${M.slowestMs} ms`);
    // *** AND derivedCap MUST ACTUALLY DERIVE. *** A sabotage replaced its body with `return 900000` and
    // every row above still passed, because they all compare it to the number it was returning. Driving it
    // with a synthetic population is the only way to tell a function from a constant.
    const synth = (ms) => [{ gate: "x", ms }];
    ok("!! derivedCap responds to its input -- a function that ignores its argument is a constant",
        A.derivedCap(synth(1000)) === 60000 && A.derivedCap(synth(500000)) === 1020000 &&
        A.derivedCap(synth(880000)) > A.derivedCap(synth(500000)),
        `1,000 ms -> ${A.derivedCap(synth(1000))}; 500,000 ms -> ${A.derivedCap(synth(500000))} -- ` +
        "twice the input, rounded up to the minute, at three separate inputs");
}

// ---- 2. *** THE RUNTIMES ARE THE AUDIT'S OWN, NOT A SECOND COPY OF THEM *** -----------------------------------
{
    const missing = A.RUNTIMES.filter((r) => !rowFor(r.gate));
    ok("every runtime this module records belongs to a gate the audit actually ran",
        missing.length === 0, missing.length ? missing.map((r) => r.gate).join(", ")
                                             : `${A.RUNTIMES.length} of ${REGISTER_AUDIT.rows.length} rows carried here`);
    // Within 25%: the figures are from one run on one box and a re-freeze moves them; a copy that has drifted
    // by more than that is a copy, which is v3527's rule and the reason this row exists at all.
    const drifted = A.RUNTIMES.filter((r) => { const a = rowFor(r.gate); return !a || Math.abs(a.ms - r.ms) > r.ms * 0.25; });
    ok("!! ...and none has drifted from the frozen audit by more than a quarter",
        drifted.length === 0,
        drifted.length ? drifted.map((r) => `${r.gate.split("/").pop()} ${r.ms} vs ${rowFor(r.gate).ms}`).join(", ")
                       : "the recorded figures are the audit's, re-read rather than remembered");
    const all = REGISTER_AUDIT.rows.map((r) => r.ms).sort((x, y) => y - x);
    const median = all[Math.floor(all.length / 2)];
    ok("*** the slowest registered gate is two hundred and fifty times the median ***",
        Math.round(all[0] / median) >= 200 && REGISTER_AUDIT.rows.length === M.registeredGates &&
        // DERIVED, not read: a sabotage set the recorded ratio to 12 and nothing noticed, because the row
        // above compared the audit to itself and the record sat beside it unread.
        Math.abs(Math.round(all[0] / median) - M.slowestOverMedian) <= M.slowestOverMedian * 0.25,
        `${all[0]} ms against a median of ${median} ms over ${REGISTER_AUDIT.rows.length} gates -- ` +
        "a single typed number over a distribution this skewed is a guess about the tail");
    ok("...and the counts over each threshold are what the audit says",
        all.filter((m) => m > A.OLD_DEFAULT_MS).length === M.overOldDefault &&
        all.filter((m) => m > 60000).length === M.overSixtySeconds,
        `${M.overOldDefault} over the old ${A.OLD_DEFAULT_MS} ms default, ${M.overSixtySeconds} over 60 s`);
}

// ---- 3. *** WHAT THE OLD DEFAULT COST, REPLAYED FROM THE MEASURED RUNTIMES *** --------------------------------
{
    const killed = A.killedBy(A.OLD_DEFAULT_MS);
    ok("*** the old default would kill exactly two of the thirty, and they are named ***",
        killed.length === M.overOldDefault &&
        killed.includes("tools/ship/shaderRefs-selfcheck.mjs") && killed.includes("tools/ship/doorKinds-selfcheck.mjs"),
        killed.map((g) => g.split("/").pop()).join(", "));
    ok("!! ...and killedBy is not vacuous: a cap above everything kills nobody",
        A.killedBy(A.derivedCap()).length === 0 && A.killedBy(1).length === A.RUNTIMES.length,
        "a predicate that always says yes satisfies every positive row -- v4485's cause one");
    // *** THE KNOB WAS ADDED AND THE DEFAULT WAS NOT MOVED, WITH THE MEASUREMENT IN HAND. ***
    const freezer = read("tools", "ship", "freezeRegisterAudit.mjs");
    ok("*** and the freeze's own comment records measuring past that default nineteen rounds ago ***",
        /75 s to 151 s/.test(freezer) && M.knobEraSlowestMs > A.OLD_DEFAULT_MS &&
        M.knobAddedAt === "v4471" && M.defaultUnchangedFor === 19,
        `v4471 wrote "their runtimes (75 s to 151 s) are why SWEK_AUDIT_CAP_MS exists" and left the default ` +
        `at ${A.OLD_DEFAULT_MS} -- already below the 151 s it had just measured`);
}

// ---- 4. *** THE v4489 CONCLUSION, AND WHY TWO PROBES WERE NOT A SWEEP *** -------------------------------------
{
    const [lo, hi] = M.priorProbes;
    const atLo = A.killedBy(lo), atHi = A.killedBy(hi);
    say(`v4489 probed ${lo} ms and ${hi} ms and concluded: "${M.priorConclusion}"`);
    ok("*** at the first probe a gate is killed, and at the second a DIFFERENT one is ***",
        atLo.length === 2 && atHi.length === 1 && atHi[0] === "tools/ship/shaderRefs-selfcheck.mjs" &&
        atLo.includes("tools/ship/doorKinds-selfcheck.mjs"),
        `${lo}: ${atLo.map((g) => g.split("/").pop()).join(", ")} | ${hi}: ${atHi.map((g) => g.split("/").pop()).join(", ")}`);
    const doorKinds = A.RUNTIMES.find((r) => r.gate === "tools/ship/doorKinds-selfcheck.mjs").ms;
    const shaderRefs = A.RUNTIMES.find((r) => r.gate === "tools/ship/shaderRefs-selfcheck.mjs").ms;
    ok("*** and the second probe lands STRICTLY BETWEEN the two slowest gates, which is the whole mistake ***",
        doorKinds < hi && hi < shaderRefs && M.priorProbesStraddled.includes("doorKinds"),
        `${doorKinds} < ${hi} < ${shaderRefs} -- two samples either side of one runtime, and the conclusion ` +
        "was drawn from the bracket rather than from the runtimes, which were never measured");
    ok("*** so a cap that kills nothing exists, and the prior conclusion was wrong ***",
        M.priorConclusionWrong === true && A.killedBy(A.derivedCap()).length === 0,
        `nothing is killed at ${A.derivedCap()} ms; the rule registerDrift states was never the problem`);
    ok("!! ...and the audit as frozen contains no timeout row at all -- the claim, checked against the artifact",
        REGISTER_AUDIT.rows.filter((r) => r.exit === "timeout").length === 0,
        `${REGISTER_AUDIT.rows.length} rows, every one a verdict`);
}

// ---- 5. *** THE CIRCULARITY GUARD: A CAP DERIVED FROM READINGS TAKEN UNDER IT *** -----------------------------
{
    const slowest = Math.max(...REGISTER_AUDIT.rows.map((r) => r.ms));
    const h = REGISTER_AUDIT.capMs / slowest;
    ok("*** the frozen audit ran at the cap this module derives, so a freeze taken under an override shows ***",
        REGISTER_AUDIT.capMs === A.derivedCap(),
        `audit capMs ${REGISTER_AUDIT.capMs} against a derived ${A.derivedCap()} -- ` +
        "an audit frozen with SWEK_AUDIT_CAP_MS set reddens here rather than passing as the default");
    // *** THE FLOOR ITSELF HAS TO BE ABOVE ONE, AND A SABOTAGE THAT SET IT TO 1.0 COST ZERO RED. *** At 1.0 a
    // row sitting exactly AT the cap -- which is what a kill records -- would satisfy the guard, and a cap
    // derived from that kill would justify itself forever. The constant is graded, not just consulted.
    ok("!! the headroom floor is strictly above one, or the circularity guard does not guard anything",
        A.MIN_HEADROOM > 1.2 && A.headroom(Math.max(...A.RUNTIMES.map((r) => r.ms))) === 1,
        `floor ${A.MIN_HEADROOM}x; a cap equal to the slowest runtime reads exactly 1.00x and must fail`);
    ok("*** and the slowest row sits under that cap with real headroom, so no reading is a bound in disguise ***",
        h >= A.MIN_HEADROOM,
        `${h.toFixed(2)}x against a floor of ${A.MIN_HEADROOM}x -- a row AT the cap would be a kill, and a cap ` +
        "derived from a kill would justify itself forever");
    ok("!! ...and the headroom shrinks as the tail grows, so the next crossing is visible before it is a timeout",
        A.headroom(A.derivedCap()) > 1 && A.headroom(A.derivedCap()) < 3,
        `${A.headroom(A.derivedCap()).toFixed(2)}x today -- reported every run rather than asserted to be safe`);
}

console.log("\nauditCap-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
