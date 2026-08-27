// WebGLEngine/tools/roundhouse/knobLiveness-selfcheck.mjs
//
// Run: node tools/roundhouse/knobLiveness-selfcheck.mjs
//
// THIS GRADES THE PROBE BEFORE IT GRADES THE LAB, AND THAT ORDER IS THE POINT.
//
// *** THE FIRST TWO VERSIONS OF knobLiveness BOTH REPORTED DEAD KNOBS THAT WERE ALIVE, AND BOTH READINGS WERE
// ENTIRELY ARTEFACTS OF THE QUESTION. *** Probed per device instead of per mode, it called eight of `quantum`'s
// eleven knobs dead -- every one live in a mode it never entered. Corrected, but probing only the honest build,
// it called inspiral's `plantedPower` dead -- a knob whose whole job is to sit on the planted branch
// (`c.planted ? c.plantedPower : 3`), where it moves eight observables. Both numbers were plausible, both were
// actionable, and acting on either would have deleted a working knob.
//
// So section 2 is SABOTAGE and it is the reason this file exists: three knobs whose liveness is KNOWN, each
// hiding somewhere a naive probe does not look. If a future simplification collapses an axis, these go red
// before the lab census reports a fictional improvement.
//
// AND A KNOB THAT REFUSES A VALUE IS LIVE. A knob that rejects what it is handed is read by the code -- a
// refusal is a response. Counting it dead would mark the best-behaved knobs in the lab as the broken ones.
"use strict";
import { knobLiveness, widenStill, stillKnobs, insensitiveKnobs, unprobedKnobs, probeValues, wideValues,
         PLANT_STATES, STILL_OK } from "./knobLiveness.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);
const rowFor = (rows, d, k) => rows.find((r) => r.device === d && r.knob === k);

console.log("knobLiveness-selfcheck -- a declared knob and a knob that does something\n");

console.log("1. THE LADDERS ARE REAL LADDERS");
{
    ok("a numeric knob is probed at more than one value", probeValues(4).length >= 3, probeValues(4).join(", "));
    ok("a boolean knob is probed at its opposite", probeValues(true).join() === "false", String(probeValues(true)));
    ok("!! a zero-valued knob is not probed by scaling, which would never leave zero",
        probeValues(0).every((v) => v !== 0), probeValues(0).join(", ") + " -- 0 * anything is 0, so a scaled "
        + "ladder on a default of zero would probe the same value three times and call the knob dead");
    ok("a string knob is not probed at all rather than probed wrongly", probeValues("fcc").length === 0,
        "there is no ordering to perturb along, and inventing one would test the device's error handling "
        + "instead of the knob");
    ok("!! the wide ladder reaches far outside the working range", wideValues(1).some((v) => Math.abs(v) >= 1e6)
        && wideValues(1).some((v) => Math.abs(v) <= 1e-6) && wideValues(1).some((v) => v < 0),
        wideValues(1).join(", ") + " -- and it includes the SIGN, because a tolerance flat over fifteen orders "
        + "of magnitude can still respond to being made negative");
    ok("!! both plant states are named axes rather than an implicit default",
        PLANT_STATES.length === 2 && PLANT_STATES.some((p) => p.extra.planted === true),
        PLANT_STATES.map((p) => p.label || "honest").join(", ") + ". Named so that adding a third axis is a "
        + "visible change and omitting one is a visible omission -- this file exists because an unnamed axis "
        + "was silently missing twice.");
}

console.log("\n2. *** SABOTAGE: THREE KNOBS WHOSE LIVENESS IS KNOWN, EACH HIDING WHERE A NAIVE PROBE DOES NOT LOOK ***");
{
    const { rows } = await knobLiveness({ only: ["quantum", "inspiral", "powder", "structureFactor"], budgetMs: 120000 });

    const omega = rowFor(rows, "quantum", "omega");
    ok("!! *** A KNOB LIVE IN ONE MODE OF SEVEN IS LIVE -- quantum.omega, read only by `osc` ***",
        !!omega && omega.live.length > 0,
        omega ? "live in " + omega.live.join(", ") : "NOT FOUND",
        );
    report("defaults() returns ONE flat config for a device with seven modes, so omega is in the register while "
        + "`bands` runs. Probed per device this read dead, along with E, V0, steps, dt, kpV0 and bandGridN.");

    const pp = rowFor(rows, "inspiral", "plantedPower");
    ok("!! *** A KNOB LIVE ONLY UNDER THE PLANT IS LIVE -- inspiral.plantedPower ***",
        !!pp && pp.live.length > 0 && pp.live.some((w) => w.includes("planted")),
        pp ? "live in " + pp.live.join(", ") : "NOT FOUND");
    report("`const ratePower = c.planted ? c.plantedPower : 3` -- moving it on the honest build moves nothing BY "
        + "CONSTRUCTION. Reporting that as dead would have reported a HEALTHY PLANT as a defect, and the "
        + "obvious fix would have been to delete the knob that makes the plant adjustable.");

    const ct = rowFor(rows, "powder", "checkTo");
    ok("!! *** A KNOB THAT REFUSES A VALUE IS LIVE, NOT DEAD ***",
        !!ct && ct.live.some((w) => w.includes("refused")),
        ct ? ct.live.join(", ") : "NOT FOUND");
    report("powder.checkTo throws on an absurd series length. A knob that rejects what it is handed is READ; "
        + "counting a refusal as silence would mark the best-behaved knobs in the lab as the broken ones.");

    const disp = rowFor(rows, "structureFactor", "displace");
    ok("...and an ordinary live knob still reads live", !!disp && disp.live.length > 0,
        disp ? disp.live.join(", ") : "NOT FOUND");
}

console.log("\n3. THE WIDE LADDER SEPARATES 'FLAT NEARBY' FROM 'READ BY NOBODY'");
{
    const { rows } = await knobLiveness({ only: ["galaxy"], budgetMs: 120000 });
    await widenStill(rows, { budgetMs: 60000 });
    const zt = rowFor(rows, "galaxy", "zeroTol");
    ok("!! galaxy.zeroTol is flat over its working range and wakes at the sign flip",
        !!zt && !zt.live.length && !!zt.wideLive,
        zt ? "near ladder: still; wide ladder: " + zt.wideLive : "NOT FOUND");
    report("*** THAT FLATNESS IS THE PROPERTY, NOT A DEFECT. *** zeroTol feeds `Math.abs(v) < zeroTol` over a "
        + "spectrum whose zero modes sit at 1e-16 and whose next eigenvalue is order 1. Moving it 50% CANNOT "
        + "change the count and should not -- the same gap structureFactor's absences are graded on, where any "
        + "threshold between 1e-14 and 1 gives the identical verdict. A knob flat across a measured margin is "
        + "evidence the answer does not depend on it.");
    ok("...and the two states are reported separately rather than collapsed",
        !stillKnobs(rows).includes("galaxy.zeroTol") &&
        insensitiveKnobs(rows).some((s) => s.startsWith("galaxy.zeroTol")),
        "insensitive: " + (insensitiveKnobs(rows).join(", ") || "none") + " | still: " + (stillKnobs(rows).join(", ") || "none"));
}

console.log("\n3b. *** v4030 -- A KNOB THE CENSUS CANNOT ANSWER IS NAMED, NOT DROPPED ***");
{
    // Strings and arrays were always skipped and that is right: inventing an ordering would test the device's
    // error handling instead of the knob. But the row then carried an empty `probed`, so BOTH stillKnobs and
    // insensitiveKnobs filtered it out and the knob disappeared from every list this census prints.
    const { rows } = await knobLiveness({ only: ["optics", "blackhole"], budgetMs: 200000 });
    const un = unprobedKnobs(rows);
    ok("!! *** the two null-default knobs in the lab are REPORTED rather than silently absent ***",
        un.some((k) => k.startsWith("optics.spread")) && un.some((k) => k.startsWith("blackhole.onsetLo")),
        un.join(", ") + ". Both use `cfg.x ?? fallback` -- a live, readable knob whose default means 'compute "
        + "it'. blackhole.onsetLo has been invisible to this census since it was written; optics.spread became "
        + "invisible the moment v4030 gave it a null default, WHICH IS A GAP THIS ROUND CREATED AND THEREFORE "
        + "HAD TO CLOSE.");
    ok("...and they are NOT counted as still, because 'was never probed' is not 'moves nothing'",
        !stillKnobs(rows).some((k) => k === "optics.spread" || k === "blackhole.onsetLo"),
        "still: " + (stillKnobs(rows).join(", ") || "none") + ". A measurement and an admission are different "
        + "claims and folding the second into the first would report coverage this census does not have.");
}

console.log("\n4. THE REGISTER OF EXAMINED STILL KNOBS");
{
    ok("!! every entry carries a real sentence, not a label",
        Object.values(STILL_OK).every((v) => typeof v === "string" && v.length > 40),
        Object.keys(STILL_OK).length + " entries. A one-word reason is a suppression wearing an explanation.");
    report(Object.keys(STILL_OK).length === 0
        ? "the register is EMPTY, and that is the claim -- xenon.highFlux was FIXED rather than registered."
        : Object.keys(STILL_OK).join(", "));

    // *** AND NO ENTRY MAY OUTLIVE ITS REASON. *** census-selfcheck applies exactly this to
    // EXACT_ZERO_BACKLOG -- "a stale suppression is an ACTIVE BLIND SPOT, because if the zero came back the
    // entry would silently swallow it" -- and this register had no such check until an entry actually expired.
    // hands.span was registered because translationDisagreements was a load-bearing negative no plant could
    // make fire; v4026 gave handsBind a second declared defect knob, the negative fires, and the knob went
    // live. The entry was DELETED, not loosened, and this is what makes the next one impossible to forget.
    const stale = [];
    for (const key of Object.keys(STILL_OK)) {
        const [dev, knob] = key.split(".");
        const { rows } = await knobLiveness({ only: [dev], budgetMs: 90000 });
        await widenStill(rows, { budgetMs: 60000 });
        const r = rows.find((x) => x.knob === knob);
        if (!r) { stale.push(key + " (knob no longer declared)"); continue; }
        if (r.live.length || r.wideLive) stale.push(key + " (now live in " + (r.live.join(", ") || r.wideLive) + ")");
    }
    ok("!! *** NO ENTRY HAS OUTLIVED ITS REASON ***", stale.length === 0,
        stale.length === 0
            ? Object.keys(STILL_OK).length + " entries, every one still still. A register that kept an expired "
              + "entry would silently swallow the knob going still again."
            : "STALE, DELETE THESE: " + stale.join("; ") + " -- an entry whose reason has expired is an ACTIVE "
              + "BLIND SPOT. THE RIGHT RESPONSE IS DELETION, NOT LOOSENING (v3195).");
}

console.log("\n" + (fails ? "knobLiveness-selfcheck: " + fails + " FAILED" : "knobLiveness-selfcheck: all checks pass"));
process.exit(fails ? 1 : 0);
