#!/usr/bin/env node
// tools/ship/budgetExile-selfcheck.mjs -- v4425
//
// Run: node tools/ship/budgetExile-selfcheck.mjs      (runs ONE cheap gate, as a fixture, through the real sweep)
//
// HEADER-PENDING
"use strict";
import fs from "node:fs";
import path from "node:path";
import { redRegister, selectGates, readTimings, DEFAULTS } from "./quickSweep.mjs";
import { enumerateGates } from "./gateSweep.mjs";
import {
    ENG, ABSORBING, MEASURED_V4425, STALE_FAILURES,
    demonstrateAbsorbing, exiled, wouldRunNow, inflation, RECORD_REPAIR,
} from "./budgetExile.mjs";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1;
                         return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

const prior = readTimings();
const T = prior.timings || {}, C = prior.codes || {};

console.log("\n1. *** THE SKIP IS PERMANENT, DEMONSTRATED THROUGH THE REAL SWEEP AND NOT READ OFF THE SOURCE ***");
{
    const d = await demonstrateAbsorbing({ staleMs: 999999 });
    ok("*** a gate whose recorded time is a lie is not run, and the lie survives the write ***",
        d.ran === 0 && d.skipped === 1 && d.msAfter === 999999,
        `seeded 999999ms for a gate that takes ~42ms: ran ${d.ran}, skipped ${d.skipped}, file still says ${d.msAfter}ms`);
    ok("  and so does the recorded exit code beside it", d.codeAfter === 1,
        "a failure verdict preserved indefinitely by the same rule that guarantees it cannot be corrected");
    // *** THE FIXTURE HAS TO BE ABLE TO COME OUT THE OTHER WAY, OR IT IS NOT A DEMONSTRATION. ***
    const e = await demonstrateAbsorbing({ staleMs: 1 });
    ok("*** the same gate with an honest time IS run, and its entry is rewritten ***",
        e.ran === 1 && e.skipped === 0 && e.msAfter !== 1 && e.codeAfter === 0,
        `seeded 1ms: ran ${e.ran}, and the file now says ${e.msAfter}ms exit ${e.codeAfter} -- measured, not carried`);
    ok("  both halves of the rule are named, because either alone is harmless",
        /LAST RECORDED/.test(ABSORBING.skipRule) && /only for gates that RAN/i.test(ABSORBING.writeRule),
        "a budget that skips is fine if something re-measures; a rewrite that skips the skipped is fine if nothing is excluded");
    ok("  and the escapes are named rather than implied", /budget/.test(ABSORBING.escapes) && /hand/.test(ABSORBING.escapes),
        ABSORBING.escapes);
    // *** THE REPAIR: THE ROW NOW SAYS WHEN IT WAS SEEN, WHICH THE WHOLE-FILE DATE COULD NOT. ***
    ok("*** the exiled row keeps its OLD observation stamp while the file's `captured` moves ***",
        d.observedAfter === "2020-01-01T00:00:00.000Z" && d.captured !== d.observedAfter,
        `row observed ${d.observedAfter}, file captured ${d.captured} -- one dates the ROW, the other the RUN`);
    ok("  and a row the sweep actually ran is stamped with that run",
        typeof e.observedAfter === "string" && e.observedAfter !== "2020-01-01T00:00:00.000Z" &&
        Math.abs(Date.parse(e.observedAfter) - Date.now()) < 600000,
        `${e.observedAfter} -- within ten minutes of now`);
    ok("  the repair is a record change and says so", /not made here|unchanged/.test(RECORD_REPAIR.notAPolicy),
        RECORD_REPAIR.notAPolicy);
}

console.log("\n2. *** WHO IS IN THERE ***");
{
    const all = enumerateGates(ENG);
    const sel = selectGates(all, T, DEFAULTS.budgetMs);
    const reg = redRegister();
    const unreg = sel.skipped.filter((g) => !reg.has(g));
    report(`${sel.skipped.length} of ${all.length} gates are exiled over the ${DEFAULTS.budgetMs}ms budget; ` +
        `${unreg.length} of those are on no register at all`);
    ok("*** the exiled set is exactly the gates whose RECORDED time is over budget ***",
        sel.skipped.every((g) => T[g] > DEFAULTS.budgetMs) && sel.run.every((g) => T[g] == null || T[g] <= DEFAULTS.budgetMs),
        "no other property of a gate takes part in the decision -- not its register entry, not its exit code");
    const atCap = sel.skipped.filter((g) => C[g] === 124);
    ok("  and a gate killed at the sweep's cap is exiled on the CAP, not on a time it ever took",
        atCap.length > 0 && atCap.every((g) => T[g] >= 20000 && T[g] < 21000),
        `${atCap.length} recorded at the 20s cap with exit 124 -- v4424's finding, now as a cause rather than a curiosity`);
}

console.log("\n3. *** SIX RECORDED FAILURES, ON NO REGISTER, AND EVERY ONE OF THEM IS GREEN ***");
{
    const reg = redRegister();
    ok("*** the file records exit 1 for them and nothing reads that field as a verdict ***",
        STALE_FAILURES.every((s) => C[s.gate] === 1 && !reg.has(s.gate)),
        `${STALE_FAILURES.length} gates: recorded failing, on no register, never run again`);
    ok("*** run one at a time, all six exit 0 ***", STALE_FAILURES.every((s) => s.serialCode === 0),
        "the codes are stale, and the exile is what makes staleness permanent");
    const freed = STALE_FAILURES.filter((s) => s.serialMs <= DEFAULTS.budgetMs);
    ok("*** and four of the six would clear the budget today, on a number that has been wrong all along ***",
        freed.length === 4,
        freed.map((s) => s.gate.split("/").pop().replace(/-selfcheck\.mjs$/, "") + " " + s.recordedMs + " -> " + s.serialMs).join(", "));
    ok("  one got SLOWER, which is why this is a measurement and not a story",
        STALE_FAILURES.some((s) => s.serialMs > s.recordedMs),
        STALE_FAILURES.filter((s) => s.serialMs > s.recordedMs)
            .map((s) => s.gate.split("/").pop().replace(/-selfcheck\.mjs$/, "") + " " + s.recordedMs + " -> " + s.serialMs).join(", "));
}

console.log("\n4. *** WHAT THE EXILES ACTUALLY COST, MEASURED ONE AT A TIME ***");
{
    const w = wouldRunNow(MEASURED_V4425);
    report(`${w.measured} of the exiled gates re-timed serially`);
    ok("*** most of them clear the budget alone ***", w.under > w.measured / 2,
        `${w.under} of ${w.measured} finish inside ${DEFAULTS.budgetMs}ms with nothing else on the box`);
    const inf = inflation(T, MEASURED_V4425);
    const rs = inf.map((x) => x.ratio).sort((a, b) => a - b);
    ok("  and the number that exiled them was inflated, not wrong-by-a-little",
        median(rs) > 1.5, `recorded/serial: min ${rs[0].toFixed(2)}x, median ${median(rs).toFixed(2)}x, max ${rs[rs.length - 1].toFixed(2)}x`);
    ok("  measured against the file's OWN recorded numbers, not against a second census",
        inf.every((x) => x.recorded === T[x.gate]), `${inf.length} gates compared to sweep-timings.json itself`);
    const red = Object.entries(MEASURED_V4425).filter(([, m]) => m.verdict === "RED").map(([g]) => g);
    report(red.length ? `RED among the exiles: ${red.join(", ")}` : "no red among the exiles measured here");
}

console.log(`\n${fails ? "FAIL" : "ALL GREEN"} -- ${fails} failure(s)`);
process.exit(fails ? 1 : 0);
