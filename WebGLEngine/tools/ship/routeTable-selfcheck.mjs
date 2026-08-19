// WebGLEngine/tools/ship/routeTable-selfcheck.mjs -- v3039
// The reason this file exists: 3/3 verified must NOT outrank 40/50. That is check 1.
"use strict";
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
import { wilsonLower, tally, rank, chain, chainCost, MIN_SAMPLES } from "../roundhouse/routeTable.mjs";
import { record } from "../roundhouse/callLog.mjs";
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0; const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const rows = (model, n, pass, opts = {}) => Array.from({ length: n }, (_, i) => record({
    model, usage: opts.noUsage ? undefined : { input_tokens: 100, output_tokens: 20 }, ms: 10,
    verified: opts.ungated ? null : i < pass, escalated: false, gate: "g",
}));

// ---- 1. THIN CELLS CANNOT WIN ---------------------------------------------------------------------------------
{
    ok("!! 3/3 scores BELOW 40/50 on the lower bound", wilsonLower(3, 3) < wilsonLower(40, 50),
       "3/3 -> " + wilsonLower(3, 3).toFixed(3) + " vs 40/50 -> " + wilsonLower(40, 50).toFixed(3) +
       "; the raw proportions are 1.000 vs 0.800, which is the wrong order and the whole reason this is not a proportion");
    ok("more evidence at the same rate scores higher", wilsonLower(80, 100) > wilsonLower(8, 10));
    ok("a perfect record still never reaches 1", wilsonLower(500, 500) < 1, wilsonLower(500, 500).toFixed(4));
    ok("zero of zero is zero, not NaN", wilsonLower(0, 0) === 0);
}

// ---- 2. UNGATED CALLS ARE NOT EVIDENCE -------------------------------------------------------------------------
{
    const t = tally([...rows("m", 10, 10), ...rows("m", 10, 0, { ungated: true })])[0];
    ok("!! a call that was never gated counts as NEITHER pass nor fail", t.calls === 20 && t.judged === 10 && t.verified === 10,
       "20 calls, 10 judged -- folding an ungated call into either bucket invents data that was never collected");
    const u = tally(rows("m", 4, 2, { noUsage: true }))[0];
    ok("unpriceable rows are tallied separately", u.unpriceable === 4 && u.inTok === 0);
}

// ---- 3. IT REFUSES TO RANK WITHOUT FRUGON'S PRICES --------------------------------------------------------------
{
    const t = tally(rows("m", 30, 24));
    const r = rank(t, null);
    ok("!! no cost supplied -> REFUSES to rank", r.ranked.length === 0 && /ACCURACY order wearing a COST order/.test(r.refused),
       "ranking on accept-rate alone would answer a different question under this question's name");
    ok("...and the chain says so rather than returning empty silently", /ACCURACY order/.test(chain(r).why));
    const noPrice = rank(t, { other: 0.01 });
    ok("a model frugon did not price is surfaced, not dropped", noPrice.insufficient.length === 1 && /no price/.test(noPrice.insufficient[0].why));
    const free = rank(t, { m: 0 });
    ok("!! a zero cost is refused, not divided by", free.ranked.length === 0 && /divide to infinity/.test(free.insufficient[0].why),
       "a free model would pin to the top of the chain forever on a rounding artefact");
}

// ---- 4. THE FLOOR HOLDS, AND THIN CELLS ARE VISIBLE --------------------------------------------------------------
{
    const t = tally([...rows("thin", MIN_SAMPLES - 1, MIN_SAMPLES - 1), ...rows("fat", 50, 40)]);
    const r = rank(t, { thin: 0.001, fat: 0.01 });
    ok("!! a perfect but thin model is EXCLUDED from the ranking", r.ranked.length === 1 && r.ranked[0].model === "fat");
    ok("...and is reported with the reason, not silently dropped", r.insufficient.length === 1 && /floor is 12/.test(r.insufficient[0].why),
       r.insufficient[0].why + " -- a table that looks complete over a sample it never had is worse than one that admits the gap");
    ok("an all-thin table yields an EMPTY chain that defends the status quo", /unmeasured order is not an improvement/.test(chain(rank(tally(rows("thin", 3, 3)), { thin: 0.001 })).why));
}

// ---- 5. MY INTUITION WAS WRONG AND THE ARITHMETIC WAS RIGHT ----------------------------------------------------
{
    // I asserted "a cheap model that fails half the time loses to a dearer one that works". IT DOES NOT, and the
    // gate said so: 30/60 at 0.001 scores 377 verified-per-dollar against 57/60 at 0.004 scoring 216. Four times
    // cheaper beats 2.3x the accept rate. The arithmetic is correct; the claim I made about it was not.
    const t = tally([...rows("cheap", 60, 30), ...rows("dear", 60, 57)]);
    const r = rank(t, { cheap: 0.001, dear: 0.004 });
    const cm = r.ranked.find(x => x.model === "cheap").merit, dm = r.ranked.find(x => x.model === "dear").merit;
    ok("!! a coin-flip model CAN win on verified-per-dollar if it is cheap enough", r.ranked[0].model === "cheap",
       "cheap " + cm.toFixed(0) + " vs dear " + dm.toFixed(0) + " -- counter-intuitive and arithmetically right");
    // AND THAT EXPOSES A REAL LIMIT OF THE MERIT FUNCTION. escalateRoute does not stop when the cheap model
    // fails -- it ESCALATES, so a failure costs the cheap call AND the dear one. merit = lower/cost prices the
    // successes and ignores the retries, which is precisely the bill the router actually pays.
    const p = 30 / 60, cheapFirst = 0.001 + (1 - p) * 0.004, dearOnly = 0.004;
    ok("!! recorded limit: with escalation priced in, cheap-first is barely cheaper than dear-only",
       cheapFirst > dearOnly * 0.6 && cheapFirst < dearOnly,
       "cheap-first ~" + cheapFirst.toFixed(4) + " vs dear-only " + dearOnly.toFixed(4) +
       " per answer -- the 4x headline shrinks to ~" + (dearOnly / cheapFirst).toFixed(2) + "x once the failed attempt is paid for. NOT yet in merit; the table ranks, it does not yet model the chain.");
    const t2 = tally([...rows("cheap", 60, 54), ...rows("dear", 60, 57)]);
    ok("a cheap model that nearly matches wins comfortably", rank(t2, { cheap: 0.001, dear: 0.004 }).ranked[0].model === "cheap");
    ok("the chain is the ranked order", chain(rank(t2, { cheap: 0.001, dear: 0.004 })).chain[0] === "cheap");
}

// ---- 6. NO PRICING MATH LIVES HERE ----------------------------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "routeTable.mjs"), "utf8").replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    ok("!! cost is an INPUT, never computed", !/per_?1k|USD|tokens\s*\*\s*\d|0\.00\d/i.test(src),
       "frugon owns pricing and re-syncs it weekly; a second table here would be stale the first time a model changed");
    ok("it reads callLog's shape rather than redefining it", /swek\s*&&\s*r\.swek\.verified|r\.swek/.test(src));
}
// ---- 7. THE CHAIN COST, WHICH IS THE FIX FOR SECTION 5 ---------------------------------------------------------
{
    const r = rank(tally([...rows("cheap", 60, 30), ...rows("dear", 60, 57)]), { cheap: 0.001, dear: 0.004 });
    const cc = chainCost(r.ranked);
    ok("!! escalation priced in shrinks the headline saving", cc.saving > 0 && cc.saving < 0.45,
       "chain " + cc.perAnswer.toFixed(4) + " vs strongest-only " + cc.strongestOnly.toFixed(4) + " = " +
       (cc.saving * 100).toFixed(0) + "% saved, against a merit ranking that implied 4x -- the retry is the difference");
    const solid = rank(tally([...rows("cheap", 60, 54), ...rows("dear", 60, 57)]), { cheap: 0.001, dear: 0.004 });
    ok("a cheap model that actually works saves much more", chainCost(solid.ranked).saving > chainCost(r.ranked).saving,
       (chainCost(solid.ranked).saving * 100).toFixed(0) + "% vs " + (cc.saving * 100).toFixed(0) + "% -- the accept rate, not the price gap, is what moves this number");
    ok("!! an unpriced model refuses the whole chain cost", chainCost([{ model: "x", lower: 0.5 }]).perAnswer === null);
    ok("no models yields null, not zero", chainCost([]).perAnswer === null, "a zero here would read as a free chain");
}

console.log("\nrouteTable-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
