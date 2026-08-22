// tools/roundhouse/peerMetrics-selfcheck.mjs
//
// v2951 -- FLEET GAUGES, AND THE THREE WAYS A DASHBOARD LIES.
//
// The ledgers held real quantities but nothing summarised them. Summarising is where dashboards go wrong, so
// this gate pins the three rules that keep these gauges honest: slow is not wrong, unknown is not zero, and
// every number names its source and its age.

import { peerMetrics } from "./peerMetrics.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const transcript = (counts, at = "2026-07-25T00:00:00Z") => ({ at, counts });

// ---- 1. SLOW IS NOT WRONG -------------------------------------------------------------------------------------------
{
    // the REFERENCE transcript's own shape: 37 pass, 0 fail, 2 timeout
    const m = peerMetrics({ transcripts: [transcript({ pass: 37, fail: 0, timeout: 2, error: 0 })] });
    ok("!! timeouts are kept OUT of the agreement rate -- 37/0/2 reads 100%, not 94.9%",
        m.gauges.agreementRate.value === 100 && m.gauges.checksTimedOut.value === 2,
        "the reference itself times out twice and a phone is slower than the reference by construction. A naive " +
        "pass/total would read 94.9% and imply breakage where there is none. androidVerdict settled this long " +
        "ago -- only DISAGREEMENT falsifies -- and the gauge must not quietly reverse that policy");

    // and a real disagreement MUST move the rate
    const bad = peerMetrics({ transcripts: [transcript({ pass: 30, fail: 7, timeout: 2, error: 0 })] });
    ok("...but a real disagreement DOES move it, so the gauge is not simply generous",
        bad.gauges.agreementRate.value < 82 && bad.gauges.checksFailed.value === 7,
        "30 pass / 7 fail reads " + bad.gauges.agreementRate.value + "% -- failures count fully. Excluding " +
        "timeouts is not the same as excusing everything");
}

// ---- 2. UNKNOWN IS NOT ZERO ------------------------------------------------------------------------------------------
{
    const empty = peerMetrics({});
    const allNull = ["devices", "ballots", "agreementRate", "submissions"].every((k) => empty.gauges[k].value === null);
    ok("!! an empty hub reads null everywhere, never 0",
        allNull,
        "'no phone has reported' and 'phones reported and nothing passed' are opposite situations. A dashboard " +
        "that renders both as 0 is lying about the second one -- and 0% agreement would look like catastrophe " +
        "when it actually means no data");

    const zero = peerMetrics({ transcripts: [transcript({ pass: 0, fail: 5, timeout: 0, error: 0 })] });
    ok("...and a genuine zero IS reported as 0, distinctly from null",
        zero.gauges.agreementRate.value === 0 && zero.gauges.checksPassed.value === 0,
        "five disagreements and no passes reads 0%, which is the catastrophe the null case must not be confused with");
}

// ---- 3. EVERY GAUGE NAMES ITS SOURCE AND ITS AGE -----------------------------------------------------------------------
{
    const m = peerMetrics({ transcripts: [transcript({ pass: 1, fail: 0, timeout: 0, error: 0 }, "2026-07-25T12:00:00Z")] });
    const all = Object.values(m.gauges);
    ok("!! every gauge carries a source file and an asOf timestamp",
        all.every((g) => typeof g.source === "string" && g.source.length > 0 && "asOf" in g && "note" in g),
        all.length + " gauges, each naming the file it came from and the age of the newest datum behind it. A " +
        "number with no provenance invites being quoted out of context, and a stale dashboard should be visibly " +
        "stale rather than confidently wrong");

    ok("the asOf reflects the newest datum, not the time the page was opened",
        m.gauges.ballots.asOf === "2026-07-25T12:00:00Z",
        "asOf is the transcript's own timestamp; the report's own `at` is separate. A gauge that stamped itself " +
        "'now' would make year-old data look fresh");
}

// ---- 4. THE DEVICE GAUGES FOLLOW THE FLEET GRADER, NOT A SECOND COUNT ---------------------------------------------------
{
    const ledger = { devices: { k1: { key: "k1", family: "ARM/Mali", firstSeen: "2026-07-25T03:26:00Z", lastSeen: "2026-07-25T03:26:00Z",
        runs: [{ kind: "magmap", at: "2026-07-25T03:26:00Z", reported: {}, graded: { verdict: "CONFIRMED" } }] } } };
    const m = peerMetrics({ deviceLedger: ledger });
    ok("!! the vendor-family gauge is item 3's standing, taken from gradeFleet",
        m.gauges.vendorFamilies.value === 1 && m.gauges.vendorFamilies.list.includes("ARM/Mali"),
        "the gauge does not recount the ledger itself -- it reports what gradeFleet decided, so the dashboard and " +
        "the verdict can never disagree about how many families have passed");
}


// ---- 5. RETURN RATE: WORK IN PROGRESS IS NOT A FAILURE -------------------------------------------------------------------
{
    // 4 jobs: 2 completed, 1 genuinely in flight, 1 whose lease expired without a report
    const future = new Date(Date.now() + 3600000).toISOString();
    const past = "2020-01-01T00:00:00Z";
    const jobQueue = { jobs: {
        a: { id: "a", attempts: 1, completedAt: "2026-07-25T10:00:00Z", leaseUntil: null },
        b: { id: "b", attempts: 1, completedAt: "2026-07-25T10:01:00Z", leaseUntil: null },
        c: { id: "c", attempts: 1, completedAt: null, leaseUntil: future },   // in flight
        d: { id: "d", attempts: 1, completedAt: null, leaseUntil: past },     // claimed, never returned
    } };
    const g = peerMetrics({ jobQueue }).gauges;
    ok("!! the in-flight claim is EXCLUDED from the return-rate denominator",
        g.returnRate.value === 66.7 && g.jobsInFlight.value === 1,
        "2 completed of 3 CONCLUDED claims = 66.7%. Counting the running job as a miss gives 50% and makes a " +
        "fleet look broken precisely when it is busiest -- the denominator is the whole problem with this metric");

    ok("a claim that expired without a report IS counted against the rate",
        g.claimsDropped.value === 1,
        "a peer took work and did not come back; that is a real miss and shows as one. Excluding in-flight work " +
        "is not the same as excusing abandoned work");

    ok("an empty queue reads null, not 0%",
        peerMetrics({}).gauges.returnRate.value === null,
        "0% return rate would look like total failure when it means no jobs exist -- the same unknown-is-not-zero " +
        "rule the other gauges follow");
}

console.log();
if (fails) { console.log("peerMetrics-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("peerMetrics-selfcheck: all checks pass");
